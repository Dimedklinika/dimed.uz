import { DeleteCommand, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES, scanAllPages } from './db.ts';
import type { ImagePurpose } from './media.ts';

/**
 * Saytdagi almashtiriladigan rasm o'rinlari ("slot").
 *
 * Slot — sahifadagi bitta rasm joyi: banner, galereyadagi uch surat va
 * har bir shifokorning rasmi. Admin rasm yuklasa `site_media` ga
 * `slot -> Blobs kaliti` yoziladi; yozuv bo'lmasa repodagi standart rasm
 * ko'rinadi (`fallback`). Shuning uchun rasm almashtirish uchun kod
 * o'zgartirish ham, deploy ham kerak emas.
 *
 * Shifokor slotlari (`doctor-<id>`) `doctors` jadvalidagi ro'yxatdan
 * hosil bo'ladi — u jadval faqat o'qiladi, unga yozilmaydi.
 */
export type SlotDef = {
  id: string;
  /** Admin panelda ko'rinadigan nom. */
  label: string;
  group: 'banner' | 'gallery' | 'doctor';
  purpose: ImagePurpose;
  /** Yozuv bo'lmaganda ko'rsatiladigan repodagi rasm. */
  fallback: string;
  hint: string;
};

export const STATIC_SLOTS: SlotDef[] = [
  {
    id: 'banner',
    label: 'Banner — havola ulashilganda ko‘rinadigan muqova',
    group: 'banner',
    purpose: 'banner',
    fallback: '/images/og-cover.jpg',
    hint: 'Telegram/Facebook’da sayt havolasi tashlanganda chiqadi. 1200×630 ga qirqiladi.',
  },
  {
    id: 'gallery-building',
    label: 'Galereya — klinika binosi (katta surat)',
    group: 'gallery',
    purpose: 'gallery',
    fallback: '/images/klinika-bino.webp',
    hint: 'Bosh sahifa, «Bizda shunday» bo‘limi, chapdagi katta surat.',
  },
  {
    id: 'gallery-room',
    label: 'Galereya — statsionar palata',
    group: 'gallery',
    purpose: 'gallery',
    fallback: '/images/klinika-xona.webp',
    hint: 'O‘ng tomondagi yuqori surat.',
  },
  {
    id: 'gallery-lab',
    label: 'Galereya — laboratoriya',
    group: 'gallery',
    purpose: 'gallery',
    fallback: '/images/klinika-laboratoriya.webp',
    hint: 'O‘ng tomondagi pastki surat.',
  },
];

const DOCTOR_SLOT_RE = /^doctor-([a-z0-9-]{2,40})$/;

export const isSlotId = (id: unknown): id is string =>
  typeof id === 'string' && (STATIC_SLOTS.some((s) => s.id === id) || DOCTOR_SLOT_RE.test(id));

export const doctorSlot = (doctorId: string): string => `doctor-${doctorId}`;
export const doctorIdOfSlot = (slot: string): string | null => DOCTOR_SLOT_RE.exec(slot)?.[1] ?? null;

export type MediaRecord = {
  slot: string;
  key: string;
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
  updated_at: string;
};

export async function getSlot(slot: string): Promise<MediaRecord | null> {
  const found = await db.send(new GetCommand({ TableName: TABLES.siteMedia, Key: { slot } }));
  return (found.Item as MediaRecord | undefined) ?? null;
}

export async function listSlots(): Promise<MediaRecord[]> {
  return (await scanAllPages({ TableName: TABLES.siteMedia })) as MediaRecord[];
}

export async function putSlot(record: MediaRecord): Promise<void> {
  await db.send(new PutCommand({ TableName: TABLES.siteMedia, Item: record }));
}

export async function deleteSlot(slot: string): Promise<void> {
  await db.send(new DeleteCommand({ TableName: TABLES.siteMedia, Key: { slot } }));
}

type DoctorRow = { doctor_id: string; name?: string; job?: string; photo?: string; active?: boolean };

/** Asosiy shifokorlar (faqat o'qiladi) — admin panelda rasm o'rinlari ro'yxati uchun. */
export async function doctorSlots(): Promise<(SlotDef & { active: boolean })[]> {
  const { Items = [] } = await db.send(
    new ScanCommand({
      TableName: TABLES.doctors,
      ProjectionExpression: 'doctor_id, #n, job, photo, active',
      ExpressionAttributeNames: { '#n': 'name' },
    }),
  );
  return (Items as DoctorRow[])
    .map((d) => ({
      id: doctorSlot(d.doctor_id),
      label: `${d.name ?? d.doctor_id}${d.job ? ` — ${d.job}` : ''}`,
      group: 'doctor' as const,
      purpose: 'doctor' as const,
      fallback: d.photo && d.photo.startsWith('/') ? d.photo : '',
      hint: 'Bosh sahifadagi shifokor kartasi va navbat olish oynasi.',
      active: d.active !== false,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Slotning standart rasmi (yozuv bo'lmaganda). Shifokor uchun — `doctors.photo`. */
export async function fallbackFor(slot: string): Promise<string> {
  const fixed = STATIC_SLOTS.find((s) => s.id === slot);
  if (fixed) return fixed.fallback;
  const doctorId = doctorIdOfSlot(slot);
  if (!doctorId) return '';
  const found = await db.send(
    new GetCommand({ TableName: TABLES.doctors, Key: { doctor_id: doctorId }, ProjectionExpression: 'photo' }),
  );
  const photo = (found.Item as { photo?: string } | undefined)?.photo ?? '';
  return photo.startsWith('/') ? photo : '';
}

export function purposeOf(slot: string): ImagePurpose {
  return STATIC_SLOTS.find((s) => s.id === slot)?.purpose ?? 'doctor';
}
