/**
 * 1C dan kelgan tahlil va ko'rsatkich nomlarini o'zbekcha rasmiy tibbiy
 * atamalarga o'giruvchi lug'at (I1).
 *
 * Muammo: 1C (MedHisob) tahlil nomlarini ba'zan ruscha ("Билирубин
 * общий", "Гемоглобин") yoki texnik shaklda yuboradi. Bemor kabinetda
 * va PDF blankda o'zbekcha rasmiy nomni ko'rishi kerak.
 *
 * Qoida:
 *   - lug'atda mos kelsa — o'zbekcha rasmiy atama qaytadi;
 *   - mos kelmasa — asl nom o'zgarishsiz saqlanadi (fallback), ya'ni
 *     yangi tahlil qo'shilsa ham bemor bo'sh joy emas, biror nom ko'radi.
 *
 * Lug'at kalitlari — **ruscha va texnik** shakllar. O'zbekcha nomlar
 * (masalan "Gemoglobin", "Kreatinin") lug'atga kiritilmaydi: ular allaqachon
 * to'g'ri va fallback orqali o'zgarishsiz o'tadi. O'zbekcha chiqishlar
 * `panels.ts` dagi belgilar bilan bir xil yoziladi — shunda nom
 * o'girilgach ham panel (tahlil) to'g'ri tanilaveradi.
 */

/**
 * Taqqoslash uchun normallashtirish — `panels.ts` bilan bir xil qoida:
 * kichik harf, apostrof va bo'shliqlarsiz. Kirill ham qamraladi
 * (`\p{L}`), shuning uchun "Гемоглобин" va "гемоглобин" bir xil kalit.
 */
