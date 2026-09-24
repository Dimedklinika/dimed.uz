/**
 * API funksiyalarini haqiqiy HTTP so'rovlari bilan tekshiradi.
 *
 * DynamoDB, S3 va Telegram o'rniga xotiradagi soxta xizmatlar ishlatiladi:
 * AWS SDK ning "endpoint" sozlamasi orqali lokal serverga yo'naltiriladi,
 * global fetch esa Telegram chaqiruvlarini ushlab qoladi.
 *
 * Ishlatish: npm run test:api
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fnDir = join(root, 'netlify', 'functions');

// --- muhit ---
process.env.SESSION_SECRET = 'test-secret-kamida-32-belgi-boladi!!';
process.env.DIMED_TABLE_PREFIX = 'test';
process.env.DIMED_AWS_REGION = 'eu-central-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-secret';
process.env.LC_API_KEY = 'lc-secret';
process.env.PAYME_MERCHANT_ID = 'test-kassa';
process.env.PAYME_KEY = 'payme-secret';
process.env.ADMIN_TELEGRAM_IDS = '424242';

import { startFakeDynamo, stopFakeDynamo, seed, tableOf, callCount } from './fake-dynamo.mjs';

process.env.DIMED_DYNAMO_ENDPOINT = await startFakeDynamo();

// --- Telegram chaqiruvlarini ushlash ---
const telegramCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('api.telegram.org')) {
    telegramCalls.push({ url, body: JSON.parse(init?.body ?? '{}') });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return realFetch(input, init);
};

// --- yuklash ---
const load = (name) => import(pathToFileURL(join(fnDir, name)).href).then((m) => m.default);
const { createSessionCookie } = await import(
  pathToFileURL(join(fnDir, 'lib', 'session.ts')).href
);

const telegramWebhook = await load('telegram-webhook.ts');
const authVerify = await load('auth-verify.ts');
const authStart = await load('auth-start.ts');
const slots = await load('slots.ts');
const book = await load('book.ts');
const me = await load('me.ts');
const doctorSchedule = await load('doctor-schedule.ts');
const lcResults = await load('lc-results.ts');
const reschedule = await load('reschedule.ts');
const cancelApi = await load('cancel.ts');
const doctorOff = await load('doctor-off.ts');
const remindPatients = await load('remind-patients.ts');
const doctorDaily = await load('doctor-daily.ts');
const doctorsList = await load('doctors.ts');
const adminDoctors = await load('admin-doctors.ts');
const paymentWebhook = await load('payment-webhook.ts');
const patientsApi = await load('patients.ts');
const sessionApi = await load('session.ts');
const settingsApi = await load('settings.ts');
const resultApi = await load('result.ts');
const appointmentStatus = await load('appointment-status.ts');
const pricesApi = await load('prices.ts');
const adminPrices = await load('admin-prices.ts');
const adminReferences = await load('admin-references.ts');
const notifyResults = await load('notify-results.ts');
const askRatings = await load('ask-ratings.ts');
const adminRatings = await load('admin-ratings.ts');
const adminAppointments = await load('admin-appointments.ts');
const syncAttendance = await load('sync-attendance.ts');
const { createShareToken } = await import(pathToFileURL(join(fnDir, 'lib', 'share.ts')).href);

const { toTashkent, toInstant, addDays } = await import(
  pathToFileURL(join(fnDir, 'lib', 'time.ts')).href
);
const { toHHMM } = await import(pathToFileURL(join(fnDir, 'lib', 'slots.ts')).href);

const ctx = {};
const call = (fn, url, init) => fn(new Request(url, init), ctx);
const jsonBody = (obj) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(obj),
});

let passed = 0;
const test = async (name, fn) => {
  await fn();
  console.log(`  ok  ${name}`);
  passed++;
};

// --- ma'lumot tayyorlash ---
/*
  Bron stsenariylari uchun sana. Toshkent kalendari bo'yicha olinadi —
  kun kalitlari ham shunday hisoblanadi, UTC bo'yicha olinsa kechqurun
  (Toshkentda 19:00 dan keyin) sana bir kunga adashardi.

  Ikki kun oldinga: eslatma testi «hozirdan 30 daqiqa keyin» yozuv
  qo'yadi, Toshkentda yarim tunga yaqin u ertangi kunga tushib qolardi
  va «shifokor chiqmadi» testi ikkita navbatni bekor qilib yuborardi.
*/
const BOOK_DATE = addDays(toTashkent(new Date()).dateKey, 2);

seed('test_doctors', 'ashurov', {
  doctor_id: 'ashurov',
  name: 'Ashurov Tursunali',
  job: 'Terapevt',
  dept_id: 'terapiya',
  telegram_id: '555',
  slot_minutes: 60,
  shifts: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
  workdays: [0, 1, 2, 3, 4, 5, 6],
  price: 70000,
  active: true,
});

console.log('Telegram bot va OTP:');
await test('webhook noto\'g\'ri secret bilan rad etiladi', async () => {
  // 'webhook-secreX' — to'g'risi bilan bir xil uzunlikda (taqqoslash
  // oxirigacha boradi); sarlavhasiz so'rov ham 500 emas, 401 olishi kerak.
  for (const given of ['yolgon', 'webhook-secreX', undefined]) {
    const res = await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
      ...jsonBody({ message: { chat: { id: 1 }, text: '/start' } }),
      headers: {
        'content-type': 'application/json',
        ...(given === undefined ? {} : { 'x-telegram-bot-api-secret-token': given }),
      },
    });
    assert.equal(res.status, 401, String(given));
  }
});

await test('kontakt yuborilganda foydalanuvchi va OTP yaratiladi', async () => {
  telegramCalls.length = 0;
  const res = await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: { chat: { id: 777 }, contact: { phone_number: '998901234567', user_id: 777, first_name: 'Aziza' } },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_users').get('777').phone, '+998901234567');
  const otp = tableOf('test_otp_codes').get('+998901234567');
  assert.match(otp.code, /^\d{6}$/);
  assert.ok(telegramCalls.some((c) => c.body.text.includes(otp.code)), 'kod botga yuborilishi kerak');
});

await test('begona kontakt (user_id yuboruvchiga mos kelmaydi) rad etiladi', async () => {
  // Hujum: birov botga BEGONA raqamli kontaktni yuboradi (attachment →
  // Contact). Agar qabul qilinsa, o'sha telefon uchun kod olib, begona
  // hisobga kirib bo'lardi. user_id mos kelmagani uchun rad etilishi kerak.
  telegramCalls.length = 0;
  const res = await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: {
        chat: { id: 66601 },
        from: { id: 66601 },
        contact: { phone_number: '998900000001', user_id: 424243, first_name: 'Begona' },
      },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_users').get('66601'), undefined, 'begona hisob yaratilmasligi kerak');
  assert.equal(tableOf('test_otp_codes').get('+998900000001'), undefined, 'begona raqamga kod yaratilmasligi kerak');
  assert.ok(
    !telegramCalls.some((c) => /kirish kodingiz/.test(c.body.text ?? '')),
    'kod yuborilmasligi kerak',
  );
  assert.ok(
    telegramCalls.some((c) => c.body.reply_markup?.keyboard),
    'o\'z raqamini ulashish tugmasi qaytishi kerak',
  );

  // user_id umuman bo'lmagan kontakt ham rad etiladi (Telegram'da yo'q raqam).
  telegramCalls.length = 0;
  await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: {
        chat: { id: 66602 },
        from: { id: 66602 },
        contact: { phone_number: '998900000002', first_name: 'Begona2' },
      },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  assert.equal(tableOf('test_otp_codes').get('+998900000002'), undefined, 'user_id\'siz kontakt ham rad etilishi kerak');
});

const tgMessage = (message) =>
  call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({ message }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });

await test('chet el raqami begona O\'zbek raqamiga aylanmaydi — rad etiladi', async () => {
  // Avval +7 999 123 45 67 "oxirgi 9 xona + 998" qilib +998 99 123 45 67
  // ga aylanardi — bu begona bemorning raqami. 9 xonali chet el raqami
  // (688901234) esa hatto parsePhone'dan o'tib ketardi.
  telegramCalls.length = 0;
  for (const [chatId, phone] of [[66603, '79991234567'], [66604, '688901234']]) {
    await tgMessage({ chat: { id: chatId }, contact: { phone_number: phone, user_id: chatId, first_name: 'Chet' } });
    assert.equal(tableOf('test_users').get(String(chatId)), undefined, `${phone}: hisob yaratilmasligi kerak`);
  }
  assert.equal(tableOf('test_otp_codes').get('+998991234567'), undefined, 'begona O\'zbek raqamiga kod yaratilmasligi kerak');
  assert.equal(tableOf('test_otp_codes').get('+998688901234'), undefined);
  assert.ok(telegramCalls.every((c) => !/kirish kodingiz/.test(c.body.text ?? '')), 'kod yuborilmasligi kerak');
  assert.ok(telegramCalls.some((c) => /O‘zbekiston raqami/.test(c.body.text ?? '')), 'sababi aytilishi kerak');
});

await test('chet el raqami ulashilsa, eski yozuvdagi begona raqam olib tashlanadi', async () => {
  // Oldingi kod +7 999 555 00 40 ni +998 99 555 00 40 qilib saqlagan bo'lishi
  // mumkin — o'sha bemorning natija xabarlari bu hisobga ketmasligi kerak.
  seed('test_users', '66607', { telegram_id: '66607', phone: '+998995550040', lang: 'ru' });
  await tgMessage({ chat: { id: 66607 }, contact: { phone_number: '79995550040', user_id: 66607, first_name: 'Chet' } });
  const user = tableOf('test_users').get('66607');
  assert.equal(user.phone, undefined, 'begona raqam yozuvdan olib tashlanishi kerak');
  assert.equal(user.lang, 'ru', 'qolgan sozlamalar saqlanadi');
  assert.equal(tableOf('test_otp_codes').get('+998995550040'), undefined);
});

await test('"+" bilan kelgan O\'zbek raqami qabul qilinadi', async () => {
  await tgMessage({ chat: { id: 66605 }, contact: { phone_number: '+998905550002', user_id: 66605, first_name: 'Plus' } });
  assert.equal(tableOf('test_users').get('66605').phone, '+998905550002');
  assert.match(tableOf('test_otp_codes').get('+998905550002').code, /^\d{6}$/);
});

await test('tasdiq belgisiz eski yozuv /start da kontaktni qayta ulashadi', async () => {
  // Avvalgi kod chet el raqamini begona O'zbek raqamiga aylantirib
  // saqlagan bo'lishi mumkin — bunday (tekshirilmagan) telefonga kod ketmaydi.
  seed('test_users', '66606', { telegram_id: '66606', phone: '+998905550003' });
  telegramCalls.length = 0;
  await tgMessage({ chat: { id: 66606 }, text: '/start' });
  assert.equal(tableOf('test_otp_codes').get('+998905550003'), undefined, 'tekshirilmagan telefonga kod ketmasligi kerak');
  assert.ok(
    telegramCalls.some((c) => c.body.reply_markup?.keyboard && /qayta tasdiqlang/.test(c.body.text ?? '')),
    'raqamni qayta tasdiqlash so\'ralishi kerak',
  );

  // Kontakt ulashilgach belgi qo'yiladi va keyingi /start darhol kod beradi.
  await tgMessage({ chat: { id: 66606 }, contact: { phone_number: '998905550003', user_id: 66606, first_name: 'Eski' } });
  assert.ok(tableOf('test_users').get('66606').contact_verified_at, 'tasdiq belgisi qo\'yilishi kerak');
  telegramCalls.length = 0;
  await tgMessage({ chat: { id: 66606 }, text: '/start' });
  assert.ok(telegramCalls.some((c) => /kirish kodingiz/.test(c.body.text ?? '')), 'endi kod darhol kelishi kerak');
});

await test('kontaktda 1C profili birlashadi (individuals jadvalidan)', async () => {
  seed('test_individuals', '+998907777777|1146', {
    phone: '+998907777777', sort_key: '1146',
    Surname: 'Toirov', Name: 'Rozimuhammad', IsMale: true,
    Birthday: '25.04.1990', PriceCategory: 'Asosiy',
  });
  const res = await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: { chat: { id: 888 }, contact: { phone_number: '998907777777', user_id: 888, first_name: 'Rozi' } },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  assert.equal(res.status, 200);
  const user = tableOf('test_users').get('888');
  assert.equal(user.code, '1146');
  assert.equal(user.last_name, 'Toirov');
  assert.equal(user.gender, 'male');
  assert.equal(user.birth_date, '1990-04-25', 'sana ISO ga o\'girilishi kerak');
  assert.equal(user.name, 'Rozi', 'Telegram maydonlari saqlanishi kerak');
});

