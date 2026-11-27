import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { optional, required } from './env.ts';
import { error } from './http.ts';

/**
 * /admin paneli — parol bilan kirish.
 *
 * Parol faqat `ADMIN_PASSWORD` muhit o'zgaruvchisida turadi. To'g'ri
 * parol kiritilganda imzolangan, HttpOnly cookie beriladi (12 soat).
 *
 * Imzo kaliti `SESSION_SECRET` va parolning xeshidan hosil qilinadi:
 * parol almashtirilsa, avval ochilgan barcha admin sessiyalari darhol
 * yaroqsiz bo'ladi — "parol sizib chiqdi" holatida bitta o'zgartirish
 * yetadi.
 *
 * Bu Telegram orqali kiriladigan `/kabinet/admin` (ADMIN_TELEGRAM_IDS)
 * dan alohida va unga tegmaydi.
 */
const COOKIE = 'dimed_admin';
export const ADMIN_MAX_AGE_SECONDS = 12 * 60 * 60;
/** Juda qisqa parol bilan panel ochilmaydi. */
export const MIN_PASSWORD_LENGTH = 8;

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();

const password = (): string => optional('ADMIN_PASSWORD').trim();

/** Panel sozlanganmi (parol bor va yetarlicha uzun). */
export const adminConfigured = (): boolean => password().length >= MIN_PASSWORD_LENGTH;

function signingKey(): Buffer {
  return createHmac('sha256', required('SESSION_SECRET'))
    .update('dimed-admin:')
    .update(sha256(password()))
    .digest();
}

const sign = (payload: string): string =>
  createHmac('sha256', signingKey()).update(payload).digest('base64url');

/** Kiritilgan parol to'g'rimi (vaqtga chidamli taqqoslash). */
export function checkPassword(input: unknown): boolean {
  if (!adminConfigured() || typeof input !== 'string' || !input) return false;
  return timingSafeEqual(sha256(input), sha256(password()));
}

export function createAdminCookie(now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(now / 1000) + ADMIN_MAX_AGE_SECONDS, n: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return [
    `${COOKIE}=${payload}.${sign(payload)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${ADMIN_MAX_AGE_SECONDS}`,
  ].join('; ');
}

export const clearAdminCookie = (): string =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

/** Cookie'dagi admin sessiyasi yaroqlimi. */
export function hasAdminSession(request: Request): boolean {
  if (!adminConfigured()) return false;
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return false;

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/**
 * Begona saytdan yuborilgan so'rov emasmi (CSRF).
 *
 * Cookie `SameSite=Strict` — boshqa saytdan kelgan so'rovga brauzer uni
 * qo'shmaydi. Qo'shimcha qatlam: brauzer aytgan `Sec-Fetch-Site` va
 * `Origin` sarlavhalari tekshiriladi (sarlavha yo'q bo'lsa — skript yoki
 * test, cookie baribir kerak).
 */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const hosts = [new URL(request.url).host, request.headers.get('x-forwarded-host') ?? ''];
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}

/**
 * Admin endpointlari boshidagi tekshiruv. Ruxsat bo'lsa null,
 * aks holda tayyor javob (401/403/503).
 */
export function requireAdmin(request: Request): Response | null {
  if (!adminConfigured()) {
    return error(
      `Admin panel sozlanmagan: Netlify'da ADMIN_PASSWORD (kamida ${MIN_PASSWORD_LENGTH} belgi) qo‘shing`,
      503,
    );
  }
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) {
    return error('Ruxsat etilmagan so‘rov', 403);
  }
  if (!hasAdminSession(request)) return error('Avval parol bilan kiring', 401);
  return null;
}
