/**
 * Shifokorning yosh cheklovi.
 *
 * Har bir shifokor uchun admin panelda belgilanadi: faqat kattalar,
 * faqat bolalar yoki hammasi. Chegara — 16 yosh: 16 va undan katta
 * "kattalar", 16 gacha "bolalar" hisoblanadi.
 *
 * Shu fayl ham saytda (bron vidjeti, admin panel), ham serverda
 * (netlify/functions/lib/age.ts orqali) bir xil qoidani beradi —
 * ikkala tomon bir xil hisoblasin.
 */
import type { Lang } from '../data/i18n';

export type AgeGroup = 'all' | 'adult' | 'child';

/** Kattalar va bolalar orasidagi chegara (yosh). */
export const AGE_LIMIT = 16;

export const AGE_GROUPS: readonly AgeGroup[] = ['all', 'adult', 'child'] as const;

export const isAgeGroup = (v: unknown): v is AgeGroup =>
  typeof v === 'string' && (AGE_GROUPS as readonly string[]).includes(v);

/** Noma'lum qiymat — cheklovsiz: bron avvalgidek ishlayveradi. */
export const toAgeGroup = (v: unknown): AgeGroup => (isAgeGroup(v) ? v : 'all');

/**
 * Tug'ilgan sanadan yosh — qabul kuniga (YYYY-MM-DD) qarab.
 * Bugun 15 yoshda bo'lgan bemor kelasi oyda 16 ga to'lsa, o'sha
 * kunga kattalar shifokoriga yozila oladi.
 */
export function ageOnDate(birthDate: string, dateKey: string): number | null {
  const b = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const at = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b || !at) return null;
  let age = Number(at[1]) - Number(b[1]);
  if (Number(at[2]) < Number(b[2]) || (Number(at[2]) === Number(b[2]) && Number(at[3]) < Number(b[3]))) age--;
  return age >= 0 ? age : null;
}

/** Bemor shu shifokorga yozila oladimi. Yosh noma'lum bo'lsa — yo'q. */
export function fitsAgeGroup(group: AgeGroup, age: number | null): boolean {
  if (group === 'all') return true;
  if (age === null) return false;
  return group === 'adult' ? age >= AGE_LIMIT : age < AGE_LIMIT;
}

/*
  `chip` — shifokor kartasidagi belgi. Faqat "16+" yoki "under 16" yozilsa
  tushunarsiz edi (bemorlar "nima 16+?" deb so'rashdi), shuning uchun
  kim uchunligi so'z bilan aytiladi: "Kattalar" / "Bolalar" va yosh chegarasi.
  `unfit` — bemor shifokorga mos kelmaganda ro'yxatda qisqa izoh.
*/
type Texts = { chip: string; rejected: string; adminLabel: string; unfit: string };

const TEXTS: Record<Lang, Record<AgeGroup, Texts>> = {
  uz: {
    all: { chip: '', rejected: '', adminLabel: 'Hamma yosh', unfit: '' },
    adult: {
      chip: `Kattalar · ${AGE_LIMIT}+`,
      rejected: `Bu shifokor faqat ${AGE_LIMIT} yoshdan katta bemorlarni qabul qiladi.`,
      adminLabel: `${AGE_LIMIT} yoshdan katta`,
      unfit: `faqat ${AGE_LIMIT} yoshdan katta`,
    },
    child: {
      chip: `Bolalar · ${AGE_LIMIT} yoshgacha`,
      rejected: `Bu shifokor faqat ${AGE_LIMIT} yoshgacha bo‘lgan bemorlarni qabul qiladi.`,
      adminLabel: `${AGE_LIMIT} yoshgacha`,
      unfit: `faqat ${AGE_LIMIT} yoshgacha`,
    },
  },
  ru: {
    all: { chip: '', rejected: '', adminLabel: 'Любой возраст', unfit: '' },
    adult: {
      chip: `Взрослые · ${AGE_LIMIT}+`,
      rejected: `Этот врач принимает только пациентов старше ${AGE_LIMIT} лет.`,
      adminLabel: `Старше ${AGE_LIMIT} лет`,
      unfit: `только с ${AGE_LIMIT} лет`,
    },
    child: {
      chip: `Дети · до ${AGE_LIMIT} лет`,
      rejected: `Этот врач принимает только пациентов до ${AGE_LIMIT} лет.`,
      adminLabel: `До ${AGE_LIMIT} лет`,
      unfit: `только до ${AGE_LIMIT} лет`,
    },
  },
  en: {
    all: { chip: '', rejected: '', adminLabel: 'Any age', unfit: '' },
    adult: {
      chip: `Adults · ${AGE_LIMIT}+`,
      rejected: `This doctor sees patients aged ${AGE_LIMIT} and older only.`,
      adminLabel: `${AGE_LIMIT} and older`,
      unfit: `${AGE_LIMIT} and older only`,
    },
    child: {
      chip: `Children · under ${AGE_LIMIT}`,
      rejected: `This doctor sees patients under ${AGE_LIMIT} only.`,
      adminLabel: `Under ${AGE_LIMIT}`,
      unfit: `under ${AGE_LIMIT} only`,
    },
  },
};

/** Shifokor kartasidagi qisqa belgi ("Kattalar · 16+"); cheklovsiz bo'lsa bo'sh satr. */
export const ageChip = (group: AgeGroup, lang: Lang = 'uz'): string =>
  (TEXTS[lang] ?? TEXTS.uz)[group].chip;

/** Bemor ro'yxatida mos kelmaganlarga qisqa izoh ("faqat 16 yoshdan katta"). */
export const ageUnfit = (group: AgeGroup, lang: Lang = 'uz'): string =>
  (TEXTS[lang] ?? TEXTS.uz)[group].unfit;

/** "Bu shifokor faqat …" — bemor mos kelmaganda. */
export const ageRejected = (group: AgeGroup, lang: Lang = 'uz'): string =>
  (TEXTS[lang] ?? TEXTS.uz)[group].rejected;

/** Admin paneldagi tanlov yozuvi. */
export const ageLabel = (group: AgeGroup, lang: Lang = 'uz'): string =>
  (TEXTS[lang] ?? TEXTS.uz)[group].adminLabel;
