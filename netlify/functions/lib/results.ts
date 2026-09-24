import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TABLES, queryAllPages } from './db.ts';
import { logToAdmin } from './telegram.ts';
import { analyteInfo, type AnalyteDescription } from './analyte-info.ts';
import { detectPanel } from './panels.ts';
import { translateAnalyte, translateAnalysisName } from './analysis-dict.ts';
import { loadReferenceRows, buildReferenceLookup, type ReferenceRow } from './references.ts';

/**
 * Bemorning laboratoriya natijalari — ikki manbadan:
 *  - `dimed_analysis_results` (1C to'g'ridan-to'g'ri yozadi, hujjat = buyurtma)
 *  - `dimed_lab_results` (saytning eski /api/lc-results yo'li; 1C adashib
 *    qo'ygan hujjatlar ham shu yerda uchraydi)
 *
 * Kabinet ro'yxati (/api/me) va natija sahifasi (/api/result) bir xil
 * shaklni ishlatadi, shuning uchun mantiq shu modulda.
 */

/** Sayt API'si (lc-results) yozgan bitta ko'rsatkich. */
type ResultRow = {
  sort_key: string;
  code: string;
  title: string;
  value?: string;
  reference?: string;
  type: 'pdf' | 'text';
  date: string;
  seen?: boolean;
};

/** 1C to'g'ridan-to'g'ri yozadigan hujjat (dimed_analysis_results). */
export type AnalysisDocument = {
  sort_key: string;
  Date?: string;
  RegisterDate?: string;
  SampleID?: string;
  Biomaterial?: string;
  /* Bir telefon ostida oila a'zolari bo'lishi mumkin — natija
     kimniki ekani shu maydondan ko'rinadi. */
  PatientName?: string;
  PatientBirthday?: string;
  PatientIsMale?: boolean;
  /* 1C hujjatni bekor qilsa yoki o'chirishga belgilasa, natija
     kabinetda qolib ketmasligi kerak. */
  Posted?: boolean;
  DeletionMark?: boolean;
  /*
    Tahlil (panel) nomi va yuborgan shifokor — 1C hozircha yubormaydi,
    lekin ro'yxatda "Umumiy qon tahlili" ko'rinishi uchun kerak (C2).
    Bir nechta ehtimoliy nom qabul qilinadi; docs/1c-sync.md da
    AnalysisName / Doctor so'ralgan.
  */
  AnalysisName?: string;
  Analysis?: string;
  PanelName?: string;
  Nomenclature?: string;
  ServiceName?: string;
  Title?: string;
  Doctor?: string;
  ReferringDoctor?: string;
  DoctorName?: string;
  Physician?: string;
  AnalysisResults?: AnalyteRow[];
};

/**
 * Bitta analit. Me'yoriy oraliq maydonlari 1C'da hali kelishilmagan —
 * bir nechta ehtimoliy nom o'qiladi (docs/1c-sync.md).
 */
type AnalyteRow = {
  Analyte?: string;
  Result?: string;
  AnalyteUnit?: string;
  AnalyteInternationalCode?: string;
  Reference?: string;
  ReferenceRange?: string;
  ReferenceText?: string;
  Norm?: string;
  NormText?: string;
  ReferenceMin?: number | string;
  ReferenceMax?: number | string;
  MinValue?: number | string;
  MaxValue?: number | string;
  LowerLimit?: number | string;
  UpperLimit?: number | string;
  NormMin?: number | string;
  NormMax?: number | string;
  Flag?: string;
  Status?: string;
  Description?: string;
  Comment?: string;
};

export type ResultStatus = 'normal' | 'high' | 'low';

/** Natija sahifasidagi bitta ko'rsatkich. */
export type ResultItem = {
  id: string;
  code: string;
  title: string;
  /** Faqat qiymat ("132"); birligi alohida. */
  value: string | null;
  unit: string | null;
  /** Me'yoriy oraliq matni ("3.9 — 5.6") — bo'lmasa null. */
  reference: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** Me'yor bilan taqqoslash; ma'lumot yetmasa null. */
  status: ResultStatus | null;
  description: AnalyteDescription | null;
};

