/**
 * /kabinet/admin — Tashrif shifokorlari, Tashrif yozuvlari, Rasmlar.
 *
 * Avval alohida /admin panelida (parol bilan) edi; endi boshqa admin
 * sahifalari kabi Telegram sessiyasi bilan ishlaydi. 401/403 bo'lsa —
 * o'sha `SignInCard` (kirish yoki "huquq yo'q" + Telegram ID).
 */
import { t } from '../data/i18n';
import { getLang } from './lang';
import { showSignIn } from './signin';
import { compressImage, type CompressTarget } from './image-compress';
import { formatPhone } from './phone';
import { formatSum, tashkentToday, addDaysKey, type I18nText } from './visiting';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const WD = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sh'];
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
/** "2026-12-05" → "5-dek, Sh" */
const fmtDate = (d: string) => {
  const [y = 2000, m = 1, day = 1] = d.split('-').map(Number);
  return `${day}-${MONTHS[m - 1]}, ${WD[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]}`;
};
const sum = (n: number) => (n ? `${formatSum(n)} so‘m` : 'bepul');

/** Sahifa egasiga ko'rsatilgan xato (kirish oynasi allaqachon chiqqan). */
class Shown extends Error {}

/**
 * Admin API so'rovi. 401/403 — boshqa admin sahifalaridagi kabi kirish
 * paneli (403 da Telegram ID bilan); boshqa xato — matni bilan.
 */
