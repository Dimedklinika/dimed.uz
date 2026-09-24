/**
 * "Kodni olish" kirish sessiyasi (A-auth UX).
 *
 * Muammo: bemorlar kod olish va kirishda chalkashardi — botga o'tib,
 * qaytib, raqamni qidirib topib, kodni kiritish uch alohida qadam edi.
 *
 * Yechim: saytda "Kodni olish" bosilganda qisqa umrli **nonce** ochiladi
 * va bemor `https://t.me/dimedcbot?start=kirish_<nonce>` havolasi orqali
 * botga o'tadi. Bot `/start` dagi nonce'ni ko'rib telefonni sessiyaga
 * yozadi va kodni yuboradi; sayt esa nonce'ni poll qilib turib, kod
 * kiritish maydonini avtomatik ochadi va raqamni oldindan to'ldiradi.
 * Kod (OTP) baribir kiritiladi — xavfsizlik chegarasi o'zgarmaydi,
 * faqat qadamlar chalkashligi yo'qoladi.
 *
 * Yozuv vaqtinchalik: `dimed_login_sessions`, TTL bilan o'zi o'chadi
 * (bemor ma'lumoti bu yerda saqlanmaydi).
 */
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'node:crypto';
import { db, TABLES } from './db.ts';

export const LOGIN_TTL_SECONDS = 10 * 60;
/** Telegram `/start` parametridagi belgi — kirish nonce'sini ajratadi. */
export const LOGIN_PREFIX = 'kirish_';

export type LoginStatus = 'pending' | 'ready';

export type LoginSession = {
  nonce: string;
  status: LoginStatus;
  phone?: string;
  telegram_id?: string;
  created_at: number;
  expires_at: number;
};

/** Telegram start-parametriga sig'adigan nonce (faqat A–Z a–z 0–9 _ -). */
export const newNonce = (): string => randomBytes(18).toString('base64url');

/** Nonce shakli to'g'rimi (poll va bot ikkalasi tekshiradi). */
export const isNonce = (value: string): boolean => /^[A-Za-z0-9_-]{16,64}$/.test(value);

/** Yangi kirish sessiyasini ochadi. */
export async function createLoginSession(): Promise<LoginSession> {
  const now = Math.floor(Date.now() / 1000);
  const session: LoginSession = {
    nonce: newNonce(),
    status: 'pending',
    created_at: now,
    expires_at: now + LOGIN_TTL_SECONDS,
  };
  await db.send(new PutCommand({ TableName: TABLES.loginSessions, Item: session }));
  return session;
}

/** Nonce bo'yicha sessiyani o'qiydi; yo'q yoki eskirgan bo'lsa — null. */
export async function readLoginSession(nonce: string): Promise<LoginSession | null> {
  if (!isNonce(nonce)) return null;
  const { Item } = await db.send(
    new GetCommand({ TableName: TABLES.loginSessions, Key: { nonce } }),
  );
  const session = Item as LoginSession | undefined;
  if (!session) return null;
  // TTL o'chirishi kechikishi mumkin — muddatni o'zimiz ham tekshiramiz.
  if (session.expires_at < Math.floor(Date.now() / 1000)) return null;
  return session;
}

/**
 * Bot nonce'ni tanigach: telefonni yozadi, holatni "ready" qiladi.
 * Sayt poll qilib shuni ko'rib kod maydonini ochadi.
 */
export async function markLoginReady(nonce: string, phone: string, telegramId: string): Promise<void> {
  if (!isNonce(nonce)) return;
  const now = Math.floor(Date.now() / 1000);
  await db.send(
    new UpdateCommand({
      TableName: TABLES.loginSessions,
      Key: { nonce },
      // Faqat sayt ochgan (mavjud) nonce'ni to'ldiramiz: begona/eski
      // havola bo'sh yozuv qoldirmasin.
      ConditionExpression: 'attribute_exists(nonce)',
      UpdateExpression: 'SET #s = :ready, phone = :p, telegram_id = :t, expires_at = :e',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':ready': 'ready',
        ':p': phone,
        ':t': telegramId,
        ':e': now + LOGIN_TTL_SECONDS,
      },
    }),
  ).catch(() => {
    // attribute_exists rad etsa (nonce yo'q/eskirgan) — jimgina o'tamiz:
    // bemor baribir botdan kelgan kodni qo'lda kirita oladi.
  });
}

/**
 * Telegram `/start` matnidan kirish nonce'sini ajratadi.
 * `/start kirish_<nonce>` yoki `/start@bot kirish_<nonce>`; boshqasi — null.
 */
export function loginNonceFromStart(text: string | undefined): string | null {
  const m = (text ?? '').match(/^\/start(?:@\w+)?\s+(\S+)/);
  const param = m?.[1];
  if (!param || !param.startsWith(LOGIN_PREFIX)) return null;
  const nonce = param.slice(LOGIN_PREFIX.length);
  return isNonce(nonce) ? nonce : null;
}
