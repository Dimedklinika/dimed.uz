/**
 * DynamoDB jadvallari ta'rifi.
 *
 * `create-tables.mjs` shu ro'yxat bo'yicha jadval yaratadi,
 * `test-tables.mjs` esa ta'riflarni AWS'ga bormasdan tekshiradi.
 * Shu sababli ta'riflar alohida faylda: skriptni import qilish
 * jadval yaratib yuborardi.
 */
const S = (name) => ({ AttributeName: name, AttributeType: 'S' });
const HASH = (name) => ({ AttributeName: name, KeyType: 'HASH' });
const RANGE = (name) => ({ AttributeName: name, KeyType: 'RANGE' });
const ALL = { ProjectionType: 'ALL' };

/*
  `backup: true` — jadvalda bemor ma'lumoti bor va uni yo'qotib
  bo'lmaydi: DynamoDB PITR yoqiladi (oxirgi 35 kun ichidagi istalgan
  soniyaga qaytarish mumkin). Vaqtinchalik jadvallar — kirish kodlari
  va so'rov cheklovlari — bunga muhtoj emas, ular o'zi o'chadi.

  Har bir jadval: bepul chegarada qolish uchun PAY_PER_REQUEST.
*/
export const tables = [
  {
    // phone-index: kirish va tahlil natijalari telefon bo'yicha bog'lanadi.
    // code-index: 1C bemor kodi bo'yicha qidirish — profil sinxronizatsiyasi
    //   uchun. Sparse indeks: kodi hali biriktirilmagan bemor unga tushmaydi.
    name: 'users',
    backup: true,
    attrs: [S('telegram_id'), S('phone'), S('code')],
    keys: [HASH('telegram_id')],
    indexes: [
      { IndexName: 'phone-index', KeySchema: [HASH('phone')], Projection: ALL },
      { IndexName: 'code-index', KeySchema: [HASH('code')], Projection: ALL },
    ],
  },
  {
    name: 'otp_codes',
    attrs: [S('phone')],
    keys: [HASH('phone')],
    ttlAttribute: 'expires_at',
  },
  {
    // 1C bemorlar katalogining ko'chirmasi. 1C o'zi yozadi: kalit —
    // telefon (+998...), sort_key = 1C bemor kodi (eng eski yozuvlarda
    // "PROFILE" ham uchraydi). Sayt /start va har kirishda shu yerdan
    // o'qib, profilni dimed_users ga birlashtiradi. 1C xohlagancha
    // yozaveradi — saytga xalal yo'q.
    name: 'individuals',
    backup: true,
    attrs: [S('phone'), S('sort_key')],
    keys: [HASH('phone'), RANGE('sort_key')],
  },
  {
    // telegram-index: shifokor o'z kabinetiga Telegram orqali kiradi
    name: 'doctors',
    backup: true,
    attrs: [S('doctor_id'), S('telegram_id')],
    keys: [HASH('doctor_id')],
    indexes: [{ IndexName: 'telegram-index', KeySchema: [HASH('telegram_id')], Projection: ALL }],
  },
  {
    // PK: doctor_id, SK: sana — bir shifokorning kunlik smenalari
    name: 'schedules',
    backup: true,
    attrs: [S('doctor_id'), S('date')],
    keys: [HASH('doctor_id'), RANGE('date')],
  },
  {
    // PK: "doctor_id#sana", SK: vaqt — slot bandligini atomik tekshirish uchun
    name: 'appointments',
    backup: true,
    attrs: [S('doctor_day'), S('time'), S('phone'), S('starts_at'), S('date')],
    keys: [HASH('doctor_day'), RANGE('time')],
    indexes: [
      {
        IndexName: 'patient-index',
        KeySchema: [HASH('phone'), RANGE('starts_at')],
        Projection: ALL,
      },
      {
        // date-index: eslatma va kunlik xulosa cron'lari uchun — ular
        // butun klinika bo'yicha "shu kundagi navbatlar" ni so'raydi
        IndexName: 'date-index',
        KeySchema: [HASH('date'), RANGE('starts_at')],
        Projection: ALL,
      },
    ],
  },
  {
    // 1C laboratoriya natijalari — 1C o'zi yozadi: kalit telefon,
    // sort_key = hujjat UUID, ichida AnalysisResults ro'yxati.
    // Sayt /api/me da o'qib, har analitni alohida qatorga yoyadi.
    name: 'analysis_results',
    backup: true,
    attrs: [S('phone'), S('sort_key')],
    keys: [HASH('phone'), RANGE('sort_key')],
  },
  {
    // 1C "Doktorga Qabul" (Document.DoctorsAdmission) hujjatlari — 1C o'zi
    // yozadi: kalit telefon, sort_key = hujjat UUID. Hujjat o'tkazilgan
    // bo'lsa (Posted=true) bemor kelgan hisoblanadi va sayt navbatni
    // "done" deb belgilaydi (docs/1c-sync.md, 6.3).
    //
    // date-index: cron butun klinika bo'yicha "shu kundagi qabullar" ni
    // so'raydi — telefonni oldindan bilmaydi.
    name: 'visits',
    backup: true,
    attrs: [S('phone'), S('sort_key'), S('date')],
    keys: [HASH('phone'), RANGE('sort_key')],
    indexes: [
      { IndexName: 'date-index', KeySchema: [HASH('date'), RANGE('sort_key')], Projection: ALL },
    ],
  },
  {
    name: 'payments',
    backup: true,
    attrs: [S('payment_id')],
    keys: [HASH('payment_id')],
  },
  {
    // PK: bemor telefoni, SK: "sana#kod"
    name: 'lab_results',
    backup: true,
    attrs: [S('phone'), S('sort_key')],
    keys: [HASH('phone'), RANGE('sort_key')],
  },
  {
    // Saytdagi narxlar (F2): item_id = "analysis#<kod>" — tahlil turlari.
    // Shifokor qabuli narxi doctors jadvalida (price). Admin paneldan
    // tahrirlanadi; sayt /api/prices dan o'qiydi.
    name: 'prices',
    backup: true,
    attrs: [S('item_id')],
    keys: [HASH('item_id')],
  },
  {
    // So'rov cheklovi: kalit — "nima#kim#oyna", TTL bilan o'zi o'chadi.
    // Jadval bo'lmasa sayt ishlayveradi (cheklov o'chgan holatda).
    name: 'rate_limits',
    attrs: [S('bucket')],
    keys: [HASH('bucket')],
    ttlAttribute: 'expires_at',
  },
  {
    // Kirish sessiyasi (A-auth): saytda "Kodni olish" bosilganda nonce
    // ochiladi, bot /start kirish_<nonce> ni ko'rib telefonni yozadi,
    // sayt esa poll qilib kod kiritish maydonini avtomatik ochadi.
    // Vaqtinchalik — TTL bilan o'zi o'chadi (bemor ma'lumoti saqlanmaydi).
    name: 'login_sessions',
    attrs: [S('nonce')],
    keys: [HASH('nonce')],
    ttlAttribute: 'expires_at',
  },
  {
    // Bemor baholari (G2/F3): PK shifokor, SK baho qo'yilgan lahza (ISO).
    // O'rtacha baho va soni doctors jadvalida (rating_sum, rating_count)
    // yig'ilib turadi — sayt kartasi shu yerdan o'qiydi.
    name: 'ratings',
    backup: true,
    attrs: [S('doctor_id'), S('created_at')],
    keys: [HASH('doctor_id'), RANGE('created_at')],
  },
];
