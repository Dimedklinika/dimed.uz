import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './db.ts';
import { getDoctor, type DoctorRecord } from './auth.ts';
import { doctorDayKey } from './slots.ts';
import type { Appointment } from './appointments.ts';
import { botText, isLang, langFromTelegram, type Lang } from './i18n.ts';
import {
  sendMessage,
  answerCallbackQuery,
  editMessageReplyMarkup,
  logToAdmin,
  isTransientTelegramError,
  type ReplyMarkup,
} from './telegram.ts';

/**
 * Qabuldan keyin baho (G2).
 *
 * Oqim:
 *   1. Shifokor "Qabul qilindi" deb belgilaydi yoki qabul vaqti +
 *      davomiyligi o'tadi → `askRating` bemorga 1–5 yulduzli inline
 *      tugmalar bilan xabar yuboradi. Navbat yozuvida `rating_asked_at`
 *      qoladi — ikki marta so'ralmaydi.
 *   2. Bemor tugmani bosadi → `callback_query` → `saveRating`: baho
 *      `ratings` jadvaliga yoziladi, shifokor yozuvida yig'indi/son
 *      yangilanadi, bemor yozuvida `pending_rating` qoladi.
 *   3. Bemor javob yozsa — izoh o'sha bahoga biriktiriladi (24 soat
 *      ichida); "Izohsiz" tugmasi kutishni bekor qiladi.
 *
 * O'rtacha baho `doctors.rating_sum / rating_count` — faqat ko'rinadigan
 * baholar; admin bahoni yashirsa (F3) yig'indidan chiqariladi.
 */
export type RatingRow = {
  doctor_id: string;
  /** SK — baho qo'yilgan lahza (ISO). */
  created_at: string;
  /** "doctor_id#sana|vaqt" — qaysi navbat uchun. */
  appointment_key: string;
  date: string;
  time: string;
  phone: string;
  telegram_id: string;
  patient_name?: string;
  rating: number;
  comment?: string;
  hidden?: boolean;
  hidden_at?: string;
  lang?: Lang;
};

export type PendingRating = { doctor_id: string; created_at: string; until: string };

export const STARS = [1, 2, 3, 4, 5] as const;
const COMMENT_TTL_HOURS = 24;
const COMMENT_MAX = 500;
const RATE_PREFIX = 'r:';
export const SKIP_CALLBACK = 'rc:skip';

export const stars = (n: number): string => '⭐️'.repeat(Math.max(0, Math.min(5, n)));

const fmtDate = (dateKey: string): string => {
  const [y, m, d] = dateKey.split('-');
  return y && m && d ? `${d}.${m}.${y}` : dateKey;
};

/** Bemorning tili: sozlamalardagi, bo'lmasa Telegram tili, bo'lmasa uz. */
export async function userLang(telegramId: string, telegramCode?: string): Promise<Lang> {
  const found = await db.send(
    new GetCommand({ TableName: TABLES.users, Key: { telegram_id: telegramId } }),
  );
  const lang = (found.Item as { lang?: string } | undefined)?.lang;
  return isLang(lang) ? lang : langFromTelegram(telegramCode);
}

/** 1–5 tugma; callback_data 64 baytdan oshmaydi (id ≤ 40 belgi). */
export const starsKeyboard = (a: Pick<Appointment, 'doctor_id' | 'date' | 'time'>): ReplyMarkup => ({
  inline_keyboard: [
    STARS.map((n) => ({
      text: `${n} ⭐`,
      callback_data: `${RATE_PREFIX}${a.doctor_id}|${a.date}|${a.time}:${n}`,
    })),
  ],
});

export type RateCallback = { doctorId: string; date: string; time: string; n: number };

export function parseRateCallback(data: string): RateCallback | null {
  const m = data.match(/^r:([a-z0-9-]{2,40})\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2}):([1-5])$/);
  return m ? { doctorId: m[1]!, date: m[2]!, time: m[3]!, n: Number(m[4]) } : null;
}

