import type { Config, Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { appointmentsOnDate, isConfirmed, type Appointment } from './lib/appointments.ts';
import { appointmentKey, matchArrivals, visitsOnDate, type VisitDocument } from './lib/visits.ts';
import { fromOneCDate } from './lib/results.ts';
import { addDays, toTashkent, type DateKey } from './lib/time.ts';
import { logToAdmin } from './lib/telegram.ts';
import { cronGuard } from './lib/cron.ts';
import { json, error } from './lib/http.ts';

/**
 * Bemor keldimi-kelmadimi — 1C bo'yicha avtomatik belgilash
 * (Netlify Scheduled Function).
 *
 * Qoida klinika aytgandek: **1C'da "Doktorga Qabul" hujjati
 * o'tkazilgan bo'lsa — keldi (`done`); kun davomida o'tkazilmasa —
 * kelmadi (`no_show`).** Hujjatlarni 1C kengaytmasi `dimed_visits`
 * jadvaliga yozadi (docs/1c-sync.md, 6.3).
 *
 * Shifokorning qo'lda qo'ygan belgisi **ustun**: `marked_at` bor
 * yozuvga tegilmaydi. Shu sababli avtomatik belgi shifokor "Kelmadi"
 * deb qo'ygan navbatni "Keldi" ga aylantirib yubormaydi.
 *
 * "Kelmadi" faqat **kuni tugagan** navbatlarga qo'yiladi: kunduzi
 * hujjat hali o'tkazilmagan bo'lishi normal holat.
 */

/*
  Har ishga tushishda uch kun qaraladi: bugun (keldi belgisi uchun) va
  ikki kun oldingi (kelmadi belgisi uchun). Ikki kun — cron bir kecha
  ishlamay qolsa ham navbatlar belgisiz qolmasligi uchun; ko'proq
  emas — eski tarixni qayta yozib yubormaslik uchun.
*/
const SWEEP_DAYS = 2;

type Marked = 'done' | 'no_show';

export default async (request: Request, _context: Context): Promise<Response> => {
  const blocked = await cronGuard(request, 'sync-attendance', 300);
  if (blocked) return blocked;

  try {
    const today = toTashkent(new Date()).dateKey;
    const days: DateKey[] = [];
    for (let i = SWEEP_DAYS; i >= 0; i--) days.push(addDays(today, -i));

    let checked = 0;
    let done = 0;
    let noShow = 0;

    for (const day of days) {
      const [appointments, visits] = await Promise.all([
        appointmentsOnDate(day),
        /* Jadval hali yaratilmagan yoki 1C hali yozmagan bo'lsa —
           kun o'tkazib yuboriladi, qolgan kunlar ishlayveradi. */
        visitsOnDate(day).catch(async (err): Promise<VisitDocument[]> => {
          await logToAdmin(`sync-attendance/qabullar ${day}`, err);
          return [];
        }),
      ]);

      /* Bog'lash butun kun bo'yicha, belgilanganlarni ham qo'shib:
         ular o'z hujjatini band qilib turadi va u qo'shni navbatga
         o'tib ketmaydi. */
      const arrivals = matchArrivals(appointments, visits);

      for (const appointment of appointments) {
        // Shifokor allaqachon belgilagan yoki bron kuchda emas.
        if (!isConfirmed(appointment) || appointment.marked_at) continue;
        checked++;

        const arrival = arrivals.get(appointmentKey(appointment));
        if (arrival) {
          if (await mark(appointment, 'done', arrival)) done++;
        } else if (day < today) {
          if (await mark(appointment, 'no_show')) noShow++;
        }
      }
    }

    return json({ ok: true, days, checked, done, noShow });
  } catch (err) {
    await logToAdmin('sync-attendance', err);
    return error('Davomatni belgilashda xatolik', 500);
  }
};

/**
 * Navbatni belgilaydi. Shart buzilsa (holat o'zgargan, shifokor qo'lda
 * belgilagan) — `false`, xato emas: keyingi aylanishda qayta ko'riladi.
 */
async function mark(
  appointment: Appointment,
  status: Marked,
  arrival?: VisitDocument,
): Promise<boolean> {
  const now = new Date().toISOString();
  const arrivedAt = arrival ? fromOneCDate(arrival.Date) : '';

  const sets = ['#s = :s', 'marked_at = :now', 'marked_by = :by', 'updated_at = :now'];
  const values: Record<string, unknown> = {
    ':s': status,
    ':now': now,
    ':by': '1c',
    ':booked': 'booked',
    ':paid': 'paid',
  };
  if (arrival) {
    sets.push('visit_ref = :ref');
    values[':ref'] = arrival.sort_key;
    if (arrivedAt) {
      sets.push('arrived_at = :at');
      values[':at'] = arrivedAt;
    }
  }

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: { doctor_day: appointment.doctor_day, time: appointment.time },
        UpdateExpression: `SET ${sets.join(', ')}`,
        /* Qo'lda belgilash holatni har doim o'zgartiradi (done / no_show),
           shuning uchun "hali kuchda" sharti shifokor belgisini ham
           himoya qiladi: ikkovi ustma-ust kelsa shifokorniki qoladi. */
        ConditionExpression: '#s = :booked OR #s = :paid',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    await logToAdmin(`sync-attendance/${appointment.doctor_day}|${appointment.time}`, err);
    return false;
  }
}

export const config: Config = { schedule: '*/10 * * * *' };