await test('qayta /start bosilganda kontakt so\'ralmaydi — kod darhol keladi', async () => {
  telegramCalls.length = 0;
  const res = await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({ message: { chat: { id: 777 }, text: '/start' } }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  assert.equal(res.status, 200);

  const sent = telegramCalls.find((c) => c.body.text?.includes('kirish kodingiz'));
  assert.ok(sent, 'kod yuborilishi kerak');
  assert.ok(sent.body.text.includes('<code>'), 'kod bosib nusxalanadigan bo\'lishi kerak');
  assert.ok(!sent.body.reply_markup?.keyboard, 'kontakt tugmasi chiqmasligi kerak');
});

await test('birinchi /start da kontakt so\'raladi', async () => {
  telegramCalls.length = 0;
  await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({ message: { chat: { id: 7007 }, text: '/start' } }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  const greeting = telegramCalls[0];
  assert.ok(greeting?.body.reply_markup?.keyboard, 'kontakt ulashish tugmasi bo\'lishi kerak');
});

await test('noto\'g\'ri kod rad etiladi', async () => {
  const res = await call(
    authVerify,
    'https://dimed.uz/api/auth-verify',
    jsonBody({ phone: '+998901234567', code: '000000' }),
  );
  assert.equal(res.status, 401);
});

let sessionCookie;
await test('to\'g\'ri kod sessiya beradi va kod bir martalik', async () => {
  const code = tableOf('test_otp_codes').get('+998901234567').code;
  const res = await call(
    authVerify,
    'https://dimed.uz/api/auth-verify',
    jsonBody({ phone: '+998901234567', code }),
  );
  assert.equal(res.status, 200);
  sessionCookie = res.headers.get('set-cookie').split(';')[0];
  assert.ok(sessionCookie.startsWith('dimed_session='));
  assert.equal(tableOf('test_otp_codes').has('+998901234567'), false, 'kod o\'chirilishi kerak');

  const again = await call(
    authVerify,
    'https://dimed.uz/api/auth-verify',
    jsonBody({ phone: '+998901234567', code }),
  );
  assert.equal(again.status, 401, 'ishlatilgan kod qayta o\'tmasligi kerak');
});

await test('kirishda 1C profili yangilanadi', async () => {
  seed('test_individuals', '+998901234567|555A', {
    phone: '+998901234567', sort_key: '555A', Surname: 'Azizova', Birthday: '25.04.1990',
  });
  await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({ message: { chat: { id: 777 }, text: '/start' } }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  const code = tableOf('test_otp_codes').get('+998901234567').code;
  const res = await call(
    authVerify,
    'https://dimed.uz/api/auth-verify',
    jsonBody({ phone: '+998901234567', code }),
  );
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_users').get('777').code, '555A');
  assert.equal(tableOf('test_users').get('777').last_name, 'Azizova');
});

console.log('\n"Kodni olish" (deep-link kirish, A-auth):');
const startLogin = async () => {
  const res = await call(authStart, 'https://dimed.uz/api/auth-start', { method: 'POST' });
  assert.equal(res.status, 200);
  return res.json();
};
const pollLogin = (nonce) =>
  call(authStart, `https://dimed.uz/api/auth-start?nonce=${encodeURIComponent(nonce)}`, { method: 'GET' });
const startCmd = (chatId, nonce) =>
  call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({ message: { chat: { id: chatId }, text: `/start kirish_${nonce}` } }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });

await test('auth-start nonce va bot deep-link havolasini beradi', async () => {
  const { nonce, deepLink } = await startLogin();
  assert.match(nonce, /^[A-Za-z0-9_-]{16,64}$/);
  assert.ok(deepLink.includes(`start=kirish_${nonce}`), 'deep-link nonce bilan bo\'lishi kerak');
  assert.equal(tableOf('test_login_sessions').get(nonce).status, 'pending');
});

await test('poll: boshda pending, noma\'lum nonce expired, buzuq nonce 400', async () => {
  const { nonce } = await startLogin();
  assert.equal((await (await pollLogin(nonce)).json()).status, 'pending');
  assert.equal((await (await pollLogin('yoq0123456789abcd')).json()).status, 'expired');
  assert.equal((await pollLogin('qisqa')).status, 400);
});

await test('bog\'langan telefon: /start kirish_<nonce> → ready va kod keladi', async () => {
  telegramCalls.length = 0;
  const { nonce } = await startLogin();
  // chat 777 telefoni allaqachon bog'langan (+998901234567).
  const res = await startCmd(777, nonce);
  assert.equal(res.status, 200);
  const sess = tableOf('test_login_sessions').get(nonce);
  assert.equal(sess.status, 'ready');
  assert.equal(sess.phone, '+998901234567');
  const p = await (await pollLogin(nonce)).json();
  assert.equal(p.status, 'ready');
  assert.equal(p.phone, '+998901234567');
  assert.ok(
    telegramCalls.some((c) => c.body.text?.includes('kirish kodingiz')),
    'kod ham yuborilishi kerak',
  );
});

await test('yangi bemor: nonce kontakt ulashilgach ready bo\'ladi', async () => {
  const { nonce } = await startLogin();
  // Telefoni yo'q chat — /start nonce bilan: nonce eslab qolinadi, ready emas.
  await startCmd(9099, nonce);
  assert.equal(tableOf('test_users').get('9099').pending_login_nonce, nonce);
  assert.equal((await (await pollLogin(nonce)).json()).status, 'pending');

  // Kontakt ulashildi → kirish sessiyasi ready bo'ladi, nonce iste'mol qilinadi.
  await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: { chat: { id: 9099 }, contact: { phone_number: '998901112233', user_id: 9099, first_name: 'Yangi' } },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  const p = await (await pollLogin(nonce)).json();
  assert.equal(p.status, 'ready');
  assert.equal(p.phone, '+998901112233');
  assert.equal(tableOf('test_users').get('9099').pending_login_nonce, undefined, 'nonce iste\'mol qilinadi');
});

await test('auth-start faqat GET/POST qabul qiladi', async () => {
  const res = await call(authStart, 'https://dimed.uz/api/auth-start', { method: 'DELETE' });
  assert.equal(res.status, 405);
});

console.log('\nKirish kodini himoyalash:');
const otpFor = (phone, code) => seed('test_otp_codes', phone, {
  phone, code, telegram_id: '999', expires_at: Math.floor(Date.now() / 1000) + 300,
});
const tryCode = (phone, code) =>
  call(authVerify, 'https://dimed.uz/api/auth-verify', jsonBody({ phone, code }));

await test('5 ta noto\'g\'ri urinishdan keyin kod kuyadi', async () => {
  const phone = '+998900000101';
  otpFor(phone, '111111');

  for (let i = 1; i <= 4; i++) {
    const res = await tryCode(phone, '000000');
    assert.equal(res.status, 401);
    assert.match((await res.json()).error, new RegExp(`Yana ${5 - i} ta urinish`));
    assert.ok(tableOf('test_otp_codes').has(phone), 'kod hali turibdi');
  }

  const last = await tryCode(phone, '000000');
  assert.equal(last.status, 401);
  assert.match((await last.json()).error, /yangi kod oling/);
  assert.equal(tableOf('test_otp_codes').has(phone), false, 'kod o\'chirilishi kerak');

  // To'g'ri kod bilan ham endi kirib bo'lmaydi — botdan yangisini olish kerak.
  const after = await tryCode(phone, '111111');
  assert.equal(after.status, 401);
});

await test('to\'g\'ri kod urinishlardan keyin ham ishlaydi', async () => {
  const phone = '+998900000102';
  otpFor(phone, '222222');
  await tryCode(phone, '000000');
  await tryCode(phone, '000001');
  const ok = await tryCode(phone, '222222');
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get('set-cookie')?.includes('dimed_session'));
});

await test('bitta raqamga soatiga urinishlar cheklanadi', async () => {
  const phone = '+998900000103';
  let blocked = 0;
  for (let i = 0; i < 12; i++) {
    otpFor(phone, '333333');
    const res = await tryCode(phone, '000000');
    if (res.status === 429) blocked++;
  }
  assert.ok(blocked > 0, 'chegaradan keyin 429 kelishi kerak');
});

await test('noto\'g\'ri formatdagi raqam bazaga umuman bormaydi', async () => {
  for (const bad of ['123', '90 123 45', '']) {
    const res = await tryCode(bad, '111111');
    assert.equal(res.status, 400, `${bad} rad etilishi kerak`);
  }
});

// Har test o'z IP sidan: umumiy '-' savatchasi (soatiga 30) boshqa testlarga ulashilgan.
const tryCodeFrom = (ip, phone, code) =>
  call(authVerify, 'https://dimed.uz/api/auth-verify', {
    ...jsonBody({ phone, code }),
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
  });

await test('bir vaqtdagi so\'rovlar urinish chegarasidan o\'tolmaydi', async () => {
  /*
    Avval kod o'qilib, urinish taqqoslashdan keyin sanalardi: bir vaqtda
    kelgan so'rovlarning hammasi eski hisobni ko'rib, har biri o'z
    taxminini tekshirtirardi. Bitta urinishi qolgan kodni 5 ta so'rov
    birdan sinaydi — to'g'ri kod bilan, shunda nechtasi tekshirilgani
    o'tganlar sonidan ko'rinadi.
  */
  const phone = '+998900000104';
  seed('test_otp_codes', phone, {
    phone, code: '444444', telegram_id: '999', expires_at: Math.floor(Date.now() / 1000) + 300, attempts: 4,
  });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => tryCodeFrom('10.0.0.104', phone, '444444')),
  );
  const passedCount = results.filter((r) => r.status === 200).length;
  assert.equal(passedCount, 1, `bitta urinish — bitta tekshiruv, o'tdi: ${passedCount}`);
});

await test('urinishlari tugagan kod to\'g\'ri bo\'lsa ham o\'tmaydi', async () => {
  // Beshinchi noto'g'ri urinish sanalgan, lekin yozuv hali o'chmagan payt.
  const phone = '+998900000105';
  seed('test_otp_codes', phone, {
    phone, code: '555555', telegram_id: '999', expires_at: Math.floor(Date.now() / 1000) + 300, attempts: 5,
  });
  const res = await tryCodeFrom('10.0.0.105', phone, '555555');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null, 'sessiya berilmasligi kerak');
});

console.log('\nSlotlar:');
await test('slot ro\'yxati qaytadi', async () => {
  const res = await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.slots.length, 8);
  assert.equal(data.slots.every((s) => s.free), true);
});

await test('noma\'lum shifokor 404', async () => {
  const res = await call(slots, `https://dimed.uz/api/slots?doctor=yoq&date=${BOOK_DATE}`);
  assert.equal(res.status, 404);
});

await test('noto\'g\'ri sana rad etiladi', async () => {
  const res = await call(slots, 'https://dimed.uz/api/slots?doctor=ashurov&date=12.08.2026');
  assert.equal(res.status, 400);
});

await test('javobda shifokorning ish kunlari qaytadi', async () => {
  const res = await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`);
  const data = await res.json();
  assert.deepEqual(data.workdays, [0, 1, 2, 3, 4, 5, 6]);
});

await test('shifokor kunni olib tashlasa, ish kunlari yangilangan holda qaytadi', async () => {
  /*
    Vidjetdagi kun tugmalari statik ma'lumotdan qurilardi. Endi ular
    shu maydonga qarab tuzatiladi, shuning uchun bazadagi o'zgarish
    javobda ko'rinishi shart.
  */
  const weekday = new Date(`${BOOK_DATE}T00:00:00Z`).getUTCDay();
  const full = [0, 1, 2, 3, 4, 5, 6];
  const without = full.filter((d) => d !== weekday);

  const doctor = tableOf('test_doctors').get('ashurov');
  seed('test_doctors', 'ashurov', { ...doctor, workdays: without });
  const data = await (
    await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`)
  ).json();
  seed('test_doctors', 'ashurov', doctor); // keyingi testlar to'liq jadvalga tayanadi

  assert.equal(data.reason, 'dam olish kuni');
  assert.deepEqual(data.slots, []);
  assert.deepEqual(data.workdays, without);
});

console.log('\nBron:');
await test('kirmagan foydalanuvchi bron qila olmaydi', async () => {
  const res = await call(
    book,
    'https://dimed.uz/api/book',
    jsonBody({ doctor: 'ashurov', date: BOOK_DATE, time: '09:00' }),
  );
  assert.equal(res.status, 401);
});

const authed = (obj) => ({
  ...jsonBody(obj),
  headers: { 'content-type': 'application/json', cookie: sessionCookie },
});

/*
  Bron uchun bemor (tug'ilgan sanasi bilan) majburiy (B1). Azizova
  (555A) 1C dan Birthday bilan kelgan — bron shu bemor nomiga olinadi.
*/
const bookAs = (obj) => authed({ patientId: '555A', privacyAccepted: true, ...obj });

/** Ikkinchi bemor (boshqa telefon) — begona so'rovlarni tekshirish uchun. */
const otherCookie = createSessionCookie({ phone: '+998907777777', userId: '888' }).split(';')[0];

/*
  Test telefonining kelgusi bronlarini vaqtincha olib turadi: haqiqiy
  bemorda ular bo'lmaydi, lekin testlar ketma-ket yurgani uchun
  yig'ilib qoladi va "bir vaqtda 5 ta" chegarasiga urilib ketadi.
  Qaytaruvchi funksiya qaytaradi — keyingi testlarning ma'lumoti
  joyida qolsin.
*/
const clearUpcoming = (phone = '+998901234567') => {
  const table = tableOf('test_appointments');
  const now = new Date().toISOString();
  const removed = [];
  for (const [key, row] of [...table.entries()]) {
    if (row.phone === phone && row.starts_at > now) {
      removed.push([key, row]);
      table.delete(key);
    }
  }
  return () => removed.forEach(([key, row]) => seed('test_appointments', key, row));
};


await test('maxfiylik siyosatiga rozilik bo\'lmasa bron qilinmaydi', async () => {
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', privacyAccepted: false,
  }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Maxfiylik/);
  assert.equal(tableOf('test_appointments').has(`ashurov#${BOOK_DATE}|09:00`), false);
});

await test('bemorsiz yoki tug\'ilgan sanasiz bron qilinmaydi', async () => {
  const noPatient = await call(book, 'https://dimed.uz/api/book', authed({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00',
  }));
  assert.equal(noPatient.status, 400, 'hali hech kim tanlanmagan — bemor so\'raladi');
  assert.match((await noPatient.json()).error, /kim uchun/);

  seed('test_individuals', '+998901234567|556B', {
    phone: '+998901234567', sort_key: '556B', Surname: 'Sanasiz', Name: 'Bemor',
  });
  const noBirth = await call(book, 'https://dimed.uz/api/book', authed({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', patientId: '556B',
  }));
  assert.equal(noBirth.status, 400);
  assert.match((await noBirth.json()).error, /tug‘ilgan sana/);
  assert.equal(tableOf('test_appointments').has(`ashurov#${BOOK_DATE}|09:00`), false);
});

await test('bron qilinadi va botga tasdiq ketadi', async () => {
  telegramCalls.length = 0;
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00',
  }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mode, 'at_clinic');
  assert.equal(data.appointment.patientName, 'Azizova');
  assert.equal(data.appointment.patientBirthDate, '1990-04-25');
  const appt = tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|09:00`);
  assert.equal(appt.status, 'booked', 'klinikada to\'lash — darhol band');
  assert.equal(appt.hold_until, undefined, 'bunda hold muddati bo\'lmasligi kerak');
  assert.equal(appt.patient_birth_date, '1990-04-25', 'tug\'ilgan sana navbat yozuviga tushadi');
  assert.ok(appt.privacy_accepted_at, 'rozilik lahzasi navbat yozuvida qoladi');
  assert.ok(tableOf('test_users').get('777').privacy_accepted_at, 'rozilik bemor yozuvida ham qoladi');
  assert.ok(telegramCalls.some((c) => c.body.text.includes('band qilindi')));
});

await test('band slot ikkinchi marta olinmaydi', async () => {
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00',
  }));
  assert.equal(res.status, 409);
});

await test('band slot ro\'yxatda yopiq ko\'rinadi', async () => {
  const res = await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`);
  const data = await res.json();
  assert.equal(data.slots.find((s) => s.time === '09:00').free, false);
  assert.equal(data.slots.find((s) => s.time === '10:00').free, true);
});

await test('jadvalda yo\'q vaqt rad etiladi', async () => {
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: BOOK_DATE, time: '12:30',
  }));
  assert.equal(res.status, 400);
});

await test('o\'tgan kunga bron qilib bo\'lmaydi', async () => {
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: '2020-01-01', time: '09:00',
  }));
  assert.equal(res.status, 400);
});

console.log('\nKabinet:');
await test('kirmagan foydalanuvchi 401 oladi', async () => {
  const res = await call(me, 'https://dimed.uz/api/me');
  assert.equal(res.status, 401);
});

