/**
 * Brauzerdagi asosiy oqim — bron vidjeti va yopiq sahifalar.
 *
 * Nima uchun: API va mantiq testlari serverni tekshiradi, lekin
 * klinika uchun eng muhim narsa — bemor navbat ola olishi. U faqat
 * brauzerda ko'rinadi: "bemor tanlanmasdan 5-qadamga o'tib ketardi"
 * kabi xato hamma test yashil turganda ham sodir bo'lgan edi.
 *
 * Ishlatish (avval `npm run build`):
 *   npm run test:e2e
 *
 * Server: `astro preview` shu skriptning o'zi ishga tushiradi.
 * API javoblari soxta — baza ham, tarmoq ham kerak emas.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = Number(process.env.DIMED_E2E_PORT ?? 4399);
const base = `http://127.0.0.1:${PORT}`;

const p2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// --- soxta API ---
const doctors = [
  {
    id: 'ashurov', name: 'Ashurov Tursunali', job: 'Terapevt', deptId: 'terapiya',
    experience: '20+ yil', photo: '/images/team/ashurov-tursunali.webp', hours: 'Du–Sh · 08:00–17:00',
    shifts: [{ start: '08:00', end: '17:00' }], slotMinutes: 60, workdays: [0, 1, 2, 3, 4, 5, 6],
    price: 70000, ratingAvg: null, ratingCount: 0, ageGroup: 'adult',
  },
];
const patients = {
  patients: [
    { id: 'A1', name: 'Azizova Aziza', source: '1c', birthDate: '1990-04-25' },
    { id: 'A2', name: 'Azizov Sardor', source: '1c', birthDate: '2016-05-10' },
  ],
  activeId: null,
};
const slots = {
  slots: ['09:00', '10:00', '11:00'].map((time) => ({ time, free: true })),
  workdays: [0, 1, 2, 3, 4, 5, 6],
};

let booked = null;

async function mockApi(ctx, { signedIn }) {
  await ctx.route('**/api/**', (route) => {
    const url = route.request().url();
    const send = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/api/doctors')) return send(doctors);
    if (url.includes('/api/slots')) return send(slots);
    if (url.includes('/api/prices')) return send({ analyses: [], doctors: [] });
    if (url.includes('/api/session')) {
      return send(signedIn ? { role: 'patient', name: 'Aziza', phone: '+998 90 123 45 67' } : { role: 'guest' });
    }
    // Kirmagan foydalanuvchida kabinet API'lari 401 beradi — sahifalar
    // shunga qarab kirish panelini ko'rsatadi.
    if (url.includes('/api/patients') || url.includes('/api/me') || url.includes('/api/result')) {
      return signedIn ? send(patients) : send({ error: 'Avval kiring' }, 401);
    }
    if (url.includes('/api/book')) {
      booked = JSON.parse(route.request().postData() ?? '{}');
      return send({ ok: true, mode: 'at_clinic', appointment: { patientName: 'Azizova Aziza' } });
    }
    return send({ ok: true });
  });
}

/** 1-qadamdan 4-qadamgacha yuradi. */
async function walkToPatientStep(page) {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(400);
  await page.click('.dept-btn[data-id="terapiya"]');
  await page.click('.doc-btn');
  await page.waitForTimeout(300);
  await page.click('.slot-btn:not(.busy)');
  await page.waitForTimeout(400);
}

const activeStep = (page) => page.$eval('#wSteps .step-pill.on .lbl', (e) => e.textContent.trim());

// --- serverni ko'tarish ---
/*
  `npx` ni to'g'ridan-to'g'ri ishga tushirish Windows'da ishlamaydi (npx.cmd
  kerak) — shuning uchun astro CLI'ni node orqali chaqiramiz: bu hamma
  tizimda bir xil ishlaydi va to'xtatilganda bola jarayon ham o'chadi.
*/
const astroCli = new URL('../node_modules/astro/astro.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const server = spawn(process.execPath, [astroCli, 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
  stdio: 'ignore',
});
const stop = () => {
  server.kill('SIGTERM');
};
process.on('exit', stop);

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await fetch(base + '/').then((r) => r.ok).catch(() => false);
  if (!ready) await sleep(500);
}
if (!ready) {
  stop();
  throw new Error(`Preview server ko'tarilmadi (${base}). Avval "npm run build" qiling.`);
}

const browser = await chromium.launch(
  process.env.DIMED_CHROMIUM ? { executablePath: process.env.DIMED_CHROMIUM } : {},
);

