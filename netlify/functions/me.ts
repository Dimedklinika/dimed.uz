import type { Context } from '@netlify/functions';
import { TABLES, queryAllPages } from './lib/db.ts';
import { sessionFrom, getDoctor } from './lib/auth.ts';
import { isConfirmed } from './lib/appointments.ts';
import { isBookable } from './lib/slots.ts';
import { loadResults } from './lib/results.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * GET /api/me — bemorning qabullari va tahlil natijalari.
 * ?include=appointments | results | appointments,results (standart — ikkalasi):
 * kabinet bo'limlarga ajratilgan (C1), har sahifa faqat o'zinikini so'raydi.
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'GET') return error('Faqat GET', 405);

  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  const include = new Set(
    (new URL(request.url).searchParams.get('include') ?? 'appointments,results').split(','),
  );

  try {
    const [appointments, results] = await Promise.all([
      include.has('appointments') ? loadAppointments(session.phone) : [],
      include.has('results') ? loadResults(session.phone) : [],
    ]);

    return json({ phone: session.phone, appointments, results }, 200, {
      'cache-control': 'private, no-store',
    });
  } catch (err) {
    await logToAdmin('me', err);
    return error('Ma‘lumotlarni olishda xatolik', 500);
  }
};

type AppointmentRow = {
  doctor_id: string;
  date: string;
  time: string;
  starts_at: string;
  status: string;
  price: number;
  patient_name?: string;
};

/*
  Bitta telefondagi (oila) yozuvlarning yuqori chegarasi.

  Avval bitta sahifa `Limit: 50` bilan o'qilardi va filtr undan KEYIN
  qo'llanardi: ko'chirilgan va bekor qilingan yozuvlar ham 50 talikni
  egallab, eski qabullar tarixdan jimgina yo'qolardi. Endi hamma sahifa
  o'qiladi; chegara faqat cheksiz aylanib qolmaslik uchun. Eng yangilari
  oldin keladi — chegaraga yetsa, eng eski yozuvlar tushib qoladi.
*/
const MAX_APPOINTMENT_ROWS = 1000;

async function loadAppointments(phone: string) {
  const found = await queryAllPages(
    {
      TableName: TABLES.appointments,
      IndexName: 'patient-index',
      KeyConditionExpression: 'phone = :p',
      ExpressionAttributeValues: { ':p': phone },
      ScanIndexForward: false,
    },
    MAX_APPOINTMENT_ROWS,
  );

  const rows = (found as AppointmentRow[]).filter(
    /*
      Tugallanmagan hold va ko'chirilgan yozuvlar ko'rsatilmaydi
      (ko'chirilganining o'rniga yangisi turadi), klinika bekor
      qilgani esa ko'rinadi — bemor buni bilishi kerak.
    */
    (a) =>
      a.status === 'paid' ||
      a.status === 'booked' ||
      a.status === 'done' ||
      a.status === 'no_show' ||
      a.status === 'cancelled_by_clinic',
  );

  // Shifokor nomlarini bir marta yuklaymiz.
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(rows.map((r) => r.doctor_id))].map(async (id) => {
      const doctor = await getDoctor(id);
      names.set(id, doctor?.name ?? id);
      if (doctor) names.set(`${id}:job`, doctor.job);
    }),
  );

  const now = new Date();
  const nowIso = now.toISOString();
  return rows
    .map((a) => ({
      doctorId: a.doctor_id,
      doctorName: names.get(a.doctor_id) ?? a.doctor_id,
      doctorJob: names.get(`${a.doctor_id}:job`) ?? '',
      date: a.date,
      time: a.time,
      startsAt: a.starts_at,
      status: a.status,
      price: a.price,
      patientName: a.patient_name ?? null,
      upcoming: a.starts_at >= nowIso,
      // Ko'chirish faqat kuchdagi bronga va 1 soat qolgunicha.
      canMove: isConfirmed(a) && isBookable(a.date, a.time, now),
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// Natijalar: netlify/functions/lib/results.ts (natija sahifasi bilan umumiy).
