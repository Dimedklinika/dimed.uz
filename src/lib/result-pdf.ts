/**
 * Tahlil natijasi — vektorli, matnli PDF (D2).
 *
 * Ilgari PDF `html2pdf.js` bilan yasalardi: sahifa `html2canvas` orqali
 * **rasmga** aylantirilardi — matnni belgilab/nusxalab bo'lmasdi, mobil
 * layout PDF ichiga kirib ketardi va ko'p ko'rsatkichli tahlil (masalan
 * leykoformula bilan 24 ta ko'rsatkich) ikki-uch betga bo'linib ketardi.
 *
 * Endi PDF `pdfmake` bilan **to'g'ridan-to'g'ri vektor** shaklda quriladi:
 *   - matnlar chinakam matn (belgilanadi, qidiriladi, nusxalanadi);
 *   - qat'iy A4 (portrait) bosma shablon — ekran/mobil layoutdan mustaqil;
 *   - ko'rsatkichlar soniga qarab shrift va oraliqlar zichligi sozlanadi,
 *     shuning uchun 24 tagacha ko'rsatkich aniq bitta betga sig'adi.
 *
 * `buildResultDocDefinition` — toza funksiya (test qilinadi);
 * `downloadResultPdf` — kutubxonani (chunk sifatida) yuklab, faylni saqlaydi.
 * Kutubxona npm'dan keladi va o'z domenimizdan yuklanadi — `script-src 'self'`
 * bilan ishlaydi, cdnjs kerak emas (netlify.toml, CSP).
 */
import { t, type Lang, type MessageKey } from '../data/i18n.ts';
import { resultTitle } from './result-title.ts';
import { formatBirthDate, ageOf } from './birthdate.ts';

export type PdfStatus = 'normal' | 'high' | 'low' | null;

export type PdfResultItem = {
  title: string;
  value: string | null;
  unit: string | null;
  reference: string | null;
  status: PdfStatus;
};

export type PdfResult = {
  title: string;
  titleKey?: string;
  date: string;
  patientName: string | null;
  patientBirthDate: string | null;
  patientGender: 'male' | 'female' | null;
  doctor: string | null;
  biomaterial: string | null;
  sampleId: string | null;
  items: PdfResultItem[];
};

/** pdfmake hujjat ta'rifining bizga kerak bo'lgan qismi. */
export type PdfDocDefinition = {
  pageSize: string;
  pageOrientation: 'portrait';
  pageMargins: [number, number, number, number];
  defaultStyle: Record<string, unknown>;
  info?: Record<string, string>;
  content: unknown[];
  styles?: Record<string, unknown>;
  footer?: unknown;
};

/* Blank ranglari — natija.astro dagi `.report` bilan bir xil. */
const C = {
  ink: '#2a1622',
  muted: '#6b5a64',
  line: '#ead9e2',
  rose: '#d5006f',
  roseSoft: '#fbe7f1',
  ok: '#2f7a27',
  okBg: '#edf7ea',
  danger: '#c2185b',
  dangerBg: '#fdecf3',
  warn: '#8a4b00',
  warnBg: '#fff6e0',
  rowAlert: '#fff5f9',
  headBg: '#fdf5f9',
} as const;

/**
 * O'zbekcha maxsus apostroflar (oʻ/gʻ dagi ʻ, ʼ) → oddiy '.
 *
 * pdfmake standart shrifti (Roboto) lotin va kirillni to'liq qoplaydi,
 * lekin U+02BB / U+02BC modifikator harflari yo'q — ular PDF'da bo'sh
 * katak (tofu) bo'lib chiqardi. "o'"/"g'" — o'zbek lotinining keng
 * qo'llanadigan shakli, shuning uchun bu xavfsiz almashtirish.
 */
const pdfText = (raw: string | null | undefined): string =>
  (raw ?? '').replace(/[ʻʼ‘’′`]/g, "'");

/** "2026-08-21T14:30" → "21.08.2026, 14:30". */
const fmtDateTime = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}${m[4] ? `, ${m[4]}:${m[5]}` : ''}`;
};

/**
 * Ko'rsatkichlar soniga qarab zichlik.
 *
 * A4 (portrait) da sarlavha, bemor jadvali, izoh va footer'dan keyin
 * jadvalga ~500 pt qoladi. Shrift va katak oralig'ini shu bo'yicha
 * kichraytiramiz: 24 tagacha ko'rsatkich bitta betga sig'sin.
 */
function density(n: number): { fs: number; pad: number } {
  if (n <= 12) return { fs: 9.5, pad: 5 };
  if (n <= 18) return { fs: 8.5, pad: 3.6 };
  if (n <= 24) return { fs: 7.6, pad: 2.6 };
  return { fs: 6.8, pad: 1.8 };
}

/** Roboto shriftlar to'plami (pdfmake standarti). */
export const PDF_FONTS = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
} as const;