let passed = 0;
const errors = [];
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  XATO  ${name}\n        ${err.message.split('\n')[0]}`);
    errors.push(name);
  }
};

console.log('Brauzerda asosiy oqim:');

for (const vp of [
  { name: 'mobil', width: 375, height: 900, isMobile: true },
  { name: 'desktop', width: 1280, height: 900, isMobile: false },
]) {
  const size = { viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile };

  await test(`${vp.name}: kirmagan bemor 4-qadamda qoladi va kirish oynasini ko'radi`, async () => {
    const ctx = await browser.newContext(size);
    await mockApi(ctx, { signedIn: false });
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await walkToPatientStep(page);

    assert.equal(await activeStep(page), 'Bemor', '5-qadamga o‘tib ketmasligi kerak');
    assert.equal(await page.isVisible('#wLogin'), true, 'kirish oynasi ko‘rinishi kerak');
    assert.deepEqual(jsErrors, [], 'sahifada JS xatosi bo‘lmasin');
    await ctx.close();
  });

  await test(`${vp.name}: mos bemor tanlansa bron oxirigacha boradi`, async () => {
    const ctx = await browser.newContext(size);
    await mockApi(ctx, { signedIn: true });
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await walkToPatientStep(page);
    assert.equal(await activeStep(page), 'Bemor');

    await page.$eval('#privacyOk', (b) => {
      if (!b.checked) b.click();
    });
    await page.click('[data-pick="A1"]');
    await page.waitForTimeout(400);
    assert.equal(await activeStep(page), 'Tasdiqlash', 'bemor tanlangach 5-qadam ochiladi');

    booked = null;
    await page.click('#wBook');
    await page.waitForTimeout(400);
    assert.ok(booked, 'bron so‘rovi ketishi kerak');
    assert.equal(booked.doctor, 'ashurov');
    assert.equal(booked.patientId, 'A1');
    assert.equal(booked.privacyAccepted, true);
    assert.equal(await page.isVisible('.success'), true, 'muvaffaqiyat oynasi ko‘rinishi kerak');
    assert.deepEqual(jsErrors, []);
    await ctx.close();
  });

  await test(`${vp.name}: yoshi mos kelmagan bemor o'tkazilmaydi`, async () => {
    const ctx = await browser.newContext(size);
    await mockApi(ctx, { signedIn: true });
    const page = await ctx.newPage();
    await walkToPatientStep(page);

    await page.$eval('#privacyOk', (b) => {
      if (!b.checked) b.click();
    });
    booked = null;
    await page.click('[data-pick="A2"]');   // 2016-yilda tug'ilgan, shifokor 16+
    await page.waitForTimeout(300);
    assert.equal(await activeStep(page), 'Bemor', '5-qadamga o‘tmasligi kerak');
    assert.match(await page.$eval('#whoMsg', (e) => e.textContent), /16 yoshdan katta/);
    assert.equal(booked, null, 'bron so‘rovi ketmasligi kerak');
    await ctx.close();
  });

  await test(`${vp.name}: kabinet sahifasi kirmaganga tushuntiradi`, async () => {
    const ctx = await browser.newContext(size);
    await mockApi(ctx, { signedIn: false });
    const page = await ctx.newPage();
    await page.goto(base + '/kabinet/tahlillar/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // `$()` yashirin elementni ham topadi — ko'rinayotganini tekshiramiz.
    assert.equal(await page.isVisible('.signin-card'), true, 'kirish paneli ko‘rinishi kerak');
    assert.equal(await page.isVisible('#loading'), false, 'yuklanmoqda yozuvi qolmasin');
    assert.match(await page.$eval('[data-signin-what]', (e) => e.textContent), /tahlil/i);
    assert.equal(await page.isVisible('[data-cabinet-tabs]'), false, 'tablar yashirilsin');
    await ctx.close();
  });
}

await test('telefon raqami har xil yozilsa ham qabul qilinadi', async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, isMobile: true });
  let sentPhone = null;
  await ctx.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth-verify')) {
      sentPhone = JSON.parse(route.request().postData() ?? '{}').phone;
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Kod notoʻgʻri.' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'guest' }) });
  });
  const page = await ctx.newPage();
  await page.goto(base + '/kirish/', { waitUntil: 'networkidle' });

  for (const raw of ['11 111 11 11', '+998 11 111 1111', '111111111']) {
    await page.fill('#phone', raw);
    const boxes = await page.$$('.otp-row input');
    for (let i = 0; i < 6; i++) await boxes[i].fill('1');
    sentPhone = null;
    await page.click('#submit');
    await page.waitForTimeout(200);
    assert.equal(sentPhone, '+998111111111', `${raw} noto‘g‘ri yuborildi`);
  }

  await page.fill('#phone', '123');
  sentPhone = null;
  await page.click('#submit');
  await page.waitForTimeout(200);
  assert.equal(sentPhone, null, 'noto‘g‘ri raqam serverga ketmasligi kerak');
  await ctx.close();
});


