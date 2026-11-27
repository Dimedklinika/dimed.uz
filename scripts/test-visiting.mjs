/**
 * Tashrif buyuruvchi shifokorlar, /admin paneli va rasmlar — API testlari.
 *
 * `test-api.mjs` kabi: soxta DynamoDB (`fake-dynamo.mjs`) va xotiradagi
 * rasm ombori (`DIMED_MEDIA_MEMORY=1`) — AWS ham, Netlify ham kerak emas.
 *
 * Ishlatish: node --experimental-strip-types scripts/test-visiting.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fnDir = join(root, 'netlify', 'functions');

process.env.SESSION_SECRET = 'test-secret-kamida-32-belgi-boladi!!';
process.env.DIMED_TABLE_PREFIX = 'test';
process.env.DIMED_AWS_REGION = 'eu-central-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.ADMIN_PASSWORD = 'juda-maxfiy-parol';
process.env.DIMED_MEDIA_MEMORY = '1';

const { startFakeDynamo, stopFakeDynamo, seed, tableOf } = await import('./fake-dynamo.mjs');
process.env.DIMED_DYNAMO_ENDPOINT = await startFakeDynamo();

// Telegram (log-bot) chaqiruvlari tarmoqqa chiqmasin.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input).includes('api.telegram.org')) return new Response('{"ok":true}', { status: 200 });
  return realFetch(input, init);
};

const load = (name) => import(pathToFileURL(join(fnDir, name)).href).then((m) => m.default);
const lib = (name) => import(pathToFileURL(join(fnDir, 'lib', name)).href);

const siteContent = await load('site-content.ts');
const visitingSlots = await load('visiting-slots.ts');
const visitingBook = await load('visiting-book.ts');
const media = await load('media.ts');
const adminAuth = await load('admin-auth.ts');
const adminVisiting = await load('admin-visiting.ts');
const adminBookings = await load('admin-visiting-bookings.ts');
const adminUpload = await load('admin-upload.ts');
const adminMedia = await load('admin-media.ts');

const { tashkentToday, addDaysKey, weekdayOfKey, visitDates, textOf, checkPatientName, isVisitDay } = await import(
  pathToFileURL(join(root, 'src', 'lib', 'visiting.ts')).href
);
const { parseDoctorInput, freeTimes } = await lib('visiting.ts');
const { sniffFormat, readDimensions, processImage, isMediaKey, keyFromUrl } = await lib('media.ts');
const { checkPassword, hasAdminSession, sameOrigin } = await lib('admin-auth.ts');

const ctx = {};
const BASE = 'https://dimed.uz';
let ip = 1;
/** Har so'rov alohida IP dan — IP cheklovi boshqa testlarga xalal bermasin. */
const call = (fn, path, init = {}) =>
  fn(
    new Request(BASE + path, {
      ...init,
      headers: { 'x-nf-client-connection-ip': `10.0.0.${ip++ % 250}`, ...(init.headers ?? {}) },
    }),
    ctx,
  );
const post = (body, extra = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...extra },
  body: JSON.stringify(body),
});
const withCookie = (cookie, init = {}) => ({ ...init, headers: { ...(init.headers ?? {}), cookie } });

let passed = 0;
const test = async (name, fn) => {
  await fn();
  console.log(`  ok  ${name}`);
  passed++;
};

const today = tashkentToday();
// Ertadan boshlab 7 kun ichidagi birinchi shanbani topamiz — har doim kelajak.
const nextSaturday = (() => {
  for (let i = 1; i <= 7; i++) {
    const d = addDaysKey(today, i);
    if (weekdayOfKey(d) === 6) return d;
  }
  throw new Error('shanba topilmadi');
})();
const extraDate = addDaysKey(today, 3);

const goodDoctor = {
  name: { uz: 'Karimov Jasur', ru: 'Каримов Жасур' },
  specialty: { uz: 'Travmatolog', ru: 'Травматолог', en: 'Traumatologist' },
  bio: { uz: 'Toshkentdan keladi', en: 'Visits from Tashkent' },
  weekdays: [6],
  dates: [extraDate],
  skipDates: [],
  shifts: [{ start: '09:00', end: '12:00' }],
  slotMinutes: 30,
  price: 150000,
  active: true,
};

console.log('Umumiy mantiq:');