/**
 * Bemordan baho so'raydi. Bir navbat uchun bir marta: `rating_asked_at`
 * shartli yoziladi, ustma-ust kelgan cron va "Qabul qilindi" tugmasi
 * ikkita xabar yubormaydi. false — so'ralmadi (allaqachon so'ralgan,
 * bemor kelmagan, Telegram yo'q).
 */
export async function askRating(a: Appointment, doctor?: DoctorRecord | null): Promise<boolean> {
  if (!a.telegram_id || a.rating_asked_at || a.rating !== undefined) return false;
  if (a.status !== 'done' && a.status !== 'paid' && a.status !== 'booked') return false;

  const key = { doctor_day: doctorDayKey(a.doctor_id, a.date), time: a.time };
  const stamp = new Date().toISOString();
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: key,
        UpdateExpression: 'SET rating_asked_at = :now',
        ConditionExpression: 'attribute_not_exists(rating_asked_at) AND #s = :was',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':now': stamp, ':was': a.status },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }

  try {
    const doc = doctor === undefined ? await getDoctor(a.doctor_id) : doctor;
    const lang = await userLang(a.telegram_id);
    await sendMessage(
      a.telegram_id,
      botText('rate.ask', lang, { doctor: doc?.name ?? 'Shifokor', date: fmtDate(a.date), time: a.time }),
      starsKeyboard(a),
    );
  } catch (err) {
    /*
      Xabar yetmadi (bot kaliti yaroqsiz, Telegram band) — belgi qaytariladi,
      keyingi cron qayta so'raydi. Bemor botni bloklagan bo'lsa belgi
      qoladi: qayta urinish foydasiz.
    */
    if (isTransientTelegramError(err)) {
      await db
        .send(
          new UpdateCommand({
            TableName: TABLES.appointments,
            Key: key,
            UpdateExpression: 'REMOVE rating_asked_at',
            ConditionExpression: 'rating_asked_at = :now',
            ExpressionAttributeValues: { ':now': stamp },
          }),
        )
        .catch(() => undefined);
    }
    throw err;
  }
  return true;
}

/**
 * Bahoni saqlaydi. 'expired' — navbat topilmadi, boshqa bemorniki,
 * bekor qilingan yoki allaqachon baholangan.
 */
export async function saveRating(
  input: RateCallback & { userId: string; lang: Lang },
): Promise<{ ok: true; row: RatingRow } | { ok: false }> {
  const key = { doctor_day: doctorDayKey(input.doctorId, input.date), time: input.time };
  const found = await db.send(new GetCommand({ TableName: TABLES.appointments, Key: key }));
  const a = found.Item as Appointment | undefined;
  if (!a || a.telegram_id !== input.userId) return { ok: false };
  if (a.status !== 'done' && a.status !== 'paid' && a.status !== 'booked') return { ok: false };

  const now = new Date().toISOString();
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: key,
        UpdateExpression: 'SET rating = :n, rated_at = :now',
        ConditionExpression: 'attribute_not_exists(rating) AND telegram_id = :who',
        ExpressionAttributeValues: { ':n': input.n, ':now': now, ':who': input.userId },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return { ok: false };
    throw err;
  }

  const row: RatingRow = {
    doctor_id: input.doctorId,
    created_at: now,
    appointment_key: `${key.doctor_day}|${key.time}`,
    date: a.date,
    time: a.time,
    phone: a.phone,
    telegram_id: input.userId,
    patient_name: a.patient_name,
    rating: input.n,
    hidden: false,
    lang: input.lang,
  };
  await db.send(new PutCommand({ TableName: TABLES.ratings, Item: row }));
  await adjustDoctorRating(input.doctorId, input.n, 1);

  const pending: PendingRating = {
    doctor_id: row.doctor_id,
    created_at: row.created_at,
    until: new Date(Date.now() + COMMENT_TTL_HOURS * 3_600_000).toISOString(),
  };
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: input.userId },
      UpdateExpression: 'SET pending_rating = :p',
      ExpressionAttributeValues: { ':p': pending },
    }),
  );
  return { ok: true, row };
}