await test('/ru/ sahifasi rus tilida chiqadi va vidjet ham ruschada', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: false });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  await page.goto(`${base}/ru/`, { waitUntil: 'networkidle' });

  assert.equal(await page.getAttribute('html', 'lang'), 'ru', '<html lang> ruscha bo‘lishi kerak');
  assert.match(await page.textContent('h1'), /Запись к врачу/, 'sarlavha ruscha');
  assert.match(
    await page.textContent('.widget-title'),
    /Онлайн-запись/,
    'vidjet sarlavhasi ham ruscha',
  );

  // Bo'lim nomlari ham tarjima bilan chiziladi (ma'lumot ichidagi name_ru).
  await page.click('[data-book-dept="terapiya"]');
  await page.waitForTimeout(300);
  const pane = await page.textContent('.pane-label');
  assert.match(pane, /Выберите врача/, `2-qadam ruscha bo‘lishi kerak, keldi: ${pane}`);

  assert.deepEqual(jsErrors, [], 'JS xatosi bo‘lmasligi kerak');
  await ctx.close();
});

await test('til tugmasi va hreflang uch sahifani bog‘laydi', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: false });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });

  const hrefs = await page.$$eval('link[rel="alternate"][hreflang]', (ls) =>
    ls.map((l) => `${l.getAttribute('hreflang')}:${new URL(l.href).pathname}`),
  );
  assert.deepEqual(
    hrefs.filter((x) => !x.startsWith('x-default')).sort(),
    ['en:/en/', 'ru:/ru/', 'uz:/'],
    `hreflang uchtasini ko‘rsatishi kerak, keldi: ${hrefs.join(' ')}`,
  );

  await page.click('.nav-cta .lang-btn[hreflang="ru"]');
  await page.waitForLoadState('domcontentloaded');
  assert.equal(new URL(page.url()).pathname, '/ru/', 'til tugmasi /ru/ ga olib borishi kerak');

  // Manzil tanlovni eslab qoladi: kabinetga o'tsa ham ruscha qoladi.
  const stored = await page.evaluate(() => localStorage.getItem('dimed_lang'));
  assert.equal(stored, 'ru', 'til brauzerda eslab qolinishi kerak');
  await ctx.close();
});

await test('/en/tahlillar tahlil nomlarini inglizchada beradi', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: false });
  const page = await ctx.newPage();
  await page.goto(`${base}/en/tahlillar`, { waitUntil: 'domcontentloaded' });

  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  const body = await page.textContent('body');
  assert.ok(body.includes('Complete blood count'), 'tahlil nomi inglizchada bo‘lishi kerak');
  assert.ok(body.includes('Blood biochemistry'), 'guruh nomi ham tarjima qilinadi');
  assert.ok(!body.includes('Umumiy qon tahlili'), 'o‘zbekcha nom qolmasligi kerak');
  await ctx.close();
});


await test('404 sahifasi yoʻl koʻrsatadi va tilga moslashadi', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await mockApi(ctx, { signedIn: false });
  const page = await ctx.newPage();
  await page.goto(`${base}/404?lang=ru`, { waitUntil: 'networkidle' });

  const body = await page.textContent('.card');
  assert.match(body, /Такой страницы нет/, `404 ruscha bo‘lishi kerak, keldi: ${body.slice(0, 80)}`);
  assert.ok(!body.includes('notfound.'), 'kalit nomi ko‘rinib qolmasligi kerak');

  // Uchta chiqish yo'li: bosh sahifa, tahlillar, kabinet.
  const links = await page.$$eval('.acts a', (as) => as.map((a) => new URL(a.href).pathname));
  assert.deepEqual(links, ['/', '/tahlillar', '/kabinet']);
  await ctx.close();
});

