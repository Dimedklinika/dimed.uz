import type { Context } from '@netlify/functions';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { toPublicDoctor, type DoctorRecord } from './lib/auth.ts';
import { logToAdmin } from './lib/telegram.ts';
import { paymentMode } from './lib/payment.ts';
import { json, error } from './lib/http.ts';

/**
 * GET /api/doctors — saytdagi faol shifokorlar ro'yxati.
 *
 * Bron vidjeti shu ro'yxatga tayanadi: admin panelda shifokor
 * qo'shilsa yoki o'chirilsa, sahifa qayta yig'ilmasdan ko'rinadi.
 * Shifokorlar kam (~10 ta), shuning uchun Scan yetarli.
 *
 * `x-payment-mode` sarlavhasi (`online` | `at_clinic`) — vidjet
 * tasdiqlash qadamida "kassaga to'laysiz" yoki "Payme orqali to'laysiz"
 * deb yozishi uchun. Javob tanasi massivligicha qoladi (admin sahifalari
 * ham shu ro'yxatni o'qiydi).
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET') return error('Faqat GET', 405);

  try {
    const { Items = [] } = await db.send(new ScanCommand({ TableName: TABLES.doctors }));

    const list = (Items as DoctorRecord[])
      .filter((d) => d.active !== false)
      .map(toPublicDoctor)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Qisqa kesh: yangi shifokor deyarli darhol ko'rinsin, lekin har
    // bosishda Scan bo'lmasin.
    return json(list, 200, { 'cache-control': 'public, max-age=60', 'x-payment-mode': paymentMode() });
  } catch (err) {
    await logToAdmin('doctors', err);
    return error('Shifokorlarni olishda xatolik', 500);
  }
};
