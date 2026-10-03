/**
 * Vaqt va slot mantig'i uchun tekshiruvlar — bron tizimining yuragi.
 * Ishlatish: npm test
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'functions', 'lib');
const load = (file) => import(pathToFileURL(join(libDir, file)).href);

const { toTashkent, toInstant, addDays, daysBetween, weekdayOf } = await load('time.ts');
const { slotTimes, availability, isBookable, isValidSlot, doctorDayKey, toMinutes, toHHMM } =
  await load('slots.ts');

let passed = 0;
const test = (name, fn) => {
  fn();
  console.log(`  ok  ${name}`);
  passed++;
};

console.log('Vaqt zonasi (UTC+5):');
test('UTC yarim tunda Toshkentda ertalab 05:00', () => {
  const t = toTashkent(new Date('2026-08-12T00:00:00Z'));
  assert.equal(t.dateKey, '2026-08-12');
  assert.equal(t.minutes, 5 * 60);
});

test('UTC 19:30 — Toshkentda allaqachon ertangi kun', () => {
  const t = toTashkent(new Date('2026-08-12T19:30:00Z'));
  assert.equal(t.dateKey, '2026-08-13');
  assert.equal(t.minutes, 30);
});

test('UTC 18:59 — hali o\'sha kun (23:59)', () => {
  const t = toTashkent(new Date('2026-08-12T18:59:00Z'));
  assert.equal(t.dateKey, '2026-08-12');
  assert.equal(t.minutes, 23 * 60 + 59);
});

test('toInstant Toshkent vaqtini UTC ga to\'g\'ri o\'giradi', () => {
  assert.equal(toInstant('2026-08-12', '09:15').toISOString(), '2026-08-12T04:15:00.000Z');
  assert.equal(toInstant('2026-08-12', '02:00').toISOString(), '2026-08-11T21:00:00.000Z');
});

test('toTashkent va toInstant bir-birini qaytaradi', () => {
  const instant = toInstant('2026-08-12', '16:45');
  const back = toTashkent(instant);
  assert.equal(back.dateKey, '2026-08-12');
  assert.equal(toHHMM(back.minutes), '16:45');
});

test('addDays oy va yil chegarasidan o\'tadi', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('daysBetween kalendar kunlarini sanaydi (oy/yil chegarasi, ishorasi)', () => {
  assert.equal(daysBetween('2026-10-02', '2026-10-12'), 10);
  assert.equal(daysBetween('2026-10-02', '2026-10-02'), 0);
  assert.equal(daysBetween('2026-12-28', '2027-01-03'), 6);
  assert.equal(daysBetween('2026-10-12', '2026-10-02'), -10);
  assert.equal(daysBetween('2026-02-27', '2026-03-01'), 2);
});

test('weekdayOf to\'g\'ri kun qaytaradi', () => {
  assert.equal(weekdayOf('2026-08-12'), 3); // chorshanba
  assert.equal(weekdayOf('2026-08-16'), 0); // yakshanba
});

console.log('\nSlot yasash:');
const shifts = [
  { start: '08:00', end: '12:00' },
  { start: '13:00', end: '17:00' },
];

test('tanaffusga slot tushmaydi', () => {
  const times = slotTimes(shifts, 15);
  assert.ok(times.includes('11:45'), '11:45 bo\'lishi kerak');
  assert.ok(!times.includes('12:00'), '12:00 smena tashqarisida');
  assert.ok(!times.includes('12:30'), 'tanaffusda slot bo\'lmasin');
  assert.ok(times.includes('13:00'), '13:00 ikkinchi smena boshi');
});

test('slot soni davomiylikka mos', () => {
  assert.equal(slotTimes(shifts, 15).length, 32); // 8 soat / 15 daq
  assert.equal(slotTimes(shifts, 30).length, 16);
  assert.equal(slotTimes(shifts, 20).length, 24);
});

test('smena oxiriga sig\'maydigan qoldiq tashlanadi', () => {
  // 09:00–09:50, 20 daqiqadan: 09:00, 09:20 (09:40+20 = 10:00 > 09:50)
  assert.deepEqual(slotTimes([{ start: '09:00', end: '09:50' }], 20), ['09:00', '09:20']);
});

test('smenalar tartibsiz bo\'lsa ham natija tartibli', () => {
  const times = slotTimes([{ start: '14:00', end: '15:00' }, { start: '09:00', end: '10:00' }], 30);
  assert.deepEqual(times, ['09:00', '09:30', '14:00', '14:30']);
});

test('kechki smena (LOR) to\'g\'ri hisoblanadi', () => {
  // 19:30–22:00 = 150 daqiqa, 20 daqiqadan 7 ta slot sig'adi.
  const times = slotTimes([{ start: '19:30', end: '22:00' }], 20);
  assert.equal(times.length, 7);
  assert.equal(times[0], '19:30');
  assert.equal(times.at(-1), '21:30'); // 21:30 + 20 = 21:50 <= 22:00
});

test('slotMinutes noto\'g\'ri bo\'lsa xato', () => {
  assert.throws(() => slotTimes(shifts, 0));
  assert.throws(() => slotTimes(shifts, -15));
});

console.log('\nBandlik:');
test('band slot free: false', () => {
  const slots = availability({
    shifts,
    slotMinutes: 60,
    dateKey: '2026-08-20',
    taken: ['09:00', '14:00'],
    now: new Date('2026-08-12T06:00:00Z'),
  });
  assert.equal(slots.find((s) => s.time === '09:00').free, false);
  assert.equal(slots.find((s) => s.time === '14:00').free, false);
  assert.equal(slots.find((s) => s.time === '10:00').free, true);
});

test('1 soatdan kam qolgan slotlar yopiq', () => {
  // Toshkentda 2026-08-12 10:00 (UTC 05:00)
  const now = new Date('2026-08-12T05:00:00Z');
  const slots = availability({ shifts, slotMinutes: 60, dateKey: '2026-08-12', taken: [], now });
  const at = (t) => slots.find((s) => s.time === t).free;
  assert.equal(at('08:00'), false, 'o\'tib ketgan');
  assert.equal(at('10:00'), false, 'hozirgi soat — kech');
  assert.equal(at('11:00'), true, 'roppa-rosa 1 soat — "kamida" shartiga mos');
  assert.equal(at('13:00'), true, '3 soat qolgan — bo\'sh');
});

test('o\'tgan kunda hech qanday bo\'sh slot yo\'q', () => {
  const slots = availability({
    shifts,
    slotMinutes: 60,
    dateKey: '2026-08-11',
    taken: [],
    now: new Date('2026-08-12T05:00:00Z'),
  });
  assert.equal(slots.some((s) => s.free), false);
});

test('kelasi kunda erta slotlar ham ochiq', () => {
  const slots = availability({
    shifts,
    slotMinutes: 60,
    dateKey: '2026-08-13',
    taken: [],
    now: new Date('2026-08-12T18:00:00Z'), // Toshkentda 23:00
  });
  assert.equal(slots.find((s) => s.time === '08:00').free, true);
});

console.log('\nBron qoidalari:');
test('1 soatdan ko\'p qolgan bo\'lsa mumkin', () => {
  assert.equal(isBookable('2026-08-12', '12:00', new Date('2026-08-12T05:00:00Z')), true);
});

test('aynan 1 soat qolganda — chegara ochiq', () => {
  // Toshkentda 10:00, qabul 11:00 => farq roppa-rosa 60 daqiqa
  assert.equal(isBookable('2026-08-12', '11:00', new Date('2026-08-12T05:00:00Z')), true);
});

test('59 daqiqa qolganda — yopiq', () => {
  assert.equal(isBookable('2026-08-12', '11:00', new Date('2026-08-12T05:01:00Z')), false);
});

test('o\'tib ketgan qabul — yopiq', () => {
  assert.equal(isBookable('2026-08-12', '09:00', new Date('2026-08-12T05:00:00Z')), false);
});

console.log('\nTekshiruvlar:');
test('jadvalda yo\'q vaqt rad etiladi', () => {
  assert.equal(isValidSlot(shifts, 15, '09:15'), true);
  assert.equal(isValidSlot(shifts, 15, '12:15'), false, 'tanaffus');
  assert.equal(isValidSlot(shifts, 15, '09:07'), false, 'slot to\'riga tushmaydi');
  assert.equal(isValidSlot(shifts, 15, '25:00'), false, 'mavjud bo\'lmagan vaqt');
  assert.equal(isValidSlot(shifts, 15, 'ertalab'), false, 'matn');
});

test('doctorDayKey formati', () => {
  assert.equal(doctorDayKey('ashurov', '2026-08-12'), 'ashurov#2026-08-12');
});

test('toMinutes / toHHMM juftligi', () => {
  for (const t of ['00:00', '08:30', '13:45', '23:59']) assert.equal(toHHMM(toMinutes(t)), t);
});

console.log(`\n${passed} ta tekshiruv o'tdi.`);
