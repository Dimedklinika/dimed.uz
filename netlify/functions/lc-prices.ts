import type { Context } from '@netlify/functions';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { checkLcKey } from './lib/api-key.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import type { PriceRow } from './prices.ts';

/**
 * POST /api/lc-prices — 1C narxlarni to'g'ridan-to'g'ri yuklaydi.
 *
 * Narxlar 1C da bir marta yuritiladi, saytga qo'lda ko'chirilmaydi: ikki joyda
 * ikki xil narx qolmasin. Sarlavha: `X-API-Key: <LC_API_KEY>`.
 *
 *   {
 *     "analyses": [{ "code": "00123", "title": "Umumiy qon tahlili",
 *                    "group": "Qon", "duration": "1 kun", "price": 45000,
 *                    "active": true }],
 *     "doctors":  [{ "id": "ashurov", "price": 80000 }]
 *   }
 *
 * - `analyses`: `code` bo'yicha qo'shiladi yoki yangilanadi. `group` va
 *   `duration` berilmasa saytdagi (admin kiritgan) qiymat saqlanadi.
 *   `active: false` — tahlil saytdan yashiriladi (o'chirilmaydi).
 * - `doctors`: faqat mavjud shifokorning qabul narxi yangilanadi (`id` — saytdagi
 *   shifokor id'si); topilmaganlari javobda `unknownDoctors` da qaytadi.
 *
 * Shu yo'l bilan yozilgan tahlil narxi keyingi sinxronizatsiyada yana 1C dagi
 * qiymatga qaytadi — admin paneldagi qo'lda o'zgarish vaqtinchalik.
 */
const MAX_PRICE = 100_000_000;
const MAX_ITEMS = 500;

type AnalysisIn = {
  code?: unknown;
  title?: unknown;
  group?: unknown;
  duration?: unknown;
  price?: unknown;
  active?: unknown;
};
type DoctorIn = { id?: unknown; price?: unknown };
type Body = { analyses?: AnalysisIn[]; doctors?: DoctorIn[] };

const text = (v: unknown, max = 120): string =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';

const validPrice = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PRICE;

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return error('Faqat POST', 405);
  const denied = checkLcKey(request);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') return error('JSON kerak');

    const analyses = body.analyses ?? [];
    const doctors = body.doctors ?? [];
    if (!Array.isArray(analyses) || !Array.isArray(doctors)) {
      return error('analyses va doctors ro‘yxat bo‘lishi kerak');
    }
    if (analyses.length + doctors.length === 0) return error('Yuklanadigan narx yo‘q');
    if (analyses.length > MAX_ITEMS || doctors.length > MAX_ITEMS) {
      return error(`Bir so‘rovda ${MAX_ITEMS} tadan ko‘p narx yuborib bo‘lmaydi`);
    }

    // Avval hammasi tekshiriladi — yarim yuklangan narx ro'yxati qolmasin.
    for (const [i, a] of analyses.entries()) {
      const code = text(a.code, 20);
      if (!code || !/^[\w.-]+$/.test(code)) return error(`analyses[${i}]: code noto‘g‘ri`);
      if (!text(a.title)) return error(`analyses[${i}]: title kerak`);
      if (!validPrice(a.price)) return error(`analyses[${i}]: price butun musbat son bo‘lishi kerak`);
    }
    for (const [i, d] of doctors.entries()) {
      if (!text(d.id, 40)) return error(`doctors[${i}]: id kerak`);
      if (!validPrice(d.price)) return error(`doctors[${i}]: price butun musbat son bo‘lishi kerak`);
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    for (const a of analyses) {
      const code = text(a.code, 20);
      const itemId = `analysis#${code}`;
      const existing = (
        await db.send(new GetCommand({ TableName: TABLES.prices, Key: { item_id: itemId } }))
      ).Item as PriceRow | undefined;

      const item: PriceRow & { source: string } = {
        item_id: itemId,
        kind: 'analysis',
        code,
        title: text(a.title),
        // 1C bermagan bo'lsa — saytda kiritilgan guruh/muddat qoladi.
        group: text(a.group) || existing?.group || '',
        duration: text(a.duration, 40) || existing?.duration || '',
        price: a.price as number,
        // `active` berilmasa mavjud holat saqlanadi (yangi tahlil — faol).
        active: typeof a.active === 'boolean' ? a.active : existing ? existing.active !== false : true,
        updated_at: now,
        source: '1c',
      };
      await db.send(new PutCommand({ TableName: TABLES.prices, Item: item }));
      if (existing) updated++;
      else created++;
    }

    const unknownDoctors: string[] = [];
    let doctorsUpdated = 0;
    for (const d of doctors) {
      const id = text(d.id, 40);
      try {
        await db.send(
          new UpdateCommand({
            TableName: TABLES.doctors,
            Key: { doctor_id: id },
            UpdateExpression: 'SET price = :p, updated_at = :u',
            ConditionExpression: 'attribute_exists(doctor_id)',
            ExpressionAttributeValues: { ':p': d.price, ':u': now },
          }),
        );
        doctorsUpdated++;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) unknownDoctors.push(id);
        else throw err;
      }
    }

    return json({ ok: true, created, updated, doctorsUpdated, unknownDoctors });
  } catch (err) {
    await logToAdmin('lc-prices', err);
    return error('Narxlarni saqlab bo‘lmadi', 500);
  }
};