await test('bemor o\'z qabulini ko\'radi', async () => {
  const res = await call(me, 'https://dimed.uz/api/me', { headers: { cookie: sessionCookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.appointments.length, 1);
  assert.equal(data.appointments[0].doctorName, 'Ashurov Tursunali');
  assert.equal(data.appointments[0].upcoming, true);
});

await test('ko\'p yozuvli bemor hamma qabulini ko\'radi (50 tadan ko\'p — sahifalab)', async () => {
  // Avval bitta sahifa `Limit: 50` bilan o'qilardi va filtr undan keyin
  // qo'llanardi: yangi ko'chirilgan yozuvlar 50 talikni egallab, eski
  // qabullar tarixdan jimgina yo'qolardi.
  const phone = '+998905550001';
  for (let i = 0; i < 70; i++) {
    const date = addDays('2019-01-01', i);
    seed('test_appointments', `ashurov#${date}|09:00`, {
      doctor_day: `ashurov#${date}`, time: '09:00', doctor_id: 'ashurov', date,
      phone, telegram_id: '5550001', starts_at: toInstant(date, '09:00').toISOString(),
      // 60 tasi o'tgan qabul; eng yangi 10 tasi ko'chirilgan (ro'yxatda ko'rinmaydi).
      status: i < 60 ? 'done' : 'moved',
      price: 70000, created_at: new Date().toISOString(),
    });
  }
  const cookie = createSessionCookie({ phone, userId: '5550001' }).split(';')[0];
  const data = await (await call(me, 'https://dimed.uz/api/me?include=appointments', {
    headers: { cookie },
  })).json();
  assert.equal(data.appointments.length, 60, 'barcha o\'tgan qabullar ko\'rinishi kerak');
  assert.ok(data.appointments.every((a) => a.status === 'done'), 'ko\'chirilganlar ko\'rinmasligi kerak');
});

await test('1C natijasi kabinetda ko\'rinadi', async () => {
  telegramCalls.length = 0;
  const res = await call(lcResults, 'https://dimed.uz/api/lc-results', {
    ...jsonBody({
      phone: '+998901234567',
      results: [{ code: '96', title: 'Gemoglobin', value: '132 g/L', reference: '120 – 160' }],
    }),
    headers: { 'content-type': 'application/json', 'x-api-key': 'lc-secret' },
  });
  assert.equal(res.status, 200);

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.equal(cabinet.results.length, 1, 'bir sanadagi natijalar bitta buyurtma');
  assert.equal(cabinet.results[0].items.length, 1);
  assert.equal(cabinet.results[0].items[0].title, 'Gemoglobin');
  assert.equal(cabinet.results[0].items[0].reference, '120 – 160');
  assert.equal(cabinet.results[0].items[0].status, 'normal', 'matnli me\'yordan holat chiqadi');

  const xabar = telegramCalls.find((c) => c.body.chat_id === '777');
  assert.ok(xabar?.body.text.includes('/natija?id=lab-'), 'bot natija sahifasi havolasini yuboradi (G1)');
});

await test('1C to\'g\'ridan-to\'g\'ri yozgan hujjat analitlarga yoyiladi', async () => {
  seed('test_analysis_results', '+998901234567|doc-uuid-1', {
    phone: '+998901234567',
    sort_key: 'doc-uuid-1',
    Date: '21.08.2026 14:30:00',
    SampleID: '4127',
    Biomaterial: 'Qon',
    AnalysisResults: [
      { Analyte: 'Gemoglobin', Result: '132', AnalyteUnit: 'g/L', AnalyteInternationalCode: 'HGB' },
      { Analyte: 'Leykotsitlar', Result: '6.2', AnalyteUnit: '10^9/L' },
    ],
  });

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();

  const doc = cabinet.results.find((r) => r.id === 'doc-uuid-1');
  assert.ok(doc, 'hujjat bitta yozuv bo\'lishi kerak');
  assert.equal(doc.items.length, 2, 'ikkala analit ham bir buyurtmada');
  assert.equal(doc.biomaterial, 'Qon');
  assert.equal(doc.date, '2026-08-21T14:30:00', '1C sanasi ISO ga o\'girilishi kerak');
  const hgb = doc.items.find((i) => i.title === 'Gemoglobin');
  assert.equal(hgb.value, '132', 'qiymat va birlik alohida (natija sahifasi uchun)');
  assert.equal(hgb.unit, 'g/L');
  assert.equal(hgb.code, 'HGB');
  assert.ok(doc.items.some((i) => i.title === 'Leykotsitlar'), 'ikkinchi analit ham chiqishi kerak');

  // 1C soatni bir xonali yuborishi mumkin: "9:05:00"
  seed('test_analysis_results', '+998901234567|doc-uuid-2', {
    phone: '+998901234567',
    sort_key: 'doc-uuid-2',
    Date: '05.01.2026 9:05:00',
    AnalysisResults: [{ Analyte: 'Kreatinin', Result: '80', AnalyteUnit: 'mkmol/l' }],
  });
  const again = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();
  const kre = again.results.find((r) => r.id === 'doc-uuid-2');
  assert.equal(kre.items[0].title, 'Kreatinin');
  assert.equal(kre.date, '2026-01-05T09:05:00', 'bir xonali soat ham ISO bo\'lishi kerak');

  // 1C adashib lab_results ga yozgan hujjat: kabinet yiqilmasin,
  // analitlari esa ko'rinsin (1420 ta shunday yozuv bor edi).
  seed('test_lab_results', '+998901234567|doc-stray-1', {
    phone: '+998901234567',
    sort_key: 'doc-stray-1',
    Date: '10.02.2026 11:00:00',
    AnalysisResults: [{ Analyte: 'Bilirubin', Result: '12', AnalyteUnit: 'mkmol/l' }],
  });
  // Xuddi shu hujjat to'g'ri jadvalda ham bo'lsa — bir marta chiqadi.
  seed('test_analysis_results', '+998901234567|doc-stray-1', {
    phone: '+998901234567',
    sort_key: 'doc-stray-1',
    Date: '10.02.2026 11:00:00',
    AnalysisResults: [{ Analyte: 'Bilirubin', Result: '12', AnalyteUnit: 'mkmol/l' }],
  });
  const uchinchi = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();
  const bil = uchinchi.results.filter((r) => r.id === 'doc-stray-1');
  assert.equal(bil.length, 1, 'takror hujjat bir marta ko\'rinishi kerak');
  assert.equal(bil[0].items[0].value, '12');
  assert.equal(bil[0].items[0].unit, 'mkmol/l');
});

await test('natijalar bir sahifaga sig\'masa ham hammasi ko\'rinadi', async () => {
  // 1C butun tarixni to'kib yuborishi mumkin. Hujjat sort kaliti — UUID,
  // ya'ni tartibi sanaga bog'liq emas: bitta sahifa bilan cheklansak,
  // bemor tasodifiy yozuvlarni ko'rardi.
  for (let i = 0; i < 60; i++) {
    const key = `ko\u2018p-${String(i).padStart(3, '0')}`;
    seed('test_analysis_results', `+998901234567|${key}`, {
      phone: '+998901234567',
      sort_key: key,
      Date: '01.03.2026 10:00:00',
      AnalysisResults: [{ Analyte: `Ko\u2018rsatkich ${i}`, Result: String(i) }],
    });
  }

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();

  const yuklangan = cabinet.results.filter((r) => r.id.startsWith('ko\u2018p-'));
  assert.equal(yuklangan.length, 60, 'barcha sahifalar o\'qilishi kerak');
  assert.equal(yuklangan[0].items.length, 1);
});

await test('bekor qilingan va o\'chirilgan natija kabinetda ko\'rinmaydi', async () => {
  seed('test_analysis_results', '+998901234567|doc-bekor', {
    phone: '+998901234567', sort_key: 'doc-bekor', Date: '02.03.2026 10:00:00',
    Posted: false,
    AnalysisResults: [{ Analyte: 'Bekor qilingan tahlil', Result: '1' }],
  });
  seed('test_analysis_results', '+998901234567|doc-ochirilgan', {
    phone: '+998901234567', sort_key: 'doc-ochirilgan', Date: '02.03.2026 11:00:00',
    DeletionMark: true,
    AnalysisResults: [{ Analyte: 'O\u2018chirilgan tahlil', Result: '2' }],
  });
  seed('test_analysis_results', '+998901234567|doc-kuchda', {
    phone: '+998901234567', sort_key: 'doc-kuchda', Date: '02.03.2026 12:00:00',
    Posted: true, DeletionMark: false,
    AnalysisResults: [{ Analyte: 'Kuchdagi tahlil', Result: '3' }],
  });

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();
  const nomlar = cabinet.results.flatMap((r) => r.items.map((i) => i.title));

  assert.ok(!nomlar.includes('Bekor qilingan tahlil'), 'Posted=false ko\'rinmasligi kerak');
  assert.ok(!nomlar.includes('O\u2018chirilgan tahlil'), 'DeletionMark ko\'rinmasligi kerak');
  assert.ok(nomlar.includes('Kuchdagi tahlil'), 'kuchdagi natija ko\'rinishi kerak');
});

await test('analit nomi bo\'sh bo\'lsa qator yo\'qolmaydi', async () => {
  seed('test_analysis_results', '+998901234567|doc-nomsiz', {
    phone: '+998901234567', sort_key: 'doc-nomsiz', Date: '03.03.2026 10:00:00',
    AnalysisResults: [
      { Analyte: '', Result: '5.4', AnalyteUnit: 'mmol/L', AnalyteInternationalCode: '2345-7' },
      { Analyte: '   ', Result: '', AnalyteUnit: '' },
    ],
  });

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();

  const nomsiz = cabinet.results.find((r) => r.id === 'doc-nomsiz');
  assert.equal(nomsiz.items.length, 1, 'nomi ham qiymati ham yo\'q qator tashlab yuboriladi');
  assert.equal(nomsiz.items[0].title, '2345-7', 'nomsiz analit xalqaro kod bilan chiqadi');
  assert.equal(nomsiz.items[0].value, '5.4');
  assert.equal(nomsiz.items[0].unit, 'mmol/L');
});

await test('natijada bemor ismi bo\'ladi (bir telefon — oila)', async () => {
  seed('test_analysis_results', '+998901234567|doc-oila', {
    phone: '+998901234567', sort_key: 'doc-oila', Date: '04.03.2026 10:00:00',
    PatientName: 'Yo\u2018ldosheva Nilufar Anvarovna',
    AnalysisResults: [{ Analyte: 'Ferritin', Result: '45', AnalyteUnit: 'ng/mL' }],
  });

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();
  const ferritin = cabinet.results.find((r) => r.id === 'doc-oila');
  assert.equal(ferritin.items[0].title, 'Ferritin');
  assert.equal(ferritin.patientName, 'Yo\u2018ldosheva Nilufar Anvarovna');
});

await test('bir telefondagi oiladan Telegram egasi tanlanadi', async () => {
  seed('test_individuals', '+998909999999|10482', {
    phone: '+998909999999', sort_key: '10482',
    Surname: 'Yo\u2018ldoshev', Name: 'Anvar', Patronymic: 'Baxtiyorovich', IsMale: true,
  });
  seed('test_individuals', '+998909999999|10483', {
    phone: '+998909999999', sort_key: '10483',
    Surname: 'Yo\u2018ldosheva', Name: 'Nilufar', Patronymic: 'Anvarovna', IsMale: false,
  });

  const res = await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: {
        chat: { id: 555 },
        contact: { phone_number: '998909999999', user_id: 555, first_name: 'Nilufar', last_name: 'Yoldosheva' },
      },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });
  assert.equal(res.status, 200);

  const user = tableOf('test_users').get('555');
  assert.equal(user.code, '10483', 'birinchisi emas, ism mos kelgani tanlanishi kerak');
  assert.equal(user.gender, 'female');
  assert.equal(user.telegram_name, 'Yoldosheva Nilufar', 'Telegram ismi 1C dan keyin ham qolishi kerak');
});

await test('o\'chirishga belgilangan bemor profil sifatida olinmaydi', async () => {
  seed('test_individuals', '+998907777770|20001', {
    phone: '+998907777770', sort_key: '20001', Surname: 'Eski', Name: 'Yozuv',
    DeletionMark: true,
  });
  seed('test_individuals', '+998907777770|20002', {
    phone: '+998907777770', sort_key: '20002', Surname: 'Yangi', Name: 'Yozuv',
  });

  await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: { chat: { id: 557 }, contact: { phone_number: '998907777770', user_id: 557, first_name: 'Yozuv' } },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });

  const user = tableOf('test_users').get('557');
  assert.equal(user.code, '20002');
  assert.equal(user.last_name, 'Yangi', 'o\'chirilgan yozuv o\'tkazib yuborilishi kerak');
});

await test('1C kodidagi guruh ajratkichi tozalanadi', async () => {
  // 1C kodni son sifatida saqlaydi: String(10482) → "10 482".
  seed('test_individuals', '+998908888888|10 482', {
    phone: '+998908888888', sort_key: '10 482', Surname: 'Karimov', Name: 'Sardor',
  });

  await call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
    ...jsonBody({
      message: { chat: { id: 556 }, contact: { phone_number: '998908888888', user_id: 556, first_name: 'Sardor' } },
    }),
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
  });

  assert.equal(tableOf('test_users').get('556').code, '10482', 'kod bo\'shliqsiz saqlanishi kerak');
});

await test('noto\'g\'ri API kalit bilan 1C rad etiladi', async () => {
  const res = await call(lcResults, 'https://dimed.uz/api/lc-results', {
    ...jsonBody({ phone: '+998901234567', results: [{ code: '1', title: 'X' }] }),
    headers: { 'content-type': 'application/json', 'x-api-key': 'yolgon' },
  });
  assert.equal(res.status, 401);
});

