/**
 * Ko'rsatkichlar referens (me'yoriy) oralig'i — `netlify/functions/lib/references.ts`.
 *
 * Admin kiritgan oraliqlar 1C bermagan analitlarga qo'llanadi. Qidiruv
 * nom + jins bo'yicha: avval jinsga xos, topilmasa umumiy ("all").
 *
 * Ishlatish: node --experimental-strip-types scripts/test-references.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions', 'lib');
const { referenceId, buildReferenceLookup, isGender, unitKey } = await import(
  pathToFileURL(join(libDir, 'references.ts')).href
);

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

const row = (name, gender, low, high, unit) => ({ item_id: referenceId(name, gender), kind: 'reference', name, gender, low, high, unit });

console.log('Referens oraliqlari:');

test('kalit nom+jins bo\'yicha, apostrof/harf muhim emas', () => {
  assert.equal(referenceId('Gemoglobin', 'male'), 'reference#gemoglobin#male');
  assert.equal(referenceId('  GEMOGLOBIN ', 'all'), 'reference#gemoglobin#all');
  assert.equal(referenceId('Eritrotsitlar oʻrtacha hajmi', 'all'), 'reference#eritrotsitlarortachahajmi#all');
});

test('isGender faqat male/female/all ni qabul qiladi', () => {
  assert.ok(isGender('male') && isGender('female') && isGender('all'));
  assert.ok(!isGender('other') && !isGender('') && !isGender(undefined));
});

test('jinsga xos oraliq ustun', () => {
  const lookup = buildReferenceLookup([
    row('Gemoglobin', 'male', 130, 170, 'g/L'),
    row('Gemoglobin', 'female', 120, 150, 'g/L'),
  ]);
  assert.deepEqual(lookup('Gemoglobin', 'male'), { low: 130, high: 170, unit: 'g/L' });
  assert.deepEqual(lookup('gemoglobin', 'female'), { low: 120, high: 150, unit: 'g/L' });
});

test('jins berilmasa yoki mos yo\'q — "all" ga tushadi', () => {
  const lookup = buildReferenceLookup([row('Glyukoza', 'all', 3.9, 6.1, 'mmol/L')]);
  assert.deepEqual(lookup('Glyukoza', null), { low: 3.9, high: 6.1, unit: 'mmol/L' });
  assert.deepEqual(lookup('Glyukoza', 'male'), { low: 3.9, high: 6.1, unit: 'mmol/L' });
});

test('bir tomonlama oraliq (faqat yuqori)', () => {
  const lookup = buildReferenceLookup([row('SRB', 'all', null, 5, 'mg/L')]);
  assert.deepEqual(lookup('SRB', null), { low: null, high: 5, unit: 'mg/L' });
});

test('topilmasa null', () => {
  const lookup = buildReferenceLookup([row('Glyukoza', 'all', 3.9, 6.1)]);
  assert.equal(lookup('Kreatinin', 'male'), null);
  assert.equal(lookup('', null), null);
});

console.log('\nBirlik:');

test('boshqa birlikdagi referens qo\'llanmaydi', () => {
  // 130–170 g/L bilan taqqoslansa 13.5 g/dL (me'yorda) "past" chiqardi.
  const lookup = buildReferenceLookup([
    row('Gemoglobin', 'male', 130, 170, 'g/L'),
    row('Glyukoza', 'all', 3.9, 6.1, 'mmol/L'),
  ]);
  assert.equal(lookup('Gemoglobin', 'male', 'g/dL'), null);
  assert.equal(lookup('Glyukoza', null, 'mg/dL'), null);
});

test('bir birlikning turli yozilishi mos keladi', () => {
  for (const [a, b] of [
    ['g/L', 'g/l'],
    ['г/л', 'g/L'],
    ['ммоль/л', 'mmol/L'],
    ['мкмоль/л', 'mkmol/l'],
    ['µmol/L', 'mkmol/l'],
    ['mcg/L', 'mkg/l'],
    ['10⁹/л', '10^9/L'],
    ['10*9/л', '10^9/L'],
  ]) {
    assert.equal(unitKey(a), unitKey(b), `${a} = ${b}`);
  }
  assert.notEqual(unitKey('mg/dL'), unitKey('mmol/L'));
  assert.notEqual(unitKey('mkg/l'), unitKey('mg/l'));

  const lookup = buildReferenceLookup([row('Kreatinin', 'all', 62, 106, 'мкмоль/л')]);
  assert.deepEqual(lookup('Kreatinin', null, 'mkmol/l'), { low: 62, high: 106, unit: 'мкмоль/л' });
});

test('birliklardan biri bo\'lmasa — avvalgidek qo\'llanadi', () => {
  const lookup = buildReferenceLookup([
    row('Gemoglobin', 'all', 120, 160, 'g/L'),
    row('Glyukoza', 'all', 3.9, 6.1),
  ]);
  assert.ok(lookup('Gemoglobin', null), 'natija birligi berilmagan');
  assert.ok(lookup('Gemoglobin', null, null));
  assert.ok(lookup('Gemoglobin', null, '  '));
  assert.ok(lookup('Glyukoza', null, 'mmol/L'), 'referens birligi kiritilmagan');
});

test('jinsga xos referens boshqa birlikda bo\'lsa, umumiysi olinadi', () => {
  const lookup = buildReferenceLookup([
    row('Gemoglobin', 'male', 130, 170, 'g/L'),
    row('Gemoglobin', 'all', 12, 16, 'g/dL'),
  ]);
  assert.deepEqual(lookup('Gemoglobin', 'male', 'g/dL'), { low: 12, high: 16, unit: 'g/dL' });
  assert.deepEqual(lookup('Gemoglobin', 'male', 'g/L'), { low: 130, high: 170, unit: 'g/L' });
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
