import { TABLES, queryAllPages } from './db.ts';
import { doctorDayKey } from './slots.ts';
import { addDays, daysBetween, toTashkent, type DateKey } from './time.ts';

export type AppointmentStatus =
  /** onlayn to'lov kutilmoqda — 5 daqiqadan keyin slot bo'shaydi */
  | 'hold'
  /** to'langan */
  | 'paid'
  /** klinikada to'lash — bron darhol kuchga kiradi */
  | 'booked'
  /** qabul bo'lib o'tdi (shifokor belgiladi yoki vaqti o'tdi) */
  | 'done'
  /** bemor kelmadi (shifokor belgiladi) */
  | 'no_show'
  /** bemor boshqa vaqtga ko'chirdi */
  | 'moved'
  | 'cancelled'
  /** shifokor ishga chiqa olmadi — klinika bekor qildi */
  | 'cancelled_by_clinic';

/** Slotni bo'shatadigan holatlar: bunday yozuv bandlikka ta'sir qilmaydi. */
const FREEING: ReadonlySet<string> = new Set(['moved', 'cancelled', 'cancelled_by_clinic']);

/** Kuchda turgan bron — eslatma, ko'chirish va bekor qilish shularga tegishli. */
const CONFIRMED: ReadonlySet<string> = new Set(['paid', 'booked']);

export type Appointment = {
  doctor_day: string;
  time: string;
  doctor_id: string;
  date: DateKey;
  phone: string;
  telegram_id?: string;
  starts_at: string;
  status: AppointmentStatus;
  price: number;
  /** hold uchun: shu vaqtdan keyin slot yana bo'shaydi (unix sekund) */
  hold_until?: number;
  payment_id?: string;
  /** navbat kim uchun olingani (bir telefon — bir oila) */
  patient_id?: string;
  patient_name?: string;
  /** YYYY-MM-DD — bron paytidagi bemor yozuvidan (B1) */
  patient_birth_date?: string;
  /** maxfiylik siyosatiga rozilik berilgan lahza (B4) */
  privacy_accepted_at?: string;
  /** eslatma yuborilgan lahza — takror yuborilmasligi uchun */
  reminded_at?: string;
  /** done / no_show deb belgilangan lahza (E2) */
  marked_at?: string;
  /** kim belgiladi: shifokor (bo'sh) yoki 1C avtomat (`'1c'`) */
  marked_by?: string;
  /** 1C "Doktorga Qabul" hujjati UUID — bemor kelgani shundan ma'lum */
  visit_ref?: string;
  /** hujjat o'tkazilgan lahza (1C sanasi ISO ga o'girilgan) */
  arrived_at?: string;
  /** bemordan baho so'ralgan lahza (G2) — bir marta so'raladi */
  rating_asked_at?: string;
  /** bemor qo'ygan baho 1–5 va lahzasi (G2) */
  rating?: number;
  rated_at?: string;
  /** Tanlangan qo'shimcha xizmat (massaj, UZI ...); asosiy qabulda yo'q — narx `price` da. */
  service_id?: string;
  service_name?: string;
  /** 1C `Catalog.GoodsAndServices` kodi — navbat 1C ga o'tganda xizmatni topish uchun. */
  service_code?: string;
  /** Qayta ko'rik xizmati bilan olingan (zanjir bo'lib abadiy bepul qolmasin deb belgilanadi). */
  service_followup?: boolean;
  /** Administrator onlayn to'lovni sinov uchun o'tkazib yuborgan — kim (telegram_id). */
  payment_skipped_by?: string;
  /**
   * Onlayn to'langan summa (so'm) va lahza — to'lov tasdiqlanganda (Payme) yoziladi.
   * 1C `DoctorsAdmission.PrepaidAmount` ni shundan to'ldiradi; holat "paid" dan
   * "done" / "no_show" ga o'tsa ham saqlanadi. Klinikada to'lanadigan va bepul navbatda yo'q.
   */
  paid_amount?: number;
  paid_at?: string;
  created_at: string;
};

/** Shu kundagi barcha yozuvlar (hold va to'langanlar). */
export async function dayAppointments(
  doctorId: string,
  dateKey: DateKey,
): Promise<Appointment[]> {
  const found = await queryAllPages({
    TableName: TABLES.appointments,
    KeyConditionExpression: 'doctor_day = :k',
    ExpressionAttributeValues: { ':k': doctorDayKey(doctorId, dateKey) },
  });
  return found as Appointment[];
}

/**
 * Yozuv slotni band qilib turibdimi. Muddati o'tgan hold band emas —
 * DynamoDB TTL kechikishi mumkin, shuning uchun o'zimiz tekshiramiz.
 */
export function holdsSlot(
  appointment: { status: string; hold_until?: number },
  now: Date,
): boolean {
  if (FREEING.has(appointment.status)) return false;
  if (appointment.status === 'hold') {
    return (appointment.hold_until ?? 0) > Math.floor(now.getTime() / 1000);
  }
  return true;
}

/** Band hisoblanadigan vaqtlar. */
export function takenTimes(appointments: Appointment[], now: Date): string[] {
  return appointments.filter((a) => holdsSlot(a, now)).map((a) => a.time);
}

/** Bron kuchdami: to'langan yoki klinikada to'lanadigan. */
export const isConfirmed = (appointment: { status: string }): boolean =>
  CONFIRMED.has(appointment.status);

