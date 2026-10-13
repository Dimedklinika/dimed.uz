import type { Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, doctorFor } from './lib/auth.ts';
import { doctorDayKey, slotTimes, type Shift } from './lib/slots.ts';
import { checkShifts } from './lib/schedule.ts';
import { dayAppointments, holdsSlot, type Appointment } from './lib/appointments.ts';
import { isDateKey, toTashkent, addDays } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

const DEFAULT_REASON = 'Shifokor ishga chiqa olmadi';
const DEFAULT_HOURS_REASON = 'Shifokorning ish vaqti o‘zgardi';
/** Bir so'rovda eng ko'pi bilan shuncha kun (ta'til uchun yetarli). */
const MAX_RANGE_DAYS = 60;

type Body = {
  date?: string;
  /** Sana oralig'i (ta'til): `from` dan `to` gacha, ikkalasi ham kiradi. */
  from?: string;
  to?: string;
  reason?: string;
  /** Berilsa kun yopilmaydi — shu kunlarda boshqa vaqtda ishlanadi. */
  shifts?: Shift[];
};

/**
 * POST /api/doctor-off — «ishga chiqa olmayman» va «boshqa vaqtda ishlayman».
 *
 * Bir kun (`date`) yoki bir necha kun (`from`..`to`, ta'til) uchun ishlaydi.
 *
 * - `shifts` yo'q: kunlar dam olishga o'tkaziladi, o'sha kunlarning barcha
 *   navbatlari bekor qilinadi va har bir bemorga bot orqali uzr xabari
 *   yuboriladi. Bekor qilingan slotlar bo'shaydi — bemorlar boshqa kunga
 *   yozila oladi.
 * - `shifts` bor: kunlar uchun alohida jadval qo'yiladi. Yangi vaqtga
 *   to'g'ri kelmaydigan navbatlargina bekor qilinadi (bemorga xabar bilan),
 *   qolganlari joyida turadi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);

  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    const doctor = await doctorFor(session);
    if (!doctor) return error('Bu bo‘lim faqat shifokorlar uchun', 403);

    const body = (await request.json().catch(() => ({}))) as Body;
    const today = toTashkent(new Date()).dateKey;
    const from = body.from ?? body.date ?? today;
    const to = body.to ?? from;
    const hours = body.shifts !== undefined;
    const reason = body.reason?.trim() || (hours ? DEFAULT_HOURS_REASON : DEFAULT_REASON);

    if (!isDateKey(from) || !isDateKey(to)) return error('Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
    if (from < today) return error('O‘tgan kunni o‘zgartirib bo‘lmaydi');
    if (to < from) return error('Oxirgi sana boshlanish sanasidan oldin bo‘lmasin');
    if (to > addDays(today, 90)) return error('90 kundan uzoqqa jadval kiritib bo‘lmaydi');

    const days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    if (days.length > MAX_RANGE_DAYS) {
      return error(`Bir marta ko‘pi bilan ${MAX_RANGE_DAYS} kun kiritish mumkin`);
    }

    let shifts: Shift[] | null = null;
    if (hours) {
      const checked = checkShifts(body.shifts);
      if (!checked.ok) return error(checked.message);
      shifts = checked.shifts;
    }

    const now = new Date();
    let cancelled = 0;
    let notified = 0;
    for (const date of days) {
      const result = shifts
        ? await changeHours(doctor, date, shifts, reason, now)
        : await closeDay(doctor, date, reason, now);
      cancelled += result.cancelled;
      notified += result.notified;
    }

    return json({
      ok: true,
      date: from,
      from,
      to,
      days: days.length,
      reason,
      cancelled,
      notified,
    });
  } catch (err) {
    await logToAdmin('doctor-off', err);
    return error('Kunni bekor qilishda xatolik. Birozdan so‘ng urinib ko‘ring.', 500);
  }
};

type DoctorRow = NonNullable<Awaited<ReturnType<typeof doctorFor>>>;

type DayResult = { cancelled: number; notified: number };

/** Bir kunni yopadi: navbatlar bekor qilinadi, bemorlarga xabar ketadi. */
async function closeDay(
  doctor: DoctorRow,
  date: string,
  reason: string,
  now: Date,
): Promise<DayResult> {
  /*
    Avval kun yopiladi — shundan keyin bekor qilish davomida yangi
    bemor bo'shab qolgan slotni ololmaydi.
  */
  await db.send(
    new UpdateCommand({
      TableName: TABLES.schedules,
      Key: { doctor_id: doctor.doctor_id, date },
      UpdateExpression: 'SET day_off = :on, shifts = :none, off_reason = :reason, updated_at = :now',
      ExpressionAttributeValues: {
        ':on': true,
        ':none': [],
        ':reason': reason,
        ':now': now.toISOString(),
      },
    }),
  );

  return cancelAppointments(doctor, date, reason, now, () => true);
}

