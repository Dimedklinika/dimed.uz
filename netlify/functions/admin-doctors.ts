import type { Context } from '@netlify/functions';
import { ScanCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, isAdmin, type DoctorRecord } from './lib/auth.ts';
import {
  checkShifts,
  isAllowedSlotMinutes,
  ALLOWED_SLOT_MINUTES,
  DEFAULT_SLOT_MINUTES,
} from './lib/schedule.ts';
import { logToAdmin } from './lib/telegram.ts';
import { AGE_GROUPS, isAgeGroup, toAgeGroup } from './lib/age.ts';
import { formatServices, parseServices } from './lib/services.ts';
import { json, error, normalizePhone } from './lib/http.ts';

/**
 * Klinika egasi uchun shifokorlarni boshqarish.
 *
 *   GET    /api/admin-doctors           — barcha shifokorlar (faolsizlari ham)
 *   POST   /api/admin-doctors {doctor}  — qo'shish yoki tahrirlash (upsert)
 *   DELETE /api/admin-doctors {id}      — faolsizlantirish (o'chirish)
 *
 * Faqat `ADMIN_TELEGRAM_IDS` ro'yxatidagi Telegram hisobiga ochiq.
 */

/** src/data/departments.ts bilan bir xil bo'lishi kerak. */
const DEPARTMENTS = ['pediatriya', 'terapiya', 'ginekologiya', 'nevrologiya', 'lor', 'fizio'];

export default async (request: Request, _context: Context): Promise<Response> => {
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  // 403 javobida joriy Telegram ID qaytariladi — egasi uni
  // ADMIN_TELEGRAM_IDS ga qo'shishi uchun (o'z ID sini bilib oladi).
  if (!isAdmin(session)) {
    return json({ error: 'Bu bo‘lim faqat administrator uchun', telegramId: session.userId }, 403);
  }

  try {
    if (request.method === 'GET') return await listDoctors();
    if (request.method === 'POST') return await upsertDoctor((await request.json()) as DoctorInput);
    if (request.method === 'DELETE') {
      return await deactivateDoctor((await request.json()) as { id?: string; active?: boolean });
    }
    return error('Faqat GET, POST yoki DELETE', 405);
  } catch (err) {
    await logToAdmin('admin-doctors', err);
    return error('Shifokorlarni boshqarishda xatolik', 500);
  }
};

