/**
 * /admin paneli — brauzerdagi qism.
 *
 * Hamma so'rov `/api/admin-*` ga, HttpOnly cookie bilan (brauzer uni
 * o'zi qo'shadi). 401 kelsa — kirish oynasi qaytadi.
 */
import { compressImage, type CompressTarget } from './image-compress';
import { formatPhone } from './phone';
import { formatSum, tashkentToday, addDaysKey, type I18nText } from './visiting';

type AdminDoctor = {
  id: string;
  name: I18nText;
  specialty: I18nText;
  bio: I18nText;
  photoUrl: string;
  weekdays: number[];
  dates: string[];
  skipDates: string[];
  shifts: { start: string; end: string }[];
  slotMinutes: number;
  price: number;
  active: boolean;
  sort: number;
};

type Booking = {
  doctorDay: string;
  time: string;
  date: string;
  doctorId: string;
  doctorName: string;
  name: string;
  phone: string;
  status: 'booked' | 'came' | 'no_show' | 'cancelled';
  price: number;
  createdAt: string;
};

type Slot = {
  id: string;
  label: string;
  group: 'banner' | 'gallery' | 'doctor';
  hint: string;
  fallback: string;
  active: boolean;
  current: { url: string; width: number | null; height: number | null; updatedAt: string } | null;
};

