import type { Context } from '@netlify/functions';
import { createLoginSession, readLoginSession, isNonce, LOGIN_PREFIX } from './lib/login.ts';
import { logToAdmin } from './lib/telegram.ts';
import { hitLimit, tooMany, clientIp } from './lib/rate-limit.ts';
import { json, error } from './lib/http.ts';

/**
 * "Kodni olish" kirish oqimi (A-auth UX).
 *
 *   POST /api/auth-start          — yangi nonce ochadi, bot havolasini beradi
 *   GET  /api/auth-start?nonce=…  — holatni qaytaradi (poll): pending | ready
 *
 * Bot `/start kirish_<nonce>` ni ko'rib telefonni sessiyaga yozadi va
 * kodni yuboradi; sayt shu endpoint orqali poll qilib kod maydonini
 * avtomatik ochadi. Batafsil — `lib/login.ts`.
 */

// @dimedcbot — site.ts dagi telegramBot bilan bir xil bot.
const BOT_USERNAME = 'dimedcbot';

const MAX_START_PER_IP = 20; // soatiga
const MAX_POLL_PER_IP = 600; // poll ~2.5s da bir marta → 10 daqiqaga yetadi
const WINDOW_SECONDS = 60 * 60;

export default async (request: Request, _context: Context): Promise<Response> => {
  try {
    if (request.method === 'POST') return await start(request);
    if (request.method === 'GET') return await poll(request);
    return error('Faqat GET yoki POST', 405);
  } catch (err) {
    await logToAdmin('auth-start', err);
    return error('Tizimda xatolik. Birozdan so‘ng urinib ko‘ring.', 500);
  }
};

async function start(request: Request): Promise<Response> {
  const limit = await hitLimit(`kod-olish#${clientIp(request)}`, MAX_START_PER_IP, WINDOW_SECONDS);
  if (!limit.ok) return tooMany(limit.retryAfter);

  const session = await createLoginSession();
  const deepLink = `https://t.me/${BOT_USERNAME}?start=${LOGIN_PREFIX}${session.nonce}`;
  return json({ nonce: session.nonce, deepLink }, 200, { 'cache-control': 'no-store' });
}

async function poll(request: Request): Promise<Response> {
  const nonce = new URL(request.url).searchParams.get('nonce') ?? '';
  if (!isNonce(nonce)) return error('nonce noto‘g‘ri');

  const limit = await hitLimit(`kod-poll#${clientIp(request)}`, MAX_POLL_PER_IP, WINDOW_SECONDS);
  if (!limit.ok) return tooMany(limit.retryAfter);

  const session = await readLoginSession(nonce);
  if (!session) return json({ status: 'expired' }, 200, { 'cache-control': 'no-store' });

  // "ready" bo'lsa telefonni beramiz — sayt raqamni oldindan to'ldiradi.
  // Kod (OTP) baribir kiritiladi, shuning uchun bu maxfiylikni buzmaydi:
  // nonce faqat havolani bosgan bemorning o'zida.
  return json(
    session.status === 'ready'
      ? { status: 'ready', phone: session.phone ?? null }
      : { status: 'pending' },
    200,
    { 'cache-control': 'no-store' },
  );
}
