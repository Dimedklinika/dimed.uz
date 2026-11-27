import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';

/**
 * Rasmlar — Netlify Blobs'da.
 *
 * Fayl o'zi Blobs'da yotadi (`dimed-media` ombori), DynamoDB'da esa faqat
 * havola va o'lchamlar (`site_media`, `visiting_doctors.photo_*`). Sayt
 * rasmni `/media/u/<kalit>` manzilidan oladi (`netlify/functions/media.ts`).
 *
 * Har yuklangan fayl yangi, takrorlanmaydigan kalit oladi — shuning uchun
 * bu manzil hech qachon o'zgarmaydi va brauzer hamda CDN uni bir yilga
 * saqlaydi. Rasm almashtirilsa — yangi kalit, eskisi o'chiriladi.
 *
 * Testlarda (`DIMED_MEDIA_MEMORY=1`) xotiradagi ombor ishlatiladi.
 */
export const MEDIA_STORE = 'dimed-media';

export type MediaMeta = {
  contentType: string;
  width: number;
  height: number;
  size: number;
  purpose: ImagePurpose;
  uploadedAt: string;
};

export type StoredImage = { data: ArrayBuffer; meta: MediaMeta };

interface Store {
  put(key: string, data: Uint8Array, meta: MediaMeta): Promise<void>;
  get(key: string): Promise<StoredImage | null>;
  remove(key: string): Promise<void>;
}

/** Testlar uchun: global xarita (test fayli ichini ko'ra olsin). */
const memory: Map<string, StoredImage> = ((globalThis as { __dimedMedia?: Map<string, StoredImage> }).__dimedMedia ??=
  new Map());

const memoryStore: Store = {
  async put(key, data, meta) {
    memory.set(key, { data: data.slice().buffer as ArrayBuffer, meta });
  },
  async get(key) {
    return memory.get(key) ?? null;
  },
  async remove(key) {
    memory.delete(key);
  },
};

function blobStore(): Store {
  // `strong` — yangi yuklangan rasm darhol o'qilsin (aks holda bir daqiqagacha 404).
  const store = getStore({ name: MEDIA_STORE, consistency: 'strong' });
  return {
    async put(key, data, meta) {
      await store.set(key, data.slice().buffer as ArrayBuffer, { metadata: meta });
    },
    async get(key) {
      const found = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!found) return null;
      return { data: found.data, meta: found.metadata as unknown as MediaMeta };
    },
    async remove(key) {
      await store.delete(key);
    },
  };
}

export const mediaStore = (): Store => (process.env.DIMED_MEDIA_MEMORY === '1' ? memoryStore : blobStore());

/** Kalit shakli: `u/2026-11/9f2c4a1b7e3d5c60.webp` */
const KEY_RE = /^u\/\d{4}-\d{2}\/[a-f0-9]{16}\.(webp|jpg|png)$/;
export const isMediaKey = (key: unknown): key is string => typeof key === 'string' && KEY_RE.test(key);
export const mediaUrl = (key: string): string => `/media/${key}`;
/** `/media/u/...` manzilidan kalitni ajratadi; boshqa manzil bo'lsa null. */
export const keyFromUrl = (url: unknown): string | null => {
  if (typeof url !== 'string' || !url.startsWith('/media/')) return null;
  const key = url.slice('/media/'.length);
  return isMediaKey(key) ? key : null;
};

export function newMediaKey(ext: 'webp' | 'jpg' | 'png', now = new Date()): string {
  const month = now.toISOString().slice(0, 7);
  return `u/${month}/${randomBytes(8).toString('hex')}.${ext}`;
}

/* ---------------- rasmni tekshirish va siqish ---------------- */

/**
 * Rasm nima uchun: o'lcham va format shunga qarab tanlanadi.
 *  - doctor  — shifokor rasmi, 800px gacha, WebP
 *  - gallery — klinika suratlari, 1600px gacha, WebP
 *  - banner  — ulashish muqovasi (og:image), 1200×630 qirqiladi, JPEG:
 *              Telegram, WhatsApp va Facebook havola ko'rinishida JPEG'ni
 *              har doim tushunadi, WebP'ni esa hammasi emas.
 */
export type ImagePurpose = 'doctor' | 'gallery' | 'banner';
export const IMAGE_PURPOSES: readonly ImagePurpose[] = ['doctor', 'gallery', 'banner'];

