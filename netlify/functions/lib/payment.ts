import { randomUUID } from 'node:crypto';
import { optional } from './env.ts';

/**
 * To'lov tizimi adapteri — Payme (paycom.uz).
 *
 * Onlayn to'lov saytda ishlatilmaydi (B2): bemor navbatni band qiladi,
 * to'lov qabulxona kassasida. Payme integratsiya kodi saqlangan, lekin
 * global `PAYMENT_ENABLED` sozlamasi ortida o'chiq turadi (standart —
 * o'chiq). Kelajakda qaytarish: PAYMENT_ENABLED=1 va Payme kalitlari —
 * bron mantig'i o'zgarmaydi. Batafsil: docs/payme-integration.md
 */

export type PaymentMode = 'online' | 'at_clinic';

export type PaymentIntent = {
  paymentId: string;
  mode: PaymentMode;
  /** online rejimda — Payme to'lov sahifasi havolasi */
  redirectUrl?: string;
};

/** Onlayn to'lov yoqilganmi (global sozlama, standart — yo'q). */
export const paymentEnabled = (): boolean =>
  // PAYME_ENABLED — eski nom, moslik uchun qoldirilgan.
  optional('PAYMENT_ENABLED') === '1' || optional('PAYME_ENABLED') === '1';

export const paymentMode = (): PaymentMode =>
  paymentEnabled() && optional('PAYME_MERCHANT_ID') ? 'online' : 'at_clinic';

/** Payme summani tiyinda yuboradi va kutadi: 1 so'm = 100 tiyin. */
export const toTiyin = (som: number): number => Math.round(som * 100);

export async function createPayment(input: {
  amount: number;
  appointmentKey: string;
  phone: string;
  /**
   * Faqat administrator sinov uchun: onlayn to'lov yoqilgan bo'lsa ham
   * Payme'ga o'tmasdan bron darhol kuchga kiradi (`at_clinic` rejimi).
   * Chaqiruvchi ruxsatni o'zi tekshiradi (book.ts — `isAdmin`).
   */
  skipOnline?: boolean;
}): Promise<PaymentIntent> {
  const paymentId = randomUUID();

  if (input.skipOnline || paymentMode() === 'at_clinic') {
    return { paymentId, mode: 'at_clinic' };
  }

  /*
    Payme checkout havolasi: base64 ichida kassa ID (m), hisob (ac.*)
    va summa tiyinda (a). Kassa sozlamalarida hisob maydoni nomi
    "order_id" bo'lishi shart — webhook ham shu nom bilan qidiradi.
  */
  const params = [
    `m=${optional('PAYME_MERCHANT_ID')}`,
    `ac.order_id=${paymentId}`,
    `a=${toTiyin(input.amount)}`,
  ].join(';');

  return {
    paymentId,
    mode: 'online',
    redirectUrl: `https://checkout.paycom.uz/${Buffer.from(params).toString('base64')}`,
  };
}
