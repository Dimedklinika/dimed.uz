/**
 * Bot xabarlari — uch tilda (uz asosiy). Bemorning tili `users.lang`
 * da turadi (kabinet → Sozlamalar), bo'lmasa uz.
 *
 * Sayt tomonidagi lug'at: src/data/i18n.ts (bir xil yondashuv).
 */
import { escapeHtml } from './telegram.ts';

export type Lang = 'uz' | 'ru' | 'en';
export const LANGS: readonly Lang[] = ['uz', 'ru', 'en'] as const;

export const isLang = (v: unknown): v is Lang =>
  typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** Telegram `language_code` (masalan "ru", "en-US") → bizning til; noma'lum — uz. */
export const langFromTelegram = (code: string | undefined): Lang => {
  const short = (code ?? '').slice(0, 2).toLowerCase();
  return isLang(short) ? short : 'uz';
};

type Entry = Record<Lang, string>;

const messages = {
  // --- tahlil tayyor (G1) ---
  'result.ready': {
    uz: '🧪 <b>Tahlil natijangiz tayyor</b>\n\n{title}\n{date}\n\nNatijani ko‘rish, PDF yuklash va ulashish:\n{link}',
    ru: '🧪 <b>Результат анализа готов</b>\n\n{title}\n{date}\n\nПосмотреть, скачать PDF и поделиться:\n{link}',
    en: '🧪 <b>Your test result is ready</b>\n\n{title}\n{date}\n\nView, download PDF and share:\n{link}',
  },
  'result.ready.many': {
    uz: '🧪 <b>{n} ta tahlil natijangiz tayyor</b>\n\nHammasini ko‘rish:\n{link}',
    ru: '🧪 <b>Готовы результаты {n} анализов</b>\n\nПосмотреть все:\n{link}',
    en: '🧪 <b>{n} test results are ready</b>\n\nView all:\n{link}',
  },

  // --- baho so'rash (G2) ---
  'rate.ask': {
    uz: '⭐️ <b>Qabulni baholang</b>\n\nShifokor {doctor} ({date}, {time}) qabulini 1 dan 5 gacha baholang — bu bizga xizmatni yaxshilashga yordam beradi.',
    ru: '⭐️ <b>Оцените приём</b>\n\nОцените приём врача {doctor} ({date}, {time}) от 1 до 5 — это помогает нам стать лучше.',
    en: '⭐️ <b>Rate your visit</b>\n\nPlease rate your visit with {doctor} ({date}, {time}) from 1 to 5 — it helps us improve.',
  },
  'rate.thanks': {
    uz: 'Rahmat! Bahoyingiz: {stars}\n\nIzoh qoldirmoqchimisiz? Shunchaki javob yozing (ixtiyoriy).',
    ru: 'Спасибо! Ваша оценка: {stars}\n\nХотите оставить комментарий? Просто напишите ответ (по желанию).',
    en: 'Thank you! Your rating: {stars}\n\nWant to leave a comment? Just reply with a message (optional).',
  },
  'rate.comment.saved': {
    uz: 'Izohingiz saqlandi. Rahmat! 🙏',
    ru: 'Комментарий сохранён. Спасибо! 🙏',
    en: 'Your comment has been saved. Thank you! 🙏',
  },
  'rate.skip': { uz: 'Izohsiz', ru: 'Без комментария', en: 'Skip' },
  'rate.comment.skipped': {
    uz: 'Rahmat! Fikringiz biz uchun muhim. 🙏',
    ru: 'Спасибо! Ваше мнение важно для нас. 🙏',
    en: 'Thank you! Your feedback matters to us. 🙏',
  },
  'rate.saved.short': { uz: 'Bahoyingiz qabul qilindi', ru: 'Оценка принята', en: 'Rating saved' },
  'rate.expired': {
    uz: 'Bu baho so‘rovi eskirgan yoki allaqachon baholangan.',
    ru: 'Этот запрос оценки устарел или уже оценён.',
    en: 'This rating request has expired or was already rated.',
  },
} satisfies Record<string, Entry>;

export type BotMessageKey = keyof typeof messages;

/**
 * Matn tanlangan tilda; {name} joylari `vars` dan to'ldiriladi.
 *
 * Qiymatlar HTML uchun ekranlanadi: xabarlar `parse_mode: 'HTML'` bilan
 * ketadi, tahlil nomi yoki shifokor ismidagi `<`/`&` butun xabarni
 * buzmasin. Shablonning o'z teglari (`<b>`) o'zgarmaydi.
 */
export function botText(
  key: BotMessageKey,
  lang: Lang = 'uz',
  vars: Record<string, string | number> = {},
): string {
  const entry = messages[key] as Entry;
  const text = entry[lang] ?? entry.uz;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name];
    return value === undefined ? `{${name}}` : escapeHtml(String(value));
  });
}
