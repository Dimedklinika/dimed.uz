import type { Context } from '@netlify/functions';
import { requireAdmin } from './lib/admin-auth.ts';
import { IMAGE_PURPOSES, MAX_UPLOAD_BYTES, saveImage, type ImagePurpose } from './lib/media.ts';
import { logToAdmin } from './lib/telegram.ts';
import { isMissingTable, setupProblem } from './lib/aws-errors.ts';
import { json, error } from './lib/http.ts';

/**
 * POST /api/admin-upload?purpose=doctor — rasm yuklash (tana — faylning o'zi).
 *
 * Brauzer rasmni avval o'zi kichraytirib yuboradi; server uni yana
 * tekshiradi, buradi, metama'lumotni olib tashlaydi va WebP qilib
 * Netlify Blobs'ga yozadi. Javob: `{ url, width, height }` — tashrif
 * shifokori formasida shu `url` saqlanadi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  const denied = requireAdmin(request);
  if (denied) return denied;
  if (request.method !== 'POST') return error('Faqat POST', 405);

  const purpose = (new URL(request.url).searchParams.get('purpose') ?? 'doctor') as ImagePurpose;
  if (!IMAGE_PURPOSES.includes(purpose)) return error('purpose noto‘g‘ri');

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES) return error('Rasm juda katta (4 MB dan oshmasin)', 413);

  try {
    const data = new Uint8Array(await request.arrayBuffer());
    const saved = await saveImage(data, purpose);
    if (!saved.ok) return error(saved.error, 422);
    return json(
      { ok: true, url: saved.url, width: saved.meta.width, height: saved.meta.height, size: saved.meta.size },
      200,
      { 'cache-control': 'private, no-store' },
    );
  } catch (err) {
    const setup = setupProblem(err);
    if (setup) {
      if (!isMissingTable(err)) await logToAdmin('admin-upload', err);
      return error(setup, 503);
    }
    await logToAdmin('admin-upload', err);
    return error('Rasmni saqlashda xatolik', 500);
  }
};
