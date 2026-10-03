import type { Config, Context } from '@netlify/functions';
import { getDoctor, type DoctorRecord } from './lib/auth.ts';
import { appointmentsOnDate, isConfirmed } from './lib/appointments.ts';
import { askRating } from './lib/ratings.ts';
import { DEFAULT_SLOT_MINUTES } from './lib/schedule.ts';
import { toTashkent, toInstant, addDays } from './lib/time.ts';
import { logToAdmin } from './lib/telegram.ts';
import { cronGuard } from './lib/cron.ts';
import { json, error } from './lib/http.ts';

/**
 * Qabuldan keyin baho so'rash (G2) — Netlify Scheduled Function.
 *
 * Shifokor "Qabul qilindi" deb belgilasa, so'rov darhol ketadi
 * (appointment-status). Belgilamagan bo'lsa — qabul vaqti + davomiyligi
 * + qisqa muhlat o'tgach shu cron so'raydi. "Kelmadi" (no_show) uchun
 * so'ralmaydi. Har navbat uchun bir marta (`rating_asked_at`).
 *
 * Faqat bugun va kechagi navbatlar qaraladi: funksiya ishga tushmay
 * qolgan uzoq tanaffusdan keyin eski navbatlar uchun so'rov yog'ilmasin.
 */
const GRACE_MINUTES = 30;

export default async (request: Request, _context: Context): Promise<Response> => {
  const blocked = await cronGuard(request, 'ask-ratings', 450);
  if (blocked) return blocked;

  try {
    const now = new Date();
    const today = toTashkent(now).dateKey;
    const rows = (await Promise.all([addDays(today, -1), today].map(appointmentsOnDate))).flat();

    const doctors = new Map<string, DoctorRecord | null>();
    const doctorOf = async (id: string): Promise<DoctorRecord | null> => {
      if (!doctors.has(id)) doctors.set(id, await getDoctor(id));
      return doctors.get(id) ?? null;
    };

    let due = 0;
    let asked = 0;
    for (const a of rows) {
      if (!a.telegram_id || a.rating_asked_at || a.rating !== undefined) continue;

      let ready = a.status === 'done';
      let doctor: DoctorRecord | null = null;
      if (!ready && isConfirmed(a)) {
        doctor = await doctorOf(a.doctor_id);
        const minutes = doctor?.slot_minutes ?? DEFAULT_SLOT_MINUTES;
        const endsAt = toInstant(a.date, a.time).getTime() + (minutes + GRACE_MINUTES) * 60_000;
        ready = endsAt <= now.getTime();
      }
      if (!ready) continue;

      due++;
      try {
        if (await askRating(a, doctor ?? (await doctorOf(a.doctor_id)))) asked++;
      } catch (err) {
        await logToAdmin(`ask-ratings/${a.doctor_day}|${a.time}`, err);
      }
    }

    return json({ ok: true, checked: rows.length, due, asked });
  } catch (err) {
    await logToAdmin('ask-ratings', err);
    return error('Baho so‘rovlarini yuborishda xatolik', 500);
  }
};

export const config: Config = { schedule: '*/15 * * * *' };
