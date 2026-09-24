import type { Context } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { createSessionCookie } from './lib/session.ts';
import { mergeIndividualProfile } from './lib/patients.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { parsePhone } from './lib/phone.ts';
import { hitLimit, tooMany, clientIp } from './lib/rate-limit.ts';

type Body = { phone?: string; code?: string };

/*
  Kod 6 xonali — taxmin qilish mumkin. Shuning uchun uch qatlam:
    1) bitta kodga nechta urinish (shu yerda, kod yozuvida);
    2) bitta raqamga soatiga nechta urinish;
    3) bitta IP dan soatiga nechta urinish (bir nechta raqamni
       ketma-ket sinab ko'rishga qarshi).
  Birinchisi eng muhimi va u qo'shimcha jadvalsiz ishlaydi — cheklov
  jadvali ishlamay qolsa ham (rate-limit ochiq yiqiladi).
*/
const MAX_CODE_ATTEMPTS = 5;
const MAX_PER_PHONE = 10;
const MAX_PER_IP = 30;
const WINDOW_SECONDS = 60 * 60;

type OtpRecord = { code: string; telegram_id: string; expires_at: number; attempts?: number };

/**
 * Urinishni kod taqqoslanishidan OLDIN band qiladi va kod yozuvini
 * qaytaradi; urinishlar tugagan yoki kod yo'q bo'lsa — null.
 *
 * Avval kod o'qilib, urinish taqqoslashdan keyin sanalardi: bir vaqtda
 * kelgan so'rovlarning hammasi eski hisobni ko'rib, har biri o'z
 * taxminini tekshirtirardi — "bitta kodga 5 urinish" parallel
 * so'rovlarda ishlamasdi. Endi shart bilan oshiriladi: har taxmin
 * tekshirilishidan oldin bittadan urinish yeydi.
 */
async function reserveAttempt(phone: string): Promise<OtpRecord | null> {
  try {
    const res = await db.send(
      new UpdateCommand({
        TableName: TABLES.otpCodes,
        Key: { phone },
        UpdateExpression: 'SET attempts = if_not_exists(attempts, :zero) + :one',
        // attribute_exists(code): kod yo'q bo'lsa kodsiz yozuv yaratilmasin.
        ConditionExpression:
          '(attribute_exists(code) AND attribute_not_exists(attempts)) OR ' +
          '(attribute_exists(code) AND attempts < :max)',
        ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':max': MAX_CODE_ATTEMPTS },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return res.Attributes as OtpRecord;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return null;
    throw err;
  }
}

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  try {
    const body = (await request.json()) as Body;
    if (!body.phone || !body.code) return error('Telefon raqami va kod kerak');

    // Raqam har xil yozilishi mumkin (bo'sh joy, chiziqcha, mamlakat
    // kodi bilan yoki usiz) — hammasi bitta kalitga keltiriladi.
    // Noto'g'ri raqam bazaga umuman bormaydi.
    const checked = parsePhone(body.phone);
    if (!checked.ok) return error(checked.error);
    const phone = checked.value;

    const perIp = await hitLimit(`kirish-ip#${clientIp(request)}`, MAX_PER_IP, WINDOW_SECONDS);
    if (!perIp.ok) return tooMany(perIp.retryAfter);
    const perPhone = await hitLimit(`kirish#${phone}`, MAX_PER_PHONE, WINDOW_SECONDS);
    if (!perPhone.ok) return tooMany(perPhone.retryAfter);
    const given = body.code.replace(/\D/g, '');
    if (given.length !== 6) return error('Kod 6 xonali bo‘lishi kerak');

    const record = await reserveAttempt(phone);

    // TTL o'chirishi kechikishi mumkin — muddatni o'zimiz ham tekshiramiz.
    if (!record || record.expires_at < Math.floor(Date.now() / 1000)) {
      return error('Kod eskirgan. Botdan yangi kod oling.', 401);
    }

    const a = Buffer.from(record.code);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      /*
        Chegaraga yetganda kodni kuydiramiz: shundan keyin botdan yangi
        kod olish kerak, ya'ni taxmin qilish uchun bemorning o'z
        Telegramiga kirish shart.
      */
      const used = Number(record.attempts ?? 1);
      if (used >= MAX_CODE_ATTEMPTS) {
        await db.send(new DeleteCommand({ TableName: TABLES.otpCodes, Key: { phone } }));
        return error('Juda ko‘p noto‘g‘ri urinish. Botdan yangi kod oling.', 401);
      }
      return error(`Kod noto‘g‘ri. Yana ${MAX_CODE_ATTEMPTS - used} ta urinish qoldi.`, 401);
    }

    // Kod bir marta ishlatiladi.
    await db.send(new DeleteCommand({ TableName: TABLES.otpCodes, Key: { phone } }));

    // Har kirishda 1C profili yangilanadi — 1C keyin yozgan bo'lsa ham
    // yetib keladi. Bu qulaylik, kirish sharti emas.
    await mergeIndividualProfile(phone, record.telegram_id).catch((err) =>
      logToAdmin('auth-verify/1c-profil', err),
    );

    return json(
      { ok: true },
      200,
      { 'set-cookie': createSessionCookie({ phone, userId: record.telegram_id }) },
    );
  } catch (err) {
    await logToAdmin('auth-verify', err);
    return error('Tizimda xatolik. Birozdan so‘ng urinib ko‘ring.', 500);
  }
};