/** Bitta laboratoriya hujjati (buyurtma) va uning ko'rsatkichlari. */
export type ResultGroup = {
  id: string;
  /** Tahlil (panel) nomi — ro'yxatda ko'rinadi (C2). O'zbekcha. */
  title: string;
  /**
   * Sarlavha sayt lug'atidagi kalitdan kelgan bo'lsa (`panel.cbc`) —
   * brauzer uni tanlangan tilda ko'rsatadi. 1C bergan nom yoki
   * ko'rsatkich nomi tarjima qilinmaydi va bu maydon bo'sh qoladi.
   */
  titleKey?: string;
  date: string;
  patientName: string | null;
  patientBirthDate: string | null;
  patientGender: 'male' | 'female' | null;
  /** Yuborgan shifokor (1C bersa). */
  doctor: string | null;
  biomaterial: string | null;
  sampleId: string | null;
  status: 'ready' | 'pending';
  seen: boolean;
  items: ResultItem[];
};

/**
 * Hujjat bemorga hali ham ko'rsatiladimi.
 *
 * Bayroqlar umuman bo'lmasa — ko'rsatiladi: 1C ularni yuborishni
 * keyinroq boshladi, eski yozuvlar shusiz yotibdi.
 */
const isLive = (doc: AnalysisDocument): boolean =>
  doc.DeletionMark !== true && doc.Posted !== false;

/**
 * 1C sanasi "21.08.2026 14:30:00" → "2026-08-21T14:30:00".
 * Soat bir xonali ham keladi ("9:30:24"). ISO — o'zgarishsiz.
 */
export const fromOneCDate = (raw: string | undefined): string => {
  if (!raw) return '';
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return raw;
  const time = `${(m[4] ?? '00').padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}`;
  return `${m[3]}-${m[2]}-${m[1]}T${time}`;
};

/** 25.04.1990 / 1990-04-25T… → 1990-04-25; boshqasi — null. */
const birthdayOf = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const dmy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? null;
};

/*
  Bitta bemorda o'qiladigan yozuvlarning yuqori chegarasi. 1C butun
  tarixni yuklab yuborishi mumkin — cheksiz aylanib qolmaslik uchun.
*/
const MAX_RESULT_ROWS = 2000;

/**
 * Natijalarni oxirigacha o'qiydi.
 *
 * Bitta sahifa bilan cheklab bo'lmaydi: 1C hujjatlarining sort kaliti —
 * UUID, ya'ni tartibi sanaga bog'liq emas va bemor tasodifiy yozuvlarni
 * ko'rardi (eng yangilari ko'rinmasligi mumkin edi).
 *
 * Jadvallardan biri ishlamasa (ruxsat, region, hali yaratilmagan)
 * kabinet yiqilmasin: xato log-botga boradi, ikkinchi manba ko'rinadi.
 */
const queryAll = (input: ConstructorParameters<typeof QueryCommand>[0], where: string) =>
  queryAllPages(input, MAX_RESULT_ROWS).catch(async (err) => {
    await logToAdmin(where, err);
    return [];
  });

const firstText = (...values: (string | undefined)[]): string | null => {
  for (const v of values) {
    const text = v?.trim();
    if (text) return text;
  }
  return null;
};

/** "5,2" / "1 234.5" / "<0.5" → son; son bo'lmasa null. */
export const parseNumber = (raw: string | number | undefined | null): number | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.replace(/\s+/g, '').replace(',', '.').replace(/^[<>≤≥=]+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

/**
 * Me'yoriy oraliq matnidan pastki/yuqori chegarani ajratadi:
 * "3.9 - 5.6", "3,9 – 5,6", "120–160", "< 5.2", "> 10", "≤ 3".
 */
export function parseReference(text: string): { low: number | null; high: number | null } {
  const t = text.replace(/\s+/g, ' ').trim();
  const range = t.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|\.\.\.?|to|dan|до)\s*(-?\d+(?:[.,]\d+)?)$/i);
  if (range) return { low: parseNumber(range[1]), high: parseNumber(range[2]) };
  const upper = t.match(/^(?:<|≤|<=|do|gacha|до)\s*(-?\d+(?:[.,]\d+)?)$/i);
  if (upper) return { low: null, high: parseNumber(upper[1]) };
  const lower = t.match(/^(?:>|≥|>=)\s*(-?\d+(?:[.,]\d+)?)$/i);
  if (lower) return { low: parseNumber(lower[1]), high: null };
  return { low: null, high: null };
}

