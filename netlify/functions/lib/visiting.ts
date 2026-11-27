import { TABLES, queryAllPages, scanAllPages } from './db.ts';
import { checkShifts } from './schedule.ts';
import { slotTimes, isBookable, doctorDayKey, type Shift } from './slots.ts';
import { keyFromUrl } from './media.ts';
import {
  isDateKeyStr,
  visitDates,
  isVisitDay,
  tashkentToday,
  addDaysKey,
  BOOKING_HORIZON_DAYS,
  MAX_VISIT_DATES,
  type I18nText,
  type PublicVisitingDoctor,
  type VisitRule,
} from '../../../src/lib/visiting.ts';

export {
  isDateKeyStr,
  visitDates,
  isVisitDay,
  tashkentToday,
  addDaysKey,
  BOOKING_HORIZON_DAYS,
  MAX_VISIT_DATES,
  type I18nText,
  type PublicVisitingDoctor,
};
export { textOf, checkPatientName } from '../../../src/lib/visiting.ts';

/**
 * Tashrif buyuruvchi shifokorlar — server tomoni: yozuv shakli,
 * admin kiritgan ma'lumotni tekshirish, bo'sh slotlarni hisoblash.
 */
export type VisitingDoctorRecord = {
  doctor_id: string;
  name: I18nText;
  specialty: I18nText;
  bio: I18nText;
  photo_url?: string;
  photo_key?: string;
  weekdays: number[];
  dates: string[];
  skip_dates: string[];
  shifts: Shift[];
  slot_minutes: number;
  price: number;
  /** Saytda ko'rinadimi. `false` — yashirilgan: karta chiqmaydi, yozilib bo'lmaydi. */
  active: boolean;
  /** Kartochkalar tartibi (kichigi oldin). */
  sort: number;
  created_at: string;
  updated_at: string;
};

export type BookingStatus = 'booked' | 'came' | 'no_show' | 'cancelled';
export const BOOKING_STATUSES: readonly BookingStatus[] = ['booked', 'came', 'no_show', 'cancelled'];
export const isBookingStatus = (v: unknown): v is BookingStatus =>
  typeof v === 'string' && (BOOKING_STATUSES as readonly string[]).includes(v);

export type VisitingBooking = {
  doctor_day: string;
  time: string;
  doctor_id: string;
  date: string;
  starts_at: string;
  name: string;
  phone: string;
  status: BookingStatus;
  price: number;
  doctor_name: string;
  specialty: string;
  lang: string;
  created_at: string;
  status_at?: string;
};

/** Qabul davomiyligi variantlari (daqiqa). */
export const VISIT_SLOT_MINUTES = [10, 15, 20, 30, 40, 45, 60, 90];

export const ruleOf = (d: Pick<VisitingDoctorRecord, 'weekdays' | 'dates' | 'skip_dates'>): VisitRule => ({
  weekdays: d.weekdays ?? [],
  dates: d.dates ?? [],
  skipDates: d.skip_dates ?? [],
});

/** Saytdagi shakl. O'tib ketgan alohida sanalar chiqarilmaydi. */
export function toPublicVisiting(d: VisitingDoctorRecord, today = tashkentToday()): PublicVisitingDoctor {
  // Kesh bir kungacha eskirishi mumkin — kechagi sanani ham qoldiramiz, brauzer o'zi saralaydi.
  const from = addDaysKey(today, -1);
  return {
    id: d.doctor_id,
    name: d.name,
    specialty: d.specialty,
    bio: d.bio ?? { uz: '' },
    photo: d.photo_url ?? '',
    weekdays: d.weekdays ?? [],
    dates: (d.dates ?? []).filter((x) => x >= from),
    skipDates: (d.skip_dates ?? []).filter((x) => x >= from),
    shifts: d.shifts,
    slotMinutes: d.slot_minutes,
    price: d.price,
  };
}

export async function listVisitingDoctors(): Promise<VisitingDoctorRecord[]> {
  const items = (await scanAllPages({ TableName: TABLES.visitingDoctors })) as VisitingDoctorRecord[];
  return items.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.uz.localeCompare(b.name.uz));
}

/** Bir kundagi yozilishlar (hammasi, bekor qilinganlari ham). */
export async function dayBookings(doctorId: string, date: string): Promise<VisitingBooking[]> {
  return (await queryAllPages({
    TableName: TABLES.visitingBookings,
    KeyConditionExpression: 'doctor_day = :k',
    ExpressionAttributeValues: { ':k': doctorDayKey(doctorId, date) },
  })) as VisitingBooking[];
}

/** Bekor qilinmagan yozuv slotni band qiladi (keldi / kelmadi ham — o'sha vaqt o'tib ketgan). */
export const holdsSlot = (b: Pick<VisitingBooking, 'status'>): boolean => b.status !== 'cancelled';

/** Kunning bo'sh vaqtlari — faqat bo'shlari; band qilinganlari umuman ko'rsatilmaydi. */
export function freeTimes(
  doctor: Pick<VisitingDoctorRecord, 'shifts' | 'slot_minutes'>,
  date: string,
  bookings: Pick<VisitingBooking, 'time' | 'status'>[],
  now: Date,
): string[] {
  const taken = new Set(bookings.filter(holdsSlot).map((b) => b.time));
  return slotTimes(doctor.shifts, doctor.slot_minutes).filter((t) => !taken.has(t) && isBookable(date, t, now));
}

