/**
 * Tahlil/ko'rsatkich nomlari lug'ati — `netlify/functions/lib/analysis-dict.ts`.
 *
 * 1C ruscha yoki texnik nom yuborganda o'zbekcha rasmiy atamaga
 * o'giriladi; topilmasa asl nom saqlanadi (fallback). O'zbekcha nomlar
 * (Gemoglobin, Kreatinin, ...) o'zgarmasligi shart — aks holda mavjud
 * kabinet/PDF matnlari va API testlari buziladi.
 *
 * Ishlatish: node --experimental-strip-types scripts/test-analysis-dict.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions', 'lib');
const { translateAnalyte, translateAnalysisName } = await import(
  pathToFileURL(join(libDir, 'analysis-dict.ts')).href
);
const { detectPanel } = await import(pathToFileURL(join(libDir, 'panels.ts')).href);

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

console.log('Tahlil nomlari lug\'ati:');

// --- ko'rsatkich: ruscha → o'zbekcha ---
test('ruscha ko\'rsatkich o\'zbekchaga o\'giriladi', () => {
  assert.equal(translateAnalyte('Гемоглобин'), 'Gemoglobin');
  assert.equal(translateAnalyte('Билирубин общий'), 'Umumiy bilirubin');
  assert.equal(translateAnalyte('Общий билирубин'), 'Umumiy bilirubin');
  assert.equal(translateAnalyte('Мочевина'), 'Mochevina');
  assert.equal(translateAnalyte('Щелочная фосфатаза'), 'Ishqoriy fosfataza');
});

test('katta/kichik harf va ortiqcha bo\'shliq muhim emas', () => {
  assert.equal(translateAnalyte('гемоглобин'), 'Gemoglobin');
  assert.equal(translateAnalyte('  СОЭ  '), 'Eritrotsitlar choʻkish tezligi');
  assert.equal(translateAnalyte('С-реактивный белок'), 'C-reaktiv oqsil');
});

// --- o'zbekcha nomlar o'zgarmaydi (fallback) ---
test('o\'zbekcha nom o\'zgarmaydi', () => {
  assert.equal(translateAnalyte('Gemoglobin'), 'Gemoglobin');
  assert.equal(translateAnalyte('Kreatinin'), 'Kreatinin');
  assert.equal(translateAnalyte('Bilirubin'), 'Bilirubin'); // bare — o'zbekchaga tegilmaydi
  assert.equal(translateAnalyte('Leykotsitlar'), 'Leykotsitlar');
});

test('noma\'lum nom asl holida qoladi (fallback)', () => {
  assert.equal(translateAnalyte('Ferritin'), 'Ferritin');
  assert.equal(translateAnalyte('2345-7'), '2345-7');
  assert.equal(translateAnalyte(''), '');
});

// --- tahlil (panel) nomi ---
test('ruscha panel nomi → o\'zbekcha + lug\'at kaliti', () => {
  assert.deepEqual(translateAnalysisName('Общий анализ крови'), { title: 'Umumiy qon tahlili', key: 'panel.cbc' });
  assert.deepEqual(translateAnalysisName('ОАК'), { title: 'Umumiy qon tahlili', key: 'panel.cbc' });
  assert.deepEqual(translateAnalysisName('Биохимический анализ крови'), { title: 'Biokimyoviy qon tahlili', key: 'panel.biochem' });
  assert.deepEqual(translateAnalysisName('Коагулограмма'), { title: 'Koagulogramma', key: 'panel.coagulogram' });
});

test('o\'zbekcha kanonik panel nomi kalit oladi (ko\'p tilli sarlavha)', () => {
  assert.deepEqual(translateAnalysisName('Umumiy qon tahlili'), { title: 'Umumiy qon tahlili', key: 'panel.cbc' });
});

test('noma\'lum panel nomi asl holida, kalitsiz', () => {
  assert.deepEqual(translateAnalysisName('Maxsus tekshiruv'), { title: 'Maxsus tekshiruv' });
});

// --- bonus: ruscha analytlar o'girilgach panel tanildi ---
test('ruscha CBC analytlari o\'girilgach panel tanildi', () => {
  const ru = ['Гемоглобин', 'Эритроциты', 'Лейкоциты', 'Тромбоциты', 'Гематокрит', 'СОЭ'];
  const uz = ru.map(translateAnalyte);
  assert.equal(detectPanel(uz)?.key, 'panel.cbc');
  // o'girilmasa (asl ruscha) — tanilmaydi
  assert.equal(detectPanel(ru), null);
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
