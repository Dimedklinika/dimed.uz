/**
 * «Tashrif buyuruvchi shifokorlar» — brauzerdagi qism: kartochkalarni
 * chizish va yozilish oynasi (kun → vaqt → ism, telefon → tasdiqlash).
 *
 * Kartochka ma'lumoti `/api/site-content` dan (CDN keshi), bo'sh vaqtlar
 * `/api/visiting-slots` dan (keshsiz), yozilish `/api/visiting-book` ga.
 * Onlayn to'lov yo'q: tasdiqlash oynasida summa va «To'lov klinikada
 * amalga oshiriladi» yoziladi.
 */
import { isLang, type Lang } from '../data/i18n';
import { vt, errorText, dayMonth, EVERY_WEEKDAY, WEEKDAY_SHORT } from '../data/visiting-i18n';
import { loadSiteContent } from './site-content';
import { parsePhone, formatPhone } from './phone';
import {
  checkPatientName,
  formatSum,
  tashkentToday,
  addDaysKey,
  textOf,
  visitDates,
  weekdayOfKey,
  type PublicVisitingDoctor,
} from './visiting';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

type Day = { date: string; slots: string[] };

type State = {
  doctor: PublicVisitingDoctor | null;
  days: Day[];
  date: string;
  time: string;
  name: string;
  phone: string;
  step: 'form' | 'confirm' | 'done';
  busy: boolean;
};