await test('bosh sahifada klinika razmetkasi va suratlar bor', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: false });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });

  const raw = await page.textContent('script[type="application/ld+json"]');
  const schema = JSON.parse(raw);
  assert.equal(schema['@type'], 'MedicalClinic');
  assert.ok(schema.employee.length > 0, 'shifokorlar razmetkaga kirishi kerak');
  assert.equal(schema.address.addressLocality, 'Chinoz');
  assert.ok(schema.openingHoursSpecification[0].opens, 'ish vaqti ko‘rsatilishi kerak');

  // Suratlar: har birida alt matni bo'lsin (skrinrider uchun ham, SEO uchun ham).
  const alts = await page.$$eval('#klinika img', (imgs) => imgs.map((i) => i.alt));
  assert.equal(alts.length, 3, 'uchta surat');
  assert.ok(
    alts.every((a) => a.length > 5),
    `har bir suratda alt bo‘lishi kerak, keldi: ${JSON.stringify(alts)}`,
  );
  await ctx.close();
});

console.log('\nKirish havolasi va natija sahifasi:');

await test('botdagi "Saytga kirish" havolasi kodni o‘zi tasdiqlaydi va manzildan olib tashlaydi', async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, isMobile: true });
  await mockApi(ctx, { signedIn: true });
  let verified = null;
  await ctx.route('**/api/auth-verify', (route) => {
    verified = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));

  await page.goto(`${base}/kirish#p=998901234567&c=123456`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  assert.deepEqual(verified, { phone: '+998901234567', code: '123456' });
  assert.equal(new URL(page.url()).hash, '', 'kod manzilda (tarixda) qolmasligi kerak');
  assert.equal(await page.isVisible('#whoCard'), true, 'kirgach "kim kirmoqda?" ochiladi');
  assert.deepEqual(jsErrors, [], 'sahifada JS xatosi bo‘lmasin');
  await ctx.close();
});

await test('buzuq kirish havolasi hech narsa yubormaydi, oddiy kirish oynasi qoladi', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: false });
  let verified = false;
  await ctx.route('**/api/auth-verify', (route) => {
    verified = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/kirish#p=12&c=abc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  assert.equal(verified, false, 'noto‘g‘ri havola so‘rov yubormasligi kerak');
  assert.equal(await page.inputValue('#phone'), '', 'maydonlar to‘ldirilmaydi');
  assert.equal(new URL(page.url()).hash, '');
  await ctx.close();
});

const sampleResult = (doctor) => ({
  result: {
    id: 'doc-1', title: 'Umumiy qon tahlili', titleKey: 'panel.cbc', date: '2026-08-21T14:30:00',
    patientName: 'Yoʻldoshev Anvar', patientBirthDate: '1990-04-25', patientGender: 'male',
    doctor, biomaterial: 'Qon', sampleId: 'A-1', status: 'ready', seen: false,
    verifyUrl: `${base}/tekshirish?v=ok`,
    items: [
      { id: '1', code: '96', title: 'Gemoglobin', value: '132', unit: 'g/L', reference: '120 — 160', refLow: 120, refHigh: 160, status: 'normal', description: null },
      { id: '2', code: '5', title: 'Oqsil', value: 'manfiy', unit: 'g/L', reference: null, refLow: null, refHigh: null, status: null, description: null },
    ],
  },
  shared: false,
});

