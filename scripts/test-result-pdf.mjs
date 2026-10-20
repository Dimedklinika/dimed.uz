/**
 * Tahlil natijasi PDF hujjat ta'rifi — `src/lib/result-pdf.ts`.
 *
 * PDF endi vektor (matnli): `buildResultDocDefinition` toza funksiya
 * bo'lgani uchun kutubxonasiz, brauzarsiz tekshiriladi. Muhim shartlar:
 *   - qat'iy A4 (portrait);
 *   - barcha ko'rsatkich nomi, qiymati va me'yori matn bo'lib chiqadi
 *     (rasm emas — belgilash/qidirish uchun);
 *   - 24 tagacha ko'rsatkichda shrift bitta betga sig'adigan darajada
 *     zich bo'ladi;
 *   - o'zbekcha ʻ/ʼ modifikator harflari oddiy ' ga o'giriladi (Roboto
 *     ularni chizolmaydi — aks holda PDF'da bo'sh katak chiqardi).
 *
 * Ishlatish: node --experimental-strip-types scripts/test-result-pdf.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');
const { buildResultDocDefinition, fileSlug, gaugePosition, parseNumber } = await import(
  pathToFileURL(join(libDir, 'result-pdf.ts')).href
);

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

/** Hujjat ta'rifidagi barcha matnni (ichma-ich) yig'ib beradi. */
function collectText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, out);
    return out;
  }
  if (typeof node === 'object') {
    // Matn bo'lmagan tuguns: logotip (SVG), shkala (canvas), QR — belgi qoldiramiz.
    if (typeof node.svg === 'string') out.push('[SVG]');
    if (node.canvas) out.push('[CANVAS]');
    if (typeof node.qr === 'string') out.push(`[QR ${node.qr}]`);
    if (typeof node.text !== 'undefined') collectText(node.text, out);
    if (node.stack) collectText(node.stack, out);
    if (node.columns) collectText(node.columns, out);
    if (node.table && node.table.body) collectText(node.table.body, out);
  }
  return out;
}
const allText = (dd) => collectText(dd.content).join('\n');

// --- namuna natija: umumiy qon tahlili, leykoformula bilan (24 ko'rsatkich) ---
const CBC_NAMES = [
  'Gemoglobin', 'Eritrotsitlar', 'Eritrotsitlar oʻrtacha hajmi',
  '1 dona Eritrotsitdagi gemoglobin miqdori', 'Eritrotsitdagi gemoglobin konsentratsiyasi',
  'Eritrotsitlar anizotsitozi', 'Gematokrit', 'Trombotsitlar',
  "Trombotsitlar o'rtacha hajmi", 'Trombokrit', 'Leykotsitlar', 'Segment yadroli neytrofil',
  'Tayoqcha yadroli neytrofil', 'Eozinofillar', 'Bazofillar', 'Monotsitlar', 'Limfotsitlar',
  'Eritrotsitlar choʻkish tezligi', 'Rangli koʻrsatkich', 'Plazmatik hujayralar',
  'Anizotsitoz', 'Poykilotsitoz', 'Miyelotsitlar', 'Metamiyelotsitlar',
];

const cbc = {
  title: 'Umumiy qon tahlili',
  titleKey: 'panel.cbc',
  date: '2026-08-21T14:30',
  patientName: 'Yoʻldoshev Anvar',
  patientBirthDate: '1990-04-25',
  patientGender: 'male',
  doctor: 'Ashurov B.',
  biomaterial: 'Qon',
  sampleId: 'A-1024',
  items: CBC_NAMES.map((title, i) => ({
    title,
    value: String(4 + i),
    unit: 'g/L',
    reference: '3.9 — 5.6',
    status: i === 0 ? 'high' : i === 1 ? 'low' : 'normal',
  })),
};

console.log('Tahlil natijasi PDF (vektor):');

test('qat\'iy A4 portrait shablon', () => {
  const dd = buildResultDocDefinition(cbc, 'uz');
  assert.equal(dd.pageSize, 'A4');
  assert.equal(dd.pageOrientation, 'portrait');
  assert.equal(dd.defaultStyle.font, 'Roboto');
});

test('barcha ko\'rsatkich nomi matn bo\'lib chiqadi', () => {
  const text = allText(buildResultDocDefinition(cbc, 'uz'));
  // Apostrof normallashgani uchun modifikatorsiz ko'rinishini izlaymiz.
  assert.ok(text.includes('Gemoglobin'));
  assert.ok(text.includes('Leykotsitlar'));
  assert.ok(text.includes("Eritrotsitlar o'rtacha hajmi"));
  assert.ok(text.includes('Metamiyelotsitlar'));
});

test('sarlavha lug\'atdan tanlangan tilda', () => {
  assert.ok(allText(buildResultDocDefinition(cbc, 'uz')).includes('Umumiy qon tahlili'));
  assert.ok(allText(buildResultDocDefinition(cbc, 'ru')).includes('Общий анализ крови'));
  assert.ok(allText(buildResultDocDefinition(cbc, 'en')).includes('Complete blood count'));
});

