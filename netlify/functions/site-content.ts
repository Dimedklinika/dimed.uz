import type { Context } from '@netlify/functions';
import { listVisitingDoctors, toPublicVisiting } from './lib/visiting.ts';
import { listSlots } from './lib/media-slots.ts';
import { cdnCache, TAG_SITE_CONTENT } from './lib/cache.ts';
import { isMissingTable } from './lib/aws-errors.ts';
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
    /*
      Har qism alohida: biri ishlamasa (jadval hali yaratilmagan, IAM ruxsati
      yo'q, baza vaqtincha yiqilgan) — bo'sh ro'yxat. Sahifa buzilmaydi:
      bo'lim jim yashirinadi, rasmlar repodagi standartlari bilan qoladi.
      Bunday javob CDN'da qisqa turadi — jadvallar yaratilgach tez tiklanadi.
    */
    let degraded = false;
    const safe = async <T>(part: string, load: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await load();
      } catch (err) {
        degraded = true;
        // Jadval yo'qligi — deploy tartibidagi kutilgan holat, log-botni to'ldirmaymiz.
        if (!isMissingTable(err)) await logToAdmin(`site-content/${part}`, err);
        return [];
      }
    };
    const [doctors, slots] = await Promise.all([
      safe('visiting', listVisitingDoctors),
      safe('media', listSlots),
    ]);

    const body: SiteContent = {
      visiting: doctors.filter((d) => d.active !== false).map((d) => toPublicVisiting(d)),
      media: Object.fromEntries(
        slots
          .filter((s) => s.url)
          .map((s) => [s.slot, { url: s.url, width: s.width, height: s.height }]),
      ),
    };

    return json(body, 200, cdnCache([TAG_SITE_CONTENT], degraded ? 60 : 300));
  } catch (err) {
    await logToAdmin('site-content', err);
    return error('Ma’lumotni olishda xatolik', 500);
  }
};
