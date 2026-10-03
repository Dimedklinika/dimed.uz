import type { Context } from '@netlify/functions';
import { sessionFrom } from './lib/auth.ts';
import { findResult } from './lib/results.ts';
import { createShareToken, createVerifyToken, readShareToken } from './lib/share.ts';
import { siteOrigin } from './lib/site.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { hitLimit, tooMany, clientIp } from './lib/rate-limit.ts';

/**
 * GET /api/result — bitta tahlil natijasi (natija sahifasi, D1).
 *
 *   ?id=<hujjat>            — o'z natijasi (sessiya kerak)
 *   ?id=<hujjat>&share=1    — ulashish havolasi (sessiya kerak) → { url }
 *   ?t=<token>              — ulashilgan havola bilan (sessiyasiz)
 *
 * Natija telefon bo'yicha o'qiladi: sessiyadagi yoki tokendagi telefon.
 * Boshqa bemorning id'si so'ralsa — 404 (ma'lumot chiqmaydi).
 *
 * Bu yagona yo'l sessiyasiz ochiladi, shuning uchun IP bo'yicha
 * cheklanadi: token HMAC bilan imzolangan va topib bo'lmaydi, lekin
 * cheksiz urinish laboratoriya jadvalini bekorga qizdiradi.
 */
const MAX_SHARED_PER_HOUR = 120;
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET') return error('Faqat GET', 405);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('t');
  const noStore = { 'cache-control': 'private, no-store' };

  try {
    if (token) {
      const rate = await hitLimit(`natija#${clientIp(request)}`, MAX_SHARED_PER_HOUR, 60 * 60);
      if (!rate.ok) return tooMany(rate.retryAfter);

      const shared = readShareToken(token);
      if (!shared) return error('Havola yaroqsiz yoki muddati o‘tgan', 404);
      const result = await findResult(shared.phone, shared.id);
      if (!result) return error('Natija topilmadi', 404);
      return json({ result: withVerifyUrl(request, shared.phone, result), shared: true }, 200, noStore);
    }

    if (!id) return error('id yoki t parametri kerak');

    const session = sessionFrom(request);
    if (!session) return error('Avval Telegram orqali kiring', 401);

    const result = await findResult(session.phone, id);
    if (!result) return error('Natija topilmadi', 404);

    if (url.searchParams.get('share') === '1') {
      return json({ url: shareUrl(request, session.phone, id) }, 200, noStore);
    }

    return json({ result: withVerifyUrl(request, session.phone, result), shared: false }, 200, noStore);
  } catch (err) {
    await logToAdmin('result', err);
    return error('Natijani olishda xatolik', 500);
  }
};

// Avval shu yerda edi — boshqa funksiyalar (lc-results, notify-results) shu yo'ldan import qiladi.
export { siteOrigin };

/**
 * PDF dagi QR kod havolasi (`/tekshirish`). Natijaga qo'shiladi — brauzer
 * PDF'ni yasayotganda shuni QR ga aylantiradi.
 */
const withVerifyUrl = <T extends { id: string }>(request: Request, phone: string, result: T) => ({
  ...result,
  verifyUrl: `${siteOrigin(request)}/tekshirish?v=${createVerifyToken(phone, result.id)}`,
});

export const shareUrl = (request: Request | undefined, phone: string, id: string): string =>
  `${siteOrigin(request)}/natija?t=${createShareToken(phone, id)}`;