console.log('\nSessiya va sozlamalar (kabinet menyusi):');
await test('/api/session mehmonga guest, kirganga ism va rollar', async () => {
  const guest = await (await call(sessionApi, 'https://dimed.uz/api/session')).json();
  assert.equal(guest.role, 'guest');

  const res = await call(sessionApi, 'https://dimed.uz/api/session', { headers: { cookie: sessionCookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const me = await res.json();
  assert.equal(me.role, 'patient');
  assert.equal(me.phone, '+998901234567');
  assert.equal(me.admin, false);
  assert.equal(me.doctor, null);
  // last_name 1C dan (Azizova), first_name Telegram kontaktidan (Aziza).
  assert.equal(me.name, 'Azizova Aziza', '1C profili + Telegram ismi ko\'rinadi');
  assert.equal(me.lang, 'uz');
});

await test('/api/settings tilni saqlaydi, noto\'g\'ri til rad etiladi', async () => {
  const bad = await call(settingsApi, 'https://dimed.uz/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ lang: 'de' }),
  });
  assert.equal(bad.status, 400);

  const res = await call(settingsApi, 'https://dimed.uz/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ lang: 'ru' }),
  });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_users').get('777').lang, 'ru');

  const got = await (await call(settingsApi, 'https://dimed.uz/api/settings', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.equal(got.lang, 'ru');

  const session = await (await call(sessionApi, 'https://dimed.uz/api/session', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.equal(session.lang, 'ru', 'sessiya javobida ham til bor');

  const anon = await call(settingsApi, 'https://dimed.uz/api/settings');
  assert.equal(anon.status, 401);

  // Keyingi testlar o'zbekcha xabarlarga tayanadi.
  await call(settingsApi, 'https://dimed.uz/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ lang: 'uz' }),
  });
});

await test('/api/me?include= faqat so\'ralganini yuklaydi', async () => {
  const only = await (await call(me, 'https://dimed.uz/api/me?include=appointments', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.ok(only.appointments.length >= 1);
  assert.deepEqual(only.results, [], 'natijalar so\'ralmagan');

  const res = await (await call(me, 'https://dimed.uz/api/me?include=results', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.deepEqual(res.appointments, []);
  assert.ok(res.results.length >= 1);
});

await test('natija ro\'yxatida tahlil nomi, holati va shifokor bor (C2)', async () => {
  seed('test_analysis_results', '+998901234567|doc-nomli', {
    phone: '+998901234567', sort_key: 'doc-nomli', Date: '06.03.2026 10:00:00',
    AnalysisName: 'Umumiy qon tahlili', Doctor: 'Ashurov T.',
    AnalysisResults: [
      { Analyte: 'Gemoglobin', Result: '132', AnalyteUnit: 'g/L' },
      { Analyte: 'Leykotsitlar', Result: '6.2', AnalyteUnit: '10^9/L' },
    ],
  });
  seed('test_analysis_results', '+998901234567|doc-kutish', {
    phone: '+998901234567', sort_key: 'doc-kutish', Date: '07.03.2026 10:00:00',
    Biomaterial: 'Siydik',
    AnalysisResults: [{ Analyte: 'Oqsil', Result: '' }, { Analyte: 'Glyukoza', Result: '' }],
  });
  // 1C nom yubormagan: sayt ko'rsatkichlarga qarab panelni o'zi taniydi.
  seed('test_analysis_results', '+998901234567|doc-panel', {
    phone: '+998901234567', sort_key: 'doc-panel', Date: '08.03.2026 10:00:00',
    AnalysisResults: [
      { Analyte: 'Gemoglobin', Result: '132' },
      { Analyte: 'Gematokrit', Result: '41' },
      { Analyte: 'Trombotsitlar', Result: '254' },
      { Analyte: 'Leykotsitlar', Result: '6.2' },
      { Analyte: 'Eritrotsitlar choʻkish tezligi', Result: '12' },
    ],
  });
  // Na 1C nomi, na panel — biomaterial bo'yicha.
  seed('test_analysis_results', '+998901234567|doc-bio', {
    phone: '+998901234567', sort_key: 'doc-bio', Date: '09.03.2026 10:00:00',
    Biomaterial: 'Qon',
    AnalysisResults: [
      { Analyte: 'Temir', Result: '14' }, { Analyte: 'Mis', Result: '1' },
      { Analyte: 'Rux', Result: '12' }, { Analyte: 'Selen', Result: '80' },
    ],
  });

  const data = await (await call(me, 'https://dimed.uz/api/me?include=results', {
    headers: { cookie: sessionCookie },
  })).json();

  const nomli = data.results.find((r) => r.id === 'doc-nomli');
  assert.equal(nomli.title, 'Umumiy qon tahlili', '1C bergan nom');
  assert.equal(nomli.doctor, 'Ashurov T.');
  assert.equal(nomli.status, 'ready');

  const kutish = data.results.find((r) => r.id === 'doc-kutish');
  // Uchtagacha ko'rsatkich — nomlari sanaladi. Bu biomaterialdan
  // ("Siydik tahlili") aniqroq: klinika ularni alohida ham sotadi.
  assert.equal(kutish.title, 'Oqsil, Glyukoza', 'kam ko\'rsatkich — nomlari');
  assert.equal(kutish.status, 'pending', 'qiymatlar bo\'sh — kutilmoqda');
  assert.equal(kutish.doctor, null);

  const bitta = data.results.find((r) => r.id === 'doc-uuid-2');
  assert.equal(bitta.title, 'Kreatinin', 'bitta ko\'rsatkich — uning nomi');

  // Asosiy shikoyat shu yerda edi: ilgari "Gemoglobin +4" chiqardi.
  const panel = data.results.find((r) => r.id === 'doc-panel');
  assert.equal(panel.title, 'Umumiy qon tahlili', 'panel ko\'rsatkichlardan tanildi');
  assert.equal(panel.titleKey, 'panel.cbc', 'sarlavha uch tilda ko\'rsatiladi');

  const bio = data.results.find((r) => r.id === 'doc-bio');
  assert.equal(bio.title, 'Qon tahlili', 'panel tanilmasa biomaterial bo\'yicha');
});

await test('1C ruscha nom va ko\'rsatkichlarni o\'zbekchaga o\'giradi (I1)', async () => {
  seed('test_analysis_results', '+998901234567|doc-ru', {
    phone: '+998901234567', sort_key: 'doc-ru', Date: '10.03.2026 10:00:00',
    AnalysisName: 'Общий анализ крови', Doctor: 'Ivanova R.',
    AnalysisResults: [
      { Analyte: 'Гемоглобин', Result: '132', AnalyteUnit: 'g/L' },
      { Analyte: 'Билирубин общий', Result: '12', AnalyteUnit: 'mkmol/l' },
    ],
  });

  const data = await (await call(me, 'https://dimed.uz/api/me?include=results', {
    headers: { cookie: sessionCookie },
  })).json();

  const ru = data.results.find((r) => r.id === 'doc-ru');
  assert.equal(ru.title, 'Umumiy qon tahlili', 'ruscha panel nomi o\'zbekchaga');
  assert.equal(ru.titleKey, 'panel.cbc', 'ko\'p tilli sarlavha kaliti qo\'yiladi');
  const nomlar = ru.items.map((i) => i.title);
  assert.ok(nomlar.includes('Gemoglobin'), 'Гемоглобин → Gemoglobin');
  assert.ok(nomlar.includes('Umumiy bilirubin'), 'Билирубин общий → Umumiy bilirubin');
});

console.log('\nNatija sahifasi (D1) va ulashish:');
await test('/api/result o\'z natijasini beradi, begonaniki 404', async () => {
  const anon = await call(resultApi, 'https://dimed.uz/api/result?id=doc-uuid-1');
  assert.equal(anon.status, 401);

  const res = await call(resultApi, 'https://dimed.uz/api/result?id=doc-uuid-1', {
    headers: { cookie: sessionCookie },
  });
  assert.equal(res.status, 200);
  const { result, shared } = await res.json();
  assert.equal(shared, false);
  assert.equal(result.id, 'doc-uuid-1');
  assert.equal(result.biomaterial, 'Qon');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].value, '132');
  assert.equal(result.items[0].unit, 'g/L');

  const yoq = await call(resultApi, 'https://dimed.uz/api/result?id=yoq-hujjat', {
    headers: { cookie: sessionCookie },
  });
  assert.equal(yoq.status, 404);

  const other = createSessionCookie({ phone: '+998911111111', userId: '9001' }).split(';')[0];
  const begona = await call(resultApi, 'https://dimed.uz/api/result?id=doc-uuid-1', {
    headers: { cookie: other },
  });
  assert.equal(begona.status, 404, 'boshqa bemor natijasi ko\'rinmaydi');
});

await test('me\'yoriy oraliq va holat: son, matn, bayroq', async () => {
  seed('test_analysis_results', '+998901234567|doc-meyor', {
    phone: '+998901234567', sort_key: 'doc-meyor', Date: '08.03.2026 09:00:00',
    AnalysisName: 'Biokimyo', PatientName: 'Azizova Aziza', PatientBirthday: '25.04.1990', PatientIsMale: false,
    Doctor: 'Ashurov T.',
    AnalysisResults: [
      { Analyte: 'Glyukoza', Result: '6,2', AnalyteUnit: 'mmol/L', ReferenceMin: 3.9, ReferenceMax: 5.6 },
      { Analyte: 'Gemoglobin', Result: '132', AnalyteUnit: 'g/L', Reference: '120 – 160' },
      { Analyte: 'Kaliy', Result: '3.1', AnalyteUnit: 'mmol/L', Norm: '3.5-5.1' },
      { Analyte: 'Bayroqli', Result: 'musbat', Flag: 'H' },
      { Analyte: 'Nomalum', Result: '7' },
    ],
  });

  const { result } = await (await call(resultApi, 'https://dimed.uz/api/result?id=doc-meyor', {
    headers: { cookie: sessionCookie },
  })).json();

  const by = (name) => result.items.find((i) => i.title === name);
  assert.equal(by('Glyukoza').status, 'high');
  assert.equal(by('Glyukoza').refLow, 3.9);
  assert.equal(by('Glyukoza').refHigh, 5.6);
  assert.equal(by('Glyukoza').reference, '3.9 — 5.6');
  assert.ok(by('Glyukoza').description?.uz, 'tanish ko\'rsatkichga tavsif bor');
  assert.equal(by('Gemoglobin').status, 'normal');
  assert.equal(by('Gemoglobin').refLow, 120);
  assert.equal(by('Kaliy').status, 'low');
  assert.equal(by('Bayroqli').status, 'high', 'son bo\'lmasa bayroq bo\'yicha');
  assert.equal(by('Nomalum').status, null, 'ma\'lumot yetmasa holat yo\'q');
  assert.equal(by('Nomalum').description, null);

  assert.equal(result.patientBirthDate, '1990-04-25');
  assert.equal(result.patientGender, 'female');
  assert.equal(result.doctor, 'Ashurov T.');
  assert.equal(result.title, 'Biokimyo');
});

await test('ulashish havolasi sessiyasiz ochiladi, buzuq va eskirgan token 404', async () => {
  const res = await call(resultApi, 'https://dimed.uz/api/result?id=doc-meyor&share=1', {
    headers: { cookie: sessionCookie },
  });
  assert.equal(res.status, 200);
  const { url } = await res.json();
  assert.ok(url.startsWith('https://dimed.uz/natija?t='), url);

  const token = new URL(url).searchParams.get('t');
  const open = await call(resultApi, `https://dimed.uz/api/result?t=${encodeURIComponent(token)}`);
  assert.equal(open.status, 200);
  const body = await open.json();
  assert.equal(body.shared, true);
  assert.equal(body.result.id, 'doc-meyor');

  const buzuq = await call(resultApi, `https://dimed.uz/api/result?t=${encodeURIComponent(token.slice(0, -2) + 'zz')}`);
  assert.equal(buzuq.status, 404);

  const eskirgan = createShareToken('+998901234567', 'doc-meyor', -1);
  const old = await call(resultApi, `https://dimed.uz/api/result?t=${encodeURIComponent(eskirgan)}`);
  assert.equal(old.status, 404);
});

console.log('\nYangi natija haqida bot xabari (G1):');
await test('birinchi ishga tushish tarixni jimgina belgilaydi', async () => {
  telegramCalls.length = 0;
  const res = await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=recent', { method: 'POST' });
  assert.equal(res.status, 200);
  const user = tableOf('test_users').get('777');
  assert.ok(Array.isArray(user.results_notified), 'ro\'yxat yaratilishi kerak');
  assert.ok(user.results_notified.includes('doc-uuid-1'));
  assert.ok(!user.results_notified.includes('doc-kutish'), 'kutilayotgan natija belgilanmaydi');
  assert.equal(telegramCalls.filter((c) => c.body.chat_id === '777').length, 0, 'tarix uchun xabar yo\'q');
});

await test('yangi tayyor natija tushganda havola bilan xabar ketadi, takrorlanmaydi', async () => {
  telegramCalls.length = 0;
  await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=recent', { method: 'POST' });
  assert.equal(telegramCalls.filter((c) => c.body.chat_id === '777').length, 0, 'yangisi yo\'q — xabar yo\'q');

  seed('test_analysis_results', '+998901234567|doc-yangi', {
    phone: '+998901234567', sort_key: 'doc-yangi', Date: '09.03.2026 10:15:00',
    AnalysisName: 'Umumiy siydik tahlili',
    AnalysisResults: [{ Analyte: 'Oqsil', Result: 'manfiy' }],
  });
  await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=recent', { method: 'POST' });
  const xabar = telegramCalls.find((c) => c.body.chat_id === '777');
  assert.ok(xabar, 'bemorga xabar ketishi kerak');
  assert.ok(xabar.body.text.includes('Tahlil natijangiz tayyor'));
  assert.ok(xabar.body.text.includes('Umumiy siydik tahlili'));
  assert.ok(xabar.body.text.includes('09.03.2026'));
  assert.ok(xabar.body.text.includes('https://dimed.uz/natija?t='), 'natija sahifasi havolasi');

  const token = xabar.body.text.match(/natija\?t=([^\s]+)/)[1];
  const open = await call(resultApi, `https://dimed.uz/api/result?t=${encodeURIComponent(token)}`);
  assert.equal(open.status, 200, 'havola sessiyasiz ochiladi');

  telegramCalls.length = 0;
  await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=recent', { method: 'POST' });
  assert.equal(telegramCalls.filter((c) => c.body.chat_id === '777').length, 0, 'ikkinchi marta yuborilmaydi');
});

await test('tez yugurish navbati yo\'q bemorni qaraydi, oldindagisini o\'tkazmaydi', async () => {
  // Tarixi belgilangan, lekin klinika bilan ochiq aloqasi bo'lmagan bemor —
  // o'tkazib yuboriladi; tungi to'liq aylanishda esa qaraladi.
  // 777 esa kelgusi navbati borligi uchun tez yugurishda ham qaraladi:
  // bemor navbat olib qo'yib, qabuldan oldin tahlil topshirishi odatiy hol.
  const user = tableOf('test_users').get('888');
  seed('test_users', '888', { ...user, results_notified: [] });
  seed('test_analysis_results', '+998907777777|uzoq-1', {
    phone: '+998907777777', sort_key: 'uzoq-1', Date: '01.02.2026 10:00:00',
    AnalysisResults: [{ Analyte: 'Gemoglobin', Result: '130', AnalyteUnit: 'g/L' }],
  });
  // 777 ning yagona navbati BOOK_DATE — bugundan keyin.
  seed('test_analysis_results', '+998901234567|doc-navbatdan-oldin', {
    phone: '+998901234567', sort_key: 'doc-navbatdan-oldin', Date: '09.03.2026 08:00:00',
    AnalysisName: 'Qondagi shakar',
    AnalysisResults: [{ Analyte: 'Glyukoza', Result: '5.1', AnalyteUnit: 'mmol/L' }],
  });

  telegramCalls.length = 0;
  const res = await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=recent');
  const data = await res.json();
  assert.equal(data.mode, 'recent');
  assert.ok(data.users > data.checked, 'hamma bemor qaralmasligi kerak');
  assert.equal(
    telegramCalls.filter((c) => c.body.chat_id === '888').length,
    0,
    'yaqinda kelmagan bemorga xabar yo\'q',
  );
  assert.ok(
    telegramCalls.some((c) => c.body.chat_id === '777' && c.body.text?.includes('Qondagi shakar')),
    'qabuldan oldin kelgan natija tungi aylanishni kutmaydi',
  );

  // Tungi to'liq aylanishda esa u ham qaraladi va natijasi yetib boradi.
  telegramCalls.length = 0;
  const full = await (await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=full')).json();
  assert.equal(full.mode, 'full');
  assert.equal(full.checked, full.users, 'to\'liq aylanishda hammasi qaraladi');
  assert.ok(
    telegramCalls.some((c) => c.body.chat_id === '888' && c.body.text?.includes('Gemoglobin')),
    'to\'liq aylanishda natija haqida xabar ketadi',
  );
});

await test('bemorlar 25 tadan ko\'p bo\'lsa ham hammasiga xabar boradi', async () => {
  // Scan javobi 1 MB da kesiladi (soxta jadvalda — 25 tada). Avval bitta
  // sahifa o'qilardi: undan keyingi bemorlar natija xabarini olmasdi.
  const chats = [];
  for (let i = 0; i < 30; i++) {
    const chat = String(70000 + i);
    const phone = `+99893${7000000 + i}`;
    chats.push(chat);
    seed('test_users', chat, { telegram_id: chat, phone, results_notified: [] });
    seed('test_analysis_results', `${phone}|sahifa-${i}`, {
      phone, sort_key: `sahifa-${i}`, Date: '10.03.2026 09:00:00',
      AnalysisResults: [{ Analyte: 'Gemoglobin', Result: '131', AnalyteUnit: 'g/L' }],
    });
  }

  telegramCalls.length = 0;
  const pricesBefore = callCount('Scan', 'test_prices');
  const res = await call(notifyResults, 'https://dimed.uz/api/notify-results?mode=full');
  assert.equal(res.status, 200);
  const pricesScans = callCount('Scan', 'test_prices') - pricesBefore;

  const missed = chats.filter((chat) => !telegramCalls.some((c) => c.body.chat_id === chat));
  assert.deepEqual(missed, [], 'hamma bemorga xabar borishi kerak');
  // Referenslar hamma uchun bir xil: ilgari har bemorda qayta o'qilardi.
  assert.equal(pricesScans, 1, `prices jadvali ${pricesScans} marta o'qildi`);
});

console.log('\nBemorni tanlash (bir telefon — bir oila):');

await test('sessiyasiz /api/patients 401 qaytaradi', async () => {
  const res = await call(patientsApi, 'https://dimed.uz/api/patients');
  assert.equal(res.status, 401);
});

await test('1C dagi oila a\'zolari variant sifatida chiqadi', async () => {
  seed('test_individuals', '+998901234567|30001', {
    phone: '+998901234567', sort_key: '30001',
    Surname: 'Toirov', Name: 'Rozimuhammad', Patronymic: 'Alisherovich',
  });
  seed('test_individuals', '+998901234567|30002', {
    phone: '+998901234567', sort_key: '30002',
    FullName: 'Toirova Malika Rozimuhammadovna', Birthday: '2015-06-01',
  });
  seed('test_individuals', '+998901234567|30003', {
    phone: '+998901234567', sort_key: '30003',
    Surname: 'Eski', Name: 'Yozuv', DeletionMark: true,
  });

  const data = await (await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: sessionCookie },
  })).json();

  const nomlar = data.patients.map((p) => p.name);
  assert.ok(nomlar.includes('Toirov Rozimuhammad Alisherovich'));
  assert.ok(nomlar.includes('Toirova Malika Rozimuhammadovna'));
  assert.ok(!nomlar.some((n) => n.includes('Eski')), 'o\'chirilgani chiqmasligi kerak');
  assert.equal(data.activeId, null, 'hali hech kim tanlanmagan');

  const azizova = data.patients.find((p) => p.id === '555A');
  assert.equal(azizova.birthDate, '1990-04-25', '1C Birthday ISO ko\'rinishida qaytadi');
  const toirov = data.patients.find((p) => p.id === '30001');
  assert.equal(toirov.birthDate, null, 'Birthday bo\'lmasa null');
});

await test('mavjud bemorga tug\'ilgan sana kiritiladi (1C va saytniki)', async () => {
  const bad = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'birthDate', id: '30001', birthDate: '2030-02-30' }),
  });
  assert.equal(bad.status, 400, 'haqiqiy bo\'lmagan sana rad etiladi');

  const res = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'birthDate', id: '30001', birthDate: '1988-12-01' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).patient.birthDate, '1988-12-01');
  assert.equal(tableOf('test_users').get('777').birth_dates['30001'], '1988-12-01',
    '1C bemorining sanasi users.birth_dates da turadi');

  const data = await (await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.equal(data.patients.find((p) => p.id === '30001').birthDate, '1988-12-01');

  const yoq = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'birthDate', id: 'yoq-bunday', birthDate: '1988-12-01' }),
  });
  assert.equal(yoq.status, 404);
});

await test('yangi oila a\'zosi qo\'shiladi va tanlanadi', async () => {
  const bad = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'add', firstName: 'Sardor' }),
  });
  assert.equal(bad.status, 400, 'familiyasiz qabul qilinmaydi');

  const noBirth = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'add', firstName: 'Sardor', lastName: 'Karimov' }),
  });
  assert.equal(noBirth.status, 400, 'tug\'ilgan sanasiz qabul qilinmaydi');
  assert.match((await noBirth.json()).error, /Tug‘ilgan sana/);

  const res = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({
      action: 'add', firstName: 'Sardor', lastName: 'Karimov', birthDate: '2019-03-08',
    }),
  });
  assert.equal(res.status, 200);
  const { patient, activeId } = await res.json();
  assert.equal(patient.name, 'Karimov Sardor');
  assert.equal(patient.source, 'local');
  assert.equal(patient.birthDate, '2019-03-08');
  assert.equal(activeId, patient.id, 'yangi qo\'shilgani darhol tanlanadi');
  const saved = tableOf('test_users').get('777').patients.find((p) => p.id === patient.id);
  assert.equal(saved.birth_date, '2019-03-08', 'bemor yozuviga saqlanadi');

  const data = await (await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.ok(data.patients.some((p) => p.id === patient.id));
});

await test('boshqa bemorni tanlash saqlanadi', async () => {
  const res = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'select', id: '30001' }),
  });
  assert.equal(res.status, 200);

  const data = await (await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.equal(data.activeId, '30001');

  const yolgon = await call(patientsApi, 'https://dimed.uz/api/patients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ action: 'select', id: 'yoq-bunday' }),
  });
  assert.equal(yolgon.status, 404);
});

await test('navbat tanlangan bemor nomiga olinadi', async () => {
  const yolgon = await call(book, 'https://dimed.uz/api/book', authed({
    doctor: 'ashurov', date: BOOK_DATE, time: '11:00', patientId: 'yoq-bunday',
  }));
  assert.equal(yolgon.status, 404, 'noma\'lum bemor bilan bron qilinmaydi');

  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: BOOK_DATE, time: '11:00', patientId: '30002',
  }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.appointment.patientName, 'Toirova Malika Rozimuhammadovna');

  const appt = tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|11:00`);
  assert.equal(appt.patient_id, '30002');
  assert.equal(appt.patient_name, 'Toirova Malika Rozimuhammadovna');

  // Kabinetda ham kimniki ekani ko'rinadi.
  const cabinet = await (await call(me, 'https://dimed.uz/api/me', {
    headers: { cookie: sessionCookie },
  })).json();
  const olingan = cabinet.appointments.find((a) => a.time === '11:00' && a.date === BOOK_DATE);
  assert.equal(olingan.patientName, 'Toirova Malika Rozimuhammadovna');

  // Keyingi testlar bemorda bitta qabul bo'lishiga tayanadi.
  tableOf('test_appointments').delete(`ashurov#${BOOK_DATE}|11:00`);
});

console.log('\nShifokor kabineti:');
await test('bemor shifokor kabinetiga kira olmaydi', async () => {
  const res = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule', {
    headers: { cookie: sessionCookie },
  });
  assert.equal(res.status, 403);
});

let doctorCookie;
await test('shifokor o\'z jadvalini va navbatini ko\'radi', async () => {
  doctorCookie = createSessionCookie({ phone: '+998900000555', userId: '555' }).split(';')[0];
  const res = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule', {
    headers: { cookie: doctorCookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.doctor.name, 'Ashurov Tursunali');
  assert.equal(data.slots.length, 8);
});

await test('shifokor kelgusi kun navbatini ?date bilan ko\'radi', async () => {
  // BOOK_DATE ga bemor navbati bor (yuqoridagi bron testidan).
  const res = await call(doctorSchedule, `https://dimed.uz/api/doctor-schedule?date=${BOOK_DATE}`, {
    headers: { cookie: doctorCookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.date, BOOK_DATE);
  assert.ok(data.appointments.length >= 1, 'kelgusi kunning navbati ko\'rinishi kerak');
  assert.ok(data.appointments[0].phone.includes('•'), 'telefon niqoblangan bo\'lishi kerak');
  assert.equal(data.appointments[0].patientName, 'Azizova');
  assert.equal(data.appointments[0].patientBirthDate, '1990-04-25', 'shifokor bemor yoshini ko\'radi');
  assert.equal(data.dayOff, false);
  assert.equal(data.isWorkday, true);

  const bad = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule?date=21-08-2026', {
    headers: { cookie: doctorCookie },
  });
  assert.equal(bad.status, 400, 'noto\'g\'ri sana rad etilishi kerak');
});

await test('shifokor smenalari va slot davomiyligini o\'zgartiradi', async () => {
  const res = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
    body: JSON.stringify({
      shifts: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      slotMinutes: 30,
    }),
  });
  assert.equal(res.status, 200);
  const doctor = tableOf('test_doctors').get('ashurov');
  assert.equal(doctor.slot_minutes, 30);
  assert.equal(doctor.shifts[0].start, '09:00');
});

