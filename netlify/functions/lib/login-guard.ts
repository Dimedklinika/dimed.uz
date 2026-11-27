import { GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './db.ts';
import { logToAdmin } from './telegram.ts';

/**
 * /admin paroli uchun taxmin qilishga qarshi himoya.
 *
 * Umumiy `hitLimit` (lib/rate-limit.ts) bemor oqimlari uchun: u har
 * so'rovni sanaydi va baza xatosida o'tkazib yuboradi. Admin paroli uchun
 * qoida qattiqroq:
 *
 *  - faqat **noto'g'ri** urinishlar sanaladi (to'g'ri kirgan admin o'z
 *    limitini yemaydi);
 *  - bitta IP — 15 daqiqada 5 ta xato, keyin shu oyna tugaguncha blok;
 *  - hamma IP birga — soatiga 100 ta xato, keyin soat tugaguncha kirish
 *    yopiladi (ko'p IP dan taqsimlangan urinishga qarshi). Ochiq sessiyalar
 *    ishlayveradi; log-botga bir marta ogohlantirish ketadi;
 *  - hisoblagichni o'qib/yozib bo'lmasa — kirish **rad etiladi**
 *    (fail-closed): himoyasiz parol tekshiruvidan ko'ra vaqtinchalik
 *    "keyinroq urinib ko'ring" afzal.
 *
 * Yozuvlar `rate_limits` jadvalida (`admin-fail#...` kalitlari), TTL bilan
 * o'zi o'chadi.
 */
export const IP_MAX_FAILS = 5;
export const IP_WINDOW_SECONDS = 15 * 60;
export const GLOBAL_MAX_FAILS = 100;
export const GLOBAL_WINDOW_SECONDS = 60 * 60;

type Bucket = { key: string; max: number; expiresAt: number };

function buckets(ip: string, nowSec: number): { ip: Bucket; all: Bucket } {
  const ipStart = Math.floor(nowSec / IP_WINDOW_SECONDS) * IP_WINDOW_SECONDS;
  const allStart = Math.floor(nowSec / GLOBAL_WINDOW_SECONDS) * GLOBAL_WINDOW_SECONDS;
  return {
    ip: { key: `admin-fail#ip#${ip}#${ipStart}`, max: IP_MAX_FAILS, expiresAt: ipStart + IP_WINDOW_SECONDS },
    all: { key: `admin-fail#all#${allStart}`, max: GLOBAL_MAX_FAILS, expiresAt: allStart + GLOBAL_WINDOW_SECONDS },
  };
}

const hitsOf = async (key: string): Promise<number> => {
  const res = await db.send(new GetCommand({ TableName: TABLES.rateLimits, Key: { bucket: key } }));
  return Number((res.Item as { hits?: number } | undefined)?.hits ?? 0);
};

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: 'ip' | 'global'; retryAfter: number }
  | { ok: false; reason: 'unavailable' };

/** Parolni tekshirishdan OLDIN: shu IP yoki umuman kirish bloklanganmi. */
export async function checkLoginAllowed(ip: string, now = Date.now()): Promise<GuardResult> {
  const nowSec = Math.floor(now / 1000);
  const b = buckets(ip, nowSec);
  try {
    const [ipHits, allHits] = await Promise.all([hitsOf(b.ip.key), hitsOf(b.all.key)]);
    if (allHits >= b.all.max) return { ok: false, reason: 'global', retryAfter: b.all.expiresAt - nowSec };
    if (ipHits >= b.ip.max) return { ok: false, reason: 'ip', retryAfter: b.ip.expiresAt - nowSec };
    return { ok: true };
  } catch (err) {
    await logToAdmin('admin-kirish/limit', err);
    return { ok: false, reason: 'unavailable' };
  }
}

const bump = async (bucket: Bucket): Promise<number> => {
  const res = await db.send(
    new UpdateCommand({
      TableName: TABLES.rateLimits,
      Key: { bucket: bucket.key },
      UpdateExpression: 'SET hits = if_not_exists(hits, :zero) + :one, expires_at = :exp',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':exp': bucket.expiresAt },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return Number((res.Attributes as { hits?: number } | undefined)?.hits ?? 0);
};

/** Noto'g'ri paroldan keyin: ikkala hisoblagich oshadi. */
export async function recordLoginFailure(ip: string, now = Date.now()): Promise<void> {
  const b = buckets(ip, Math.floor(now / 1000));
  try {
    const [, all] = await Promise.all([bump(b.ip), bump(b.all)]);
    // Umumiy blok endigina yoqildi — egasiga bir marta xabar.
    if (all === b.all.max) {
      await logToAdmin(
        'admin-kirish',
        new Error(`/admin: soat ichida ${all} ta noto'g'ri parol — kirish soat oxirigacha yopildi (ochiq sessiyalar ishlaydi)`),
      );
    }
  } catch (err) {
    await logToAdmin('admin-kirish/limit', err);
  }
}

/** To'g'ri kirgandan keyin shu IP ning xatolari tozalanadi (umumiy hisob qoladi). */
export async function clearIpFailures(ip: string, now = Date.now()): Promise<void> {
  const b = buckets(ip, Math.floor(now / 1000));
  await db.send(new DeleteCommand({ TableName: TABLES.rateLimits, Key: { bucket: b.ip.key } })).catch(() => {});
}