/**
 * Natijadan pdfmake hujjat ta'rifini quradi — toza, tashqi bog'liqliksiz
 * (test qilish uchun). Faqat matn: rasm/canvas ishlatilmaydi, shuning
 * uchun butun hujjat vektor bo'lib qoladi.
 */
export function buildResultDocDefinition(result: PdfResult, lang: Lang): PdfDocDefinition {
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => pdfText(t(key, lang, vars));
  const heading = pdfText(resultTitle(result, lang));
  const { fs, pad } = density(result.items.length);

  const statusText = (s: PdfStatus): string =>
    s === 'high' ? tr('result.status.high') : s === 'low' ? tr('result.status.low') : s === 'normal' ? tr('result.status.normal') : '—';
  const statusColor = (s: PdfStatus): string =>
    s === 'high' || s === 'low' ? C.danger : s === 'normal' ? C.ok : C.muted;

  // --- bemor jadvali (2×2) ---
  const cell = (label: string, value: string) => ({
    stack: [
      { text: label.toUpperCase(), fontSize: fs - 2.5, color: C.muted, characterSpacing: 0.3, bold: true },
      { text: value || '—', fontSize: fs + 0.5, bold: true, color: C.ink, margin: [0, 1.5, 0, 0] },
    ],
    margin: [2, 3, 2, 3] as [number, number, number, number],
  });

  const age = result.patientBirthDate ? ageOf(result.patientBirthDate) : null;
  const birth = result.patientBirthDate
    ? `${pdfText(formatBirthDate(result.patientBirthDate, lang))}${age !== null ? ` (${tr('result.age', { n: age })})` : ''}`
    : '';
  const gender = result.patientGender ? tr(result.patientGender === 'male' ? 'result.male' : 'result.female') : '';
  const sample = [fmtDateTime(result.date), pdfText(result.biomaterial), result.sampleId ? `№ ${pdfText(result.sampleId)}` : '']
    .filter(Boolean)
    .join(' · ');

  const patientTable = {
    table: {
      widths: ['*', '*'],
      body: [
        [cell(tr('result.patient'), pdfText(result.patientName)), cell(tr('result.birthGender'), [birth, gender].filter(Boolean).join(' / '))],
        [cell(tr('result.sampleTime'), sample), cell(tr('result.doctor'), pdfText(result.doctor))],
      ],
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
      hLineColor: () => C.line,
      vLineColor: () => C.line,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };

  // --- meʼyordan tashqari koʻrsatkichlar banneri ---
  const abnormal = result.items.filter((i) => i.status === 'high' || i.status === 'low').length;
  const known = result.items.some((i) => i.status !== null);
  const bannerText = abnormal
    ? tr('result.banner.abnormal', { n: abnormal })
    : known
      ? tr('result.banner.ok')
      : tr('result.banner.unknown');
  const banner = {
    table: {
      widths: ['*'],
      body: [[{ text: bannerText, fontSize: fs, color: abnormal ? C.warn : known ? C.ok : C.rose, margin: [6, 5, 6, 5] as [number, number, number, number] }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => (abnormal ? C.warnBg : known ? C.okBg : C.roseSoft),
    },
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };

  // --- natijalar jadvali ---
  const headCell = (text: string) => ({
    text: text.toUpperCase(),
    fontSize: fs - 2,
    bold: true,
    color: C.muted,
    fillColor: C.headBg,
    margin: [4, pad + 1, 4, pad + 1] as [number, number, number, number],
  });

  const bodyRows = result.items.map((item) => {
    const alert = item.status === 'high' || item.status === 'low';
    const fill = alert ? C.rowAlert : null;
    const cellMargin = [4, pad, 4, pad] as [number, number, number, number];
    return [
      { text: pdfText(item.title) || tr('result.col.name'), fontSize: fs, bold: true, color: C.ink, fillColor: fill, margin: cellMargin },
      {
        text: [
          { text: pdfText(item.value) || '—', bold: true, color: alert ? C.danger : C.ink },
          ...(item.unit ? [{ text: ` ${pdfText(item.unit)}`, color: C.muted, fontSize: fs - 1.5 }] : []),
        ],
        fontSize: fs,
        fillColor: fill,
        margin: cellMargin,
      },
      { text: statusText(item.status), fontSize: fs - 0.5, bold: alert, color: statusColor(item.status), fillColor: fill, margin: cellMargin },
      { text: pdfText(item.reference) || '—', fontSize: fs, color: C.ink, fillColor: fill, margin: cellMargin },
    ];
  });

  const dataTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 62, 58, 92],
      body: [
        [headCell(tr('result.col.name')), headCell(tr('result.col.value')), headCell(tr('result.col.status')), headCell(tr('result.col.range'))],
        ...bodyRows,
      ],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 1.2 : 0.6),
      vLineWidth: () => 0,
      hLineColor: () => C.line,
    },
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };

  // --- izoh ---
  const disclaimer = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: [
              { text: `${tr('result.important')}: `, bold: true, color: C.ink },
              { text: tr('result.disclaimer'), color: C.muted },
            ],
            fontSize: fs - 1.5,
            margin: [8, 6, 8, 6] as [number, number, number, number],
          },
        ],
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => '#f7f0f4' },
  };

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [32, 30, 32, 40],
    info: {
      title: `${heading} — Dimed`,
      author: 'Dimed klinikasi',
      subject: heading,
    },
    defaultStyle: { font: 'Roboto', fontSize: fs, color: C.ink, lineHeight: 1.15 },
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Dimed', font: 'Roboto', bold: true, fontSize: 17, color: C.rose },
              { text: pdfText(tr('result.footer')), fontSize: fs - 2, color: C.muted, margin: [0, 1, 0, 0] },
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: '+998 55 9009 103', fontSize: fs - 1, color: C.ink, alignment: 'right', bold: true },
              { text: pdfText('Chinoz shahri, Navoiy koʻchasi, 18'), fontSize: fs - 2, color: C.muted, alignment: 'right', margin: [0, 1, 0, 0] },
            ],
          },
        ],
        margin: [0, 0, 0, 6],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 531, y2: 0, lineWidth: 1.4, lineColor: C.roseSoft }], margin: [0, 0, 0, 10] },
      { text: heading, font: 'Roboto', bold: true, fontSize: fs + 6, color: C.rose, margin: [0, 0, 0, 8] },
      patientTable,
      banner,
      dataTable,
      disclaimer,
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `Dimed klinikasi · Laboratoriya · ${new Date().getFullYear()}`, fontSize: 7.5, color: '#9a8a93', margin: [32, 0, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7.5, color: '#9a8a93', alignment: 'right', margin: [0, 0, 32, 0] },
      ],
      margin: [0, 8, 0, 0],
    }),
  };
}