/** Qiymatni me'yor bilan taqqoslaydi; ma'lumot yetmasa null. */
export function statusOf(
  value: number | null,
  low: number | null,
  high: number | null,
  flag?: string,
): ResultStatus | null {
  if (value !== null && (low !== null || high !== null)) {
    if (low !== null && value < low) return 'low';
    if (high !== null && value > high) return 'high';
    return 'normal';
  }
  const f = (flag ?? '').trim().toUpperCase();
  if (f === 'H' || f === 'HIGH' || f === '↑' || f === 'YUQORI') return 'high';
  if (f === 'L' || f === 'LOW' || f === '↓' || f === 'PAST') return 'low';
  if (f === 'N' || f === 'NORMAL' || f === 'NORM') return 'normal';
  return null;
}

/** 1C analitini sahifa ko'rsatkichiga o'giradi. */
function toItem(a: AnalyteRow, id: string): ResultItem | null {
  /*
    Analit nomi 1C'da bo'sh bo'lishi mumkin (PrintName to'ldirilmagan) —
    qator yo'qolmasin: xalqaro kod bilan ko'rsatiladi. Nomi ham,
    qiymati ham bo'lmasa — ko'rsatadigan narsa qolmaydi.
  */
  const rawTitle = a.Analyte?.trim() || a.AnalyteInternationalCode?.trim() || '';
  const value = a.Result?.trim() || null;
  if (!rawTitle && !value) return null;

  // 1C ruscha/texnik nom yuborsa — o'zbekcha rasmiy atamaga o'giramiz
  // (topilmasa asl nom qoladi). Bu ham ko'rinishni, ham panel tanishni
  // yaxshilaydi: `detectPanel` o'zbekcha belgilar bo'yicha ishlaydi.
  const title = translateAnalyte(rawTitle);

  const unit = a.AnalyteUnit?.trim() || null;
  const refText = firstText(a.Reference, a.ReferenceRange, a.ReferenceText, a.Norm, a.NormText);

  let low = parseNumber(a.ReferenceMin ?? a.MinValue ?? a.LowerLimit ?? a.NormMin);
  let high = parseNumber(a.ReferenceMax ?? a.MaxValue ?? a.UpperLimit ?? a.NormMax);
  if (low === null && high === null && refText) ({ low, high } = parseReference(refText));

  const reference =
    refText ??
    (low !== null && high !== null ? `${low} — ${high}` : low !== null ? `> ${low}` : high !== null ? `< ${high}` : null);

  return {
    id,
    code: a.AnalyteInternationalCode?.trim() ?? '',
    title: title || 'Koʻrsatkich',
    value,
    unit,
    reference,
    refLow: low,
    refHigh: high,
    status: statusOf(parseNumber(value), low, high, a.Flag ?? a.Status),
    description: firstText(a.Description, a.Comment)
      ? { uz: firstText(a.Description, a.Comment) ?? '' }
      : analyteInfo(title, a.AnalyteInternationalCode),
  };
}

/**
 * Ro'yxatdagi sarlavha — tartib bilan:
 *
 *   1. 1C bergan tahlil nomi (`AnalysisName`) — eng ishonchlisi;
 *   2. ko'rsatkichlardan tanilgan panel ("Umumiy qon tahlili");
 *   3. bitta ko'rsatkich bo'lsa — uning nomi (u chindan ham bitta tahlil);
 *   4. uchtagacha bo'lsa — nomlari vergul bilan;
 *   5. qolganida biomaterial yoki umumiy nom.
 *
 * Ilgari oxirgi holat "Gemoglobin +23" berardi: bemor tahlil nomi
 * o'rniga birinchi ko'rsatkichning nomini ko'rardi.
 */
