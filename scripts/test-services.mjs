/**
 * Shifokorning qo'shimcha xizmatlari — `netlify/functions/lib/services.ts`.
 *
 * Admin xizmatlarni matn bilan kiritadi (har qatorda "Nomi | narx | 1C kodi | qayta:N");
 * bu fayl o'sha matnni tahlil qilish, qaytarish va xizmatni topishni tekshiradi.
 *
 * Ishlatish: node --experimental-strip-types scripts/test-services.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions', 'lib');
const { parseServices, formatServices, resolveService, toPublicServices, MAIN_SERVICE_ID, MAX_SERVICES } =
  await import(pathToFileURL(join(libDir, 'services.ts')).href);

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};
const ok = (text) => {
  const res = parseServices(text);
  assert.equal(res.ok, true, res.ok ? '' : res.error);
  return res.services;
};
const bad = (text) => {
  const res = parseServices(text);
  assert.equal(res.ok, false, `xato kutilgan edi: ${JSON.stringify(text)}`);
  return res.error;
};

console.log('Xizmatlarni matndan o\'qish:');

test('har qator bitta xizmat: nomi | narx | 1C kodi | qayta:N', () => {
  const list = ok("Massaj | 50000 | MS-1\nQayta ko'rik | bepul | qayta:14\nUZI | 120 000");
  assert.deepEqual(list, [
    { id: 'massaj', name: 'Massaj', price: 50000, code: 'MS-1' },
    { id: 'qayta-korik', name: "Qayta ko'rik", price: 0, followup_days: 14 },
    { id: 'uzi', name: 'UZI', price: 120000 },
  ]);
});

test('kod va qayta:N tartibi erkin, bo\'sh qismlar e\'tiborsiz', () => {
  assert.deepEqual(ok('Qayta | 0 | qayta:7 | K-9'), [
    { id: 'qayta', name: 'Qayta', price: 0, code: 'K-9', followup_days: 7 },
  ]);
  assert.deepEqual(ok("Qayta | bepul | | qayta:30"), [{ id: 'qayta', name: 'Qayta', price: 0, followup_days: 30 }]);
});

test('narx: "bepul", bo\'shliqli va nuqtali minglar', () => {
  assert.equal(ok('Xizmat | bepul')[0].price, 0);
  assert.equal(ok('Xizmat | 0')[0].price, 0);
  assert.equal(ok('Xizmat | 50 000')[0].price, 50000);
  assert.equal(ok('Xizmat | 50.000')[0].price, 50000);
  assert.equal(ok('Xizmat | 1,200,000')[0].price, 1200000);
});

test('bo\'sh matn — xizmat yo\'q (barchasini olib tashlash)', () => {
  assert.deepEqual(ok(''), []);
  assert.deepEqual(ok('  \n \r\n'), []);
  assert.deepEqual(ok(undefined), []);
  assert.deepEqual(ok(null), []);
});

test('kalit nomdan: o\'zbek apostrofi tushadi, takrorlansa raqam qo\'shiladi, "main" band', () => {
  const list = ok("Qorin bo'shlig'i UZI | 100000\nQorin bo'shlig'i UZI | 90000\nMain | 5000");
  assert.deepEqual(list.map((s) => s.id), ['qorin-boshligi-uzi', 'qorin-boshligi-uzi-2', 'main-2']);
  assert.ok(!list.some((s) => s.id === MAIN_SERVICE_ID), 'asosiy qabul kaliti band');
});

test('lotincha harfi yo\'q nom (kirill) — x1, x2 kalit oladi', () => {
  assert.deepEqual(ok('Массаж | 50000\nУЗИ | 90000').map((s) => s.id), ['x1', 'x2']);
});

console.log('\nXato matnlar:');

test('xato qator raqami bilan aytiladi', () => {
  assert.match(bad('Massaj | ellik ming'), /^1-qator: narx son/);
  assert.match(bad('Massaj | 50000\nXizmat'), /^2-qator: narx son/, 'narxi yo\'q qator');
  assert.match(bad('Massaj | 50000\n| 1000'), /^2-qator: xizmat nomi/);
  assert.match(bad(`${'x'.repeat(61)} | 1000`), /^1-qator: xizmat nomi/);
  assert.match(bad('Massaj | -5'), /^1-qator: narx/);
  assert.match(bad('Massaj | 100000001'), /^1-qator: narx/, 'juda katta narx');
});

test('qayta:N va ortiqcha qismlar tekshiriladi', () => {
  assert.match(bad('Xizmat | 0 | qayta:0'), /qayta:N/);
  assert.match(bad('Xizmat | 0 | qayta:400'), /qayta:N/);
  assert.match(bad('Xizmat | 0 | qayta:7 | qayta:9'), /ikki marta/);
  assert.match(bad('Xizmat | 0 | K1 | K2'), /ortiqcha qism/);
  assert.match(bad(`Xizmat | 0 | ${'k'.repeat(41)}`), /1C kodi/);
});

test('xizmatlar soni cheklangan', () => {
  const many = Array.from({ length: MAX_SERVICES + 1 }, (_, i) => `Xizmat ${i} | 1000`).join('\n');
  assert.match(bad(many), new RegExp(`${MAX_SERVICES} tadan`));
  ok(Array.from({ length: MAX_SERVICES }, (_, i) => `Xizmat ${i} | 1000`).join('\n'));
});

console.log('\nQaytarish, ochiq shakl va xizmatni topish:');

test('formatServices parseServices ning teskarisi (aylanma)', () => {
  const text = "Massaj | 50000 | MS-1\nQayta ko'rik | bepul | qayta:14\nUZI | 120000";
  assert.equal(formatServices(ok(text)), text);
  assert.equal(formatServices(undefined), '');
  assert.equal(formatServices([]), '');
  // Kod ham, qayta ham bo'lsa — ikkalasi o'z o'rnida.
  const both = 'Qayta | bepul | K-9 | qayta:7';
  assert.equal(formatServices(ok(both)), both);
});

test('ochiq shaklda 1C kodi ko\'rinmaydi', () => {
  const pub = toPublicServices(ok("Massaj | 50000 | MS-1\nQayta ko'rik | bepul | qayta:14"));
  assert.deepEqual(pub, [
    { id: 'massaj', name: 'Massaj', price: 50000, followupDays: null },
    { id: 'qayta-korik', name: "Qayta ko'rik", price: 0, followupDays: 14 },
  ]);
  assert.ok(pub.every((s) => !('code' in s)));
  assert.deepEqual(toPublicServices(undefined), []);
});

test('resolveService: berilmasa yoki main — shifokor narxi; noma\'lum — null', () => {
  const doctor = { price: 70000, services: ok("Massaj | 50000 | MS-1\nQayta ko'rik | bepul | qayta:14") };

  for (const none of [undefined, null, '', MAIN_SERVICE_ID]) {
    assert.deepEqual(resolveService(doctor, none), { id: 'main', name: '', price: 70000, main: true });
  }
  assert.deepEqual(resolveService(doctor, 'massaj'), {
    id: 'massaj', name: 'Massaj', price: 50000, code: 'MS-1', main: false,
  });
  assert.deepEqual(resolveService(doctor, 'qayta-korik'), {
    id: 'qayta-korik', name: "Qayta ko'rik", price: 0, followupDays: 14, main: false,
  });
  assert.equal(resolveService(doctor, 'yoq-xizmat'), null);
  assert.equal(resolveService(doctor, 42), null, 'matn bo\'lmagan id');
  assert.equal(resolveService({ price: 1 }, 'massaj'), null, 'xizmati yo\'q shifokorda tanlov yo\'q');
  assert.equal(resolveService({ price: 1 }, undefined).price, 1);
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
