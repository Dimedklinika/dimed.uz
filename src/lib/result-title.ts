/**
 * Tahlil (buyurtma) sarlavhasini tanlangan tilda beradi.
 *
 * Server sarlavhani ikki ko'rinishda yuboradi: `title` — har doim
 * to'ldirilgan o'zbekcha matn, `titleKey` — sayt lug'atidagi kalit
 * (`panel.cbc`), agar nom ko'rsatkichlardan tanilgan bo'lsa.
 * 1C bergan nom yoki ko'rsatkich nomi tarjima qilinmaydi: klinika
 * uni o'z katalogida qanday yozgan bo'lsa, shundayligicha ko'rinadi.
 */
import { messages, t, type Lang, type MessageKey } from '../data/i18n.ts';

export function resultTitle(
  group: { title: string; titleKey?: string },
  lang: Lang,
): string {
  const key = group.titleKey;
  return key && key in messages ? t(key as MessageKey, lang) : group.title;
}