function titleOf(
  explicit: string | null,
  biomaterial: string | null,
  items: { title: string }[],
): { title: string; titleKey?: string } {
  if (explicit) {
    // 1C ruscha/texnik nom bergan bo'lsa o'zbekchaga o'giramiz; ma'lum
    // panelga tegishli bo'lsa lug'at kaliti ham qo'yiladi (ru/en uchun).
    const tr = translateAnalysisName(explicit);
    return tr.key ? { title: tr.title, titleKey: tr.key } : { title: tr.title };
  }

  const panel = detectPanel(items.map((i) => i.title));
  if (panel) return { title: panel.uz, titleKey: panel.key };

  if (items.length === 1 && items[0]) return { title: items[0].title };
  if (items.length > 1 && items.length <= 3) {
    return { title: items.map((i) => i.title).join(', ') };
  }
  if (biomaterial) return { title: `${biomaterial} tahlili` };
  return items.length
    ? { title: 'Laboratoriya tahlili', titleKey: 'panel.generic' }
    : { title: 'Tahlil natijalari', titleKey: 'panel.empty' };
}

/** Kamida bitta qiymat bo'lsa — tayyor; hammasi bo'sh — laboratoriya hali kiritmagan. */
const groupStatus = (items: { value: string | null }[]): 'ready' | 'pending' =>
  items.some((i) => i.value) ? 'ready' : 'pending';

/**
 * `references` — oldindan o'qilgan admin referenslari. Ko'p bemorni
 * aylanib chiqadigan cron (notify-results) ularni bir marta o'qib
 * beradi; berilmasa shu yerda o'qiladi.
 */
