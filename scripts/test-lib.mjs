/**
 * netlify/functions/lib dagi haqiqiy modullar uchun tekshiruvlar.
 * Ishlatish: npm test
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.SESSION_SECRET = 'test-secret-kamida-32-belgi-boladi!!';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions', 'lib');
const load = (file) => import(pathToFileURL(join(libDir, file)).href);

const { createSessionCookie, readSession, generateOtp } = await load('session.ts');
const { normalizePhone } = await load('http.ts');
const { tableName, awsCredentials } = await load('env.ts');
const { escapeHtml } = await load('telegram.ts');
const { botText } = await load('i18n.ts');

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

const cookieValue = (setCookieHeader) => setCookieHeader.split(';')[0];

console.log('Sessiya:');
test("to'g'ri cookie o'qiladi", () => {
  const s = readSession(cookieValue(createSessionCookie({ phone: '+998901234567', userId: '111' })));
  assert.equal(s.phone, '+998901234567');
  assert.equal(s.userId, '111');
});

test("cookie xavfsizlik bayroqlari o'rnatilgan", () => {
  const header = createSessionCookie({ phone: '+998901234567', userId: '111' });
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
    assert.ok(header.includes(flag), `${flag} yo'q`);
  }
});

test('buzilgan imzo rad etiladi', () => {
  const cookie = cookieValue(createSessionCookie({ phone: '+998901234567', userId: '111' }));
  assert.equal(readSession(cookie.slice(0, -3) + 'AAA'), null);
});

test('qalbaki payload rad etiladi', () => {
  const evil = Buffer.from(
    JSON.stringify({ phone: '+998900000000', userId: '999', exp: 9999999999 }),
  ).toString('base64url');
  assert.equal(readSession(`dimed_session=${evil}.qalbaki`), null);
});

test("muddati o'tgan sessiya rad etiladi", () => {
  // Haqiqiy imzo bilan, lekin eskirgan exp.
  const cookie = cookieValue(createSessionCookie({ phone: '+998901234567', userId: '1' }));
  const [name, token] = cookie.split('=');
  const [payload, sig] = token.split('.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.ok(data.exp > Math.floor(Date.now() / 1000), 'yangi cookie muddati kelajakda emas');
  // Payloadni o'zgartirsak imzo mos kelmaydi — bu ham rad etilishi kerak.
  const expired = Buffer.from(JSON.stringify({ ...data, exp: 1 })).toString('base64url');
  assert.equal(readSession(`${name}=${expired}.${sig}`), null);
});

test("cookie yo'q bo'lsa null", () => {
  assert.equal(readSession(undefined), null);
  assert.equal(readSession('boshqa=qiymat'), null);
  assert.equal(readSession('dimed_session=imzosiz'), null);
});

test("boshqa cookie'lar orasidan topiladi", () => {
  const cookie = cookieValue(createSessionCookie({ phone: '+998901234567', userId: '7' }));
  assert.equal(readSession(`_ga=1; ${cookie}; other=2`).userId, '7');
});

console.log('Telefon:');
for (const [input, expected] of [
  ['+998 90 123 45 67', '+998901234567'],
  ['998901234567', '+998901234567'],
  ['901234567', '+998901234567'],
  ['90 123 45 67', '+998901234567'],
]) {
  test(`"${input}" -> ${expected}`, () => assert.equal(normalizePhone(input), expected));
}

console.log('OTP:');
test('har doim 6 xonali', () => {
  for (let i = 0; i < 2000; i++) assert.match(generateOtp(), /^\d{6}$/);
});

test('takrorlanmaydi (2000 tadan kamida 1900 xil)', () => {
  const set = new Set();
  for (let i = 0; i < 2000; i++) set.add(generateOtp());
  assert.ok(set.size > 1900, `faqat ${set.size} xil kod`);
});

console.log('Jadval nomlari:');
test('prefiks qo\'shiladi', () => assert.equal(tableName('users'), 'dimed_users'));

console.log('\nTelegram HTML:');
test('escapeHtml faqat &, < va > ni almashtiradi', () => {
  assert.equal(escapeHtml('a < b && c > d'), 'a &lt; b &amp;&amp; c &gt; d');
  assert.equal(escapeHtml('Yo‘ldosheva "Nilufar"'), 'Yo‘ldosheva "Nilufar"');
});

test('botText qiymatlarni ekranlaydi, shablon teglari saqlanadi', () => {
  // Tahlil nomidagi `<`/`&` Telegram'da butun xabarni rad ettirardi.
  const text = botText('result.ready', 'uz', {
    title: 'Ca & Mg <qon>',
    date: '01.02.2026',
    link: 'https://dimed.uz/natija?t=a.b',
  });
  assert.ok(text.includes('Ca &amp; Mg &lt;qon&gt;'), text);
  assert.ok(text.startsWith('🧪 <b>'), 'shablondagi <b> tegi o\'zgarmasligi kerak');
  assert.ok(text.includes('https://dimed.uz/natija?t=a.b'));
});

test('botText berilmagan qiymat joyini o\'zgarishsiz qoldiradi', () => {
  assert.ok(botText('rate.thanks', 'uz', {}).includes('{stars}'));
});

console.log('\nAWS kalitlari:');
/*
  Netlify AWS_ACCESS_KEY_ID va AWS_SECRET_ACCESS_KEY nomlarini band
  qilgan, shuning uchun DIMED_ prefiksli nomlar ham qabul qilinadi.
*/
const withEnv = (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const NONE = {
  DIMED_AWS_ACCESS_KEY_ID: undefined,
  DIMED_AWS_SECRET_ACCESS_KEY: undefined,
  AWS_ACCESS_KEY_ID: undefined,
  AWS_SECRET_ACCESS_KEY: undefined,
  // Lambda ichidami — zaxira nomlarga tayanish qoidasi shunga bog'liq.
  AWS_LAMBDA_FUNCTION_NAME: undefined,
};

test('DIMED_ nomlari o\'qiladi', () => {
  const creds = withEnv(
    { ...NONE, DIMED_AWS_ACCESS_KEY_ID: 'AKIA_D', DIMED_AWS_SECRET_ACCESS_KEY: 'sirD' },
    awsCredentials,
  );
  assert.deepEqual(creds, { accessKeyId: 'AKIA_D', secretAccessKey: 'sirD' });
});

test('standart nomlar zaxira sifatida ishlaydi', () => {
  const creds = withEnv(
    { ...NONE, AWS_ACCESS_KEY_ID: 'AKIA_S', AWS_SECRET_ACCESS_KEY: 'sirS' },
    awsCredentials,
  );
  assert.deepEqual(creds, { accessKeyId: 'AKIA_S', secretAccessKey: 'sirS' });
});

test('ikkalasi bo\'lsa DIMED_ ustun turadi', () => {
  const creds = withEnv(
    {
      DIMED_AWS_ACCESS_KEY_ID: 'AKIA_D',
      DIMED_AWS_SECRET_ACCESS_KEY: 'sirD',
      AWS_ACCESS_KEY_ID: 'AKIA_S',
      AWS_SECRET_ACCESS_KEY: 'sirS',
    },
    awsCredentials,
  );
  assert.deepEqual(creds, { accessKeyId: 'AKIA_D', secretAccessKey: 'sirD' });
});

test('kalit yo\'q bo\'lsa undefined — SDK o\'z zanjiriga tayanadi', () => {
  assert.equal(withEnv(NONE, awsCredentials), undefined);
});

test('faqat yarmi berilsa ham undefined', () => {
  const creds = withEnv({ ...NONE, DIMED_AWS_ACCESS_KEY_ID: 'AKIA_D' }, awsCredentials);
  assert.equal(creds, undefined, 'chala kalit bilan mijoz yaratilmasin');
});

test('nusxalashda ilashgan probel va qator olib tashlanadi', () => {
  const creds = withEnv(
    {
      ...NONE,
      DIMED_AWS_ACCESS_KEY_ID: ' AKIA_D\n',
      DIMED_AWS_SECRET_ACCESS_KEY: 'sirD ',
    },
    awsCredentials,
  );
  assert.deepEqual(creds, { accessKeyId: 'AKIA_D', secretAccessKey: 'sirD' });
});

test('Lambda ichida sozlanmagan bo\'lsa tushunarli xato', () => {
  /*
    Lambda o'zining vaqtinchalik kalitlarini standart nomlarga qo'yadi.
    Ularga tayansak, AWS "security token invalid" deydi va sabab
    (sozlama yo'qligi) yashirin qoladi.
  */
  assert.throws(
    () =>
      withEnv(
        {
          ...NONE,
          AWS_LAMBDA_FUNCTION_NAME: 'dimed-slots',
          AWS_ACCESS_KEY_ID: 'ASIA_LAMBDA',
          AWS_SECRET_ACCESS_KEY: 'vaqtinchalik',
        },
        awsCredentials,
      ),
    /DIMED_AWS_ACCESS_KEY_ID/,
  );
});

test('Lambda ichida DIMED_ kalitlari bo\'lsa ishlaydi', () => {
  const creds = withEnv(
    {
      ...NONE,
      AWS_LAMBDA_FUNCTION_NAME: 'dimed-slots',
      DIMED_AWS_ACCESS_KEY_ID: 'AKIA_D',
      DIMED_AWS_SECRET_ACCESS_KEY: 'sirD',
    },
    awsCredentials,
  );
  assert.deepEqual(creds, { accessKeyId: 'AKIA_D', secretAccessKey: 'sirD' });
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
