import type { Context } from '@netlify/functions';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, getDoctor } from './lib/auth.ts';
import { doctorDayKey, isBookable } from './lib/slots.ts';
import { isConfirmed, type Appointment } from './lib/appointments.ts';
import { isDateKey, isTime } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { hitLimit, tooMany } from './lib/rate-limit.ts';

/**
 * POST /api/cancel — bemor bronni bekor qiladi.
 *
 * Avval faqat ko'chirish bor edi: kela olmaydigan bemor qo'ng'iroq
 * qilishi kerak edi, qilmasa slot o'lik ketardi va shifokor kutardi.
 * Endi bemor o'zi bo'shata oladi — slot boshqa bemorga ochiladi.
 *
 * Ko'chirish bilan bir xil qoida: qabulga kamida 1 soat qolgan
 * bo'lishi kerak. Undan keyin faqat qabulxonaga qo'ng'iroq.
 */
type Body = { doctor?: string; date?: string; time?: string };

/** Bir hisobdan bir soatda shuncha so'rov — «bolg'alash»ga qarshi. */
const MAX_PER_HOUR = 30;

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    const rate = await hitLimit(`bekor#${session.phone}`, MAX_PER_HOUR, 60 * 60);
    if (!rate.ok) return tooMany(rate.retryAfter);
    const { doctor: doctorId, date, time } = (await request.json().catch(() => ({}))) as Body;
    if (!doctorId || !date || !time) return error('doctor, date va time kerak');
    if (!isDateKey(date) || !isTime(time)) return error('Sana yoki vaqt formati noto‘g‘ri');

    const key = { doctor_day: doctorDayKey(doctorId, date), time };
    const found = await db.send(new GetCommand({ TableName: TABLES.appointments, Key: key }));
    const appointment = found.Item as Appointment | undefined;

    if (!appointment) return error('Bunday qabul topilmadi', 404);
    if (appointment.phone !== session.phone) return error('Bu qabul sizniki emas', 403);
    if (!isConfirmed(appointment)) return error('Bu bron allaqachon kuchda emas');
    if (!isBookable(date, time, new Date())) {
      return error('Qabulga 1 soatdan kam qoldi — bekor qilib bo‘lmaydi. Qabulxonaga qo‘ng‘iroq qiling.');
    }

    const now = new Date().toISOString();
    try {
      await db.send(
        new UpdateCommand({
          TableName: TABLES.appointments,
          Key: key,
          UpdateExpression: 'SET #s = :cancelled, cancelled_at = :now, updated_at = :now',
          // Holat oralig'da o'zgargan bo'lsa (shifokor kunni yopgan,
          // to'lov kelgan) — tegmaymiz.
          ConditionExpression: '#s = :was',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':cancelled': 'cancelled', ':now': now, ':was': appointment.status },
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return error('Bron holati o‘zgargan — sahifani yangilang', 409);
      }
      throw err;
    }

    // Xabar ketmasa ham bekor qilish bo'lgan — xato faqat logga.
    const doctor = await getDoctor(doctorId).catch(() => null);
    if (session.userId) {
      await sendMessage(
        session.userId,
        `❌ <b>Navbat bekor qilindi</b>\n\n` +
          `Shifokor: ${escapeHtml(doctor?.name ?? 'Shifokor')}\n` +
          `Sana: ${date} · ${time}\n\n` +
          `Kerak bo'lsa saytdan yangi vaqt tanlashingiz mumkin.`,
      ).catch((err) => logToAdmin('cancel/xabar', err));
    }

    return json({ ok: true, doctor: doctorId, date, time, status: 'cancelled' });
  } catch (err) {
    await logToAdmin('cancel', err);
    return error('Bekor qilishda xatolik', 500);
  }
};