await test('kelish kunlari: hafta kuni + alohida sana, kelmaydigan sana chiqariladi', () => {
  const rule = { weekdays: [6], dates: [extraDate], skipDates: [] };
  const days = visitDates(rule, today, 14, 8);
  assert.ok(days.includes(nextSaturday));
  assert.ok(days.includes(extraDate));
  assert.deepEqual(days, [...days].sort());
  const skipped = visitDates({ ...rule, skipDates: [nextSaturday] }, today, 14, 8);
  assert.ok(!skipped.includes(nextSaturday));
  assert.equal(isVisitDay({ weekdays: [], dates: [], skipDates: [] }, nextSaturday), false);
});

await test('matn: tarjima bo‘lmasa o‘zbekchasi', () => {
  assert.equal(textOf({ uz: 'Travmatolog', ru: 'Травматолог' }, 'ru'), 'Травматолог');
  assert.equal(textOf({ uz: 'Travmatolog', ru: '' }, 'en'), 'Travmatolog');
});

await test('bemor ismi tekshiriladi', () => {
  assert.equal(checkPatientName('  Aliyev   Vali ').value, 'Aliyev Vali');
  assert.equal(checkPatientName('A').ok, false);
  assert.equal(checkPatientName('12345').ok, false);
  assert.equal(checkPatientName('<script>x</script>').ok, false);
  assert.equal(checkPatientName('Vali https://spam').ok, false);
});

await test('admin kiritgani tekshiriladi', () => {
  assert.equal(parseDoctorInput(goodDoctor).ok, true);
  assert.match(parseDoctorInput({ ...goodDoctor, name: { uz: '' } }).error, /Ism/);
  assert.match(parseDoctorInput({ ...goodDoctor, weekdays: [], dates: [] }).error, /qaysi kunlari/);
  // Yashirilgan shifokorga kun shart emas (qoralama).
  assert.equal(parseDoctorInput({ ...goodDoctor, weekdays: [], dates: [], active: false }).ok, true);
  assert.match(parseDoctorInput({ ...goodDoctor, slotMinutes: 7 }).error, /davomiyligi/);
  assert.match(parseDoctorInput({ ...goodDoctor, price: -1 }).error, /Narx/);
  assert.match(parseDoctorInput({ ...goodDoctor, dates: ['2026-02-30'] }).error, /sana/);
  assert.match(parseDoctorInput({ ...goodDoctor, photoUrl: 'https://evil.example/x.png' }).error, /Rasm/);
  assert.match(parseDoctorInput({ ...goodDoctor, shifts: [{ start: '12:00', end: '09:00' }] }).error, /oralig/);
});

await test('bo‘sh vaqt: band va bekor qilingan', () => {
  const doc = { shifts: [{ start: '09:00', end: '11:00' }], slot_minutes: 30 };
  const far = new Date(Date.now() - 10 * 86400_000);
  const times = freeTimes(doc, nextSaturday, [{ time: '09:30', status: 'booked' }, { time: '10:00', status: 'cancelled' }], far);
  assert.deepEqual(times, ['09:00', '10:00', '10:30']);
});

await test('rasm formati va o‘lchami sarlavhadan o‘qiladi', () => {
  const webp = new Uint8Array(readFileSync(join(root, 'public/images/klinika-bino.webp')));
  const jpg = new Uint8Array(readFileSync(join(root, 'public/images/og-cover.jpg')));
  assert.equal(sniffFormat(webp), 'webp');
  assert.equal(sniffFormat(jpg), 'jpeg');
  assert.deepEqual(readDimensions(webp), { width: 1200, height: 900 });
  assert.deepEqual(readDimensions(jpg), { width: 1200, height: 630 });
  assert.equal(sniffFormat(new TextEncoder().encode('<svg>salom dunyo</svg>')), null);
});

await test('rasm WebP ga o‘giriladi va kichraytiriladi', async () => {
  const jpg = new Uint8Array(readFileSync(join(root, 'public/images/og-cover.jpg')));
  const res = await processImage(jpg, 'doctor');
  assert.equal(res.ok, true);
  assert.equal(res.image.contentType, 'image/webp');
  assert.ok(res.image.width <= 800 && res.image.height <= 800);
  const banner = await processImage(new Uint8Array(readFileSync(join(root, 'public/images/klinika-bino.webp'))), 'banner');
  assert.equal(banner.image.contentType, 'image/jpeg');
  assert.deepEqual([banner.image.width, banner.image.height], [1200, 630]);
  const bad = await processImage(new TextEncoder().encode('bu rasm emas, shunchaki matn'), 'doctor');
  assert.equal(bad.ok, false);
});