/** Shifokor yozuvidagi yig'indi va sonni o'zgartiradi (yashirish — manfiy). */
export async function adjustDoctorRating(
  doctorId: string,
  deltaSum: number,
  deltaCount: number,
): Promise<void> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.doctors,
        Key: { doctor_id: doctorId },
        UpdateExpression:
          'SET rating_sum = if_not_exists(rating_sum, :z) + :s, rating_count = if_not_exists(rating_count, :z) + :c',
        ConditionExpression: 'attribute_exists(doctor_id)',
        ExpressionAttributeValues: { ':z': 0, ':s': deltaSum, ':c': deltaCount },
      }),
    );
  } catch (err) {
    // Shifokor yozuvi yo'q (o'chirilgan) — baho o'zi jadvalda qoladi.
    if (!(err instanceof ConditionalCheckFailedException)) throw err;
  }
}

/** Bemor yozgan matnni kutilayotgan bahoga izoh qilib biriktiradi. false — kutilmayotgan edi. */
export async function saveComment(userId: string, text: string): Promise<boolean> {
  const found = await db.send(
    new GetCommand({ TableName: TABLES.users, Key: { telegram_id: userId } }),
  );
  const pending = (found.Item as { pending_rating?: PendingRating } | undefined)?.pending_rating;
  if (!pending) return false;
  await clearPending(userId);
  if (pending.until < new Date().toISOString()) return false;

  const comment = text.trim().replace(/\s+/g, ' ').slice(0, COMMENT_MAX);
  if (!comment) return false;
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.ratings,
        Key: { doctor_id: pending.doctor_id, created_at: pending.created_at },
        UpdateExpression: 'SET #c = :c, comment_at = :now',
        ConditionExpression: 'attribute_exists(doctor_id)',
        ExpressionAttributeNames: { '#c': 'comment' },
        ExpressionAttributeValues: { ':c': comment, ':now': new Date().toISOString() },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
  return true;
}

export async function clearPending(userId: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: userId },
      UpdateExpression: 'REMOVE pending_rating',
    }),
  );
}

export type CallbackQuery = {
  id: string;
  from: { id: number; language_code?: string };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
};

/** Telegram inline tugmasi bosilganda (webhook'dan chaqiriladi). */
export async function handleRatingCallback(q: CallbackQuery): Promise<void> {
  const userId = String(q.from.id);
  const chatId = q.message?.chat.id ?? q.from.id;
  const lang = await userLang(userId, q.from.language_code);
  const data = q.data ?? '';

  const removeButtons = async () => {
    if (q.message) await editMessageReplyMarkup(chatId, q.message.message_id);
  };

  if (data === SKIP_CALLBACK) {
    await clearPending(userId);
    await answerCallbackQuery(q.id, botText('rate.comment.skipped', lang));
    await removeButtons();
    return;
  }

  const parsed = parseRateCallback(data);
  if (!parsed) {
    await answerCallbackQuery(q.id);
    return;
  }

  const saved = await saveRating({ ...parsed, userId, lang });
  if (!saved.ok) {
    await answerCallbackQuery(q.id, botText('rate.expired', lang));
    await removeButtons();
    return;
  }

  await answerCallbackQuery(q.id, botText('rate.saved.short', lang));
  await removeButtons();
  await sendMessage(chatId, botText('rate.thanks', lang, { stars: stars(parsed.n) }), {
    inline_keyboard: [[{ text: botText('rate.skip', lang), callback_data: SKIP_CALLBACK }]],
  });
}

/**
 * Oddiy matnli xabar — kutilayotgan bahoga izoh bo'lishi mumkin.
 * true — izoh sifatida qabul qilindi va bemorga javob ketdi.
 */
export async function handleRatingComment(
  chatId: number,
  userId: string,
  text: string,
  telegramCode?: string,
): Promise<boolean> {
  const saved = await saveComment(userId, text).catch(async (err) => {
    await logToAdmin('ratings/izoh', err);
    return false;
  });
  if (!saved) return false;
  await sendMessage(chatId, botText('rate.comment.saved', await userLang(userId, telegramCode)));
  return true;
}
