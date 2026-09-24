/**
 * Tug'ilgan sana tanlovi — kun / oy / yil select'lari (B1).
 *
 * Brauzerning `<input type="date">` ishlatilmaydi: kalendar qurilma
 * tilida ochiladi (ko'pchilikda ruscha) va eski telefonlarda noqulay.
 * Uchta select har doim tanlangan tilda va hamma qurilmada bir xil.
 *
 * Widget (inline skript) va kirish sahifasi (modul) ikkalasi shu
 * yordamchilarni ishlatadi.
 */
import type { Lang } from '../data/i18n.ts';

export const MONTHS: Record<Lang, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const LABELS: Record<Lang, { day: string; month: string; year: string }> = {
  uz: { day: 'Kun', month: 'Oy', year: 'Yil' },
  ru: { day: 'День', month: 'Месяц', year: 'Год' },
  en: { day: 'Day', month: 'Month', year: 'Year' },
};

const MIN_YEAR = 1900;

/**
 * Uchta select'ning HTML'i. `value` (YYYY-MM-DD) berilsa oldindan
 * tanlangan bo'ladi. Elementlar `data-birth="<prefix>"` va
 * `data-part="d|m|y"` bilan belgilanadi — o'qish shu belgilarga qarab.
 */
export function birthDateSelectsHtml(prefix: string, lang: Lang = 'uz', value = ''): string {
  const [y = '', m = '', d = ''] = value.split('-');
  const label = LABELS[lang];
  const thisYear = new Date().getFullYear();

  const opt = (v: string, text: string, selected: boolean) =>
    `<option value="${v}"${selected ? ' selected' : ''}>${text}</option>`;

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))
    .map((v) => opt(v, String(Number(v)), v === d))
    .join('');
  const months = MONTHS[lang]
    .map((name, i) => opt(String(i + 1).padStart(2, '0'), name, String(i + 1).padStart(2, '0') === m))
    .join('');
  const years = Array.from({ length: thisYear - MIN_YEAR + 1 }, (_, i) => String(thisYear - i))
    .map((v) => opt(v, v, v === y))
    .join('');

  const select = (part: 'd' | 'm' | 'y', text: string, options: string) =>
    `<select class="birth-sel birth-${part}" data-birth="${prefix}" data-part="${part}" aria-label="${text}">
      <option value="">${text}</option>${options}</select>`;

  return `<div class="birth-row" data-birth-row="${prefix}">
    ${select('d', label.day, days)}${select('m', label.month, months)}${select('y', label.year, years)}
  </div>`;
}

/** Sana haqiqiymi (30-fevral emas) va oqilona oraliqda. */
export function isValidBirthDate(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
  const today = new Date();
  return y >= MIN_YEAR && date.getTime() <= today.getTime();
}

/**
 * Select'lardan YYYY-MM-DD yig'adi. To'liq tanlanmagan yoki
 * haqiqiy bo'lmagan sana — null.
 */
export function readBirthDate(root: ParentNode, prefix: string): string | null {
  const part = (p: string) =>
    root.querySelector<HTMLSelectElement>(`[data-birth="${prefix}"][data-part="${p}"]`)?.value ?? '';
  const value = `${part('y')}-${part('m')}-${part('d')}`;
  return isValidBirthDate(value) ? value : null;
}

/** 1990-04-25 → "25-aprel 1990" (uz) / "25 апреля 1990" / "25 April 1990". */
export function formatBirthDate(value: string, lang: Lang = 'uz'): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const month = MONTHS[lang][Number(m[2]) - 1] ?? m[2];
  const day = Number(m[3]);
  return lang === 'uz' ? `${day}-${month} ${m[1]}` : `${day} ${month} ${m[1]}`;
}

/** Yosh, to'liq yillarda. */
export function ageOf(value: string, at = new Date()): number | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let age = at.getFullYear() - Number(m[1]);
  const beforeBirthday =
    at.getMonth() + 1 < Number(m[2]) || (at.getMonth() + 1 === Number(m[2]) && at.getDate() < Number(m[3]));
  if (beforeBirthday) age--;
  return age >= 0 ? age : null;
}
