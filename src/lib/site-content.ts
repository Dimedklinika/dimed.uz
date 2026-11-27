/**
 * `/api/site-content` — bosh sahifa va tashrif shifokorlari sahifasi uchun
 * bazadagi kontent (kartochkalar + admin almashtirgan rasmlar).
 *
 * Bitta sahifada bir marta so'raladi (va'da eslab qolinadi): bo'lim
 * kartochkalari, galereya va bron vidjeti bir xil javobdan foydalanadi.
 * Javob CDN'da keshlangan — odatda 50–100 ms.
 *
 * Xato bo'lsa (tarmoq, `astro dev` da funksiya yo'q) — null: sahifa
 * repodagi standart rasmlar bilan qoladi.
 */
import type { SiteContent } from './visiting';

let pending: Promise<SiteContent | null> | null = null;

export function loadSiteContent(force = false): Promise<SiteContent | null> {
  if (!pending || force) {
    pending = fetch('/api/site-content', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<SiteContent>) : null))
      .catch(() => null);
  }
  return pending;
}

/**
 * `<img data-media-slot="gallery-building">` kabi rasmlarni admin
 * yuklagan rasmga almashtiradi. Yozuv bo'lmasa standart rasm qoladi.
 */
export async function applyMediaOverrides(root: ParentNode = document): Promise<void> {
  const content = await loadSiteContent();
  if (!content) return;
  root.querySelectorAll<HTMLImageElement>('img[data-media-slot]').forEach((img) => {
    const media = content.media[img.dataset.mediaSlot ?? ''];
    if (media?.url && img.getAttribute('src') !== media.url) img.src = media.url;
  });
}
