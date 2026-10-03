import type { Config, Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { getDoctor } from './lib/auth.ts';
import { doctorDayKey } from './lib/slots.ts';
import { appointmentsOnDate, isConfirmed, type Appointment } from './lib/appointments.ts';
import { toTashkent } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml, isTransientTelegramError } from './lib/telegram.ts';
import { cronGuard } from './lib/cron.ts';
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
 *
 * Xabar vaqtinchalik sababga ko'ra yetmasa (masalan bot kaliti yaroqsiz)
 * belgi qaytariladi va keyingi ishga tushishda — oyna tugamaguncha —
 * qayta uriniladi. Bemor botni bloklagan bo'lsa qayta urinilmaydi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  const blocked = await cronGuard(request, 'remind-patients', 300);
  if (blocked) return blocked;

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
      const outcome = await remind(appointment, names.get(appointment.doctor_id) ?? 'Shifokor');
      if (outcome === 'sent') sent++;
      else if (outcome === 'retry') await unmarkReminded(appointment, now);
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

/**
 * Xabar yetmadi — belgini qaytaradi, keyingi ishga tushishda qayta uriniladi.
 * Faqat o'zimiz qo'ygan belgi olinadi (`:now` mos bo'lsa).
 */
async function unmarkReminded(appointment: Appointment, now: Date): Promise<void> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: {
          doctor_day: doctorDayKey(appointment.doctor_id, appointment.date),
          time: appointment.time,
        },
        UpdateExpression: 'REMOVE reminded_at',
        ConditionExpression: 'reminded_at = :now',
        ExpressionAttributeValues: { ':now': now.toISOString() },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return;
    await logToAdmin('remind-patients/qaytarish', err);
  }
}

/**
 * `sent` — yuborildi; `skip` — yuboradigan joy yo'q (Telegram hisobi yo'q
 * yoki bemor botni bloklagan); `retry` — vaqtinchalik xato, keyin qayta urinish.
 */
type Outcome = 'sent' | 'skip' | 'retry';

async function remind(appointment: Appointment, doctorName: string): Promise<Outcome> {
  if (!appointment.telegram_id) return 'skip';

  try {
    await sendMessage(
      appointment.telegram_id,
      `⏰ <b>Qabulingizga bir soat qoldi</b>\n\n` +
        `Shifokor: ${escapeHtml(doctorName)}\n` +
        `Bugun soat <b>${appointment.time}</b>\n\n` +
        `Iltimos, 10 daqiqa oldin keling. Vaqtni ko'chirish endi mumkin emas — ` +
        `kela olmasangiz qabulxonaga qo'ng'iroq qiling.`,
    );
    return 'sent';
  } catch (err) {
    await logToAdmin('remind-patients/xabar', err);
    return isTransientTelegramError(err) ? 'retry' : 'skip';
  }
}
