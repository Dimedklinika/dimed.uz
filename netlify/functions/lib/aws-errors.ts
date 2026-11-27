/**
 * Yangi jadvallar bilan bog'liq "sozlanmagan" xatolari.
 *
 * Kod `master` ga jadvallardan (`npm run create-visiting-tables`) oldin
 * tushishi mumkin, yoki IAM foydalanuvchisiga yangi jadvallar ruxsati
 * berilmagan bo'lishi mumkin. Bunday holatda ommaviy sahifa jim turishi
 * (bo'lim ko'rinmaydi), admin esa nima qilish kerakligini aniq ko'rishi kerak.
 */
const nameOf = (err: unknown): string => (err as { name?: string } | null)?.name ?? '';

/** Jadval yaratilmagan. */
export const isMissingTable = (err: unknown): boolean => nameOf(err) === 'ResourceNotFoundException';

/** IAM yangi jadvalga ruxsat bermaydi. */
export const isAccessDenied = (err: unknown): boolean =>
  nameOf(err) === 'AccessDeniedException' || nameOf(err) === 'UnrecognizedClientException';

/** Sozlash xatosi bo'lsa — admin uchun tushunarli matn, aks holda null. */
export function setupProblem(err: unknown): string | null {
  if (isMissingTable(err)) {
    return 'Jadvallar hali yaratilmagan: kompyuterda `npm run create-visiting-tables` ni ishga tushiring (docs/TASHRIF-SHIFOKORLAR.md, 2-qadam).';
  }
  if (isAccessDenied(err)) {
    return 'AWS ruxsati yetmaydi: IAM foydalanuvchisiga dimed_visiting_doctors, dimed_visiting_bookings (va uning indekslari), dimed_site_media jadvallarini qo‘shing.';
  }
  return null;
}