export function initVisiting(): void {
  const section = document.querySelector<HTMLElement>('[data-visiting]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-v-dialog]');
  if (!section || !dialog) return;

  const pageLang = document.documentElement.dataset.pageLang;
  const lang: Lang = isLang(pageLang) ? pageLang : 'uz';
  const tr = (k: Parameters<typeof vt>[0]) => vt(k, lang);
  const variant = section.dataset.variant ?? 'home';
  const limit = variant === 'home' ? Number(section.dataset.limit ?? 3) : Infinity;
  const cards = section.querySelector<HTMLElement>('[data-v-cards]');
  const foot = section.querySelector<HTMLElement>('[data-v-foot]');
  const clinicPhone = section.dataset.phone ?? '';
  const clinicPhoneHref = section.dataset.phoneHref ?? '';
  const body = dialog.querySelector<HTMLElement>('[data-v-body]');
  if (!cards || !body) return;

  let doctors: PublicVisitingDoctor[] = [];
  const state: State = { doctor: null, days: [], date: '', time: '', name: '', phone: '', step: 'form', busy: false };

  const sum = (n: number) => (n > 0 ? `${formatSum(n)} ${tr('v.sum')}` : tr('v.free'));
  const dayLabel = (date: string) => {
    const today = tashkentToday();
    const rel = date === today ? tr('v.today') : date === addDaysKey(today, 1) ? tr('v.tomorrow') : '';
    const wd = WEEKDAY_SHORT[lang][weekdayOfKey(date)] ?? '';
    return `${dayMonth(date, lang)}${rel ? ` (${rel})` : `, ${wd}`}`;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  /** Karta chipi: "Sh, 28-noyabr" yoki "Ertaga, 28-noyabr". */
  const chipLabel = (date: string) => {
    const today = tashkentToday();
    const rel = date === today ? tr('v.today') : date === addDaysKey(today, 1) ? tr('v.tomorrow') : '';
    return `${rel ? cap(rel) : WEEKDAY_SHORT[lang][weekdayOfKey(date)]}, ${dayMonth(date, lang)}`;
  };

  const photoHtml = (d: PublicVisitingDoctor, cls: string) => {
    const name = textOf(d.name, lang);
    if (d.photo) {
      return `<img class="${cls}" src="${esc(d.photo)}" alt="${esc(name)}" width="160" height="160" loading="lazy" decoding="async">`;
    }
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase();
    return `<span class="${cls} v-initials" aria-hidden="true">${esc(initials)}</span>`;
  };

  /* ---------------- kartochkalar ---------------- */

  function cardHtml(d: PublicVisitingDoctor): string {
    const name = textOf(d.name, lang);
    const bio = textOf(d.bio, lang);
    const weekly = d.weekdays.length ? cap(d.weekdays.map((w) => EVERY_WEEKDAY[lang][w]).join(', ')) : '';
    const next = visitDates(d, tashkentToday(), 60, 3);
    const nextHtml = next.map((x) => `<span class="v-date">${esc(chipLabel(x))}</span>`).join('');
    return `<article class="v-card glass" data-v-card="${esc(d.id)}">
      <div class="v-top">
        ${photoHtml(d, 'v-ph')}
        <div class="v-id">
          <span class="v-spec">${esc(textOf(d.specialty, lang))}</span>
          <h3>${esc(name)}</h3>
        </div>
      </div>
      ${bio ? `<p class="v-bio${variant === 'home' ? ' clamp' : ''}">${esc(bio)}</p>` : ''}
      <dl class="v-facts">
        <div><dt>${esc(tr('v.days'))}</dt><dd>${
          weekly ? `<b>${esc(weekly)}</b>` : ''
        }${nextHtml ? `<span class="v-next">${esc(tr('v.next'))}:</span><span class="v-dates">${nextHtml}</span>` : `<span class="v-next none">${esc(tr('v.noDates'))}</span>`}</dd></div>
        <div><dt>${esc(tr('v.hours'))}</dt><dd><b>${d.shifts.map((x) => `<span class="v-nw">${esc(x.start)}–${esc(x.end)}</span>`).join(', ')}</b><span class="v-next">${d.slotMinutes} ${esc(tr('v.min'))}</span></dd></div>
        <div><dt>${esc(tr('v.price'))}</dt><dd><b class="v-price">${esc(sum(d.price))}</b>${
          d.price > 0 ? `<span class="v-next">${esc(tr('v.payAtClinic'))}</span>` : ''
        }</dd></div>
      </dl>
      <button class="btn v-book" type="button" data-v-book="${esc(d.id)}"${next.length ? '' : ' disabled'}>${esc(tr('v.book'))}</button>
    </article>`;
  }

  function renderCards(): void {
    if (!cards) return;
    const list = doctors.slice(0, limit);
    if (!list.length) {
      if (variant === 'home') {
        section!.hidden = true;
        return;
      }
      cards.innerHTML = `<p class="v-empty glass">${esc(tr('v.empty'))} <a href="${esc(clinicPhoneHref)}">${esc(clinicPhone)}</a></p>`;
      return;
    }
    section!.hidden = false;
    cards.innerHTML = list.map(cardHtml).join('');
    if (foot) foot.hidden = false;
    cards.querySelectorAll<HTMLButtonElement>('[data-v-book]').forEach((btn) =>
      btn.addEventListener('click', () => open(btn.dataset.vBook ?? '')),
    );
  }

  async function load(force = false): Promise<void> {
    const content = await loadSiteContent(force);
    if (!content) {
      if (variant === 'home') {
        section!.hidden = true;
        return;
      }
      cards!.innerHTML = `<div class="v-empty glass"><p>${esc(tr('v.failed'))}</p><button class="btn btn-ghost btn-sm" type="button" data-v-retry>${esc(tr('v.retry'))}</button></div>`;
      cards!.querySelector('[data-v-retry]')?.addEventListener('click', () => {
        cards!.innerHTML = `<p class="v-empty">${esc(tr('v.loading'))}</p>`;
        void load(true);
      });
      return;
    }
    doctors = content.visiting;
    renderCards();

    // #v-<id> havolasi bilan kelgan bo'lsa — darhol yozilish oynasi.
    const wanted = location.hash.match(/^#yozilish-(v-[a-z0-9]+)$/)?.[1];
    if (wanted && doctors.some((d) => d.id === wanted)) void open(wanted);
  }

  /* ---------------- yozilish oynasi ---------------- */

  const headHtml = (d: PublicVisitingDoctor) => `<div class="v-dhead">
      ${photoHtml(d, 'v-dph')}
      <div><div class="v-spec">${esc(textOf(d.specialty, lang))}</div><div class="v-dname">${esc(textOf(d.name, lang))}</div></div>
      <span class="v-dprice">${esc(sum(d.price))}</span>
    </div>`;

  function renderForm(message = ''): void {
    const d = state.doctor;
    if (!d || !body) return;
    const day = state.days.find((x) => x.date === state.date);
    const anyFree = state.days.some((x) => x.slots.length);

    const days = state.days
      .map((x) => {
        const free = x.slots.length > 0;
        const wd = WEEKDAY_SHORT[lang][weekdayOfKey(x.date)] ?? '';
        const [, , dd] = x.date.split('-');
        return `<button type="button" class="v-day${x.date === state.date ? ' on' : ''}" data-day="${x.date}"${
          free ? '' : ' disabled'
        } aria-pressed="${x.date === state.date}">
          <span class="wd">${esc(wd)}</span><b>${Number(dd)}</b><span class="mo">${esc(free ? dayMonth(x.date, lang).replace(/^\d+[- ]/, '').slice(0, 3) : tr('f.full'))}</span>
        </button>`;
      })
      .join('');

    const times = day
      ? day.slots.length
        ? day.slots
            .map(
              (t) =>
                `<button type="button" class="v-slot${t === state.time ? ' on' : ''}" data-time="${t}" aria-pressed="${t === state.time}">${t}</button>`,
            )
            .join('')
        : `<p class="v-muted">${esc(tr('f.noSlots'))}</p>`
      : '';

    body.innerHTML = `${headHtml(d)}
      ${
        anyFree
          ? `<form class="v-form" novalidate>
        <fieldset><legend>${esc(tr('f.day'))}</legend><div class="v-days">${days}</div></fieldset>
        <fieldset ${day ? '' : 'hidden'}><legend>${esc(tr('f.time'))}${day ? ` · ${esc(dayLabel(day.date))}` : ''}</legend><div class="v-slots">${times}</div></fieldset>
        <label class="v-fld"><span>${esc(tr('f.name'))}</span>
          <input name="name" type="text" autocomplete="name" maxlength="80" placeholder="${esc(tr('f.name.ph'))}" value="${esc(state.name)}" required></label>
        <label class="v-fld"><span>${esc(tr('f.phone'))}</span>
          <input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="+998 90 123 45 67" value="${esc(state.phone)}" required></label>
        <input class="v-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="v-msg" role="alert">${esc(message)}</p>
        <button class="btn v-wide" type="submit">${esc(tr('f.continue'))}</button>
        <p class="v-note">${esc(tr('f.note'))}</p>
      </form>`
          : `<p class="v-muted">${esc(tr('f.noDays'))} <a href="${esc(clinicPhoneHref)}">${esc(clinicPhone)}</a></p>`
      }`;

    const form = body.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const phoneInput = form.elements.namedItem('phone') as HTMLInputElement;
    const keep = () => {
      state.name = nameInput.value;
      state.phone = phoneInput.value;
    };
    form.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((b) =>
      b.addEventListener('click', () => {
        keep();
        state.date = b.dataset.day ?? '';
        state.time = '';
        renderForm();
        body.querySelector<HTMLButtonElement>('.v-slot')?.focus({ preventScroll: true });
      }),
    );
    form.querySelectorAll<HTMLButtonElement>('[data-time]').forEach((b) =>
      b.addEventListener('click', () => {
        keep();
        state.time = b.dataset.time ?? '';
        form.querySelectorAll('.v-slot').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
      }),
    );
    phoneInput.addEventListener('blur', () => {
      const p = parsePhone(phoneInput.value);
      if (p.ok) phoneInput.value = formatPhone(p.value);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      keep();
      const hp = (form.elements.namedItem('website') as HTMLInputElement).value;
      const msg = form.querySelector<HTMLElement>('.v-msg');
      const fail = (text: string, focus?: HTMLElement | null) => {
        if (msg) msg.textContent = text;
        focus?.focus();
      };
      if (!state.date) return fail(tr('e.pickDay'), form.querySelector<HTMLElement>('.v-day:not(:disabled)'));
      if (!state.time) return fail(tr('e.pickTime'), form.querySelector<HTMLElement>('.v-slot'));
      if (!checkPatientName(state.name).ok) return fail(tr('e.name'), nameInput);
      const phone = parsePhone(state.phone);
      if (!phone.ok) return fail(tr('e.phone'), phoneInput);
      state.phone = formatPhone(phone.value);
      if (hp) return fail(tr('e.server'));
      state.step = 'confirm';
      renderConfirm();
    });
  }

  function renderConfirm(message = ''): void {
    const d = state.doctor;
    if (!d || !body) return;
    const name = checkPatientName(state.name);
    body.innerHTML = `${headHtml(d)}
      <h3 class="v-h">${esc(tr('c.title'))}</h3>
      <dl class="v-sum">
        <div><dt>${esc(tr('c.doctor'))}</dt><dd>${esc(textOf(d.name, lang))} · ${esc(textOf(d.specialty, lang))}</dd></div>
        <div><dt>${esc(tr('c.when'))}</dt><dd>${esc(dayLabel(state.date))}, ${esc(state.time)}</dd></div>
        <div><dt>${esc(tr('c.patient'))}</dt><dd>${esc(name.ok ? name.value : state.name)}</dd></div>
        <div><dt>${esc(tr('c.phone'))}</dt><dd>${esc(state.phone)}</dd></div>
        <div class="total"><dt>${esc(tr('c.price'))}</dt><dd>${esc(sum(d.price))}</dd></div>
      </dl>
      <div class="v-pay" role="note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg>
        <div><b>${esc(tr('c.payTitle'))}</b><span>${esc(
          d.price > 0 ? tr('c.payText').replace('{sum}', sum(d.price)) : tr('c.payFree'),
        )}</span></div>
      </div>
      <p class="v-msg" role="alert">${esc(message)}</p>
      <div class="v-actions">
        <button class="btn btn-ghost" type="button" data-v-edit>${esc(tr('c.edit'))}</button>
        <button class="btn" type="button" data-v-confirm>${esc(tr('c.confirm'))}</button>
      </div>`;
    body.querySelector('[data-v-edit]')?.addEventListener('click', () => {
      state.step = 'form';
      renderForm();
    });
    const confirmBtn = body.querySelector<HTMLButtonElement>('[data-v-confirm]');
    confirmBtn?.addEventListener('click', () => void submit(confirmBtn));
    confirmBtn?.focus();
  }

  async function submit(btn: HTMLButtonElement): Promise<void> {
    const d = state.doctor;
    if (!d || state.busy) return;
    state.busy = true;
    btn.disabled = true;
    btn.textContent = tr('c.sending');
    try {
      const res = await fetch('/api/visiting-book', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          doctor: d.id,
          date: state.date,
          time: state.time,
          name: state.name,
          phone: state.phone,
          lang,
          website: '',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (res.ok) {
        state.step = 'done';
        renderDone();
        return;
      }
      const text = errorText(data.code, lang) ?? data.error ?? tr('e.server');
      // Vaqt band bo'lib qolgan — yangi bo'sh vaqtlar bilan formaga qaytamiz.
      if (data.code === 'taken' || data.code === 'too_soon' || data.code === 'bad_slot') {
        state.time = '';
        await loadDays();
        state.step = 'form';
        renderForm(text);
        return;
      }
      if (data.code === 'name' || data.code === 'phone') {
        state.step = 'form';
        renderForm(text);
        return;
      }
      renderConfirm(text);
    } catch {
      renderConfirm(tr('e.network'));
    } finally {
      state.busy = false;
    }
  }

  function renderDone(): void {
    const d = state.doctor;
    if (!d || !body) return;
    body.innerHTML = `<div class="v-done">
        <div class="v-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg></div>
        <h3 class="v-h">${esc(tr('s.title'))}</h3>
        <p class="v-done-when"><b>${esc(textOf(d.name, lang))}</b> · ${esc(textOf(d.specialty, lang))}<br>${esc(dayLabel(state.date))}, ${esc(state.time)}</p>
        <div class="v-pay"><div><b>${esc(tr('c.payTitle'))}</b><span>${esc(
          d.price > 0 ? tr('c.payText').replace('{sum}', sum(d.price)) : tr('c.payFree'),
        )}</span></div></div>
        <p class="v-muted">${esc(tr('s.text'))}</p>
        <p class="v-muted">${esc(tr('s.call'))} <a href="${esc(clinicPhoneHref)}">${esc(clinicPhone)}</a></p>
        <button class="btn v-wide" type="button" data-v-close>${esc(tr('s.done'))}</button>
      </div>`;
    body.querySelector('[data-v-close]')?.addEventListener('click', () => dialog!.close());
    body.querySelector<HTMLButtonElement>('[data-v-close]')?.focus();
  }

  async function loadDays(): Promise<boolean> {
    const d = state.doctor;
    if (!d) return false;
    try {
      const res = await fetch(`/api/visiting-slots?doctor=${encodeURIComponent(d.id)}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = (await res.json()) as { days: Day[]; price?: number };
      state.days = data.days ?? [];
      if (typeof data.price === 'number') d.price = data.price;
      if (!state.days.some((x) => x.date === state.date && x.slots.length)) {
        state.date = state.days.find((x) => x.slots.length)?.date ?? '';
      }
      return true;
    } catch {
      return false;
    }
  }

  async function open(id: string): Promise<void> {
    const d = doctors.find((x) => x.id === id);
    if (!d || !body) return;
    Object.assign(state, { doctor: { ...d }, days: [], date: '', time: '', step: 'form', busy: false });
    body.innerHTML = `${headHtml(d)}<p class="v-muted">${esc(tr('v.loading'))}</p>`;
    if (!dialog!.open) dialog!.showModal();
    const ok = await loadDays();
    if (!ok) {
      body.innerHTML = `${headHtml(d)}<p class="v-msg">${esc(tr('e.network'))}</p>
        <button class="btn btn-ghost v-wide" type="button" data-v-retry>${esc(tr('v.retry'))}</button>`;
      body.querySelector('[data-v-retry]')?.addEventListener('click', () => void open(id));
      return;
    }
    renderForm();
  }

  dialog.querySelector('[data-v-x]')?.addEventListener('click', () => dialog.close());
  // Fon (backdrop) bosilsa yopiladi.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (location.hash.startsWith('#yozilish-')) history.replaceState(null, '', location.pathname + location.search);
  });

  void load();
}
