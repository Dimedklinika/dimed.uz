/**
 * Klinika vaqti — Asia/Tashkent (UTC+5, yozgi vaqt yo'q).
 *
 * Netlify funksiyalari UTC'da ishlaydi, shuning uchun "bugun" va
 * "hozir soat nechchi" har doim shu yerdagi funksiyalar orqali
 * hisoblanadi. Aks holda kechqurun 19:00 dan keyin sana bir kunga
 * surilib ketadi.
 */
export const TASHKENT_OFFSET_MINUTES = 5 * 60;

/** "2026-08-12" ko'rinishidagi kun kaliti. */
export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC vaqtni Toshkent vaqtidagi sana + daqiqaga aylantiradi. */
export function toTashkent(at: Date): { dateKey: DateKey; minutes: number } {
  const shifted = new Date(at.getTime() + TASHKENT_OFFSET_MINUTES * 60_000);
  return {
    dateKey: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Toshkent vaqtidagi sana va "HH:MM" ni haqiqiy (UTC) lahzaga aylantiradi. */
export function toInstant(dateKey: DateKey, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (y === undefined || m === undefined || d === undefined || hh === undefined || mm === undefined) {
    throw new Error(`Sana yoki vaqt formati noto'g'ri: ${dateKey} ${time}`);
  }
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - TASHKENT_OFFSET_MINUTES * 60_000);
}

/** dateKey'ga n kun qo'shadi (Toshkent kalendari bo'yicha). */
export function addDays(dateKey: DateKey, days: number): DateKey {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Sana formati noto'g'ri: ${dateKey}`);
  }
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Ikki kun orasidagi kalendar kunlari: `to` kechroq bo'lsa musbat (2026-10-02 → 2026-10-12 = 10). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const utc = (dateKey: DateKey): number => {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (y === undefined || m === undefined || d === undefined) {
      throw new Error(`Sana formati noto'g'ri: ${dateKey}`);
    }
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** 0 = yakshanba ... 6 = shanba (Toshkent kalendari bo'yicha). */
export function weekdayOf(dateKey: DateKey): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Sana formati noto'g'ri: ${dateKey}`);
  }
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
export const isTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
