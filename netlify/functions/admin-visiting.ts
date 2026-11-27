import type { Context } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { requireAdmin } from './lib/admin-auth.ts';
import {
  addDaysKey,
  dayBookings,
  listVisitingDoctors,
  parseDoctorInput,
  tashkentToday,
  BOOKING_HORIZON_DAYS,
  VISITING_ID_RE,
  type DoctorInput,
  type VisitingDoctorRecord,
} from './lib/visiting.ts';
import { removeImage } from './lib/media.ts';
import { purgeTags, TAG_SITE_CONTENT } from './lib/cache.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * /admin — tashrif buyuruvchi shifokorlar.
 *
 *   GET    /api/admin-visiting                 — hammasi (yashirilganlari ham)
 *   POST   /api/admin-visiting {doctor}        — qo'shish (id yo'q) yoki tahrirlash
 *   PATCH  /api/admin-visiting {id, active}    — saytda ko'rsatish / yashirish
 *   DELETE /api/admin-visiting {id, force?}    — o'chirish; kelgusi yozuvlar bo'lsa
 *                                                avval 409 va ularning soni qaytadi
 *
 * Har o'zgarishdan keyin sayt keshi (`site-content`) tozalanadi — karta
 * darhol yangilanadi.
 */
const noStore = { 'cache-control': 'private, no-store' };

export default async (request: Request, _context: Context): Promise<Response> => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    if (request.method === 'GET') {
      return json({ doctors: (await listVisitingDoctors()).map(toAdmin) }, 200, noStore);
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (request.method === 'POST') return await upsert(body as DoctorInput);
    if (request.method === 'PATCH') return await setActive(body);
    if (request.method === 'DELETE') return await remove(body);
    return error('Faqat GET, POST, PATCH yoki DELETE', 405);
  } catch (err) {
    await logToAdmin('admin-visiting', err);
    return error('Saqlashda xatolik', 500);
  }
};

/** Admin formasi uchun shakl (camelCase). */
const toAdmin = (d: VisitingDoctorRecord) => ({
  id: d.doctor_id,
  name: d.name,
  specialty: d.specialty,
  bio: d.bio ?? { uz: '' },
  photoUrl: d.photo_url ?? '',
  weekdays: d.weekdays ?? [],
  dates: d.dates ?? [],
  skipDates: d.skip_dates ?? [],
  shifts: d.shifts ?? [],
  slotMinutes: d.slot_minutes,
  price: d.price,
  active: d.active !== false,
  sort: d.sort ?? 0,
  updatedAt: d.updated_at,
});

const getRecord = async (id: string): Promise<VisitingDoctorRecord | null> =>
  ((await db.send(new GetCommand({ TableName: TABLES.visitingDoctors, Key: { doctor_id: id } }))).Item as
    | VisitingDoctorRecord
    | undefined) ?? null;

async function upsert(body: DoctorInput): Promise<Response> {
  const parsed = parseDoctorInput(body);
  if (!parsed.ok) return error(parsed.error, 422);
  const input = parsed.doctor;

  const now = new Date().toISOString();
  const existing = input.doctor_id ? await getRecord(input.doctor_id) : null;
  if (input.doctor_id && !existing) return error('Bunday shifokor yo‘q (o‘chirilgan bo‘lishi mumkin)', 404);

  const record: VisitingDoctorRecord = {
    ...input,
    doctor_id: input.doctor_id ?? `v-${randomBytes(6).toString('hex')}`,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await db.send(new PutCommand({ TableName: TABLES.visitingDoctors, Item: record }));

  // Rasm almashtirilgan yoki olib tashlangan bo'lsa — eski fayl o'chiriladi.
  if (existing?.photo_key && existing.photo_key !== record.photo_key) await removeImage(existing.photo_key);

  await purgeTags([TAG_SITE_CONTENT]);
  return json({ ok: true, doctor: toAdmin(record) }, 200, noStore);
}

async function setActive(body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? '');
  if (!VISITING_ID_RE.test(id)) return error('id kerak');
  const active = body.active === true;
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.visitingDoctors,
        Key: { doctor_id: id },
        UpdateExpression: 'SET active = :a, updated_at = :u',
        ConditionExpression: 'attribute_exists(doctor_id)',
        ExpressionAttributeValues: { ':a': active, ':u': new Date().toISOString() },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return error('Bunday shifokor yo‘q', 404);
    throw err;
  }
  await purgeTags([TAG_SITE_CONTENT]);
  return json({ ok: true, id, active }, 200, noStore);
}

/** Bugundan boshlab kelgusi (bekor qilinmagan) yozilishlar soni. */
async function upcomingCount(id: string): Promise<number> {
  const today = tashkentToday();
  const now = new Date().toISOString();
  const days = Array.from({ length: BOOKING_HORIZON_DAYS + 1 }, (_, i) => addDaysKey(today, i));
  let count = 0;
  for (let i = 0; i < days.length; i += 10) {
    const batch = await Promise.all(days.slice(i, i + 10).map((d) => dayBookings(id, d)));
    count += batch.flat().filter((b) => b.status === 'booked' && b.starts_at >= now).length;
  }
  return count;
}

async function remove(body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? '');
  if (!VISITING_ID_RE.test(id)) return error('id kerak');
  const existing = await getRecord(id);
  if (!existing) return error('Bunday shifokor yo‘q', 404);

  if (body.force !== true) {
    const upcoming = await upcomingCount(id);
    if (upcoming > 0) {
      return json(
        {
          error: `Bu shifokorga ${upcoming} ta kelgusi yozuv bor. O‘chirilsa ham yozuvlar «Yozilganlar» ro‘yxatida qoladi.`,
          upcoming,
        },
        409,
        noStore,
      );
    }
  }

  // Yozilishlar o'chirilmaydi — ularda shifokor nomi saqlangan, ro'yxatda ko'rinib turadi.
  await db.send(new DeleteCommand({ TableName: TABLES.visitingDoctors, Key: { doctor_id: id } }));
  await removeImage(existing.photo_key);
  await purgeTags([TAG_SITE_CONTENT]);
  return json({ ok: true, id }, 200, noStore);
}