/**
 * Bemorning kelgusidagi kuchdagi bronlari (patient-index).
 *
 * Slotlarni band qilib tashlashga qarshi: bitta telefon cheksiz
 * navbat olib, klinikaning kunini to'sib qo'yishi mumkin edi.
 */
export async function upcomingForPhone(phone: string, now: Date): Promise<Appointment[]> {
  const found = await queryAllPages({
    TableName: TABLES.appointments,
    IndexName: 'patient-index',
    KeyConditionExpression: 'phone = :p AND starts_at > :now',
    ExpressionAttributeValues: { ':p': phone, ':now': now.toISOString() },
  });
  return (found as Appointment[]).filter(isConfirmed);
}

export type FollowupCheck =
  | { ok: true }
  /** Oxirgi `days` kunda shu shifokorga oddiy qabulga kelmagan. */
  | { ok: false; reason: 'no_visit' }
  /** Kelgan, lekin tanlangan kun muddatdan keyin; `until` — oxirgi mumkin bo'lgan kun. */
  | { ok: false; reason: 'too_late'; until: DateKey };

/**
 * "Qayta ko'rik" xizmati shartiga mos kelishi: bemor shu shifokorga oddiy
 * qabulga kelgan va qayta ko'rik shu qabuldan keyingi `days` kun ichida
 * (qabul kuni ham, `days`-kun ham kiradi; Toshkent kalendari). Necha marta
 * olsa bo'ladi — soni cheklanmagan, faqat muddat cheklanadi.
 *
 * Muddat faqat **oddiy** qabuldan sanaladi: qayta ko'rikning o'zi uni
 * uzaytirmaydi, aks holda zanjir bo'lib abadiy bepul qolardi. Kelgan deb:
 * qabul bo'lib o'tgan (`done`) yoki vaqti o'tib ketgan kuchdagi bron
 * (shifokor yoki 1C belgilamagan bo'lishi mumkin). Kelmaganlar (`no_show`),
 * bekor qilinganlar va ko'chirilganlar hisobga kirmaydi.
 *
 * `slotDate` — qayta ko'rik olinayotgan kun: shu kun muddatga sig'sa bo'ldi.
 * `patientId` bo'lsa shu bemorning qabuli, eski yozuvlarda (bemor
 * ko'rsatilmagan) esa telefon bo'yicha (patient-index).
 */
export async function followupCheck(
  phone: string,
  doctorId: string,
  patientId: string | undefined,
  days: number,
  slotDate: DateKey,
  now: Date,
): Promise<FollowupCheck> {
  const found = await queryAllPages({
    TableName: TABLES.appointments,
    IndexName: 'patient-index',
    KeyConditionExpression: 'phone = :p AND starts_at BETWEEN :from AND :to',
    ExpressionAttributeValues: {
      ':p': phone,
      // Bir kun zaxira bilan o'qiladi; kun chegarasi pastda sana bo'yicha aniq tekshiriladi.
      ':from': new Date(now.getTime() - (days + 1) * 86_400_000).toISOString(),
      ':to': now.toISOString(),
    },
  });

  const visitDays = (found as Appointment[])
    .filter(
      (a) =>
        a.doctor_id === doctorId &&
        (!a.patient_id || !patientId || a.patient_id === patientId) &&
        (a.status === 'done' || a.status === 'booked' || a.status === 'paid') &&
        !a.service_followup,
    )
    .map((a) => toTashkent(new Date(a.starts_at)).dateKey)
    .sort();

  const fits = (day: DateKey, until: DateKey): boolean => {
    const gap = daysBetween(day, until);
    return gap >= 0 && gap <= days;
  };
  if (visitDays.some((day) => fits(day, slotDate))) return { ok: true };

  // Muddati hali tugamagan qabul bor, lekin tanlangan kun undan keyin.
  const today = toTashkent(now).dateKey;
  const latest = visitDays.filter((day) => fits(day, today)).at(-1);
  return latest ? { ok: false, reason: 'too_late', until: addDays(latest, days) } : { ok: false, reason: 'no_visit' };
}

/** Rad etilgan qayta ko'rik uchun bemorga tushunarli xabar (bron va ko'chirishda bir xil). */
export function followupRejected(
  name: string,
  days: number,
  check: Exclude<FollowupCheck, { ok: true }>,
): string {
  if (check.reason === 'too_late') {
    const [y, m, d] = check.until.split('-');
    return `“${name}” qabuldan keyin ${days} kun ichida beriladi — ${d}.${m}.${y} gacha bo‘lgan kunni tanlang.`;
  }
  return `“${name}” faqat shu shifokorga oxirgi ${days} kun ichida kelgan bemorlar uchun. Oddiy qabulni tanlang.`;
}

/**
 * Butun klinika bo'yicha shu kundagi yozuvlar (date-index).
 * Eslatmalar va kunlik xulosa uchun — ular shifokorni oldindan bilmaydi.
 */
export async function appointmentsOnDate(dateKey: DateKey): Promise<Appointment[]> {
  const found = await queryAllPages({
    TableName: TABLES.appointments,
    IndexName: 'date-index',
    KeyConditionExpression: '#d = :d',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':d': dateKey },
  });
  return found as Appointment[];
}
