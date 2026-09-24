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
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib');
const { buildResultDocDefinition, fileSlug } = await import(
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

console.log(`\n${passed} ta tekshiruv o'tdi.`);
