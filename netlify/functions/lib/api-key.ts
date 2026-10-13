import { timingSafeEqual } from 'node:crypto';
import { optional } from './env.ts';
import { error } from './http.ts';

/**
 * 1C so'rovining `X-API-Key` sarlavhasini tekshiradi.
 *
 * `LC_API_KEY` sozlanmagan bo'lsa endpoint umuman yopiq (404) — ishlatilmayotgan
 * eshik ochiq turmasin. Qiymatlar vaqtga chidamli taqqoslanadi.
 * To'g'ri bo'lsa `null`, aks holda tayyor xato javobi qaytadi.
 */
export function checkLcKey(request: Request): Response | null {
  const key = optional('LC_API_KEY');
  if (!key) return error('Bu yo‘l yopiq', 404);

  const given = Buffer.from(request.headers.get('x-api-key') ?? '');
  const expected = Buffer.from(key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return error('API kalit noto‘g‘ri', 401);
  }
  return null;
}