for (const [doctor, shown] of [[null, false], ['Ashurov T.', true]]) {
  await test(`natija sahifasi: yuborgan shifokor ${shown ? 'bor — ko‘rinadi' : 'yo‘q — katak chiqmaydi'}`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await mockApi(ctx, { signedIn: true });
    await ctx.route('**/api/result**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleResult(doctor)) }),
    );
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await page.goto(`${base}/natija?id=doc-1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#sheet:not([hidden])');

    assert.equal(await page.isVisible('#cellDoctor'), shown);
    assert.equal(await page.$eval('#cellSample', (c) => c.colSpan), shown ? 1 : 2, 'namuna katagi qatorni egallaydi');

    // Birlik faqat sonli qiymatga: "manfiy g/L" chiqmasin.
    const values = await page.$$eval('#rows tr', (rows) => rows.map((r) => r.children[1].textContent.trim()));
    assert.deepEqual(values, ['132 g/L', 'manfiy']);

    // Havola messenjerga tashlanganda bosh sahifa rasmi chiqmasin.
    assert.equal(await page.$('meta[property="og:image"]'), null, 'natija sahifasida og:image yo‘q');
    assert.deepEqual(jsErrors, []);
    await ctx.close();
  });
}

console.log('\nQo\'shimcha xizmatlar (vidjet):');

const withServices = [
  {
    ...doctors[0],
    services: [
      { id: 'massaj', name: 'Massaj', price: 50000, followupDays: null },
      { id: 'qayta-korik', name: "Qayta ko'rik", price: 0, followupDays: 10 },
    ],
  },
];

await test('xizmati bor shifokorda tanlov chiqadi; tanlangan xizmat narxda va bron so\'rovida', async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, isMobile: true });
  await mockApi(ctx, { signedIn: true });
  await ctx.route('**/api/doctors', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(withServices) }),
  );
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));

  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(400);
  await page.click('.dept-btn[data-id="terapiya"]');
  await page.click('.doc-btn');
  await page.waitForTimeout(300);

  // Asosiy qabul + ikkita qo'shimcha xizmat; boshida asosiysi tanlangan.
  assert.equal(await page.$$eval('.svc-pill', (p) => p.length), 3);
  assert.equal(await page.$eval('.svc-pill.on', (p) => p.dataset.s), 'main');
  await page.click('.svc-pill[data-s="qayta-korik"]');
  assert.equal(await page.$eval('.svc-pill.on', (p) => p.dataset.s), 'qayta-korik');

  await page.click('.slot-btn:not(.busy)');
  await page.waitForTimeout(400);
  await page.$eval('#privacyOk', (b) => {
    if (!b.checked) b.click();
  });
  await page.click('[data-pick="A1"]');
  await page.waitForTimeout(400);
  assert.equal(await activeStep(page), 'Tasdiqlash');

  // Qayta ko'rik bepul: narx "Bepul", "kassaga to'laysiz" yo'q, xizmat nomi xulosada.
  assert.match(await page.textContent('.price-big'), /Bepul/);
  assert.doesNotMatch(await page.textContent('.price-note'), /kassasiga/);
  assert.match(await page.textContent('.sum-card'), /Qayta ko'rik/);

  booked = null;
  await page.click('#wBook');
  await page.waitForTimeout(400);
  assert.ok(booked, 'bron so‘rovi ketishi kerak');
  assert.equal(booked.serviceId, 'qayta-korik');
  assert.deepEqual(jsErrors, [], 'sahifada JS xatosi bo‘lmasin');
  await ctx.close();
});

await test('xizmat tanlanmasa asosiy qabul: serviceId yuborilmaydi, narx shifokornikidek', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: true });
  await ctx.route('**/api/doctors', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(withServices) }),
  );
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(400);
  await page.click('.dept-btn[data-id="terapiya"]');
  await page.click('.doc-btn');
  await page.waitForTimeout(300);
  await page.click('.slot-btn:not(.busy)');
  await page.waitForTimeout(400);
  await page.$eval('#privacyOk', (b) => {
    if (!b.checked) b.click();
  });
  await page.click('[data-pick="A1"]');
  await page.waitForTimeout(400);

  assert.match(await page.textContent('.price-big'), /70\s000/);
  // Onlayn to'lov o'chiq (sarlavha yo'q) — kassa matni va oddiy Tasdiqlash tugmasi.
  assert.match(await page.textContent('.price-note'), /kassasiga/);
  assert.equal((await page.textContent('#wBook')).trim(), 'Tasdiqlash');
  assert.doesNotMatch(await page.textContent('[data-pay-text]'), /Payme/);
  booked = null;
  await page.click('#wBook');
  await page.waitForTimeout(400);
  assert.ok(booked);
  assert.equal(booked.serviceId, undefined, 'asosiy qabulda xizmat kaliti yuborilmaydi');
  await ctx.close();
});

/** Onlayn to'lov yoqilgan server: `/api/doctors` sarlavhasi va Payme havolasini qaytaradigan bron. */
async function onlineContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: true });
  await ctx.route('**/api/doctors', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-payment-mode': 'online' },
      body: JSON.stringify(withServices),
    }),
  );
  await ctx.route('**/api/book', (route) => {
    booked = JSON.parse(route.request().postData() ?? '{}');
    const free = booked.serviceId === 'qayta-korik';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        free
          ? { ok: true, mode: 'at_clinic', appointment: { price: 0, serviceName: "Qayta ko'rik" } }
          : { ok: true, mode: 'online', redirectUrl: base + '/?payme=test' },
      ),
    });
  });
  return ctx;
}

/** Xizmati bor shifokorda 5-qadamgacha yuradi. */
async function walkToCheckout(page, serviceId) {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(400);
  await page.click('.dept-btn[data-id="terapiya"]');
  await page.click('.doc-btn');
  await page.waitForTimeout(300);
  if (serviceId) await page.click(`.svc-pill[data-s="${serviceId}"]`);
  await page.click('.slot-btn:not(.busy)');
  await page.waitForTimeout(400);
  await page.$eval('#privacyOk', (b) => {
    if (!b.checked) b.click();
  });
  await page.click('[data-pick="A1"]');
  await page.waitForTimeout(400);
}

await test('onlayn to\'lov yoqilganda: "Payme orqali to\'laysiz", tugma Payme\'ga olib boradi', async () => {
  const ctx = await onlineContext();
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  await walkToCheckout(page, null);
  assert.equal(await activeStep(page), 'Tasdiqlash');

  // Bosh sahifadagi "Qanday ishlaydi" ham kassa emas, Payme deydi.
  assert.match(await page.textContent('[data-pay-text]'), /Payme/);
  assert.doesNotMatch(await page.textContent('[data-pay-text]'), /kassasida/);

  const note = await page.textContent('.price-note');
  assert.match(note, /Payme orqali 70\s000/);
  assert.doesNotMatch(note, /kassasiga/);
  assert.match((await page.textContent('#wBook')).trim(), /^Payme orqali to.lash$/);

  booked = null;
  await page.click('#wBook');
  await page.waitForURL(/payme=test/, { timeout: 5000 });
  assert.ok(booked, 'bron so‘rovi ketishi kerak');
  assert.deepEqual(jsErrors, [], 'sahifada JS xatosi bo‘lmasin');
  await ctx.close();
});

await test('onlayn to\'lov yoqilgan bo\'lsa ham bepul qayta ko\'rik Payme\'siz tasdiqlanadi', async () => {
  const ctx = await onlineContext();
  const page = await ctx.newPage();
  await walkToCheckout(page, 'qayta-korik');

  assert.match(await page.textContent('.price-big'), /Bepul/);
  assert.doesNotMatch(await page.textContent('.price-note'), /Payme|kassasiga/);
  assert.equal((await page.textContent('#wBook')).trim(), 'Tasdiqlash');

  booked = null;
  await page.click('#wBook');
  await page.waitForTimeout(400);
  assert.equal(booked.serviceId, 'qayta-korik');
  assert.equal(await page.isVisible('.success'), true, 'Payme\'ga o‘tmay, muvaffaqiyat oynasi');
  await ctx.close();
});

await test('xizmati yo\'q shifokorda tanlov umuman chiqmaydi (avvalgidek)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await mockApi(ctx, { signedIn: false });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(400);
  await page.click('.dept-btn[data-id="terapiya"]');
  await page.click('.doc-btn');
  await page.waitForTimeout(300);
  assert.equal(await page.$$eval('.svc-pill', (p) => p.length), 0);
  assert.equal(await page.isVisible('.slot-btn'), true, 'vaqt tanlash avvalgidek');
  await ctx.close();
});

console.log('\nTelefon ko\'rinishi (360px):');

await test('sahifalar ekran chetiga yopishmaydi va yonga surilmaydi', async () => {
  // Komponentlardagi `padding: A 0 B` `.wrap` ning yon bo'shlig'ini nolga
  // tushirib qo'yardi; ustunlar ham vidjet tufayli ekrandan chiqib ketardi.
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true });
  await mockApi(ctx, { signedIn: false });
  for (const path of ['/', '/ru/', '/en/', '/kirish', '/tahlillar', '/maxfiylik']) {
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: 'networkidle' });
    const m = await page.evaluate(() => ({
      pads: [...document.querySelectorAll('.wrap')].map((el) => parseFloat(getComputedStyle(el).paddingLeft)),
      overflow: document.documentElement.scrollWidth - innerWidth,
      price: [...document.querySelectorAll('td.price')].map((el) => el.getBoundingClientRect().right),
    }));
    assert.ok(m.pads.length > 0 && m.pads.every((p) => p >= 12), `${path}: yon bo'shliq yo'q (${m.pads})`);
    assert.ok(m.overflow <= 0, `${path}: sahifa ${m.overflow}px yonga surilyapti`);
    assert.ok(m.price.every((r) => r <= 360), `${path}: narx ustuni ekrandan tashqarida`);
    await page.close();
  }
  await ctx.close();
});

await browser.close();
stop();

if (errors.length) {
  console.error(`\n${errors.length} ta tekshiruv yiqildi: ${errors.join(', ')}`);
  process.exit(1);
}
console.log(`\n${passed} ta brauzer tekshiruvi o'tdi.`);
