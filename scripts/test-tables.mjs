/**
 * Jadval ta'riflarini AWS'ga bormasdan tekshiradi.
 *
 * Sabab: `date-index` qo'shilganda `date` maydoni AttributeDefinitions
 * ro'yxatiga kiritilmagan edi. Xato faqat haqiqiy `CreateTable` da
 * chiqadi, ya'ni jadval yaratishga urinilgan paytda — o'shanda esa
 * `appointments` jadvali yaratilmasdan qolardi.
 *
 * DynamoDB ikki tomonlama qat'iy: kalit maydoni e'lon qilinmasa ham,
 * e'lon qilingan maydon hech qayerda ishlatilmasa ham rad etadi.
 *
 * Ishlatish: node scripts/test-tables.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tables } from './tables.mjs';
import { buildScript, loadDoctors, OUTPUT } from './gen-cloudshell-setup.mjs';

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

console.log('Jadval ta\'riflari:');

test('14 ta jadval', () => assert.equal(tables.length, 14));

test('har bir jadvalda nom, maydon va kalit bor', () => {
  for (const t of tables) {
    assert.ok(t.name, 'nom yo\'q');
    assert.ok(t.attrs?.length, `${t.name}: maydonlar yo'q`);
    assert.ok(t.keys?.length, `${t.name}: kalit yo'q`);
  }
});

test('barcha kalit maydonlari e\'lon qilingan', () => {
  for (const t of tables) {
    const declared = new Set(t.attrs.map((a) => a.AttributeName));

    for (const k of t.keys) {
      assert.ok(
        declared.has(k.AttributeName),
        `${t.name}: "${k.AttributeName}" kaliti AttributeDefinitions da yo'q`,
      );
    }

    for (const index of t.indexes ?? []) {
      for (const k of index.KeySchema) {
        assert.ok(
          declared.has(k.AttributeName),
          `${t.name}/${index.IndexName}: "${k.AttributeName}" AttributeDefinitions da yo'q`,
        );
      }
    }
  }
});

test('e\'lon qilingan har bir maydon biror kalitda ishlatilgan', () => {
  for (const t of tables) {
    const used = new Set([
      ...t.keys.map((k) => k.AttributeName),
      ...(t.indexes ?? []).flatMap((i) => i.KeySchema.map((k) => k.AttributeName)),
    ]);

    for (const a of t.attrs) {
      assert.ok(
        used.has(a.AttributeName),
        `${t.name}: "${a.AttributeName}" e'lon qilingan, lekin hech qayerda ishlatilmagan`,
      );
    }
  }
});

test('indeks nomlari takrorlanmaydi', () => {
  for (const t of tables) {
    const names = (t.indexes ?? []).map((i) => i.IndexName);
    assert.equal(new Set(names).size, names.length, `${t.name}: indeks nomi takrorlangan`);
  }
});

test('kodda ishlatiladigan indekslar mavjud', () => {
  const find = (name) => tables.find((t) => t.name === name);
  const indexNames = (name) => (find(name).indexes ?? []).map((i) => i.IndexName);

  // Bu indekslarga tayanadigan joylar: auth.ts, me.ts, cron'lar.
  assert.ok(indexNames('users').includes('phone-index'));
  assert.ok(indexNames('users').includes('code-index'), '1C profil sinxronizatsiyasi shunga tayanadi');
  assert.ok(indexNames('doctors').includes('telegram-index'));
  assert.ok(indexNames('appointments').includes('patient-index'));
  assert.ok(indexNames('appointments').includes('date-index'), 'cron eslatmalari shunga tayanadi');
  assert.ok(indexNames('visits').includes('date-index'), 'davomat cron\'i shunga tayanadi');
});

test('bemor ma\'lumoti bor jadvallarda zaxira nusxa yoqiladi', () => {
  const kutilgan = [
    'users', 'individuals', 'doctors', 'schedules', 'appointments',
    'analysis_results', 'payments', 'lab_results', 'prices', 'ratings', 'visits',
  ];
  const bor = tables.filter((t) => t.backup).map((t) => t.name);
  assert.deepEqual(bor.sort(), [...kutilgan].sort(), 'zaxirali jadvallar ro\'yxati');

  // Vaqtinchalik jadvallar zaxirasiz: ular TTL bilan o'zi o'chadi.
  const vaqtinchalik = tables.filter((t) => !t.backup).map((t) => t.name);
  assert.deepEqual(vaqtinchalik.sort(), ['login_sessions', 'otp_codes', 'rate_limits']);
  assert.ok(
    vaqtinchalik.every((n) => tables.find((t) => t.name === n).ttlAttribute),
    'zaxirasiz jadvalda TTL bo\'lishi kerak',
  );
});

test('otp_codes da TTL yoqiladi', () => {
  const otp = tables.find((t) => t.name === 'otp_codes');
  assert.equal(otp.ttlAttribute, 'expires_at');
});

// CloudShell skripti generatordan yaratiladi. Agar jadval ta'rifi
// yoki shifokorlar ro'yxati o'zgarib, fayl yangilanmasa — klinika
// AWS'da eski ma'lumot bilan qoladi va buni hech kim sezmaydi.
const doctors = await loadDoctors();

test('cloudshell-setup.sh manbaga mos', () => {
  const kutilgan = buildScript(tables, doctors);
  const hozirgi = readFileSync(OUTPUT, 'utf8');
  assert.equal(
    hozirgi,
    kutilgan,
    'scripts/cloudshell-setup.sh eskirgan — "npm run gen-cloudshell" ni ishga tushiring',
  );
});

test('cloudshell-setup.sh da hamma shifokor bor', () => {
  const matn = readFileSync(OUTPUT, 'utf8');
  for (const d of doctors) {
    assert.ok(matn.includes(`shifokor "${d.id}"`), `${d.id} skriptda yo'q`);
  }
});

test('faolsiz shifokor skriptda active=false bilan yoziladi', () => {
  // E3: ishdan bo'shagan shifokor bazadan o'chirilmaydi, lekin qayta
  // seed qilinganda ham saytda paydo bo'lib qolmasligi kerak.
  const matn = readFileSync(OUTPUT, 'utf8');
  const faolsiz = doctors.filter((d) => d.active === false);
  assert.ok(faolsiz.length >= 1, 'kamida bitta faolsiz shifokor kutilgan (murtazayeva)');
  for (const d of faolsiz) {
    const qator = matn.split('\n').find((l) => l.startsWith(`shifokor "${d.id}"`));
    assert.ok(qator?.includes('{"BOOL":false}'), `${d.id} skriptda active=false bo'lishi kerak`);
  }
});

test('cloudshell-setup.sh telegram_id ga tegmaydi', () => {
  const matn = readFileSync(OUTPUT, 'utf8');
  // Bog'lanish qo'lda qilinadi; seed uni o'chirib yubormasligi kerak.
  assert.ok(!/:v\d+.*telegram_id/.test(matn));
  assert.ok(!matn.includes('"telegram_id":{"S"'), 'telegram_id yozilyapti');
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
