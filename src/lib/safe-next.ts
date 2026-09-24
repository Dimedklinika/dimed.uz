/**
 * Kirishdan keyin qaytiladigan manzil (`/kirish?next=…`).
 *
 * Faqat shu saytning o'zidagi manzil qabul qilinadi, qolgani — `fallback`.
 *
 * "/ bilan boshlansin, // bilan emas" degan oddiy tekshiruv yetmaydi:
 * brauzer manzilni o'zicha o'qiydi va ikkala holat ham begona saytga
 * olib ketardi —
 *   - `/\evil.com` — teskari chiziq oddiy chiziq deb o'qiladi (`//evil.com`);
 *   - `/%09/evil.com` — tab va qator belgilari tashlab yuboriladi.
 * Shuning uchun manzil brauzerning o'zi kabi URL sifatida o'qiladi va
 * manbasi (origin) solishtiriladi.
 *
 * Qaytariladigan qiymat — **to'liq** manzil, faqat yo'l emas:
 * `/a/../..//evil.com` kabi manzilning yo'li `//evil.com` bo'lib qoladi
 * va nisbiy yo'l sifatida yana begona saytga aylanardi.
 */
export function safeNext(
  raw: string | null | undefined,
  origin: string,
  fallback = '/kabinet',
): string {
  if (!raw) return fallback;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}
