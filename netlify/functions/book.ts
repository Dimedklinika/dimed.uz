import type { Context } from '@netlify/functions';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, getDoctor } from './lib/auth.ts';
import { doctorDayKey, isValidSlot, isBookable } from './lib/slots.ts';
import { shiftsFor } from './lib/schedule.ts';
import { upcomingForPhone } from './lib/appointments.ts';
import { isDateKey, isTime, toInstant, weekdayOf, type DateKey } from './lib/time.ts';
import { createPayment } from './lib/payment.ts';
import { listPatients } from './lib/patients.ts';
import { ageOn, fitsAgeGroup, toAgeGroup, ageRejected } from './lib/age.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { hitLimit, tooMany } from './lib/rate-limit.ts';

/*
  Bir soatda bitta hisobdan nechta bron so'rovi. Bu — "bolg'alash"ga
  qarshi chegara (odam daqiqasiga bir marta bron qilmaydi), slotlarni
  band qilib tashlashga qarshi emas: uni kuchdagi bronlar soni
  cheklaydi (quyida).
*/
const MAX_BOOKINGS_PER_HOUR = 60;

/**
 * Bitta telefonda bir vaqtda nechta kelgusi bron turishi mumkin.
 * Bir oila uchun yetarli, lekin kimdir kun bo'yi slotlarni band
 * qilib qo'ya olmaydi.
 */
const MAX_UPCOMING = 5;

/** Hold shuncha vaqt turadi — to'lov shu oraliqda tugallanishi kerak. */
const HOLD_SECONDS = 5 * 60;

type Body = {
  doctor?: string;
  date?: string;
  time?: string;
  patientId?: string;
  /** Maxfiylik siyosatiga rozilik (B4) — usiz bron qilinmaydi. */
  privacyAccepted?: boolean;
};

