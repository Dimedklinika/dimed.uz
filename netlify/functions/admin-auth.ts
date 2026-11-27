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
import { clientIp } from './lib/rate-limit.ts';
import { checkLoginAllowed, clearIpFailures, recordLoginFailure } from './lib/login-guard.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * /admin paneliga kirish (parol bilan).
 *
 *   GET    /api/admin-auth             — { ok, configured }: kirganmi
 *   POST   /api/admin-auth {password}  — kirish, HttpOnly cookie (12 soat)
 *   DELETE /api/admin-auth             — chiqish
 *
 * Parolni taxmin qilishga qarshi (lib/login-guard.ts): bitta IP dan 15 daqiqada
 * 5 ta xato, hamma IP dan soatiga 100 ta xato — keyin blok; hisoblagich
 * ishlamasa kirish rad etiladi.
 */
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

    const ip = clientIp(request);
    const guard = await checkLoginAllowed(ip);
    if (!guard.ok) {
      if (guard.reason === 'unavailable') {
        return error('Kirishni hozir tekshirib bo‘lmadi. Birozdan so‘ng urinib ko‘ring.', 503);
      }
      const minutes = Math.max(1, Math.ceil(guard.retryAfter / 60));
      return json(
        { error: `Juda ko‘p noto‘g‘ri urinish. ${minutes} daqiqadan so‘ng qayta urinib ko‘ring.` },
        429,
        { ...noStore, 'retry-after': String(guard.retryAfter) },
      );
    }

    let password: unknown;
    try {
      password = ((await request.json()) as { password?: unknown }).password;
    } catch {
      return error('So‘rov noto‘g‘ri');
    }
    if (!checkPassword(password)) {
      await recordLoginFailure(ip);
      return error('Parol noto‘g‘ri', 401);
    }

    await clearIpFailures(ip);
    return json({ ok: true }, 200, { ...noStore, 'set-cookie': createAdminCookie() });
  } catch (err) {
    await logToAdmin('admin-auth', err);
    return error('Kirishda xatolik', 500);
  }
};