async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; telegramId?: string };
  if (res.status === 401 || res.status === 403) {
    showSignIn(
      res.status,
      [
        t('denied.admin', getLang()),
        data.telegramId ? `Sizning Telegram ID: ${data.telegramId} — buni Netlify’da ADMIN_TELEGRAM_IDS ga qo‘ying.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      'denied',
    );
    el('content')?.setAttribute('hidden', '');
    throw new Shown('auth');
  }
  if (!res.ok) throw new Error(data.error ?? `Xatolik (${res.status})`);
  return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const errText = (err: unknown) => (err instanceof Error ? err.message : 'Xatolik');

function setMsg(id: string, text: string, kind: 'error' | 'ok' | '' = ''): void {
  const m = el(id);
  if (!m) return;
  m.textContent = text;
  m.className = `msg${kind ? ` ${kind}` : ''}`;
}

/** Yuklashdagi xato: kirish oynasi bo'lmasa — "yuklab bo'lmadi". */
function loadFailed(err: unknown): void {
  if (err instanceof Shown) return;
  el('loading').textContent = `Ma’lumotlarni yuklab bo‘lmadi: ${errText(err)}`;
}

function showContent(): void {
  el('loading').hidden = true;
  el('content').hidden = false;
}

async function uploadImage(file: File, target: CompressTarget, url: string): Promise<Record<string, unknown>> {
  const blob = await compressImage(file, target);
  return api<Record<string, unknown>>(url, {
    method: 'POST',
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    body: blob,
  });
}

/* =================================================================
   1. Tashrif shifokorlari
   ================================================================= */

type VisitingDoctor = {
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

const LANGS = ['uz', 'ru', 'en'] as const;

export function initVisitingDoctorsAdmin(): void {
  let doctors: VisitingDoctor[] = [];
  const draft = {
    id: '',
    photoUrl: '',
    dates: [] as string[],
    skipDates: [] as string[],
    shifts: [] as { start: string; end: string }[],
    slotMinutes: 30,
    uploading: false,
  };
  const field = (path: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-f="${path}"]`)!;

  const daysSummary = (d: VisitingDoctor) => {
    const today = tashkentToday();
    const parts: string[] = [];
    if (d.weekdays.length) {
      parts.push(`har ${[...d.weekdays].sort((a, b) => (a || 7) - (b || 7)).map((w) => WD[w]).join(', ')}`);
    }
    const future = d.dates.filter((x) => x >= today);
    if (future.length) parts.push(future.slice(0, 3).map(fmtDate).join('; ') + (future.length > 3 ? ` +${future.length - 3}` : ''));
    return parts.join(' · ') || 'kun belgilanmagan';
  };

  function render(): void {
    const shown = doctors.filter((d) => d.active).length;
    el('subtitle').textContent = doctors.length
      ? `${shown} ta shifokor saytda koʻrinadi${doctors.length > shown ? ` · ${doctors.length - shown} tasi yashirilgan` : ''}`
      : '';
    el('empty').hidden = doctors.length > 0;
    el('list').innerHTML = doctors
      .map((d) => {
        const initials = d.name.uz.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase();
        const tr = (['ru', 'en'] as const).filter((l) => d.name[l] || d.specialty[l] || d.bio[l]);
        return `<div class="row${d.active ? '' : ' off'}">
          ${d.photoUrl ? `<img class="ph" src="${esc(d.photoUrl)}" alt="">` : `<span class="ph">${esc(initials)}</span>`}
          <div class="row-main">
            <span class="nm">${esc(d.name.uz)}</span>
            <span class="meta">${esc(d.specialty.uz)} · ${esc(sum(d.price))} · ${esc(daysSummary(d))} · ${esc(
              d.shifts.map((s) => `${s.start}–${s.end}`).join(', '),
            )} · ${d.slotMinutes} daqiqa</span>
          </div>
          <div class="row-tags">
            ${d.active ? '<span class="tag ok">saytda koʻrinadi</span>' : '<span class="tag off">yashirilgan</span>'}
            <span class="tag ${tr.length ? 'ok' : 'warn'}">${tr.length ? `tarjima: ${tr.join(', ').toUpperCase()}` : 'faqat oʻzbekcha'}</span>
          </div>
          <div class="row-btns">
            <button class="mini" type="button" data-edit="${esc(d.id)}">Tahrirlash</button>
            ${
              d.active
                ? `<button class="mini danger" type="button" data-toggle="${esc(d.id)}">Saytdan yashirish</button>`
                : `<button class="mini okbtn" type="button" data-toggle="${esc(d.id)}">Saytda koʻrsatish</button>`
            }
            <button class="mini danger" type="button" data-del="${esc(d.id)}">Oʻchirish</button>
          </div>
        </div>`;
      })
      .join('');

    el('list')
      .querySelectorAll<HTMLButtonElement>('[data-edit]')
      .forEach((b) => (b.onclick = () => openForm(doctors.find((d) => d.id === b.dataset.edit) ?? null)));
    el('list')
      .querySelectorAll<HTMLButtonElement>('[data-toggle]')
      .forEach((b) => (b.onclick = () => void toggle(b.dataset.toggle!)));
    el('list')
      .querySelectorAll<HTMLButtonElement>('[data-del]')
      .forEach((b) => (b.onclick = () => void remove(b.dataset.del!)));
  }

  async function load(): Promise<void> {
    try {
      doctors = (await api<{ doctors: VisitingDoctor[] }>('/api/admin-visiting')).doctors;
    } catch (err) {
      return loadFailed(err);
    }
    showContent();
    el('addBtn').hidden = false;
    render();
  }

  async function toggle(id: string): Promise<void> {
    const d = doctors.find((x) => x.id === id);
    if (!d) return;
    const q = d.active
      ? `"${d.name.uz}" saytdan yashirilsinmi?\n\nKartasi koʻrinmaydi va unga yozilib boʻlmaydi. Maʼlumotlari va yozuvlar saqlanadi.`
      : `"${d.name.uz}" saytda qayta koʻrsatilsinmi?`;
    if (!confirm(q)) return;
    try {
      await api('/api/admin-visiting', jsonInit('PATCH', { id, active: !d.active }));
      d.active = !d.active;
      render();
    } catch (err) {
      if (!(err instanceof Shown)) alert(errText(err));
    }
  }

  async function remove(id: string): Promise<void> {
    const d = doctors.find((x) => x.id === id);
    if (!d) return;
    if (!confirm(`"${d.name.uz}" butunlay oʻchirilsinmi?\n\nVaqtincha olib tashlash uchun «Saytdan yashirish» yetarli.`)) return;
    try {
      await api('/api/admin-visiting', jsonInit('DELETE', { id }));
    } catch (err) {
      if (err instanceof Shown) return;
      const text = errText(err);
      // Kelgusi yozuvlari bor — server ogohlantiradi, admin tasdiqlasa majburan o'chiriladi.
      if (!/kelgusi yozuv/.test(text)) {
        alert(text);
        return;
      }
      if (!confirm(`${text}\n\nBaribir oʻchirilsinmi?`)) return;
      try {
        await api('/api/admin-visiting', jsonInit('DELETE', { id, force: true }));
      } catch (err2) {
        if (!(err2 instanceof Shown)) alert(errText(err2));
        return;
      }
    }
    doctors = doctors.filter((x) => x.id !== id);
    render();
  }

  /* ---------- forma ---------- */

  function setLangPane(code: string): void {
    document.querySelectorAll<HTMLButtonElement>('#f-langs button').forEach((b) => b.classList.toggle('on', b.dataset.lang === code));
    document.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== code));
  }

  function refreshDots(): void {
    for (const l of LANGS) {
      const filled = Boolean(field(`name.${l}`).value.trim() || field(`specialty.${l}`).value.trim());
      document.querySelector(`[data-dot="${l}"]`)?.classList.toggle('filled', filled);
    }
  }

  function renderPhoto(): void {
    el('f-photo-prev').innerHTML = draft.photoUrl ? `<img src="${esc(draft.photoUrl)}" alt="">` : 'Rasm yoʻq';
    el('f-photo-remove').hidden = !draft.photoUrl;
  }

  function renderDates(id: string, list: string[]): void {
    const today = tashkentToday();
    el(id).innerHTML = list
      .map(
        (d, i) =>
          `<span class="datechip${d < today ? ' past' : ''}">${esc(fmtDate(d))}<button class="del" type="button" data-i="${i}" aria-label="Olib tashlash">✕</button></span>`,
      )
      .join('');
    el(id)
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) =>
        b.addEventListener('click', () => {
          list.splice(Number(b.dataset.i), 1);
          renderDates(id, list);
        }),
      );
  }

  function renderShifts(): void {
    el('f-shifts').innerHTML = draft.shifts
      .map(
        (s, i) => `<div class="shift">
          <input type="time" value="${esc(s.start)}" data-i="${i}" data-k="start" aria-label="${i + 1}-oraliq boshlanishi">
          <span class="dash">–</span>
          <input type="time" value="${esc(s.end)}" data-i="${i}" data-k="end" aria-label="${i + 1}-oraliq tugashi">
          ${draft.shifts.length > 1 ? `<button class="del" type="button" data-rm="${i}" aria-label="Oraliqni o‘chirish">✕</button>` : ''}
        </div>`,
      )
      .join('');
    el('f-shifts')
      .querySelectorAll<HTMLInputElement>('input')
      .forEach((inp) =>
        inp.addEventListener('change', () => {
          const s = draft.shifts[Number(inp.dataset.i)];
          if (s) s[inp.dataset.k as 'start' | 'end'] = inp.value;
        }),
      );
    el('f-shifts')
      .querySelectorAll<HTMLButtonElement>('[data-rm]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          draft.shifts.splice(Number(b.dataset.rm), 1);
          renderShifts();
        }),
      );
    el('addShift').hidden = draft.shifts.length >= 4;
  }

  function renderSlot(): void {
    document.querySelectorAll<HTMLButtonElement>('#f-slot button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.min) === draft.slotMinutes);
    });
  }

  function openForm(d: VisitingDoctor | null): void {
    el('formTitle').textContent = d ? d.name.uz : 'Yangi tashrif shifokori';
    setMsg('formMsg', '');
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
    document.querySelectorAll<HTMLInputElement>('#f-days input').forEach((c) => (c.checked = d?.weekdays.includes(Number(c.value)) ?? false));
    el<HTMLInputElement>('f-price').value = d ? String(d.price) : '';
    el<HTMLInputElement>('f-sort').value = d ? String(d.sort) : '';
    el<HTMLInputElement>('f-active').checked = d?.active ?? true;
    el<HTMLInputElement>('f-photo-file').value = '';
    el('f-photo-msg').textContent = 'Kvadrat yoki portret surat yaxshi koʻrinadi. Avtomatik siqiladi (WebP).';
    setLangPane('uz');
    refreshDots();
    renderPhoto();
    renderDates('f-dates', draft.dates);
    renderDates('f-skip', draft.skipDates);
    renderShifts();
    renderSlot();
    el('modal').hidden = false;
    field('name.uz').focus();
  }

  const closeForm = () => (el('modal').hidden = true);

  const addDate = (inputId: string, list: string[], boxId: string) => {
    const inp = el<HTMLInputElement>(inputId);
    if (!inp.value) return;
    if (!list.includes(inp.value)) list.push(inp.value);
    list.sort();
    inp.value = '';
    renderDates(boxId, list);
  };

  async function save(): Promise<void> {
    if (draft.uploading) return;
    addDate('f-date-in', draft.dates, 'f-dates');
    addDate('f-skip-in', draft.skipDates, 'f-skip');
    const text = (k: 'name' | 'specialty' | 'bio') => Object.fromEntries(LANGS.map((l) => [l, field(`${k}.${l}`).value.trim()]));
    const priceRaw = el<HTMLInputElement>('f-price').value.replace(/\s/g, '');
    if (!field('name.uz').value.trim() || !field('specialty.uz').value.trim()) {
      setLangPane('uz');
      setMsg('formMsg', 'Ism va mutaxassislik (oʻzbekcha) kerak.', 'error');
      return;
    }
    if (priceRaw === '') {
      setMsg('formMsg', 'Qabul narxini kiriting (bepul boʻlsa 0).', 'error');
      return;
    }
    const payload = {
      id: draft.id || undefined,
      name: text('name'),
      specialty: text('specialty'),
      bio: text('bio'),
      photoUrl: draft.photoUrl,
      weekdays: [...document.querySelectorAll<HTMLInputElement>('#f-days input:checked')].map((c) => Number(c.value)),
      dates: draft.dates,
      skipDates: draft.skipDates,
      shifts: draft.shifts,
      slotMinutes: draft.slotMinutes,
      price: Number(priceRaw),
      sort: Number(el<HTMLInputElement>('f-sort').value || 0),
      active: el<HTMLInputElement>('f-active').checked,
    };
    const btn = el<HTMLButtonElement>('saveForm');
    btn.disabled = true;
    setMsg('formMsg', 'Saqlanmoqda…');
    try {
      const res = await api<{ doctor: VisitingDoctor }>('/api/admin-visiting', jsonInit('POST', payload));
      const i = doctors.findIndex((d) => d.id === res.doctor.id);
      if (i >= 0) doctors[i] = res.doctor;
      else doctors.push(res.doctor);
      doctors.sort((a, b) => a.sort - b.sort || a.name.uz.localeCompare(b.name.uz));
      closeForm();
      render();
    } catch (err) {
      if (!(err instanceof Shown)) setMsg('formMsg', errText(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  el('addBtn').addEventListener('click', () => openForm(null));
  el('closeForm').addEventListener('click', closeForm);
  el('cancelForm').addEventListener('click', closeForm);
  el('saveForm').addEventListener('click', () => void save());
  el('modal').addEventListener('click', (e) => {
    if (e.target === el('modal')) closeForm();
  });
  document.querySelectorAll<HTMLButtonElement>('#f-langs button').forEach((b) =>
    b.addEventListener('click', () => setLangPane(b.dataset.lang ?? 'uz')),
  );
  document.querySelectorAll<HTMLInputElement>('[data-f]').forEach((inp) => inp.addEventListener('input', refreshDots));
  document.querySelectorAll<HTMLButtonElement>('#f-slot button').forEach((b) =>
    b.addEventListener('click', () => {
      draft.slotMinutes = Number(b.dataset.min);
      renderSlot();
    }),
  );
  el('addShift').addEventListener('click', () => {
    const last = draft.shifts.at(-1);
    draft.shifts.push({ start: last?.end ?? '14:00', end: '17:00' });
    renderShifts();
  });
  el('f-date-add').addEventListener('click', () => addDate('f-date-in', draft.dates, 'f-dates'));
  el('f-skip-add').addEventListener('click', () => addDate('f-skip-in', draft.skipDates, 'f-skip'));
  el<HTMLInputElement>('f-date-in').min = tashkentToday();
  el<HTMLInputElement>('f-skip-in').min = tashkentToday();
  el('f-photo-remove').addEventListener('click', () => {
    draft.photoUrl = '';
    renderPhoto();
  });
  el<HTMLInputElement>('f-photo-file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const msg = el('f-photo-msg');
    msg.textContent = 'Yuklanmoqda…';
    draft.uploading = true;
    el<HTMLButtonElement>('saveForm').disabled = true;
    try {
      const res = await uploadImage(file, 'doctor', '/api/admin-upload?purpose=doctor');
      draft.photoUrl = String(res.url);
      msg.textContent = `Yuklandi (${Math.round(Number(res.size) / 1024)} KB, ${res.width}×${res.height})`;
      renderPhoto();
    } catch (err) {
      if (!(err instanceof Shown)) msg.textContent = errText(err);
    } finally {
      draft.uploading = false;
      el<HTMLButtonElement>('saveForm').disabled = false;
      input.value = '';
    }
  });

  void load();
}

/* =================================================================
   2. Tashrif yozuvlari
   ================================================================= */

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

const STATUS: Record<Booking['status'], string> = {
  booked: 'Kutilmoqda',
  came: 'Keldi',
  no_show: 'Kelmadi',
  cancelled: 'Bekor qilingan',
};

export function initVisitingBookingsAdmin(): void {
  let bookings: Booking[] = [];
  let statusFilter = '';
  let first = true;

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
    el<HTMLInputElement>('fromDay').value = from;
    el<HTMLInputElement>('toDay').value = to;
    document.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) => b.classList.toggle('on', b.dataset.range === range));
    void load();
  }

  async function load(): Promise<void> {
    const from = el<HTMLInputElement>('fromDay').value;
    let to = el<HTMLInputElement>('toDay').value || from;
    if (to < from) {
      to = from;
      el<HTMLInputElement>('toDay').value = to;
    }
    const doctor = el<HTMLSelectElement>('docFilter').value;
    try {
      const qs = new URLSearchParams({ from, to, ...(doctor ? { doctor } : {}) });
      const res = await api<{ bookings: Booking[]; doctors: { id: string; name: string }[] }>(`/api/admin-visiting-bookings?${qs}`);
      bookings = res.bookings;
      const sel = el<HTMLSelectElement>('docFilter');
      const kept = sel.value;
      sel.innerHTML =
        '<option value="">Barcha shifokorlar</option>' +
        res.doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
      sel.value = res.doctors.some((d) => d.id === kept) ? kept : '';
    } catch (err) {
      if (first) return loadFailed(err);
      if (!(err instanceof Shown)) alert(errText(err));
      return;
    }
    if (first) {
      first = false;
      showContent();
    }
    render();
  }

  function render(): void {
    const counts = { booked: 0, came: 0, no_show: 0, cancelled: 0 } as Record<Booking['status'], number>;
    for (const b of bookings) counts[b.status]++;
    const came = bookings.filter((b) => b.status === 'came').reduce((s, b) => s + b.price, 0);
    const chip = (key: string, label: string, n: number, cls = '') =>
      `<button type="button" class="chip ${cls}${statusFilter === key ? ' on' : ''}" data-st="${key}"><b>${n}</b><small>${label}</small></button>`;
    el('stats').innerHTML =
      chip('', 'jami', bookings.length) +
      chip('booked', 'kutilmoqda', counts.booked) +
      chip('came', 'keldi', counts.came, 'ok') +
      chip('no_show', 'kelmadi', counts.no_show, 'bad') +
      chip('cancelled', 'bekor', counts.cancelled) +
      (came ? `<span class="chip money"><b>${esc(formatSum(came))} so‘m</b><small>kelganlar boʻyicha</small></span>` : '');
    el('stats')
      .querySelectorAll<HTMLButtonElement>('[data-st]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          statusFilter = b.dataset.st ?? '';
          render();
        }),
      );

    const shown = bookings.filter((b) => !statusFilter || b.status === statusFilter);
    el('empty').hidden = shown.length > 0;
    let lastDate = '';
    el('rows').innerHTML = shown
      .map((b, i) => {
        const sep = b.date !== lastDate ? `<div class="day-sep">${esc(fmtDate(b.date))}</div>` : '';
        lastDate = b.date;
        return `${sep}<div class="row" data-status="${b.status}">
          <div class="bk-time">${esc(b.time)}<small>${esc(fmtDate(b.date).split(',')[0])}</small></div>
          <div class="row-main bk-who">
            <span class="nm">${esc(b.name)}</span>
            <a href="tel:${esc(b.phone)}">${esc(formatPhone(b.phone))}</a>
          </div>
          <div class="row-main">
            <span class="meta">${esc(b.doctorName)}</span>
            <span class="meta">${esc(sum(b.price))}</span>
          </div>
          <select data-i="${i}" aria-label="Holat">${(Object.keys(STATUS) as Booking['status'][])
            .map((s) => `<option value="${s}"${s === b.status ? ' selected' : ''}>${STATUS[s]}</option>`)
            .join('')}</select>
        </div>`;
      })
      .join('');
    el('rows')
      .querySelectorAll<HTMLSelectElement>('select[data-i]')
      .forEach((sel) =>
        sel.addEventListener('change', async () => {
          const b = shown[Number(sel.dataset.i)];
          if (!b) return;
          const next = sel.value as Booking['status'];
          if (next === 'cancelled' && !confirm(`${b.name} (${b.time}) yozuvi bekor qilinsinmi?\n\nBu vaqt saytda yana boʻsh koʻrinadi.`)) {
            sel.value = b.status;
            return;
          }
          sel.disabled = true;
          try {
            await api('/api/admin-visiting-bookings', jsonInit('POST', { ...b, status: next }));
            b.status = next;
            render();
          } catch (err) {
            sel.value = b.status;
            sel.disabled = false;
            if (!(err instanceof Shown)) alert(errText(err));
          }
        }),
      );
  }

  document.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
    b.addEventListener('click', () => setRange(b.dataset.range ?? 'today')),
  );
  for (const id of ['fromDay', 'toDay', 'docFilter']) {
    el(id).addEventListener('change', () => {
      document.querySelectorAll('[data-range]').forEach((b) => b.classList.remove('on'));
      void load();
    });
  }
  el('reload').addEventListener('click', () => void load());
  setRange('week');
}

