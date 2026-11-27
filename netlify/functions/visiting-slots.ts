import type { Context } from '@netlify/functions';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './lib/db.ts';
import {
  dayBookings,
  freeTimes,
  ruleOf,
  tashkentToday,
  visitDates,
  VISITING_ID_RE,
  type VisitingDoctorRecord,
} from './lib/visiting.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * GET /api/visiting-slots?doctor=v-xxxx — tashrif shifokorining yaqin
 * kelish kunlari va har kunning **faqat bo'sh** vaqtlari.
 *
 * Band qilingan vaqt javobda umuman yo'q — boshqa odam uni ko'rmaydi.
 * Keshlanmaydi: yozilgandan keyin orqaga qaytgan odam o'zi olgan vaqtni
 * yana bo'sh ko'rmasin.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET') return error('Faqat GET', 405);

  const doctorId = new URL(request.url).searchParams.get('doctor') ?? '';
  if (!VISITING_ID_RE.test(doctorId)) return error('doctor parametri noto‘g‘ri');

  try {
    const found = await db.send(
      new GetCommand({ TableName: TABLES.visitingDoctors, Key: { doctor_id: doctorId } }),
    );
    const doctor = found.Item as VisitingDoctorRecord | undefined;
    if (!doctor || doctor.active === false) return error('Shifokor topilmadi', 404);

    const now = new Date();
    const dates = visitDates(ruleOf(doctor), tashkentToday(now));
    const days = await Promise.all(
      dates.map(async (date) => ({ date, slots: freeTimes(doctor, date, await dayBookings(doctorId, date), now) })),
    );

    return json(
      { doctor: doctorId, price: doctor.price, slotMinutes: doctor.slot_minutes, days },
      200,
      { 'cache-control': 'no-store' },
    );
  } catch (err) {
    await logToAdmin('visiting-slots', err);
    return error('Bo‘sh vaqtlarni olishda xatolik', 500);
  }
};
