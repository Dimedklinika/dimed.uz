import type { Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, doctorFor } from './lib/auth.ts';
import { doctorDayKey } from './lib/slots.ts';
import { dayAppointments, holdsSlot, type Appointment } from './lib/appointments.ts';
import { isDateKey, toTashkent, addDays } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

const DEFAULT_REASON = 'Shifokor ishga chiqa olmadi';

type Body = { date?: string; reason?: string };

/**
 * POST /api/doctor-off — «bugun ishga chiqa olmayman».
 *
 * Kunni dam olishga o'tkazadi, o'sha kunning barcha navbatlarini bekor
 * qiladi va har bir bemorga bot orqali uzr xabarini yuboradi. Bekor
 * qilingan slotlar bo'shaydi — bemorlar boshqa vaqtga yozila oladi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    const doctor = await doctorFor(session);
    if (!doctor) return error('Bu bo‘lim faqat shifokorlar uchun', 403);

    const body = (await request.json().catch(() => ({}))) as Body;
    const today = toTashkent(new Date()).dateKey;
    const date = body.date ?? today;
    const reason = body.reason?.trim() || DEFAULT_REASON;

    if (!isDateKey(date)) return error('date YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
    if (date < today) return error('O‘tgan kunni o‘zgartirib bo‘lmaydi');
    if (date > addDays(today, 90)) return error('90 kundan uzoqqa jadval kiritib bo‘lmaydi');

    const now = new Date();

    /*
      Avval kun yopiladi — shundan keyin bekor qilish davomida yangi
      bemor bo'shab qolgan slotni ololmaydi.
    */
    await db.send(
      new UpdateCommand({
        TableName: TABLES.schedules,
        Key: { doctor_id: doctor.doctor_id, date },
        UpdateExpression:
          'SET day_off = :on, shifts = :none, off_reason = :reason, updated_at = :now',
        ExpressionAttributeValues: {
          ':on': true,
          ':none': [],
          ':reason': reason,
          ':now': now.toISOString(),
        },
      }),
    );

    const active = (await dayAppointments(doctor.doctor_id, date)).filter((a) =>
      holdsSlot(a, now),
    );

    let cancelled = 0;
    let notified = 0;
    for (const appointment of active) {
      if (!(await cancel(doctor.doctor_id, date, appointment, now))) continue;
      cancelled++;
      if (await tellPatient(appointment, doctor.name, date, reason)) notified++;
    }

    return json({ ok: true, date, reason, cancelled, notified });
  } catch (err) {
    await logToAdmin('doctor-off', err);
    return error('Kunni bekor qilishda xatolik. Birozdan so‘ng urinib ko‘ring.', 500);
  }
};

/**
 * Bitta yozuvni bekor qiladi. Shart — holat biz o'qiganidan
 * o'zgarmagan bo'lishi: shu orada bemor vaqtini ko'chirgan bo'lsa,
 * uning yangi navbatiga tegmaymiz.
 */
async function cancel(
  doctorId: string,
  date: string,
  appointment: Appointment,
  now: Date,
): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: { doctor_day: doctorDayKey(doctorId, date), time: appointment.time },
        UpdateExpression: 'SET #s = :cancelled, updated_at = :now',
        ConditionExpression: '#s = :was',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':cancelled': 'cancelled_by_clinic',
          ':now': now.toISOString(),
          ':was': appointment.status,
        },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

/** Uzr xabari. Bittasi ketmasa ham qolganlariga yuborishda davom etamiz. */
async function tellPatient(
  appointment: Appointment,
  doctorName: string,
  date: string,
  reason: string,
): Promise<boolean> {
  if (!appointment.telegram_id) return false;

  try {
    await sendMessage(
      appointment.telegram_id,
      `⚠️ <b>Qabul bekor qilindi</b>\n\n` +
        `Shifokor: ${escapeHtml(doctorName)}\n` +
        `Sana: ${date}, soat ${appointment.time}\n` +
        `Sabab: ${escapeHtml(reason)}\n\n` +
        `Uzr so'raymiz. Boshqa vaqtga yozilish uchun saytdagi shaxsiy ` +
        `kabinetingizga kiring — to'lov qilingan bo'lsa u saqlanadi.`,
    );
    return true;
  } catch (err) {
    await logToAdmin('doctor-off/xabar', err);
    return false;
  }
}
