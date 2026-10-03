import type { Config, Context } from '@netlify/functions';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES, scanAllPages } from './lib/db.ts';
import { loadResults, loadAdminReferences } from './lib/results.ts';
import type { ReferenceRow } from './lib/references.ts';
import { shareUrl } from './result.ts';
import { appointmentsOnDate } from './lib/appointments.ts';
import { toTashkent, addDays } from './lib/time.ts';
import { botText, isLang, type Lang } from './lib/i18n.ts';
import { sendMessage, logToAdmin, isTransientTelegramError } from './lib/telegram.ts';
import { cronGuard } from './lib/cron.ts';
import { json, error } from './lib/http.ts';

/**
 * Yangi tahlil natijasi haqida bemorga bot orqali xabar (G1).
 *
 * 1C natijalarni DynamoDB'ga o'zi yozadi — sayt buni bilmaydi,
 * webhook yo'q. Shuning uchun Netlify Scheduled Function har 15
 * daqiqada botdan o'tgan bemorlarni aylanib chiqadi va har birida
 * hali xabar berilmagan, tayyor hujjatlarni topadi.
 *
 * Takror yubormaslik: xabar berilgan hujjatlar bemor yozuvida
 * `results_notified` ro'yxatida turadi (1C jadvaliga sayt yozmaydi).
 * Birinchi marta ko'rilayotgan bemorning (ro'yxat hali yo'q) eski tarixi
 * xabarsiz belgilab qo'yiladi — aks holda hamma eski natija "yangi"
 * bo'lardi. Faqat `NEW_PATIENT_DAYS` kundan yangi natija haqida xabar
 * beriladi: bemor laboratoriyaga kelib, natija chiqqandan keyin botga
 * kirsa, natijasini ko'rishi uchun.
 *
 * Xabar vaqtinchalik sababga ko'ra yetmasa (bot kaliti yaroqsiz, Telegram
 * band) "xabar berilgan" belgisi qaytariladi — natija keyingi aylanishda
 * yana yuboriladi.
 */
const NOTIFIED_CAP = 500;
/** Yangi bemor uchun shuncha kundan yangi natijalar haqida xabar beriladi. */
const NEW_PATIENT_DAYS = 3;
/** Bir ishga tushishda bitta bemorga ko'pi bilan shuncha alohida xabar. */
const MAX_SEPARATE = 3;

/*
  Har ishga tushishda hamma bemorning natijalari o'qib chiqilardi:
  bitta bemor — ikki jadvalga so'rov. Bemor soni o'sgani sari bu
  chiziqli qimmatlashadi va bir kuni cron vaqtga sig'may qoladi.

  Shuning uchun tez-tez ishlaydigan yugurish faqat klinika bilan
  aloqasi ochiq bemorlarni qaraydi. Botdan o'tgan, lekin saytdan
  navbat olmagan bemorlar (masalan to'g'ridan to'g'ri laboratoriyaga
  kelganlar) kuniga bir marta, tunda qaraladigan to'liq aylanishda
  qamrab olinadi.
*/
/** Shuncha kun orqaga: natija odatda qabuldan keyin keladi. */
const RECENT_DAYS = 21;
/*
  Va shuncha kun oldinga: bemor navbat olib qo'yib, qabulga borgunicha
  tahlil topshirishi odatiy hol. Bunda uning yagona yozuvi kelajakda
  turadi — faqat orqaga qarasak, tayyor natija tungi aylanishgacha
  kutib qolardi.
*/
const UPCOMING_DAYS = 30;
/** To'liq aylanish Toshkent vaqti bilan shu soatda (cron har 15 daqiqada). */
const FULL_SWEEP_HOUR = 3;

type UserRow = {
  telegram_id: string;
  phone?: string;
  lang?: string;
  results_notified?: string[];
};

/** Yaqinda klinikada bo'lgan yoki navbati oldinda turgan bemorlar telefonlari. */
async function activePatients(now: Date): Promise<Set<string>> {
  const today = toTashkent(now).dateKey;
  const span = RECENT_DAYS + UPCOMING_DAYS + 1;
  const days = Array.from({ length: span }, (_, i) => addDays(today, i - RECENT_DAYS));
  const rows = await Promise.all(
    days.map((day) => appointmentsOnDate(day).catch(() => [])),
  );
  return new Set(rows.flat().map((a) => a.phone).filter(Boolean));
}