await test('shifokor navbatni "qabul qilindi" / "kelmadi" deb belgilaydi (E2)', async () => {
  const bemor = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: BOOK_DATE, time: '09:00', status: 'done' }),
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
  });
  assert.equal(bemor.status, 403, 'bemor belgilay olmaydi');

  const yomon = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: BOOK_DATE, time: '09:00', status: 'keldi' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(yomon.status, 400);

  const yoq = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: BOOK_DATE, time: '15:00', status: 'done' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(yoq.status, 404, 'bo\'sh slotni belgilab bo\'lmaydi');

  const res = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: BOOK_DATE, time: '09:00', status: 'no_show' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(res.status, 200);
  const appt = tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|09:00`);
  assert.equal(appt.status, 'no_show');
  assert.ok(appt.marked_at);

  // Tuzatish: kelmadi → qabul qilindi
  const fix = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: BOOK_DATE, time: '09:00', status: 'done' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(fix.status, 200);
  assert.equal(tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|09:00`).status, 'done');

  // Bemor kabinetida ham ko'rinadi, navbat ro'yxatida ham qoladi.
  const cabinet = await (await call(me, 'https://dimed.uz/api/me?include=appointments', {
    headers: { cookie: sessionCookie },
  })).json();
  assert.equal(cabinet.appointments.find((a) => a.time === '09:00' && a.date === BOOK_DATE).status, 'done');
  const queue = await (await call(doctorSchedule, `https://dimed.uz/api/doctor-schedule?date=${BOOK_DATE}`, {
    headers: { cookie: doctorCookie },
  })).json();
  assert.equal(queue.appointments.find((a) => a.time === '09:00').status, 'done');

  // Keyingi testlar (ko'chirish) kuchdagi bronga tayanadi — qaytaramiz.
  seed('test_appointments', `ashurov#${BOOK_DATE}|09:00`, { ...appt, status: 'booked' });
});

await test('ustma-ust smenalar rad etiladi', async () => {
  const res = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
    body: JSON.stringify({
      shifts: [{ start: '09:00', end: '13:00' }, { start: '12:00', end: '17:00' }],
    }),
  });
  assert.equal(res.status, 400);
});

await test('yangi jadval slotlarga darhol ta\'sir qiladi', async () => {
  const res = await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`);
  const data = await res.json();
  assert.equal(data.slotMinutes, 30);
  assert.equal(data.slots[0].time, '09:00');
  assert.ok(!data.slots.some((s) => s.time === '08:00'), 'eski smena qolmasin');
});

await test('band qilingan navbat jadval o\'zgarsa ham saqlanadi', async () => {
  const appt = tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|09:00`);
  assert.equal(appt.status, 'booked');
  const res = await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`);
  const data = await res.json();
  assert.equal(data.slots.find((s) => s.time === '09:00').free, false, 'band navbat band qolishi kerak');
});

console.log('\nVaqtni ko\'chirish:');
const move = (obj) => ({ ...jsonBody(obj), headers: { 'content-type': 'application/json', cookie: sessionCookie } });

await test('kirmagan foydalanuvchi ko\'chira olmaydi', async () => {
  const res = await call(reschedule, 'https://dimed.uz/api/reschedule', jsonBody({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', toDate: BOOK_DATE, toTime: '10:00',
  }));
  assert.equal(res.status, 401);
});

await test('begona qabulni ko\'chirib bo\'lmaydi', async () => {
  const other = createSessionCookie({ phone: '+998911111111', userId: '9001' }).split(';')[0];
  const res = await call(reschedule, 'https://dimed.uz/api/reschedule', {
    ...jsonBody({ doctor: 'ashurov', date: BOOK_DATE, time: '09:00', toDate: BOOK_DATE, toTime: '10:00' }),
    headers: { 'content-type': 'application/json', cookie: other },
  });
  assert.equal(res.status, 403);
});

await test('o\'sha vaqtning o\'ziga ko\'chirib bo\'lmaydi', async () => {
  const res = await call(reschedule, 'https://dimed.uz/api/reschedule', move({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', toDate: BOOK_DATE, toTime: '09:00',
  }));
  assert.equal(res.status, 400);
});

await test('jadvalda yo\'q vaqtga ko\'chirib bo\'lmaydi', async () => {
  const res = await call(reschedule, 'https://dimed.uz/api/reschedule', move({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', toDate: BOOK_DATE, toTime: '12:30',
  }));
  assert.equal(res.status, 400);
});

await test('qabul boshqa vaqtga ko\'chadi va botga xabar ketadi', async () => {
  telegramCalls.length = 0;
  const res = await call(reschedule, 'https://dimed.uz/api/reschedule', move({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', toDate: BOOK_DATE, toTime: '10:00',
  }));
  assert.equal(res.status, 200);

  const table = tableOf('test_appointments');
  assert.equal(table.get(`ashurov#${BOOK_DATE}|09:00`).status, 'moved', 'eski yozuv moved bo\'lishi kerak');

  const moved = table.get(`ashurov#${BOOK_DATE}|10:00`);
  assert.equal(moved.status, 'booked');
  assert.equal(moved.phone, '+998901234567');
  assert.equal(moved.moved_from, `${BOOK_DATE} 09:00`);
  assert.equal(moved.patient_name, 'Azizova', 'bemor kimligi yangi yozuvga ko\'chishi kerak');
  assert.equal(moved.patient_birth_date, '1990-04-25');
  assert.equal(moved.reminded_at, undefined, 'yangi vaqt uchun eslatma qaytadan yuborilishi kerak');
  assert.ok(telegramCalls.some((c) => c.body.text.includes('o\'zgartirildi')));
});

await test('eski slot bo\'shaydi, yangisi band bo\'ladi', async () => {
  const data = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`)).json();
  assert.equal(data.slots.find((s) => s.time === '09:00').free, true);
  assert.equal(data.slots.find((s) => s.time === '10:00').free, false);
});

await test('ko\'chirilgan yozuvni qayta ko\'chirib bo\'lmaydi', async () => {
  const res = await call(reschedule, 'https://dimed.uz/api/reschedule', move({
    doctor: 'ashurov', date: BOOK_DATE, time: '09:00', toDate: BOOK_DATE, toTime: '11:00',
  }));
  assert.equal(res.status, 400);
});

await test('kabinetda faqat yangi vaqt ko\'rinadi', async () => {
  const data = await (await call(me, 'https://dimed.uz/api/me', { headers: { cookie: sessionCookie } })).json();
  assert.equal(data.appointments.length, 1);
  assert.equal(data.appointments[0].time, '10:00');
  assert.equal(data.appointments[0].canMove, true);
});

console.log('\nBemor bronni bekor qiladi:');
await test('bekor qilish slotni bo\'shatadi va botga xabar ketadi', async () => {
  const restore = clearUpcoming();
  const CANCEL_DATE = addDays(BOOK_DATE, 6);
  const before = tableOf('test_doctors').get('ashurov');
  seed('test_doctors', 'ashurov', {
    ...before, slot_minutes: 60, shifts: [{ start: '08:00', end: '17:00' }],
    workdays: [0, 1, 2, 3, 4, 5, 6], age_group: 'all',
  });

  const booked = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: CANCEL_DATE, time: '09:00',
  }));
  assert.equal(booked.status, 200, JSON.stringify(await booked.clone().json()));

  const kirmagan = await call(cancelApi, 'https://dimed.uz/api/cancel',
    jsonBody({ doctor: 'ashurov', date: CANCEL_DATE, time: '09:00' }));
  assert.equal(kirmagan.status, 401);

  const begona = await call(cancelApi, 'https://dimed.uz/api/cancel', {
    ...jsonBody({ doctor: 'ashurov', date: CANCEL_DATE, time: '09:00' }),
    headers: { 'content-type': 'application/json', cookie: otherCookie },
  });
  assert.equal(begona.status, 403);

  telegramCalls.length = 0;
  const res = await call(cancelApi, 'https://dimed.uz/api/cancel', {
    ...jsonBody({ doctor: 'ashurov', date: CANCEL_DATE, time: '09:00' }),
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
  });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_appointments').get(`ashurov#${CANCEL_DATE}|09:00`).status, 'cancelled');
  assert.ok(telegramCalls.some((c) => c.body.text?.includes('bekor qilindi')));

  // Slot yana bo'sh — boshqa bemor olishi mumkin.
  const free = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${CANCEL_DATE}`)).json();
  assert.equal(free.slots.find((x) => x.time === '09:00').free, true);

  // Ikkinchi marta bekor qilib bo'lmaydi.
  const again = await call(cancelApi, 'https://dimed.uz/api/cancel', {
    ...jsonBody({ doctor: 'ashurov', date: CANCEL_DATE, time: '09:00' }),
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
  });
  assert.equal(again.status, 400);
  seed('test_doctors', 'ashurov', before);
  restore();
});

await test('qabulga 1 soatdan kam qolsa bekor qilib bo\'lmaydi', async () => {
  const soon = new Date(Date.now() + 30 * 60_000);
  const { dateKey } = toTashkent(soon);
  const time = toHHMM(toTashkent(soon).minutes);
  seed('test_appointments', `ashurov#${dateKey}|${time}`, {
    doctor_day: `ashurov#${dateKey}`, time, doctor_id: 'ashurov', date: dateKey,
    phone: '+998901234567', telegram_id: '777', starts_at: soon.toISOString(),
    status: 'booked', price: 70000, created_at: new Date().toISOString(),
  });
  const res = await call(cancelApi, 'https://dimed.uz/api/cancel', {
    ...jsonBody({ doctor: 'ashurov', date: dateKey, time }),
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /1 soatdan kam/);
});

console.log('\nEslatmalar:');
// Bron API'si 1 soat qoidasi sababli bunday yozuvni yarata olmaydi,
// shuning uchun eslatma uchun yozuvni to'g'ridan-to'g'ri qo'yamiz.
const soon = toTashkent(new Date(Date.now() + 30 * 60_000));
const SOON_DATE = soon.dateKey;
const SOON_TIME = toHHMM(soon.minutes);
const TODAY = toTashkent(new Date()).dateKey;

seed('test_appointments', `ashurov#${SOON_DATE}|${SOON_TIME}`, {
  doctor_day: `ashurov#${SOON_DATE}`,
  time: SOON_TIME,
  doctor_id: 'ashurov',
  date: SOON_DATE,
  phone: '+998901234567',
  telegram_id: '777',
  starts_at: toInstant(SOON_DATE, SOON_TIME).toISOString(),
  status: 'booked',
  price: 70000,
  created_at: new Date().toISOString(),
});

await test('bir soat qolganda bemorga eslatma ketadi', async () => {
  telegramCalls.length = 0;
  const res = await call(remindPatients, 'https://dimed.uz/api/remind-patients', { method: 'POST' });
  assert.equal(res.status, 200);

  assert.ok(
    telegramCalls.some((c) => c.body.chat_id === '777' && c.body.text.includes(SOON_TIME)),
    'eslatma xabari yuborilishi kerak',
  );
  assert.ok(tableOf('test_appointments').get(`ashurov#${SOON_DATE}|${SOON_TIME}`).reminded_at);
});

await test('eslatma ikkinchi marta yuborilmaydi', async () => {
  telegramCalls.length = 0;
  await call(remindPatients, 'https://dimed.uz/api/remind-patients', { method: 'POST' });
  assert.equal(telegramCalls.length, 0, 'takroriy eslatma bo\'lmasligi kerak');
});

await test('ertaga bo\'ladigan qabulga hozir eslatma yuborilmaydi', async () => {
  assert.equal(tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|10:00`).reminded_at, undefined);
});

console.log('\nShifokorga kunlik xulosa:');
// Bugungi kunda albatta bitta navbat bo'lishi uchun (yuqoridagi
// yozuv yarim tundan keyinga tushib qolishi mumkin).
seed('test_appointments', `ashurov#${TODAY}|06:00`, {
  doctor_day: `ashurov#${TODAY}`,
  time: '06:00',
  doctor_id: 'ashurov',
  date: TODAY,
  phone: '+998901234567',
  telegram_id: '777',
  starts_at: toInstant(TODAY, '06:00').toISOString(),
  status: 'booked',
  price: 70000,
  created_at: new Date().toISOString(),
});

await test('shifokor bugungi navbatlari ro\'yxatini oladi', async () => {
  telegramCalls.length = 0;
  const res = await call(doctorDaily, 'https://dimed.uz/api/doctor-daily', { method: 'POST' });
  assert.equal(res.status, 200);

  const message = telegramCalls.find((c) => c.body.chat_id === '555');
  assert.ok(message, 'shifokorga xabar ketishi kerak');
  assert.ok(message.body.text.includes('Bugungi navbatlaringiz'));
  assert.ok(message.body.text.includes('06:00'));
  assert.ok(!message.body.text.includes('+998901234567'), 'raqam to\'liq ko\'rsatilmasligi kerak');
});

await test('kunlik xulosa bir kunda bir marta ketadi', async () => {
  telegramCalls.length = 0;
  await call(doctorDaily, 'https://dimed.uz/api/doctor-daily', { method: 'POST' });
  assert.equal(telegramCalls.length, 0, 'takroriy xulosa bo\'lmasligi kerak');
});

console.log('\nShifokor ishga chiqolmadi:');
await test('bemor bu tugmani bosa olmaydi', async () => {
  const res = await call(doctorOff, 'https://dimed.uz/api/doctor-off', move({ date: BOOK_DATE }));
  assert.equal(res.status, 403);
});

await test('o\'tgan kunni yopib bo\'lmaydi', async () => {
  const res = await call(doctorOff, 'https://dimed.uz/api/doctor-off', {
    ...jsonBody({ date: '2020-01-01' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(res.status, 400);
});

await test('kun yopiladi va bemorlarga xabar boradi', async () => {
  telegramCalls.length = 0;
  const res = await call(doctorOff, 'https://dimed.uz/api/doctor-off', {
    ...jsonBody({ date: BOOK_DATE, reason: 'Kasal bo\'lib qoldim' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.cancelled, 1, 'o\'sha kundagi bitta navbat bekor qilinishi kerak');
  assert.equal(data.notified, 1);

  assert.equal(tableOf('test_appointments').get(`ashurov#${BOOK_DATE}|10:00`).status, 'cancelled_by_clinic');
  assert.ok(telegramCalls.some((c) => c.body.text.includes('Kasal bo\'lib qoldim')));
});

await test('sabab matni Telegram HTML uchun ekranlanadi', async () => {
  // `<` yoki `&` bo'lsa Telegram xabarni butunlay rad etardi ("can't parse
  // entities") — bemor qabuli bekor qilinganini bilmay qolardi.
  const day = addDays(toTashkent(new Date()).dateKey, 45);
  seed('test_appointments', `ashurov#${day}|11:00`, {
    doctor_day: `ashurov#${day}`, time: '11:00', doctor_id: 'ashurov', date: day,
    phone: '+998905550005', telegram_id: '66608', starts_at: toInstant(day, '11:00').toISOString(),
    status: 'booked', price: 70000, created_at: new Date().toISOString(),
  });
  telegramCalls.length = 0;
  const res = await call(doctorOff, 'https://dimed.uz/api/doctor-off', {
    ...jsonBody({ date: day, reason: 'Isitma <38> & yo\'tal' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(res.status, 200);
  const sent = telegramCalls.find((c) => c.body.chat_id === '66608');
  assert.ok(sent, 'bemorga xabar ketishi kerak');
  assert.ok(sent.body.text.includes('Sabab: Isitma &lt;38&gt; &amp; yo\'tal'), sent.body.text);
});

await test('bemor kabinetda bekor qilinganini ko\'radi', async () => {
  const data = await (await call(me, 'https://dimed.uz/api/me', { headers: { cookie: sessionCookie } })).json();
  const cancelled = data.appointments.find((a) => a.date === BOOK_DATE);
  assert.equal(cancelled.status, 'cancelled_by_clinic');
  assert.equal(cancelled.canMove, false, 'bekor qilinganini ko\'chirib bo\'lmaydi');
});

await test('yopilgan kunda slot qolmaydi', async () => {
  const data = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`)).json();
  assert.equal(data.slots.length, 0);
});

await test('dam olish kuni belgilansa slot qolmaydi, kabinet buni ko\'rsatadi', async () => {
  const res = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
    body: JSON.stringify({ date: BOOK_DATE, dayOff: true }),
  });
  assert.equal(res.status, 200);

  const after = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${BOOK_DATE}`)).json();
  assert.equal(after.slots.length, 0);

  const day = await (await call(doctorSchedule, `https://dimed.uz/api/doctor-schedule?date=${BOOK_DATE}`, {
    headers: { cookie: doctorCookie },
  })).json();
  assert.equal(day.dayOff, true, 'kabinet kun yopiqligini bilishi kerak');
  assert.deepEqual(day.slots, []);

  // Kunni qayta ochish — slotlar qaytadi.
  const open = await call(doctorSchedule, 'https://dimed.uz/api/doctor-schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
    body: JSON.stringify({ date: BOOK_DATE, dayOff: false }),
  });
  assert.equal(open.status, 200);
  const reopened = await (await call(doctorSchedule, `https://dimed.uz/api/doctor-schedule?date=${BOOK_DATE}`, {
    headers: { cookie: doctorCookie },
  })).json();
  assert.equal(reopened.dayOff, false);
  assert.ok(reopened.slots.length > 0, 'qayta ochilgach slotlar ko\'rinadi');
});

// ================= Admin panel =================
const adminCookie = createSessionCookie({ phone: '+998900424242', userId: '424242' }).split(';')[0];

console.log('\nAdmin panel:');

await test('GET /api/doctors faol shifokorlarni qaytaradi', async () => {
  const res = await call(doctorsList, 'https://dimed.uz/api/doctors');
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(Array.isArray(list));
  const a = list.find((d) => d.id === 'ashurov');
  assert.ok(a, 'ashurov ro\'yxatda bo\'lishi kerak');
  assert.equal(a.deptId, 'terapiya', 'dept_id → deptId ko\'chirilgan');
  assert.equal(a.telegramId, undefined, 'telegram_id public javobda chiqmasligi kerak');
});

await test('admin-doctors sessiyasiz 401', async () => {
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors');
  assert.equal(res.status, 401);
});

await test('oddiy bemorga 403 va o\'z Telegram ID si qaytadi', async () => {
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    headers: { cookie: sessionCookie },
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.telegramId, '777', 'egasi o\'z ID sini bilishi uchun');
});

await test('admin barcha shifokorlarni ko\'radi', async () => {
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200);
  const { doctors } = await res.json();
  assert.ok(doctors.find((d) => d.id === 'ashurov'));
});

await test('admin yangi shifokor qo\'shadi va u /api/doctors da ko\'rinadi', async () => {
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      id: 'yangidoc',
      name: 'Yangi Shifokor',
      job: 'Dermatolog',
      deptId: 'terapiya',
      price: 55000,
      slotMinutes: 20,
      workdays: [1, 2, 3],
      shifts: [{ start: '09:00', end: '13:00' }],
    }),
  });
  assert.equal(res.status, 200);

  const list = await (await call(doctorsList, 'https://dimed.uz/api/doctors')).json();
  assert.ok(list.find((d) => d.id === 'yangidoc'), 'yangi shifokor public ro\'yxatda');
});

await test('admin noto\'g\'ri bo\'lim va slotni rad etadi', async () => {
  const badDept = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      id: 'yomon', name: 'X', job: 'Y', deptId: 'yoqdept',
      price: 1000, slotMinutes: 20, workdays: [1], shifts: [{ start: '09:00', end: '10:00' }],
    }),
  });
  assert.equal(badDept.status, 400);

  const badSlot = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      id: 'yomon2', name: 'X', job: 'Y', deptId: 'terapiya',
      price: 1000, slotMinutes: 7, workdays: [1], shifts: [{ start: '09:00', end: '10:00' }],
    }),
  });
  assert.equal(badSlot.status, 400);
});

