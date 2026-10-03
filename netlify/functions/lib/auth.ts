import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { toAgeGroup, type AgeGroup } from './age.ts';
import { db, TABLES } from './db.ts';
import { optional } from './env.ts';
import { readSession, type Session } from './session.ts';
import { toPublicServices, type DoctorService, type PublicService } from './services.ts';
import type { Shift } from './slots.ts';

export type DoctorRecord = {
  doctor_id: string;
  name: string;
  job: string;
  dept_id: string;
  telegram_id?: string;
  slot_minutes: number;
  shifts: Shift[];
  workdays: number[];
  price: number;
  active?: boolean;
  experience?: string;
  photo?: string;
  hours?: string;
  phone?: string;
  /** Bemor baholari yig'indisi va soni (G2) — o'rtacha shulardan chiqadi. */
  rating_sum?: number;
  rating_count?: number;
  /** Yosh cheklovi: 'all' | 'adult' (16+) | 'child' (16 gacha). */
  age_group?: string;
  /** Qo'shimcha xizmatlar (massaj, UZI, qayta ko'rik ...); asosiy qabul — `price`. */
  services?: DoctorService[];
};

/** Saytga (bron vidjeti, jamoa) ko'rsatiladigan shifokor shakli. */
export type PublicDoctor = {
  id: string;
  name: string;
  job: string;
  deptId: string;
  experience: string;
  photo: string;
  hours: string;
  shifts: Shift[];
  slotMinutes: number;
  workdays: number[];
  price: number;
  /** O'rtacha baho (1 kasr) va baholar soni; baho bo'lmasa null / 0. */
  ratingAvg: number | null;
  ratingCount: number;
  /** Yosh cheklovi — bron vidjeti bemorni shunga qarab filtrlaydi. */
  ageGroup: AgeGroup;
  /** Qo'shimcha xizmatlar; bo'sh bo'lsa vidjet xizmat tanlovini ko'rsatmaydi. */
  services: PublicService[];
};

/** Ko'rinadigan (yashirilmagan) baholar bo'yicha o'rtacha. */
export function ratingOf(d: Pick<DoctorRecord, 'rating_sum' | 'rating_count'>): {
  ratingAvg: number | null;
  ratingCount: number;
} {
  const count = Math.max(0, Math.round(d.rating_count ?? 0));
  const sum = d.rating_sum ?? 0;
  return {
    ratingAvg: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
    ratingCount: count,
  };
}

/** Bazadagi yozuvni saytdagi shaklga o'giradi (telegram_id chiqmaydi). */
export const toPublicDoctor = (d: DoctorRecord): PublicDoctor => ({
  id: d.doctor_id,
  name: d.name,
  job: d.job,
  deptId: d.dept_id,
  experience: d.experience ?? '',
  photo: d.photo ?? '',
  hours: d.hours ?? '',
  shifts: d.shifts,
  slotMinutes: d.slot_minutes,
  workdays: d.workdays,
  price: d.price,
  ageGroup: toAgeGroup(d.age_group),
  services: toPublicServices(d.services),
  ...ratingOf(d),
});

/**
 * Sessiya egasi admin (klinika egasi)mi? `ADMIN_TELEGRAM_IDS`
 * (vergul bilan ajratilgan telegram_id ro'yxati) bo'yicha aniqlanadi.
 * Ro'yxat bo'sh bo'lsa hech kim admin emas — panel yopiq turadi.
 */
export function isAdmin(session: Session | null): boolean {
  if (!session) return false;
  const ids = optional('ADMIN_TELEGRAM_IDS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(String(session.userId));
}

/** Cookie'dagi sessiya. Yo'q bo'lsa null. */
export const sessionFrom = (request: Request): Session | null =>
  readSession(request.headers.get('cookie') ?? undefined);

export async function getDoctor(doctorId: string): Promise<DoctorRecord | null> {
  const found = await db.send(
    new GetCommand({ TableName: TABLES.doctors, Key: { doctor_id: doctorId } }),
  );
  return (found.Item as DoctorRecord | undefined) ?? null;
}

/**
 * Sessiya egasi shifokormi? Shifokorlar ham bemorlar kabi Telegram
 * orqali kiradi — farqi shundaki, ularning telegram_id si Doctors
 * jadvalida bog'langan bo'ladi.
 */
export async function doctorFor(session: Session): Promise<DoctorRecord | null> {
  const found = await db.send(
    new QueryCommand({
      TableName: TABLES.doctors,
      IndexName: 'telegram-index',
      KeyConditionExpression: 'telegram_id = :t',
      ExpressionAttributeValues: { ':t': session.userId },
      Limit: 1,
    }),
  );
  return (found.Items?.[0] as DoctorRecord | undefined) ?? null;
}
