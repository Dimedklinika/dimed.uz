/**
 * Tashrif buyuruvchi shifokorlar — brauzer va server uchun umumiy qism.
 *
 * Bu shifokorlar klinikaga ma'lum kunlarda tashqaridan keladi
 * (masalan travmatolog har shanba, endokrinolog oyda ikki marta).
 * Ularning jadvali uch xil yozuvdan hosil bo'ladi:
 *
 *   weekdays  — har hafta keladigan kunlar (0 = yakshanba ... 6 = shanba)
 *   dates     — alohida sanalar ("2026-12-05")
 *   skipDates — odatdagi kuni bo'lsa ham kelmaydigan sanalar
 *
 * Kun hisoblari Toshkent kalendari bo'yicha (UTC+5) — sayt ham, server ham
 * bir xil natija chiqarishi uchun shu fayldan foydalanadi
 * (`netlify/functions/lib/visiting.ts` buni qayta eksport qiladi).
 */

export type VisitLang = 'uz' | 'ru' | 'en';
export const VISIT_LANGS: readonly VisitLang[] = ['uz', 'ru', 'en'];

/** Uch tildagi matn: o'zbekchasi majburiy, qolgani bo'sh bo'lsa o'zbekchasi ko'rinadi. */
export type I18nText = { uz: string; ru?: string; en?: string };

export type VisitShift = { start: string; end: string };

export type VisitRule = {
  weekdays: number[];
  dates: string[];
  skipDates: string[];
};

/** Saytga (bosh sahifa, alohida sahifa) beriladigan shifokor shakli. */
export type PublicVisitingDoctor = VisitRule & {
  id: string;
  name: I18nText;
  specialty: I18nText;
  bio: I18nText;
  /** Rasm manzili (`/media/u/...`) yoki bo'sh. */
  photo: string;
  shifts: VisitShift[];
  slotMinutes: number;
  /** Qabul narxi, so'm — klinika kassasida to'lanadi. */
  price: number;
};

export type MediaRef = { url: string; width?: number; height?: number };

/** `/api/site-content` javobi: kartochkalar va almashtirilgan rasmlar. */
export type SiteContent = {
  visiting: PublicVisitingDoctor[];
  /** slot -> rasm. Faqat admin almashtirgan slotlar; qolgani repodagi standart rasm. */
  media: Record<string, MediaRef>;
};

/** Necha kun oldinga yozilish mumkin. */
export const BOOKING_HORIZON_DAYS = 60;
/** Formada nechta kelish kuni ko'rsatiladi. */
export const MAX_VISIT_DATES = 8;

const TASHKENT_OFFSET_MS = 5 * 60 * 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Matnning tanlangan tildagi ko'rinishi; tarjima bo'lmasa o'zbekchasi. */
export function textOf(text: Partial<I18nText> | undefined, lang: VisitLang): string {
  if (!text) return '';
  return (text[lang] ?? '').trim() || (text.uz ?? '').trim();
}

/** Toshkentdagi bugungi sana ("2026-11-27"). */
export function tashkentToday(now: Date = new Date()): string {
  const d = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const parts = (dateKey: string): [number, number, number] => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
};

export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = parts(dateKey);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 0 = yakshanba ... 6 = shanba. */
export function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = parts(dateKey);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isDateKeyStr = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDaysKey(v, 0) === v;

/** Shu sanada shifokor keladimi. */
export function isVisitDay(rule: VisitRule, dateKey: string): boolean {
  if (rule.skipDates.includes(dateKey)) return false;
  return rule.dates.includes(dateKey) || rule.weekdays.includes(weekdayOfKey(dateKey));
}

/**
 * `from` dan boshlab (o'zi ham kiradi) `horizonDays` kun ichidagi kelish
 * kunlari, ko'pi bilan `limit` ta, o'sish tartibida.
 */
export function visitDates(
  rule: VisitRule,
  from: string,
  horizonDays: number = BOOKING_HORIZON_DAYS,
  limit: number = MAX_VISIT_DATES,
): string[] {
  const out: string[] = [];
  for (let i = 0; i <= horizonDays && out.length < limit; i++) {
    const day = addDaysKey(from, i);
    if (isVisitDay(rule, day)) out.push(day);
  }
  return out;
}

/** Narxni "150 000" ko'rinishida (bo'shliq — ingichka, sinmaydigan). */
export const formatSum = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Bemor ismi: 2–80 belgi, kamida bitta harf, teg va havola yo'q. */
export function checkPatientName(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length < 2 || value.length > 80) return { ok: false };
  if (!/\p{L}/u.test(value)) return { ok: false };
  if (/[<>{}]|https?:|www\./i.test(value)) return { ok: false };
  return { ok: true, value };
}
