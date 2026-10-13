import type { Context } from '@netlify/functions';
import { sessionFrom } from './lib/auth.ts';
import {
  listPatients,
  addLocalPatient,
  selectPatient,
  setPatientBirthDate,
  editLocalPatient,
  removeLocalPatient,
  checkBirthDate,
} from './lib/patients.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';
import { hitLimit, tooMany } from './lib/rate-limit.ts';

/**
 * /api/patients — telefonga bog'langan bemorlar.
 *
 * Bir raqamdan butun oila foydalanadi: ota-ona bolasini o'z telefoni
 * bilan yozdiradi. Shuning uchun kirishda ham, navbat olishda ham
 * "kim uchun" degan savol bo'ladi.
 *
 * GET  — ro'yxat va tanlab qo'yilgani (har birida birthDate)
 * POST — { action: "select", id } yoki
 *        { action: "add", firstName, lastName, patronymic?, birthDate } yoki
 *        { action: "birthDate", id, birthDate } — mavjud bemorga sana
 *        { action: "edit", id, firstName, lastName, patronymic?, birthDate } —
 *          saytda qo'shilgan odamning ma'lumotini tuzatish
 *        { action: "remove", id } — saytda xato qo'shilgan odamni olib tashlash
 */
/** Bir hisobdan bir soatda shuncha so'rov — «bolg'alash»ga qarshi. */
const MAX_PER_HOUR = 120;

export default async (request: Request, _context: Context): Promise<Response> => {
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    const rate = await hitLimit(`bemorlar#${session.phone}`, MAX_PER_HOUR, 60 * 60);
    if (!rate.ok) return tooMany(rate.retryAfter);
    if (request.method === 'GET') {
      const data = await listPatients(session.phone, session.userId);
      return json(data, 200, { 'cache-control': 'private, no-store' });
    }

    if (request.method !== 'POST') return error('Faqat GET yoki POST', 405);

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      id?: string;
      firstName?: unknown;
      lastName?: unknown;
      patronymic?: unknown;
      birthDate?: unknown;
    };

    if (body.action === 'select') {
      if (!body.id) return error('id kerak');
      const { patients } = await listPatients(session.phone, session.userId);
      if (!patients.some((p) => p.id === body.id)) return error('Bunday bemor topilmadi', 404);

      await selectPatient(session.userId, body.id);
      return json({ ok: true, activeId: body.id });
    }

    if (body.action === 'add') {
      const added = await addLocalPatient(session.userId, {
        firstName: body.firstName,
        lastName: body.lastName,
        patronymic: body.patronymic,
        birthDate: body.birthDate,
      });
      if ('error' in added) return error(added.error);
      return json({ ok: true, patient: added, activeId: added.id });
    }

    if (body.action === 'birthDate') {
      if (!body.id) return error('id kerak');
      const birth = checkBirthDate(body.birthDate);
      if (!birth.ok) return error(birth.error);

      const patient = await setPatientBirthDate(session.phone, session.userId, body.id, birth.value);
      if (!patient) return error('Bunday bemor topilmadi', 404);
      return json({ ok: true, patient });
    }

    if (body.action === 'edit') {
      if (!body.id) return error('id kerak');
      const edited = await editLocalPatient(session.userId, body.id, {
        firstName: body.firstName,
        lastName: body.lastName,
        patronymic: body.patronymic,
        birthDate: body.birthDate,
      });
      if (!edited) return error('Bunday bemor topilmadi (klinikadagi bemor ismini bu yerdan o‘zgartirib bo‘lmaydi)', 404);
      if ('error' in edited) return error(edited.error);
      return json({ ok: true, patient: edited });
    }

    if (body.action === 'remove') {
      if (!body.id) return error('id kerak');
      const removed = await removeLocalPatient(session.userId, body.id);
      if (!removed) return error('Bunday bemor topilmadi (klinikadagi bemorni o‘chirib bo‘lmaydi)', 404);
      return json({ ok: true });
    }

    return error('action noto‘g‘ri');
  } catch (err) {
    await logToAdmin('patients', err);
    return error('Amalni bajarib bo‘lmadi', 500);
  }
};
