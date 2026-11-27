import type { Context } from '@netlify/functions';
import { requireAdmin } from './lib/admin-auth.ts';
import { MAX_UPLOAD_BYTES, removeImage, saveImage } from './lib/media.ts';
import {
  deleteSlot,
  doctorSlots,
  getSlot,
  isSlotId,
  listSlots,
  purposeOf,
  putSlot,
  STATIC_SLOTS,
} from './lib/media-slots.ts';
import { purgeTags, TAG_SITE_CONTENT } from './lib/cache.ts';
import { logToAdmin } from './lib/telegram.ts';
import { isMissingTable, setupProblem } from './lib/aws-errors.ts';
import { json, error } from './lib/http.ts';

/**
 * /admin — saytdagi rasmlar (banner, galereya, shifokorlar).
 *
 *   GET    /api/admin-media             — barcha rasm o'rinlari va hozirgi rasmi
 *   POST   /api/admin-media?slot=<id>   — yangi rasm (tana — fayl): siqiladi,
 *                                         Blobs'ga yoziladi, eskisi o'chiriladi
 *   DELETE /api/admin-media {slot}      — standart (repodagi) rasmga qaytarish
 *
 * Sayt keshi darhol tozalanadi — yangi rasm bir necha soniyada ko'rinadi.
 */
const noStore = { 'cache-control': 'private, no-store' };

export default async (request: Request, _context: Context): Promise<Response> => {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    if (request.method === 'GET') return await list();
    if (request.method === 'POST') return await replace(request);
    if (request.method === 'DELETE') {
      const { slot } = (await request.json().catch(() => ({}))) as { slot?: unknown };
      return await reset(slot);
    }
    return error('Faqat GET, POST yoki DELETE', 405);
  } catch (err) {
    const setup = setupProblem(err);
    if (setup) {
      if (!isMissingTable(err)) await logToAdmin('admin-media', err);
      return error(setup, 503);
    }
    await logToAdmin('admin-media', err);
    return error('Rasmlar bilan ishlashda xatolik', 500);
  }
};

async function list(): Promise<Response> {
  const [records, doctors] = await Promise.all([listSlots(), doctorSlots()]);
  const current = new Map(records.map((r) => [r.slot, r]));
  const slots = [...STATIC_SLOTS.map((s) => ({ ...s, active: true })), ...doctors].map((s) => {
    const r = current.get(s.id);
    return {
      id: s.id,
      label: s.label,
      group: s.group,
      hint: s.hint,
      fallback: s.fallback,
      active: s.active,
      current: r ? { url: r.url, width: r.width ?? null, height: r.height ?? null, updatedAt: r.updated_at } : null,
    };
  });
  return json({ slots }, 200, noStore);
}

const purgeSlot = (slot: string) => purgeTags([TAG_SITE_CONTENT, `media-${slot}`]);

async function replace(request: Request): Promise<Response> {
  const slot = new URL(request.url).searchParams.get('slot');
  if (!isSlotId(slot)) return error('Rasm o‘rni noto‘g‘ri');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES) {
    return error('Rasm juda katta (4 MB dan oshmasin)', 413);
  }

  const saved = await saveImage(new Uint8Array(await request.arrayBuffer()), purposeOf(slot));
  if (!saved.ok) return error(saved.error, 422);

  const previous = await getSlot(slot);
  const updatedAt = new Date().toISOString();
  await putSlot({
    slot,
    key: saved.key,
    url: saved.url,
    width: saved.meta.width,
    height: saved.meta.height,
    content_type: saved.meta.contentType,
    updated_at: updatedAt,
  });
  if (previous?.key && previous.key !== saved.key) await removeImage(previous.key);
  await purgeSlot(slot);

  return json(
    { ok: true, slot, current: { url: saved.url, width: saved.meta.width, height: saved.meta.height, updatedAt } },
    200,
    noStore,
  );
}

async function reset(slot: unknown): Promise<Response> {
  if (!isSlotId(slot)) return error('Rasm o‘rni noto‘g‘ri');
  const previous = await getSlot(slot);
  await deleteSlot(slot);
  await removeImage(previous?.key);
  await purgeSlot(slot);
  return json({ ok: true, slot }, 200, noStore);
}