async function listDoctors(): Promise<Response> {
  const { Items = [] } = await db.send(new ScanCommand({ TableName: TABLES.doctors }));

  const list = (Items as DoctorRecord[])
    .map((d) => ({
      id: d.doctor_id,
      name: d.name,
      job: d.job,
      deptId: d.dept_id,
      price: d.price,
      slotMinutes: d.slot_minutes,
      workdays: d.workdays ?? [],
      shifts: d.shifts ?? [],
      experience: d.experience ?? '',
      photo: d.photo ?? '',
      hours: d.hours ?? '',
      phone: d.phone ?? '',
      active: d.active !== false,
      ageGroup: toAgeGroup(d.age_group),
      // Qo'shimcha xizmatlar tahrirlash uchun matn ko'rinishida (qator = xizmat).
      servicesText: formatServices(d.services),
      // Raqamning o'zi emas, faqat bog'langan-yo'qligi ko'rsatiladi.
      telegramId: d.telegram_id ?? '',
      linked: Boolean(d.telegram_id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({ doctors: list, departments: DEPARTMENTS }, 200, {
    'cache-control': 'private, no-store',
  });
}

type DoctorInput = {
  id?: string;
  name?: string;
  job?: string;
  deptId?: string;
  price?: number;
  slotMinutes?: number;
  workdays?: number[];
  shifts?: { start: string; end: string }[];
  experience?: string;
  photo?: string;
  hours?: string;
  phone?: string;
  telegramId?: string;
  active?: boolean;
  ageGroup?: string;
  /** Qo'shimcha xizmatlar: har qatorda "Nomi | narx | 1C kodi | qayta:N" (lib/services.ts). */
  servicesText?: string;
};

const slugOk = (s: string) => /^[a-z0-9-]{2,40}$/.test(s);

async function upsertDoctor(body: DoctorInput): Promise<Response> {
  const id = String(body.id ?? '').trim();
  if (!slugOk(id)) {
    return error('id kichik lotin harflari, raqam va chiziqchadan iborat bo‘lsin (masalan: ashurov)');
  }

  const name = String(body.name ?? '').trim();
  const job = String(body.job ?? '').trim();
  if (!name) return error('Ism kerak');
  if (!job) return error('Lavozim kerak');

  const deptId = String(body.deptId ?? '').trim();
  if (!DEPARTMENTS.includes(deptId)) {
    return error(`Bo‘lim noto‘g‘ri. Mumkin: ${DEPARTMENTS.join(', ')}`);
  }

  if (typeof body.price !== 'number' || !Number.isInteger(body.price) || body.price < 0 || body.price > 100_000_000) {
    return error('Narx butun musbat son bo‘lishi kerak');
  }

  // Berilmasa — standart (60 daqiqa); berilsa ro'yxatdan biri bo'lishi shart.
  const slotMinutes = body.slotMinutes ?? DEFAULT_SLOT_MINUTES;
  if (!isAllowedSlotMinutes(slotMinutes)) {
    return error(`Qabul davomiyligi ${ALLOWED_SLOT_MINUTES.join(', ')} daqiqadan biri bo‘lishi kerak`);
  }

  if (!Array.isArray(body.workdays) || body.workdays.length === 0) {
    return error('Kamida bitta ish kuni belgilang');
  }
  const workdays = [...new Set(body.workdays)].sort((a, b) => a - b);
  if (!workdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return error('Ish kunlari 0 (yakshanba) dan 6 (shanba) gacha bo‘lishi kerak');
  }

  const checked = checkShifts(body.shifts);
  if (!checked.ok) return error(checked.message);

  // Yosh cheklovi berilmasa — cheklovsiz (avvalgi yozuvlar shunday).
  if (body.ageGroup !== undefined && !isAgeGroup(body.ageGroup)) {
    return error(`Yosh cheklovi ${AGE_GROUPS.join(', ')} dan biri bo‘lishi kerak`);
  }
  const ageGroup = toAgeGroup(body.ageGroup);

  // --- yozuvni yig'amiz: telegram_id alohida (bog'lanishni ehtiyot qilamiz) ---
  const now = new Date().toISOString();
  const sets: string[] = [
    '#name = :name',
    'job = :job',
    'dept_id = :dept',
    'price = :price',
    'slot_minutes = :slot',
    'workdays = :workdays',
    'shifts = :shifts',
    'experience = :exp',
    'photo = :photo',
    'hours = :hours',
    'phone = :phone',
    'active = :active',
    'age_group = :ageGroup',
    'updated_at = :updated',
  ];
  const values: Record<string, unknown> = {
    ':name': name,
    ':job': job,
    ':dept': deptId,
    ':price': body.price,
    ':slot': slotMinutes,
    ':workdays': workdays,
    ':shifts': checked.shifts,
    ':exp': String(body.experience ?? '').trim(),
    ':photo': String(body.photo ?? '').trim(),
    ':hours': String(body.hours ?? '').trim(),
    ':phone': body.phone ? normalizePhone(String(body.phone)) : '',
    ':active': body.active !== false,
    ':ageGroup': ageGroup,
    ':updated': now,
  };
  const removes: string[] = [];

  /*
    Xizmatlar: faqat "servicesText" kaliti kelganda o'zgaradi (eski mijoz
    yubormasa mavjudlari saqlanadi). Bo'sh matn — barcha xizmatlarni olib
    tashlaydi: shifokor yana faqat asosiy qabul bilan qoladi.
  */
  if (Object.prototype.hasOwnProperty.call(body, 'servicesText')) {
    const parsed = parseServices(body.servicesText);
    if (!parsed.ok) return error(parsed.error);
    if (parsed.services.length) {
      sets.push('services = :services');
      values[':services'] = parsed.services;
    } else {
      removes.push('services');
    }
  }

  // --- Telegram bog'lash: faqat "telegramId" kaliti kelganda o'zgaradi ---
  if (Object.prototype.hasOwnProperty.call(body, 'telegramId')) {
    const tg = String(body.telegramId ?? '').replace(/\D/g, '');
    if (tg) {
      // Bitta Telegram hisob ikki shifokorga biriktirilmasin.
      const { Items = [] } = await db.send(
        new QueryCommand({
          TableName: TABLES.doctors,
          IndexName: 'telegram-index',
          KeyConditionExpression: 'telegram_id = :t',
          ExpressionAttributeValues: { ':t': tg },
        }),
      );
      const other = (Items as DoctorRecord[]).find((d) => d.doctor_id !== id);
      if (other) return error(`Bu Telegram hisob allaqachon "${other.doctor_id}" ga bog‘langan`);

      sets.push('telegram_id = :tg');
      values[':tg'] = tg;
    } else {
      // Bo'sh qiymat — bog'lanishni uzamiz.
      removes.push('telegram_id');
    }
  }

  let expr = `SET ${sets.join(', ')}`;
  if (removes.length) expr += ` REMOVE ${removes.join(', ')}`;

  await db.send(
    new UpdateCommand({
      TableName: TABLES.doctors,
      Key: { doctor_id: id },
      UpdateExpression: expr,
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: values,
    }),
  );

  return json({ ok: true, id });
}

async function deactivateDoctor(body: { id?: string; active?: boolean }): Promise<Response> {
  const id = String(body.id ?? '').trim();
  if (!id) return error('id kerak');

  // O'chirish — o'rniga faolsizlantirish: navbatlar tarixi va bog'lanish
  // saqlanadi, kerak bo'lsa qayta faollashtirish mumkin (active: true).
  const active = body.active === true;

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.doctors,
        Key: { doctor_id: id },
        UpdateExpression: 'SET active = :a, updated_at = :u',
        // Faqat mavjud shifokorni o'zgartiramiz.
        ConditionExpression: 'attribute_exists(doctor_id)',
        ExpressionAttributeValues: { ':a': active, ':u': new Date().toISOString() },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return error('Bunday shifokor yo‘q', 404);
    throw err;
  }

  return json({ ok: true, id, active });
}