export default async (request: Request, _context: Context): Promise<Response> => {
  const blocked = await cronGuard(request, 'notify-results', 450);
  if (blocked) return blocked;

  try {
    const now = new Date();
    /*
      Rejimni so'rovda ham ko'rsatish mumkin (`?mode=full`): cron
      parametr yubormaydi, shuning uchun standarti — soat bo'yicha,
      lekin klinika kerak bo'lganda to'liq aylanishni qo'lda ishga
      tushira oladi (va test ham aniq rejimni tekshira oladi).
    */
    const asked = new URL(request.url).searchParams.get('mode');
    const fullSweep =
      asked === 'full' || (asked !== 'recent' && Math.floor(toTashkent(now).minutes / 60) === FULL_SWEEP_HOUR);

    // Bitta Scan 1 MB da kesiladi — qolgan bemorlar xabarsiz qolardi.
    const rows = (await scanAllPages({ TableName: TABLES.users })) as UserRow[];
    const all = rows.filter((u) => u.phone && u.telegram_id);

    /*
      Tarixi hali belgilanmagan bemor (birinchi marta ko'rilayotgan)
      har doim qaraladi — aks holda u tungi aylanishgacha kutib qolardi
      va oradagi natijalar "yangi" bo'lib bir yo'la kelib tushardi.
    */
    const active = fullSweep ? null : await activePatients(now);
    const users = active
      ? all.filter((u) => !u.results_notified || active.has(u.phone as string))
      : all;

    /*
      Admin referenslari hamma bemor uchun bir xil — bir marta o'qiladi.
      Ilgari har bemorda `prices` jadvali qaytadan skanerlanardi.
    */
    const references = users.length ? await loadAdminReferences() : [];

    let checked = 0;
    let sent = 0;
    for (const user of users) {
      checked++;
      try {
        sent += await notifyUser(user, request, references);
      } catch (err) {
        await logToAdmin(`notify-results/${user.telegram_id}`, err);
      }
    }

    return json({ ok: true, mode: fullSweep ? 'full' : 'recent', users: all.length, checked, sent });
  } catch (err) {
    await logToAdmin('notify-results', err);
    return error('Natija xabarlarini yuborishda xatolik', 500);
  }
};

export const config: Config = { schedule: '*/15 * * * *' };

const fmtDate = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
};

async function notifyUser(
  user: UserRow,
  request: Request,
  references: readonly ReferenceRow[],
): Promise<number> {
  const phone = user.phone as string;
  const groups = await loadResults(phone, references);
  // Faqat tayyor natijalar: bo'sh (kutilayotgan) hujjat keyin to'lganda xabar oladi.
  const ready = groups.filter((g) => g.status === 'ready');

  /*
    `baseline` — xabarsiz "berilgan" deb belgilanadigan hujjatlar,
    `fresh` — haqida xabar yuboriladiganlar.
    Birinchi marta ko'rilayotgan bemorda eski tarix jimgina belgilanadi,
    so'nggi kunlardagisi haqida xabar ketadi.
  */
  const firstTime = !user.results_notified;
  let fresh: typeof ready;
  let baseline: string[];
  if (firstTime) {
    const since = addDays(toTashkent(new Date()).dateKey, -NEW_PATIENT_DAYS);
    fresh = ready.filter((g) => g.date.slice(0, 10) >= since);
    baseline = ready.filter((g) => !fresh.includes(g)).map((g) => g.id);
  } else {
    const known = new Set(user.results_notified);
    fresh = ready.filter((g) => !known.has(g.id));
    baseline = [...known];
  }

  if (!fresh.length) {
    if (firstTime) await remember(user.telegram_id, baseline);
    return 0;
  }

  // Avval belgilaymiz, keyin yuboramiz — ikki marta xabar ketmasin.
  await remember(user.telegram_id, [...baseline, ...fresh.map((g) => g.id)]);

  const lang: Lang = isLang(user.lang) ? user.lang : 'uz';
  const delivered: string[] = [];

  try {
    if (fresh.length > MAX_SEPARATE) {
      await sendMessage(
        user.telegram_id,
        botText('result.ready.many', lang, {
          n: fresh.length,
          link: `${shareUrl(request, phone, fresh[0]!.id).split('/natija')[0]}/kabinet/tahlillar`,
        }),
      );
      return 1;
    }

    for (const group of fresh) {
      await sendMessage(
        user.telegram_id,
        botText('result.ready', lang, {
          title: group.title,
          date: fmtDate(group.date),
          link: shareUrl(request, phone, group.id),
        }),
      );
      delivered.push(group.id);
    }
    return delivered.length;
  } catch (err) {
    /*
      Xabar yetmadi: yetib bormagan natijalar "xabar berilgan" bo'lib
      qolmasin. Bemor botni bloklagan bo'lsa belgi qoladi — qayta
      urinish foydasiz.
    */
    if (isTransientTelegramError(err)) {
      /*
        Yangi bemorda hech narsa yetib bormagan bo'lsa ro'yxatning o'zi
        olib tashlanadi: u "birinchi marta ko'rilayotgan" bo'lib qoladi va
        tez yugurishning o'zida (har 15 daqiqada) qayta uriniladi.
        Aks holda — faqat yetib borganlar belgilanadi, qolgani tungi
        to'liq aylanishda yoki yaqin navbat bo'lsa tezroq yuboriladi.
      */
      const retry =
        firstTime && delivered.length === 0
          ? forget(user.telegram_id)
          : remember(user.telegram_id, [...baseline, ...delivered]);
      await retry.catch(() => undefined);
    }
    throw err;
  }
}

/** Ro'yxatni olib tashlaydi: bemor yana "birinchi marta ko'rilayotgan" bo'ladi. */
async function forget(telegramId: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression: 'REMOVE results_notified',
    }),
  );
}

/** Xabar berilgan hujjatlar ro'yxatini yozadi (oxirgi 500 tasi). */
async function remember(telegramId: string, ids: string[]): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression: 'SET results_notified = :ids',
      ExpressionAttributeValues: { ':ids': ids.slice(-NOTIFIED_CAP) },
    }),
  );
}
