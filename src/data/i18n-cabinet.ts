/**
 * Bemor kabineti matnlari (Navbatlarim, Tahlillarim, Sozlamalar) — uch tilda.
 *
 * `i18n.ts` shu lug'atni o'z ichiga qo'shadi, shuning uchun `t()` bilan
 * ishlatiladi. Alohida fayl — asosiy lug'at juda kattalashib ketmasin.
 */
type Entry = { uz: string; ru: string; en: string };

export const cabinetMessages = {
  // --- umumiy qolip ---
  'cab.eyebrow.patient': { uz: 'Shaxsiy kabinet', ru: 'Личный кабинет', en: 'Personal cabinet' },
  'cab.who': { uz: 'Kim:', ru: 'Кто:', en: 'Who:' },
  'cab.all': { uz: 'Hammasi', ru: 'Все', en: 'All' },
  'cab.loadFailed': {
    uz: 'Maʼlumotlarni yuklab boʻlmadi. Sahifani yangilang.',
    ru: 'Не удалось загрузить данные. Обновите страницу.',
    en: 'Could not load the data. Please refresh the page.',
  },
  'cab.new': { uz: 'yangi', ru: 'новый', en: 'new' },
  'cab.resultTypes': { uz: 'Tahlil turlari va narxlar', ru: 'Виды анализов и цены', en: 'Test types and prices' },
  'cab.resultsNote': {
    uz: 'Natijalar laboratoriya tizimidan avtomatik keladi. Qator bosilganda natija sahifasi ochiladi — u yerdan PDF yuklash va ulashish mumkin.',
    ru: 'Результаты поступают из лаборатории автоматически. Нажмите на строку, чтобы открыть страницу результата — там можно скачать PDF и поделиться.',
    en: 'Results arrive automatically from the laboratory. Tap a row to open the result page, where you can download a PDF and share it.',
  },

  // --- navbatlar ---
  'appt.upcoming': { uz: 'Kelgusi qabullar', ru: 'Предстоящие приёмы', en: 'Upcoming visits' },
  'appt.past': { uz: 'Oʻtgan qabullar', ru: 'Прошедшие приёмы', en: 'Past visits' },
  'appt.noUpcoming': { uz: 'Hozircha kelgusi qabul yoʻq.', ru: 'Предстоящих приёмов пока нет.', en: 'No upcoming visits yet.' },
  'appt.noPast': { uz: 'Oʻtgan qabullar yoʻq.', ru: 'Прошедших приёмов нет.', en: 'No past visits.' },
  'appt.status.paid': { uz: 'toʻlangan', ru: 'оплачено', en: 'paid' },
  'appt.status.booked': { uz: 'band qilingan', ru: 'забронировано', en: 'booked' },
  'appt.status.done': { uz: 'boʻlib oʻtgan', ru: 'состоялся', en: 'completed' },
  'appt.status.no_show': { uz: 'kelmagan', ru: 'не пришли', en: 'no-show' },
  'appt.status.moved': { uz: 'koʻchirilgan', ru: 'перенесён', en: 'moved' },
  'appt.status.cancelled': { uz: 'bekor qilingan', ru: 'отменён', en: 'cancelled' },
  'appt.status.cancelled_by_clinic': { uz: 'klinika bekor qildi', ru: 'отменён клиникой', en: 'cancelled by the clinic' },
  'appt.move': { uz: 'Vaqtni koʻchirish', ru: 'Перенести время', en: 'Reschedule' },
  'appt.cancel': { uz: 'Bekor qilish', ru: 'Отменить', en: 'Cancel' },
  'appt.newDate': { uz: 'Yangi sana', ru: 'Новая дата', en: 'New date' },
  'appt.service': { uz: 'Xizmat:', ru: 'Услуга:', en: 'Service:' },
  'appt.patient': { uz: 'Bemor:', ru: 'Пациент:', en: 'Patient:' },
  'appt.atTime': { uz: 'soat', ru: 'в', en: 'at' },
  'appt.free': { uz: 'bepul', ru: 'бесплатно', en: 'free' },
  'appt.paidOnline': { uz: 'onlayn toʻlangan', ru: 'оплачено онлайн', en: 'paid online' },
  'appt.payAtDesk': { uz: 'kassada toʻlanadi', ru: 'оплата в кассе', en: 'pay at the cashier' },
  'appt.noSlots': { uz: 'Bu kuni boʻsh vaqt yoʻq.', ru: 'В этот день нет свободного времени.', en: 'No free times on this day.' },
  'appt.slotsFailed': { uz: 'Slotlarni yuklab boʻlmadi.', ru: 'Не удалось загрузить время.', en: 'Could not load the times.' },
  'appt.cancelConfirm': {
    uz: 'Navbat bekor qilinsinmi? Vaqt boshqa bemorlarga ochiladi.',
    ru: 'Отменить запись? Время освободится для других пациентов.',
    en: 'Cancel this appointment? The time will be released to other patients.',
  },
  'appt.cancelling': { uz: 'Bekor qilinmoqda…', ru: 'Отменяем…', en: 'Cancelling…' },
  'appt.cancelFailed': { uz: 'Bekor qilib boʻlmadi.', ru: 'Не удалось отменить.', en: 'Could not cancel.' },
  'appt.moving': { uz: 'Koʻchirilmoqda…', ru: 'Переносим…', en: 'Rescheduling…' },
  'appt.moveFailed': { uz: 'Koʻchirib boʻlmadi.', ru: 'Не удалось перенести.', en: 'Could not reschedule.' },
  'appt.weekdays': {
    uz: 'Yak,Du,Se,Chor,Pay,Ju,Sh',
    ru: 'Вс,Пн,Вт,Ср,Чт,Пт,Сб',
    en: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
  },

  // --- sozlamalar ---
  'settings.account': { uz: 'Hisob', ru: 'Аккаунт', en: 'Account' },
  'settings.name': { uz: 'Ism', ru: 'Имя', en: 'Name' },
  'settings.phone': { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
  'settings.accountNote': {
    uz: 'Kirish Telegram orqali — parol yoʻq. Telefon raqami botga ulashgan kontaktdan olinadi.',
    ru: 'Вход через Telegram — без пароля. Номер телефона берётся из контакта, которым вы поделились с ботом.',
    en: 'You sign in through Telegram — no password. The phone number comes from the contact you shared with the bot.',
  },
  'settings.logout': { uz: 'Chiqish', ru: 'Выйти', en: 'Sign out' },
  'settings.language': { uz: 'Til', ru: 'Язык', en: 'Language' },
  'settings.languageNote': { uz: 'Sayt va bot xabarlari tili.', ru: 'Язык сайта и сообщений бота.', en: 'Language of the site and bot messages.' },
  'settings.langSaved': { uz: 'Til saqlandi.', ru: 'Язык сохранён.', en: 'Language saved.' },
  'settings.saving': { uz: 'Saqlanmoqda…', ru: 'Сохраняем…', en: 'Saving…' },
  'settings.saveFailed': { uz: 'Saqlab boʻlmadi.', ru: 'Не удалось сохранить.', en: 'Could not save.' },
  'settings.people': { uz: 'Bemorlar (oila aʼzolari)', ru: 'Пациенты (члены семьи)', en: 'Patients (family members)' },
  'settings.peopleNote': {
    uz: 'Bir telefondan butun oila foydalanishi mumkin. Navbat olishda «kim uchun» deb soʻraladi — bu yerda tanlangan odam oldindan belgilanadi (har safar oʻzgartirish mumkin). Kabinetda hamma oila aʼzolarining navbat va tahlillari koʻrinadi.',
    ru: 'Одним телефоном может пользоваться вся семья. При записи спрашивается «для кого» — выбранный здесь человек подставляется заранее (его можно сменить). В кабинете видны записи и анализы всех членов семьи.',
    en: 'The whole family can use one phone. When booking you are asked “who is it for” — the person selected here is pre-filled (you can change it each time). The cabinet shows appointments and results of every family member.',
  },
  'settings.selected': { uz: 'tanlangan', ru: 'выбран', en: 'selected' },
  'settings.selectHint': { uz: 'Tanlash uchun bosing', ru: 'Нажмите, чтобы выбрать', en: 'Tap to select' },
  'settings.selectSaved': { uz: 'Tanlangan bemor saqlandi.', ru: 'Выбранный пациент сохранён.', en: 'Selected patient saved.' },
  'settings.noBirth': { uz: 'tugʻilgan sana kiritilmagan', ru: 'дата рождения не указана', en: 'date of birth not set' },
  'settings.inClinic': { uz: 'klinikada roʻyxatda', ru: 'в базе клиники', en: 'registered at the clinic' },
  'settings.empty': { uz: 'Hali bemor qoʻshilmagan.', ru: 'Пациенты ещё не добавлены.', en: 'No patients added yet.' },
  'settings.listFailed': {
    uz: 'Bemorlar roʻyxatini yuklab boʻlmadi.',
    ru: 'Не удалось загрузить список пациентов.',
    en: 'Could not load the patient list.',
  },
  'settings.addPerson': { uz: '+ Boshqa odam qoʻshish', ru: '+ Добавить человека', en: '+ Add another person' },
  'settings.lastName': { uz: 'Familiya *', ru: 'Фамилия *', en: 'Last name *' },
  'settings.firstName': { uz: 'Ism *', ru: 'Имя *', en: 'First name *' },
  'settings.patronymic': { uz: 'Sharif (ixtiyoriy)', ru: 'Отчество (необязательно)', en: 'Patronymic (optional)' },
  'settings.birth': { uz: 'Tugʻilgan sana *', ru: 'Дата рождения *', en: 'Date of birth *' },
  'settings.cancel': { uz: 'Bekor qilish', ru: 'Отмена', en: 'Cancel' },
  'settings.save': { uz: 'Saqlash', ru: 'Сохранить', en: 'Save' },
  'settings.nameRequired': { uz: 'Familiya va ism majburiy.', ru: 'Фамилия и имя обязательны.', en: 'Last and first name are required.' },
  'settings.birthRequired': {
    uz: 'Tugʻilgan sanani toʻliq kiriting.',
    ru: 'Укажите дату рождения полностью.',
    en: 'Enter the full date of birth.',
  },
  'settings.added': { uz: 'Qoʻshildi va tanlandi.', ru: 'Добавлен и выбран.', en: 'Added and selected.' },
  'settings.updated': { uz: 'Maʼlumot yangilandi.', ru: 'Данные обновлены.', en: 'Details updated.' },
  'settings.removed': { uz: 'Roʻyxatdan olib tashlandi.', ru: 'Удалён из списка.', en: 'Removed from the list.' },
  'settings.edit': { uz: 'Tuzatish', ru: 'Исправить', en: 'Edit' },
  'settings.remove': { uz: 'Olib tashlash', ru: 'Удалить', en: 'Remove' },
  'settings.removeConfirm': {
    uz: 'Bu odam roʻyxatdan olib tashlansinmi? Oldingi navbatlar saqlanib qoladi.',
    ru: 'Удалить этого человека из списка? Прошлые записи сохранятся.',
    en: 'Remove this person from the list? Past appointments are kept.',
  },
  'settings.editTitle': { uz: 'Maʼlumotni tuzatish', ru: 'Исправление данных', en: 'Edit details' },
  'settings.clinicFix': {
    uz: 'Bu odam klinika bazasidan olingan, ismi saytda oʻzgartirilmaydi. Tugʻilgan sanani shu yerda toʻldirishingiz mumkin; ism yoki boshqa maʼlumot xato boʻlsa, qabulxonaga murojaat qiling: {phone}.',
    ru: 'Этот человек взят из базы клиники, имя на сайте не меняется. Дату рождения можно указать здесь; если имя или другие данные неверны, обратитесь в регистратуру: {phone}.',
    en: 'This person comes from the clinic’s records, so the name cannot be changed on the site. You can set the date of birth here; if the name or other details are wrong, please contact the reception: {phone}.',
  },
  'settings.privacy': {
    uz: 'qanday maʼlumotlar saqlanadi va huquqlaringiz.',
    ru: 'какие данные хранятся и каковы ваши права.',
    en: 'what data is stored and what your rights are.',
  },
  'settings.privacyLink': { uz: 'Maxfiylik siyosati', ru: 'Политика конфиденциальности', en: 'Privacy policy' },
} satisfies Record<string, Entry>;