/** Shu raqamning kelgusi (bekor qilinmagan) yozilishlari. */
export async function upcomingByPhone(phone: string, now: Date): Promise<VisitingBooking[]> {
  const items = (await queryAllPages({
    TableName: TABLES.visitingBookings,
    IndexName: 'phone-index',
    KeyConditionExpression: 'phone = :p AND starts_at >= :now',
    ExpressionAttributeValues: { ':p': phone, ':now': now.toISOString() },
  })) as VisitingBooking[];
  return items.filter((b) => b.status === 'booked');
}

/** Kun bo'yicha barcha yozilishlar (admin ro'yxati). */
export async function bookingsOnDate(date: string): Promise<VisitingBooking[]> {
  return (await queryAllPages({
    TableName: TABLES.visitingBookings,
    IndexName: 'date-index',
    KeyConditionExpression: '#d = :d',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':d': date },
  })) as VisitingBooking[];
}

/* ---------------- admin kiritgan ma'lumotni tekshirish ---------------- */

export type DoctorInput = {
  id?: unknown;
  name?: unknown;
  specialty?: unknown;
  bio?: unknown;
  photoUrl?: unknown;
  weekdays?: unknown;
  dates?: unknown;
  skipDates?: unknown;
  shifts?: unknown;
  slotMinutes?: unknown;
  price?: unknown;
  active?: unknown;
  sort?: unknown;
};

export type ParsedDoctor = Omit<VisitingDoctorRecord, 'doctor_id' | 'created_at' | 'updated_at'> & {
  doctor_id: string | null;
};

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '';

function i18n(v: unknown, max: number): I18nText {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const out: I18nText = { uz: clean(o.uz, max) };
  const ru = clean(o.ru, max);
  const en = clean(o.en, max);
  if (ru) out.ru = ru;
  if (en) out.en = en;
  return out;
}

function dateList(v: unknown, label: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: [] };
  if (!Array.isArray(v)) return { ok: false, error: `${label}: ro‘yxat kutilgan` };
  if (v.length > 120) return { ok: false, error: `${label}: 120 tadan ko‘p sana bo‘lmaydi` };
  const bad = v.find((x) => !isDateKeyStr(x));
  if (bad !== undefined) return { ok: false, error: `${label}: sana noto‘g‘ri (${String(bad)})` };
  return { ok: true, value: [...new Set(v as string[])].sort() };
}

export const VISITING_ID_RE = /^v-[a-z0-9]{4,24}$/;

export function parseDoctorInput(body: DoctorInput): { ok: true; doctor: ParsedDoctor } | { ok: false; error: string } {
  const id = body.id === undefined || body.id === null || body.id === '' ? null : String(body.id);
  if (id !== null && !VISITING_ID_RE.test(id)) return { ok: false, error: 'Shifokor ID noto‘g‘ri' };

  const name = i18n(body.name, 80);
  const specialty = i18n(body.specialty, 80);
  const bio = i18n(body.bio, 600);
  if (!name.uz) return { ok: false, error: 'Ism (o‘zbekcha) kerak' };
  if (!specialty.uz) return { ok: false, error: 'Mutaxassislik (o‘zbekcha) kerak' };

  let photoUrl = '';
  if (body.photoUrl !== undefined && body.photoUrl !== null && body.photoUrl !== '') {
    if (!keyFromUrl(body.photoUrl)) return { ok: false, error: 'Rasm manzili noto‘g‘ri — rasmni qayta yuklang' };
    photoUrl = String(body.photoUrl);
  }

  const weekdaysRaw = body.weekdays ?? [];
  if (!Array.isArray(weekdaysRaw) || !weekdaysRaw.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return { ok: false, error: 'Hafta kunlari 0 (yakshanba) dan 6 (shanba) gacha bo‘lishi kerak' };
  }
  const weekdays = [...new Set(weekdaysRaw as number[])].sort((a, b) => a - b);

  const dates = dateList(body.dates, 'Kelish sanalari');
  if (!dates.ok) return dates;
  const skip = dateList(body.skipDates, 'Kelmaydigan sanalar');
  if (!skip.ok) return skip;

  const active = body.active !== false;
  if (active && weekdays.length === 0 && dates.value.length === 0) {
    return { ok: false, error: 'Shifokor qaysi kunlari kelishini belgilang (hafta kuni yoki sana)' };
  }

  const shifts = checkShifts(body.shifts);
  if (!shifts.ok) return { ok: false, error: shifts.message.replace(/smena/gi, 'qabul oralig‘i') };

  const slotMinutes = Number(body.slotMinutes);
  if (!VISIT_SLOT_MINUTES.includes(slotMinutes)) {
    return { ok: false, error: `Qabul davomiyligi ${VISIT_SLOT_MINUTES.join(', ')} daqiqadan biri bo‘lsin` };
  }
  if (slotTimes(shifts.shifts, slotMinutes).length === 0) {
    return { ok: false, error: 'Qabul soatlariga birorta ham qabul sig‘maydi — oraliqni uzaytiring' };
  }

  const price = Number(body.price);
  if (!Number.isInteger(price) || price < 0 || price > 100_000_000) {
    return { ok: false, error: 'Narx butun musbat son bo‘lishi kerak (so‘m)' };
  }

  const sort = body.sort === undefined || body.sort === '' ? 0 : Number(body.sort);
  if (!Number.isInteger(sort) || Math.abs(sort) > 9999) return { ok: false, error: 'Tartib raqami butun son bo‘lsin' };

  return {
    ok: true,
    doctor: {
      doctor_id: id,
      name,
      specialty,
      bio,
      photo_url: photoUrl || undefined,
      photo_key: keyFromUrl(photoUrl) ?? undefined,
      weekdays,
      dates: dates.value,
      skip_dates: skip.value,
      shifts: shifts.shifts,
      slot_minutes: slotMinutes,
      price,
      active,
      sort,
    },
  };
}
