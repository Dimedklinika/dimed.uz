import type { Context } from '@netlify/functions';
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, getDoctor } from './lib/auth.ts';
import { doctorDayKey, isValidSlot, isBookable } from './lib/slots.ts';
import { shiftsFor } from './lib/schedule.ts';
import { isConfirmed, type Appointment } from './lib/appointments.ts';
import { isDateKey, isTime, toInstant, weekdayOf } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { hitLimit, tooMany } from './lib/rate-limit.ts';

type Body = {
  doctor?: string;
  date?: string;
  time?: string;
  toDate?: string;
  toTime?: string;
};

/**
 * POST /api/reschedule — bronni boshqa vaqtga ko'chiradi.
 *
 * Klinikada bekor qilish yo'q: bemor faqat vaqtni almashtira oladi.
 * Shifokor o'zgarmaydi — boshqa shifokorga o'tish yangi bron demak.
 */
/** Bir hisobdan bir soatda shuncha so'rov — «bolg'alash»ga qarshi. */
const MAX_PER_HOUR = 30;

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    const rate = await hitLimit(`kochirish#${session.phone}`, MAX_PER_HOUR, 60 * 60);
    if (!rate.ok) return tooMany(rate.retryAfter);
    const { doctor: doctorId, date, time, toDate, toTime } = (await request.json()) as Body;

    if (!doctorId || !date || !time || !toDate || !toTime) {
      return error('doctor, date, time, toDate va toTime kerak');
    }
    if (!isDateKey(date) || !isDateKey(toDate) || !isTime(time) || !isTime(toTime)) {
      return error('Sana yoki vaqt formati noto‘g‘ri');
    }
    if (date === toDate && time === toTime) {
      return error('Bu qabul allaqachon shu vaqtda — boshqa slotni tanlang');
    }

    const found = await db.send(
      new GetCommand({
        TableName: TABLES.appointments,
        Key: { doctor_day: doctorDayKey(doctorId, date), time },
      }),
    );
    const appointment = found.Item as Appointment | undefined;

    if (!appointment) return error('Bunday qabul topilmadi', 404);
    if (appointment.phone !== session.phone) return error('Bu qabul sizniki emas', 403);
    if (!isConfirmed(appointment)) {
      return error('Faqat kuchdagi bronni ko‘chirish mumkin');
    }

    const now = new Date();
    /*
      1 soat qoidasi ikkala tomonga ham tegishli: qabulga 1 soatdan
      kam qolgan bo'lsa uni tashlab ketib bo'lmaydi, yangi vaqt ham
      kamida 1 soat naridagi slot bo'lishi kerak.
    */
    if (!isBookable(date, time, now)) {
      return error('Qabulga 1 soatdan kam qoldi — vaqtni ko‘chirib bo‘lmaydi');
    }

    const doctor = await getDoctor(doctorId);
    if (!doctor || doctor.active === false) return error('Shifokor topilmadi', 404);
    if (!doctor.workdays.includes(weekdayOf(toDate))) {
      return error('Bu kuni shifokor qabul qilmaydi');
    }

    const shifts = await shiftsFor(doctorId, toDate, doctor.shifts);
    if (!isValidSlot(shifts, doctor.slot_minutes, toTime)) {
      return error('Bunday slot mavjud emas');
    }
    if (!isBookable(toDate, toTime, now)) {
      return error('Qabulga 1 soatdan kam qoldi — boshqa vaqtni tanlang');
    }

    // 1-qadam: yangi slotni atomik egallaymiz (bron bilan bir xil shart).
    try {
      await db.send(
        new PutCommand({
          TableName: TABLES.appointments,
          Item: {
            doctor_day: doctorDayKey(doctorId, toDate),
            time: toTime,
            doctor_id: doctorId,
            date: toDate,
            phone: appointment.phone,
            telegram_id: appointment.telegram_id ?? session.userId,
            // Bemor kimligi yangi yozuvga ham ko'chadi — avval yo'qolib qolardi.
            patient_id: appointment.patient_id,
            patient_name: appointment.patient_name,
            patient_birth_date: appointment.patient_birth_date,
            privacy_accepted_at: appointment.privacy_accepted_at,
            starts_at: toInstant(toDate, toTime).toISOString(),
            status: appointment.status,
            price: appointment.price,
            payment_id: appointment.payment_id,
            moved_from: `${date} ${time}`,
            created_at: appointment.created_at,
            updated_at: now.toISOString(),
          },
          /*
            Yozuv yo'q, hold muddati o'tgan yoki slot bo'shatilgan
            (ko'chirilgan / bekor qilingan) bo'lsagina yoziladi. Avval
            bo'shatilganlar yo'q edi: bekor qilingan slot ro'yxatda
            "bo'sh" ko'rinib, band qilinganda 409 berardi.
          */
          ConditionExpression:
            'attribute_not_exists(doctor_day) OR (#s = :hold AND hold_until < :now) ' +
            'OR #s = :moved OR #s = :cancelled OR #s = :byClinic',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':hold': 'hold',
            ':now': Math.floor(now.getTime() / 1000),
            ':moved': 'moved',
            ':cancelled': 'cancelled',
            ':byClinic': 'cancelled_by_clinic',
          },
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return error('Bu vaqt hozirgina band qilindi — boshqa slotni tanlang', 409);
      }
      throw err;
    }

    /*
      2-qadam: eskisini "moved" qilamiz. Bu qadam yiqilsa yangi yozuvni
      qaytarib olamiz — aks holda bitta bemorda ikkita navbat qolib,
      shifokorning bo'sh sloti ham yopilgan bo'lardi.
    */
    try {
      await db.send(
        new UpdateCommand({
          TableName: TABLES.appointments,
          Key: { doctor_day: doctorDayKey(doctorId, date), time },
          UpdateExpression: 'SET #s = :moved, moved_to = :to, updated_at = :now',
          ConditionExpression: '#s = :was AND phone = :p',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':moved': 'moved',
            ':to': `${toDate} ${toTime}`,
            ':now': now.toISOString(),
            ':was': appointment.status,
            ':p': session.phone,
          },
        }),
      );
    } catch (err) {
      await db.send(
        new DeleteCommand({
          TableName: TABLES.appointments,
          Key: { doctor_day: doctorDayKey(doctorId, toDate), time: toTime },
        }),
      );
      if (err instanceof ConditionalCheckFailedException) {
        return error('Qabul holati o‘zgardi — sahifani yangilang', 409);
      }
      throw err;
    }

    await notifyPatient(appointment.telegram_id ?? session.userId, doctor.name, {
      date,
      time,
      toDate,
      toTime,
    });

    return json({
      ok: true,
      appointment: {
        doctor: doctorId,
        doctorName: doctor.name,
        date: toDate,
        time: toTime,
        price: appointment.price,
        status: appointment.status,
      },
    });
  } catch (err) {
    await logToAdmin('reschedule', err);
    return error('Vaqtni ko‘chirishda xatolik. Birozdan so‘ng urinib ko‘ring.', 500);
  }
};

/** Bot orqali tasdiq. Xabar ketmasa ham ko'chirish kuchda qoladi. */
async function notifyPatient(
  telegramId: string,
  doctorName: string,
  moved: { date: string; time: string; toDate: string; toTime: string },
): Promise<void> {
  try {
    await sendMessage(
      telegramId,
      `🔄 <b>Navbat vaqti o'zgartirildi</b>\n\n` +
        `Shifokor: ${escapeHtml(doctorName)}\n` +
        `Eski vaqt: ${moved.date}, soat ${moved.time}\n` +
        `Yangi vaqt: <b>${moved.toDate}, soat ${moved.toTime}</b>\n\n` +
        `Iltimos, 10 daqiqa oldin keling.`,
    );
  } catch (err) {
    await logToAdmin('reschedule/xabar', err);
  }
}