test('bemor ma\'lumoti va namuna raqami bor', () => {
  const text = allText(buildResultDocDefinition(cbc, 'uz'));
  assert.ok(text.includes("Yo'ldoshev Anvar")); // ʻ → '
  assert.ok(text.includes('A-1024'));
  assert.ok(text.includes('21.08.2026'));
});

test('qiymat va me\'yor matn sifatida (belgilash mumkin)', () => {
  const text = allText(buildResultDocDefinition(cbc, 'uz'));
  assert.ok(text.includes('3.9 — 5.6'));
  assert.ok(text.includes('g/L'));
});

test('24 ko\'rsatkich bitta betga sig\'adigan zichlik', () => {
  const dd = buildResultDocDefinition(cbc, 'uz');
  // 24 ta uchun shrift 7.6 pt dan oshmaydi (A4 da bitta betga sig'adi).
  assert.ok(dd.defaultStyle.fontSize <= 7.6, `fontSize=${dd.defaultStyle.fontSize}`);
});

test('kam ko\'rsatkichda shrift kattaroq (o\'qishga qulay)', () => {
  const few = { ...cbc, items: cbc.items.slice(0, 6) };
  const dd = buildResultDocDefinition(few, 'uz');
  assert.ok(dd.defaultStyle.fontSize >= 9, `fontSize=${dd.defaultStyle.fontSize}`);
});

test('PDF matnida ʻ/ʼ modifikator harflari qolmaydi (tofu bo\'lmaydi)', () => {
  const text = allText(buildResultDocDefinition(cbc, 'uz'));
  assert.ok(!/[ʻʼ‘’]/.test(text), 'maxsus apostrof qolib ketdi');
});

test('me\'yordan tashqari ko\'rsatkichlar soni bannerda', () => {
  // Bitta "high" + bitta "low" = 2 ta me'yordan tashqari.
  const text = allText(buildResultDocDefinition(cbc, 'uz'));
  assert.ok(text.includes('2'), 'banner me\'yordan tashqari sonini ko\'rsatishi kerak');
});

test('holatlar tanlangan tilda ko\'rinadi', () => {
  const ru = allText(buildResultDocDefinition(cbc, 'ru'));
  assert.ok(ru.includes('Выше') && ru.includes('Ниже'));
});

test('fayl nomi slug — modifikator apostrofsiz', () => {
  assert.equal(fileSlug('Yoʻldoshev Anvar'), 'Yoldoshev_Anvar');
  assert.equal(fileSlug(''), 'bemor');
});

test('haqiqiy logotip (SVG vektor) bor — oddiy matn emas', () => {
  const dd = buildResultDocDefinition(cbc, 'uz');
  assert.ok(allText(dd).includes('[SVG]'));
  const svg = dd.content.flatMap((n) => n.columns ?? []).flatMap((c) => c.stack ?? []).find((n) => n.svg);
  assert.ok(svg.svg.startsWith('<svg'), 'SVG satri');
  assert.ok(!svg.svg.includes('<style'), 'pdfmake <style> sinflarini bilmaydi — ranglar atributda');
  assert.ok(svg.svg.includes('#d5006f') && svg.svg.includes('#579b47'), 'brend ranglari');
});

test('yuborgan shifokor bo\'lmasa uning katagi umuman chiqmaydi', () => {
  const upper = (dd) => allText(dd).toUpperCase();
  assert.ok(upper(buildResultDocDefinition(cbc, 'uz')).includes('YUBORGAN SHIFOKOR'));
  assert.ok(allText(buildResultDocDefinition(cbc, 'uz')).includes('Ashurov B.'));
  for (const doctor of [null, '', '   ']) {
    const dd = buildResultDocDefinition({ ...cbc, doctor }, 'uz');
    assert.ok(!upper(dd).includes('YUBORGAN SHIFOKOR'), `doctor=${JSON.stringify(doctor)}`);
    // Namuna ma'lumoti butun qatorni egallaydi (2 ustunga cho'ziladi).
    const sampleCell = dd.content.find((n) => n.table?.widths?.length === 2).table.body[1][0];
    assert.equal(sampleCell.colSpan, 2);
  }
});

test('shkala: me\'yor oralig\'i o\'rtada, nuqta qiymatga qarab (sahifadagi bilan bir xil)', () => {
  const at = (v) => gaugePosition(v, 3.9, 5.6);
  assert.ok(Math.abs(at(4.75) - 50) < 1e-9, 'oraliq o\'rtasi — 50 %');
  assert.ok(Math.abs(at(3.9) - 25) < 1e-9, 'pastki chegara — 25 %');
  assert.ok(Math.abs(at(5.6) - 75) < 1e-9, 'yuqori chegara — 75 %');
  assert.equal(at(-10), 2, 'chekkadan chiqsa qisqartiriladi');
  assert.equal(at(99), 98);
  assert.equal(gaugePosition(null, 3.9, 5.6), null, 'qiymat son emas');
  assert.equal(gaugePosition(4, null, 5.6), null, 'pastki chegara yo\'q');
  assert.equal(gaugePosition(4, 5.6, 3.9), null, 'chegaralar teskari');
  assert.equal(parseNumber('5,2'), 5.2);
  assert.equal(parseNumber('<0.5'), 0.5);
  assert.equal(parseNumber('manfiy'), null);
});

