import type { Config, Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { getDoctor } from './lib/auth.ts';
import { appointmentsOnDate, isConfirmed, type Appointment } from './lib/appointments.ts';
import { maskPhone } from './lib/schedule.ts';
import { toTashkent, type DateKey } from './lib/time.ts';
import { sendMessage, logToAdmin, isTransientTelegramError } from './lib/telegram.ts';
import { cronGuard } from './lib/cron.ts';
import { json, error } from './lib/http.ts';

/**
 * Shifokorlarga ertalabki xulosa: «bugungi navbatlaringiz»
 * (Netlify Scheduled Function, Toshkent vaqti bilan 07:00).
 *
 * Navbati yo'q shifokorga xabar yuborilmaydi — bo'sh kun haqidagi
 * kundalik xabar foydadan ko'ra shovqin.
 *
 * Xabar vaqtinchalik sababga ko'ra yetmasa (masalan bot kaliti yaroqsiz)
 * "yuborildi" belgisi qaytariladi — kalit tuzalgach keyingi chaqiruv
 * xulosani yuboradi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  const blocked = await cronGuard(request, 'doctor-daily', 3600);
  if (blocked) return blocked;

  try {
    const today = toTashkent(new Date()).dateKey;
    const rows = (await appointmentsOnDate(today)).filter(isConfirmed);

    const byDoctor = new Map<string, Appointment[]>();
    for (const appointment of rows) {
      const list = byDoctor.get(appointment.doctor_id) ?? [];
      list.push(appointment);
      byDoctor.set(appointment.doctor_id, list);
    }

    let sent = 0;
    for (const [doctorId, appointments] of byDoctor) {
      const doctor = await getDoctor(doctorId);
      if (!doctor?.telegram_id) continue;

      // Bir kunga bitta xulosa — cron takror ishga tushsa ham.
      const mark = await markSent(doctorId, today);
      if (!mark) continue;

      try {
        await sendMessage(doctor.telegram_id, summary(today, appointments));
        sent++;
      } catch (err) {
        await logToAdmin('doctor-daily/xabar', err);
        if (isTransientTelegramError(err)) await unmarkSent(doctorId, today, mark);
      }
    }

    return json({ ok: true, date: today, doctors: byDoctor.size, sent });
  } catch (err) {
    await logToAdmin('doctor-daily', err);
    return error('Kunlik xulosani yuborishda xatolik', 500);
  }
};

export const config: Config = { schedule: '0 2 * * *' };

/**
 * Xulosa yuborilganini belgilaydi va qo'yilgan belgini qaytaradi.
 * `null` — bugun allaqachon yuborilgan.
 */
async function markSent(doctorId: string, date: DateKey): Promise<string | null> {
  const stamp = new Date().toISOString();
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.schedules,
        Key: { doctor_id: doctorId, date },
        UpdateExpression: 'SET summary_sent_at = :now',
        ConditionExpression: 'attribute_not_exists(summary_sent_at)',
        ExpressionAttributeValues: { ':now': stamp },
      }),
    );
    return stamp;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return null;
    throw err;
  }
}

/** Xabar yetmadi — o'zimiz qo'ygan belgini olib tashlaydi (keyingi chaqiruv qayta urinadi). */
async function unmarkSent(doctorId: string, date: DateKey, stamp: string): Promise<void> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.schedules,
        Key: { doctor_id: doctorId, date },
        UpdateExpression: 'REMOVE summary_sent_at',
        ConditionExpression: 'summary_sent_at = :now',
        ExpressionAttributeValues: { ':now': stamp },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return;
    await logToAdmin('doctor-daily/qaytarish', err);
  }
}

function summary(date: DateKey, appointments: Appointment[]): string {
  const lines = [...appointments]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((a) => `${a.time} — ${maskPhone(a.phone)}`)
    .join('\n');

  return (
    `🗓 <b>Bugungi navbatlaringiz</b> — ${date}\n\n` +
    `${lines}\n\n` +
    `Jami: ${appointments.length} ta qabul.\n` +
    `Ishga chiqa olmasangiz — kabinetdagi «Bugun ishga chiqa olmayman» tugmasi.`
  );
}
