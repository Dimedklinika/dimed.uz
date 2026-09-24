/**
 * Ko'rsatkichlarning me'yoriy (referens) oraliqlari — admin kiritadi (F4).
 *
 * Muammo: 1C ko'p analitni me'yoriy oraliqsiz yuboradi. Bunda sayt
 * qiymat me'yordami yoki undan tashqarimi — hisoblab bera olmasdi
 * (holat "—" bo'lardi). Endi klinika admin paneldan ko'rsatkich uchun
 * oraliq (masalan Gemoglobin: 120–160, erkak) kiritadi va sayt uni
 * **fallback** sifatida ishlatadi: 1C oraliq bergan bo'lsa — 1C niki
 * ustun, bermasa — admin kiritgani.
 *
 * Saqlash: yangi jadval ochmaslik uchun mavjud `prices` jadvalida
 * `item_id = "reference#<nom>#<jins>"`, `kind = "reference"`. Ommaviy
 * /api/prices va admin-prices faqat `kind==="analysis"` ni oladi,
 * shuning uchun referenslar u yerga aralashmaydi.
 */
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './db.ts';

export type Gender = 'male' | 'female' | 'all';

export type ReferenceRow = {
  item_id: string;
  kind: 'reference';
  /** Ko'rsatkich nomi — kiritilganidek (masalan "Gemoglobin"). */
  name: string;
  low: number | null;
  high: number | null;
  unit?: string;
  /** 'male' / 'female' — jinsga xos; 'all' — hammaga. */
  gender: Gender;
  updated_at?: string;
};

/** Taqqoslash uchun normallashtirish (analysis-dict/panels bilan bir xil). */
const norm = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[ʻʼ’‘`´']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

export const isGender = (value: unknown): value is Gender =>
  value === 'male' || value === 'female' || value === 'all';

/** Yozuv kaliti: nom + jins bo'yicha yagona. */
export const referenceId = (name: string, gender: Gender): string =>
  `reference#${norm(name)}#${gender}`;

/** `prices` jadvalidan barcha referens qatorlarini o'qiydi. */
export async function loadReferenceRows(): Promise<ReferenceRow[]> {
  const { Items = [] } = await db.send(new ScanCommand({ TableName: TABLES.prices }));
  return (Items as ReferenceRow[]).filter((r) => r.kind === 'reference');
}

export type ReferenceHit = { low: number | null; high: number | null; unit?: string };

/** Birliklarda uchraydigan kirillcha harflar → lotincha ("ммоль/л" → "mmol/l"). */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Birlikni taqqoslash uchun bir ko'rinishga keltiradi. 1C va admin bitta
 * birlikni turlicha yozadi — "g/L" va "г/л", "mkmol/l" va "µmol/L",
 * "10^9/L" va "10⁹/л" bir xil hisoblanadi.
 */
export const unitKey = (unit: string): string =>
  unit
    .normalize('NFKC') // "10⁹" → "109", "µ" (mikro belgisi) → "μ"
    .toLowerCase()
    .replace(/[\s^*×·]/g, '')
    .replace(/[а-яё]/g, (c) => CYRILLIC[c] ?? c)
    .replace(/μ|mc/g, 'mk');

/**
 * Referens natijaga qo'llanadimi: ikkala birlik ham berilgan va farq
 * qilsa — yo'q. 130–170 g/L oraliq 13.5 g/dL natijani "past" deb
 * ko'rsatardi, holbuki u me'yorda. Birliklardan biri yo'q bo'lsa
 * tekshirib bo'lmaydi — avvalgidek qo'llanadi.
 */
const unitFits = (ref: ReferenceRow, unit: string | null | undefined): boolean =>
  !unit?.trim() || !ref.unit?.trim() || unitKey(ref.unit) === unitKey(unit);

/**
 * Referens qatorlaridan tez qidiruv funksiyasi.
 *
 * Nom + jins bo'yicha eng mos oraliqni beradi: avval jinsga xos
 * ("male"/"female"), topilmasa umumiy ("all"). Natija birligi berilsa,
 * boshqa birlikdagi referens tashlab ketiladi. Hech biri bo'lmasa null.
 */
export function buildReferenceLookup(
  rows: readonly ReferenceRow[],
): (name: string, gender: 'male' | 'female' | null, unit?: string | null) => ReferenceHit | null {
  const map = new Map<string, ReferenceRow>();
  for (const r of rows) map.set(`${norm(r.name)}#${r.gender}`, r);

  return (name, gender, unit) => {
    const n = norm(name);
    if (!n) return null;
    const fitting = (key: string) => {
      const row = map.get(key);
      return row && unitFits(row, unit) ? row : undefined;
    };
    const hit = (gender && fitting(`${n}#${gender}`)) || fitting(`${n}#all`);
    if (!hit) return null;
    return { low: hit.low ?? null, high: hit.high ?? null, unit: hit.unit };
  };
}
