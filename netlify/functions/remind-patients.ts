import type { Config, Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { getDoctor } from './lib/auth.ts';
import { doctorDayKey } from './lib/slots.ts';
import { appointmentsOnDate, isConfirmed, type Appointment } from './lib/appointments.ts';
import { toTashkent } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * Qabulga shuncha daqiqa qolganda eslatma ketadi. Cron 10 daqiqada bir
 * ishlagani uchun oyna 1 soatdan biroz kengroq: aks holda ikki ishga
 * tushish orasiga tushib qolgan qabul eslatmasiz qolardi.
 */
const LEAD_MINUTES = 70;

/**
 * Bemorlarga qabul haqida eslatma (Netlify Scheduled Function).
 *
 * Har bir yozuv bir marta eslatiladi: `reminded_at` shartli yozuv bilan
 * qo'yiladi, shuning uchun ishga tushishlar ustma-ust kelsa ham bemorga
 * ikkita xabar bormaydi.
 */
export default async (_request: Request, _context: Context): Promise<Response> => {
  try {
    const now = new Date();
    const until = new Date(now.getTime() + LEAD_MINUTES * 60_000);

    /*
      Odatda bitta kun yetadi, lekin oyna yarim tundan oshib ketsa
      ertangi kunni ham qaraymiz — aks holda kun boshidagi qabullar
      eslatmasiz qolardi.
    */
    const days = [...new Set([toTashkent(now).dateKey, toTashkent(until).dateKey])];
    const rows = (await Promise.all(days.map(appointmentsOnDate))).flat();

    const nowIso = now.toISOString();
    const untilIso = until.toISOString();
    const due = rows.filter(
      (a) => isConfirmed(a) && !a.reminded_at && a.starts_at > nowIso && a.starts_at <= untilIso,
    );

    const names = new Map<string, string>();
    let sent = 0;

    for (const appointment of due) {
      // Avval belgilaymiz, keyin yuboramiz: xabar ketmay qolgani —
      // bemorga ikki marta eslatilganidan ko'ra kamroq yomon.
      if (!(await markReminded(appointment, now))) continue;

      if (!names.has(appointment.doctor_id)) {
        const doctor = await getDoctor(appointment.doctor_id);
        names.set(appointment.doctor_id, doctor?.name ?? 'Shifokor');
      }
      if (await remind(appointment, names.get(appointment.doctor_id) ?? 'Shifokor')) sent++;
    }

    return json({ ok: true, checked: rows.length, due: due.length, sent });
  } catch (err) {
    await logToAdmin('remind-patients', err);
    return error('Eslatmalarni yuborishda xatolik', 500);
  }
};

export const config: Config = { schedule: '*/10 * * * *' };

/** Yozuvni "eslatildi" deb belgilaydi. false — kimdir oldin ulgurgan. */
async function markReminded(appointment: Appointment, now: Date): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: {
          doctor_day: doctorDayKey(appointment.doctor_id, appointment.date),
          time: appointment.time,
        },
        UpdateExpression: 'SET reminded_at = :now',
        ConditionExpression: 'attribute_not_exists(reminded_at) AND #s = :was',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':now': now.toISOString(), ':was': appointment.status },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

async function remind(appointment: Appointment, doctorName: string): Promise<boolean> {
  if (!appointment.telegram_id) return false;

  try {
    await sendMessage(
      appointment.telegram_id,
      `⏰ <b>Qabulingizga bir soat qoldi</b>\n\n` +
        `Shifokor: ${escapeHtml(doctorName)}\n` +
        `Bugun soat <b>${appointment.time}</b>\n\n` +
        `Iltimos, 10 daqiqa oldin keling. Vaqtni ko'chirish endi mumkin emas — ` +
        `kela olmasangiz qabulxonaga qo'ng'iroq qiling.`,
    );
    return true;
  } catch (err) {
    await logToAdmin('remind-patients/xabar', err);
    return false;
  }
}
