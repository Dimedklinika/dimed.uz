import type { Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { requireAdmin } from './lib/admin-auth.ts';
import {
  addDaysKey,
  bookingsOnDate,
  isBookingStatus,
  isDateKeyStr,
  listVisitingDoctors,
  tashkentToday,
  textOf,
  VISITING_ID_RE,
  type VisitingBooking,
} from './lib/visiting.ts';
import { isTime } from './lib/time.ts';
import { logToAdmin } from './lib/telegram.ts';
import { isMissingTable, setupProblem } from './lib/aws-errors.ts';
import { json, error } from './lib/http.ts';

/**
 * /admin — tashrif shifokorlariga yozilganlar.
 *
 *   GET  /api/admin-visiting-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&doctor=v-…
 *        — oraliqdagi yozuvlar (ko'pi bilan 62 kun), vaqt bo'yicha
 *   POST /api/admin-visiting-bookings {doctorDay, time, createdAt, status}
 *        — holat: booked (kutilmoqda) / came (keldi) / no_show (kelmadi) /
 *          cancelled (bekor). Bekor qilingan vaqt saytda yana bo'sh ko'rinadi.
 *
 * Telefon raqami to'liq ko'rsatiladi — qabulxona qo'ng'iroq qilib eslatadi.
 */
const MAX_RANGE_DAYS = 62;
const noStore = { 'cache-control': 'private, no-store' };

export default async (request: Request, _context: Context): Promise<Response> => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    if (request.method === 'GET') return await list(new URL(request.url).searchParams);
    if (request.method === 'POST') return await setStatus((await request.json().catch(() => ({}))) as Record<string, unknown>);
    return error('Faqat GET yoki POST', 405);
  } catch (err) {
    const setup = setupProblem(err);
    if (setup) {
      if (!isMissingTable(err)) await logToAdmin('admin-visiting-bookings', err);
      return error(setup, 503);
    }
    await logToAdmin('admin-visiting-bookings', err);
    return error('Yozilganlarni olishda xatolik', 500);
  }
};

async function list(params: URLSearchParams): Promise<Response> {
  const today = tashkentToday();
  const from = params.get('from') || today;
  const to = params.get('to') || from;
  const doctor = params.get('doctor') || '';
  if (!isDateKeyStr(from) || !isDateKeyStr(to) || to < from) return error('Sana oralig‘i noto‘g‘ri');
  if (doctor && !VISITING_ID_RE.test(doctor)) return error('Shifokor noto‘g‘ri');

  const days: string[] = [];
  for (let d = from; d <= to; d = addDaysKey(d, 1)) {
    days.push(d);
    if (days.length > MAX_RANGE_DAYS) return error(`Oraliq ${MAX_RANGE_DAYS} kundan oshmasin`);
  }

  const [doctors, ...perDay] = await Promise.all([listVisitingDoctors(), ...days.map((d) => bookingsOnDate(d))]);
  const names = new Map(doctors.map((d) => [d.doctor_id, `${textOf(d.name, 'uz')} — ${textOf(d.specialty, 'uz')}`]));

  const bookings = (perDay.flat() as VisitingBooking[])
    .filter((b) => !doctor || b.doctor_id === doctor)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.doctor_id.localeCompare(b.doctor_id))
    .map((b) => ({
      doctorDay: b.doctor_day,
      time: b.time,
      date: b.date,
      doctorId: b.doctor_id,
      doctorName: names.get(b.doctor_id) ?? `${b.doctor_name} — ${b.specialty}`,
      name: b.name,
      phone: b.phone,
      status: b.status,
      price: b.price,
      createdAt: b.created_at,
      statusAt: b.status_at ?? null,
    }));

  const counts = { booked: 0, came: 0, no_show: 0, cancelled: 0 };
  for (const b of bookings) counts[b.status] = (counts[b.status] ?? 0) + 1;

  return json(
    {
      from,
      to,
      bookings,
      counts,
      doctors: doctors.map((d) => ({ id: d.doctor_id, name: `${textOf(d.name, 'uz')} — ${textOf(d.specialty, 'uz')}` })),
    },
    200,
    noStore,
  );
}

async function setStatus(body: Record<string, unknown>): Promise<Response> {
  const doctorDay = String(body.doctorDay ?? '');
  const time = String(body.time ?? '');
  const createdAt = String(body.createdAt ?? '');
  const status = body.status;
  if (!/^v-[a-z0-9]{4,24}#\d{4}-\d{2}-\d{2}$/.test(doctorDay) || !isTime(time) || !createdAt) {
    return error('Yozuv ko‘rsatilmagan');
  }
  if (!isBookingStatus(status)) return error('Holat noto‘g‘ri');

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.visitingBookings,
        Key: { doctor_day: doctorDay, time },
        UpdateExpression: 'SET #s = :s, status_at = :now',
        // Shu vaqtni boshqa odam qayta olgan bo'lsa — uning yozuviga tegmaymiz.
        ConditionExpression: 'created_at = :c',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status, ':now': new Date().toISOString(), ':c': createdAt },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return error('Bu yozuv o‘zgargan (vaqtni boshqa odam olgan bo‘lishi mumkin) — ro‘yxatni yangilang', 409);
    }
    throw err;
  }
  return json({ ok: true, status }, 200, noStore);
}
