/**
 * Shifokorning qo'shimcha xizmatlari: massaj, qorin bo'shlig'i UZI, qayta ko'rik ...
 *
 * Asosiy qabul narxi (`doctors.price`) o'zgarmaydi — u "asosiy xizmat"
 * (`MAIN_SERVICE_ID`). Shifokorda qo'shimcha xizmat bo'lsa, bron vidjeti
 * bemorga tanlov beradi (asosiy qabul + qo'shimchalar); bo'lmasa hammasi
 * avvalgidek ishlaydi.
 *
 * Admin xizmatlarni matn bilan kiritadi — har qatorda bittadan:
 *
 *   Nomi | narx | 1C kodi | qayta:14
 *
 * `narx` — so'm yoki "bepul"; `1C kodi` (Catalog.GoodsAndServices kodi) va
 * `qayta:N` ixtiyoriy, tartibi erkin. `qayta:10` — "qayta ko'rik": shu
 * shifokorga oddiy qabulga kelgan bemor qabuldan keyin 10 kun ichida
 * necha marta bo'lsa ham oladi (lib/appointments.ts, followupCheck).
 * Qayta ko'rikni bepul qilish — narxni 0 qilish: `Qayta ko'rik | bepul | qayta:10`.
 */

export const MAIN_SERVICE_ID = 'main';
export const MAX_SERVICES = 12;
const MAX_PRICE = 100_000_000;

export type DoctorService = {
  /** Sayt ichidagi kalit (nomdan hosil qilinadi). */
  id: string;
  name: string;
  /** so'm; 0 — bepul */
  price: number;
  /** 1C `Catalog.GoodsAndServices` kodi — navbat 1C ga o'tganda xizmatni topish uchun. */
  code?: string;
  /** Qayta ko'rik: oddiy qabuldan keyin shuncha kun ichida (shu shifokorga kelgan bo'lish shart). */
  followup_days?: number;
};

/** Saytga (vidjet, /api/doctors) chiqadigan shakl — 1C kodi ko'rinmaydi. */
export type PublicService = {
  id: string;
  name: string;
  price: number;
  followupDays: number | null;
};

/** Bron paytida tanlangan xizmat (asosiy qabul ham shu shaklda). */
export type ChosenService = {
  id: string;
  /** Asosiy qabulda bo'sh — nomi bron yozuviga yozilmaydi. */
  name: string;
  price: number;
  code?: string;
  followupDays?: number;
  main: boolean;
};

export type ParsedServices = { ok: true; services: DoctorService[] } | { ok: false; error: string };

/** Nomdan lotincha kalit: "Qorin bo'shlig'i UZI" → "qorin-boshligi-uzi". */
const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[ʻʼ’‘`']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');

/** "50000", "50 000", "50.000" yoki "bepul" → so'm; boshqasi — null. */
function parsePrice(raw: string | undefined): number | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (text === 'bepul' || text === 'free' || text === 'бесплатно') return 0;
  const digits = text.replace(/[\s.,]/g, '');
  if (!/^\d{1,9}$/.test(digits)) return null;
  const value = Number(digits);
  return value <= MAX_PRICE ? value : null;
}

/**
 * Admin kiritgan matnni xizmatlar ro'yxatiga aylantiradi.
 * Xato bo'lsa — qator raqami bilan tushunarli xabar.
 */
export function parseServices(text: unknown): ParsedServices {
  const lines = (typeof text === 'string' ? text : '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > MAX_SERVICES) {
    return { ok: false, error: `Xizmatlar ${MAX_SERVICES} tadan oshmasin (${lines.length} ta kiritildi)` };
  }

  const services: DoctorService[] = [];
  const used = new Set<string>([MAIN_SERVICE_ID]);

  for (const [index, line] of lines.entries()) {
    const at = `${index + 1}-qator`;
    const [nameRaw, priceRaw, ...rest] = line.split('|').map((part) => part.trim());

    const name = nameRaw ?? '';
    if (name.length < 2 || name.length > 60) {
      return { ok: false, error: `${at}: xizmat nomi 2–60 belgi bo‘lsin` };
    }

    const price = parsePrice(priceRaw);
    if (price === null) {
      return { ok: false, error: `${at}: narx son bo‘lishi kerak (masalan 50000) yoki “bepul”` };
    }

    let code: string | undefined;
    let followupDays: number | undefined;
    for (const token of rest) {
      if (!token) continue;
      const follow = token.match(/^qayta\s*:\s*(\d{1,3})$/i);
      if (follow) {
        const days = Number(follow[1]);
        if (days < 1 || days > 365) return { ok: false, error: `${at}: qayta:N — N 1 dan 365 gacha bo‘lsin` };
        if (followupDays !== undefined) return { ok: false, error: `${at}: “qayta:” ikki marta yozilgan` };
        followupDays = days;
      } else {
        if (code !== undefined) return { ok: false, error: `${at}: ortiqcha qism “${token}” (nomi | narx | 1C kodi | qayta:N)` };
        if (token.length > 40) return { ok: false, error: `${at}: 1C kodi 40 belgidan oshmasin` };
        code = token;
      }
    }

    // Kalit nomdan; takrorlansa raqam qo'shiladi. Lotincha harfi yo'q nom (kirill) — x1, x2 ...
    const base = slugOf(name) || `x${index + 1}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);

    services.push({
      id,
      name,
      price,
      ...(code ? { code } : {}),
      ...(followupDays ? { followup_days: followupDays } : {}),
    });
  }

  return { ok: true, services };
}

/** Ro'yxatni tahrirlash uchun matnga qaytaradi (`parseServices` ning teskarisi). */
export function formatServices(services: readonly DoctorService[] | undefined): string {
  return (services ?? [])
    .map((s) =>
      [s.name, s.price === 0 ? 'bepul' : String(s.price), s.code ?? '', s.followup_days ? `qayta:${s.followup_days}` : '']
        // Bo'sh kod o'rtada qolmasin ("nomi | 0 | | qayta:14" o'rniga "nomi | 0 | qayta:14").
        .filter((part, i) => i < 2 || part !== '')
        .join(' | '),
    )
    .join('\n');
}

export function toPublicServices(services: readonly DoctorService[] | undefined): PublicService[] {
  return (services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    followupDays: s.followup_days ?? null,
  }));
}

/**
 * Bron so'ralgan xizmatni topadi. Berilmasa yoki `main` bo'lsa — asosiy
 * qabul (shifokor narxi). Shifokorda bunday xizmat yo'q bo'lsa — null.
 */
export function resolveService(
  doctor: { price: number; services?: readonly DoctorService[] },
  serviceId: unknown,
): ChosenService | null {
  if (serviceId === undefined || serviceId === null || serviceId === '' || serviceId === MAIN_SERVICE_ID) {
    return { id: MAIN_SERVICE_ID, name: '', price: doctor.price, main: true };
  }
  if (typeof serviceId !== 'string') return null;

  const found = doctor.services?.find((s) => s.id === serviceId);
  if (!found) return null;
  return {
    id: found.id,
    name: found.name,
    price: found.price,
    ...(found.code ? { code: found.code } : {}),
    ...(found.followup_days ? { followupDays: found.followup_days } : {}),
    main: false,
  };
}
