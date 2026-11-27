import type { Context } from '@netlify/functions';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import {
  checkPatientName,
  isVisitDay,
  ruleOf,
  tashkentToday,
  textOf,
  upcomingByPhone,
  addDaysKey,
  BOOKING_HORIZON_DAYS,
  VISITING_ID_RE,
  type VisitingBooking,
  type VisitingDoctorRecord,
} from './lib/visiting.ts';
import { doctorDayKey, isBookable, isValidSlot } from './lib/slots.ts';
import { isDateKey, isTime, toInstant } from './lib/time.ts';
import { parsePhone } from './lib/phone.ts';
import { hitLimit, clientIp } from './lib/rate-limit.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { isLang } from '../../src/data/i18n.ts';

/**
 * POST /api/visiting-book — tashrif shifokoriga yozilish.
 *
 *   { doctor, date, time, name, phone, lang }
 *
 * Kirish (Telegram) talab qilinmaydi: odam ismi va telefonini yozadi.
 * Onlayn to'lov yo'q — yozilish bepul, qabul narxi klinika kassasida
 * olinadi (javobda `price`).
 *
 * Slot DynamoDB shartli yozuvi bilan atomik band qilinadi: ikki kishi
 * bir vaqtni bir zumda tanlasa, ikkinchisi 409 oladi.
 *
 * Suiiste'molga qarshi: IP bo'yicha soatiga 8 ta urinish, bitta raqamda
 * bir vaqtda 3 tadan ko'p kelgusi yozuv bo'lmaydi va bitta shifokorga
 * bir kunda bitta yozuv; `website` — botlar to'ldiradigan yashirin maydon.
 */
const MAX_PER_IP_HOUR = 8;
const MAX_UPCOMING_PER_PHONE = 3;

/**
 * Xato javobi: `code` — brauzer xabarni tanlangan tilda ko'rsatishi uchun
 * (`src/data/visiting-i18n.ts`), `error` — o'zbekcha matn (zaxira).
 */
const fail = (code: string, message: string, status = 400): Response => json({ error: message, code }, status);

type Body = {
  doctor?: unknown;
  date?: unknown;
  time?: unknown;
  name?: unknown;
  phone?: unknown;
  lang?: unknown;
  website?: unknown;
};

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail('bad_request', 'So‘rov noto‘g‘ri');
  }

  // Yashirin maydon to'ldirilgan — odam emas.
  if (typeof body.website === 'string' && body.website.trim()) return fail('bad_request', 'So‘rov rad etildi');

  const doctorId = String(body.doctor ?? '');
  const date = String(body.date ?? '');
  const time = String(body.time ?? '');
  if (!VISITING_ID_RE.test(doctorId)) return fail('bad_request', 'Shifokor tanlanmagan');
  if (!isDateKey(date) || !isTime(time)) return fail('bad_slot', 'Kun yoki vaqt noto‘g‘ri');

  const name = checkPatientName(body.name);
  if (!name.ok) return fail('name', 'Ism-familiyangizni to‘liq yozing (2–80 harf)', 422);
  const phone = parsePhone(body.phone);
  if (!phone.ok) return fail('phone', phone.error, 422);
  const lang = isLang(body.lang) ? body.lang : 'uz';

  try {
    const rate = await hitLimit(`tashrif#${clientIp(request)}`, MAX_PER_IP_HOUR, 60 * 60);
    if (!rate.ok) {
      const minutes = Math.max(1, Math.ceil(rate.retryAfter / 60));
      return fail('rate', `Juda ko‘p urinish. ${minutes} daqiqadan so‘ng qayta urinib ko‘ring.`, 429);
    }

    const found = await db.send(
      new GetCommand({ TableName: TABLES.visitingDoctors, Key: { doctor_id: doctorId } }),
    );
    const doctor = found.Item as VisitingDoctorRecord | undefined;
    if (!doctor || doctor.active === false) return fail('not_found', 'Shifokor topilmadi', 404);

    const now = new Date();
    const today = tashkentToday(now);
    if (date < today || date > addDaysKey(today, BOOKING_HORIZON_DAYS)) {
      return fail('bad_slot', 'Bu kunga yozilib bo‘lmaydi — boshqa kunni tanlang');
    }
    if (!isVisitDay(ruleOf(doctor), date)) return fail('bad_slot', 'Shifokor bu kuni kelmaydi');
    if (!isValidSlot(doctor.shifts, doctor.slot_minutes, time)) return fail('bad_slot', 'Bunday qabul vaqti yo‘q');
    if (!isBookable(date, time, now)) {
      return fail('too_soon', 'Qabulga 1 soatdan kam qoldi — boshqa vaqtni tanlang', 409);
    }

    const upcoming = await upcomingByPhone(phone.value, now);
    if (upcoming.some((b) => b.doctor_id === doctorId && b.date === date)) {
      return fail('duplicate', 'Bu raqamdan shu kunga allaqachon yozilgansiz', 409);
    }
    if (upcoming.length >= MAX_UPCOMING_PER_PHONE) {
      return fail(
        'limit',
        `Bu raqamda ${upcoming.length} ta kelgusi yozuv bor — bir vaqtda ${MAX_UPCOMING_PER_PHONE} tadan ko‘p bo‘lmaydi. Klinikaga qo‘ng‘iroq qiling.`,
        409,
      );
    }

    const item: VisitingBooking = {
      doctor_day: doctorDayKey(doctorId, date),
      time,
      doctor_id: doctorId,
      date,
      starts_at: toInstant(date, time).toISOString(),
      name: name.value,
      phone: phone.value,
      status: 'booked',
      price: doctor.price,
      doctor_name: textOf(doctor.name, 'uz'),
      specialty: textOf(doctor.specialty, 'uz'),
      lang,
      created_at: now.toISOString(),
    };

    try {
      await db.send(
        new PutCommand({
          TableName: TABLES.visitingBookings,
          Item: item,
          // Bo'sh slot yoki bekor qilingan yozuv o'rnigagina yoziladi.
          ConditionExpression: 'attribute_not_exists(doctor_day) OR #s = :cancelled',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':cancelled': 'cancelled' },
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return fail('taken', 'Bu vaqt hozirgina band qilindi — boshqa vaqtni tanlang', 409);
      }
      throw err;
    }

    return json({
      ok: true,
      booking: {
        doctor: doctorId,
        doctorName: textOf(doctor.name, lang),
        specialty: textOf(doctor.specialty, lang),
        date,
        time,
        price: doctor.price,
        name: name.value,
        phone: phone.value,
      },
    });
  } catch (err) {
    await logToAdmin('visiting-book', err);
    return fail('server', 'Yozilishda xatolik. Birozdan so‘ng urinib ko‘ring yoki klinikaga qo‘ng‘iroq qiling.', 500);
  }
};
