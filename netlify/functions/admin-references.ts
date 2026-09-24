import type { Context } from '@netlify/functions';
import { ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, isAdmin } from './lib/auth.ts';
import { referenceId, isGender, type ReferenceRow, type Gender } from './lib/references.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * Admin — ko'rsatkichlar me'yoriy (referens) oraliqlari (F4).
 *
 *   GET    /api/admin-references                      — barcha referenslar
 *   POST   /api/admin-references {name, low?, high?, unit?, gender?}  — upsert
 *   DELETE /api/admin-references {id}                 — o'chirish
 *
 * 1C oraliq bermagan ko'rsatkichlar shu qiymatlar bilan me'yor/yuqori/past
 * deb baholanadi (lib/results.ts fallback). Faqat administrator uchun.
 */
type Body = {
  name?: string;
  low?: unknown;
  high?: unknown;
  unit?: string;
  gender?: string;
  id?: string;
};

const cleanText = (v: unknown, max = 120): string =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/** Son yoki bo'sh; noto'g'ri bo'lsa 'bad'. */
const parseNum = (v: unknown): number | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 'bad';
};

export default async (request: Request, _context: Context): Promise<Response> => {
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);
  if (!isAdmin(session)) {
    return json({ error: 'Bu bo‘lim faqat administrator uchun', telegramId: session.userId }, 403);
  }

  try {
    if (request.method === 'GET') return await list();
    if (request.method === 'POST') return await save((await request.json().catch(() => ({}))) as Body);
    if (request.method === 'DELETE') return await remove((await request.json().catch(() => ({}))) as Body);
    return error('Faqat GET, POST yoki DELETE', 405);
  } catch (err) {
    await logToAdmin('admin-references', err);
    return error('Referenslarni boshqarishda xatolik', 500);
  }
};

async function list(): Promise<Response> {
  const { Items = [] } = await db.send(new ScanCommand({ TableName: TABLES.prices }));
  const refs = (Items as ReferenceRow[])
    .filter((r) => r.kind === 'reference')
    .map((r) => ({
      id: r.item_id,
      name: r.name,
      low: r.low ?? null,
      high: r.high ?? null,
      unit: r.unit ?? '',
      gender: r.gender,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uz') || a.gender.localeCompare(b.gender));

  return json({ references: refs }, 200, { 'cache-control': 'private, no-store' });
}

async function save(body: Body): Promise<Response> {
  const name = cleanText(body.name);
  if (!name) return error('Ko‘rsatkich nomi kerak');

  const gender: Gender = isGender(body.gender) ? body.gender : 'all';

  const low = parseNum(body.low);
  const high = parseNum(body.high);
  if (low === 'bad' || high === 'bad') return error('Oraliq son bo‘lishi kerak');
  if (low === null && high === null) return error('Kamida bitta chegara (pastki yoki yuqori) kerak');
  if (low !== null && high !== null && low > high) {
    return error('Pastki chegara yuqoridan katta bo‘lmasin');
  }

  const item: ReferenceRow = {
    item_id: referenceId(name, gender),
    kind: 'reference',
    name,
    low,
    high,
    unit: cleanText(body.unit, 20),
    gender,
    updated_at: new Date().toISOString(),
  };
  await db.send(new PutCommand({ TableName: TABLES.prices, Item: item }));

  return json({ ok: true, reference: { id: item.item_id, name, low, high, unit: item.unit, gender } });
}

async function remove(body: Body): Promise<Response> {
  const id = cleanText(body.id, 200);
  if (!id.startsWith('reference#')) return error('id noto‘g‘ri');
  await db.send(new DeleteCommand({ TableName: TABLES.prices, Key: { item_id: id } }));
  return json({ ok: true, id });
}
