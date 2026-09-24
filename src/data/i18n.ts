/**
 * Sayt matnlari — uch tilda (uz asosiy, ru, en).
 *
 * Sayt tarixan faqat o'zbekcha; yangi qo'shilgan matnlar shu lug'atda
 * uch tilda saqlanadi. Til brauzerda `?lang=` yoki `localStorage`
 * (`dimed_lang`) orqali tanlanadi — qarang `src/lib/lang.ts`.
 * Bot xabarlari uchun server tomonida alohida lug'at bor:
 * `netlify/functions/lib/i18n.ts` (bir xil kalitlar).
 */
export type Lang = 'uz' | 'ru' | 'en';

export const LANGS: readonly Lang[] = ['uz', 'ru', 'en'] as const;

export const LANG_NAMES: Record<Lang, string> = {
  uz: 'Oʻzbekcha',
  ru: 'Русский',
  en: 'English',
};

export const isLang = (value: unknown): value is Lang =>
  typeof value === 'string' && (LANGS as readonly string[]).includes(value);

type Entry = Record<Lang, string>;

export const messages = {
  // --- umumiy ---
  'common.back': { uz: '← orqaga', ru: '← назад', en: '← back' },
  'common.save': { uz: 'Saqlash', ru: 'Сохранить', en: 'Save' },
  'common.cancel': { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  'common.loading': { uz: 'Yuklanmoqda…', ru: 'Загрузка…', en: 'Loading…' },
  'common.error.network': {
    uz: 'Internetga ulanishda muammo. Qayta urinib koʻring.',
    ru: 'Проблема с подключением. Попробуйте ещё раз.',
    en: 'Connection problem. Please try again.',
  },
  'common.language': { uz: 'Til', ru: 'Язык', en: 'Language' },
  'lab.sum': { uz: 'soʻm', ru: 'сум', en: 'UZS' },
  // sarlavha havolalari — kabinet sahifalarida brauzerda almashtiriladi
  'nav.depts': { uz: 'Boʻlimlar', ru: 'Отделения', en: 'Departments' },
  'nav.doctors': { uz: 'Shifokorlar', ru: 'Врачи', en: 'Doctors' },
  'nav.how': { uz: 'Qanday ishlaydi', ru: 'Как это работает', en: 'How it works' },
  'nav.analyses': { uz: 'Tahlillar', ru: 'Анализы', en: 'Analyses' },
  'nav.contact': { uz: 'Kontakt', ru: 'Контакты', en: 'Contact' },
  'nav.cabinet': { uz: 'Kabinet', ru: 'Кабинет', en: 'Cabinet' },
  'nav.book': { uz: 'Navbat olish', ru: 'Записаться', en: 'Book' },
  'footer.privacy': { uz: 'Maxfiylik siyosati', ru: 'Политика конфиденциальности', en: 'Privacy policy' },

  // --- 404 ---
  'notfound.title': { uz: 'Sahifa topilmadi — Dimed', ru: 'Страница не найдена — Dimed', en: 'Page not found — Dimed' },
  'notfound.heading': { uz: 'Bunday sahifa yoʻq', ru: 'Такой страницы нет', en: 'This page does not exist' },
  'notfound.text': {
    uz: 'Havola eskirgan yoki manzil xato yozilgan boʻlishi mumkin. Quyidagilardan birini tanlang — yoki qoʻngʻiroq qiling, biz yordam beramiz.',
    ru: 'Ссылка могла устареть или в адресе опечатка. Выберите один из вариантов ниже — или позвоните нам, мы поможем.',
    en: 'The link may be out of date, or the address mistyped. Pick one of the options below — or call us and we will help.',
  },
  'notfound.home': { uz: 'Bosh sahifa', ru: 'На главную', en: 'Home page' },
  'notfound.cabinet': { uz: 'Shaxsiy kabinet', ru: 'Личный кабинет', en: 'My cabinet' },

  // --- kirish sahifasi (/kirish) ---
  'signin.page.title': { uz: 'Kirish — Dimed klinikasi', ru: 'Вход — клиника Dimed', en: 'Sign in — Dimed clinic' },
  'signin.page.description': {
    uz: 'Telegram bot orqali shaxsiy kabinetga kirish. SMS ham, parol ham kerak emas.',
    ru: 'Вход в личный кабинет через Telegram-бот. Ни SMS, ни пароля не нужно.',
    en: 'Sign in to your cabinet through the Telegram bot. No SMS, no password.',
  },
  'signin.page.eyebrow': { uz: 'Shaxsiy kabinet', ru: 'Личный кабинет', en: 'Personal cabinet' },
  'signin.page.heading': { uz: 'Saytga kirish', ru: 'Вход на сайт', en: 'Sign in' },
  'signin.page.lede': {
    uz: 'Telegram bot orqali — SMS ham, parol ham kerak emas.',
    ru: 'Через Telegram-бот — ни SMS, ни пароля не нужно.',
    en: 'Through the Telegram bot — no SMS, no password.',
  },
  'signin.page.step1': {
    uz: 'Botga oʻting va kontaktingizni ulashing',
    ru: 'Откройте бот и поделитесь контактом',
    en: 'Open the bot and share your contact',
  },
  'signin.page.botBtn': {
    uz: 'Dimed klinikasi botini ochish',
    ru: 'Открыть бот клиники Dimed',
    en: 'Open the Dimed clinic bot',
  },
  'signin.page.step2': {
    uz: 'Telefon raqamingizni kiriting',
    ru: 'Введите номер телефона',
    en: 'Enter your phone number',
  },
  'signin.page.step3': {
    uz: 'Bot yuborgan 6 xonali kodni kiriting',
    ru: 'Введите 6-значный код из бота',
    en: 'Enter the 6-digit code from the bot',
  },
  'signin.page.digit': { uz: '{n}-raqam', ru: '{n}-я цифра', en: 'digit {n}' },
  'signin.page.help': {
    uz: 'Kod kelmadimi? Botga /start yuboring — yangi kod olasiz.',
    ru: 'Код не пришёл? Отправьте боту /start — придёт новый.',
    en: 'No code? Send /start to the bot and you will get a new one.',
  },
  'signin.page.questions': { uz: 'Savollar boʻlsa:', ru: 'Вопросы:', en: 'Questions:' },
  'signin.page.welcome': { uz: 'Xush kelibsiz!', ru: 'Добро пожаловать!', en: 'Welcome!' },
  // "Kodni olish" — bir tugmali kirish (A-auth UX)
  'signin.page.step1new': {
    uz: 'Telegram orqali kodni oling',
    ru: 'Получите код через Telegram',
    en: 'Get your code via Telegram',
  },
  'signin.page.getCode': { uz: 'Kodni olish', ru: 'Получить код', en: 'Get code' },
  'signin.page.getCodeAgain': { uz: 'Kodni qayta olish', ru: 'Получить код снова', en: 'Get code again' },
  'signin.page.opening': { uz: 'Telegram ochilmoqda…', ru: 'Открываем Telegram…', en: 'Opening Telegram…' },
  'signin.page.waiting': {
    uz: 'Botdan kod kutilmoqda… Telegramda «Boshlash» tugmasini bosing.',
    ru: 'Ждём код от бота… нажмите «Начать» в Telegram.',
    en: 'Waiting for the code… tap “Start” in Telegram.',
  },
  'signin.page.codeSent': {
    uz: '✓ Kod Telegramga yuborildi. Uni pastdagi maydonga kiriting.',
    ru: '✓ Код отправлен в Telegram. Введите его в поле ниже.',
    en: '✓ Code sent to Telegram. Enter it in the field below.',
  },
  'signin.page.expired': {
    uz: 'Havola eskirdi. «Kodni olish» ni qayta bosing.',
    ru: 'Ссылка устарела. Нажмите «Получить код» ещё раз.',
    en: 'The link expired. Tap “Get code” again.',
  },
  'signin.page.enterCode': {
    uz: 'Bot yuborgan 6 xonali kodni kiriting',
    ru: 'Введите 6-значный код из бота',
    en: 'Enter the 6-digit code from the bot',
  },
  'signin.page.phoneLabel': { uz: 'Telefon raqamingiz', ru: 'Ваш номер телефона', en: 'Your phone number' },

  // kirishdan keyin: bir telefon — bir oila, kim kirayotganini so'raymiz
  'signin.who.eyebrow': { uz: 'Deyarli tayyor', ru: 'Почти готово', en: 'Almost done' },
  'signin.who.title': { uz: 'Kim kirmoqda?', ru: 'Кто входит?', en: 'Who is signing in?' },
  'signin.who.lede': {
    uz: 'Bu raqamga bogʻlangan bemorlar:',
    ru: 'Пациенты, привязанные к этому номеру:',
    en: 'Patients linked to this number:',
  },
  'signin.who.introduce': {
    uz: 'Oʻzingizni tanishtiring',
    ru: 'Представьтесь',
    en: 'Tell us who you are',
  },
  'signin.who.notFound': {
    uz: 'Bu raqam boʻyicha klinikada yozuv topilmadi. Ism-familiyangizni kiriting.',
    ru: 'По этому номеру записей в клинике не найдено. Введите имя и фамилию.',
    en: 'No clinic records for this number. Please enter your name.',
  },
  'signin.who.other': { uz: '+ Boshqa odam', ru: '+ Другой человек', en: '+ Someone else' },
  'signin.who.inClinic': { uz: 'klinikada bor', ru: 'есть в клинике', en: 'on file at the clinic' },
  'signin.who.lastName': { uz: 'Familiya', ru: 'Фамилия', en: 'Surname' },
  'signin.who.firstName': { uz: 'Ism', ru: 'Имя', en: 'First name' },
  'signin.who.patronymic': { uz: 'Sharif', ru: 'Отчество', en: 'Middle name' },
  'signin.who.patronymicHint': {
    uz: 'Baxtiyorovich (ixtiyoriy)',
    ru: 'Бахтиёрович (необязательно)',
    en: 'optional',
  },
  'signin.who.cancel': { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  'signin.who.save': {
    uz: 'Saqlash va davom etish',
    ru: 'Сохранить и продолжить',
    en: 'Save and continue',
  },
  'signin.who.birthRequired': {
    uz: 'Tugʻilgan sanani toʻliq kiriting.',
    ru: 'Укажите дату рождения полностью.',
    en: 'Please enter the full date of birth.',
  },

  // --- navbat vidjeti: qadamlar va ro'yxatlar ---
  'booking.widget.title': { uz: 'Onlayn navbat', ru: 'Онлайн-запись', en: 'Book online' },
  'booking.widget.live': { uz: 'jonli slotlar', ru: 'слоты в реальном времени', en: 'live slots' },
  'booking.step.dept': { uz: 'Boʻlim', ru: 'Отделение', en: 'Department' },
  'booking.step.doctor': { uz: 'Shifokor', ru: 'Врач', en: 'Doctor' },
  'booking.step.time': { uz: 'Vaqt', ru: 'Время', en: 'Time' },
  'booking.pickDept': { uz: 'Boʻlimni tanlang', ru: 'Выберите отделение', en: 'Choose a department' },
  'booking.pickDoctor': { uz: 'Shifokorni tanlang', ru: 'Выберите врача', en: 'Choose a doctor' },
  'booking.pickWhen': { uz: 'sana va vaqt', ru: 'дата и время', en: 'date and time' },
  'booking.doctorCount': { uz: 'shifokor', ru: 'врачей', en: 'doctors' },
  'booking.back.depts': {
    uz: '← boʻlimlarga qaytish',
    ru: '← назад к отделениям',
    en: '← back to departments',
  },
  'booking.back.doctor': {
    uz: '← shifokorni almashtirish',
    ru: '← сменить врача',
    en: '← change doctor',
  },
  'booking.back.time': {
    uz: '← vaqtni oʻzgartirish',
    ru: '← изменить время',
    en: '← change the time',
  },
  'booking.back': { uz: '← orqaga', ru: '← назад', en: '← back' },
  'booking.slot.free': { uz: 'boʻsh', ru: 'свободно', en: 'free' },
  'booking.slot.busy': { uz: 'band', ru: 'занято', en: 'taken' },
  'booking.slot.none': {
    uz: 'Bu kunga slot yoʻq — boshqa sanani tanlang.',
    ru: 'На этот день слотов нет — выберите другую дату.',
    en: 'No slots that day — pick another date.',
  },
  'booking.slot.noDays': {
    uz: 'Bu shifokorning yaqin kunlarda qabuli yoʻq.',
    ru: 'У этого врача в ближайшие дни приёма нет.',
    en: 'This doctor has no visits in the coming days.',
  },
  'booking.slot.failed': {
    uz: 'Slotlarni yuklab boʻlmadi. Qayta urinib koʻring.',
    ru: 'Не удалось загрузить слоты. Попробуйте ещё раз.',
    en: 'Could not load the slots. Please try again.',
  },
  'booking.dept.empty': {
    uz: 'Bu boʻlimda hozircha shifokor yoʻq',
    ru: 'В этом отделении пока нет врачей',
    en: 'No doctors in this department yet',
  },
  'booking.minutes.short': { uz: 'daq', ru: 'мин', en: 'min' },
  'booking.minutes': { uz: 'daqiqa', ru: 'минут', en: 'minutes' },
  'booking.field.lastName': { uz: 'Familiya *', ru: 'Фамилия *', en: 'Surname *' },
  'booking.field.firstName': { uz: 'Ism *', ru: 'Имя *', en: 'First name *' },
  'booking.field.patronymic': {
    uz: 'Sharif (ixtiyoriy)',
    ru: 'Отчество (необязательно)',
    en: 'Middle name (optional)',
  },
  'booking.field.nameRequired': {
    uz: 'Familiya va ism majburiy.',
    ru: 'Фамилия и имя обязательны.',
    en: 'Surname and first name are required.',
  },
  'booking.saving': { uz: 'Saqlanmoqda…', ru: 'Сохраняем…', en: 'Saving…' },
  'booking.saveFailed': { uz: 'Saqlab boʻlmadi.', ru: 'Не удалось сохранить.', en: 'Could not save.' },
  'booking.summary.patient': { uz: 'Bemor', ru: 'Пациент', en: 'Patient' },
  'booking.summary.doctor': { uz: 'Shifokor', ru: 'Врач', en: 'Doctor' },
  'booking.summary.field': { uz: 'Yoʻnalish', ru: 'Специальность', en: 'Speciality' },
  'booking.summary.date': { uz: 'Sana', ru: 'Дата', en: 'Date' },
  'booking.summary.time': { uz: 'Vaqt', ru: 'Время', en: 'Time' },
  'booking.summary.when': { uz: 'Sana · vaqt', ru: 'Дата · время', en: 'Date · time' },
  'booking.change': { uz: 'oʻzgartirish', ru: 'изменить', en: 'change' },
  'booking.failed': { uz: 'Bron qilib boʻlmadi.', ru: 'Не удалось забронировать.', en: 'Booking failed.' },
  'booking.taken': { uz: 'Bu vaqt band qilindi.', ru: 'Это время уже заняли.', en: 'That time has just been taken.' },
  'booking.paid': { uz: 'Toʻlov qabul qilindi.', ru: 'Оплата принята.', en: 'Payment received.' },
  'booking.success.cabinet': {
    uz: 'Kabinetda koʻrish',
    ru: 'Открыть в кабинете',
    en: 'Open in my cabinet',
  },
  'booking.success.again': { uz: 'Yana navbat olish', ru: 'Записаться ещё раз', en: 'Book another visit' },

  // --- navbat: bemor ma'lumotlari qadami (B1, B4) ---
  'booking.step.patient': { uz: 'Bemor', ru: 'Пациент', en: 'Patient' },
  'booking.step.confirm': { uz: 'Tasdiqlash', ru: 'Подтверждение', en: 'Confirm' },
  'booking.whoFor': { uz: 'Navbat kim uchun?', ru: 'Для кого запись?', en: 'Who is the appointment for?' },
  'booking.birthDate': { uz: 'Tugʻilgan sana', ru: 'Дата рождения', en: 'Date of birth' },
  'booking.birthDate.day': { uz: 'Kun', ru: 'День', en: 'Day' },
  'booking.birthDate.month': { uz: 'Oy', ru: 'Месяц', en: 'Month' },
  'booking.birthDate.year': { uz: 'Yil', ru: 'Год', en: 'Year' },
  'booking.birthDate.required': {
    uz: 'Tugʻilgan sanani toʻliq kiriting.',
    ru: 'Укажите полную дату рождения.',
    en: 'Please enter the full date of birth.',
  },
  'booking.birthDate.missingFor': {
    uz: 'Davom etish uchun bemorning tugʻilgan sanasini kiriting.',
    ru: 'Чтобы продолжить, укажите дату рождения пациента.',
    en: 'Enter the patient’s date of birth to continue.',
  },
  // {link} o'rniga maxfiylik siyosatiga havola qo'yiladi (matni — linkText).
  'booking.privacy.text': {
    uz: '{link}ga roziman',
    ru: 'Я согласен(на) с {link}',
    en: 'I agree to the {link}',
  },
  'booking.privacy.linkText': {
    uz: 'Maxfiylik siyosati',
    ru: 'политикой конфиденциальности',
    en: 'privacy policy',
  },
  'booking.privacy.required': {
    uz: 'Davom etish uchun maxfiylik siyosatiga rozilik bering.',
    ru: 'Чтобы продолжить, примите политику конфиденциальности.',
    en: 'Please accept the privacy policy to continue.',
  },

  // --- navbat: tasdiqlash qadami (B2) ---
  'common.retry': { uz: 'Qayta urinish', ru: 'Повторить', en: 'Try again' },

  // --- kirish talab qilinadigan sahifalar (mehmon holati) ---
  'signin.title': { uz: 'Bu — shaxsiy sahifa', ru: 'Это личная страница', en: 'This is a private page' },
  'signin.denied.title': { uz: 'Bu boʻlim sizga ochiq emas', ru: 'Этот раздел вам недоступен', en: 'This section is not open to you' },
  'signin.lede': {
    uz: 'Kimning qanday maʼlumoti ekanini faqat egasi koʻradi. Davom etish uchun Telegram orqali kiring — SMS ham, parol ham kerak emas.',
    ru: 'Чьи и какие это данные, видит только владелец. Чтобы продолжить, войдите через Telegram — без SMS и паролей.',
    en: 'Only the owner can see whose data this is. Sign in with Telegram to continue — no SMS, no password.',
  },
  'signin.step1': { uz: 'Botga /start yuboring — 6 xonali kod keladi', ru: 'Отправьте боту /start — придёт 6-значный код', en: 'Send /start to the bot — you will get a 6-digit code' },
  'signin.step2': { uz: 'Kodni kirish sahifasiga kiriting', ru: 'Введите код на странице входа', en: 'Enter the code on the sign-in page' },
  'signin.bot': { uz: 'Botni ochish', ru: 'Открыть бота', en: 'Open the bot' },
  'signin.button': { uz: 'Kirish', ru: 'Войти', en: 'Sign in' },
  'signin.what.appointments': { uz: 'Kirgach: navbatlaringiz, vaqtni koʻchirish va bekor qilish.', ru: 'После входа: ваши записи, перенос и отмена времени.', en: 'After signing in: your appointments, rescheduling and cancellation.' },
  'signin.what.results': { uz: 'Kirgach: tahlil natijalaringiz — kim uchun, qachon, PDF va ulashish.', ru: 'После входа: ваши результаты анализов — для кого, когда, PDF и отправка.', en: 'After signing in: your test results — for whom, when, PDF and sharing.' },
  'signin.what.settings': { uz: 'Kirgach: til, oila aʼzolari va hisob sozlamalari.', ru: 'После входа: язык, члены семьи и настройки аккаунта.', en: 'After signing in: language, family members and account settings.' },
  'signin.what.result': { uz: 'Kirgach: natija toʻliq koʻrinadi — meʼyoriy oraliqlar, PDF va ulashish.', ru: 'После входа: результат целиком — референсные интервалы, PDF и отправка.', en: 'After signing in: the full result — reference ranges, PDF and sharing.' },
  'signin.what.doctor': { uz: 'Bu boʻlim shifokorlar uchun: bugungi navbatlar va jadval.', ru: 'Этот раздел для врачей: записи на сегодня и график.', en: 'This section is for doctors: today\u2019s queue and schedule.' },
  'signin.what.admin': { uz: 'Bu boʻlim administrator uchun: shifokorlar, narxlar va baholar.', ru: 'Этот раздел для администратора: врачи, цены и оценки.', en: 'This section is for the administrator: doctors, prices and ratings.' },
  'denied.doctor': {
    uz: 'Bu hisob shifokor sifatida roʻyxatdan oʻtmagan. Administratorga murojaat qiling.',
    ru: 'Этот аккаунт не зарегистрирован как врач. Обратитесь к администратору.',
    en: 'This account is not registered as a doctor. Please contact the administrator.',
  },
  'denied.admin': {
    uz: 'Bu hisobda administrator huquqi yoʻq.',
    ru: 'У этого аккаунта нет прав администратора.',
    en: 'This account does not have administrator rights.',
  },

  // --- 4-qadam: kirish (guest) va yosh cheklovi ---
  'booking.login.title': { uz: 'Davom etish uchun kiring', ru: 'Войдите, чтобы продолжить', en: 'Sign in to continue' },
  'booking.login.lede': {
    uz: 'Navbat kim uchun ekanini bilishimiz uchun Telegram orqali kiring — SMS ham, parol ham kerak emas.',
    ru: 'Войдите через Telegram, чтобы мы знали, для кого запись — без SMS и паролей.',
    en: 'Sign in with Telegram so we know who the appointment is for — no SMS, no password.',
  },
  'booking.login.botStep': { uz: 'Botga /start yuboring va 6 xonali kodni oling', ru: 'Отправьте боту /start и получите 6-значный код', en: 'Send /start to the bot and get the 6-digit code' },
  'booking.login.botBtn': { uz: 'Botni ochish', ru: 'Открыть бота', en: 'Open the bot' },
  'booking.login.phone': { uz: 'Telefon raqamingiz', ru: 'Ваш номер телефона', en: 'Your phone number' },
  'booking.login.code': { uz: 'Botdagi 6 xonali kod', ru: '6-значный код из бота', en: '6-digit code from the bot' },
  'booking.login.button': { uz: 'Kirish', ru: 'Войти', en: 'Sign in' },
  'booking.login.working': { uz: 'Tekshirilmoqda…', ru: 'Проверяем…', en: 'Checking…' },
  'booking.login.phoneRequired': {
    uz: 'Telefon raqamini toʻliq kiriting.',
    ru: 'Введите номер телефона полностью.',
    en: 'Enter your full phone number.',
  },
  'booking.login.codeRequired': {
    uz: '6 xonali kodni toʻliq kiriting.',
    ru: 'Введите 6-значный код полностью.',
    en: 'Enter the full 6-digit code.',
  },
  'booking.login.failed': { uz: 'Kirishda xatolik.', ru: 'Ошибка входа.', en: 'Sign-in failed.' },
  'booking.patient.required': {
    uz: 'Davom etish uchun navbat kim uchun ekanini tanlang.',
    ru: 'Выберите, для кого запись, чтобы продолжить.',
    en: 'Select who the appointment is for to continue.',
  },
  'booking.confirm.title': { uz: 'Bron maʼlumotlari', ru: 'Данные записи', en: 'Booking details' },
  'booking.confirm.price': { uz: 'Qabul narxi', ru: 'Стоимость приёма', en: 'Consultation fee' },
  'booking.confirm.payAtDesk': {
    uz: 'Qabulxona kassasiga {price} soʻm toʻlaysiz',
    ru: 'Оплата {price} сум — в кассе регистратуры',
    en: 'You will pay {price} UZS at the reception desk',
  },
  'booking.confirm.button': { uz: 'Tasdiqlash', ru: 'Подтвердить', en: 'Confirm' },
  'booking.confirm.working': { uz: 'Band qilinmoqda…', ru: 'Бронируем…', en: 'Booking…' },
  'booking.confirm.note': {
    uz: 'Band qilish uchun Telegram orqali kirgan boʻlishingiz kerak. Qabulga 1 soat qolgunicha vaqtni koʻchirish yoki bekor qilish mumkin.',
    ru: 'Для записи нужно войти через Telegram. Перенести или отменить можно не позднее чем за час до приёма.',
    en: 'You must be signed in via Telegram to book. You can move or cancel up to one hour before the visit.',
  },
  'booking.success.title': { uz: 'Navbatingiz band qilindi!', ru: 'Вы записаны!', en: 'Your appointment is booked!' },
  'booking.success.telegram': {
    uz: 'Tasdiq Telegram botga yuborildi. Qabulga 1 soat qolganda eslatma keladi.',
    ru: 'Подтверждение отправлено в Telegram-бот. За час до приёма придёт напоминание.',
    en: 'A confirmation was sent to the Telegram bot. You will get a reminder 1 hour before the visit.',
  },

  // --- kabinet menyusi (C1) ---
  'cabinet.menu.appointments': { uz: 'Navbatlarim', ru: 'Мои записи', en: 'My appointments' },
  'cabinet.menu.results': { uz: 'Tahlillarim', ru: 'Мои анализы', en: 'My results' },
  'cabinet.menu.book': { uz: 'Navbat olish', ru: 'Записаться', en: 'Book a visit' },
  'cabinet.menu.settings': { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
  'cabinet.menu.logout': { uz: 'Chiqish', ru: 'Выйти', en: 'Sign out' },
  'cabinet.menu.login': { uz: 'Kirish', ru: 'Войти', en: 'Sign in' },
  'cabinet.menu.today': { uz: 'Bugungi navbatlar', ru: 'Записи на сегодня', en: 'Today’s appointments' },
  'cabinet.menu.schedule': { uz: 'Jadvalim', ru: 'Моё расписание', en: 'My schedule' },
  'cabinet.menu.dayOff': { uz: 'Ishga chiqa olmayman', ru: 'Не смогу выйти', en: 'Day off' },
  'cabinet.menu.doctors': { uz: 'Shifokorlar', ru: 'Врачи', en: 'Doctors' },
  'cabinet.menu.prices': { uz: 'Narxlar', ru: 'Цены', en: 'Prices' },
  'cabinet.menu.ratings': { uz: 'Baholar', ru: 'Оценки', en: 'Ratings' },

  // --- tahlillar ro'yxati (C2, C3) ---
  'results.mine': { uz: 'Mening tahlillarim', ru: 'Мои анализы', en: 'My results' },
  'results.status.ready': { uz: 'Tayyor', ru: 'Готово', en: 'Ready' },
  'results.status.pending': { uz: 'Kutilmoqda', ru: 'В обработке', en: 'Pending' },
  'results.view': { uz: 'Koʻrish', ru: 'Открыть', en: 'View' },
  'results.count': { uz: '{n} ta koʻrsatkich', ru: '{n} показателей', en: '{n} indicators' },
  'results.empty': {
    uz: 'Hozircha tahlil natijasi yoʻq. Natijalar tayyor boʻlishi bilan shu yerda paydo boʻladi.',
    ru: 'Результатов пока нет. Они появятся здесь, как только будут готовы.',
    en: 'No results yet. They will appear here as soon as they are ready.',
  },
  'results.emptyFor': {
    uz: '{name} uchun hozircha tahlil natijasi yoʻq.',
    ru: 'Для «{name}» результатов пока нет.',
    en: 'No results yet for {name}.',
  },

  // --- natija sahifasi (D1, D2) ---
  'result.download': { uz: 'PDF yuklash', ru: 'Скачать PDF', en: 'Download PDF' },
  'result.share': { uz: 'Ulashish', ru: 'Поделиться', en: 'Share' },
  'result.share.copied': {
    uz: 'Havola nusxalandi! Uni messenjer orqali yuborishingiz mumkin.',
    ru: 'Ссылка скопирована! Её можно отправить в мессенджере.',
    en: 'Link copied! You can send it via a messenger.',
  },
  'result.share.failed': {
    uz: 'Havolani nusxalash imkoni boʻlmadi.',
    ru: 'Не удалось скопировать ссылку.',
    en: 'Could not copy the link.',
  },
  'result.patient': { uz: 'Bemorning F.I.Sh.', ru: 'Ф.И.О. пациента', en: 'Patient name' },
  'result.birthGender': { uz: 'Tugʻilgan sanasi / Jinsi', ru: 'Дата рождения / Пол', en: 'Date of birth / Sex' },
  'result.sampleTime': { uz: 'Namuna olingan vaqt', ru: 'Время забора', en: 'Sample time' },
  'result.doctor': { uz: 'Yuborgan shifokor', ru: 'Направивший врач', en: 'Referring doctor' },
  'result.male': { uz: 'Erkak', ru: 'Мужской', en: 'Male' },
  'result.female': { uz: 'Ayol', ru: 'Женский', en: 'Female' },
  'result.age': { uz: '{n} yosh', ru: '{n} лет', en: '{n} y.o.' },
  'result.banner.ok': {
    uz: 'Natijalaringiz tayyor. Barcha koʻrsatkichlar meʼyor doirasida.',
    ru: 'Результаты готовы. Все показатели в пределах нормы.',
    en: 'Your results are ready. All indicators are within the normal range.',
  },
  'result.banner.abnormal': {
    uz: 'Natijalaringiz tayyor. {n} ta koʻrsatkich standart meʼyordan tashqarida.',
    ru: 'Результаты готовы. {n} показателей вне стандартной нормы.',
    en: 'Your results are ready. {n} indicators are outside the standard range.',
  },
  'result.banner.unknown': {
    uz: 'Natijalaringiz tayyor. Meʼyor bilan taqqoslashni shifokoringiz bajaradi.',
    ru: 'Результаты готовы. Сравнение с нормой выполнит ваш врач.',
    en: 'Your results are ready. Your doctor will compare them with the reference ranges.',
  },
  // Ustunda ko'rsatkich nomi turadi (Gemoglobin, Eritrotsitlar),
  // tahlil nomi esa jadval tepasidagi sarlavhada. Ilgari o'zbekchasi
  // "Tahlil nomi" edi va ikkalasi bemor uchun aralashib ketardi.
  'result.col.name': { uz: 'Koʻrsatkich', ru: 'Показатель', en: 'Indicator' },
  'result.col.value': { uz: 'Natija', ru: 'Результат', en: 'Result' },
  'result.col.status': { uz: 'Status', ru: 'Статус', en: 'Status' },
  'result.col.range': { uz: 'Meʼyoriy oraliq', ru: 'Референсный интервал', en: 'Reference range' },
  'result.col.gauge': { uz: 'Vizual koʻrsatkich', ru: 'Шкала', en: 'Scale' },
  'result.status.normal': { uz: 'Meʼyor', ru: 'Норма', en: 'Normal' },
  'result.status.high': { uz: 'Yuqori', ru: 'Выше', en: 'High' },
  'result.status.low': { uz: 'Past', ru: 'Ниже', en: 'Low' },
  'result.disclaimer': {
    uz: 'Laboratoriya tahlil natijalari faqatgina malakali shifokor tomonidan baholanishi lozim. Meʼyoriy oraliqlar laboratoriya uslubiga qarab farq qilishi mumkin.',
    ru: 'Результаты лабораторных анализов должен оценивать только квалифицированный врач. Референсные интервалы зависят от методики лаборатории.',
    en: 'Laboratory results must be interpreted only by a qualified physician. Reference ranges depend on the laboratory method.',
  },
  // --- tahlil (panel) nomlari ---
  // 1C hujjatda nom yubormaganda sayt ko'rsatkichlarga qarab taniydi
  // (netlify/functions/lib/panels.ts). Kalitlar shu modul bilan bir xil.
  'panel.cbc': { uz: 'Umumiy qon tahlili', ru: 'Общий анализ крови', en: 'Complete blood count' },
  'panel.urine': { uz: 'Umumiy siydik tahlili', ru: 'Общий анализ мочи', en: 'Urinalysis' },
  'panel.stool': { uz: 'Najas tahlili', ru: 'Анализ кала (копрограмма)', en: 'Stool analysis' },
  'panel.coagulogram': { uz: 'Koagulogramma', ru: 'Коагулограмма', en: 'Coagulation panel' },
  'panel.biochem': {
    uz: 'Biokimyoviy qon tahlili',
    ru: 'Биохимический анализ крови',
    en: 'Blood chemistry panel',
  },
  'panel.rheuma': { uz: 'Revmoproba', ru: 'Ревмопробы', en: 'Rheumatoid panel' },
  'panel.torch': { uz: 'TORCH infeksiyalari', ru: 'TORCH-инфекции', en: 'TORCH panel' },
  'panel.express': { uz: 'Ekspress testlar', ru: 'Экспресс-тесты', en: 'Rapid tests' },
  'panel.generic': { uz: 'Laboratoriya tahlili', ru: 'Лабораторный анализ', en: 'Lab test' },
  'panel.empty': { uz: 'Tahlil natijalari', ru: 'Результаты анализов', en: 'Test results' },
  'result.important': { uz: 'Muhim eslatma', ru: 'Важно', en: 'Important' },
  'result.footer': {
    uz: 'Dimed klinikasi laboratoriyasining elektron hisoboti. Chinoz, Navoiy koʻchasi 18 · +998 55 9009 103',
    ru: 'Электронный отчёт лаборатории клиники Dimed. Чиназ, ул. Навои 18 · +998 55 9009 103',
    en: 'Electronic report of the Dimed clinic laboratory. Chinoz, Navoiy street 18 · +998 55 9009 103',
  },
  'result.notFound': {
    uz: 'Natija topilmadi yoki havola muddati oʻtgan.',
    ru: 'Результат не найден или срок ссылки истёк.',
    en: 'Result not found or the link has expired.',
  },
  'result.loginToView': {
    uz: 'Natijani koʻrish uchun Telegram orqali kiring.',
    ru: 'Чтобы посмотреть результат, войдите через Telegram.',
    en: 'Sign in via Telegram to view the result.',
  },

  // --- shifokor kartasi: bemor baholari (G2) ---
  'doctor.rating': { uz: '★ {avg} · {n} ta baho', ru: '★ {avg} · {n} оцен.', en: '★ {avg} · {n} ratings' },
} satisfies Record<string, Entry>;

export type MessageKey = keyof typeof messages;

/** Matnni tanlangan tilda qaytaradi; {name} joylari `vars` dan to'ldiriladi. */
export function t(key: MessageKey, lang: Lang = 'uz', vars: Record<string, string | number> = {}): string {
  const entry = messages[key] as Entry | undefined;
  const text = entry?.[lang] ?? entry?.uz ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
