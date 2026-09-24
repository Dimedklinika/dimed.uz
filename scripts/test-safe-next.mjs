/**
 * Kirishdan keyingi qaytish manzili (src/lib/safe-next.ts).
 * Ishlatish: node --experimental-strip-types scripts/test-safe-next.mjs
 */
import assert from 'node:assert/strict';
import { safeNext } from '../src/lib/safe-next.ts';

const ORIGIN = 'https://dimed.uz';

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

/** Brauzer `location.href = result` qilganda qayerga boradi. */
const landsOn = (result) => new URL(result, ORIGIN).origin;

console.log('Kirishdan keyingi manzil:');

test("saytdagi yo'l so'rov va xeshi bilan saqlanadi", () => {
  assert.equal(safeNext('/kabinet/navbatlar', ORIGIN), `${ORIGIN}/kabinet/navbatlar`);
  assert.equal(safeNext('/natija?id=abc#x', ORIGIN), `${ORIGIN}/natija?id=abc#x`);
});

test("next bo'lmasa — standart manzil", () => {
  assert.equal(safeNext(null, ORIGIN), '/kabinet');
  assert.equal(safeNext('', ORIGIN), '/kabinet');
  assert.equal(safeNext(undefined, ORIGIN, '/boshqa'), '/boshqa');
});

test('begona saytga yo\'naltirib bo\'lmaydi', () => {
  const attacks = [
    '//evil.com',
    '/\\evil.com', // teskari chiziq: brauzer uni "/" deb o'qiydi
    '/\t/evil.com', // tab: brauzer tashlab yuboradi → //evil.com
    '/\n/evil.com', // qator belgisi ham
    '/\t\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ];
  for (const next of attacks) {
    assert.equal(safeNext(next, ORIGIN), '/kabinet', `${JSON.stringify(next)} rad etilishi kerak`);
  }
});

test("URL'da kodlangan hujum ham to'xtaydi (URLSearchParams orqali)", () => {
  for (const query of ['next=/%09/evil.com', 'next=/%5Cevil.com', 'next=%2F%2Fevil.com']) {
    const next = new URLSearchParams(query).get('next');
    assert.equal(landsOn(safeNext(next, ORIGIN)), ORIGIN, `${query} saytdan chiqmasligi kerak`);
  }
});

test("yo'l qisqartirilib // ga aylansa ham saytdan chiqmaydi", () => {
  // Faqat yo'l qaytarilsa "//evil.com" chiqib, begona saytga olib ketardi.
  const result = safeNext('/kabinet/../..//evil.com', ORIGIN);
  assert.equal(landsOn(result), ORIGIN);
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