/** POST /api/book — slotni band qiladi va to'lovni boshlaydi. */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    // Bir hisobdan ketma-ket bron urinishlari cheklanadi.
    const rate = await hitLimit(`bron#${session.phone}`, MAX_BOOKINGS_PER_HOUR, 60 * 60);
    if (!rate.ok) return tooMany(rate.retryAfter);

    const body = (await request.json()) as Body;
    const { doctor: doctorId, date, time } = body;

    if (!doctorId || !date || !time) return error('doctor, date va time kerak');
    if (!isDateKey(date) || !isTime(time)) return error('Sana yoki vaqt formati noto‘g‘ri');

    const doctor = await getDoctor(doctorId);
    if (!doctor || doctor.active === false) return error('Shifokor topilmadi', 404);
    if (!doctor.workdays.includes(weekdayOf(date))) return error('Bu kuni shifokor qabul qilmaydi');

    const shifts = await shiftsFor(doctorId, date, doctor.shifts);
    if (!isValidSlot(shifts, doctor.slot_minutes, time)) {
      return error('Bunday slot mavjud emas');
    }

    const now = new Date();
    if (!isBookable(date, time, now)) {
      return error('Qabulga 1 soatdan kam qoldi — boshqa vaqtni tanlang');
    }

    const upcoming = await upcomingForPhone(session.phone, now);
    if (upcoming.length >= MAX_UPCOMING) {
      return error(
        `Sizda ${upcoming.length} ta kelgusi navbat bor — bir vaqtda ${MAX_UPCOMING} tadan ko‘p bo‘lmaydi. ` +
          'Avval keraksizini bekor qiling yoki qabuldan keyin yangisini oling.',
      );
    }

    /*
      Navbat kim uchun olinayotgani. Bir telefondan butun oila
      foydalanadi, shuning uchun shifokor kimni kutayotganini bilishi
      kerak. Tanlanmagan bo'lsa — oxirgi tanlangani; u ham bo'lmasa
      yozuv ismsiz qoladi (eski bronlar shunday edi).
    */
    const { patients, activeId } = await listPatients(session.phone, session.userId);
    const wantedId = body.patientId ?? activeId;
    const patient = wantedId ? patients.find((p) => p.id === wantedId) ?? null : null;
    if (body.patientId && !patient) {
      return error('Bemor topilmadi — ro‘yxatdan tanlang', 404);
    }
    /*
      Bemor va uning tug'ilgan sanasi majburiy (B1): shifokor kimni
      kutayotganini, laboratoriya esa yoshini bilishi kerak. Vidjet
      buni 4-qadamda so'raydi; API ham qayta tekshiradi.
    */
    if (!patient) return error('Navbat kim uchun ekanini tanlang');
    if (!patient.birthDate) return error('Bemorning tug‘ilgan sanasi kiritilmagan');

    /*
      Shifokorning yosh cheklovi: pediatr kattani, kattalar shifokori
      bolani qabul qilmasin. Yosh qabul kuniga qarab hisoblanadi.
    */
    const ageGroup = toAgeGroup(doctor.age_group);
    if (!fitsAgeGroup(ageGroup, ageOn(patient.birthDate, toInstant(date, time)))) {
      return error(ageRejected(ageGroup));
    }

    if (body.privacyAccepted !== true) return error('Maxfiylik siyosatiga rozilik kerak');

    const payment = await createPayment({
      amount: doctor.price,
      appointmentKey: `${doctorDayKey(doctorId, date)}#${time}`,
      phone: session.phone,
    });

    /*
      Onlayn to'lovda slot avval 5 daqiqaga ushlab turiladi (hold) va
      to'lov tasdig'idan keyin "paid" bo'ladi. Klinikada to'lash
      rejimida esa bron shu zahoti kuchga kiradi — aks holda bemorga
      "band qilindi" deb aytib, 5 daqiqadan keyin slotni bo'shatib
      yuborgan bo'lardik.
    */
    const holdUntil =
      payment.mode === 'online' ? Math.floor(now.getTime() / 1000) + HOLD_SECONDS : undefined;
    const status = payment.mode === 'online' ? 'hold' : 'booked';

    /*
      Slotni atomik band qilamiz: yozuv yo'q bo'lsa yoki eski hold
      muddati o'tgan bo'lsagina yoziladi. Ikki bemor bir vaqtda
      bosса — bittasi ConditionalCheckFailed oladi.
    */
    try {
      await db.send(
        new PutCommand({
          TableName: TABLES.appointments,
          Item: {
            doctor_day: doctorDayKey(doctorId, date),
            time,
            doctor_id: doctorId,
            date,
            phone: session.phone,
            telegram_id: session.userId,
            patient_id: patient.id,
            patient_name: patient.name,
            patient_birth_date: patient.birthDate,
            privacy_accepted_at: now.toISOString(),
            starts_at: toInstant(date, time).toISOString(),
            status,
            hold_until: holdUntil,
            price: doctor.price,
            payment_id: payment.paymentId,
            created_at: now.toISOString(),
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

    await db.send(
      new PutCommand({
        TableName: TABLES.payments,
        Item: {
          payment_id: payment.paymentId,
          phone: session.phone,
          doctor_id: doctorId,
          date,
          time,
          amount: doctor.price,
          mode: payment.mode,
          status: payment.mode === 'at_clinic' ? 'pending_at_clinic' : 'pending',
          created_at: now.toISOString(),
        },
      }),
    );

    // Rozilik birinchi marta qachon berilgani bemor yozuvida ham qoladi (best-effort).
    await db
      .send(
        new UpdateCommand({
          TableName: TABLES.users,
          Key: { telegram_id: session.userId },
          UpdateExpression: 'SET privacy_accepted_at = if_not_exists(privacy_accepted_at, :now)',
          ExpressionAttributeValues: { ':now': now.toISOString() },
        }),
      )
      .catch((err) => logToAdmin('book/rozilik', err));

    if (payment.mode === 'at_clinic') {
      await confirmAtClinic(session.userId, doctor.name, date, time, doctor.price, patient.name);
    }

    return json({
      ok: true,
      mode: payment.mode,
      paymentId: payment.paymentId,
      redirectUrl: payment.redirectUrl,
      holdUntil,
      appointment: {
        doctor: doctorId,
        doctorName: doctor.name,
        date,
        time,
        price: doctor.price,
        patientName: patient.name,
        patientBirthDate: patient.birthDate,
      },
    });
  } catch (err) {
    await logToAdmin('book', err);
    return error('Bron qilishda xatolik. Birozdan so‘ng urinib ko‘ring.', 500);
  }
};

/** Bot orqali tasdiq. Xabar ketmasa ham bron kuchda qoladi. */
async function confirmAtClinic(
  telegramId: string,
  doctorName: string,
  date: DateKey,
  time: string,
  price: number,
  patientName?: string,
): Promise<void> {
  try {
    await sendMessage(
      telegramId,
      `✅ <b>Navbatingiz band qilindi</b>\n\n` +
        (patientName ? `Bemor: ${escapeHtml(patientName)}\n` : '') +
        `Shifokor: ${escapeHtml(doctorName)}\n` +
        `Sana: ${date}, soat ${time}\n` +
        `Narx: ${price.toLocaleString('ru-RU')} so'm\n\n` +
        `Qabulxona kassasiga ${price.toLocaleString('ru-RU')} so'm to'laysiz. Iltimos, 10 daqiqa oldin keling.\n` +
        `Vaqtni ko'chirish — shaxsiy kabinetda, qabulgacha 1 soat qolgunicha.`,
    );
  } catch (err) {
    await logToAdmin('book/confirm-xabar', err);
  }
}
