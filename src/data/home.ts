import type { Lang } from './i18n';

/**
 * Ommaviy sahifalar matni uch tilda (bosh sahifa va tahlillar).
 *
 * Kabinet matnlari `i18n.ts` da — u brauzerga ham yuklanadi. Bu yerdagi
 * matnlar esa faqat build paytida, serverda kerak: `/`, `/ru/`, `/en/`
 * uchta alohida HTML bo'lib chiqadi. Shuning uchun alohida fayl —
 * marketing matni kabinet sahifalarining JS to'plamiga qo'shilmasin.
 */
type Copy = Record<Lang, string>;

const copy = {
  'meta.title': {
    uz: 'Dimed — koʻp ixtisosli tibbiy markaz',
    ru: 'Dimed — многопрофильный медицинский центр',
    en: 'Dimed — multi-speciality medical centre',
  },
  'meta.description': {
    uz: 'Chinoz shahridagi koʻp ixtisosli tibbiy markaz. Onlayn navbat, zamonaviy diagnostika va tahlillar. Telegram orqali 2 daqiqada bron qiling.',
    ru: 'Многопрофильный медицинский центр в городе Чиноз. Онлайн-запись, современная диагностика и анализы. Бронирование через Telegram за 2 минуты.',
    en: 'A multi-speciality medical centre in Chinoz. Online booking, modern diagnostics and lab tests. Book through Telegram in two minutes.',
  },

  'hero.eyebrow': {
    uz: 'Chinoz · Koʻp ixtisosli tibbiy markaz',
    ru: 'Чиноз · Многопрофильный медицинский центр',
    en: 'Chinoz · Multi-speciality medical centre',
  },
  'hero.title': { uz: 'Shifokorga navbat —', ru: 'Запись к врачу —', en: 'Book a doctor —' },
  'hero.title.grad': {
    uz: 'endi telefoningizda',
    ru: 'теперь в вашем телефоне',
    en: 'now on your phone',
  },
  'hero.sub': {
    uz: 'Boʻlimni tanlang, boʻsh vaqtni band qiling — bron Telegram botda darhol tasdiqlanadi. Tahlil natijalari esa shaxsiy kabinetingizga avtomatik tushadi.',
    ru: 'Выберите отделение и свободное время — бронь сразу подтверждается в Telegram-боте. Результаты анализов автоматически приходят в личный кабинет.',
    en: 'Pick a department and a free slot — the booking is confirmed in the Telegram bot at once. Lab results land in your personal cabinet automatically.',
  },
  'hero.cta': { uz: 'Navbat olish', ru: 'Записаться', en: 'Book a visit' },
  'hero.cta2': {
    uz: 'Boʻlimlar bilan tanishish',
    ru: 'Посмотреть отделения',
    en: 'Browse departments',
  },
  'hero.stat.depts': { uz: 'boʻlim', ru: 'отделений', en: 'departments' },
  'hero.stat.doctors': { uz: 'shifokor', ru: 'врачей', en: 'doctors' },
  'hero.stat.analyses': { uz: 'tahlil turi', ru: 'видов анализов', en: 'lab tests' },
  'hero.stat.daily': { uz: 'har kuni', ru: 'ежедневно', en: 'every day' },

  'feat.tech.title': { uz: 'Yangi texnologiyalar', ru: 'Новые технологии', en: 'Modern technology' },
  'feat.tech.text': {
    uz: 'Aniq va tez diagnostika uchun zamonaviy uskunalar: UTT, EEG, ekspress-laboratoriya. Natijalar kabinetingizga avtomatik yetkaziladi.',
    ru: 'Современное оборудование для точной и быстрой диагностики: УЗИ, ЭЭГ, экспресс-лаборатория. Результаты автоматически приходят в кабинет.',
    en: 'Modern equipment for fast, accurate diagnostics: ultrasound, EEG, express lab. Results are delivered to your cabinet automatically.',
  },
  'feat.docs.title': { uz: 'Malakali shifokorlar', ru: 'Опытные врачи', en: 'Experienced doctors' },
  'feat.docs.text': {
    uz: 'Oliy toifali va 40 yilgacha tajribaga ega tor soha mutaxassislari. Har bir bemorga alohida yondashuv.',
    ru: 'Специалисты высшей категории с опытом до 40 лет. К каждому пациенту — отдельный подход.',
    en: 'Top-category specialists with up to 40 years of practice. An individual approach to every patient.',
  },
  'feat.queue.title': { uz: 'Navbatsiz xizmat', ru: 'Без очередей', en: 'No waiting rooms' },
  'feat.queue.text': {
    uz: 'Onlayn bron — kutish zallarisiz. Qabulingizga 1 soat qolganda Telegram bot sizga eslatma yuboradi.',
    ru: 'Онлайн-бронь без залов ожидания. За час до приёма Telegram-бот пришлёт напоминание.',
    en: 'Book online, skip the waiting room. An hour before your visit the Telegram bot sends a reminder.',
  },

  'dept.eyebrow': { uz: 'Boʻlimlar', ru: 'Отделения', en: 'Departments' },
  'dept.title': {
    uz: 'yoʻnalish — bitta manzilda',
    ru: 'направлений — по одному адресу',
    en: 'specialities — under one roof',
  },
  'dept.text': {
    uz: 'Har bir boʻlimda oʻz sohasining mutaxassislari qabul qiladi. Boʻlimni tanlab, toʻgʻridan-toʻgʻri navbat oling.',
    ru: 'В каждом отделении принимают профильные специалисты. Выберите отделение и запишитесь напрямую.',
    en: 'Each department is staffed by its own specialists. Pick a department and book directly.',
  },
  'dept.count': { uz: 'shifokor', ru: 'врачей', en: 'doctors' },

  'docs.eyebrow': { uz: 'Jamoa', ru: 'Команда', en: 'Our team' },
  'docs.title': { uz: 'Shifokorlarimiz', ru: 'Наши врачи', en: 'Our doctors' },
  'docs.text': {
    uz: 'Qabul jadvali va davomiyligini har bir shifokorning oʻzi belgilaydi — siz esa faqat boʻsh vaqtni tanlaysiz.',
    ru: 'График и длительность приёма каждый врач устанавливает сам — вам остаётся выбрать свободное время.',
    en: 'Every doctor sets their own schedule and visit length — you just pick a free slot.',
  },
  'docs.experience': { uz: 'tajriba', ru: 'опыта', en: 'experience' },
  'docs.slot': { uz: 'qabul:', ru: 'приём:', en: 'visit:' },
  'docs.minutes': { uz: 'daqiqa', ru: 'минут', en: 'minutes' },

  'how.eyebrow': { uz: 'Qanday ishlaydi', ru: 'Как это работает', en: 'How it works' },
  'how.title': {
    uz: 'SMS yoʻq. Parol yoʻq. Faqat Telegram.',
    ru: 'Без SMS. Без паролей. Только Telegram.',
    en: 'No SMS. No passwords. Just Telegram.',
  },
  'how.text': {
    uz: 'Roʻyxatdan oʻtish, kirish, bron tasdigʻi va eslatmalar — hammasi bitta botda.',
    ru: 'Регистрация, вход, подтверждение брони и напоминания — всё в одном боте.',
    en: 'Sign-up, login, booking confirmations and reminders — all in one bot.',
  },
  'how.1.title': {
    uz: 'Botga /start yuborasiz',
    ru: 'Отправляете боту /start',
    en: 'Send /start to the bot',
  },
  'how.1.text.a': { uz: 'Saytdagi tugma sizni', ru: 'Кнопка на сайте откроет бот', en: 'The button on the site opens the' },
  'how.1.text.b': {
    uz: 'botiga olib oʻtadi. Kontaktni ulashasiz — telefon raqami avtomatik bogʻlanadi.',
    ru: '. Вы делитесь контактом — номер телефона привязывается автоматически.',
    en: 'bot. You share your contact and your phone number is linked automatically.',
  },
  'how.2.title': {
    uz: '6 xonali kod bilan kirasiz',
    ru: 'Входите по 6-значному коду',
    en: 'Log in with a 6-digit code',
  },
  'how.2.text': {
    uz: 'Bot bir martalik kod yuboradi. Kodni saytga kiritasiz — shaxsiy kabinetingiz ochiladi. Hech qanday parol eslab qolish shart emas.',
    ru: 'Бот присылает одноразовый код. Вводите его на сайте — открывается личный кабинет. Никаких паролей запоминать не нужно.',
    en: 'The bot sends a one-time code. Enter it on the site and your cabinet opens. No password to remember.',
  },
  'how.3.title': {
    uz: 'Boʻsh slotni tanlaysiz',
    ru: 'Выбираете свободное время',
    en: 'Choose a free slot',
  },
  'how.3.text': {
    uz: 'Boʻlim → shifokor → sana → vaqt. Slotlar shifokorning real jadvalidan koʻrsatiladi.',
    ru: 'Отделение → врач → дата → время. Слоты берутся из реального графика врача.',
    en: 'Department → doctor → date → time. Slots come from the doctor’s real schedule.',
  },
  'how.4.title': {
    uz: 'Bron tayyor — botga tasdiq keladi',
    ru: 'Бронь готова — в бот приходит подтверждение',
    en: 'Booked — the bot confirms it',
  },
  'how.4.text': {
    uz: 'Slot band qilinadi va botga tasdiq keladi. Toʻlov — qabulxona kassasida, qabul kuni. Qabulga 1 soat qolganda eslatma yuboriladi.',
    ru: 'Слот занимается, в бот приходит подтверждение. Оплата — в кассе регистратуры в день приёма. За час до приёма придёт напоминание.',
    en: 'The slot is held and the bot confirms it. Payment is at the reception desk on the day. A reminder arrives an hour before.',
  },
  // Onlayn to'lov yoqilganda bron vidjeti yuqoridagi matnni shunga almashtiradi.
  'how.4.text.online': {
    uz: 'Slot band qilinadi, toʻlov — Payme orqali onlayn. Toʻlovdan soʻng botga tasdiq keladi. Qabulga 1 soat qolganda eslatma yuboriladi.',
    ru: 'Слот занимается, оплата — онлайн через Payme. После оплаты в бот приходит подтверждение. За час до приёма придёт напоминание.',
    en: 'The slot is held and you pay online with Payme. After payment the bot confirms it. A reminder arrives an hour before.',
  },
  'how.rule': {
    uz: 'Qabulga 1 soat qolgunicha boshqa vaqtga koʻchirish yoki bekor qilish mumkin',
    ru: 'Перенести или отменить можно не позднее чем за час до приёма',
    en: 'You can move or cancel up to one hour before the visit',
  },
  'how.phone.alt': {
    uz: 'Telegram bot suhbati namunasi',
    ru: 'Пример переписки с Telegram-ботом',
    en: 'Example of a Telegram bot chat',
  },
  'how.phone.online': { uz: 'onlayn', ru: 'онлайн', en: 'online' },
  'how.chat.hello': {
    uz: 'Assalomu alaykum! Dimed klinikasiga xush kelibsiz. Kirish uchun pastdagi tugma orqali kontaktingizni ulashing.',
    ru: 'Здравствуйте! Добро пожаловать в клинику Dimed. Чтобы войти, поделитесь контактом кнопкой ниже.',
    en: 'Hello! Welcome to the Dimed clinic. To log in, share your contact with the button below.',
  },
  'how.chat.code': { uz: 'Saytga kirish kodingiz:', ru: 'Ваш код для входа:', en: 'Your login code:' },
  'how.chat.code.note': {
    uz: 'Kod 5 daqiqa amal qiladi.',
    ru: 'Код действует 5 минут.',
    en: 'The code is valid for 5 minutes.',
  },
  'how.chat.booked': { uz: '✅ Broningiz tasdiqlandi!', ru: '✅ Бронь подтверждена!', en: '✅ Your booking is confirmed!' },
  'how.chat.doctor': { uz: 'Kardiolog — Ashurov T.A.', ru: 'Кардиолог — Ашуров Т.А.', en: 'Cardiologist — T. Ashurov' },
  'how.chat.when': { uz: 'Seshanba, 12-avgust, 09:15', ru: 'Вторник, 12 августа, 09:15', en: 'Tuesday, 12 August, 09:15' },
  'how.chat.remind': {
    uz: '⏰ Eslatma: qabulingizga 1 soat qoldi.',
    ru: '⏰ Напоминание: до приёма остался час.',
    en: '⏰ Reminder: your visit starts in an hour.',
  },

  'gallery.eyebrow': { uz: 'Klinika', ru: 'Клиника', en: 'The clinic' },
  'gallery.title': {
    uz: 'Bizda shunday',
    ru: 'Как у нас',
    en: 'Inside Dimed',
  },
  'gallery.text': {
    uz: 'Chinoz markazidagi yangi bino, alohida palatalar va oʻz laboratoriyamiz — tahlil uchun boshqa joyga borish shart emas.',
    ru: 'Новое здание в центре Чиноза, отдельные палаты и собственная лаборатория — за анализами никуда ехать не нужно.',
    en: 'A new building in central Chinoz, private rooms and our own laboratory — no need to go elsewhere for tests.',
  },
  'gallery.building': {
    uz: 'Dimed klinikasi binosi — Navoiy koʻchasi, 18',
    ru: 'Здание клиники Dimed — улица Навои, 18',
    en: 'The Dimed clinic building — 18 Navoiy street',
  },
  'gallery.room': {
    uz: 'Statsionar palata',
    ru: 'Палата стационара',
    en: 'Inpatient room',
  },
  'gallery.lab': {
    uz: 'Biokimyoviy analizator — oʻz laboratoriyamiz',
    ru: 'Биохимический анализатор — собственная лаборатория',
    en: 'Biochemistry analyser in our own laboratory',
  },

  'lab.eyebrow': { uz: 'Laboratoriya', ru: 'Лаборатория', en: 'Laboratory' },
  'lab.title': { uz: 'Tahlillar va narxlar', ru: 'Анализы и цены', en: 'Lab tests and prices' },
  'lab.text': {
    uz: 'Koʻpchilik natijalar 30–60 daqiqada tayyor va shaxsiy kabinetingizga avtomatik tushadi — PDF va matn koʻrinishida.',
    ru: 'Большинство результатов готовы за 30–60 минут и автоматически приходят в личный кабинет — в PDF и текстом.',
    en: 'Most results are ready in 30–60 minutes and land in your cabinet automatically — as PDF and text.',
  },
  'lab.col.name': { uz: 'Tahlil', ru: 'Анализ', en: 'Test' },
  'lab.col.group': { uz: 'Guruh', ru: 'Группа', en: 'Group' },
  'lab.col.ready': { uz: 'Tayyor boʻlishi', ru: 'Готовность', en: 'Ready in' },
  'lab.col.price': { uz: 'Narx', ru: 'Цена', en: 'Price' },
  'lab.all.a': { uz: 'Barcha', ru: 'Все', en: 'See all' },
  'lab.all.b': { uz: 'ta tahlilni koʻrish', ru: 'анализов', en: 'tests' },
  'lab.note': {
    uz: 'Narxlar amaldagi pricelistdan olingan.',
    ru: 'Цены — из действующего прайс-листа.',
    en: 'Prices come from the current price list.',
  },
  'lab.sum': { uz: 'soʻm', ru: 'сум', en: 'UZS' },

  'contact.eyebrow': { uz: 'Bogʻlanish', ru: 'Контакты', en: 'Contact' },
  'contact.title': { uz: 'Bizni topish oson', ru: 'Нас легко найти', en: 'Easy to find' },
  'contact.address': { uz: 'Manzil', ru: 'Адрес', en: 'Address' },
  'contact.address.value': {
    uz: 'Chinoz shahri, Navoiy koʻchasi, 18',
    ru: 'г. Чиноз, улица Навои, 18',
    en: '18 Navoiy street, Chinoz',
  },
  'contact.address.note': {
    uz: 'Abdurashid savdo markazi yonida',
    ru: 'рядом с торговым центром «Абдурашид»',
    en: 'next to the Abdurashid shopping centre',
  },
  'contact.phone': { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
  'contact.hours': { uz: 'Ish vaqti', ru: 'Часы работы', en: 'Opening hours' },
  'contact.hours.value': {
    uz: 'Har kuni 08:00 – 22:00',
    ru: 'Ежедневно 08:00 – 22:00',
    en: 'Every day 08:00 – 22:00',
  },
  'contact.hours.note': {
    uz: 'boʻlimlar jadvali shifokorga qarab farq qiladi',
    ru: 'график отделений зависит от врача',
    en: 'department hours vary by doctor',
  },
  'contact.cta.title': { uz: 'Navbatni hoziroq oling', ru: 'Запишитесь прямо сейчас', en: 'Book your visit now' },
  'contact.cta.text': {
    uz: 'Telegram botga oʻting, kontaktni ulashing — 2 daqiqada broningiz tayyor.',
    ru: 'Откройте Telegram-бот, поделитесь контактом — бронь готова за 2 минуты.',
    en: 'Open the Telegram bot, share your contact — booked in two minutes.',
  },
  'contact.cta.btn': {
    uz: 'Dimed klinikasi botiga oʻtish',
    ru: 'Открыть бот клиники Dimed',
    en: 'Open the Dimed clinic bot',
  },

  'nav.depts': { uz: 'Boʻlimlar', ru: 'Отделения', en: 'Departments' },
  'nav.doctors': { uz: 'Shifokorlar', ru: 'Врачи', en: 'Doctors' },
  'nav.how': { uz: 'Qanday ishlaydi', ru: 'Как это работает', en: 'How it works' },
  'nav.analyses': { uz: 'Tahlillar', ru: 'Анализы', en: 'Analyses' },
  'nav.contact': { uz: 'Kontakt', ru: 'Контакты', en: 'Contact' },
  'nav.cabinet': { uz: 'Kabinet', ru: 'Кабинет', en: 'Cabinet' },
  'nav.book': { uz: 'Navbat olish', ru: 'Записаться', en: 'Book' },
  'nav.lang': { uz: 'Til', ru: 'Язык', en: 'Language' },

  'analyses.title': {
    uz: 'Tahlillar va narxlar — Dimed',
    ru: 'Анализы и цены — Dimed',
    en: 'Lab tests and prices — Dimed',
  },
  'analyses.description': {
    uz: 'Dimed klinikasi laboratoriyasidagi barcha tahlillar, tayyor boʻlish muddati va narxlari.',
    ru: 'Все анализы лаборатории клиники Dimed, сроки готовности и цены.',
    en: 'Every test in the Dimed clinic laboratory, with turnaround times and prices.',
  },
  'analyses.eyebrow': { uz: 'Laboratoriya', ru: 'Лаборатория', en: 'Laboratory' },
  'analyses.heading': { uz: 'Tahlillar va narxlar', ru: 'Анализы и цены', en: 'Lab tests and prices' },
  'analyses.search': { uz: 'Tahlil nomi boʻyicha qidirish', ru: 'Поиск по названию анализа', en: 'Search by test name' },
  'analyses.all': { uz: 'Hammasi', ru: 'Все', en: 'All' },
  'analyses.empty': { uz: 'Hech narsa topilmadi.', ru: 'Ничего не найдено.', en: 'Nothing found.' },
  'analyses.foot': {
    uz: 'Narxlar amaldagi pricelistdan olingan va oʻzgarishi mumkin. Aniqlashtirish uchun:',
    ru: 'Цены взяты из действующего прайс-листа и могут измениться. Для уточнения:',
    en: 'Prices come from the current price list and may change. To confirm, call:',
  },
  'cabinet.mine': { uz: 'Mening tahlillarim', ru: 'Мои анализы', en: 'My results' },

  'footer.privacy': { uz: 'Maxfiylik siyosati', ru: 'Политика конфиденциальности', en: 'Privacy policy' },
} satisfies Record<string, Copy>;

export type HomeKey = keyof typeof copy;

/** Bosh sahifa matni. Kalit yo'q bo'lsa TypeScript build paytida to'xtatadi. */
export const h = (key: HomeKey, lang: Lang): string => copy[key][lang];

/** `/`, `/ru/...`, `/en/...` — o'zbekcha ildizda, qolganlari prefiks bilan. */
export const langHref = (path: string, lang: Lang): string =>
  lang === 'uz' ? path : `/${lang}${path === '/' ? '/' : path}`;

/** HTML `lang` va `og:locale` uchun. */
export const LOCALE: Record<Lang, string> = { uz: 'uz_UZ', ru: 'ru_RU', en: 'en_US' };
export const HTML_LANG: Record<Lang, string> = { uz: 'uz', ru: 'ru', en: 'en' };
export const LANG_LABEL: Record<Lang, string> = { uz: 'O‘z', ru: 'Ру', en: 'En' };