/**
 * Kun uchun alohida smena qo'yadi (kun ochiq qoladi). Yangi smenaga
 * to'g'ri kelmaydigan navbatlar bekor qilinadi.
 */
async function changeHours(
  doctor: DoctorRow,
  date: string,
  shifts: Shift[],
  reason: string,
  now: Date,
): Promise<DayResult> {
  await db.send(
    new UpdateCommand({
      TableName: TABLES.schedules,
      Key: { doctor_id: doctor.doctor_id, date },
      // `off_reason` olib tashlanadi: kun yopiq emas, eski sabab qolib ketmasin.
      UpdateExpression:
        'SET day_off = :off, shifts = :shifts, updated_at = :now REMOVE off_reason',
      ExpressionAttributeValues: { ':off': false, ':shifts': shifts, ':now': now.toISOString() },
    }),
  );

  const keep = new Set(slotTimes(shifts, doctor.slot_minutes));
  return cancelAppointments(doctor, date, reason, now, (a) => !keep.has(a.time));
}

async function cancelAppointments(
  doctor: DoctorRow,
  date: string,
  reason: string,
  now: Date,
  shouldCancel: (appointment: Appointment) => boolean,
): Promise<DayResult> {
  const active = (await dayAppointments(doctor.doctor_id, date)).filter(
    (a) => holdsSlot(a, now) && shouldCancel(a),
  );

  let cancelled = 0;
  let notified = 0;
  for (const appointment of active) {
    if (!(await cancel(doctor.doctor_id, date, appointment, now))) continue;
    cancelled++;
    if (await tellPatient(appointment, doctor.name, date, reason)) notified++;
  }
  return { cancelled, notified };
}

/**
 * Bitta yozuvni bekor qiladi. Shart — holat biz o'qiganidan
 * o'zgarmagan bo'lishi: shu orada bemor vaqtini ko'chirgan bo'lsa,
 * uning yangi navbatiga tegmaymiz.
 */
async function cancel(
  doctorId: string,
  date: string,
  appointment: Appointment,
  now: Date,
): Promise<boolean> {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: { doctor_day: doctorDayKey(doctorId, date), time: appointment.time },
        UpdateExpression: 'SET #s = :cancelled, updated_at = :now',
        ConditionExpression: '#s = :was',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':cancelled': 'cancelled_by_clinic',
          ':now': now.toISOString(),
          ':was': appointment.status,
        },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

/** Uzr xabari. Bittasi ketmasa ham qolganlariga yuborishda davom etamiz. */
async function tellPatient(
  appointment: Appointment,
  doctorName: string,
  date: string,
  reason: string,
): Promise<boolean> {
  if (!appointment.telegram_id) return false;

  try {
    await sendMessage(
      appointment.telegram_id,
      `⚠️ <b>Qabul bekor qilindi</b>\n\n` +
        `Shifokor: ${escapeHtml(doctorName)}\n` +
        `Sana: ${date}, soat ${appointment.time}\n` +
        `Sabab: ${escapeHtml(reason)}\n\n` +
        `Uzr so'raymiz. Boshqa vaqtga yozilish uchun saytdagi shaxsiy ` +
        `kabinetingizga kiring — to'lov qilingan bo'lsa u saqlanadi.`,
    );
    return true;
  } catch (err) {
    await logToAdmin('doctor-off/xabar', err);
    return false;
  }
}
