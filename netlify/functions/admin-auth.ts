import type { Context } from '@netlify/functions';
import {
  adminConfigured,
  checkPassword,
  clearAdminCookie,
  createAdminCookie,
  hasAdminSession,
  sameOrigin,
  MIN_PASSWORD_LENGTH,
} from './lib/admin-auth.ts';
import { hitLimit, clientIp } from './lib/rate-limit.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * /admin paneliga kirish (parol bilan).
 *
 *   GET    /api/admin-auth             — { ok, configured }: kirganmi
 *   POST   /api/admin-auth {password}  — kirish, HttpOnly cookie (12 soat)
 *   DELETE /api/admin-auth             — chiqish
 *
 * Parolni taxmin qilishga qarshi: bitta IP dan 15 daqiqada 10 ta urinish.
 */
const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;
const noStore = { 'cache-control': 'private, no-store' };

export default async (request: Request, _context: Context): Promise<Response> => {
  try {
    if (request.method === 'GET') {
      return json({ ok: hasAdminSession(request), configured: adminConfigured() }, 200, noStore);
    }

    if (!sameOrigin(request)) return error('Ruxsat etilmagan so‘rov', 403);

    if (request.method === 'DELETE') {
      return json({ ok: true }, 200, { ...noStore, 'set-cookie': clearAdminCookie() });
    }

    if (request.method !== 'POST') return error('Faqat GET, POST yoki DELETE', 405);

    if (!adminConfigured()) {
      return error(
        `Admin panel sozlanmagan: Netlify'da ADMIN_PASSWORD (kamida ${MIN_PASSWORD_LENGTH} belgi) qo‘shing va qayta deploy qiling`,
        503,
      );
    }

    const rate = await hitLimit(`admin-kirish#${clientIp(request)}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!rate.ok) {
      return error(`Juda ko‘p urinish. ${Math.ceil(rate.retryAfter / 60)} daqiqadan so‘ng qayta urinib ko‘ring.`, 429);
    }

    let password: unknown;
    try {
      password = ((await request.json()) as { password?: unknown }).password;
    } catch {
      return error('So‘rov noto‘g‘ri');
    }
    if (!checkPassword(password)) return error('Parol noto‘g‘ri', 401);

    return json({ ok: true }, 200, { ...noStore, 'set-cookie': createAdminCookie() });
  } catch (err) {
    await logToAdmin('admin-auth', err);
    return error('Kirishda xatolik', 500);
  }
};