await test('sharp yuklanmasa — brauzer siqqan WebP o‘zgarishsiz saqlanadi', async () => {
  process.env.DIMED_NO_SHARP = '1';
  const webp = new Uint8Array(readFileSync(join(root, 'public/images/klinika-laboratoriya.webp')));
  const res = await processImage(webp, 'gallery');
  delete process.env.DIMED_NO_SHARP;
  assert.equal(res.ok, true);
  assert.equal(res.image.data.length, webp.length);
  assert.equal(res.image.contentType, 'image/webp');
  assert.ok(res.image.width > 0 && res.image.height > 0);
});

await test('rasm kaliti va manzili', () => {
  assert.equal(isMediaKey('u/2026-11/0123456789abcdef.webp'), true);
  assert.equal(isMediaKey('../etc/passwd'), false);
  assert.equal(keyFromUrl('/media/u/2026-11/0123456789abcdef.webp'), 'u/2026-11/0123456789abcdef.webp');
  assert.equal(keyFromUrl('/media/u/2026-11/../../x.webp'), null);
});

console.log('\nAdmin kirish:');

let cookie = '';

await test('parolsiz admin API yopiq (401)', async () => {
  const res = await call(adminVisiting, '/api/admin-visiting');
  assert.equal(res.status, 401);
});

await test('noto‘g‘ri parol rad etiladi', async () => {
  const res = await call(adminAuth, '/api/admin-auth', post({ password: 'xato' }));
  assert.equal(res.status, 401);
  assert.equal(checkPassword('juda-maxfiy-parol'), true);
  assert.equal(checkPassword('juda-maxfiy-paro'), false);
});

await test('to‘g‘ri parol — HttpOnly, SameSite=Strict cookie', async () => {
  const res = await call(adminAuth, '/api/admin-auth', post({ password: 'juda-maxfiy-parol' }));
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /dimed_admin=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  cookie = setCookie.split(';')[0];
  const status = await (await call(adminAuth, '/api/admin-auth', withCookie(cookie))).json();
  assert.equal(status.ok, true);
});

await test('soxta yoki eskirgan cookie o‘tmaydi', async () => {
  const forged = cookie.slice(0, -3) + 'abc';
  assert.equal(hasAdminSession(new Request(BASE, { headers: { cookie: forged } })), false);
  const payload = Buffer.from(JSON.stringify({ exp: 1, n: 'x' })).toString('base64url');
  assert.equal(hasAdminSession(new Request(BASE, { headers: { cookie: `dimed_admin=${payload}.xyz` } })), false);
});

await test('parol almashtirilsa eski sessiya yaroqsiz', async () => {
  process.env.ADMIN_PASSWORD = 'yangi-parol-12345';
  assert.equal(hasAdminSession(new Request(BASE, { headers: { cookie } })), false);
  process.env.ADMIN_PASSWORD = 'juda-maxfiy-parol';
  assert.equal(hasAdminSession(new Request(BASE, { headers: { cookie } })), true);
});

await test('begona saytdan so‘rov (CSRF) rad etiladi', async () => {
  assert.equal(sameOrigin(new Request(BASE, { headers: { origin: 'https://evil.example' } })), false);
  assert.equal(sameOrigin(new Request(BASE, { headers: { 'sec-fetch-site': 'cross-site' } })), false);
  assert.equal(sameOrigin(new Request(BASE, { headers: { origin: BASE } })), true);
  const res = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie, post(goodDoctor, { origin: 'https://evil.example' })));
  assert.equal(res.status, 403);
});

await test('parol sozlanmagan bo‘lsa panel yopiq (503)', async () => {
  process.env.ADMIN_PASSWORD = 'qisqa';
  const res = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie));
  assert.equal(res.status, 503);
  process.env.ADMIN_PASSWORD = 'juda-maxfiy-parol';
});

/** Bitta IP dan kirish urinishi. */
const loginFrom = (addr, password) =>
  adminAuth(
    new Request(BASE + '/api/admin-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': addr },
      body: JSON.stringify({ password }),
    }),
    ctx,
  );

await test('parolni taxmin qilish: 5 ta xatodan keyin IP bloklanadi, to‘g‘ri parol ham o‘tmaydi', async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await loginFrom('192.168.9.9', 'xato')).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 401]);
  const blocked = await loginFrom('192.168.9.9', 'juda-maxfiy-parol');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  // Boshqa IP ga ta'sir qilmaydi.
  assert.equal((await loginFrom('192.168.9.10', 'juda-maxfiy-parol')).status, 200);
});