const LANGS = ['uz', 'ru', 'en'] as const;
const WD = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sh'];
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const STATUS: Record<Booking['status'], string> = {
  booked: 'Kutilmoqda',
  came: 'Keldi',
  no_show: 'Kelmadi',
  cancelled: 'Bekor qilingan',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** "2026-12-05" → "5-dek, Sh" */
const fmtDate = (d: string) => {
  const [y = 2000, m = 1, day = 1] = d.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${day}-${MONTHS[m - 1]}, ${wd}`;
};

class Unauthorized extends Error {}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new Unauthorized(data.error ?? 'Avval kiring');
  if (!res.ok) {
    const err = new Error(data.error ?? `Xatolik (${res.status})`) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function initAdmin(): void {
  const loginView = $('loginView');
  const appView = $('appView');
  let toastTimer = 0;

  const toast = (text: string) => {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (el.hidden = true), 3200);
  };

  /** Xatoni ko'rsatadi; 401 bo'lsa kirish oynasiga qaytaradi. */
  const handle = (err: unknown, target?: HTMLElement) => {
    if (err instanceof Unauthorized) {
      showLogin('Sessiya tugadi — qayta kiring.');
      return;
    }
    const text = err instanceof Error ? err.message : 'Xatolik';
    if (target) target.textContent = text;
    else toast(text);
  };

  /* ================= kirish ================= */

  function showLogin(message = ''): void {
    document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => d.close());
    appView.hidden = true;
    loginView.hidden = false;
    $('loginMsg').textContent = message;
    $<HTMLInputElement>('loginPass').focus();
  }

  function showApp(): void {
    loginView.hidden = true;
    appView.hidden = false;
    openTab(location.hash.replace('#', '') || 'doctors');
  }

  $<HTMLFormElement>('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $<HTMLButtonElement>('loginBtn');
    const pass = $<HTMLInputElement>('loginPass');
    if (!pass.value) {
      $('loginMsg').textContent = 'Parolni kiriting';
      return;
    }
    btn.disabled = true;
    try {
      await api('/api/admin-auth', jsonInit('POST', { password: pass.value }));
      pass.value = '';
      showApp();
    } catch (err) {
      $('loginMsg').textContent = err instanceof Error ? err.message : 'Xatolik';
    } finally {
      btn.disabled = false;
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin-auth', { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    showLogin('Chiqdingiz.');
  });

  /* ================= tablar ================= */

  const loaded = new Set<string>();

  function openTab(tab: string): void {
    if (!['doctors', 'bookings', 'media'].includes(tab)) tab = 'doctors';
    document.querySelectorAll<HTMLButtonElement>('.adm-tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    history.replaceState(null, '', `#${tab}`);
    if (!loaded.has(tab)) {
      loaded.add(tab);
      if (tab === 'doctors') void loadDoctors();
      if (tab === 'bookings') initBookings();
      if (tab === 'media') void loadMedia();
    }
  }

  document.querySelectorAll<HTMLButtonElement>('.adm-tab').forEach((b) =>
    b.addEventListener('click', () => openTab(b.dataset.tab ?? 'doctors')),
  );

  /* ================= tasdiqlash oynasi ================= */

  function confirmBox(text: string, yes = 'Ha'): Promise<boolean> {
    const dlg = $<HTMLDialogElement>('confirmDialog');
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yes;
    dlg.showModal();
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        dlg.close();
        $('confirmYes').removeEventListener('click', onYes);
        $('confirmNo').removeEventListener('click', onNo);
        resolve(v);
      };
      const onYes = () => done(true);
      const onNo = () => done(false);
      $('confirmYes').addEventListener('click', onYes);
      $('confirmNo').addEventListener('click', onNo);
    });
  }

  /* ================= rasm yuklash ================= */

  async function uploadImage(file: File, target: CompressTarget, url: string): Promise<Record<string, unknown>> {
    const blob = await compressImage(file, target);
    return api<Record<string, unknown>>(url, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'application/octet-stream' },
      body: blob,
    });
  }

  /* ================= 1. tashrif shifokorlari ================= */

  let doctors: AdminDoctor[] = [];

  const daysSummary = (d: AdminDoctor) => {
    const today = tashkentToday();
    const parts: string[] = [];
    if (d.weekdays.length) parts.push(`Har ${[...d.weekdays].sort((a, b) => ((a || 7) - (b || 7))).map((w) => WD[w]).join(', ')}`);
    const future = d.dates.filter((x) => x >= today);
    if (future.length) parts.push(future.slice(0, 3).map(fmtDate).join('; ') + (future.length > 3 ? ` +${future.length - 3}` : ''));
    return parts.join(' · ') || 'kun belgilanmagan';
  };

  const translations = (d: AdminDoctor) => {
    const has = (['ru', 'en'] as const).filter((l) => d.name[l] || d.specialty[l] || d.bio[l]);
    return has.length ? `Tarjima: ${has.join(', ').toUpperCase()}` : 'Faqat oʻzbekcha';
  };

  function renderDoctors(): void {
    const list = $('doctorList');
    if (!doctors.length) {
      list.innerHTML = `<div class="adm-empty glass">Hali shifokor qoʻshilmagan. «+ Yangi shifokor» tugmasini bosing — masalan travmatolog va endokrinolog.</div>`;
      return;
    }
    list.innerHTML = doctors
      .map((d) => {
        const initials = d.name.uz.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase();
        return `<article class="adm-doc glass${d.active ? '' : ' off'}">
          ${d.photoUrl ? `<img class="adm-ph" src="${esc(d.photoUrl)}" alt="">` : `<span class="adm-ph">${esc(initials)}</span>`}
          <div>
            <h3>${esc(d.name.uz)}</h3>
            <div class="adm-muted">${esc(d.specialty.uz)}</div>
            <div class="meta">
              <span class="adm-pill ${d.active ? 'ok' : 'warn'}">${d.active ? 'Saytda' : 'Yashirilgan'}</span>
              <span class="adm-pill">${esc(daysSummary(d))}</span>
              <span class="adm-pill">${esc(d.shifts.map((s) => `${s.start}–${s.end}`).join(', '))} · ${d.slotMinutes} daq</span>
              <span class="adm-pill rose">${d.price ? `${esc(formatSum(d.price))} soʻm` : 'bepul'}</span>
              <span class="adm-pill">${esc(translations(d))}</span>
            </div>
          </div>
          <div class="acts">
            <button class="btn btn-sm" type="button" data-edit="${esc(d.id)}">Tahrirlash</button>
            <button class="btn btn-ghost btn-sm" type="button" data-toggle="${esc(d.id)}">${d.active ? 'Yashirish' : 'Koʻrsatish'}</button>
            <button class="btn btn-ghost btn-sm adm-danger-ghost" type="button" data-del="${esc(d.id)}">Oʻchirish</button>
          </div>
        </article>`;
      })
      .join('');

    list.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openEditor(doctors.find((d) => d.id === b.dataset.edit) ?? null)),
    );
    list.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) =>
      b.addEventListener('click', async () => {
        const d = doctors.find((x) => x.id === b.dataset.toggle);
        if (!d) return;
        b.disabled = true;
        try {
          await api('/api/admin-visiting', jsonInit('PATCH', { id: d.id, active: !d.active }));
          d.active = !d.active;
          toast(d.active ? 'Saytda koʻrsatildi' : 'Saytdan yashirildi');
          renderDoctors();
        } catch (err) {
          handle(err);
          b.disabled = false;
        }
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const d = doctors.find((x) => x.id === b.dataset.del);
        if (!d) return;
        if (!(await confirmBox(`«${d.name.uz}» oʻchirilsinmi? Bu amalni qaytarib boʻlmaydi. (Vaqtincha olib tashlash uchun «Yashirish» yetarli.)`, 'Oʻchirish'))) return;
        try {
          await api('/api/admin-visiting', jsonInit('DELETE', { id: d.id }));
        } catch (err) {
          const e = err as Error & { status?: number };
          if (e.status !== 409) return handle(err);
          if (!(await confirmBox(`${e.message} Baribir oʻchirilsinmi?`, 'Ha, oʻchirish'))) return;
          try {
            await api('/api/admin-visiting', jsonInit('DELETE', { id: d.id, force: true }));
          } catch (err2) {
            return handle(err2);
          }
        }
        doctors = doctors.filter((x) => x.id !== d.id);
        toast('Oʻchirildi');
        renderDoctors();
      }),
    );
  }

  async function loadDoctors(): Promise<void> {
    try {
      doctors = (await api<{ doctors: AdminDoctor[] }>('/api/admin-visiting')).doctors;
      renderDoctors();
    } catch (err) {
      handle(err, $('doctorList'));
    }
  }

  /* ---------- tahrirlash oynasi ---------- */

  const dlg = $<HTMLDialogElement>('doctorDialog');
  const form = $<HTMLFormElement>('doctorForm');
  const draft = {
    id: '',
    photoUrl: '',
    dates: [] as string[],
    skipDates: [] as string[],
    shifts: [] as { start: string; end: string }[],
    slotMinutes: 30,
    uploading: false,
  };

  const field = (path: string) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-f="${path}"]`)!;

  function setLangPane(code: string): void {
    form.querySelectorAll<HTMLButtonElement>('#dLangs .adm-seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.lang === code));
    form.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== code));
  }

  function refreshDots(): void {
    for (const l of LANGS) {
      const filled = Boolean(field(`name.${l}`).value.trim() || field(`specialty.${l}`).value.trim());
      form.querySelector(`[data-dot="${l}"]`)?.classList.toggle('filled', filled);
    }
  }

  function renderPhoto(): void {
    const prev = $('dPhotoPrev');
    prev.innerHTML = draft.photoUrl ? `<img src="${esc(draft.photoUrl)}" alt="">` : '<span>Rasm yoʻq</span>';
    $('dPhotoRemove').hidden = !draft.photoUrl;
  }

  function renderDateChips(id: string, list: string[]): void {
    const today = tashkentToday();
    const box = $(id);
    box.innerHTML = list
      .map(
        (d, i) =>
          `<span class="adm-datechip${d < today ? ' past' : ''}">${esc(fmtDate(d))}<button type="button" data-i="${i}" aria-label="Olib tashlash">✕</button></span>`,
      )
      .join('');
    box.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        list.splice(Number(b.dataset.i), 1);
        renderDateChips(id, list);
      }),
    );
  }

  function renderShifts(): void {
    const box = $('dShifts');
    box.innerHTML = draft.shifts
      .map(
        (s, i) => `<div class="adm-shift">
          <input type="time" value="${esc(s.start)}" data-i="${i}" data-k="start" aria-label="Boshlanishi" step="300">
          <span>—</span>
          <input type="time" value="${esc(s.end)}" data-i="${i}" data-k="end" aria-label="Tugashi" step="300">
          ${draft.shifts.length > 1 ? `<button type="button" data-rm="${i}" aria-label="Oraliqni olib tashlash">✕</button>` : ''}
        </div>`,
      )
      .join('');
    box.querySelectorAll<HTMLInputElement>('input').forEach((inp) =>
      inp.addEventListener('change', () => {
        const s = draft.shifts[Number(inp.dataset.i)];
        if (s) s[inp.dataset.k as 'start' | 'end'] = inp.value;
      }),
    );
    box.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        draft.shifts.splice(Number(b.dataset.rm), 1);
        renderShifts();
      }),
    );
    $('dShiftAdd').hidden = draft.shifts.length >= 4;
  }

  function renderSlot(): void {
    form.querySelectorAll<HTMLButtonElement>('#dSlot .adm-seg-btn').forEach((b) =>
      b.classList.toggle('on', Number(b.dataset.min) === draft.slotMinutes),
    );
  }

  function openEditor(d: AdminDoctor | null): void {
    $('dTitle').textContent = d ? 'Shifokorni tahrirlash' : 'Yangi tashrif shifokori';
    $('dMsg').textContent = '';
    draft.id = d?.id ?? '';
    draft.photoUrl = d?.photoUrl ?? '';
    draft.dates = [...(d?.dates ?? [])];
    draft.skipDates = [...(d?.skipDates ?? [])];
    draft.shifts = d?.shifts.length ? d.shifts.map((s) => ({ ...s })) : [{ start: '09:00', end: '14:00' }];
    draft.slotMinutes = d?.slotMinutes ?? 30;
    for (const l of LANGS) {
      field(`name.${l}`).value = d?.name[l] ?? '';
      field(`specialty.${l}`).value = d?.specialty[l] ?? '';
      field(`bio.${l}`).value = d?.bio[l] ?? '';
    }
    form.querySelectorAll<HTMLInputElement>('#dWeekdays input').forEach((c) => (c.checked = d?.weekdays.includes(Number(c.value)) ?? false));
    $<HTMLInputElement>('dPrice').value = d ? String(d.price) : '';
    $<HTMLInputElement>('dSort').value = d ? String(d.sort) : '';
    $<HTMLInputElement>('dActive').checked = d?.active ?? true;
    $<HTMLInputElement>('dPhotoFile').value = '';
    $('dPhotoMsg').textContent = 'Kvadrat yoki portret surat yaxshi koʻrinadi. Avtomatik siqiladi.';
    setLangPane('uz');
    refreshDots();
    renderPhoto();
    renderDateChips('dDates', draft.dates);
    renderDateChips('dSkip', draft.skipDates);
    renderShifts();
    renderSlot();
    dlg.showModal();
    field('name.uz').focus();
  }

  $('addDoctor').addEventListener('click', () => openEditor(null));
  form.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  form.querySelectorAll<HTMLButtonElement>('#dLangs .adm-seg-btn').forEach((b) =>
    b.addEventListener('click', () => setLangPane(b.dataset.lang ?? 'uz')),
  );
  form.querySelectorAll<HTMLInputElement>('[data-f]').forEach((inp) => inp.addEventListener('input', refreshDots));
  form.querySelectorAll<HTMLButtonElement>('#dSlot .adm-seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      draft.slotMinutes = Number(b.dataset.min);
      renderSlot();
    }),
  );
  $('dShiftAdd').addEventListener('click', () => {
    const last = draft.shifts[draft.shifts.length - 1];
    draft.shifts.push({ start: last?.end ?? '14:00', end: '17:00' });
    renderShifts();
  });

  const addDate = (inputId: string, list: string[], boxId: string) => {
    const inp = $<HTMLInputElement>(inputId);
    if (!inp.value) return;
    if (!list.includes(inp.value)) list.push(inp.value);
    list.sort();
    inp.value = '';
    renderDateChips(boxId, list);
  };
  $('dDateAdd').addEventListener('click', () => addDate('dDateInput', draft.dates, 'dDates'));
  $('dSkipAdd').addEventListener('click', () => addDate('dSkipInput', draft.skipDates, 'dSkip'));
  $<HTMLInputElement>('dDateInput').min = tashkentToday();
  $<HTMLInputElement>('dSkipInput').min = tashkentToday();

  $('dPhotoRemove').addEventListener('click', () => {
    draft.photoUrl = '';
    renderPhoto();
  });

  $<HTMLInputElement>('dPhotoFile').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const msg = $('dPhotoMsg');
    msg.textContent = 'Yuklanmoqda…';
    draft.uploading = true;
    $<HTMLButtonElement>('dSave').disabled = true;
    try {
      const res = await uploadImage(file, 'doctor', '/api/admin-upload?purpose=doctor');
      draft.photoUrl = String(res.url);
      msg.textContent = `Yuklandi (${Math.round(Number(res.size) / 1024)} KB, ${res.width}×${res.height})`;
      renderPhoto();
    } catch (err) {
      handle(err, msg);
    } finally {
      draft.uploading = false;
      $<HTMLButtonElement>('dSave').disabled = false;
      input.value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (draft.uploading) return;
    const msg = $('dMsg');
    msg.textContent = '';
    // Kiritilgan, lekin «Qo'shish» bosilmagan sanani ham olamiz.
    addDate('dDateInput', draft.dates, 'dDates');
    addDate('dSkipInput', draft.skipDates, 'dSkip');
    form.querySelectorAll<HTMLInputElement>('#dShifts input').forEach((inp) => {
      const s = draft.shifts[Number(inp.dataset.i)];
      if (s) s[inp.dataset.k as 'start' | 'end'] = inp.value;
    });
    const text = (k: 'name' | 'specialty' | 'bio') =>
      Object.fromEntries(LANGS.map((l) => [l, field(`${k}.${l}`).value.trim()]));
    const priceRaw = $<HTMLInputElement>('dPrice').value.replace(/\s/g, '');
    if (!field('name.uz').value.trim()) {
      setLangPane('uz');
      msg.textContent = 'Ism (oʻzbekcha) kerak';
      field('name.uz').focus();
      return;
    }
    if (!field('specialty.uz').value.trim()) {
      setLangPane('uz');
      msg.textContent = 'Mutaxassislik (oʻzbekcha) kerak';
      field('specialty.uz').focus();
      return;
    }
    if (priceRaw === '') {
      msg.textContent = 'Qabul narxini kiriting (bepul boʻlsa 0)';
      $('dPrice').focus();
      return;
    }
    const body = {
      id: draft.id || undefined,
      name: text('name'),
      specialty: text('specialty'),
      bio: text('bio'),
      photoUrl: draft.photoUrl,
      weekdays: [...form.querySelectorAll<HTMLInputElement>('#dWeekdays input:checked')].map((c) => Number(c.value)),
      dates: draft.dates,
      skipDates: draft.skipDates,
      shifts: draft.shifts,
      slotMinutes: draft.slotMinutes,
      price: Number(priceRaw),
      sort: Number($<HTMLInputElement>('dSort').value || 0),
      active: $<HTMLInputElement>('dActive').checked,
    };
    const btn = $<HTMLButtonElement>('dSave');
    btn.disabled = true;
    try {
      const res = await api<{ doctor: AdminDoctor }>('/api/admin-visiting', jsonInit('POST', body));
      const i = doctors.findIndex((d) => d.id === res.doctor.id);
      if (i >= 0) doctors[i] = res.doctor;
      else doctors.push(res.doctor);
      doctors.sort((a, b) => a.sort - b.sort || a.name.uz.localeCompare(b.name.uz));
      dlg.close();
      toast('Saqlandi — saytda yangilandi');
      renderDoctors();
      // Yangi shifokor yozilganlar filtrida ham chiqsin.
      if (loaded.has('bookings')) void loadBookings();
    } catch (err) {
      handle(err, msg);
    } finally {
      btn.disabled = false;
    }
  });

  /* ================= 2. yozilganlar ================= */

  let bookings: Booking[] = [];
  let statusFilter = '';

  function setRange(range: string): void {
    const today = tashkentToday();
    const [from, to] =
      range === 'tomorrow'
        ? [addDaysKey(today, 1), addDaysKey(today, 1)]
        : range === 'week'
          ? [today, addDaysKey(today, 7)]
          : range === 'past'
            ? [addDaysKey(today, -7), today]
            : [today, today];
    $<HTMLInputElement>('fFrom').value = from;
    $<HTMLInputElement>('fTo').value = to;
    document.querySelectorAll<HTMLButtonElement>('#quickDays .adm-chip').forEach((b) => b.classList.toggle('on', b.dataset.range === range));
    void loadBookings();
  }

  function initBookings(): void {
    document.querySelectorAll<HTMLButtonElement>('#quickDays .adm-chip').forEach((b) =>
      b.addEventListener('click', () => setRange(b.dataset.range ?? 'today')),
    );
    for (const id of ['fFrom', 'fTo', 'fDoctor']) {
      $(id).addEventListener('change', () => {
        document.querySelectorAll('#quickDays .adm-chip').forEach((b) => b.classList.remove('on'));
        void loadBookings();
      });
    }
    $('reloadBookings').addEventListener('click', () => void loadBookings());
    setRange('week');
  }

  async function loadBookings(): Promise<void> {
    const from = $<HTMLInputElement>('fFrom').value;
    let to = $<HTMLInputElement>('fTo').value || from;
    if (to < from) {
      to = from;
      $<HTMLInputElement>('fTo').value = to;
    }
    const doctor = $<HTMLSelectElement>('fDoctor').value;
    const list = $('bookingList');
    list.innerHTML = '<p class="adm-muted">Yuklanmoqda…</p>';
    try {
      const qs = new URLSearchParams({ from, to, ...(doctor ? { doctor } : {}) });
      const res = await api<{ bookings: Booking[]; doctors: { id: string; name: string }[] }>(
        `/api/admin-visiting-bookings?${qs}`,
      );
      bookings = res.bookings;
      const sel = $<HTMLSelectElement>('fDoctor');
      const current = sel.value;
      sel.innerHTML =
        '<option value="">Hammasi</option>' +
        res.doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
      sel.value = current;
      renderBookings();
    } catch (err) {
      list.innerHTML = '';
      handle(err, list);
    }
  }

  function renderCounts(): void {
    const counts = { booked: 0, came: 0, no_show: 0, cancelled: 0 } as Record<Booking['status'], number>;
    for (const b of bookings) counts[b.status]++;
    const came = bookings.filter((b) => b.status === 'came').reduce((s, b) => s + b.price, 0);
    const chip = (key: string, label: string, n: number, cls = '') =>
      `<button type="button" class="adm-pill ${cls}${statusFilter === key ? ' rose' : ''}" data-st="${key}">${label}: <b>${n}</b></button>`;
    $('bookingCounts').innerHTML =
      chip('', 'Jami', bookings.length) +
      chip('booked', 'Kutilmoqda', counts.booked) +
      chip('came', 'Keldi', counts.came, 'ok') +
      chip('no_show', 'Kelmadi', counts.no_show, 'warn') +
      chip('cancelled', 'Bekor', counts.cancelled) +
      (came ? `<span class="adm-pill">Kelganlar boʻyicha: <b>${esc(formatSum(came))} soʻm</b></span>` : '');
    $('bookingCounts')
      .querySelectorAll<HTMLButtonElement>('[data-st]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          statusFilter = b.dataset.st ?? '';
          renderBookings();
        }),
      );
  }

  function renderBookings(): void {
    renderCounts();
    const list = $('bookingList');
    const shown = bookings.filter((b) => !statusFilter || b.status === statusFilter);
    if (!shown.length) {
      list.innerHTML = '<div class="adm-empty glass">Bu oraliqda yozilganlar yoʻq.</div>';
      return;
    }
    let lastDate = '';
    list.innerHTML = shown
      .map((b, i) => {
        const sep = b.date !== lastDate ? `<div class="adm-daysep">${esc(fmtDate(b.date))}</div>` : '';
        lastDate = b.date;
        return `${sep}<article class="adm-bk glass" data-status="${b.status}">
          <div class="when"><b>${esc(b.time)}</b><small>${esc(fmtDate(b.date))}</small></div>
          <div class="who"><b>${esc(b.name)}</b><a href="tel:${esc(b.phone)}">${esc(formatPhone(b.phone))}</a></div>
          <div class="doc">${esc(b.doctorName)}<br><small>${b.price ? `${esc(formatSum(b.price))} soʻm` : 'bepul'}</small></div>
          <div class="st"><select data-i="${i}" aria-label="Holat">${(Object.keys(STATUS) as Booking['status'][])
            .map((s) => `<option value="${s}"${s === b.status ? ' selected' : ''}>${STATUS[s]}</option>`)
            .join('')}</select></div>
        </article>`;
      })
      .join('');
    list.querySelectorAll<HTMLSelectElement>('select[data-i]').forEach((sel) =>
      sel.addEventListener('change', async () => {
        const b = shown[Number(sel.dataset.i)];
        if (!b) return;
        const next = sel.value as Booking['status'];
        if (next === 'cancelled' && !(await confirmBox(`${b.name} (${b.time}) yozuvi bekor qilinsinmi? Bu vaqt saytda yana boʻsh koʻrinadi.`, 'Bekor qilish'))) {
          sel.value = b.status;
          return;
        }
        sel.disabled = true;
        try {
          await api('/api/admin-visiting-bookings', jsonInit('POST', { ...b, status: next }));
          b.status = next;
          toast(`Holat: ${STATUS[next]}`);
          renderBookings();
        } catch (err) {
          sel.value = b.status;
          sel.disabled = false;
          handle(err);
        }
      }),
    );
  }

  /* ================= 3. rasmlar ================= */

  let slots: Slot[] = [];

  function renderMedia(): void {
    const groups: { key: Slot['group']; title: string }[] = [
      { key: 'banner', title: 'Banner' },
      { key: 'gallery', title: 'Galereya («Bizda shunday» boʻlimi)' },
      { key: 'doctor', title: 'Shifokorlar rasmi (asosiy jamoa)' },
    ];
    $('mediaList').innerHTML = groups
      .map(({ key, title }) => {
        const items = slots.filter((s) => s.group === key);
        if (!items.length) return '';
        return `<section class="adm-mgroup"><h2>${esc(title)}</h2><div class="adm-mgrid">${items
          .map((s) => {
            const src = s.current?.url ?? s.fallback;
            return `<article class="adm-mcard glass ${s.group}">
              <div class="adm-mimg">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}
                <span class="adm-pill badge ${s.current ? 'ok' : ''}">${s.current ? 'Yangilangan' : 'Standart rasm'}</span></div>
              <div class="adm-mbody">
                <b>${esc(s.label)}</b>
                <small class="adm-muted">${esc(s.hint)}${s.active ? '' : ' (shifokor saytda yashirilgan)'}</small>
                <small class="adm-muted" data-msg="${esc(s.id)}">${
                  s.current ? `${s.current.width ?? '?'}×${s.current.height ?? '?'} · ${esc(s.current.updatedAt.slice(0, 10))}` : ''
                }</small>
                <div class="acts">
                  <label class="btn btn-sm adm-file">Almashtirish<input type="file" accept="image/jpeg,image/png,image/webp,image/*" data-slot="${esc(s.id)}"></label>
                  ${s.current ? `<button class="btn btn-ghost btn-sm" type="button" data-reset="${esc(s.id)}">Standartga qaytarish</button>` : ''}
                </div>
              </div>
            </article>`;
          })
          .join('')}</div></section>`;
      })
      .join('');

    $('mediaList')
      .querySelectorAll<HTMLInputElement>('input[data-slot]')
      .forEach((inp) =>
        inp.addEventListener('change', async () => {
          const file = inp.files?.[0];
          const slot = slots.find((s) => s.id === inp.dataset.slot);
          if (!file || !slot) return;
          const msg = $('mediaList').querySelector<HTMLElement>(`[data-msg="${CSS.escape(slot.id)}"]`);
          if (msg) msg.textContent = 'Yuklanmoqda…';
          inp.disabled = true;
          try {
            const target: CompressTarget = slot.group === 'banner' ? 'banner' : slot.group === 'gallery' ? 'gallery' : 'doctor';
            const res = await uploadImage(file, target, `/api/admin-media?slot=${encodeURIComponent(slot.id)}`);
            slot.current = res.current as Slot['current'];
            toast('Rasm almashtirildi — saytda bir necha soniyada koʻrinadi');
            renderMedia();
          } catch (err) {
            handle(err, msg ?? undefined);
            inp.disabled = false;
          }
        }),
      );
    $('mediaList')
      .querySelectorAll<HTMLButtonElement>('[data-reset]')
      .forEach((b) =>
        b.addEventListener('click', async () => {
          const slot = slots.find((s) => s.id === b.dataset.reset);
          if (!slot || !(await confirmBox(`«${slot.label}» standart rasmga qaytarilsinmi?`, 'Qaytarish'))) return;
          try {
            await api('/api/admin-media', jsonInit('DELETE', { slot: slot.id }));
            slot.current = null;
            toast('Standart rasm qaytarildi');
            renderMedia();
          } catch (err) {
            handle(err);
          }
        }),
      );
  }

  async function loadMedia(): Promise<void> {
    try {
      slots = (await api<{ slots: Slot[] }>('/api/admin-media')).slots;
      renderMedia();
    } catch (err) {
      handle(err, $('mediaList'));
    }
  }

  /* ================= boshlanish ================= */

  fetch('/api/admin-auth', { credentials: 'same-origin' })
    .then((r) => r.json() as Promise<{ ok?: boolean; configured?: boolean }>)
    .then((s) => {
      if (s.ok) showApp();
      else showLogin(s.configured === false ? 'Panel hali sozlanmagan: Netlify’da ADMIN_PASSWORD qoʻshing.' : '');
    })
    .catch(() => showLogin('Server bilan aloqa yoʻq. Sahifani yangilang.'));
}