await test('bitta Telegram ID ni ikki shifokorga bog\'lab bo\'lmaydi', async () => {
  // ashurov ning telegram_id si '555'. Uni yangidoc ga bog'lashga urinamiz.
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      id: 'yangidoc', name: 'Yangi Shifokor', job: 'Dermatolog', deptId: 'terapiya',
      price: 55000, slotMinutes: 20, workdays: [1, 2, 3],
      shifts: [{ start: '09:00', end: '13:00' }], telegramId: '555',
    }),
  });
  assert.equal(res.status, 400);
});

await test('admin shifokorni o\'chiradi — u faolsizlanadi', async () => {
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: 'yangidoc' }),
  });
  assert.equal(res.status, 200);

  // /api/doctors da endi ko'rinmaydi
  const list = await (await call(doctorsList, 'https://dimed.uz/api/doctors')).json();
  assert.equal(list.find((d) => d.id === 'yangidoc'), undefined);

  // Admin ro'yxatida active:false bilan turadi (tarix saqlanadi)
  const { doctors } = await (
    await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', { headers: { cookie: adminCookie } })
  ).json();
  const yd = doctors.find((d) => d.id === 'yangidoc');
  assert.ok(yd && yd.active === false, 'faolsiz holatda ro\'yxatda qoladi');
});

console.log('\nNarxlar (F2):');
await test('/api/prices ommaviy: bo\'sh jadval — bo\'sh ro\'yxat, shifokor narxlari bor', async () => {
  const res = await call(pricesApi, 'https://dimed.uz/api/prices');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.analyses, []);
  assert.ok(data.doctors.some((d) => d.id === 'ashurov' && d.price === 70000));
  assert.ok(!data.doctors.some((d) => d.id === 'yangidoc'), 'faolsiz shifokor chiqmaydi');
});

await test('admin-prices: ruxsat, tekshiruv va tahlil narxini saqlash', async () => {
  const anon = await call(adminPrices, 'https://dimed.uz/api/admin-prices');
  assert.equal(anon.status, 401);
  const bemor = await call(adminPrices, 'https://dimed.uz/api/admin-prices', { headers: { cookie: sessionCookie } });
  assert.equal(bemor.status, 403);

  const bad = await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ kind: 'analysis', code: '19', title: 'Glyukoza', price: -5 }),
  });
  assert.equal(bad.status, 400);

  const res = await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({
      kind: 'analysis', code: '19', title: 'Glyukoza', group: 'Biokimyoviy qon tahlillari',
      duration: '30-60 daqiqa', price: 48000,
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_prices').get('analysis#19').price, 48000);

  const list = await (await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    headers: { cookie: adminCookie },
  })).json();
  assert.equal(list.analyses.find((a) => a.code === '19').price, 48000);
  assert.ok(list.doctors.some((d) => d.id === 'ashurov'));

  const pub = await (await call(pricesApi, 'https://dimed.uz/api/prices')).json();
  assert.equal(pub.analyses.find((a) => a.code === '19').price, 48000, 'ommaviy API ham yangi narxni beradi');
  assert.equal(pub.analyses[0].active, true);

  // Saytdan yashirish
  const hide = await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ kind: 'analysis', code: '19', title: 'Glyukoza', price: 48000, active: false }),
  });
  assert.equal(hide.status, 200);
  const pub2 = await (await call(pricesApi, 'https://dimed.uz/api/prices')).json();
  assert.equal(pub2.analyses.find((a) => a.code === '19').active, false);
});

await test('admin-prices: shifokor qabuli narxi', async () => {
  const yoq = await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ kind: 'doctor', id: 'yoq-shifokor', price: 50000 }),
  });
  assert.equal(yoq.status, 404);

  const res = await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ kind: 'doctor', id: 'ashurov', price: 80000 }),
  });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_doctors').get('ashurov').price, 80000);
  assert.equal(tableOf('test_doctors').get('ashurov').telegram_id, '555', 'bog\'lanish tegilmaydi');

  const pub = await (await call(pricesApi, 'https://dimed.uz/api/prices')).json();
  assert.equal(pub.doctors.find((d) => d.id === 'ashurov').price, 80000);

  // Payme testlari 70 000 so'mga tayanadi — qaytaramiz.
  await call(adminPrices, 'https://dimed.uz/api/admin-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ kind: 'doctor', id: 'ashurov', price: 70000 }),
  });
});

console.log('\nAdmin — referens (me\'yoriy) oraliqlari (F4):');
const postRef = (body, cookie = adminCookie) =>
  call(adminReferences, 'https://dimed.uz/api/admin-references', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

await test('admin-references: ruxsat va tekshiruv', async () => {
  assert.equal((await call(adminReferences, 'https://dimed.uz/api/admin-references')).status, 401);
  assert.equal(
    (await call(adminReferences, 'https://dimed.uz/api/admin-references', { headers: { cookie: sessionCookie } })).status,
    403,
  );
  assert.equal((await postRef({ gender: 'male', low: 1, high: 2 })).status, 400, 'nomsiz');
  assert.equal((await postRef({ name: 'X' })).status, 400, 'chegarasiz');
  assert.equal((await postRef({ name: 'X', low: 9, high: 1 })).status, 400, 'past > yuqori');
});

await test('admin-references: qo\'shish, ro\'yxat, ommaviyga chiqmaydi', async () => {
  const res = await postRef({ name: 'Gemoglobin', gender: 'male', low: 130, high: 170, unit: 'g/L' });
  assert.equal(res.status, 200);
  assert.equal(tableOf('test_prices').get('reference#gemoglobin#male').low, 130);

  const list = await (await call(adminReferences, 'https://dimed.uz/api/admin-references', {
    headers: { cookie: adminCookie },
  })).json();
  assert.ok(list.references.some((r) => r.name === 'Gemoglobin' && r.gender === 'male' && r.high === 170));

  // Ommaviy /api/prices referenslarni bermaydi (faqat kind=analysis).
  const pub = await (await call(pricesApi, 'https://dimed.uz/api/prices')).json();
  assert.ok(!pub.analyses.some((a) => a.code === undefined || String(a.title) === 'Gemoglobin' && a.group === ''), 'referens ommaviyga chiqmasin');
});

await test('admin referens 1C bermagan oraliqni to\'ldiradi (natijada holat)', async () => {
  // 1C oraliqsiz Gemoglobin (erkak bemor). Admin referensi: 130–170.
  seed('test_analysis_results', '+998901234567|doc-ref', {
    phone: '+998901234567', sort_key: 'doc-ref', Date: '12.03.2026 09:00:00',
    PatientIsMale: true,
    AnalysisResults: [{ Analyte: 'Gemoglobin', Result: '118', AnalyteUnit: 'g/L' }],
  });
  const data = await (await call(me, 'https://dimed.uz/api/me?include=results', {
    headers: { cookie: sessionCookie },
  })).json();
  const doc = data.results.find((r) => r.id === 'doc-ref');
  const hgb = doc.items[0];
  assert.equal(hgb.reference, '130 — 170', 'admin referensi qo\'yiladi');
  assert.equal(hgb.status, 'low', '118 < 130 → past');

  // Tozalash: keyingi testlarga ta'sir qilmasin.
  const del = await call(adminReferences, 'https://dimed.uz/api/admin-references', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ id: 'reference#gemoglobin#male' }),
  });
  assert.equal(del.status, 200);
  assert.equal(tableOf('test_prices').has('reference#gemoglobin#male'), false);
});

await test('admin referensi boshqa birlikdagi natijaga qo\'llanmaydi', async () => {
  // Admin oralig'i g/L da, 1C natijasi g/dL da: 13.5 g/dL me'yorda, lekin
  // 130–170 bilan taqqoslansa bemor "past" belgisini ko'rardi.
  assert.equal((await postRef({ name: 'Gemoglobin', gender: 'male', low: 130, high: 170, unit: 'g/L' })).status, 200);
  // Birlik kirillcha yozilgan — natijadagi "mmol/L" bilan bir xil.
  assert.equal((await postRef({ name: 'Glyukoza', gender: 'all', low: 3.9, high: 6.1, unit: 'ммоль/л' })).status, 200);
  seed('test_analysis_results', '+998901234567|doc-birlik', {
    phone: '+998901234567', sort_key: 'doc-birlik', Date: '13.03.2026 09:00:00',
    PatientIsMale: true,
    AnalysisResults: [
      { Analyte: 'Gemoglobin', Result: '13.5', AnalyteUnit: 'g/dL' },
      { Analyte: 'Glyukoza', Result: '7.2', AnalyteUnit: 'mmol/L' },
    ],
  });
  const data = await (await call(me, 'https://dimed.uz/api/me?include=results', {
    headers: { cookie: sessionCookie },
  })).json();
  const [hgb, glu] = data.results.find((r) => r.id === 'doc-birlik').items;
  assert.equal(hgb.reference, null, 'boshqa birlikdagi oraliq qo\'yilmaydi');
  assert.equal(hgb.status, null, 'noto\'g\'ri "past" chiqmasligi kerak');
  assert.equal(glu.reference, '3.9 — 6.1', 'bir xil birlik — turlicha yozilgan');
  assert.equal(glu.status, 'high');

  for (const id of ['reference#gemoglobin#male', 'reference#glyukoza#all']) {
    const del = await call(adminReferences, 'https://dimed.uz/api/admin-references', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ id }),
    });
    assert.equal(del.status, 200);
  }
});

console.log('\nBaho (G2/F3):');
const RATE_DATE = addDays(BOOK_DATE, 1);
const YESTERDAY = addDays(toTashkent(new Date()).dateKey, -1);
const tgHook = (update) => call(telegramWebhook, 'https://dimed.uz/api/telegram-webhook', {
  ...jsonBody(update),
  headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'webhook-secret' },
});
const rateCallback = (fromId, data, id = 'cq') => tgHook({
  callback_query: { id, from: { id: fromId, language_code: 'uz' }, message: { chat: { id: fromId }, message_id: 42 }, data },
});
const seedAppt = (date, time, extra) => seed('test_appointments', `ashurov#${date}|${time}`, {
  doctor_day: `ashurov#${date}`, time, doctor_id: 'ashurov', date, phone: '+998901234567',
  telegram_id: '777', patient_id: '555A', patient_name: 'Azizova', starts_at: toInstant(date, time).toISOString(),
  status: 'booked', price: 70000, created_at: new Date().toISOString(), ...extra,
});
const adminRateCookie = createSessionCookie({ phone: '+998900000424', userId: '424242' }).split(';')[0];

await test('"qabul qilindi" belgilanganda bemorga yulduzli so\'rov ketadi — bir marta', async () => {
  seedAppt(RATE_DATE, '11:00');
  telegramCalls.length = 0;
  const res = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: RATE_DATE, time: '11:00', status: 'done' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ratingAsked, true);
  const ask = telegramCalls.find((c) => c.body.chat_id === '777' && c.body.text?.includes('baholang'));
  assert.ok(ask, 'baho so\'rovi ketishi kerak');
  assert.match(ask.body.text, /Ashurov Tursunali/);
  const buttons = ask.body.reply_markup.inline_keyboard[0];
  assert.equal(buttons.length, 5, '1–5 yulduz tugmalari');
  assert.equal(buttons[4].callback_data, `r:ashurov|${RATE_DATE}|11:00:5`);
  assert.ok(buttons.every((b) => Buffer.byteLength(b.callback_data) <= 64), 'callback_data 64 baytdan oshmasin');
  assert.ok(tableOf('test_appointments').get(`ashurov#${RATE_DATE}|11:00`).rating_asked_at);

  telegramCalls.length = 0;
  const again = await call(appointmentStatus, 'https://dimed.uz/api/appointment-status', {
    ...jsonBody({ date: RATE_DATE, time: '11:00', status: 'done' }),
    headers: { 'content-type': 'application/json', cookie: doctorCookie },
  });
  assert.equal((await again.json()).ratingAsked, false);
  assert.equal(telegramCalls.filter((c) => c.body.chat_id === '777').length, 0, 'ikkinchi marta so\'ralmaydi');
});

await test('bemor yulduz bosadi — baho saqlanadi, shifokor o\'rtachasi yangilanadi', async () => {
  telegramCalls.length = 0;
  const res = await rateCallback(777, `r:ashurov|${RATE_DATE}|11:00:5`);
  assert.equal(res.status, 200);

  const rows = [...tableOf('test_ratings').values()].filter((r) => r.doctor_id === 'ashurov');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rating, 5);
  assert.equal(rows[0].patient_name, 'Azizova');
  assert.equal(rows[0].appointment_key, `ashurov#${RATE_DATE}|11:00`);
  assert.equal(rows[0].hidden, false);

  const doctor = tableOf('test_doctors').get('ashurov');
  assert.equal(doctor.rating_sum, 5);
  assert.equal(doctor.rating_count, 1);
  assert.equal(tableOf('test_appointments').get(`ashurov#${RATE_DATE}|11:00`).rating, 5);
  assert.ok(tableOf('test_users').get('777').pending_rating, 'izoh kutilmoqda');

  assert.ok(telegramCalls.some((c) => c.url.endsWith('/answerCallbackQuery')), 'tugmaga javob');
  assert.ok(telegramCalls.some((c) => c.url.endsWith('/editMessageReplyMarkup')), 'tugmalar olib tashlanadi');
  const thanks = telegramCalls.find((c) => c.url.endsWith('/sendMessage') && c.body.chat_id === 777);
  assert.ok(thanks, 'rahmat xabari');
  assert.match(thanks.body.text, /⭐️⭐️⭐️⭐️⭐️/);
  assert.equal(thanks.body.reply_markup.inline_keyboard[0][0].callback_data, 'rc:skip');

  // Ikkinchi bosish — eskirgan, takror yozilmaydi.
  telegramCalls.length = 0;
  await rateCallback(777, `r:ashurov|${RATE_DATE}|11:00:1`, 'cq2');
  assert.equal([...tableOf('test_ratings').values()].filter((r) => r.doctor_id === 'ashurov').length, 1);
  assert.equal(tableOf('test_doctors').get('ashurov').rating_count, 1);
  const answer = telegramCalls.find((c) => c.url.endsWith('/answerCallbackQuery'));
  assert.match(answer.body.text, /eskirgan|allaqachon/);
});

await test('begona bemor boshqaning navbatini baholay olmaydi', async () => {
  seedAppt(RATE_DATE, '12:00', { status: 'done', rating_asked_at: new Date().toISOString() });
  telegramCalls.length = 0;
  await rateCallback(888, `r:ashurov|${RATE_DATE}|12:00:4`, 'cq3');
  assert.equal(tableOf('test_appointments').get(`ashurov#${RATE_DATE}|12:00`).rating, undefined);
  assert.equal([...tableOf('test_ratings').values()].filter((r) => r.doctor_id === 'ashurov').length, 1);
  assert.match(telegramCalls.find((c) => c.url.endsWith('/answerCallbackQuery')).body.text, /eskirgan/);
  // Buzuq callback ham yiqitmaydi.
  const res = await rateCallback(777, 'r:ashurov|xato', 'cq4');
  assert.equal(res.status, 200);
});