/** Yuklanadigan fayl chegarasi. Brauzer rasmni avval o'zi kichraytiradi (odatda 200–600 KB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type Format = 'jpeg' | 'png' | 'webp';

export function sniffFormat(b: Uint8Array): Format | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** sharp bo'lmagan holat uchun: fayl sarlavhasidan eni va bo'yini o'qiydi. */
export function readDimensions(b: Uint8Array): { width: number; height: number } | null {
  const fmt = sniffFormat(b);
  const u16be = (i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
  const u16le = (i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
  const u24le = (i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
  const u32be = (i: number) => (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;

  if (fmt === 'png') return { width: u32be(16), height: u32be(20) };

  if (fmt === 'webp') {
    const chunk = String.fromCharCode(...b.subarray(12, 16));
    if (chunk === 'VP8X') return { width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  if (fmt === 'jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1] ?? 0;
      // SOF0..SOF15 (DHT=C4, JPG=C8, DAC=CC emas) — o'lcham shu yerda.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: u16be(i + 5), width: u16be(i + 7) };
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

type Processed = { data: Uint8Array; ext: 'webp' | 'jpg' | 'png'; contentType: string; width: number; height: number };

type SharpModule = typeof import('sharp');
let sharpLoader: Promise<SharpModule | null> | null = null;

/**
 * sharp — native kutubxona. Netlify'da ishlaydi (`external_node_modules`),
 * lekin yuklanmay qolsa ham rasm yuklash to'xtamasin: brauzer rasmni
 * allaqachon kichraytirib WebP qilib yuborgan, server uni tekshirib
 * o'zgarishsiz saqlaydi.
 */
function loadSharp(): Promise<SharpModule | null> {
  if (process.env.DIMED_NO_SHARP === '1') return Promise.resolve(null);
  sharpLoader ??= import('sharp')
    .then((m) => ((m as unknown as { default?: SharpModule }).default ?? m) as SharpModule)
    .catch(() => null);
  return sharpLoader;
}

export type ProcessResult = { ok: true; image: Processed } | { ok: false; error: string };

/**
 * Yuklangan faylni tekshiradi va siqadi: EXIF bo'yicha buradi, metama'lumotni
 * (jumladan GPS) olib tashlaydi, o'lchamini kichraytiradi va WebP'ga
 * (banner — JPEG'ga) o'giradi.
 */
export async function processImage(input: Uint8Array, purpose: ImagePurpose): Promise<ProcessResult> {
  if (input.length === 0) return { ok: false, error: 'Fayl bo‘sh' };
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'Rasm juda katta (4 MB dan oshmasin)' };
  const format = sniffFormat(input);
  if (!format) return { ok: false, error: 'Faqat JPEG, PNG yoki WebP rasm yuklang' };

  const sharp = await loadSharp();
  if (sharp) {
    try {
      let pipeline = sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
      if (purpose === 'banner') {
        pipeline = pipeline.resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true });
      } else {
        const max = purpose === 'doctor' ? 800 : 1600;
        pipeline = pipeline
          .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: purpose === 'doctor' ? 80 : 78, effort: 4 });
      }
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      return {
        ok: true,
        image: {
          data: new Uint8Array(data),
          ext: purpose === 'banner' ? 'jpg' : 'webp',
          contentType: purpose === 'banner' ? 'image/jpeg' : 'image/webp',
          width: info.width,
          height: info.height,
        },
      };
    } catch {
      return { ok: false, error: 'Rasmni o‘qib bo‘lmadi — fayl buzilgan bo‘lishi mumkin' };
    }
  }

  // sharp yo'q: brauzer siqqan faylni o'zgarishsiz saqlaymiz.
  const dims = readDimensions(input);
  if (!dims || dims.width < 1 || dims.height < 1) {
    return { ok: false, error: 'Rasmni o‘qib bo‘lmadi — fayl buzilgan bo‘lishi mumkin' };
  }
  const ext = format === 'jpeg' ? 'jpg' : format;
  return {
    ok: true,
    image: { data: input, ext, contentType: `image/${format}`, ...dims },
  };
}

/** Rasmni qayta ishlab omborga yozadi. */
export async function saveImage(
  input: Uint8Array,
  purpose: ImagePurpose,
): Promise<{ ok: true; key: string; url: string; meta: MediaMeta } | { ok: false; error: string }> {
  const processed = await processImage(input, purpose);
  if (!processed.ok) return processed;
  const { image } = processed;
  const key = newMediaKey(image.ext);
  const meta: MediaMeta = {
    contentType: image.contentType,
    width: image.width,
    height: image.height,
    size: image.data.length,
    purpose,
    uploadedAt: new Date().toISOString(),
  };
  await mediaStore().put(key, image.data, meta);
  return { ok: true, key, url: mediaUrl(key), meta };
}

/** Eski faylni o'chirish — xato bo'lsa ham asosiy amal to'xtamaydi. */
export async function removeImage(key: string | undefined | null): Promise<void> {
  if (!key || !isMediaKey(key)) return;
  try {
    await mediaStore().remove(key);
  } catch (err) {
    console.error('[media] eski rasmni o‘chirib bo‘lmadi', key, err);
  }
}