await test('to‘g‘ri kirish limitni yemaydi va shu IP xatolarini tozalaydi', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await loginFrom('192.168.7.7', 'xato')).status, 401);
  assert.equal((await loginFrom('192.168.7.7', 'juda-maxfiy-parol')).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await loginFrom('192.168.7.7', 'xato')).status, 401);
});

await test('hamma IP dan soatiga 100 ta xato — kirish butunlay yopiladi', async () => {
  const { GLOBAL_WINDOW_SECONDS, GLOBAL_MAX_FAILS } = await lib('login-guard.ts');
  const start = Math.floor(Date.now() / 1000 / GLOBAL_WINDOW_SECONDS) * GLOBAL_WINDOW_SECONDS;
  const key = `admin-fail#all#${start}`;
  const before = tableOf('test_rate_limits').get(key);
  seed('test_rate_limits', key, { bucket: key, hits: GLOBAL_MAX_FAILS, expires_at: start + GLOBAL_WINDOW_SECONDS });
  assert.equal((await loginFrom('10.20.30.40', 'juda-maxfiy-parol')).status, 429);
  // Ochiq sessiya ishlayveradi.
  assert.equal((await call(adminVisiting, '/api/admin-visiting', withCookie(cookie))).status, 200);
  if (before) seed('test_rate_limits', key, before);
  else tableOf('test_rate_limits').delete(key);
});

await test('hisoblagich ishlamasa kirish rad etiladi (fail-closed)', async () => {
  const { db } = await lib('db.ts');
  const original = db.send;
  db.send = async () => {
    throw new Error('DynamoDB ishlamayapti');
  };
  try {
    const res = await loginFrom('10.99.99.99', 'juda-maxfiy-parol');
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('set-cookie'), null);
  } finally {
    db.send = original;
  }
});

await test('parol 12 belgidan qisqa bo‘lsa panel yopiq', async () => {
  process.env.ADMIN_PASSWORD = '11-belgi-pw';
  assert.equal((await loginFrom('10.1.1.1', '11-belgi-pw')).status, 503);
  process.env.ADMIN_PASSWORD = 'juda-maxfiy-parol';
});

console.log('\nTashrif shifokorlari (admin):');

let doctorId = '';
let photoUrl = '';

await test('rasm yuklanadi va WebP bo‘lib saqlanadi', async () => {
  const jpg = readFileSync(join(root, 'public/images/og-cover.jpg'));
  const res = await call(adminUpload, '/api/admin-upload?purpose=doctor', withCookie(cookie, {
    method: 'POST',
    headers: { 'content-type': 'image/jpeg' },
    body: jpg,
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.url, /^\/media\/u\/\d{4}-\d{2}\/[a-f0-9]{16}\.webp$/);
  photoUrl = body.url;
  const served = await call(media, photoUrl);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/webp');
  assert.match(served.headers.get('cache-control'), /immutable/);
});

await test('rasm bo‘lmagan fayl rad etiladi', async () => {
  const res = await call(adminUpload, '/api/admin-upload?purpose=doctor', withCookie(cookie, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: '<html>bu rasm emas</html>',
  }));
  assert.equal(res.status, 422);
});

await test('shifokor qo‘shiladi (uch tilda)', async () => {
  const res = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie, post({ ...goodDoctor, photoUrl })));
  assert.equal(res.status, 200);
  const { doctor } = await res.json();
  assert.match(doctor.id, /^v-[a-f0-9]{12}$/);
  assert.equal(doctor.specialty.en, 'Traumatologist');
  assert.equal(doctor.photoUrl, photoUrl);
  doctorId = doctor.id;
});

await test('yashirilgan shifokor saytda ko‘rinmaydi', async () => {
  const hidden = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie, post({ ...goodDoctor, name: { uz: 'Yashirin Endokrinolog' }, active: false })));
  assert.equal(hidden.status, 200);
  const content = await (await call(siteContent, '/api/site-content')).json();
  assert.equal(content.visiting.length, 1);
  assert.equal(content.visiting[0].id, doctorId);
  assert.equal(content.visiting[0].price, 150000);
  assert.equal(content.visiting[0].photo, photoUrl);
  const admin = await (await call(adminVisiting, '/api/admin-visiting', withCookie(cookie))).json();
  assert.equal(admin.doctors.length, 2);
});

await test('sayt kontenti CDN keshida, teg bilan', async () => {
  const res = await call(siteContent, '/api/site-content');
  assert.match(res.headers.get('netlify-cdn-cache-control'), /max-age=300/);
  assert.equal(res.headers.get('netlify-cache-tag'), 'site-content');
  assert.match(res.headers.get('cache-control'), /max-age=0/);
});

