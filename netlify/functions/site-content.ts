import type { Context } from '@netlify/functions';
import { listVisitingDoctors, toPublicVisiting } from './lib/visiting.ts';
import { listSlots } from './lib/media-slots.ts';
import { cdnCache, TAG_SITE_CONTENT } from './lib/cache.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import type { SiteContent } from '../../src/lib/visiting.ts';

/**
 * GET /api/site-content — bosh sahifa va «Tashrif buyuruvchi shifokorlar»
 * sahifasi uchun bitta so'rov: tashrif shifokorlari kartochkalari va admin
 * almashtirgan rasmlar (slot -> manzil).
 *
 * Javob Netlify CDN'da saqlanadi (5 daqiqa + orqada yangilash) va admin
 * biror narsani saqlaganda darhol tozalanadi (`site-content` tegi). Shu
 * sababli sahifa bazani kutmaydi: javob CDN'dan ~50 ms da keladi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return error('Faqat GET', 405);

  try {
    const [doctors, slots] = await Promise.all([
      listVisitingDoctors().catch((err) => {
        // Jadval hali yaratilmagan bo'lsa ham sahifa ishlasin (bo'lim ko'rinmaydi).
        if ((err as { name?: string })?.name === 'ResourceNotFoundException') return [];
        throw err;
      }),
      listSlots().catch((err) => {
        if ((err as { name?: string })?.name === 'ResourceNotFoundException') return [];
        throw err;
      }),
    ]);

    const body: SiteContent = {
      visiting: doctors.filter((d) => d.active !== false).map((d) => toPublicVisiting(d)),
      media: Object.fromEntries(
        slots
          .filter((s) => s.url)
          .map((s) => [s.slot, { url: s.url, width: s.width, height: s.height }]),
      ),
    };

    return json(body, 200, cdnCache([TAG_SITE_CONTENT], 300));
  } catch (err) {
    await logToAdmin('site-content', err);
    return error('Ma’lumotni olishda xatolik', 500);
  }
};
