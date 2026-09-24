import type { Context } from '@netlify/functions';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, isAdmin, type DoctorRecord } from './lib/auth.ts';
import { doctorDayKey } from './lib/slots.ts';
import {
  appointmentsOnDate,
  holdsSlot,
  type Appointment,
  type AppointmentStatus,
} from './lib/appointments.ts';
import { isDateKey, toTashkent, addDays, type DateKey } from './lib/time.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * Admin — klinikadagi barcha navbatlar va hisobot.
 *
 *   GET  /api/admin-appointments?date=YYYY-MM-DD
 *        — bir kunning barcha shifokorlar bo'yicha navbatlari.
 *   GET  /api/admin-appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *        — davr hisoboti: holatlar, daromad, shifokorlar kesimi.
 *   POST /api/admin-appointments { doctorId, date, time, reason? }
 *        — klinika navbatni bekor qiladi va bemorga bot orqali xabar beradi.
 *
 * Shifokor o'z kunini `doctor-schedule` da ko'radi; bu yerda esa ega
 * butun klinikani bir joyda ko'radi — telefon qilgan bemorni topish,
 * kelmaganlarni sanash va kunlik tushumni bilish uchun.
 */

/** Hisobot oynasi: bundan uzoq davr bir so'rovda o'qilmaydi. */
const MAX_RANGE_DAYS = 92;

/** Telefon raqami ega uchun to'liq ko'rinadi — bemorga qo'ng'iroq qilish uchun. */
type Row = {
  doctorId: string;
  doctorName: string;
  date: DateKey;
  time: string;
  status: AppointmentStatus;
  patientName: string;
  phone: string;
  price: number;
  /** slotni band qilib turibdimi (muddati o'tgan hold — yo'q) */
  active: boolean;
  createdAt: string;
};

type Body = { doctorId?: unknown; date?: unknown; time?: unknown; reason?: unknown };

export default async (request: Request, _context: Context): Promise<Response> => {
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);
  if (!isAdmin(session)) {
    return json({ error: 'Bu bo‘lim faqat administrator uchun', telegramId: session.userId }, 403);
  }

  try {
    if (request.method === 'GET') return await read(request);
    if (request.method === 'POST') return await cancel((await request.json().catch(() => ({}))) as Body);
    return error('Faqat GET yoki POST', 405);
  } catch (err) {
    await logToAdmin('admin-appointments', err);
    return error('Navbatlarni o‘qishda xatolik', 500);
  }
};

async function doctorNames(): Promise<Map<string, string>> {
  const { Items = [] } = await db.send(new ScanCommand({ TableName: TABLES.doctors }));
  return new Map((Items as DoctorRecord[]).map((d) => [d.doctor_id, d.name]));
}

const toRow = (a: Appointment, names: Map<string, string>, now: Date): Row => ({
  doctorId: a.doctor_id,
  doctorName: names.get(a.doctor_id) ?? a.doctor_id,
  date: a.date,
  time: a.time,
  status: a.status,
  patientName: a.patient_name ?? '',
  phone: a.phone ?? '',
  price: a.price ?? 0,
  active: holdsSlot(a, now),
  createdAt: a.created_at ?? '',
});

/*
  Hisob-kitob bir joyda: kun ro'yxati ham, davr hisoboti ham shu
  guruhlashdan foydalanadi — raqamlar ikki joyda ikki xil chiqmasin.
*/
type Stats = {
  total: number;
  kutilmoqda: number;
  bolibOtdi: number;
  kelmadi: number;
  bekor: number;
  /** qabul bo'lib o'tganlar summasi — haqiqiy tushum */
  tushum: number;
  /** hali oldinda turgan, kuchdagi bronlar summasi */
  kutilayotganPul: number;
};

function summarize(rows: Row[]): Stats {
  const s: Stats = {
    total: 0,
    kutilmoqda: 0,
    bolibOtdi: 0,
    kelmadi: 0,
    bekor: 0,
    tushum: 0,
    kutilayotganPul: 0,
  };
  for (const r of rows) {
    // Muddati o'tgan hold — bemor to'lovni tashlab ketgan, u navbat emas.
    if (r.status === 'hold' && !r.active) continue;
    s.total++;
    if (r.status === 'done') {
      s.bolibOtdi++;
      s.tushum += r.price;
    } else if (r.status === 'no_show') {
      s.kelmadi++;
    } else if (r.status === 'paid' || r.status === 'booked' || r.status === 'hold') {
      s.kutilmoqda++;
      s.kutilayotganPul += r.price;
    } else {
      s.bekor++;
    }
  }
  return s;
}

