import type { Config, Context } from '@netlify/functions';
import { isMediaKey, mediaStore } from './lib/media.ts';
import { fallbackFor, getSlot, isSlotId } from './lib/media-slots.ts';
import { cdnCache, TAG_MEDIA } from './lib/cache.ts';
import { logToAdmin } from './lib/telegram.ts';

/**
 * Rasmlarni beradi (Netlify Blobs'dan).
 *
 *   GET /media/u/<kalit>   — yuklangan fayl. Kalit takrorlanmaydi, shuning
 *                            uchun brauzer va CDN uni bir yilga saqlaydi.
 *   GET /media/slot/<slot> — slotning hozirgi rasmi (masalan `banner` —
 *                            og:image uchun: messenjerlar JS ishlatmaydi).
 *                            Admin almashtirmagan bo'lsa repodagi standart
 *                            rasmga yo'naltiradi. CDN'da saqlanadi va rasm
 *                            almashtirilganda `media` tegi bilan tozalanadi.
 */
export const config: Config = { path: '/media/*' };

const notFound = () =>
  new Response('Topilmadi', { status: 404, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });

const imageResponse = (data: ArrayBuffer, contentType: string, cache: Record<string, string>, head: boolean) =>
  new Response(head ? null : data, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-length': String(data.byteLength),
      'x-content-type-options': 'nosniff',
      ...cache,
    },
  });

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Faqat GET', { status: 405 });
  }
  const head = request.method === 'HEAD';
  const path = new URL(request.url).pathname;
  const rest = path.slice(path.lastIndexOf('/media/') + '/media/'.length);

  try {
    if (rest.startsWith('u/')) {
      if (!isMediaKey(rest)) return notFound();
      const found = await mediaStore().get(rest);
      if (!found) return notFound();
      return imageResponse(found.data, found.meta.contentType || 'image/webp', {
        'cache-control': 'public, max-age=31536000, immutable',
      }, head);
    }

    if (rest.startsWith('slot/')) {
      const slot = rest.slice('slot/'.length);
      if (!isSlotId(slot)) return notFound();
      const cache = cdnCache([TAG_MEDIA, `media-${slot}`], 3600, 300);

      const record = await getSlot(slot).catch(() => null);
      if (record?.key && isMediaKey(record.key)) {
        const found = await mediaStore().get(record.key);
        if (found) return imageResponse(found.data, found.meta.contentType || 'image/webp', cache, head);
      }

      const fallback = await fallbackFor(slot).catch(() => '');
      if (!fallback) return notFound();
      return new Response(null, { status: 302, headers: { location: fallback, ...cache } });
    }

    return notFound();
  } catch (err) {
    await logToAdmin('media', err);
    return new Response('Xatolik', { status: 500, headers: { 'cache-control': 'no-store' } });
  }
};