test('vizual ko\'rsatkich (shkala) faqat sonli qiymat va me\'yori borlarga chiziladi', () => {
  const canvasCount = (result) =>
    allText(buildResultDocDefinition(result, 'uz')).split('[CANVAS]').length - 1;
  // Sarlavhadagi ajratuvchi chiziq ham canvas — hisobdan chiqarib tashlaymiz.
  const base = canvasCount(cbc);
  assert.equal(base, 1, 'me\'yor chegarasi yo\'q — shkala yo\'q (faqat ajratuvchi chiziq)');

  const withRefs = {
    ...cbc,
    items: cbc.items.map((i, k) => ({
      ...i,
      refLow: 3.9,
      refHigh: 5.6,
      value: k === 0 ? 'musbat' : i.value,
    })),
  };
  assert.equal(canvasCount(withRefs) - base, cbc.items.length - 1, 'matnli qiymatga shkala chizilmaydi');
  assert.ok(allText(buildResultDocDefinition(withRefs, 'uz')).toUpperCase().includes('VIZUAL'), 'ustun sarlavhasi bor');
});

test('QR kod tekshirish havolasi bilan; havola bo\'lmasa QR yo\'q', () => {
  const url = 'https://dimed.uz/tekshirish?v=abc.def';
  assert.ok(allText(buildResultDocDefinition({ ...cbc, verifyUrl: url }, 'uz')).includes(`[QR ${url}]`));
  assert.ok(!allText(buildResultDocDefinition(cbc, 'uz')).includes('[QR'));
  assert.ok(!allText(buildResultDocDefinition({ ...cbc, verifyUrl: null }, 'uz')).includes('[QR'));
  assert.ok(allText(buildResultDocDefinition({ ...cbc, verifyUrl: url }, 'ru')).includes('QR'), 'izoh ruscha ham');
});

/*
  Haqiqiy chizish (pdfmake, node): ta'rif emas, betlarga qanday tushishi.
  31 ko'rsatkichli siydik tahlilida QR kod yolg'iz 2-betga tushib qolgan edi.
*/
const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake');
const vfs = require('pdfmake/build/vfs_fonts.js');
const font = (name) => Buffer.from(vfs[name], 'base64');
const printer = new PdfPrinter({
  Roboto: {
    normal: font('Roboto-Regular.ttf'),
    bold: font('Roboto-Medium.ttf'),
    italics: font('Roboto-Italic.ttf'),
    bolditalics: font('Roboto-MediumItalic.ttf'),
  },
});

/** Betlar soni va matn qaysi betda (1 dan) — `_pdfMakePages` dan. */
function layOut(result) {
  const pages = printer.createPdfKitDocument(buildResultDocDefinition(result, 'uz'))._pdfMakePages;
  const pageOf = (needle) =>
    pages.findIndex((p) =>
      p.items.some((it) => it.type === 'line' && it.item.inlines.map((i) => i.text).join('').includes(needle)),
    ) + 1;
  return { pages: pages.length, pageOf };
}

const withItems = (n) => ({
  ...cbc,
  verifyUrl: 'https://dimed.uz/tekshirish?v=eyJpZCI6IjEyMzQ1Njc4OTAifQ.c2lnbmF0dXJlLWZvci1xci10ZXN0',
  items: Array.from({ length: n }, (_, i) => ({
    title: `Ko'rsatkich ${i + 1}`, value: String(4 + i), unit: 'g/L', reference: '3.9 — 5.6',
    refLow: 3.9, refHigh: 5.6, status: 'normal',
  })),
});

test('36 tagacha ko\'rsatkich QR kod bilan birga bitta betga sig\'adi', () => {
  for (const n of [6, 12, 18, 24, 31, 36]) {
    const doc = layOut(withItems(n));
    assert.equal(doc.pages, 1, `${n} ta ko'rsatkich: ${doc.pages} bet`);
    assert.equal(doc.pageOf('QR'), 1, `${n} ta: QR 1-betda`);
  }
});

test('joy yetmasa QR izohdan ajralmaydi (birga keyingi betga o\'tadi)', () => {
  for (const n of [40, 50, 70]) {
    const doc = layOut(withItems(n));
    assert.equal(doc.pageOf('QR'), doc.pageOf('Muhim eslatma'), `${n} ta: QR va izoh bir betda`);
  }
});

test('birlik faqat sonli qiymatga yoziladi ("manfiy g/L" chiqmaydi)', () => {
  const item = (value) => ({ title: 'Oqsil', value, unit: 'g/L', reference: null, status: null });
  assert.ok(!allText(buildResultDocDefinition({ ...cbc, items: [item('manfiy')] }, 'uz')).includes('g/L'));
  assert.ok(allText(buildResultDocDefinition({ ...cbc, items: [item('5.2')] }, 'uz')).includes('g/L'));
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