await test('bemor javob yozsa — izoh bahoga biriktiriladi', async () => {
  telegramCalls.length = 0;
  const res = await tgHook({ message: { chat: { id: 777 }, from: { id: 777 }, text: '  Juda   yaxshi shifokor ' } });
  assert.equal(res.status, 200);
  const row = [...tableOf('test_ratings').values()].find((r) => r.doctor_id === 'ashurov');
  assert.equal(row.comment, 'Juda yaxshi shifokor');
  assert.equal(tableOf('test_users').get('777').pending_rating, undefined, 'kutish tugadi');
  assert.ok(telegramCalls.some((c) => c.body.chat_id === 777 && c.body.text?.includes('Izohingiz saqlandi')));

  // Kutish tugagach oddiy matn izoh bo'lmaydi va javob ketmaydi.
  telegramCalls.length = 0;
  await tgHook({ message: { chat: { id: 777 }, from: { id: 777 }, text: 'salom' } });
  assert.equal(telegramCalls.length, 0);
  assert.equal([...tableOf('test_ratings').values()].find((r) => r.doctor_id === 'ashurov').comment, 'Juda yaxshi shifokor');
});

await test('"Izohsiz" tugmasi kutishni bekor qiladi', async () => {
  seed('test_users', '777', {
    ...tableOf('test_users').get('777'),
    pending_rating: { doctor_id: 'ashurov', created_at: 'x', until: new Date(Date.now() + 3600_000).toISOString() },
  });
  telegramCalls.length = 0;
  await rateCallback(777, 'rc:skip', 'cq5');
  assert.equal(tableOf('test_users').get('777').pending_rating, undefined);
  assert.match(telegramCalls.find((c) => c.url.endsWith('/answerCallbackQuery')).body.text, /Rahmat/);
});

await test('/api/doctors da o\'rtacha baho va soni ko\'rinadi', async () => {
  const list = await (await call(doctorsList, 'https://dimed.uz/api/doctors')).json();
  const ashurov = list.find((d) => d.id === 'ashurov');
  assert.equal(ashurov.ratingAvg, 5);
  assert.equal(ashurov.ratingCount, 1);
});

await test('cron: vaqti o\'tgan navbat uchun so\'raladi, kelmagan uchun yo\'q', async () => {
  seedAppt(YESTERDAY, '08:00');
  seedAppt(YESTERDAY, '10:00', { status: 'no_show', marked_at: new Date().toISOString() });
  seedAppt(YESTERDAY, '11:00', { telegram_id: '888', phone: '+998900000888', patient_name: 'Boshqa' });
  telegramCalls.length = 0;
  const res = await call(askRatings, 'https://dimed.uz/api/ask-ratings');
  assert.equal(res.status, 200);
  const data = await res.json();
  // Oldingi testlarning bugungi (vaqti o'tgan) navbatlari ham so'ralishi mumkin.
  assert.ok(data.asked >= 2, JSON.stringify(data));
  assert.ok(tableOf('test_appointments').get(`ashurov#${YESTERDAY}|08:00`).rating_asked_at);
  assert.ok(tableOf('test_appointments').get(`ashurov#${YESTERDAY}|11:00`).rating_asked_at);
  assert.equal(tableOf('test_appointments').get(`ashurov#${YESTERDAY}|10:00`).rating_asked_at, undefined);
  const asks = telegramCalls.filter((c) => c.body.reply_markup?.inline_keyboard);
  assert.equal(asks.length, data.asked);
  assert.ok(asks.some((c) => c.body.chat_id === '888'), 'boshqa bemorga ham so\'rov ketadi');

  telegramCalls.length = 0;
  const again = await (await call(askRatings, 'https://dimed.uz/api/ask-ratings')).json();
  assert.equal(again.asked, 0, 'takror so\'ralmaydi');
  assert.equal(telegramCalls.length, 0);
});

await test('admin baholar ro\'yxati va yashirish (F3)', async () => {
  assert.equal((await call(adminRatings, 'https://dimed.uz/api/admin-ratings')).status, 401);
  assert.equal(
    (await call(adminRatings, 'https://dimed.uz/api/admin-ratings', { headers: { cookie: sessionCookie } })).status,
    403,
  );

  const list = await (await call(adminRatings, 'https://dimed.uz/api/admin-ratings', {
    headers: { cookie: adminRateCookie },
  })).json();
  const row = list.ratings.find((r) => r.doctorId === 'ashurov');
  assert.ok(row);
  assert.equal(row.doctorName, 'Ashurov Tursunali');
  assert.equal(row.rating, 5);
  assert.equal(row.comment, 'Juda yaxshi shifokor');
  assert.equal(row.patientName, 'Azizova');
  assert.ok(row.phone.includes('•'), 'telefon niqoblangan');
  assert.equal(row.hidden, false);
  const doc = list.doctors.find((d) => d.id === 'ashurov');
  assert.equal(doc.ratingAvg, 5);
  assert.equal(doc.ratingCount, 1);

  const post = (body) => call(adminRatings, 'https://dimed.uz/api/admin-ratings', {
    ...jsonBody(body),
    headers: { 'content-type': 'application/json', cookie: adminRateCookie },
  });
  assert.equal((await post({ id: 'x', hidden: true })).status, 400);
  assert.equal((await post({ id: 'ashurov|yoq', hidden: true })).status, 404);

  const hide = await post({ id: row.id, hidden: true });
  assert.equal(hide.status, 200);
  assert.equal(tableOf('test_doctors').get('ashurov').rating_count, 0);
  assert.equal(tableOf('test_doctors').get('ashurov').rating_sum, 0);
  const pub = await (await call(doctorsList, 'https://dimed.uz/api/doctors')).json();
  assert.equal(pub.find((d) => d.id === 'ashurov').ratingAvg, null, 'yashirilgan baho o\'rtachaga kirmaydi');

  const twice = await (await post({ id: row.id, hidden: true })).json();
  assert.equal(twice.unchanged, true);
  assert.equal(tableOf('test_doctors').get('ashurov').rating_count, 0, 'ikki marta ayirilmaydi');

  const show = await post({ id: row.id, hidden: false });
  assert.equal(show.status, 200);
  assert.equal(tableOf('test_doctors').get('ashurov').rating_count, 1);
  assert.equal(tableOf('test_doctors').get('ashurov').rating_sum, 5);
});

await test('baholar 25 tadan ko\'p bo\'lsa ham admin ro\'yxatida hammasi bor', async () => {
  // Bitta Scan 1 MB da kesiladi (soxta jadvalda — 25 tada): qolgan
  // baholar admin ro'yxatidan jimgina tushib qolardi.
  for (let i = 0; i < 30; i++) {
    const created = `2025-01-01T09:00:${String(i).padStart(2, '0')}.000Z`;
    seed('test_ratings', `sahifa|${created}`, {
      doctor_id: 'sahifa', created_at: created, rating: 4, date: '2025-01-01', time: '09:00',
    });
  }
  const list = await (await call(adminRatings, 'https://dimed.uz/api/admin-ratings', {
    headers: { cookie: adminRateCookie },
  })).json();
  assert.equal(list.ratings.filter((r) => r.doctorId === 'sahifa').length, 30);
});

console.log('\nBemor ro\'yxati to\'liq keladi:');
await test('25 tadan ko\'p 1C yozuvi bo\'lsa ham hammasi ko\'rinadi', async () => {
  // Avval Limit: 25 turardi va sahifalanmasdi — oilaning bir qismi yo'qolardi.
  for (let i = 0; i < 30; i++) {
    seed('test_individuals', `+998907777777|90${String(i).padStart(2, '0')}`, {
      phone: '+998907777777', sort_key: `90${String(i).padStart(2, '0')}`,
      Surname: 'Toirov', Name: `Farzand${i}`, Birthday: '01.01.2010',
    });
  }
  const res = await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: otherCookie },
  });
  assert.equal(res.status, 200);
  const { patients } = await res.json();
  assert.ok(patients.length >= 31, `hammasi kelishi kerak edi, keldi: ${patients.length}`);
  assert.ok(patients.some((p) => p.name === 'Toirov Farzand29'), 'oxirgisi ham ro\'yxatda');
});

await test('kodsiz (eski PROFILE) yozuv ham ro\'yxatda qoladi', async () => {
  seed('test_individuals', '+998907777777|PROFILE', {
    phone: '+998907777777', sort_key: 'PROFILE', Surname: 'Toirova', Name: 'Xadicha',
  });
  const { patients } = await (await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: otherCookie },
  })).json();
  const one = patients.find((p) => p.name === 'Toirova Xadicha');
  assert.ok(one, 'kodsiz yozuv ham chiqishi kerak');
  assert.equal(one.id, 'PROFILE');
});

await test('bir odam ikki marta chiqmaydi', async () => {
  // Eski PROFILE yozuvi kodli yozuv bilan bir xil ismda — bittasi qoladi.
  seed('test_individuals', '+998907777777|PROFILE', {
    phone: '+998907777777', sort_key: 'PROFILE', Surname: 'Toirov', Name: 'Farzand0',
  });
  const { patients } = await (await call(patientsApi, 'https://dimed.uz/api/patients', {
    headers: { cookie: otherCookie },
  })).json();
  assert.equal(patients.filter((p) => p.name === 'Toirov Farzand0').length, 1);
});

console.log('\nBir vaqtda ochiq navbatlar cheklovi:');
await test('bitta telefon cheksiz navbat ololmaydi', async () => {
  const restore = clearUpcoming();
  const CAP_DATE = addDays(BOOK_DATE, 5);
  // Smena oldingi testlarda o'zgargan — bu test o'zi kerakligini qo'yadi.
  const before = tableOf('test_doctors').get('ashurov');
  seed('test_doctors', 'ashurov', {
    ...before,
    slot_minutes: 60,
    shifts: [{ start: '08:00', end: '17:00' }],
    workdays: [0, 1, 2, 3, 4, 5, 6],
    age_group: 'all',
  });
  const times = ['08:00', '09:00', '10:00', '11:00', '12:00'];
  for (const time of times) {
    const res = await call(book, 'https://dimed.uz/api/book', bookAs({
      doctor: 'ashurov', date: CAP_DATE, time,
    }));
    assert.equal(res.status, 200, `${time}: ${JSON.stringify(await res.clone().json())}`);
  }

  const over = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: CAP_DATE, time: '13:00',
  }));
  assert.equal(over.status, 400);
  assert.match((await over.json()).error, /5 tadan ko‘p bo‘lmaydi/);
  assert.equal(tableOf('test_appointments').has(`ashurov#${CAP_DATE}|13:00`), false);

  // Bittasi bo'shasa yana olish mumkin.
  const one = tableOf('test_appointments').get(`ashurov#${CAP_DATE}|08:00`);
  seed('test_appointments', `ashurov#${CAP_DATE}|08:00`, { ...one, status: 'cancelled' });
  const again = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: CAP_DATE, time: '13:00',
  }));
  assert.equal(again.status, 200, JSON.stringify(await again.clone().json()));
  clearUpcoming();
  seed('test_doctors', 'ashurov', before);
  restore();
});

console.log('\nShifokorning yosh cheklovi:');
const AGE_DATE = addDays(BOOK_DATE, 3);
clearUpcoming(); // bu yozuvlar bundan keyingi testlarga kerak emas
const setAgeGroup = (group) => {
  const doc = tableOf('test_doctors').get('ashurov');
  seed('test_doctors', 'ashurov', { ...doc, age_group: group });
};
// Bolaning tug'ilgan sanasi qabul kunida 10 yosh bo'ladigan qilib olinadi.
const childBirth = `${Number(AGE_DATE.slice(0, 4)) - 10}${AGE_DATE.slice(4)}`;
seed('test_individuals', '+998901234567|557C', {
  phone: '+998901234567', sort_key: '557C', Surname: 'Azizov', Name: 'Sardor', Birthday: childBirth,
});

await test('kattalar shifokoriga bolani yozib bo\'lmaydi', async () => {
  setAgeGroup('adult');
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: AGE_DATE, time: '09:00', patientId: '557C',
  }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /16 yoshdan katta/);
  assert.equal(tableOf('test_appointments').has(`ashurov#${AGE_DATE}|09:00`), false);
});

await test('bolalar shifokoriga kattani yozib bo\'lmaydi', async () => {
  setAgeGroup('child');
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: AGE_DATE, time: '09:00', patientId: '555A',
  }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /16 yoshgacha/);
  assert.equal(tableOf('test_appointments').has(`ashurov#${AGE_DATE}|09:00`), false);
});

await test('mos yoshdagi bemor yoziladi, cheklovsizda ikkalasi ham', async () => {
  setAgeGroup('child');
  const bola = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: AGE_DATE, time: '09:00', patientId: '557C',
  }));
  assert.equal(bola.status, 200, JSON.stringify(await bola.clone().json()));
  assert.equal((await bola.json()).appointment.patientName, 'Azizov Sardor');

  setAgeGroup('all');
  const katta = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: AGE_DATE, time: '10:00', patientId: '555A',
  }));
  assert.equal(katta.status, 200);
});

await test('yosh 16 ga to\'lgan kuni kattalar shifokoriga o\'tadi', async () => {
  setAgeGroup('adult');
  // Qabul kunida roppa-rosa 16 yosh to'ladi — chegara "16 va undan katta".
  seed('test_individuals', '+998901234567|558D', {
    phone: '+998901234567', sort_key: '558D', Surname: 'Azizov', Name: 'Bekzod',
    Birthday: `${Number(AGE_DATE.slice(0, 4)) - 16}${AGE_DATE.slice(4)}`,
  });
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: AGE_DATE, time: '11:00', patientId: '558D',
  }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
});

await test('admin yosh cheklovini belgilaydi, u /api/doctors da ko\'rinadi', async () => {
  const current = tableOf('test_doctors').get('ashurov');
  const payload = {
    id: 'ashurov', name: current.name, job: current.job, deptId: current.dept_id,
    price: current.price, slotMinutes: current.slot_minutes, workdays: current.workdays,
    shifts: current.shifts, ageGroup: 'child',
  };
  const res = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    ...jsonBody(payload),
    headers: { 'content-type': 'application/json', cookie: adminCookie },
  });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.equal(tableOf('test_doctors').get('ashurov').age_group, 'child');

  const list = await (await call(doctorsList, 'https://dimed.uz/api/doctors')).json();
  assert.equal(list.find((d) => d.id === 'ashurov').ageGroup, 'child');

  const bad = await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    ...jsonBody({ ...payload, ageGroup: 'chaqaloq' }),
    headers: { 'content-type': 'application/json', cookie: adminCookie },
  });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Yosh cheklovi/);

  // Berilmasa cheklovsiz bo'ladi — eski panel yozuvlari shunday keladi.
  const { ageGroup, ...withoutAge } = payload;
  await call(adminDoctors, 'https://dimed.uz/api/admin-doctors', {
    ...jsonBody(withoutAge),
    headers: { 'content-type': 'application/json', cookie: adminCookie },
  });
  assert.equal(tableOf('test_doctors').get('ashurov').age_group, 'all');
});

console.log('\nPayme to\'lovi:');

const PAY_DATE = addDays(toTashkent(new Date()).dateKey, 4);
const rpc = (method, params, auth = 'Paycom:payme-secret') =>
  call(paymentWebhook, 'https://dimed.uz/api/payment-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {}),
    },
    body: JSON.stringify({ id: 1, method, params }),
  }).then((r) => r.json());

let payOrder; // { paymentId, amountTiyin, time }

await test('kalitsiz so\'rov rad etiladi (-32504)', async () => {
  const res = await rpc('CheckPerformTransaction', { amount: 100, account: { order_id: 'x' } }, null);
  assert.equal(res.error.code, -32504);
});

