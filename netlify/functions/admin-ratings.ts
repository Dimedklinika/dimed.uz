import type { Context } from '@netlify/functions';
import { GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES, scanAllPages } from './lib/db.ts';
import { sessionFrom, isAdmin, ratingOf, type DoctorRecord } from './lib/auth.ts';
import { adjustDoctorRating, type RatingRow } from './lib/ratings.ts';
import { maskPhone } from './lib/schedule.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * Admin — bemor baholari (F3).
 *
 *   GET  /api/admin-ratings — barcha baholar (yashirilganlari ham) va
 *        shifokorlar bo'yicha o'rtacha.
 *   POST /api/admin-ratings { id: "doctor_id|created_at", hidden: true|false }
 *        — bahoni saytdagi o'rtachadan yashirish / qaytarish. Baho
 *        o'chirilmaydi, faqat yig'indidan chiqariladi.
 */
const MAX_ROWS = 1000;

type Body = { id?: unknown; hidden?: unknown };

export default async (request: Request, _context: Context): Promise<Response> => {
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);
  if (!isAdmin(session)) {
    return json({ error: 'Bu bo‘lim faqat administrator uchun', telegramId: session.userId }, 403);
  }

  try {
    if (request.method === 'GET') return await list();
    if (request.method === 'POST') return await setHidden((await request.json().catch(() => ({}))) as Body);
    return error('Faqat GET yoki POST', 405);
  } catch (err) {
    await logToAdmin('admin-ratings', err);
    return error('Baholarni boshqarishda xatolik', 500);
  }
};

const toPublic = (r: RatingRow, doctorName: string) => ({
  id: `${r.doctor_id}|${r.created_at}`,
  doctorId: r.doctor_id,
  doctorName,
  patientName: r.patient_name ?? '',
  phone: maskPhone(r.phone ?? ''),
  rating: r.rating,
  comment: r.comment ?? '',
  date: r.date,
  time: r.time,
  createdAt: r.created_at,
  hidden: r.hidden === true,
});

async function list(): Promise<Response> {
  const [ratingRows, doctorRows] = await Promise.all([
    // Baholar har qabuldan keyin ko'payadi — bitta Scan 1 MB da kesilardi.
    scanAllPages({ TableName: TABLES.ratings })
      .then((rows) => rows as RatingRow[])
      // Jadval hali yaratilmagan bo'lsa sahifa bo'sh ro'yxat bilan ochilsin.
      .catch(async (err) => {
        await logToAdmin('admin-ratings/jadval', err);
        return [] as RatingRow[];
      }),
    db.send(new ScanCommand({ TableName: TABLES.doctors })).then((r) => (r.Items ?? []) as DoctorRecord[]),
  ]);

  const names = new Map(doctorRows.map((d) => [d.doctor_id, d.name]));
  const ratings = ratingRows
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ROWS)
    .map((r) => toPublic(r, names.get(r.doctor_id) ?? r.doctor_id));

  const doctors = doctorRows
    .map((d) => ({ id: d.doctor_id, name: d.name, job: d.job, active: d.active !== false, ...ratingOf(d) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({ ratings, doctors }, 200, { 'cache-control': 'private, no-store' });
}

async function setHidden(body: Body): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  const at = id.indexOf('|');
  if (at < 1 || typeof body.hidden !== 'boolean') return error('id ("shifokor|vaqt") va hidden kerak');
  const key = { doctor_id: id.slice(0, at), created_at: id.slice(at + 1) };
  const hidden = body.hidden;

  const found = await db.send(new GetCommand({ TableName: TABLES.ratings, Key: key }));
  const row = found.Item as RatingRow | undefined;
  if (!row) return error('Bunday baho yo‘q', 404);
  if ((row.hidden === true) === hidden) return json({ ok: true, id, hidden, unchanged: true });

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.ratings,
        Key: key,
        UpdateExpression: 'SET hidden = :h, hidden_at = :at',
        // Ikki admin bir vaqtda bossa yig'indi ikki marta o'zgarmasin.
        ConditionExpression: hidden ? 'attribute_not_exists(hidden) OR hidden = :was' : 'hidden = :was',
        ExpressionAttributeValues: { ':h': hidden, ':at': new Date().toISOString(), ':was': !hidden },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return json({ ok: true, id, hidden, unchanged: true });
    throw err;
  }

  const sign = hidden ? -1 : 1;
  await adjustDoctorRating(row.doctor_id, sign * row.rating, sign);
  return json({ ok: true, id, hidden });
}