export async function loadResults(
  phone: string,
  references?: readonly ReferenceRow[],
): Promise<ResultGroup[]> {
  const [manual, oneC] = await Promise.all([
    queryAll(
      {
        TableName: TABLES.labResults,
        KeyConditionExpression: 'phone = :p',
        ExpressionAttributeValues: { ':p': phone },
        ScanIndexForward: false,
      },
      'me/lab-natijalar',
    ),
    queryAll(
      {
        TableName: TABLES.analysisResults,
        KeyConditionExpression: 'phone = :p',
        ExpressionAttributeValues: { ':p': phone },
      },
      'me/1c-natijalar',
    ),
  ]);

  /*
    lab_results da ikki xil yozuv uchraydi: saytniki (title/date bilan)
    va 1C adashib shu jadvalga quygan hujjatlar (AnalysisResults bilan,
    title'siz). Ikkinchisini hujjat sifatida o'qiymiz — bemorning
    tarixi bekor ketmasin, noma'lum shakldagisi esa tashlab yuboriladi,
    yiqilish emas.
  */
  const manualItems = manual as (ResultRow & AnalysisDocument)[];

  /*
    Sayt API'si (lc-results) har bir ko'rsatkichni alohida yozadi va
    buyurtma raqamini saqlamaydi — shuning uchun bir sanadagilar
    bitta buyurtma deb yig'iladi.
  */
  const byDate = new Map<string, ResultGroup>();
  for (const row of manualItems) {
    if (!row.title) continue;
    const date = row.date ?? '';
    const key = `lab-${date}`;
    let group = byDate.get(key);
    if (!group) {
      group = {
        id: key,
        title: '',
        date,
        patientName: null,
        patientBirthDate: null,
        patientGender: null,
        doctor: null,
        biomaterial: null,
        sampleId: null,
        status: 'pending',
        seen: true,
        items: [],
      };
      byDate.set(key, group);
    }
    // Bittasi ham ko'rilmagan bo'lsa — butun buyurtma "yangi".
    if (!(row.seen ?? false)) group.seen = false;

    // Eski yozuvda qiymat birlik bilan birga ("132 g/L") — ajratamiz.
    const m = (row.value ?? '').trim().match(/^(-?[\d.,<>≤≥]+)\s+(.+)$/);
    const value = m ? m[1] ?? null : row.value?.trim() || null;
    const unit = m ? m[2] ?? null : null;
    const { low, high } = row.reference ? parseReference(row.reference) : { low: null, high: null };
    const rowTitle = translateAnalyte(row.title);
    group.items.push({
      id: row.sort_key,
      code: row.code ?? '',
      title: rowTitle,
      value,
      unit,
      reference: row.reference ?? null,
      refLow: low,
      refHigh: high,
      status: statusOf(parseNumber(value), low, high),
      description: analyteInfo(rowTitle, row.code),
    });
  }

  const docs = [
    ...(oneC as AnalysisDocument[]),
    ...manualItems.filter((r) => !r.title && Array.isArray(r.AnalysisResults)),
  ].filter(isLive);

  // Bir hujjat ikkala jadvalda ham bo'lsa, bir marta ko'rinadi.
  const seenDocs = new Set<string>();
  const fromDocs = docs.flatMap((doc) => {
    if (seenDocs.has(doc.sort_key)) return [];
    seenDocs.add(doc.sort_key);

    const items = (doc.AnalysisResults ?? []).flatMap((a, i) => {
      const item = toItem(a, `${doc.sort_key}#${i}`);
      return item ? [item] : [];
    });
    if (!items.length) return [];

    const biomaterial = doc.Biomaterial?.trim() || null;
    const named = titleOf(
      firstText(doc.AnalysisName, doc.Analysis, doc.PanelName, doc.Nomenclature, doc.ServiceName, doc.Title),
      biomaterial,
      items,
    );
    return [
      {
        id: doc.sort_key,
        title: named.title,
        ...(named.titleKey ? { titleKey: named.titleKey } : {}),
        date: fromOneCDate(doc.Date) || fromOneCDate(doc.RegisterDate),
        patientName: doc.PatientName?.trim() || null,
        patientBirthDate: birthdayOf(doc.PatientBirthday),
        patientGender:
          typeof doc.PatientIsMale === 'boolean' ? (doc.PatientIsMale ? 'male' : 'female') : null,
        doctor: firstText(doc.Doctor, doc.ReferringDoctor, doc.DoctorName, doc.Physician),
        biomaterial,
        sampleId: doc.SampleID?.trim() || null,
        status: groupStatus(items),
        // "yangi" belgisi qo'yilmaydi: 1C eski tarixni ham to'kishi mumkin.
        seen: true,
        items,
      } satisfies ResultGroup,
    ];
  });

  // Sayt API'si orqali kelganlarga ham sarlavha va holat.
  for (const group of byDate.values()) {
    const named = titleOf(null, null, group.items);
    group.title = named.title;
    if (named.titleKey) group.titleKey = named.titleKey;
    group.status = groupStatus(group.items);
  }

  const groups = [...byDate.values(), ...fromDocs];
  await applyAdminReferences(groups, references);
  return groups.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/**
 * Admin kiritgan referenslar. O'qib bo'lmasa — bo'sh ro'yxat: natija
 * referenssiz ko'rinadi, sahifa yiqilmaydi.
 */
export const loadAdminReferences = (): Promise<ReferenceRow[]> =>
  loadReferenceRows().catch(async (err) => {
    await logToAdmin('me/referenslar', err);
    return [] as ReferenceRow[];
  });

/**
 * 1C me'yoriy oraliq bermagan ko'rsatkichlarga admin kiritgan referensni
 * qo'yadi (F4). 1C oralig'i bo'lsa unga tegilmaydi — u har doim ustun.
 * Jins bo'yicha mos referens ustun, bo'lmasa umumiy ("all").
 */
async function applyAdminReferences(
  groups: ResultGroup[],
  preloaded?: readonly ReferenceRow[],
): Promise<void> {
  if (!groups.length) return;
  const rows = preloaded ?? (await loadAdminReferences());
  if (!rows.length) return;

  const lookup = buildReferenceLookup(rows);
  for (const group of groups) {
    for (const item of group.items) {
      // 1C oralig'i (yoki matni) bor — tegmaymiz.
      if (item.refLow !== null || item.refHigh !== null || item.reference) continue;
      const hit = lookup(item.title, group.patientGender, item.unit);
      if (!hit || (hit.low === null && hit.high === null)) continue;

      item.refLow = hit.low;
      item.refHigh = hit.high;
      item.reference =
        hit.low !== null && hit.high !== null
          ? `${hit.low} — ${hit.high}`
          : hit.low !== null
            ? `> ${hit.low}`
            : `< ${hit.high}`;
      if (hit.unit && !item.unit) item.unit = hit.unit;
      item.status = statusOf(parseNumber(item.value), hit.low, hit.high);
    }
  }
}

/** Bemorning bitta natijasi (id — hujjat sort_key yoki "lab-<sana>"). */
export async function findResult(phone: string, id: string): Promise<ResultGroup | null> {
  const groups = await loadResults(phone);
  return groups.find((g) => g.id === id) ?? null;
}
