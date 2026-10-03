import type { Context } from '@netlify/functions';
import { findResult } from './lib/results.ts';
import { readVerifyToken } from './lib/share.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { hitLimit, tooMany, clientIp } from './lib/rate-limit.ts';

/**
 * GET /api/verify?v=<token> — PDF dagi QR kod: hujjat haqiqiymi?
 *
 * Sessiyasiz ochiladi (QR ni xodim, ish beruvchi yoki sug'urta skanerlaydi),
 * shuning uchun javob **minimal**: tahlil nomi, sana, bemorning bosh harflari
 * va tug'ilgan yili. Natija qiymatlari, to'liq ism, shifokor ko'rsatilmaydi —
 * bu ma'lumot PDF'ning o'zida bor, tekshiruvchi uni solishtiradi.
 *
 * Hujjat bekor qilingan, o'chirilgan yoki hali tayyor bo'lmasa — 404: shu
 * tufayli bekor qilingan natijaning PDF nusxasi tekshiruvdan o'tmaydi.
 */
const MAX_PER_HOUR = 120;
const noStore = { 'cache-control': 'private, no-store' };

/** "Yoʻldoshev Anvar Botirovich" → "Y. A. B." */
export function initials(name: string | null | undefined): string | null {
  const parts = (name ?? '').split(/\s+/).filter(Boolean).slice(0, 3);
  if (!parts.length) return null;
  return parts.map((part) => `${Array.from(part)[0]?.toUpperCase() ?? ''}.`).join(' ');
}

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET') return error('Faqat GET', 405);

  try {
    const rate = await hitLimit(`tekshirish#${clientIp(request)}`, MAX_PER_HOUR, 60 * 60);
    if (!rate.ok) return tooMany(rate.retryAfter);

    const payload = readVerifyToken(new URL(request.url).searchParams.get('v'));
    if (!payload) return json({ valid: false }, 404, noStore);

    const result = await findResult(payload.phone, payload.id);
    if (!result || result.status !== 'ready') return json({ valid: false }, 404, noStore);

    return json(
      {
        valid: true,
        title: result.title,
        titleKey: result.titleKey ?? null,
        date: result.date,
        patient: initials(result.patientName),
        birthYear: result.patientBirthDate?.slice(0, 4) ?? null,
      },
      200,
      noStore,
    );
  } catch (err) {
    await logToAdmin('verify', err);
    return error('Tekshirib bo‘lmadi', 500);
  }
};
