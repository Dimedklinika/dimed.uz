import { purgeCache } from '@netlify/functions';
import { logToAdmin } from './telegram.ts';

/**
 * Netlify CDN keshi.
 *
 * Ommaviy javoblar (`/api/site-content`, `/media/...`) CDN'da saqlanadi —
 * bosh sahifa funksiya va bazani kutmasdan ochiladi. Admin biror narsani
 * o'zgartirganda shu teg bo'yicha kesh darhol tozalanadi (`purgeTags`),
 * shuning uchun kesh uzun bo'lsa ham sayt eskirib qolmaydi.
 *
 * Brauzer esa javobni o'zida saqlamaydi (`max-age=0`) — har safar CDN
 * dan so'raydi: admin o'zgarishni saqlab sahifani yangilasa, darhol
 * yangisini ko'radi.
 */
export const TAG_SITE_CONTENT = 'site-content';
export const TAG_MEDIA = 'media';

/**
 * CDN'da `cdnSeconds` saqlanadi va undan keyin ham bir kun eskisini
 * berib, orqada yangilanadi (`stale-while-revalidate`) — tozalash
 * qandaydir sabab bilan ishlamasa ham eng ko'pi `cdnSeconds` eskiradi.
 */
export function cdnCache(tags: string[], cdnSeconds: number, browserSeconds = 0): Record<string, string> {
  return {
    'cache-control': browserSeconds > 0 ? `public, max-age=${browserSeconds}` : 'public, max-age=0, must-revalidate',
    'netlify-cdn-cache-control': `public, durable, max-age=${cdnSeconds}, stale-while-revalidate=86400`,
    'netlify-cache-tag': tags.join(','),
  };
}

/**
 * Teg bo'yicha CDN keshini tozalaydi. Netlify'dan tashqarida (lokal,
 * testlar) kalit bo'lmaydi — jimgina o'tkazib yuboriladi. Xato admin
 * amalini to'xtatmaydi: ma'lumot saqlangan, kesh eng ko'pi bir necha
 * daqiqada o'zi yangilanadi.
 */
export async function purgeTags(tags: string[]): Promise<void> {
  if (!process.env.NETLIFY_PURGE_API_TOKEN && !process.env.SITE_ID) return;
  try {
    await purgeCache({ tags });
  } catch (err) {
    await logToAdmin('cache-purge', err);
  }
}