await test('onlayn bron Payme havolasini qaytaradi (faqat PAYMENT_ENABLED=1 bo\'lsa)', async () => {
  process.env.PAYMENT_ENABLED = '1';

  const free = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${PAY_DATE}`)).json();
  const time = free.slots.find((s) => s.free).time;

  const res = await call(book, 'https://dimed.uz/api/book', bookAs({
    doctor: 'ashurov', date: PAY_DATE, time,
  }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mode, 'online');
  assert.ok(data.redirectUrl.startsWith('https://checkout.paycom.uz/'));

  const decoded = Buffer.from(data.redirectUrl.split('/').pop(), 'base64').toString();
  assert.ok(decoded.includes(`ac.order_id=${data.paymentId}`));
  assert.ok(decoded.includes('a=7000000'), '70 000 so\'m = 7 000 000 tiyin');

  payOrder = { paymentId: data.paymentId, amountTiyin: 7000000, time };
});

await test('CheckPerformTransaction: yo\'q buyurtma -31050, noto\'g\'ri summa -31001', async () => {
  const missing = await rpc('CheckPerformTransaction', { amount: 1, account: { order_id: 'yoq' } });
  assert.equal(missing.error.code, -31050);

  const wrong = await rpc('CheckPerformTransaction', {
    amount: 5, account: { order_id: payOrder.paymentId },
  });
  assert.equal(wrong.error.code, -31001);

  const ok = await rpc('CheckPerformTransaction', {
    amount: payOrder.amountTiyin, account: { order_id: payOrder.paymentId },
  });
  assert.equal(ok.result.allow, true);
});

await test('CreateTransaction yaratadi, takrori bir xil javob beradi', async () => {
  const params = {
    id: 'payme-tx-1', time: Date.now(), amount: payOrder.amountTiyin,
    account: { order_id: payOrder.paymentId },
  };
  const first = await rpc('CreateTransaction', params);
  assert.equal(first.result.state, 1);
  assert.equal(first.result.transaction, payOrder.paymentId);

  const second = await rpc('CreateTransaction', params);
  assert.equal(second.result.state, 1);
  assert.equal(second.result.create_time, first.result.create_time);

  const other = await rpc('CreateTransaction', { ...params, id: 'payme-tx-boshqa' });
  assert.equal(other.error.code, -31099, 'bitta buyurtmaga bitta tranzaksiya');
});

await test('PerformTransaction slotni paid qiladi va bemorga xabar boradi', async () => {
  telegramCalls.length = 0;
  const res = await rpc('PerformTransaction', { id: 'payme-tx-1' });
  assert.equal(res.result.state, 2);

  const cabinet = await (await call(me, 'https://dimed.uz/api/me', { headers: { cookie: sessionCookie } })).json();
  const appt = cabinet.appointments.find((a) => a.date === PAY_DATE && a.time === payOrder.time);
  assert.equal(appt.status, 'paid');
  assert.ok(telegramCalls.some((c) => c.body.text?.includes('tasdiqlandi')), 'tasdiq xabari ketishi kerak');

  const again = await rpc('PerformTransaction', { id: 'payme-tx-1' });
  assert.equal(again.result.state, 2, 'takror chaqiruv ham 2 qaytaradi');
  assert.equal(again.result.perform_time, res.result.perform_time);
});

await test('CheckTransaction holatni to\'g\'ri ko\'rsatadi', async () => {
  const res = await rpc('CheckTransaction', { id: 'payme-tx-1' });
  assert.equal(res.result.state, 2);
  assert.ok(res.result.perform_time > 0);
  assert.equal(res.result.transaction, payOrder.paymentId);

  const missing = await rpc('CheckTransaction', { id: 'yoq-tx' });
  assert.equal(missing.error.code, -31003);
});

await test('CancelTransaction to\'lovni qaytaradi va slotni bo\'shatadi', async () => {
  const res = await rpc('CancelTransaction', { id: 'payme-tx-1', reason: 5 });
  assert.equal(res.result.state, -2, 'to\'langanidan keyin bekor -2');

  const free = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${PAY_DATE}`)).json();
  const slot = free.slots.find((s) => s.time === payOrder.time);
  assert.equal(slot.free, true, 'slot yana bo\'sh bo\'lishi kerak');

  delete process.env.PAYMENT_ENABLED;
});

await test('PAYMENT_ENABLED o\'chiq bo\'lsa bron yana kassada to\'lash rejimida', async () => {
  const free = await (await call(slots, `https://dimed.uz/api/slots?doctor=ashurov&date=${PAY_DATE}`)).json();
  const time = free.slots.find((s) => s.free).time;
  const res = await call(book, 'https://dimed.uz/api/book', bookAs({ doctor: 'ashurov', date: PAY_DATE, time }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mode, 'at_clinic');
  assert.equal(data.redirectUrl, undefined, 'to\'lov havolasi bo\'lmasligi kerak');
});

await test('GetStatement 25 tadan ko\'p tranzaksiyani to\'liq qaytaradi', async () => {
  // Sverka to'lovlar jadvalini Scan qiladi: bitta sahifada qolsa, Payme
  // bilan hisob-kitobda tranzaksiyalar yetishmasdi.
  const base = 1_700_000_000_000;
  for (let i = 0; i < 30; i++) {
    seed('test_payments', `payme#sverka-${i}`, {
      payment_id: `payme#sverka-${i}`, ref: `buyurtma-${i}`, state: 2,
      create_time: base + i, created_at_ms: base + i, perform_time: base + i + 1000,
    });
  }
  const res = await rpc('GetStatement', { from: base, to: base + 29 });
  assert.equal(res.result.transactions.length, 30);
  assert.ok(res.result.transactions.some((t) => t.id === 'sverka-29'), 'oxirgisi ham bor');
});

// ================= Admin: navbatlar va hisobot =================
console.log('\nAdmin — navbatlar va hisobot:');

const ADM_TODAY = toTashkent(new Date()).dateKey;
const ADM_DATE = addDays(ADM_TODAY, 40);
const ADM_PAST = addDays(ADM_TODAY, -5);

// Kesim ikki shifokorda ko'rinsin — ro'yxatga ikkinchisi ham qo'shiladi.
seed('test_doctors', 'rahimov', {
  doctor_id: 'rahimov', name: 'Rahimov Umid', job: 'Nevrolog', dept_id: 'nevrologiya',
  slot_minutes: 30, shifts: [{ start: '09:00', end: '15:00' }],
  workdays: [0, 1, 2, 3, 4, 5, 6], price: 90000, active: true,
});

const seedAdmAppt = (doctor, date, time, extra = {}) =>
  seed('test_appointments', `${doctor}#${date}|${time}`, {
    doctor_day: `${doctor}#${date}`, time, doctor_id: doctor, date,
    phone: '+998901234567', telegram_id: '777', patient_id: '555A',
    patient_name: 'Azizova Dilnoza', starts_at: toInstant(date, time).toISOString(),
    status: 'booked', price: 70000, created_at: new Date().toISOString(), ...extra,
  });

await test('admin-appointments sessiyasiz 401, oddiy bemorga 403', async () => {
  assert.equal((await call(adminAppointments, 'https://dimed.uz/api/admin-appointments')).status, 401);
  const res = await call(adminAppointments, 'https://dimed.uz/api/admin-appointments', {
    headers: { cookie: sessionCookie },
  });
  assert.equal(res.status, 403);
});

await test('bir kunda barcha shifokorlar navbati va hisobi ko\'rinadi', async () => {
  seedAdmAppt('ashurov', ADM_DATE, '09:00');
  seedAdmAppt('ashurov', ADM_DATE, '10:00', { status: 'done' });
  seedAdmAppt('rahimov', ADM_DATE, '11:00', { status: 'no_show', price: 90000, patient_name: 'Karimov Sardor' });
  seedAdmAppt('rahimov', ADM_DATE, '12:00', { status: 'cancelled' });
  // Muddati o'tgan hold — navbat emas, hisobga kirmaydi.
  seedAdmAppt('ashurov', ADM_DATE, '13:00', { status: 'hold', hold_until: 1 });

  const res = await call(adminAppointments, `https://dimed.uz/api/admin-appointments?date=${ADM_DATE}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.date, ADM_DATE);
  assert.equal(data.appointments.length, 5, 'hammasi ro\'yxatda (holdi ham) keladi');
  assert.equal(data.appointments[0].time, '09:00', 'vaqt bo\'yicha tartiblangan');
  assert.equal(data.stats.total, 4, 'muddati o\'tgan hold hisobga kirmaydi');
  assert.equal(data.stats.bolibOtdi, 1);
  assert.equal(data.stats.kelmadi, 1);
  assert.equal(data.stats.bekor, 1);
  assert.equal(data.stats.tushum, 70000, 'tushum — faqat qabul bo\'lganlar');

  const withName = data.appointments.find((a) => a.time === '11:00');
  assert.equal(withName.doctorName, 'Rahimov Umid', 'shifokor ismi qo\'shiladi');
  assert.equal(withName.phone, '+998901234567', 'ega to\'liq raqamni ko\'radi');
  assert.equal(withName.patientName, 'Karimov Sardor');
});

await test('davr hisoboti shifokorlar kesimini beradi', async () => {
  seedAdmAppt('ashurov', ADM_PAST, '09:00', { status: 'done' });
  const res = await call(
    adminAppointments,
    `https://dimed.uz/api/admin-appointments?from=${ADM_PAST}&to=${ADM_DATE}`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.from, ADM_PAST);
  assert.ok(data.stats.total >= 5, `davrda hamma kun qamrab olinadi, keldi: ${data.stats.total}`);
  assert.ok(data.stats.tushum >= 140000, `ikki qabulning summasi, keldi: ${data.stats.tushum}`);

  const ashurov = data.byDoctor.find((d) => d.doctorId === 'ashurov');
  assert.ok(ashurov, 'ashurov kesimda bo\'lishi kerak');
  assert.ok(ashurov.bolibOtdi >= 2);
  assert.ok(data.byDoctor.every((d) => d.total > 0), 'navbati yo\'q shifokor ro\'yxatga tushmaydi');
});

await test('juda uzoq davr rad etiladi', async () => {
  const res = await call(
    adminAppointments,
    `https://dimed.uz/api/admin-appointments?from=${addDays(ADM_TODAY, -200)}&to=${ADM_TODAY}`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /92 kun/);
});

await test('admin navbatni bekor qiladi va bemorga xabar ketadi', async () => {
  telegramCalls.length = 0;
  const res = await call(adminAppointments, 'https://dimed.uz/api/admin-appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ doctorId: 'ashurov', date: ADM_DATE, time: '09:00', reason: 'Shifokor kasal' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.notified, true);

  const row = tableOf('test_appointments').get(`ashurov#${ADM_DATE}|09:00`);
  assert.equal(row.status, 'cancelled_by_clinic');
  assert.equal(row.off_reason, 'Shifokor kasal');

  const xabar = telegramCalls.find((c) => c.body.chat_id === '777');
  assert.ok(xabar, 'bemorga xabar ketishi kerak');
  assert.ok(xabar.body.text.includes('Shifokor kasal'), 'sabab xabarda bo\'ladi');

  // Slot yana bo'shaydi.
  const day = await (await call(adminAppointments, `https://dimed.uz/api/admin-appointments?date=${ADM_DATE}`, {
    headers: { cookie: adminCookie },
  })).json();
  assert.equal(day.stats.bekor, 2, 'bekor qilinganlar soni oshadi');
});

await test('yopilgan navbatni qayta bekor qilib bo\'lmaydi', async () => {
  const res = await call(adminAppointments, 'https://dimed.uz/api/admin-appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ doctorId: 'ashurov', date: ADM_DATE, time: '09:00' }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /yopilgan/);

  const yoq = await call(adminAppointments, 'https://dimed.uz/api/admin-appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ doctorId: 'ashurov', date: ADM_DATE, time: '23:30' }),
  });
  assert.equal(yoq.status, 404);
});

console.log('\nSo\'rov cheklovlari:');

await test('sessiyasiz natija havolasi IP bo\'yicha cheklanadi', async () => {
  const token = createShareToken('+998901234567', 'doc-uuid-1', 7);
  const url = `https://dimed.uz/api/result?t=${encodeURIComponent(token)}`;

  // Cheklovga urilgunicha chaqiramiz — birinchisi albatta o'tishi kerak.
  const birinchi = await call(resultApi, url);
  assert.equal(birinchi.status, 200, 'birinchi so\'rov ochilishi kerak');

  let tortildi = null;
  for (let i = 0; i < 200 && !tortildi; i++) {
    const res = await call(resultApi, url);
    if (res.status === 429) tortildi = res;
  }
  assert.ok(tortildi, 'cheksiz urinishga yo\'l qo\'yilmasligi kerak');
  assert.match((await tortildi.json()).error, /Juda ko‘p urinish/);
});

await test('bekor qilish ham bir hisobdan cheklanadi', async () => {
  const body = () => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify({ doctor: 'ashurov', date: ADM_DATE, time: '23:45' }),
  });

  let tortildi = null;
  for (let i = 0; i < 60 && !tortildi; i++) {
    const res = await call(cancelApi, 'https://dimed.uz/api/cancel', body());
    if (res.status === 429) tortildi = res;
  }
  assert.ok(tortildi, 'bekor qilish urinishlari cheklanishi kerak');
});

/*
  Davomat (keldi / kelmadi) — 1C "Doktorga Qabul" hujjati bo'yicha.
  Eng oxirida turadi: cron bugungi va kechagi barcha navbatlarni
  ko'rib chiqadi, ya'ni oldingi testlarning yozuvlariga ham tegadi.
*/
console.log('\nDavomat — 1C "Doktorga Qabul" bo\'yicha:');
const ATT_TODAY = toTashkent(new Date()).dateKey;
const ATT_YESTERDAY = addDays(ATT_TODAY, -1);
/*
  Davomat testlari o'z telefonida ishlaydi. Umumiy raqamda ishlaganda
  boshqa testlar bugungi kunga qo'ygan navbatlar (masalan eslatma
  testiniki) hujjatni "o'g'irlab" ketardi va natija ishga tushish
  soatiga bog'liq bo'lib qolardi.
*/
const ATT_PHONE = '+998901111111';
const seedAtt = (date, time, extra) => seedAppt(date, time, { phone: ATT_PHONE, ...extra });
const seedVisit = (date, sortKey, extra) => seed('test_visits', `${ATT_PHONE}|${sortKey}`, {
  phone: ATT_PHONE, sort_key: sortKey, date, Date: `${date}T09:05:00`,
  Posted: true, DeletionMark: false, PatientName: 'Azizova', PatientCode: '555A',
  DoctorName: 'Ashurov T.', Queue: 1, ...extra,
});

await test('1C hujjati o\'tkazilgan bo\'lsa navbat "keldi" bo\'ladi', async () => {
  seedAtt(ATT_TODAY, '07:05');
  seedVisit(ATT_TODAY, 'visit-keldi');

  const res = await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');
  assert.equal(res.status, 200);

  const appt = tableOf('test_appointments').get(`ashurov#${ATT_TODAY}|07:05`);
  assert.equal(appt.status, 'done');
  assert.equal(appt.marked_by, '1c');
  assert.equal(appt.visit_ref, 'visit-keldi');
  assert.equal(appt.arrived_at, `${ATT_TODAY}T09:05:00`);
});

await test('hujjat o\'tkazilmagan bo\'lsa bugun hech narsa o\'zgarmaydi', async () => {
  seedAtt(ATT_TODAY, '07:10');
  seedVisit(ATT_TODAY, 'visit-qoralama', { Posted: false, PatientCode: '999Z' });

  await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');

  const appt = tableOf('test_appointments').get(`ashurov#${ATT_TODAY}|07:10`);
  assert.equal(appt.status, 'booked', 'kun tugamaguncha kutiladi');
  assert.equal(appt.marked_at, undefined);
});

await test('kun tugagach hujjatsiz navbat "kelmadi" bo\'ladi', async () => {
  seedAtt(ATT_YESTERDAY, '07:15');

  await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');

  const appt = tableOf('test_appointments').get(`ashurov#${ATT_YESTERDAY}|07:15`);
  assert.equal(appt.status, 'no_show');
  assert.equal(appt.marked_by, '1c');
  assert.equal(appt.visit_ref, undefined);
});

await test('shifokorning qo\'lda qo\'ygan belgisi o\'zgarmaydi', async () => {
  // Shifokor "kelmadi" degan, 1C esa keyin hujjatni o'tkazgan.
  seedAtt(ATT_YESTERDAY, '07:20', {
    status: 'no_show', marked_at: '2026-01-01T00:00:00.000Z',
  });
  seedVisit(ATT_YESTERDAY, 'visit-kech');

  await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');

  const appt = tableOf('test_appointments').get(`ashurov#${ATT_YESTERDAY}|07:20`);
  assert.equal(appt.status, 'no_show', 'shifokor belgisi ustun');
  assert.equal(appt.marked_at, '2026-01-01T00:00:00.000Z');
});

await test('bekor qilingan navbatga tegilmaydi', async () => {
  seedAtt(ATT_YESTERDAY, '07:25', { status: 'cancelled' });

  await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');

  assert.equal(
    tableOf('test_appointments').get(`ashurov#${ATT_YESTERDAY}|07:25`).status,
    'cancelled',
  );
});

await test('boshqa oila a\'zosining hujjati navbatga bog\'lanmaydi', async () => {
  // Bitta telefon, ikki bemor: kodi boshqa hujjat "keldi" demaydi.
  seedAtt(ATT_TODAY, '07:30', { patient_id: '111B' });
  seedVisit(ATT_TODAY, 'visit-boshqa-bemor', { PatientCode: '222C' });

  await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');

  assert.equal(
    tableOf('test_appointments').get(`ashurov#${ATT_TODAY}|07:30`).status,
    'booked',
  );
});

await test('AppointmentKey bo\'lsa telefon mos kelmasa ham bog\'lanadi', async () => {
  // Bemor boshqa raqamdan yozilgan, 1C hujjatni navbatdan yaratgan.
  seedAtt(ATT_TODAY, '07:35');
  seed('test_visits', '+998900000111|visit-kalitli', {
    phone: '+998900000111', sort_key: 'visit-kalitli', date: ATT_TODAY,
    Date: `${ATT_TODAY}T10:00:00`, Posted: true,
    AppointmentKey: `ashurov#${ATT_TODAY}|07:35`,
  });

  await call(syncAttendance, 'https://dimed.uz/api/sync-attendance');

  assert.equal(tableOf('test_appointments').get(`ashurov#${ATT_TODAY}|07:35`).status, 'done');
});

stopFakeDynamo();
console.log(`\n${passed} ta API tekshiruvi o'tdi.`);
