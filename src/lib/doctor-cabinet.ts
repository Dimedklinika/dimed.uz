/**
 * Shifokor kabineti sahifalari uchun umumiy qism (E1): ma'lumotni
 * yuklash, ruxsat holatlari, kichik formatlovchilar.
 */
import { t } from '../data/i18n';
import { getLang } from './lang';
import { showSignIn } from './signin';
export type Shift = { start: string; end: string };

export type QueueItem = {
  time: string;
  phone: string;
  status: string;
  patientName: string | null;
  patientBirthDate: string | null;
  /** Bemor tanlagan xizmat (massaj, UZI ...); asosiy qabulda null. */
  serviceName?: string | null;
};

export type DoctorData = {
  doctor: {
    id: string;
    name: string;
    job: string;
    shifts: Shift[];
    slotMinutes: number;
    workdays: number[];
    price: number;
  };
  today: string;
  date: string;
  slots: string[];
  appointments: QueueItem[];
  /** Shu kun yopilganmi (dam olish / ishga chiqa olmadi). */
  dayOff: boolean;
  offReason: string | null;
  /** Shu hafta kuni shifokorning doimiy ish kunimi. */
  isWorkday: boolean;
};

export type DoctorFetch = { ok: true; data: DoctorData } | { ok: false; status: number };

/** GET /api/doctor-schedule — berilgan kun (bo'lmasa bugun). */
export async function fetchDoctor(date?: string): Promise<DoctorFetch> {
  try {
    const res = await fetch(
      `/api/doctor-schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`,
      { credentials: 'same-origin' },
    );
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as DoctorData };
  } catch {
    return { ok: false, status: 0 };
  }
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/**
 * Yuklanmadi holatini ko'rsatadi: 401/403 — kirish / ruxsat yo'q,
 * boshqasi — xato. Sahifada #loading va #denied (SignInCard) bo'lishi kerak.
 */
export function showDenied(status: number): void {
  if (status === 401 || status === 403) {
    showSignIn(status, t('denied.doctor', getLang()), 'denied');
    return;
  }
  const loading = el('loading');
  if (loading) loading.textContent = 'Maʼlumotlarni yuklab boʻlmadi. Sahifani yangilang.';
}

export const esc = (t: string): string =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export const fmtPrice = (n: number): string => n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' soʻm';

/** Navbat holati yorlig'i (shifokor ko'rinishi). */
export const statusLabel: Record<string, { text: string; cls: string }> = {
  hold: { text: 'kutilmoqda', cls: 'warn' },
  paid: { text: 'band', cls: 'ok' },
  booked: { text: 'band', cls: 'ok' },
  done: { text: 'qabul qilindi', cls: 'done' },
  no_show: { text: 'kelmadi', cls: 'off' },
};

/** Chiqish: sessiya va header keshini tozalab bosh sahifaga. */
export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  try {
    sessionStorage.removeItem('dimed_session');
  } catch {
    /* bo'sh */
  }
  window.location.href = '/';
}
