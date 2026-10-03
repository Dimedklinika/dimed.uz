import type { Context } from '@netlify/functions';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, doctorFor, isAdmin } from './lib/auth.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * GET /api/session — kim kirgan (header'dagi Kabinet menyusi uchun, C1).
 *
 * Sessiya cookie'si HttpOnly, brauzer uni o'qiy olmaydi — shuning
 * uchun bu yengil endpoint: ism, telefon va rollar (bemor / shifokor /
 * admin). Sessiya bo'lmasa 401 emas, { role: 'guest' } — menyu
 * mehmon uchun ham chiziladi.
 */

type UserRow = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  telegram_name?: string;
  name?: string;
  lang?: string;
};

/** Ko'rsatiladigan ism: 1C profili → to'liq ism → Telegram ismi. */
const displayName = (user: UserRow | undefined): string => {
  if (!user) return '';
  const fromParts = [user.last_name, user.first_name].filter(Boolean).join(' ');
  return fromParts || user.full_name || user.telegram_name || user.name || '';
};

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET') return error('Faqat GET', 405);

  const noStore = { 'cache-control': 'private, no-store' };
  const session = sessionFrom(request);
  if (!session) return json({ role: 'guest' }, 200, noStore);

  try {
    const [user, doctor] = await Promise.all([
      db
        .send(new GetCommand({ TableName: TABLES.users, Key: { telegram_id: session.userId } }))
        .then((r) => r.Item as UserRow | undefined)
        .catch(() => undefined),
      doctorFor(session).catch(() => null),
    ]);
    const admin = isAdmin(session);

    return json(
      {
        // Asosiy rol — menyuning birinchi bo'limi shunga qarab; qolganlari ham ko'rinadi.
        role: admin ? 'admin' : doctor ? 'doctor' : 'patient',
        admin,
        doctor: doctor ? { id: doctor.doctor_id, name: doctor.name, job: doctor.job } : null,
        phone: session.phone,
        name: displayName(user),
        lang: user?.lang ?? 'uz',
        // Til Sozlamalarda tanlanganmi (aks holda `lang` — shunchaki standart uz).
        langSaved: Boolean(user?.lang),
      },
      200,
      noStore,
    );
  } catch (err) {
    await logToAdmin('session', err);
    return error('Sessiyani o‘qib bo‘lmadi', 500);
  }
};
