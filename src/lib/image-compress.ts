/**
 * Rasmni yuborishdan oldin brauzerda kichraytirish.
 *
 * Telefon kamerasidagi surat 4–12 MB bo'ladi — uni shundayligicha
 * yuborish sekin va Netlify funksiyasi chegarasidan (≈6 MB) oshadi.
 * Shuning uchun rasm shu yerda kerakli o'lchamga keltiriladi va WebP
 * (brauzer WebP yarata olmasa — JPEG) qilinadi. Server keyin uni yana
 * tekshirib, yakuniy siqishni o'zi bajaradi (`netlify/functions/lib/media.ts`).
 */
export type CompressTarget = 'doctor' | 'gallery' | 'banner';

const LIMITS: Record<CompressTarget, { max: number; crop?: [number, number] }> = {
  doctor: { max: 1000 },
  gallery: { max: 1800 },
  banner: { max: 1200, crop: [1200, 630] },
};

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Eski brauzerlar: <img> orqali.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(file: Blob, target: CompressTarget): Promise<Blob> {
  const source = await decode(file).catch(() => {
    throw new Error('Rasmni ochib bo‘lmadi — JPEG, PNG yoki WebP fayl tanlang');
  });
  const sw = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sh = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!sw || !sh) throw new Error('Rasmni ochib bo‘lmadi');

  const { max, crop } = LIMITS[target];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Brauzer rasmni qayta ishlay olmadi');

  if (crop) {
    // Markazdan kerakli nisbatda qirqiladi (banner 1200×630).
    const [cw, ch] = crop;
    const scale = Math.max(cw / sw, ch / sh);
    const w = cw / scale;
    const h = ch / scale;
    canvas.width = cw;
    canvas.height = ch;
    ctx.drawImage(source, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, cw, ch);
  } else {
    const scale = Math.min(1, max / Math.max(sw, sh));
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  if ('close' in source) source.close();

  const webp = await toBlob(canvas, 'image/webp', 0.9);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.9);
  if (!jpeg) throw new Error('Rasmni siqib bo‘lmadi');
  return jpeg;
}
