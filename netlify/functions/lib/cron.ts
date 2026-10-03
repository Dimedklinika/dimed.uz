import { timingSafeEqual } from 'node:crypto';
import { optional } from './env.ts';
import { hitLimit, tooMany } from './rate-limit.ts';

/**
 * Cron funksiyalarini begona so'rovdan himoyalaydi.
 *
 * Scheduled Function'lar ham `/api/<nom>` manzilida turadi — har kim
 * ochib yuborishi mumkin. Natijalari takrorlanmaydi (har biri bir
 * marta belgilaydi), lekin `notify-results?mode=full` butun bemorlar
 * jadvalini skanerlaydi: takror-takror chaqirish xarajat va sekinlik
 * keltiradi.
 *
 * Kim o'tadi:
 *  1) `x-cron-secret` sarlavhasi `CRON_SECRET` bilan mos (qo'lda ishga
 *     tushirish uchun; sozlanmagan bo'lsa bu yo'l yopiq);
 *  2) Netlify rejalashtiruvchisi (`User-Agent: Netlify Clockwork`);
 *  3) qolganlar — har `windowSeconds` oynada bittadan. Cron o'zi
 *     oynada bir martadan ortiq kelmaydi, shuning uchun bu cheklov
 *     haqiqiy ishga tushishni to'smaydi.
 *
 * Cheklov jadvali ishlamasa (`hitLimit` yiqilsa) so'rov o'tkaziladi:
 * himoya cron'ni to'xtatib qo'ymasin.
 *
 * @returns rad etilsa tayyor javob, o'tsa `null`.
 */
export async function cronGuard(
  request: Request,
  name: string,
  windowSeconds: number,
): Promise<Response | null> {
  const secret = optional('CRON_SECRET');
  const given = request.headers.get('x-cron-secret') ?? '';
  if (secret && given.length === secret.length) {
    if (timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return null;
  }

  if (/netlify/i.test(request.headers.get('user-agent') ?? '')) return null;

  const rate = await hitLimit(`cron#${name}`, 1, windowSeconds);
  return rate.ok ? null : tooMany(rate.retryAfter);
}
