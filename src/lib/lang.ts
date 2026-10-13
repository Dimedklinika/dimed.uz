/**
 * Brauzerdagi til tanlovi (uz / ru / en).
 *
 * Tartib: sahifaning o'z tili (`data-page-lang`) → `?lang=` parametri → manzildagi til prefiksi (`/ru/`, `/en/`)
 * → localStorage (`dimed_lang`) → sahifa `<html lang>` → uz.
 *
 * Manzil har doim ustun: ommaviy sahifalar uch tilda alohida yig'iladi,
 * shuning uchun `/ru/` ni ochgan odam kabinetda bir marta o'zbekchani
 * tanlagan bo'lsa ham ruscha ko'rishi kerak. Tanlov localStorage'da
 * eslab qolinadi — keyingi kabinet sahifalari ham shu tilda chiqadi.
 */
import { isLang, t, type Lang } from '../data/i18n';

const KEY = 'dimed_lang';

/** `/ru/...` yoki `/en/...` — ommaviy sahifalarning til prefiksi. */
function fromPath(): Lang | null {
  const first = location.pathname.split('/')[1];
  return isLang(first) ? first : null;
}

export function getLang(): Lang {
  try {
    /*
      Ommaviy sahifa (Base `lang` bergan) o'z tilini `data-page-lang` da
      e'lon qiladi. U har doim ustun: aks holda `/` (o'zbekcha) sahifada
      localStorage'dagi eski "ru" tufayli bron vidjeti va menyu ruscha
      chiqib, sahifa uch tilda aralash ko'rinardi.
    */
    const pageLang = document.documentElement.dataset.pageLang;
    if (isLang(pageLang)) {
      localStorage.setItem(KEY, pageLang);
      return pageLang;
    }
    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (isLang(fromUrl)) {
      localStorage.setItem(KEY, fromUrl);
      return fromUrl;
    }
    const inPath = fromPath();
    if (inPath) {
      localStorage.setItem(KEY, inPath);
      return inPath;
    }
    const stored = localStorage.getItem(KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* localStorage yopiq bo'lishi mumkin (maxfiy rejim) — uz qoladi */
  }
  const fromHtml = document.documentElement.lang;
  return isLang(fromHtml) ? fromHtml : 'uz';
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* saqlanmasa ham joriy sahifada ishlaydi */
  }
  document.documentElement.lang = lang;
}

/**
 * Sahifadagi `[data-lang]` bloklardan faqat tanlangan tilnikini
 * ko'rsatadi va `[data-lang-pick]` tugmalarni belgilaydi. Tarjimasi
 * bo'lmagan blok (faqat uz) doim ko'rinadi.
 */
export function applyLang(lang: Lang, root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-lang]').forEach((el) => {
    el.hidden = el.dataset.lang !== lang;
  });
  root.querySelectorAll<HTMLElement>('[data-lang-pick]').forEach((btn) => {
    const on = btn.dataset.langPick === lang;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

/** Til tugmalarini ulaydi: bosilganda saqlaydi va bloklarni almashtiradi. */
export function bindLangSwitch(root: ParentNode = document, onChange?: (lang: Lang) => void): Lang {
  const current = getLang();
  applyLang(current, root);
  root.querySelectorAll<HTMLElement>('[data-lang-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.langPick;
      if (!isLang(lang)) return;
      setLang(lang);
      applyLang(lang, root);
      onChange?.(lang);
    });
  });
  return current;
}

/**
 * Serverda o'zbekcha yozilgan matnni tanlangan tilga almashtiradi.
 *
 * `data-t="kalit"` — tugun matni, `data-t-placeholder="kalit"` —
 * input'ning placeholder'i. Statik HTML o'zbekcha bo'lib qoladi:
 * JS o'chiq bo'lsa ham sahifa o'qiladi, bo'sh emas.
 */
export function applyPageLang(lang: Lang, root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    const key = el.dataset.t;
    if (key) el.textContent = t(key as Parameters<typeof t>[0], lang);
  });
  root.querySelectorAll<HTMLElement>('[data-t-placeholder]').forEach((el) => {
    const key = el.dataset.tPlaceholder;
    if (key && el instanceof HTMLInputElement) {
      el.placeholder = t(key as Parameters<typeof t>[0], lang);
    }
  });
}