await test('rasm almashtirilsa eski fayl o‘chiriladi', async () => {
  const jpg = readFileSync(join(root, 'public/images/og-cover.jpg'));
  const up = await (await call(adminUpload, '/api/admin-upload?purpose=doctor', withCookie(cookie, { method: 'POST', body: jpg }))).json();
  const res = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie, post({ ...goodDoctor, id: doctorId, photoUrl: up.url })));
  assert.equal(res.status, 200);
  assert.equal((await call(media, photoUrl)).status, 404, 'eski rasm qolib ketdi');
  photoUrl = up.url;
});

console.log('\nYozilish (sayt):');

let slotsBody;

await test('bo‘sh vaqtlar: yaqin kelish kunlari', async () => {
  const res = await call(visitingSlots, `/api/visiting-slots?doctor=${doctorId}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  slotsBody = await res.json();
  const sat = slotsBody.days.find((d) => d.date === nextSaturday);
  assert.ok(sat, 'shanba ro‘yxatda yo‘q');
  assert.deepEqual(sat.slots, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
  assert.ok(slotsBody.days.some((d) => d.date === extraDate));
});

const booking = (extra = {}) => ({
  doctor: doctorId,
  date: nextSaturday,
  time: '09:30',
  name: 'Aliyev Vali',
  phone: '90 123 45 67',
  lang: 'ru',
  ...extra,
});

await test('yozilish: bepul, narx javobda, til bo‘yicha nom', async () => {
  const res = await call(visitingBook, '/api/visiting-book', post(booking()));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.booking.price, 150000);
  assert.equal(body.booking.specialty, 'Травматолог');
  assert.equal(body.booking.phone, '+998901234567');
});

await test('band qilingan vaqt boshqalarga ko‘rinmaydi', async () => {
  const body = await (await call(visitingSlots, `/api/visiting-slots?doctor=${doctorId}`)).json();
  const sat = body.days.find((d) => d.date === nextSaturday);
  assert.ok(!sat.slots.includes('09:30'));
  assert.ok(sat.slots.includes('09:00'));
});

await test('ikki kishi bir vaqtga yozila olmaydi (409)', async () => {
  const res = await call(visitingBook, '/api/visiting-book', post(booking({ phone: '91 765 43 21', name: 'Boshqa Odam' })));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'taken');
});

await test('bir vaqtda ikki so‘rov — faqat bittasi o‘tadi', async () => {
  const [a, b] = await Promise.all([
    call(visitingBook, '/api/visiting-book', post(booking({ time: '10:30', phone: '93 111 22 33', name: 'Birinchi Odam' }))),
    call(visitingBook, '/api/visiting-book', post(booking({ time: '10:30', phone: '94 111 22 33', name: 'Ikkinchi Odam' }))),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});

await test('begona raqam haqida hech narsa oshkor qilinmaydi; 3 tadan ortiq kelgusi yozuv yo‘q', async () => {
  // Oila: bitta raqamdan shu kunga yana yozilish mumkin — "allaqachon yozilgansiz"
  // degan javob begona odamga kimdir shu shifokorga yozilganini aytib qo'yardi.
  assert.equal((await call(visitingBook, '/api/visiting-book', post(booking({ time: '11:00', name: 'Aliyeva Malika' })))).status, 200);
  assert.equal((await call(visitingBook, '/api/visiting-book', post(booking({ time: '11:30', name: 'Aliyev Sardor' })))).status, 200);
  const fourth = await call(visitingBook, '/api/visiting-book', post(booking({ date: extraDate, time: '09:00', name: 'Aliyev Bobur' })));
  assert.equal(fourth.status, 409);
  const body = await fourth.json();
  assert.equal(body.code, 'limit');
  assert.ok(!/\d/.test(body.error), `xabarda son bor: ${body.error}`);
});

await test('noto‘g‘ri ma’lumot rad etiladi (kod bilan)', async () => {
  const cases = [
    [{ phone: '123' }, 'phone'],
    [{ name: 'x' }, 'name'],
    [{ time: '09:15' }, 'bad_slot'],
    [{ date: addDaysKey(nextSaturday, 1) }, 'bad_slot'],
    [{ date: addDaysKey(today, -7) }, 'bad_slot'],
    [{ doctor: 'v-yoqshifokor' }, 'not_found'],
  ];
  for (const [extra, code] of cases) {
    const res = await call(visitingBook, '/api/visiting-book', post(booking({ phone: '95 000 00 01', ...extra })));
    assert.equal((await res.json()).code, code, JSON.stringify(extra));
  }
  const bot = await call(visitingBook, '/api/visiting-book', post(booking({ time: '11:30', website: 'http://spam' })));
  assert.equal(bot.status, 400);
});

await test('yashirilgan shifokorga yozilib bo‘lmaydi', async () => {
  const list = await (await call(adminVisiting, '/api/admin-visiting', withCookie(cookie))).json();
  const hidden = list.doctors.find((d) => !d.active);
  const res = await call(visitingBook, '/api/visiting-book', post(booking({ doctor: hidden.id, phone: '97 000 00 02' })));
  assert.equal(res.status, 404);
});

await test('bitta IP dan cheklov (429)', async () => {
  const headers = { 'content-type': 'application/json', 'x-nf-client-connection-ip': '172.16.0.5' };
  let last;
  for (let i = 0; i < 9; i++) {
    last = await visitingBook(new Request(BASE + '/api/visiting-book', { method: 'POST', headers, body: JSON.stringify(booking({ doctor: 'v-yoqshifokor', phone: '95 555 55 55' })) }), ctx);
  }
  assert.equal(last.status, 429);
  assert.equal((await last.json()).code, 'rate');
});

console.log('\nYozilganlar (admin):');

let rows;

await test('kun bo‘yicha ro‘yxat, telefon to‘liq', async () => {
  const res = await call(adminBookings, `/api/admin-visiting-bookings?from=${nextSaturday}&to=${nextSaturday}`, withCookie(cookie));
  assert.equal(res.status, 200);
  const body = await res.json();
  rows = body.bookings;
  assert.deepEqual(rows.map((r) => r.time), ['09:30', '10:30', '11:00', '11:30']);
  assert.equal(rows[0].phone, '+998901234567');
  assert.equal(body.counts.booked, 4);
  const other = await (await call(adminBookings, `/api/admin-visiting-bookings?from=${extraDate}&to=${extraDate}`, withCookie(cookie))).json();
  assert.equal(other.bookings.length, extraDate === nextSaturday ? 4 : 0);
});

await test('holat: keldi / kelmadi', async () => {
  const res = await call(adminBookings, '/api/admin-visiting-bookings', withCookie(cookie, post({ ...rows[0], status: 'came' })));
  assert.equal(res.status, 200);
  const bad = await call(adminBookings, '/api/admin-visiting-bookings', withCookie(cookie, post({ ...rows[0], status: 'zo‘r' })));
  assert.equal(bad.status, 400);
});

await test('bekor qilingan vaqt yana bo‘shaydi va qayta olinadi', async () => {
  const res = await call(adminBookings, '/api/admin-visiting-bookings', withCookie(cookie, post({ ...rows[1], status: 'cancelled' })));
  assert.equal(res.status, 200);
  const body = await (await call(visitingSlots, `/api/visiting-slots?doctor=${doctorId}`)).json();
  assert.ok(body.days.find((d) => d.date === nextSaturday).slots.includes(rows[1].time));
  const again = await call(visitingBook, '/api/visiting-book', post(booking({ time: rows[1].time, phone: '99 888 77 66', name: 'Yangi Bemor' })));
  assert.equal(again.status, 200);
  // Eski yozuv bo'yicha holat o'zgartirilsa — yangisiga tegilmaydi.
  const stale = await call(adminBookings, '/api/admin-visiting-bookings', withCookie(cookie, post({ ...rows[1], status: 'came' })));
  assert.equal(stale.status, 409);
});

await test('oraliq 62 kundan oshmaydi', async () => {
  const res = await call(adminBookings, `/api/admin-visiting-bookings?from=${today}&to=${addDaysKey(today, 90)}`, withCookie(cookie));
  assert.equal(res.status, 400);
});

await test('kelgusi yozuvi bor shifokor o‘chirilishidan oldin ogohlantiriladi', async () => {
  const del = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: doctorId }) }));
  assert.equal(del.status, 409);
  assert.ok((await del.json()).upcoming >= 1);
});

console.log('\nBemor ma’lumoti: avtorizatsiyasiz kirish:');

await test('har bir admin endpoint, har bir metod — cookie‘siz, soxta va eskirgan cookie bilan 401, telefon chiqmaydi', async () => {
  const { createAdminCookie } = await lib('admin-auth.ts');
  const expired = createAdminCookie(Date.now() - 13 * 3600_000).split(';')[0];
  const forged = 'dimed_admin=' + Buffer.from(JSON.stringify({ exp: 9999999999, n: 'x' })).toString('base64url') + '.AAAA';
  const endpoints = [
    [adminVisiting, '/api/admin-visiting', ['GET', 'POST', 'PATCH', 'DELETE']],
    [adminBookings, `/api/admin-visiting-bookings?from=${nextSaturday}&to=${nextSaturday}`, ['GET', 'POST']],
    [adminUpload, '/api/admin-upload?purpose=doctor', ['POST']],
    [adminMedia, '/api/admin-media', ['GET', 'POST', 'DELETE']],
  ];
  let checked = 0;
  for (const [fn, path, methods] of endpoints) {
    for (const method of methods) {
      for (const c of [null, forged, expired]) {
        const init = { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) } };
        if (method !== 'GET') init.body = JSON.stringify({ id: doctorId, status: 'cancelled', ...rows[0] });
        const res = await call(fn, path, init);
        const text = await res.text();
        assert.equal(res.status, 401, `${method} ${path} (${c ? 'cookie' : 'cookie yo‘q'}) → ${res.status}`);
        assert.ok(!/\+?998\d{9}|Aliyev/.test(text), `${method} ${path}: javobda bemor ma’lumoti`);
        checked++;
      }
    }
  }
  assert.equal(checked, 30);
  // Yozuvlar o'zgarmagan: hech biri bekor qilinmagan.
  const still = await (await call(adminBookings, `/api/admin-visiting-bookings?from=${nextSaturday}&to=${nextSaturday}`, withCookie(cookie))).json();
  assert.ok(still.bookings.every((b) => b.status !== 'cancelled' || b.time === rows[1].time));
});

await test('ommaviy javoblarda bemor ismi va telefoni yo‘q', async () => {
  const bodies = [
    await (await call(siteContent, '/api/site-content')).text(),
    await (await call(visitingSlots, `/api/visiting-slots?doctor=${doctorId}`)).text(),
    await (await call(adminAuth, '/api/admin-auth')).text(),
  ];
  for (const text of bodies) {
    assert.ok(!/\+?998\d{9}|Aliyev|Yangi Bemor|Birinchi Odam|Ikkinchi Odam/.test(text), text.slice(0, 120));
  }
});

console.log('\nSayt rasmlari:');

await test('rasm o‘rinlari: banner, galereya, asosiy shifokorlar (o‘qiladi, yozilmaydi)', async () => {
  seed('test_doctors', 'ashurov', { doctor_id: 'ashurov', name: 'Ashurov Tursunali', job: 'Kardiolog', photo: '/images/team/ashurov-tursunali.webp' });
  const before = JSON.stringify([...tableOf('test_doctors').values()]);
  const res = await call(adminMedia, '/api/admin-media', withCookie(cookie));
  const { slots } = await res.json();
  assert.ok(slots.some((s) => s.id === 'banner'));
  assert.ok(slots.some((s) => s.id === 'gallery-building'));
  assert.equal(slots.find((s) => s.id === 'doctor-ashurov').fallback, '/images/team/ashurov-tursunali.webp');
  assert.equal(JSON.stringify([...tableOf('test_doctors').values()]), before, 'doctors jadvali o‘zgardi');
});

await test('slot — standart rasmga yo‘naltiradi', async () => {
  const res = await call(media, '/media/slot/gallery-building');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/images/klinika-bino.webp');
  const doc = await call(media, '/media/slot/doctor-ashurov');
  assert.equal(doc.headers.get('location'), '/images/team/ashurov-tursunali.webp');
  assert.equal((await call(media, '/media/slot/yoq-slot')).status, 404);
});

await test('galereya rasmi almashtiriladi va qaytariladi', async () => {
  const webp = readFileSync(join(root, 'public/images/klinika-xona.webp'));
  const res = await call(adminMedia, '/api/admin-media?slot=gallery-building', withCookie(cookie, { method: 'POST', body: webp }));
  assert.equal(res.status, 200);
  const { current } = await res.json();
  assert.match(current.url, /^\/media\/u\//);

  const content = await (await call(siteContent, '/api/site-content')).json();
  assert.equal(content.media['gallery-building'].url, current.url);
  const slot = await call(media, '/media/slot/gallery-building');
  assert.equal(slot.status, 200);
  assert.equal(slot.headers.get('content-type'), 'image/webp');
  assert.match(slot.headers.get('netlify-cache-tag'), /media-gallery-building/);

  const reset = await call(adminMedia, '/api/admin-media', withCookie(cookie, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slot: 'gallery-building' }) }));
  assert.equal(reset.status, 200);
  assert.equal((await call(media, current.url)).status, 404, 'eski fayl o‘chmadi');
  assert.equal((await call(media, '/media/slot/gallery-building')).status, 302);
});

await test('banner JPEG 1200×630', async () => {
  const webp = readFileSync(join(root, 'public/images/klinika-bino.webp'));
  const res = await call(adminMedia, '/api/admin-media?slot=banner', withCookie(cookie, { method: 'POST', body: webp }));
  const { current } = await res.json();
  assert.match(current.url, /\.jpg$/);
  assert.deepEqual([current.width, current.height], [1200, 630]);
});

await test('shifokor o‘chiriladi (majburan) — yozuvlar qoladi, rasm o‘chadi', async () => {
  const del = await call(adminVisiting, '/api/admin-visiting', withCookie(cookie, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: doctorId, force: true }) }));
  assert.equal(del.status, 200);
  assert.equal((await call(media, photoUrl)).status, 404);
  const body = await (await call(adminBookings, `/api/admin-visiting-bookings?from=${nextSaturday}&to=${nextSaturday}`, withCookie(cookie))).json();
  assert.ok(body.bookings.length >= 2);
  assert.match(body.bookings[0].doctorName, /Karimov Jasur/);
});

console.log('\nDeploy tartibi: jadvallar hali yo‘q yoki IAM ruxsat bermaydi:');

for (const errName of ['ResourceNotFoundException', 'AccessDeniedException']) {
  await test(`${errName}: sayt jim (bo‘sh kontent, standart rasm), admin aniq 503`, async () => {
    const { db } = await lib('db.ts');
    const original = db.send;
    db.send = async function (cmd) {
      if (/visiting|site_media/.test(cmd.input?.TableName ?? '')) {
        const e = new Error(errName);
        e.name = errName;
        throw e;
      }
      return original.call(this, cmd);
    };
    try {
      const content = await call(siteContent, '/api/site-content');
      assert.equal(content.status, 200);
      assert.deepEqual(await content.json(), { visiting: [], media: {} });
      assert.match(content.headers.get('netlify-cdn-cache-control'), /max-age=60\b/, 'buzuq holat CDN da qisqa tursin');
      assert.equal((await call(media, '/media/slot/banner')).headers.get('location'), '/images/og-cover.jpg');
      assert.equal((await call(visitingSlots, '/api/visiting-slots?doctor=v-abcd1234')).status, 404);
      const book = await call(visitingBook, '/api/visiting-book', post(booking({ doctor: 'v-abcd1234', phone: '97 111 22 33' })));
      assert.equal(book.status, 404);
      assert.equal((await book.json()).code, 'not_found');
      for (const [fn, path] of [
        [adminVisiting, '/api/admin-visiting'],
        [adminBookings, '/api/admin-visiting-bookings'],
        [adminMedia, '/api/admin-media'],
      ]) {
        const res = await call(fn, path, withCookie(cookie));
        assert.equal(res.status, 503, path);
        assert.match((await res.json()).error, errName === 'ResourceNotFoundException' ? /create-visiting-tables/ : /IAM/);
      }
    } finally {
      db.send = original;
    }
  });
}

console.log('\nRasmlarni ko‘chirish skripti:');

await test('--dry hech narsa yozmaydi', async () => {
  const { migrateImages } = await import('./migrate-images.mjs');
  const before = tableOf('test_site_media').size;
  const r = await migrateImages({ dry: true, log: () => {} });
  assert.equal(tableOf('test_site_media').size, before);
  assert.ok(r.migrated >= 4);
});

await test('rasmlar ko‘chiriladi, admin almashtirgani bosib ketilmaydi, qayta ishga tushirish xavfsiz', async () => {
  const { migrateImages } = await import('./migrate-images.mjs');
  const bannerBefore = tableOf('test_site_media').get('banner');
  const first = await migrateImages({ log: () => {} });
  // banner — testda admin yuklagan, o'tkazib yuboriladi; qolganlari ko'chadi.
  assert.equal(first.skipped, 1);
  assert.equal(first.migrated, 4);
  assert.equal(first.missing, 0);
  assert.deepEqual(tableOf('test_site_media').get('banner'), bannerBefore);
  const doc = tableOf('test_site_media').get('doctor-ashurov');
  assert.match(doc.url, /^\/media\/u\/.+\.webp$/);
  assert.equal((await call(media, doc.url)).status, 200);
  const again = await migrateImages({ log: () => {} });
  assert.equal(again.migrated, 0);
  assert.equal(again.skipped, 5);
});

stopFakeDynamo();
console.log(`\n${passed} ta tashrif/admin tekshiruvi o'tdi.`);