/** "Yoʻldoshev Anvar" → "Yoldoshev_Anvar" (fayl nomi uchun). */
export const fileSlug = (s: string): string =>
  s
    .replace(/[ʻʼ’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '') || 'bemor';

/**
 * Kutubxonani yuklab, PDF'ni yasab, saqlaydi.
 *
 * pdfmake sahifa bilan birga kelmaydi: "PDF yuklash" bosilganda alohida
 * bo'lak sifatida import qilinadi. `addVirtualFileSystem` — Roboto
 * shriftini (base64) ro'yxatga qo'yadi, aks holda pdfmake "shrift yo'q"
 * deb yiqiladi.
 */
export async function downloadResultPdf(result: PdfResult, lang: Lang, filename: string): Promise<void> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const pdfMake = (pdfMakeMod as { default?: unknown }).default ?? pdfMakeMod;
  const vfs = (vfsMod as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>);

  const make = pdfMake as {
    addVirtualFileSystem?: (v: Record<string, string>) => void;
    vfs?: Record<string, string>;
    createPdf: (dd: unknown) => { download: (name?: string) => void };
  };
  if (typeof make.addVirtualFileSystem === 'function') make.addVirtualFileSystem(vfs);
  else make.vfs = vfs;

  const dd = buildResultDocDefinition(result, lang);
  make.createPdf(dd).download(filename);
}
