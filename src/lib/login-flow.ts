import { formatPhone } from './phone';

/**
 * «Kodni olish» — bir tugmali kirish (kirish sahifasi va bron vidjeti uchun umumiy).
 *
 * Tugma bosilganda sayt `/api/auth-start` da nonce ochadi va foydalanuvchini
 * `t.me/<bot>?start=kirish_<nonce>` havolasiga yo'naltiradi. Bot telefonni
 * kirish sessiyasiga yozib kod yuboradi; sayt nonce'ni poll qilib telefonni
 * oldindan to'ldiradi. Kod baribir qo'lda kiritiladi — xavfsizlik chegarasi shu.
 */
export type CodeFlowText = {
  opening: string;
  waiting: string;
  codeSent: string;
  expired: string;
  getCodeAgain: string;
};

export type CodeFlowOptions = {
  /** Bosiladigan havola; `href` — auth-start ishlamasa ochiladigan oddiy bot havolasi. */
  button: HTMLAnchorElement;
  /** Tugma ichidagi matn elementi (qayta olishda matni almashadi). */
  label?: HTMLElement | null;
  status: HTMLElement;
  phone: HTMLInputElement;
  /** Kod kelgach fokus beriladigan maydon. */
  codeFocus: () => void;
  text: CodeFlowText;
  /** Tugma birinchi marta bosilganda (2-qadamni "ochish" uchun). */
  onStart?: () => void;
};

const POLL_EVERY_MS = 2500;
const POLL_FOR_MS = 3.5 * 60 * 1000;

export function setupCodeFlow(opts: CodeFlowOptions): void {
  const { button, status, phone, text } = opts;
  let timer: ReturnType<typeof setInterval> | undefined;
  let until = 0;

  const setStatus = (value: string, kind: 'ok' | 'error' | '' = '') => {
    status.textContent = value;
    status.className = `hint${kind ? ` ${kind}` : ''}`;
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  async function pollOnce(nonce: string): Promise<void> {
    if (Date.now() > until) return stop();
    try {
      const res = await fetch(`/api/auth-start?nonce=${encodeURIComponent(nonce)}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { status: string; phone?: string | null };
      if (data.status === 'ready') {
        stop();
        if (data.phone) phone.value = formatPhone(data.phone);
        setStatus(text.codeSent, 'ok');
        if (opts.label) opts.label.textContent = text.getCodeAgain;
        if (phone.value) opts.codeFocus();
        else phone.focus();
      } else if (data.status === 'expired') {
        stop();
        setStatus(text.expired, 'error');
      }
    } catch {
      /* tarmoq — keyingi urinishda qayta so'raladi */
    }
  }

  button.addEventListener('click', async (e) => {
    /*
      Popup bloklovchisi ishga tushmasin: bo'sh oynani darhol (foydalanuvchi
      bosishi ichida) ochamiz, nonce olgach uni Telegramga yo'naltiramiz.
    */
    e.preventDefault();
    const tgWin = window.open('about:blank', '_blank');
    setStatus(text.opening);
    opts.onStart?.();

    let deepLink = button.href;
    let nonce: string | null = null;
    try {
      const res = await fetch('/api/auth-start', { method: 'POST', credentials: 'same-origin' });
      if (res.ok) {
        const data = (await res.json()) as { nonce: string; deepLink: string };
        nonce = data.nonce;
        deepLink = data.deepLink;
      }
    } catch {
      /* auth-start ishlamasa — oddiy bot havolasi ochiladi */
    }

    if (tgWin) tgWin.location.href = deepLink;
    else window.location.href = deepLink;

    if (nonce) {
      setStatus(text.waiting);
      stop();
      until = Date.now() + POLL_FOR_MS;
      const n = nonce;
      timer = setInterval(() => void pollOnce(n), POLL_EVERY_MS);
    }
  });
}
