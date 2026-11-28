import { sessionFrom, isAdmin } from './auth.ts';
import { json, error } from './http.ts';

/**
 * Tashrif shifokorlari, yozilganlar va rasmlar API'lari uchun ruxsat.
 *
 * Bu bo'limlar `/kabinet/admin` ichida — kirish ham o'sha: Telegram orqali
 * (OTP kod, `auth-verify.ts`: bitta kodga 5 urinish, raqamga va IP ga
 * soatlik cheklov), imzolangan HttpOnly `dimed_session` cookie va
 * `ADMIN_TELEGRAM_IDS` ro'yxati (`lib/auth.ts` → `isAdmin`). Alohida parol
 * yo'q: avvalgi `/admin` paneli shu yerga ko'chirildi.
 *
 * Har so'rovda tekshiriladi:
 *  - o'zgartiruvchi so'rov (POST/PATCH/DELETE) shu saytdan kelganmi (CSRF);
 *  - sessiya bormi (401) va u admin'nikimi (403, javobda Telegram ID —
 *    egasi uni ADMIN_TELEGRAM_IDS ga qo'shishi uchun, boshqa admin
 *    sahifalaridagi kabi).
 */

/**
 * Begona saytdan yuborilgan so'rov emasmi (CSRF).
 *
 * Sessiya cookie'si `SameSite=Lax` — boshqa saytdagi forma yoki fetch'ga
 * brauzer uni qo'shmaydi. Qo'shimcha qatlam: brauzer aytgan `Sec-Fetch-Site`
 * va `Origin` sarlavhalari tekshiriladi (sarlavha yo'q bo'lsa — skript yoki
 * test, sessiya baribir kerak).
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

/** Admin endpointlari boshidagi tekshiruv. Ruxsat bo'lsa null, aks holda tayyor javob. */
export function requireAdmin(request: Request): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) {
    return error('Ruxsat etilmagan so‘rov', 403);
  }
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);
  if (!isAdmin(session)) {
    return json({ error: 'Bu bo‘lim faqat administrator uchun', telegramId: session.userId }, 403);
  }
  return null;
}