async function read(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const today = toTashkent(new Date()).dateKey;
  const now = new Date();

  const from = params.get('from');
  const to = params.get('to');

  if (from || to) {
    const start = from ?? today;
    const end = to ?? today;
    if (!isDateKey(start) || !isDateKey(end)) {
      return error('from va to YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
    }
    if (end < start) return error('to sanasi from dan oldin bo‘lmasligi kerak');
    if (addDays(start, MAX_RANGE_DAYS) < end) {
      return error(`Bir so‘rovda ko‘pi bilan ${MAX_RANGE_DAYS} kun`);
    }

    const names = await doctorNames();
    const days: DateKey[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

    const perDay = await Promise.all(days.map((day) => appointmentsOnDate(day).catch(() => [])));
    const rows = perDay.flat().map((a) => toRow(a, names, now));

    const byDoctor = [...names.keys()]
      .map((id) => ({
        doctorId: id,
        doctorName: names.get(id) ?? id,
        ...summarize(rows.filter((r) => r.doctorId === id)),
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);

    const byDay = days.map((day, i) => ({
      date: day,
      ...summarize(perDay[i]!.map((a) => toRow(a, names, now))),
    }));

    return json(
      { from: start, to: end, today, stats: summarize(rows), byDoctor, byDay },
      200,
      { 'cache-control': 'private, no-store' },
    );
  }

  const date = params.get('date') ?? today;
  if (!isDateKey(date)) return error('date YYYY-MM-DD ko‘rinishida bo‘lishi kerak');

  const [names, found] = await Promise.all([doctorNames(), appointmentsOnDate(date)]);
  const appointments = found
    .map((a) => toRow(a, names, now))
    .sort((a, b) => a.time.localeCompare(b.time) || a.doctorName.localeCompare(b.doctorName));

  return json({ date, today, appointments, stats: summarize(appointments) }, 200, {
    'cache-control': 'private, no-store',
  });
}

const CANCELLABLE: ReadonlySet<string> = new Set(['hold', 'paid', 'booked']);
const DEFAULT_REASON = 'Klinika bekor qildi';

/**
 * Klinika bitta navbatni bekor qiladi (bemor qo'ng'iroq qilib so'raganda
 * yoki shifokor kuni o'zgarganda). Shart — holat biz o'qiganidan
 * o'zgarmagan bo'lishi: shu orada bemor o'zi ko'chirgan bo'lsa tegmaymiz.
 */
async function cancel(body: Body): Promise<Response> {
  const doctorId = typeof body.doctorId === 'string' ? body.doctorId.trim() : '';
  const date = typeof body.date === 'string' ? body.date : '';
  const time = typeof body.time === 'string' ? body.time.trim() : '';
  const reason = (typeof body.reason === 'string' ? body.reason.trim() : '') || DEFAULT_REASON;

  if (!doctorId || !time) return error('doctorId va time kerak');
  if (!isDateKey(date)) return error('date YYYY-MM-DD ko‘rinishida bo‘lishi kerak');

  const now = new Date();
  const found = (await appointmentsOnDate(date)).find(
    (a) => a.doctor_id === doctorId && a.time === time,
  );
  if (!found) return error('Bunday navbat yo‘q', 404);
  if (!CANCELLABLE.has(found.status)) {
    return error('Bu navbatni bekor qilib bo‘lmaydi — u allaqachon yopilgan');
  }

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: { doctor_day: doctorDayKey(doctorId, date), time },
        UpdateExpression: 'SET #s = :cancelled, off_reason = :reason, updated_at = :now',
        ConditionExpression: '#s = :was',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':cancelled': 'cancelled_by_clinic',
          ':reason': reason,
          ':now': now.toISOString(),
          ':was': found.status,
        },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return error('Navbat holati shu orada o‘zgardi — sahifani yangilang', 409);
    }
    throw err;
  }

  let notified = false;
  if (found.telegram_id) {
    try {
      await sendMessage(
        found.telegram_id,
        `⚠️ <b>Qabul bekor qilindi</b>\n\n` +
          `Sana: ${date}, soat ${time}\n` +
          `Sabab: ${escapeHtml(reason)}\n\n` +
          `Uzr so'raymiz. Boshqa vaqtga yozilish uchun shaxsiy ` +
          `kabinetingizga kiring.`,
      );
      notified = true;
    } catch (err) {
      // Xabar ketmasa ham bekor qilish kuchda — ega buni ko'rib turadi.
      await logToAdmin('admin-appointments/xabar', err);
    }
  }

  return json({ ok: true, doctorId, date, time, reason, notified });
}