const norm = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[ʻʼ’‘`´']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/* Ko'rsatkich (analit) nomlari: ruscha/texnik → o'zbekcha rasmiy. */
const ANALYTES: Record<string, string> = {
  // --- umumiy qon tahlili ---
  Гемоглобин: 'Gemoglobin',
  Эритроциты: 'Eritrotsitlar',
  Лейкоциты: 'Leykotsitlar',
  Тромбоциты: 'Trombotsitlar',
  Гематокрит: 'Gematokrit',
  СОЭ: 'Eritrotsitlar choʻkish tezligi',
  'Скорость оседания эритроцитов': 'Eritrotsitlar choʻkish tezligi',
  'Цветной показатель': 'Rangli koʻrsatkich',
  'Средний объём эритроцитов': 'Eritrotsitlar oʻrtacha hajmi',
  MCV: 'Eritrotsitlar oʻrtacha hajmi',
  Лимфоциты: 'Limfotsitlar',
  Моноциты: 'Monotsitlar',
  Эозинофилы: 'Eozinofillar',
  Базофилы: 'Bazofillar',
  'Нейтрофилы сегментоядерные': 'Segment yadroli neytrofil',
  'Сегментоядерные нейтрофилы': 'Segment yadroli neytrofil',
  'Нейтрофилы палочкоядерные': 'Tayoqcha yadroli neytrofil',
  'Палочкоядерные нейтрофилы': 'Tayoqcha yadroli neytrofil',

  // --- biokimyo ---
  Глюкоза: 'Glyukoza',
  'Глюкоза крови': 'Glyukoza',
  Мочевина: 'Mochevina',
  Креатинин: 'Kreatinin',
  'Общий белок': 'Umumiy oqsil',
  Альбумин: 'Albumin',
  'Билирубин общий': 'Umumiy bilirubin',
  'Общий билирубин': 'Umumiy bilirubin',
  'Билирубин прямой': 'Bogʻlangan bilirubin',
  'Прямой билирубин': 'Bogʻlangan bilirubin',
  'Билирубин связанный': 'Bogʻlangan bilirubin',
  'Связанный билирубин': 'Bogʻlangan bilirubin',
  'Билирубин непрямой': 'Bogʻlanmagan bilirubin',
  'Непрямой билирубин': 'Bogʻlanmagan bilirubin',
  Холестерин: 'Xolesterin',
  'Холестерин общий': 'Xolesterin',
  Триглицериды: 'Triglitseridlar',
  АЛТ: 'ALT (alaninaminotransferaza)',
  Аланинаминотрансфераза: 'ALT (alaninaminotransferaza)',
  АСТ: 'AST (aspartataminotransferaza)',
  Аспартатаминотрансфераза: 'AST (aspartataminotransferaza)',
  'Щелочная фосфатаза': 'Ishqoriy fosfataza',
  Амилаза: 'Amilaza',
  Кальций: 'Kalsiy',
  Калий: 'Kaliy',
  Натрий: 'Natriy',
  Железо: 'Temir',
  'Мочевая кислота': 'Siydik kislotasi',
  'С-реактивный белок': 'C-reaktiv oqsil',
  СРБ: 'C-reaktiv oqsil',
  'Ревматоидный фактор': 'Revmatoid faktor',
  'Антистрептолизин-О': 'Antistreptolizin-O',
  АСЛО: 'Antistreptolizin-O',

  // --- koagulogramma ---
  Фибриноген: 'Fibrinogen',
  'Протромбиновый индекс': 'Protrombin indeksi',
  ПТИ: 'Protrombin indeksi',
  'Протромбиновое время': 'Protrombin vaqti',
  МНО: 'MHO',
  АЧТВ: 'Qisman tromboplastin faollanish vaqti',
  'Тромбиновое время': 'Trombin vaqti',

  // --- siydik ---
  Цвет: 'Rangi',
  Прозрачность: 'Tiniqligi',
  'Удельный вес': 'Nisbiy zichligi',
  'Относительная плотность': 'Nisbiy zichligi',
  Реакция: 'Siydik kislotalilik darajasi',
  Белок: 'Oqsil',
  Нитриты: 'Nitritlar',
  Уробилиноген: 'Urobilinogen',
  'Кетоновые тела': 'Atseton',
  Ацетон: 'Atseton',
  'Эпителий плоский': 'Epiteliy yassi',
  Слизь: 'Shilliq',
  Бактерии: 'Bakteriyalar',
  Соли: 'Tuzlar',

  // --- gormonlar (qalqonsimon bez) ---
  ТТГ: 'TTG',
  'Т4 свободный': 'Erkin T4',
  'Свободный Т4': 'Erkin T4',
  'Т3 свободный': 'Erkin T3',
  'Свободный Т3': 'Erkin T3',
};

/* Tahlil (panel) nomlari: ruscha/texnik va o'zbekcha kanonik → o'zbekcha
   nom + sayt lug'ati kaliti (ko'p tilli sarlavha uchun). */
type PanelName = { uz: string; key?: string };
const PANELS: { match: string; uz: string; key?: string }[] = [
  { match: 'Общий анализ крови', uz: 'Umumiy qon tahlili', key: 'panel.cbc' },
  { match: 'ОАК', uz: 'Umumiy qon tahlili', key: 'panel.cbc' },
  { match: 'Общий анализ крови с лейкоформулой', uz: 'Umumiy qon tahlili (leykoformula bilan)', key: 'panel.cbc' },
  { match: 'Umumiy qon tahlili', uz: 'Umumiy qon tahlili', key: 'panel.cbc' },
  { match: 'Общий анализ мочи', uz: 'Umumiy siydik tahlili', key: 'panel.urine' },
  { match: 'ОАМ', uz: 'Umumiy siydik tahlili', key: 'panel.urine' },
  { match: 'Umumiy siydik tahlili', uz: 'Umumiy siydik tahlili', key: 'panel.urine' },
  { match: 'Общий анализ кала', uz: 'Najas tahlili', key: 'panel.stool' },
  { match: 'Копрограмма', uz: 'Najas tahlili', key: 'panel.stool' },
  { match: 'Najas tahlili', uz: 'Najas tahlili', key: 'panel.stool' },
  { match: 'Биохимический анализ крови', uz: 'Biokimyoviy qon tahlili', key: 'panel.biochem' },
  { match: 'Биохимия крови', uz: 'Biokimyoviy qon tahlili', key: 'panel.biochem' },
  { match: 'Biokimyoviy qon tahlili', uz: 'Biokimyoviy qon tahlili', key: 'panel.biochem' },
  { match: 'Коагулограмма', uz: 'Koagulogramma', key: 'panel.coagulogram' },
  { match: 'Koagulogramma', uz: 'Koagulogramma', key: 'panel.coagulogram' },
  { match: 'Ревмопробы', uz: 'Revmoproba', key: 'panel.rheuma' },
  { match: 'Revmoproba', uz: 'Revmoproba', key: 'panel.rheuma' },
  { match: 'TORCH', uz: 'TORCH infeksiyalari', key: 'panel.torch' },
  { match: 'ТОРЧ', uz: 'TORCH infeksiyalari', key: 'panel.torch' },
  { match: 'TORCH infeksiyalari', uz: 'TORCH infeksiyalari', key: 'panel.torch' },
  { match: 'Ekspress testlar', uz: 'Ekspress testlar', key: 'panel.express' },
];

const analyteMap = new Map<string, string>();
for (const [ru, uz] of Object.entries(ANALYTES)) analyteMap.set(norm(ru), uz);

const panelMap = new Map<string, PanelName>();
for (const p of PANELS) panelMap.set(norm(p.match), { uz: p.uz, key: p.key });

/**
 * Ko'rsatkich nomini o'zbekchaga o'giradi; lug'atda bo'lmasa —
 * asl nomni (bo'shliqlarsiz) qaytaradi.
 */
export function translateAnalyte(raw: string): string {
  const clean = raw.trim();
  if (!clean) return clean;
  return analyteMap.get(norm(clean)) ?? clean;
}

/**
 * Tahlil (panel) nomini o'zbekchaga o'giradi. Ma'lum panelga tegishli
 * bo'lsa sayt lug'ati kaliti (`panel.cbc`) ham qaytadi — sarlavha
 * uch tilda ko'rsatiladi. Aks holda asl nom fallback bo'ladi.
 */
export function translateAnalysisName(raw: string): { title: string; key?: string } {
  const clean = raw.trim();
  const hit = panelMap.get(norm(clean));
  if (hit) return hit.key ? { title: hit.uz, key: hit.key } : { title: hit.uz };
  return { title: clean };
}
