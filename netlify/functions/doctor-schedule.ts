import type { Context } from '@netlify/functions';
import { UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { sessionFrom, doctorFor } from './lib/auth.ts';
import { slotTimes, type Shift } from './lib/slots.ts';
import { isDateKey, toTashkent, addDays, weekdayOf } from './lib/time.ts';
import { dayAppointments, holdsSlot, staffServiceName } from './lib/appointments.ts';
import {
  checkShifts,
  isAllowedSlotMinutes,
  maskPhone,
  ALLOWED_SLOT_MINUTES,
} from './lib/schedule.ts';
import { logToAdmin } from './lib/telegram.ts';
import { json, error } from './lib/http.ts';

/**
 * GET  /api/doctor-schedule            — shifokorning jadvali va bugungi navbati
 * POST /api/doctor-schedule            — doimiy smenalar / slot davomiyligi
 * POST /api/doctor-schedule {date,...} — bitta kun uchun alohida jadval yoki dam olish
 */
export default async (request: Request, _context: Context): Promise<Response> => {
  const session = sessionFrom(request);
  if (!session) return error('Avval Telegram orqali kiring', 401);

  try {
    const doctor = await doctorFor(session);
    if (!doctor) return error('Bu bo‘lim faqat shifokorlar uchun', 403);

    if (request.method === 'GET') {
      const now = new Date();
      const today = toTashkent(now).dateKey;

      // ?date= bilan istalgan kunning navbati; berilmasa — bugun.
      const requested = new URL(request.url).searchParams.get('date');
      if (requested && !isDateKey(requested)) {
        return error('date YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
      }
      const date = requested ?? today;

      /*
        Slotlar kunga qarab: shifokor shu kunga alohida jadval qo'ygan
        yoki kunni yopgan bo'lishi mumkin — doimiy smenalar emas,
        kunlik yozuv haqiqatni beradi. Kabinet "kun yopiq" ekanini
        ham ko'rsatadi (E1), shuning uchun yozuvning o'zi o'qiladi.
      */
      const [override, appointments] = await Promise.all([
        db.send(
          new GetCommand({ TableName: TABLES.schedules, Key: { doctor_id: doctor.doctor_id, date } }),
        ),
        dayAppointments(doctor.doctor_id, date),
      ]);
      const dayRow = override.Item as
        | { shifts?: Shift[]; day_off?: boolean; off_reason?: string }
        | undefined;
      const dayOff = Boolean(dayRow?.day_off);
      const shifts = dayOff ? [] : (dayRow?.shifts ?? doctor.shifts);

      return json(
        {
          doctor: {
            id: doctor.doctor_id,
            name: doctor.name,
            job: doctor.job,
            shifts: doctor.shifts,
            slotMinutes: doctor.slot_minutes,
            workdays: doctor.workdays,
            price: doctor.price,
          },
          today,
          date,
          dayOff,
          offReason: dayOff ? (dayRow?.off_reason ?? null) : null,
          isWorkday: doctor.workdays.includes(weekdayOf(date)),
          slots: slotTimes(shifts, doctor.slot_minutes),
          // Navbatda faqat kuchdagi yozuvlar: bekor qilingan va
          // ko'chirilganlar slotni bo'shatgan.
          appointments: appointments
            .filter((a) => holdsSlot(a, now))
            .map((a) => ({
              time: a.time,
              phone: maskPhone(a.phone),
              status: a.status,
              patientName: a.patient_name ?? null,
              patientBirthDate: a.patient_birth_date ?? null,
              // Massaj, UZI ... — shifokor bemor nima uchun kelganini oldindan bilsin.
              serviceName: staffServiceName(a),
            }))
            .sort((a, b) => a.time.localeCompare(b.time)),
        },
        200,
        { 'cache-control': 'private, no-store' },
      );
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as {
        shifts?: Shift[];
        slotMinutes?: number;
        date?: string;
        dayOff?: boolean;
      };

      // Bitta kun uchun o'zgarish (dam olish yoki boshqacha smena).
      if (body.date) {
        if (!isDateKey(body.date)) return error('date YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
        const today = toTashkent(new Date()).dateKey;
        if (body.date < today) return error('O‘tgan kunni o‘zgartirib bo‘lmaydi');
        if (body.date > addDays(today, 90)) return error('90 kundan uzoqqa jadval kiritib bo‘lmaydi');

        let shifts: Shift[] = [];
        if (!body.dayOff) {
          const checked = checkShifts(body.shifts ?? doctor.shifts);
          if (!checked.ok) return error(checked.message);
          shifts = checked.shifts;
        }

        await db.send(
          new PutCommand({
            TableName: TABLES.schedules,
            Item: {
              doctor_id: doctor.doctor_id,
              date: body.date,
              shifts,
              day_off: Boolean(body.dayOff),
              updated_at: new Date().toISOString(),
            },
          }),
        );
        return json({ ok: true, date: body.date, dayOff: Boolean(body.dayOff), shifts });
      }

      // Doimiy jadval.
      const updates: string[] = [];
      const values: Record<string, unknown> = {};

      if (body.shifts) {
        const checked = checkShifts(body.shifts);
        if (!checked.ok) return error(checked.message);
        updates.push('shifts = :shifts');
        values[':shifts'] = checked.shifts;
      }

      if (body.slotMinutes !== undefined) {
        if (!isAllowedSlotMinutes(body.slotMinutes)) {
          return error(`Qabul davomiyligi ${ALLOWED_SLOT_MINUTES.join(', ')} daqiqadan biri bo‘lishi kerak`);
        }
        updates.push('slot_minutes = :slot');
        values[':slot'] = body.slotMinutes;
      }

      if (updates.length === 0) return error('O‘zgartirish uchun ma‘lumot yuborilmadi');

      values[':updated'] = new Date().toISOString();
      await db.send(
        new UpdateCommand({
          TableName: TABLES.doctors,
          Key: { doctor_id: doctor.doctor_id },
          UpdateExpression: `SET ${updates.join(', ')}, updated_at = :updated`,
          ExpressionAttributeValues: values,
        }),
      );

      /*
        Band qilingan navbatlar tegilmaydi — o'zgarish faqat kelgusidagi
        bo'sh slotlarga ta'sir qiladi, chunki slotlar har safar shu
        jadvaldan qayta hisoblanadi.
      */
      return json({ ok: true });
    }

    return error('Faqat GET yoki POST', 405);
  } catch (err) {
    await logToAdmin('doctor-schedule', err);
    return error('Jadvalni o‘zgartirishda xatolik', 500);
  }
};
