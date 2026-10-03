import { optional } from './env.ts';

const PRODUCTION_ORIGIN = 'https://dimed.uz';

/**
 * Sayt manzili: SITE_URL sozlamasi, bo'lmasa so'rov kelgan manzil.
 *
 * So'rov Netlify'ning vaqtinchalik manzilidan (`<id>.netlify.app`)
 * kelgan bo'lsa — cron shunday chaqiriladi — bemorga o'sha manzil
 * emas, asosiy sayt manzili beriladi: aks holda natija havolasi
 * eskirgan deploy'ga olib boradi va xabarda begona domen ko'rinadi.
 */
export const siteOrigin = (request?: Request): string => {
  const configured = optional('SITE_URL').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (!request) return PRODUCTION_ORIGIN;

  const origin = new URL(request.url);
  return origin.hostname.endsWith('.netlify.app') ? PRODUCTION_ORIGIN : origin.origin;
};
