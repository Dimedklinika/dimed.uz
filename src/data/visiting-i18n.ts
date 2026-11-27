import type { Lang } from './i18n';

/**
 * «Tashrif buyuruvchi shifokorlar» bo'limi matnlari — uch tilda.
 *
 * Kartochkalar va yozilish oynasi brauzerda chiziladi (ma'lumot bazadan
 * keladi), shuning uchun bu lug'at brauzerga ham yuklanadi. Kichik:
 * faqat shu bo'limga tegishli matnlar.
 */
type Entry = Record<Lang, string>;

const copy = {
  'v.eyebrow': { uz: 'Tashrif buyuruvchi shifokorlar', ru: 'Приглашённые специалисты', en: 'Visiting specialists' },
  'v.title': {
    uz: 'Maʼlum kunlarda qabul qiladigan mutaxassislar',
    ru: 'Специалисты, которые принимают в определённые дни',
    en: 'Specialists who see patients on set days',
  },
  'v.text': {
    uz: 'Klinikamizga tashqaridan keladigan shifokorlar. Kun va boʻsh vaqtni tanlab, oldindan yoziling — yozilish bepul, toʻlov qabul kuni klinika kassasida.',
    ru: 'Врачи, которые приезжают в нашу клинику. Выберите день и свободное время и запишитесь заранее — запись бесплатная, оплата в кассе клиники в день приёма.',
    en: 'Doctors who come to our clinic from elsewhere. Choose a day and a free time and book ahead — booking is free, you pay at the clinic desk on the day.',
  },
  'v.page.title': {
    uz: 'Tashrif buyuruvchi shifokorlar — Dimed',
    ru: 'Приглашённые специалисты — Dimed',
    en: 'Visiting specialists — Dimed',
  },
  'v.page.description': {
    uz: 'Dimed klinikasiga maʼlum kunlarda keladigan shifokorlar: qabul kunlari, soatlari va narxi. Onlayn yozilish bepul, toʻlov klinikada.',
    ru: 'Врачи, которые принимают в клинике Dimed по определённым дням: дни и часы приёма, цена. Онлайн-запись бесплатная, оплата в клинике.',
    en: 'Doctors who see patients at the Dimed clinic on set days: visit days, hours and price. Free online booking, pay at the clinic.',
  },
  'v.days': { uz: 'Qabul kunlari', ru: 'Дни приёма', en: 'Visit days' },
  'v.next': { uz: 'Yaqin kunlar', ru: 'Ближайшие дни', en: 'Next dates' },
  'v.hours': { uz: 'Qabul soatlari', ru: 'Часы приёма', en: 'Hours' },
  'v.price': { uz: 'Qabul narxi', ru: 'Стоимость приёма', en: 'Visit price' },
  'v.free': { uz: 'bepul', ru: 'бесплатно', en: 'free' },
  'v.payAtClinic': { uz: 'klinikada toʻlanadi', ru: 'оплата в клинике', en: 'paid at the clinic' },
  'v.noDates': {
    uz: 'Yaqin kunlarda qabul rejalashtirilmagan',
    ru: 'В ближайшие дни приём не запланирован',
    en: 'No visits scheduled in the coming days',
  },
  'v.book': { uz: 'Yozilish', ru: 'Записаться', en: 'Book' },
  'v.more': { uz: 'Batafsil', ru: 'Подробнее', en: 'More' },
  'v.less': { uz: 'Yigʻish', ru: 'Свернуть', en: 'Less' },
  'v.all': { uz: 'Barcha tashrif shifokorlari', ru: 'Все приглашённые специалисты', en: 'All visiting specialists' },
  'v.empty': {
    uz: 'Hozircha tashrif buyuruvchi shifokorlar jadvali eʼlon qilinmagan. Maʼlumot uchun qoʻngʻiroq qiling:',
    ru: 'Расписание приглашённых специалистов пока не объявлено. Справки по телефону:',
    en: 'No visiting specialist schedule has been announced yet. For details, call:',
  },
  'v.failed': {
    uz: 'Maʼlumotni yuklab boʻlmadi.',
    ru: 'Не удалось загрузить данные.',
    en: 'Could not load the data.',
  },
  'v.retry': { uz: 'Qayta urinish', ru: 'Повторить', en: 'Try again' },
  'v.loading': { uz: 'Yuklanmoqda…', ru: 'Загрузка…', en: 'Loading…' },
  'v.min': { uz: 'daqiqa', ru: 'мин', en: 'min' },
  'v.sum': { uz: 'soʻm', ru: 'сум', en: 'UZS' },
  'v.today': { uz: 'bugun', ru: 'сегодня', en: 'today' },
  'v.tomorrow': { uz: 'ertaga', ru: 'завтра', en: 'tomorrow' },

  'f.title': { uz: 'Qabulga yozilish', ru: 'Запись на приём', en: 'Book an appointment' },
  'f.close': { uz: 'Yopish', ru: 'Закрыть', en: 'Close' },
  'f.name': { uz: 'Ism-familiya', ru: 'Имя и фамилия', en: 'Full name' },
  'f.name.ph': { uz: 'Masalan: Aliyev Vali', ru: 'Например: Алиев Вали', en: 'e.g. Vali Aliyev' },
  'f.phone': { uz: 'Telefon raqami', ru: 'Номер телефона', en: 'Phone number' },
  'f.day': { uz: 'Kun', ru: 'День', en: 'Day' },
  'f.time': { uz: 'Boʻsh vaqt', ru: 'Свободное время', en: 'Free time' },
  'f.full': { uz: 'band', ru: 'занято', en: 'full' },
  'f.noSlots': {
    uz: 'Bu kunga boʻsh vaqt qolmagan — boshqa kunni tanlang.',
    ru: 'На этот день свободного времени нет — выберите другой день.',
    en: 'No free times left on this day — please pick another day.',
  },
  'f.noDays': {
    uz: 'Yaqin kunlarda yozilish uchun boʻsh vaqt yoʻq. Klinikaga qoʻngʻiroq qiling:',
    ru: 'В ближайшие дни свободного времени нет. Позвоните в клинику:',
    en: 'There are no free times in the coming days. Please call the clinic:',
  },
  'f.continue': { uz: 'Davom etish', ru: 'Продолжить', en: 'Continue' },
  'f.note': {
    uz: 'Yozilish bepul. Toʻlov — qabul kuni klinika kassasida.',
    ru: 'Запись бесплатная. Оплата — в кассе клиники в день приёма.',
    en: 'Booking is free. You pay at the clinic desk on the day.',
  },

  'c.title': { uz: 'Maʼlumotlarni tekshiring', ru: 'Проверьте данные', en: 'Check your details' },
  'c.doctor': { uz: 'Shifokor', ru: 'Врач', en: 'Doctor' },
  'c.when': { uz: 'Sana va vaqt', ru: 'Дата и время', en: 'Date and time' },
  'c.patient': { uz: 'Bemor', ru: 'Пациент', en: 'Patient' },
  'c.phone': { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
  'c.price': { uz: 'Qabul narxi', ru: 'Стоимость приёма', en: 'Visit price' },
  'c.payTitle': {
    uz: 'Toʻlov klinikada amalga oshiriladi',
    ru: 'Оплата производится в клинике',
    en: 'Payment is made at the clinic',
  },
  'c.payText': {
    uz: 'Onlayn toʻlov yoʻq. Qabul kuni klinika kassasiga {sum} toʻlaysiz.',
    ru: 'Онлайн-оплаты нет. В день приёма вы оплачиваете {sum} в кассе клиники.',
    en: 'There is no online payment. On the day you pay {sum} at the clinic desk.',
  },
  'c.payFree': {
    uz: 'Bu qabul bepul — toʻlov talab qilinmaydi.',
    ru: 'Этот приём бесплатный — оплата не требуется.',
    en: 'This visit is free — no payment needed.',
  },
  'c.confirm': { uz: 'Tasdiqlash', ru: 'Подтвердить', en: 'Confirm' },
  'c.edit': { uz: 'Oʻzgartirish', ru: 'Изменить', en: 'Edit' },
  'c.sending': { uz: 'Yuborilmoqda…', ru: 'Отправляем…', en: 'Sending…' },

  's.title': { uz: 'Siz yozildingiz!', ru: 'Вы записаны!', en: 'You are booked!' },
  's.text': {
    uz: 'Iltimos, qabulga 10 daqiqa oldin keling. Toʻlov — klinika kassasida.',
    ru: 'Пожалуйста, приходите за 10 минут до приёма. Оплата — в кассе клиники.',
    en: 'Please arrive 10 minutes early. Payment is at the clinic desk.',
  },
  's.call': {
    uz: 'Vaqtni oʻzgartirish yoki bekor qilish uchun qoʻngʻiroq qiling:',
    ru: 'Чтобы перенести или отменить запись, позвоните:',
    en: 'To change or cancel, please call:',
  },
  's.done': { uz: 'Tayyor', ru: 'Готово', en: 'Done' },

  'e.pickDay': { uz: 'Kunni tanlang', ru: 'Выберите день', en: 'Choose a day' },
  'e.pickTime': { uz: 'Boʻsh vaqtni tanlang', ru: 'Выберите свободное время', en: 'Choose a free time' },
  'e.name': {
    uz: 'Ism-familiyangizni toʻliq yozing',
    ru: 'Укажите имя и фамилию полностью',
    en: 'Please enter your full name',
  },
  'e.phone': {
    uz: 'Telefon raqami notoʻgʻri — 9 xonali raqam kiriting (masalan 90 123 45 67)',
    ru: 'Неверный номер — введите 9 цифр (например 90 123 45 67)',
    en: 'Invalid number — enter 9 digits (e.g. 90 123 45 67)',
  },
  'e.taken': {
    uz: 'Bu vaqtni hozirgina boshqa odam oldi — boshqa vaqtni tanlang.',
    ru: 'Это время только что заняли — выберите другое.',
    en: 'Someone has just taken this time — please choose another.',
  },
  'e.too_soon': {
    uz: 'Qabulga 1 soatdan kam qoldi — boshqa vaqtni tanlang.',
    ru: 'До приёма меньше часа — выберите другое время.',
    en: 'This visit starts in less than an hour — please choose another time.',
  },
  // Begona raqam haqida hech narsa aytilmaydi (nechta yozuvi bor, qaysi shifokorga).
  'e.limit': {
    uz: 'Bu raqam bilan onlayn yozilib boʻlmaydi. Klinikaga qoʻngʻiroq qiling.',
    ru: 'С этим номером нельзя записаться онлайн. Позвоните в клинику.',
    en: 'This number cannot be booked online. Please call the clinic.',
  },
  'e.rate': {
    uz: 'Juda koʻp urinish. Birozdan soʻng qayta urinib koʻring.',
    ru: 'Слишком много попыток. Попробуйте чуть позже.',
    en: 'Too many attempts. Please try again a little later.',
  },
  'e.not_found': {
    uz: 'Bu shifokorga hozir yozilib boʻlmaydi.',
    ru: 'К этому врачу сейчас нельзя записаться.',
    en: 'This doctor cannot be booked right now.',
  },
  'e.bad_slot': {
    uz: 'Bu vaqtga yozilib boʻlmaydi — boshqa vaqtni tanlang.',
    ru: 'На это время записаться нельзя — выберите другое.',
    en: 'This time cannot be booked — please choose another.',
  },
  'e.server': {
    uz: 'Xatolik yuz berdi. Birozdan soʻng urinib koʻring yoki qoʻngʻiroq qiling.',
    ru: 'Произошла ошибка. Попробуйте позже или позвоните нам.',
    en: 'Something went wrong. Please try later or call us.',
  },
  'e.network': {
    uz: 'Internetga ulanishda muammo. Qayta urinib koʻring.',
    ru: 'Проблема с подключением. Попробуйте ещё раз.',
    en: 'Connection problem. Please try again.',
  },
} satisfies Record<string, Entry>;

export type VisitKey = keyof typeof copy;

export const vt = (key: VisitKey, lang: Lang): string => copy[key][lang];

/** Server qaytargan xato kodi bo'yicha matn (`visiting-book.ts`). */
export const errorText = (code: unknown, lang: Lang): string | null => {
  const key = `e.${String(code)}` as VisitKey;
  return key in copy ? copy[key][lang] : null;
};

/** "har shanba" / "по субботам" / "Saturdays" — 0 = yakshanba. */
export const EVERY_WEEKDAY: Record<Lang, string[]> = {
  uz: ['har yakshanba', 'har dushanba', 'har seshanba', 'har chorshanba', 'har payshanba', 'har juma', 'har shanba'],
  ru: ['по воскресеньям', 'по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам'],
  en: ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'],
};

export const WEEKDAY_SHORT: Record<Lang, string[]> = {
  uz: ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sh'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const MONTHS: Record<Lang, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** "2026-12-05" → "5-dekabr" / "5 декабря" / "5 December". */
export function dayMonth(dateKey: string, lang: Lang): string {
  const [, m = 1, d = 1] = dateKey.split('-').map(Number);
  const month = MONTHS[lang][m - 1] ?? '';
  return lang === 'uz' ? `${d}-${month}` : `${d} ${month}`;
}