/* =================================================================
   3. Sayt rasmlari
   ================================================================= */

type Slot = {
  id: string;
  label: string;
  group: 'banner' | 'gallery' | 'doctor';
  hint: string;
  fallback: string;
  active: boolean;
  current: { url: string; width: number | null; height: number | null; updatedAt: string } | null;
};

export function initMediaAdmin(): void {
  let slots: Slot[] = [];
  const groups: { key: Slot['group']; title: string }[] = [
    { key: 'banner', title: 'Banner — havola ulashilganda koʻrinadigan muqova' },
    { key: 'gallery', title: 'Galereya — «Bizda shunday» boʻlimi' },
    { key: 'doctor', title: 'Asosiy shifokorlar rasmi' },
  ];

  function render(): void {
    const changed = slots.filter((s) => s.current).length;
    el('subtitle').textContent = `${changed} ta rasm almashtirilgan · ${slots.length - changed} tasi standart`;
    el('groups').innerHTML = groups
      .map(({ key, title }) => {
        const items = slots.filter((s) => s.group === key);
        if (!items.length) return '';
        return `<div class="card glass">
          <div class="card-head"><h2>${esc(title)}</h2></div>
          <div class="mgrid">${items
            .map((s) => {
              const src = s.current?.url ?? s.fallback;
              return `<div class="mcard ${s.group}">
                <div class="mimg">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</div>
                <div class="mbody">
                  <span class="nm">${esc(s.label)}</span>
                  <span class="row-tags">${s.current ? '<span class="tag ok">yangilangan</span>' : '<span class="tag off">standart rasm</span>'}${
                    s.active ? '' : '<span class="tag warn">shifokor yashirilgan</span>'
                  }</span>
                  <span class="hint">${esc(s.hint)}</span>
                  <span class="msg" data-msg="${esc(s.id)}">${
                    s.current ? `${s.current.width ?? '?'}×${s.current.height ?? '?'} · ${esc(s.current.updatedAt.slice(0, 10))}` : ''
                  }</span>
                  <div class="row-btns">
                    <label class="mini file">Almashtirish<input type="file" accept="image/jpeg,image/png,image/webp,image/*" data-slot="${esc(s.id)}"></label>
                    ${s.current ? `<button class="mini danger" type="button" data-reset="${esc(s.id)}">Standartga qaytarish</button>` : ''}
                  </div>
                </div>
              </div>`;
            })
            .join('')}</div>
        </div>`;
      })
      .join('');

    el('groups')
      .querySelectorAll<HTMLInputElement>('input[data-slot]')
      .forEach((inp) =>
        inp.addEventListener('change', async () => {
          const file = inp.files?.[0];
          const slot = slots.find((s) => s.id === inp.dataset.slot);
          if (!file || !slot) return;
          const msg = el('groups').querySelector<HTMLElement>(`[data-msg="${CSS.escape(slot.id)}"]`);
          if (msg) {
            msg.textContent = 'Yuklanmoqda…';
            msg.className = 'msg';
          }
          inp.disabled = true;
          try {
            const target: CompressTarget = slot.group === 'banner' ? 'banner' : slot.group === 'gallery' ? 'gallery' : 'doctor';
            const res = await uploadImage(file, target, `/api/admin-media?slot=${encodeURIComponent(slot.id)}`);
            slot.current = res.current as Slot['current'];
            render();
          } catch (err) {
            inp.disabled = false;
            if (msg && !(err instanceof Shown)) {
              msg.textContent = errText(err);
              msg.className = 'msg error';
            }
          }
        }),
      );
    el('groups')
      .querySelectorAll<HTMLButtonElement>('[data-reset]')
      .forEach((b) =>
        b.addEventListener('click', async () => {
          const slot = slots.find((s) => s.id === b.dataset.reset);
          if (!slot || !confirm(`«${slot.label}» standart rasmga qaytarilsinmi?`)) return;
          try {
            await api('/api/admin-media', jsonInit('DELETE', { slot: slot.id }));
            slot.current = null;
            render();
          } catch (err) {
            if (!(err instanceof Shown)) alert(errText(err));
          }
        }),
      );
  }

  (async () => {
    try {
      slots = (await api<{ slots: Slot[] }>('/api/admin-media')).slots;
    } catch (err) {
      return loadFailed(err);
    }
    showContent();
    render();
  })();
}
