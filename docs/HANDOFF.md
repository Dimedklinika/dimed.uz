# Dimed.uz — loyiha holati va davom ettirish uchun qo'llanma (handoff)

> Bu hujjat yangi seansda (yoki yangi odam) ishni davom ettirishi uchun.
> Oxirgi yangilanish: **2026-09-05** (7-bosqich — bug fix va
> yaxshilashlar, PR #23). Sayt **jonli**: baza sozlangan, @dimedcbot
> ishlayapti, CI yashil (113 mantiq + 102 API testi, typecheck 0 xato).
> Qolgan ishlar — «Hozirgi holat» bo'limida.

## Loyiha nima

Chinoz shahridagi **Dimed** ko'p ixtisosli tibbiy markazi uchun yangi sayt:
onlayn navbat, Telegram orqali kirish, bemor va shifokor shaxsiy kabinetlari,
1C laboratoriya tizimidan avtomatik tahlil natijalari.

Eski sayt — Jekyll'da edi, u `legacy/` papkasiga arxivlangan (o'chirilmagan:
tahlillar va narxlar shu yerdan olinadi, deploy qilinmaydi).

**Stack:** Astro 5 + Tailwind 4 + TypeScript · Netlify Functions ·
Amazon DynamoDB (us-east-1, jadval prefiksi `dimed_`) · Telegram Bot API ·
Payme (kod tayyor, kassa kutilmoqda)

**Repo:** `santyx-afk/dimed.uz`, asosiy branch — `master`.
**Bot:** @dimedcbot (saytda «Dimed klinikasi boti» deb ko'rinadi).
**Admin panel:** `/kabinet/admin` (kirish `ADMIN_TELEGRAM_IDS` bo'yicha).

---

## Hozirgi holat (2026-09-05)

Jonli va tekshirilgan: baza (9 jadval, TTL yoqilgan), 9 shifokor yuklangan,
webhook ulangan (kod kelyapti), admin panel ochilgan, QA aylanishi o'tkazilib
topilgan kamchiliklar tuzatilgan, test ma'lumotlar bazadan tozalangan.

7-bosqich (bug fix va yaxshilashlar) `master` ga qo'shilgach jonli bazada
ikkita yangi jadval (`prices`, `ratings`) va bir martalik ikkita skript
kerak — pastdagi checklist.

### Klinika egasi zimmasida

- [x] ~~AWS kalitini almashtirish~~ — bajarildi (2026-08-31).
- [ ] Payme kassa ID va kalitlar → `PAYME_MERCHANT_ID`, `PAYME_KEY`,
      `PAYMENT_ENABLED=1` (bron mantig'i o'zgarmaydi; hozir sayt
      «qabulxona kassasida to'lash» rejimida).
- [ ] **7-bosqich deploy'idan keyin (bir marta):** jonli bazada
      `prices` va `ratings` jadvallarini yaratish (`bash
      cloudshell-setup.sh` — mavjudlarini o'tkazib yuboradi), so'ng
      `npm run migrate-slot-minutes` (60 daqiqalik slot) va
      `npm run seed-prices` (narxlar bazaga; keyin admin → Narxlar).
      Netlify'da `SITE_URL=https://dimed.uz` (bot havolalari uchun).
- [ ] **1C kengaytmasini o'rnatish** — qo'llanma alohida berilgan; eng
      muhim uch nuqtasi: fayl rejimi emasligini tekshirish, `Posted` /
      `DeletionMark` maydonlarini qo'shish, eski ikkita reglament
      topshirig'ini o'chirish.
- [ ] Ginekologiyaga yangi shifokor kelganda `/kabinet/admin` da qo'shish
      (Murtazayeva ishdan bo'shagan — yozuvi saqlangan, saytdan
      yashirilgan).
- [ ] Mobil (375px) ko'rinishni qo'lda bir aylanib chiqish.
- [ ] (istalganda, xavfsizlik) Telegram bot tokenini BotFather'da `/revoke`
      qilish → Netlify'da `TELEGRAM_BOT_TOKEN` → Trigger deploy →
      **setWebhook'ni qayta chaqirish** (secret bilan birga).

### 1C dasturchisi zimmasida (spetsifikatsiya: `docs/1c-integration.md`)

- Konstanta `DynamoDBAnalysisResultTable = dimed_analysis_results`
  (standart `AnalysisResult` **emas** — sayt IAM'i faqat `dimed_*` o'qiydi).
- Telefonsiz bemorlarni yubormaslik — ular `"+"` kaliti ostiga tushib qoladi.
- `dimed_individuals` dagi eski yozuvni yangi formatda qayta yuborish:
  endi `sort_key` = 1C bemor kodi (alohida `Code` maydoni kerak emas).
- Sana formatida `DF=yyyy-MM-dd` afzal (sayt `dd.MM.yyyy H:mm:ss` ni ham
  tushunadi, bir xonali soat bilan ham).
- **Yangi:** `Posted` va `DeletionMark` (BOOL) yuborish — bekor qilingan
  natija kabinetda qolib ketmasligi uchun; `dimed_individuals` ga ham
  `DeletionMark`. To'liq javob: `docs/1c-integration.md` → «Sayt
  tomonining javobi».

### Keyingi seans uchun (so'ralganda)

- Sinov bog'lamasini yechish: **+998998889808 Ashurovga test uchun ulangan**.
  Haqiqiy shifokorlar: `npm run link-doctor -- <id> --phone +998...`
  (argumentsiz — ro'yxat).
- Ega tasdiqlagach eski `dimed_test_table` va `AnalysisResult` jadvallarini
  o'chirish.
- ~~G'oya: 1C yangi natija yozganda bemorga bot-xabar (cron orqali).~~
  Bajarildi — `notify-results` (7-bosqich).
- Navbatlarni 1C ga o'tkazish (`docs/1c-sync.md`) — 1C dasturchisi
  tasdiqlagach.
- `lc-results` (`LC_API_KEY`) — eski yo'l; 1C to'g'ridan-to'g'ri yozuvi
  barqaror ishlagach olib tashlash mumkin.

---

## Biznes-mantiq (kelishilgan qoidalar)

- **Autentifikatsiya faqat Telegram orqali.** SMS yo'q, parol yo'q. Bemor botga
  `/start` yuboradi, kontaktini ulashadi, 6 xonali OTP oladi (5 daqiqa amal
  qiladi, bir martalik), uni saytga kiritadi. Telefon allaqachon bog'langan
  bo'lsa `/start` darhol yangi kod yuboradi — kontakt qayta so'ralmaydi.
- **Smenalar va tanaffuslar.** Har bir shifokor kuniga bir nechta smena
  belgilaydi (masalan 08:00–12:00 va 13:00–17:00). Smenalar orasidagi
  bo'shliq — tanaffus, unga slot tushmaydi. Slot davomiyligini ham shifokor
  o'zi tanlaydi (10/15/20/30/60 daqiqa; standart — **60**, ya'ni 08:30,
  09:30, …). Dam olish kunini shifokor kabinetidan belgilaydi.
- **1 soat qoidasi.** Qabul boshlanishiga kamida 1 soat qolgan bo'lishi kerak —
  ham bron qilish, ham vaqtni ko'chirish uchun. Roppa-rosa 60 daqiqa —
  **ruxsat etiladi** («kamida» shartiga mos).
- **Yosh cheklovi shifokorga qarab.** Har bir shifokorda `age_group`
  bo'ladi: `all` (standart), `adult` — 16 yosh va undan katta, `child` —
  16 yoshgacha. Admin panelda belgilanadi. Yosh **qabul kuniga** qarab
  hisoblanadi: bugun 15 da bo'lgan bemor 16 ga to'ladigan kunga
  kattalar shifokoriga yozila oladi. Bron vidjeti mos kelmagan
  bemorni xiralashtiradi va o'tkazmaydi, `/api/book` esa qayta
  tekshiradi (vidjetni chetlab o'tgan so'rov ham to'xtaydi).
- **Bekor qilish va ko'chirish.** Bemor navbatni boshqa vaqtga ko'chira
  yoki bekor qila oladi — ikkalasi ham qabulga 1 soatdan ko'p qolganda.
  Bekor qilingan slot boshqa bemorlarga ochiladi. Shifokor o'zgarmaydi
  (boshqa shifokorga o'tish — bu yangi bron).
- **Bir vaqtda 5 tadan ko'p kelgusi bron bo'lmaydi** (bitta telefonda):
  kimdir slotlarni band qilib, klinikaning kunini to'sib qo'ymasin.
- **Klinika vaqti — Asia/Tashkent (UTC+5).** Server UTC'da ishlaydi, shuning
  uchun sana/vaqt hisoblari faqat `lib/time.ts` orqali qilinadi.
- **Bir slot — bir bemor.** DynamoDB shartli yozuvi bilan kafolatlanadi.
- **Navbat kim uchun.** Bron paytida oila a'zosi va uning tug'ilgan sanasi
  tanlanadi (majburiy), maxfiylik siyosatiga rozilik olinadi.
- **To'lov — qabulxona kassasida.** Onlayn to'lov `PAYMENT_ENABLED` ortida
  o'chiq; 5-qadamda narx va «kassaga to'laysiz» matni ko'rinadi.
- **Qabuldan keyin baho.** Shifokor «Qabul qilindi» desa bemorga botda
  1–5 yulduz so'rovi boradi; «Kelmadi» bo'lsa so'ralmaydi.
- **1C bazaga to'g'ridan-to'g'ri yozadi, sayt faqat o'qiydi** (quyida).

---

## Bajarilgan ishlar

### 1-hafta ✅
- Repo qayta tuzildi: Jekyll → `legacy/`, o'rniga Astro loyihasi
- Astro + Tailwind + TypeScript skeleti, Netlify sozlamalari
- Dizayn Astro komponentlariga ko'chirildi (bosh sahifa, tahlillar sahifasi)
- Shriftlar o'z serverimizda (woff2), shifokor rasmlari webp (423KB → 103KB)
- `telegram-webhook`, `auth-verify` (OTP + imzolangan HttpOnly sessiya)
- `lc-results` — 1C dan matn natijalar (PDF yo'q — brauzer o'zi yasaydi)
- Admin log-bot: har qanday xato Telegram guruhga
- `docs/1c-integration.md` — 1C dasturchisi uchun spetsifikatsiya

### 2-hafta ✅
- **Umumiy mantiq** (`netlify/functions/lib/`): `time.ts` (UTC+5),
  `slots.ts` (slot yasash, 1 soat qoidasi), `appointments.ts` (hold muddati),
  `schedule.ts` (smenalarni tekshirish), `payment.ts` (to'lov adapteri)
- **API:** `/api/slots`, `/api/book` (atomik), `/api/payment-webhook`,
  `/api/me`, `/api/doctor-schedule`, `/api/logout`,
  `/api/doctors` (public), `/api/admin-doctors` (admin CRUD)
- **Sahifalar:** `/kirish` (OTP), `/kabinet` (bemor), `/kabinet/shifokor`,
  `/kabinet/admin` (egaga — shifokorlarni boshqarish)
- Navbat vidjeti real API'ga ulandi, SEO: `robots.txt`, `sitemap.xml`

### 3-hafta ✅
- **`POST /api/reschedule`** — vaqtni ko'chirish. Avval yangi slot atomik
  egallanadi, keyin eskisi `moved` bo'ladi; ikkinchi qadam yiqilsa yangi
  yozuv qaytarib olinadi (bitta bemorda ikkita navbat qolmasin).
- **`POST /api/doctor-off`** — «bugun ishga chiqa olmayman»: kun yopiladi,
  navbatlar `cancelled_by_clinic`, bemorlarga bot orqali uzr xabari.
- **Eslatmalar (cron):** `remind-patients` (har 10 daqiqada, qabulga ~1 soat
  qolganda) va `doctor-daily` (Toshkentda 07:00, «bugungi navbatlaringiz»).
- `appointments` ga **`date-index` GSI**.

### 4-bosqich — ishga tushirish ✅ (2026-08-25…28)
- **Baza jonli sozlandi**: 9 jadval yaratildi, `otp_codes` TTL yoqildi,
  9 shifokor yuklandi. `scripts/cloudshell-setup.sh` DynamoDB Local'da
  E2E tekshirildi (idempotent, `telegram_id` bog'lanishlarni o'chirmaydi).
- **@dimedcbot webhook ulandi.** 401 bo'lsa log faqat ikki tomondagi secret
  **uzunligini** chiqaradi — sir oshkor bo'lmaydi, xato tomoni darhol ko'rinadi.
- **1C to'g'ridan-to'g'ri yozuv arxitekturasi**: 1C `dimed_individuals`
  (profil) va `dimed_analysis_results` (natijalar) ga o'zi yozadi. Sayt
  kontakt ulashishda va **har kirishda** profilni `dimed_users` ga
  birlashtiradi (`lib/patients.ts`, best-effort — xato kirishni to'smaydi).
  `/api/me` ikkala natija jadvalini o'qiydi, begona yozuvlarga chidamli:
  bitta jadval yiqilsa qolgani ko'rinadi, 1C adashib `dimed_lab_results`
  ga qo'ygan 1420 hujjat ham o'qiladi (tarix saqlanadi).
- **CSV import**: `scripts/import-patients.mjs` — 1C ro'yxatini telefon
  bo'yicha botdan o'tgan bemorlarga biriktiradi (`--dry` rejimi bor).
- **UX tuzatishlari**: OTP `<code>` da (bosilsa nusxalanadi), `/start`
  telefonni qayta so'ramaydi, ko'chirish kalendari o'zbekcha, natija PDF'i
  yashirin `iframe` + `print()` orqali (popup-blocker o'tkazib yuboradi),
  shifokor kabinetida 7 kunlik navigatsiya va **faqat band slotlar**,
  bosh sahifada shifokor soni jonli `/api/doctors` dan.
- **QA aylanishi** o'tkazildi, topilganlar tuzatildi, test bron/smenalar
  bazadan tozalandi.

### 5-bosqich — MedHisob (1C) hisobotiga moslash ✅ (2026-08-30)
1C dasturchisi konfiguratsiya bo'yicha to'liq hisobot berdi; unga ko'ra:
- natijalar **oxirigacha** o'qiladi (`queryAllPages`) — eski 50 talik
  chegara to'liq yuklashdan keyin tarixning katta qismini yashirardi;
- cron so'rovlari ham sahifalanadi (kunlik navbat ro'yxati);
- bir telefondagi oiladan Telegram egasi tanlanadi, natijalarda esa
  kimniki ekani yoziladi;
- 1C kodidagi guruh ajratkichi tozalanadi (`"10 482"` → `"10482"`);
- bo'sh analit nomi o'rniga xalqaro kod ko'rsatiladi;
- `Posted=false` / `DeletionMark=true` yozuvlar kabinetda ko'rinmaydi.

Javob va 1C tomonidan kutilayotgan uchta yangi maydon:
`docs/1c-integration.md` → «Sayt tomonining javobi».

### 6-bosqich — bemorni tanlash va panel tozalash ✅ (2026-08-31)
- **Navbat kim uchun?** Bir telefondan butun oila foydalanadi. Endi
  kirishda «kim kirmoqda?» bir marta so'raladi, bron oynasida esa
  bemorni almashtirish yoki **yangi odam qo'shish** mumkin
  (familiya+ism majburiy, sharif ixtiyoriy). Tanlangani eslab qolinadi.
  Ro'yxat ikki manbadan: 1C katalogi va saytda qo'shilganlar.
- Navbat yozuviga `patient_id` / `patient_name` tushadi; shifokor
  kabinetida telefon o'rniga **bemor ismi** ko'rinadi, bot tasdig'ida
  va bemor kabinetida ham.
- **Faolsiz shifokor saytdan yo'qoladi**: kartasi yashiriladi, shifokori
  qolmagan bo'lim «vaqtincha yopiq» bo'ladi va tugmasi o'chadi.
- **Admin panel** bo'limlar bo'yicha guruhlandi; «O'chirish» →
  «Saytdan yashirish», teglar «saytda ko'rinadi» / «kabinetga kira
  olmaydi» kabi tushunarli yozuvlarga almashtirildi.

### 7-bosqich — bug fix va yaxshilashlar ✅ (2026-09-05, PR #23)

Egasining 2026-09-05 spetsifikatsiyasi bo'yicha, har blok alohida commit:
- **A1/A2/A3/A4** — mobil burger-menyu (Kabinet tugmasi doim ko'rinadi),
  yopishqoq header'ga yaxlit/blur fon, oraliqlar 4/8/16/24/32/48/64
  tizimiga (`--sp-*`, `--wrap-pad`, `--section-pad`, `--card-pad`
  tokenlari), manzil Google Maps havolasi.
- **B1–B4** — bron: bemor tug'ilgan sanasi majburiy (kun/oy/yil,
  yozuvga ham tushadi), maxfiylik roziligi (`/maxfiylik`), 5-qadam
  «kassada to'laysiz» tasdig'i (onlayn to'lov `PAYMENT_ENABLED` ortida
  o'chiq), standart slot 60 daqiqa (`migrate-slot-minutes`).
- **C1–C3** — header'da Kabinet dropdown (ism, telefon; Navbatlarim,
  Tahlillarim, Navbat olish, Sozlamalar, Chiqish), kabinet alohida
  yo'llarga bo'lindi (`Cabinet.astro` qolipi), natijalar ro'yxati
  (nom, holat, Ko'rish), `/tahlillar` da «Mening tahlillarim».
- **D1/D2** — `/natija?id=` sahifasi (`sampledesign.html` asosida, Dimed
  palitrasi, A4 chop etish), PDF brauzerda (html2pdf.js, CDN), ulashish
  (Web Share API / nusxalash, HMAC token, `lib/share.ts`); `noindex`.
- **E1–E3** — shifokor kabineti qayta ishlandi (kun chip'lari, dam olish
  kunlari, aniq smena yozuvlari), «Qabul qilindi / Kelmadi»
  (`appointment-status`, `no_show` holati), Murtazayeva `active:false`
  bilan yashirildi (yozuv saqlanadi, admin paneldan qaytariladi).
- **F1–F3** — admin: shifokorlar (`/kabinet/admin`, faollik/narx/
  davomiylik), **Narxlar** (`prices` jadvali, `seed-prices`, `/api/prices`
  — sayt narxlarni jonli oladi, faolsiz tahlil yashiriladi), **Baholar**
  (ro'yxat, yashirish → o'rtachadan chiqadi).
- **G1/G2** — bot: yangi natija tushganda havola (`notify-results`),
  qabuldan keyin 1–5 yulduz + izoh (`ask-ratings`, `lib/ratings.ts`,
  `ratings` jadvali, `doctors.rating_sum/rating_count`).
- **H1–H3** — `robots.txt` (admin/kabinet/api/natija yopiq) va
  `sitemap.xml`, `/maxfiylik` (uz/ru/en), `docs/1c-sync.md`.

**Ommaviy sahifalar uch tilda.** `/`, `/ru/`, `/en/` va `/tahlillar`
juftlari bitta fayldan yig'iladi (`src/pages/[...lang]/`). Matn
serverda yoziladi — Google JS'ni kutmaydi. Kabinet va kirish
sahifalari esa bitta manzilda turadi va tilni brauzerda almashtiradi
(`data-t` + `applyPageLang`), chunki ular indekslanmaydi. Manzil
tildan ustun: `/ru/` ni ochgan odam kabinetda o'zbekchani tanlagan
bo'lsa ham ruscha ko'radi.

**Tarjima qayerda.** `src/data/i18n.ts` — brauzerga ham yuklanadigan
matn (kabinet, vidjet, bot javoblari). `src/data/home.ts` — faqat
build paytida kerak bo'ladigan marketing matni; alohida turadi, aks
holda kabinet sahifalarining JS to'plamiga qo'shilib ketardi.
`src/data/analyses-i18n.ts` — tahlil nomlari kod bo'yicha; ular
`analyses.json` ga yozilmaydi, chunki u fayl `npm run build-analyses`
bilan qayta hosil qilinadi.
- Yangi matnlar uch tilda: sayt lug'ati `src/data/i18n.ts` (`t()`,
  `getLang`: `?lang=` → localStorage → `<html lang>`), bot lug'ati
  `lib/i18n.ts` (`users.lang`, Sozlamalar sahifasidan).

---


### 9-bosqich — 1C bilan ikki tomonlama bog'lanish ✅ (2026-09-07)
- **Davomat.** `sync-attendance` cron'i (har 10 daqiqada) `dimed_visits`
  dagi o'tkazilgan "Doktorga Qabul" hujjatlarini o'qib navbatni `done`,
  kuni tugab hujjat topilmasa `no_show` qiladi. Shifokorning qo'lda
  qo'ygan belgisi ustun (`marked_at` bor yozuvga tegilmaydi). Har hujjat
  bir marta ishlatiladi — `lib/visits.ts` `matchArrivals`.
- **Sayt → 1C.** MedHisob konfiguratsiyasida `DynamoSyncBookings`
  moduli `dimed_appointments` ni `date-index` bo'yicha o'qib
  `Document.DoctorsAdmission` yaratadi (`WebBookingKey` = `doctor_day|time`,
  o'tkazilmagan holda). Batafsil: `docs/1c-sync.md` 6.2–6.4.
- **Tahlil nomi.** 1C endi `AnalysisName` va `Doctor` yuboradi; eski
  hujjatlar uchun `lib/panels.ts` panelni ko'rsatkichlardan taniydi.
- **Jadval:** `dimed_visits` (`phone` + `sort_key`, `date-index`).
- **Region:** kodda standart region `us-east-1` ga o'zgartirildi —
  jadvallar o'sha yerda.

### 10-bosqich — xabarlar ishonchliligi, PDF, kirish ✅ (2026-10-02)
Batafsil: `docs/YANGILANISH-2026-10-02.md`; 1C yamoqlari: `docs/1c-tuzatishlar.md`.
- **Cron:** `lib/cron.ts` (`cronGuard`) — begona so'rov oynada bir marta, Netlify
  rejalashtiruvchisi va `CRON_SECRET` cheklanmaydi.
- **Yo'qolmaydigan xabarlar:** `TelegramError` / `isTransientTelegramError` (lib/telegram.ts);
  `remind-patients`, `doctor-daily`, `ask-ratings`, `notify-results` vaqtinchalik xatoda
  "yuborildi" belgisini qaytaradi (avval belgi yuborishdan oldin qo'yilib, kalit buzilganda
  hamma xabar yo'qolardi). Yangi bemorga 3 kundan yangi natija haqida xabar ketadi.
- **PDF:** logo (`src/lib/pdf-logo.ts`), shkala (canvas), QR → `/tekshirish`
  (`/api/verify`, `createVerifyToken` — muddatsiz, faqat "bor va bekor qilinmagan").
- **Kirish:** kod xabari tagida "Saytga kirish" (`/kirish#p=…&c=…`) va "Kodni nusxalash" tugmalari.
- **Admin:** `skipPayment` (faqat `isAdmin`) — onlayn to'lov yoqilganda ham sinov bron.
- `lib/site.ts` — `siteOrigin` (netlify.app o'rniga asosiy manzil).
- **Qo'shimcha xizmatlar va qayta ko'rik:** `lib/services.ts` (`parseServices` / `formatServices` /
  `resolveService`; admin matn qatori `Nomi | narx | 1C kodi | qayta:N`), `doctors.services`,
  `book.ts` (`serviceId`, narx xizmatdan, narx 0 → to'lovsiz), `appointments.followupCheck`
  (qayta ko'rik: shu shifokorga oddiy qabulga kelgan bemorga qabuldan keyin N kun ichida, necha marta
  bo'lsa ham; muddat faqat oddiy qabuldan sanaladi; `reschedule.ts` ham tekshiradi), vidjetda
  3-qadamda tanlov. 1C: `DynamoSyncBookings.ServiceFor` (`service_code` → `Catalog.GoodsAndServices`).
  Ega aytgan: 10 kun, ko'p marta. Tasdiqlanmagan taxmin: «faqat shu shifokorga» — `YANGILANISH-2026-10-02.md`, 1-band.
- **Telefon ko'rinishi:** `.wrap` yon bo'shlig'i komponentlarning `padding: A 0 B` qoidalaridan
  himoyalandi (`global.css`, `html .wrap.wrap` — faqat ekranda, ≤1187px); grid ustunlari `minmax(0, …)`;
  jadvallar telefonda nom + narx. Regressiya testi: `test-e2e.mjs` «Telefon ko'rinishi (360px)».
- **To'langan summa → 1C:** `payment-webhook.ts` (PerformTransaction) navbatga `paid_amount` (so'm) va
  `paid_at` yozadi (pul qaytarilsa olib tashlanadi, `reschedule.ts` ko'chiradi); 1C
  `DynamoSyncBookings.PaidAmountOf` → `DoctorsAdmission.PrepaidAmount`.
- **Sotuv «Doktorga Qabul» asosida (1C):** `Sales.Filling` — `PaymentMethodNew` faqat `PrepaidAmount > 0`
  bo'lsa, `Base` = hujjat; `Base` «sarf» bo'lmaganda qarz yopilmaydi (`IsBasedOnExpenditure`);
  `PrintConsultationPaper` «Navbat» ga `Base.Time` qo'yadi. Tafsilot: `docs/1c-tuzatishlar.md`, 8-band.
- **Natija `0`:** 1C `AnalysisRowsList` nolni me'yor jadvali quyi chegarasi 0 bo'lgandagina yuboradi.
- Botda `/id` — Telegram ID (`ADMIN_TELEGRAM_IDS` uchun).

## Kod tuzilishi

```
src/
  components/   Nav (burger + Kabinet menyusi), Footer, Logo, DeptIcon, BookingWidget
  data/         doctors.ts, departments.ts, site.ts, analyses.json (43 ta tahlil),
                i18n.ts (sayt matnlari uz/ru/en)
  layouts/      Base.astro, Cabinet.astro (kabinet bo'limlari: tablar, sarlavha)
  lib/          lang (til tanlash), birthdate (kun/oy/yil select), dates,
                doctor-cabinet, live-prices (/api/prices dan narx yangilash)
  pages/        index, tahlillar, kirish, natija, maxfiylik, kabinet (→ navbatlar),
                kabinet/{navbatlar,tahlillar,sozlamalar},
                kabinet/shifokor/{index,jadval,dam,sozlamalar},
                kabinet/admin/{index,narxlar,baholar}, robots.txt.ts, sitemap.xml.ts
  styles/       global.css (rang + oraliq tokenlari), fonts.css
netlify/functions/
  lib/          db, env, http, session, telegram (inline tugmalar ham), time, slots,
                appointments, schedule, auth, payment, patients (1C profil),
                results (natija hujjatlari, me'yor), panels (tahlil nomini tanish),
                visits (1C "Doktorga Qabul" - bemor keldimi),
                analyte-info (ko'rsatkich izohlari),
                share (ulashish tokeni), ratings (baho oqimi), i18n (bot matnlari)
  *.ts          har bir fayl — bitta /api/<nom> endpoint
  remind-patients, doctor-daily, notify-results, ask-ratings,
  sync-attendance — cron (config.schedule)
scripts/        create-tables, seed-doctors, seed-prices, migrate-slot-minutes,
                link-doctor, import-patients, build-analyses,
                cloudshell-setup.sh (+ gen-cloudshell-setup),
                fake-dynamo (testlar uchun), test-*.mjs
docs/           HANDOFF (shu fayl), ISHGA-TUSHIRISH, 1c-integration, 1c-sync,
                payme-integration
legacy/         eski Jekyll sayti (kontent manbasi, deploy qilinmaydi)
```

### Buyruqlar
```bash
npm run dev          # lokal server
npm run build        # dist/ ga yig'ish
npm run typecheck    # astro check + tsc
npm test             # 113 mantiq + 102 API tekshiruvi (haqiqiy AWS'siz)
npm run create-tables
npm run seed-doctors
npm run seed-prices  # tahlil narxlarini prices jadvaliga (--dry, --force)
npm run migrate-slot-minutes  # bazadagi shifokorlarni 60 daqiqalik slotga (--dry)
npm run link-doctor  # shifokorni Telegram'ga bog'lash (argumentsiz — ro'yxat)
npm run gen-cloudshell  # scripts/cloudshell-setup.sh ni qayta yaratish
node scripts/import-patients.mjs bemorlar.csv --dry  # 1C CSV import sinovi
```

### CloudShell skripti
`scripts/cloudshell-setup.sh` — `create-tables` + `seed-doctors` ning
AWS CLI'dagi ko'chirmasi. Sababi amaliy: klinika egasi CloudShell'ga
bitta faylni yuklaydi va `bash cloudshell-setup.sh` deydi — git,
Node.js, npm va kalit kerak emas.

Fayl **qo'lda tahrirlanmaydi**: u `tables.mjs` va `doctors.ts` dan
`npm run gen-cloudshell` orqali yaratiladi, `test-tables.mjs` esa
faylning manbaga mosligini tekshiradi. Shifokor narxi o'zgarib fayl
yangilanmasa, test qizil bo'ladi.

Maydon nomlari `#f0`, `#f1` kabi taxalluslar bilan yoziladi —
DynamoDB'ning band so'zlari ro'yxati uzun va kengayib turadi.

### Testlar haqida
Testlar **haqiqiy AWS'siz** ishlaydi: `scripts/fake-dynamo.mjs` xotirada
DynamoDB o'rnini bosadi (PutItem, GetItem, UpdateItem, Query va
ConditionExpression'larni tushunadi), Telegram chaqiruvlari `globalThis.fetch`
orqali ushlab qolinadi. `scripts/test-api.mjs` butun oqimni sinaydi:
bot → OTP → sessiya → bron → ko'chirish → eslatma → kunlik xulosa →
shifokor chiqmadi → admin panel → Payme.

**Sanalar Toshkent kalendari bo'yicha olinadi.** `BOOK_DATE` — bugundan
ikki kun keyin: eslatma testining «30 daqiqadan keyingi» yozuvi Toshkentda
yarim tunga yaqin ertangi kunga tushib, «shifokor chiqmadi» testi bilan
kesishardi. Avval sana UTC bo'yicha hisoblanardi va testlar sutkasiga
330 daqiqa yiqilardi.

**Brauzer testlari** (`npm run test:e2e`): `astro preview` ko'tariladi,
API javoblari soxta, Playwright bron vidjetini va yopiq sahifalarni
mobil hamda desktopda tekshiradi. Sababi amaliy: "bemor tanlanmasdan
5-qadamga o'tib ketardi" xatosi hamma test yashil turganda sodir
bo'lgan edi — u faqat brauzerda ko'rinadi. Lokal ishga tushirishda
`DIMED_CHROMIUM` bilan brauzer yo'lini ko'rsatish mumkin.

**CI:** `.github/workflows/ci.yml` har PR va master'ga push'da
`typecheck → test → build → test:e2e` ni yurgizadi. Kalit kerak emas.

TypeScript fayllar testlarda `node --experimental-strip-types` bilan
to'g'ridan-to'g'ri import qilinadi — shuning uchun `lib/` ichidagi importlar
`.ts` kengaytmasi bilan yozilgan (`allowImportingTsExtensions: true`).

---

## DynamoDB sxemasi (jonli, prefiks `dimed_`, us-east-1)

| Jadval | PK / SK | Izoh |
| --- | --- | --- |
| `users` | `telegram_id` | **faqat sayt yozadi.** GSI: `phone-index`, `code-index` (1C kodi, sparse) |
| `otp_codes` | `phone` | TTL: `expires_at` (jonli bazada yoqilgan) |
| `individuals` | `phone` / `sort_key` | **1C yozadi.** `sort_key` = 1C bemor kodi. Maydonlar inglizcha: Surname, Name, Patronymic, IsMale, Birthday… |
| `doctors` | `doctor_id` | GSI: `telegram-index` (shifokor kabineti). `age_group`: `all` / `adult` (16+) / `child` (16 gacha) |
| `schedules` | `doctor_id` / `date` | kunlik smenalar, `day_off`, `summary_sent_at` |
| `appointments` | `doctor_day` / `time` | `doctor_day` = `"<doctor_id>#<sana>"`; GSI: `patient-index` (`phone`/`starts_at`), `date-index` (`date`/`starts_at`) |
| `analysis_results` | `phone` / `sort_key` | **1C yozadi.** `sort_key` = hujjat UID, ichida `AnalysisResults` ro'yxati |
| `payments` | `payment_id` | |
| `lab_results` | `phone` / `sort_key` | sayt yozuvi (`"<sana>#<kod>"`); 1C adashib qo'ygan hujjatlar ham o'qiladi |
| `prices` | `item_id` | `analysis#<kod>` — tahlil turi narxi, muddati, `active` (F2); admin tahrirlaydi, `/api/prices` o'qiydi |
| `ratings` | `doctor_id` / `created_at` | bemor bahosi 1–5, izoh, `hidden` (G2/F3); yig'indi `doctors.rating_sum/rating_count` da |

Qo'shimcha maydonlar (7-bosqich): `users` — `lang`, `birth_dates` (1C
bemori uchun saytda kiritilgan sana), `patients` (saytda qo'shilgan oila
a'zolari, `birth_date` bilan), `privacy_accepted_at`, `results_notified`,
`pending_rating`; `appointments` — `patient_birth_date`,
`privacy_accepted_at`, `marked_at`, `rating_asked_at`, `rating`,
`rated_at`; `doctors` — `active`, `rating_sum`, `rating_count`;
`schedules` — `day_off`, `off_reason`.

**Bron holatlari:** `hold` (5 daqiqa, onlayn to'lov uchun) → `paid`;
`booked` (klinikada to'lash — darhol kuchga kiradi); `done` (qabul
qilindi); `no_show` (kelmadi); `moved`; `cancelled`;
`cancelled_by_clinic` (shifokor chiqmadi).

Holatlar bilan ishlash `lib/appointments.ts` da markazlashgan:
- `holdsSlot()` — yozuv slotni band qilib turibdimi (muddati o'tgan hold —
  yo'q; `moved` / `cancelled*` — yo'q). DynamoDB TTL kechikishiga tayanilmaydi.
- `isConfirmed()` — bron kuchdami (`paid` yoki `booked`). Eslatma, ko'chirish
  va kunlik xulosa faqat shularga tegishli.

Jonli bazada ikkita **meros jadval** ham bor: `dimed_test_table` va 1C
standart nomi bilan yaratilgan `AnalysisResult` — ega tasdiqlagach o'chiriladi.

---

## Muhim qarorlar va tuzoqlar

1. **To'lov hozircha «klinikada to'lash» rejimida.** Payme kassasi hali
   ochilmagan. Integratsiya kodi to'liq yozilgan: checkout havolasi
   (`lib/payment.ts`) va Payme Merchant API webhook'i (`payment-webhook.ts`,
   JSON-RPC: CheckPerform/Create/Perform/Cancel/Check/GetStatement).
   Kassa ochilgach `PAYME_MERCHANT_ID`, `PAYME_KEY` qo'yiladi va
   `PAYME_ENABLED=1` qilinadi; bron mantig'i o'zgarmaydi.
   To'liq spetsifikatsiya: `docs/payme-integration.md`.

2. **Shifokorning `telegram_id` si qo'lda bog'lanadi.** `seed-doctors` uni
   yozmaydi — aks holda har seed'da bog'lanish o'chib ketardi. Buning uchun
   `npm run link-doctor` bor (telefon yoki id bo'yicha, bitta akkaunt ikkita
   shifokorga biriktirilmaydi). Bu qadam unutilsa bemor tomoni ishlaydi,
   shifokor esa kabinetiga kira olmaydi.

3. **`define:vars` bo'lgan `<script>` inline bo'ladi** va DOM to'liq
   yuklanishidan oldin ishga tushadi. Shuning uchun BookingWidget'dagi
   «Navbat olish» tugmalari **event delegatsiya** orqali ushlanadi. Kabinet
   sahifasidagi ko'chirish tugmalari ham shunday — kartochkalar har safar
   `innerHTML` bilan qaytadan chiziladi.

4. **Astro scoped CSS bola komponentga o'tmaydi.** `Logo.astro` ga `class`
   berish ishlamagan — endi `height` prop orqali atributda beriladi.

5. **`<template>` ichidagi tugunlar `document.querySelectorAll` bilan
   topilmaydi** — faqat `template.content` orqali.

6. **`/api/slots` keshlanmaydi** (`no-store`). Avval 20 soniya keshlangan edi:
   bron qilgan bemor orqaga qaytsa o'z slotini yana bo'sh ko'rib 409 olardi.

7. **Vidjetdagi kun tugmalari serverdan tuzatiladi.** `/api/slots` har javobda
   `workdays` ni qaytaradi; statik `doctors.ts` faqat birinchi chizishga.

8. **Cron eslatmalari takror yubormaydi.** `remind-patients` avval yozuvni
   `reminded_at` bilan shartli belgilaydi, keyin xabar yuboradi. Kunlik
   xulosa `schedules.summary_sent_at` bilan xuddi shunday himoyalangan.
   Eslatma oynasi 70 daqiqa (60 emas): cron 10 daqiqada bir ishlaydi.

9. **`doctor-off` avval kunni yopadi, keyin navbatlarni bekor qiladi** —
   teskari tartibda bo'shagan slotni yangi bemor ilib ketishi mumkin edi.

10. **Admin panel — `/kabinet/admin`.** Kirish `ADMIN_TELEGRAM_IDS` bo'yicha
    (`isAdmin`, lib/auth.ts). 403 javobi joriy `telegramId` ni qaytaradi —
    egasi o'z ID sini bilib, env'ga qo'yishi uchun. Upsert **UpdateCommand
    SET** bilan — `telegram_id` bog'lanish o'chmaydi. «O'chirish» =
    `active:false` (navbatlar tarixi saqlanadi).

21. **Bron 4-qadamidan bemorsiz o'tib bo'lmaydi.** Kirmagan
    foydalanuvchi avval 5-qadamga o'tkazib yuborilardi va navbat
    ismsiz qolardi. Endi kirish o'sha qadamning o'zida (Telegram kodi
    bilan), 5-qadam esa faqat `proceed()` orqali ochiladi. 5-qadamda
    sessiya tugasa (401) foydalanuvchi 4-qadamga qaytariladi —
    tanlangan shifokor va vaqt saqlanib qoladi.

11. **Shifokor ro'yxati jonli.** `GET /api/doctors` faol shifokorlarni beradi;
    bron vidjeti, bosh sahifadagi shifokor soni va bo'lim hisoblagichlari
    shundan yangilanadi (statik ro'yxat — faqat birinchi chizish).

12. **1C bilan taqsimot qat'iy:** 1C faqat `dimed_individuals` va
    `dimed_analysis_results` ga yozadi; `dimed_users` — faqat sayt
    (`telegram_id` kalitini 1C bilmaydi ham). Sayt 1C jadvallarini faqat
    o'qiydi va har qanday shakldagi yozuvga chidamli bo'lishi shart:
    telefoni yo'q bemor `"+"` kaliti ostida, sana `"28.12.2024 9:30:24"`
    kabi bir xonali soat bilan, kod esa `"10 482"` ko'rinishida
    (1C `String(Son)` guruh ajratkichini qo'shadi) kelishi mumkin.

17. **DynamoDB javobni 1 MB da kesadi** — `Limit` so'ralmasa ham.
    Shuning uchun ko'p yozuv qaytarishi mumkin bo'lgan har bir so'rov
    `queryAllPages()` (lib/db.ts) orqali oxirigacha o'qiladi: bemor
    natijalari va cron'ning kunlik navbat ro'yxati. Soxta DynamoDB ham
    sahifalaydi (25 tadan), ya'ni sahifalashni unutgan kod testda
    ushlanadi. Natijalarni bitta sahifa bilan cheklab bo'lmaydi: 1C
    hujjatining sort kaliti — UUID, tartibi sanaga bog'liq emas.

18. **Bekor qilingan natija ko'rinmaydi.** 1C hujjatni bekor qilsa
    (`Posted=false`) yoki o'chirishga belgilasa (`DeletionMark=true`),
    sayt uni kabinetda ko'rsatmaydi. Maydon umuman bo'lmasa —
    ko'rsatiladi (eski yozuvlar ular yuborilmasdan oldin tushgan).
    Shu yo'l tanlangani uchun 1C'ga `DeleteItem` huquqi kerak emas.

22. **Bemor ro'yxati sahifalanadi.** `dimed_individuals` telefon
    bo'yicha `queryAllPages` bilan oxirigacha o'qiladi. Avval
    `Limit: 25` turardi va sahifalanmasdi: bir telefon ostida 25 tadan
    ko'p yozuv bo'lsa oilaning bir qismi jimgina yo'qolardi. Xato
    bo'lsa endi log-botga boradi (avval `catch(() => [])` edi va
    sabab bilinmasdi). Kodsiz eski "PROFILE" yozuvi ham ro'yxatda
    qoladi, lekin kodli yozuv bilan ismi bir xil bo'lsa takrorlanmaydi.
    Nima ko'rinishini tekshirish: `npm run check-patients -- +998...`.

20. **Bemor kimligi — `/api/patients`.** Ro'yxat 1C katalogi va
    `dimed_users.patients` (saytda qo'shilganlar) dan yig'iladi;
    tanlangani `active_patient_id` da turadi. Yangi odam qo'shish
    `list_append` bilan — ikki qurilmadan bir vaqtda qo'shilsa ham
    biri yo'qolmaydi. Bron `patientId` ni qabul qiladi, yuborilmasa
    oxirgi tanlangani olinadi; eski bronlarda bu maydon yo'q va
    hamma joyda shunga chidamli bo'lish kerak.

19. **Bir telefon — bir oila.** Bemor profili birlashtirilayotganda
    Telegram bergan ism bilan solishtirib mos kelgan bemor tanlanadi
    (`telegram_name` — 1C hech qachon yozmaydigan yagona ism maydoni).
    Natijalar esa hammasi ko'rinadi, har birida `PatientName` bilan
    kimniki ekani yoziladi.

13. **Webhook secret qoidalari** (ikki marta kuydirgan!):
    faqat harf-raqam — brauzer URL'ni `#` da kesadi, Telegram maxsus
    belgini rad etadi; secret Netlify env'da va `setWebhook` da **aynan
    bir xil** bo'lishi shart; token yoki secret o'zgarsa `setWebhook`
    **qayta** chaqiriladi; «Webhook is already set» = parametrlar
    o'zgarmagan; brauzer tarixidagi eski setWebhook havolasini qayta
    ochish — eski secret'ni qaytarib qo'yadi. 401 diagnostikasi
    funktsiya logida: ikkala tomon secret'ining uzunligi.

14. **Netlify env o'zgarishi o'z-o'zidan kuchga kirmaydi** — har env
    o'zgarishidan keyin **Trigger deploy** kerak. Yana bir tuzoq:
    production deploy **Locked** bo'lishi mumkin (Deploys sahifasida) —
    o'shanda preview'lar yig'ilaveradi, sayt esa eski deploy'da qoladi
    (avgustda 3 ta PR shu sababdan ko'rinmay turgan).

15. **Natija PDF'i yashirin `iframe` (`srcdoc`) + `contentWindow.print()`
    bilan.** `window.open` + `noopener` `null` qaytaradi, popup-blocker esa
    oynani yutib yuborardi — iframe usuli hammasidan o'tadi.

16. **Bemor profili 1C dan birlashtiriladi** (`lib/patients.ts`,
    `mergeIndividualProfile`): kontakt ulashilganda va har OTP kirishda.
    Xatosi kirishni to'smaydi (catch → log-bot). Kontakt saqlash **Put emas
    Update** — 1C sinxronlagan maydonlar o'chib ketmasin.

21. **Onlayn to'lov global `PAYMENT_ENABLED` ortida** (`lib/payment.ts`,
    `paymentEnabled()`; eski `PAYME_ENABLED` ham tan olinadi). Bo'sh —
    bron `booked` bo'ladi, 5-qadamda «Qabulxona kassasiga X so'm
    to'laysiz». Payme kodi saqlangan; `1` + kalitlar — onlayn rejim.
    Rejimni vidjet `/api/doctors` javobining `x-payment-mode` sarlavhasidan
    (`online` | `at_clinic`) biladi: onlayn rejimda pulli qabulda «Tasdiqlagach
    Payme orqali X so'm to'laysiz» va «Payme orqali to'lash» tugmasi, bosh
    sahifadagi «Qanday ishlaydi» 4-band ham Payme deydi (`data-pay-text`).
    Bepul xizmat va admin «sinov bron» — kassa matni bilan qoladi.
    Bo'shatilgan slot (`moved`/`cancelled*`) qayta band qilinadi —
    `book` va `reschedule` shartida shu holatlar bor.

22. **Kabinet — alohida yo'llar, bitta qolip.** `layouts/Cabinet.astro`
    sarlavha + tablar (bemor / shifokor / admin) beradi; header'dagi
    Kabinet menyusi `/api/session` dan rollarni oladi va sessionStorage'da
    5 daqiqa keshlaydi (chiqishda `kirish.astro` uni tozalaydi).
    `/kabinet` → `/kabinet/navbatlar` ga yo'naltiradi.

23. **Uch til — faqat yangi matnlar uchun lug'at.** Sayt o'zbekcha
    qoladi; yangi bo'limlar (`natija`, `maxfiylik`, bron 4–5 qadam,
    kabinet menyusi) `src/data/i18n.ts` dan `t(key, lang)` bilan
    chiziladi, til `?lang=` → `localStorage.dimed_lang` → `<html lang>`.
    Bot `users.lang` bo'yicha (`lib/i18n.ts`, `botText`).

24. **Natija sahifasi (`/natija?id=`)** ma'lumotni `/api/result` dan
    oladi (`lib/results.ts` — ikkala natija jadvali, me'yoriy oraliq va
    holat `parseReference`/`statusOf`, ko'rsatkich izohlari
    `analyte-info.ts`). PDF **brauzerda** (html2pdf.js npm paketi, faqat
    tugma bosilganda alohida chunk bo'lib yuklanadi; fayl nomi
    `Dimed_{FISh}_{sana}.pdf`), server PDF yo'q. Kutubxona ilgari
    cdnjs'dan olinardi — CSP (`script-src 'self'`) uni bloklardi va
    tugma jimgina `window.print()` ga tushib ketardi.
    PDF olishdan oldin sahifa **darhol** tepaga chiqariladi
    (`scroll-behavior: smooth` shu safar o'chiriladi) va html2canvas'ga
    `scrollY: -window.scrollY` beriladi: aks holda surilgan masofa PDF
    tepasida bo'sh varaq bo'lib qolardi (Safari'da ayniqsa).
    Ulashish havolasi — HMAC token (`lib/share.ts`, 30 kun), sessiyasiz
    ochiladi.

    **Sarlavha.** 1C endi `AnalysisName` va `Doctor` yuboradi. Bazadagi
    eski hujjatlarda ular yo'q, shuning uchun `lib/panels.ts`
    ko'rsatkichlar to'plamiga qarab panelni taniydi ("Umumiy qon
    tahlili"). Ilgari bu holatda birinchi ko'rsatkich nomi chiqardi —
    "Gemoglobin +23". Server `title` (o'zbekcha) bilan birga `titleKey`
    (`panel.cbc`) ham yuboradi, brauzer uni tanlangan tilda ko'rsatadi
    (`src/lib/result-title.ts`).

25. **Baho oqimi (`lib/ratings.ts`).** `askRating` — `rating_asked_at`
    shartli yoziladi (bir marta), so'ng inline tugmalar
    (`r:<doctor>|<sana>|<vaqt>:<n>`, 64 baytdan oshmaydi). Callback'da
    navbat egasi tekshiriladi, `ratings` ga yoziladi, `doctors` da
    `rating_sum`/`rating_count` `if_not_exists(...) + :n` bilan
    yig'iladi; admin yashirsa ayiriladi (ikki marta emas — `hidden`
    shartli). Izoh 24 soat `users.pending_rating` orqali kutiladi;
    `/start` va `/help` undan ustun.

26. **Narxlar jonli.** Sahifalar statik `analyses.json` bilan chiziladi,
    yuklangach `applyLivePrices()` (`src/lib/live-prices.ts`)
    `/api/prices` dan narxni almashtiradi, faolsiz tahlil qatorini va
    bo'sh qolgan guruhni yashiradi, «N ta tahlil» hisobini qayta sanaydi.
    Baza bo'sh bo'lsa statik narxlar qoladi — `seed-prices` bir marta.

27. **Oraliq tokenlari (A3).** `global.css`: `--sp-1…7` = 4/8/16/24/32/
    48/64, `--wrap-pad` (24/16), `--section-pad` (64/48), `--card-pad`
    (24/16 — mobilda bir qadam kichik). Yangi CSS'da padding/margin/gap
    faqat shu qiymatlardan; hizalash offsetlari `calc(ikon + token)`.

28. **Soxta DynamoDB kengaytmalari (testlar):** `SET a = if_not_exists(a,
    :z) + :n` arifmetikasi, `ReturnValues: 'ALL_NEW'`, `Query` indekslar
    bo'yicha. Shart ifodalari avval ` OR `, keyin ` AND ` bo'yicha
    bo'linadi — murakkab qavsli shartlar yozilmaydi (`appointment-status`
    shartiga qarang).

---

## Muhit o'zgaruvchilari (Netlify)

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_LOG_BOT_TOKEN`,
`TELEGRAM_LOG_CHAT_ID`, `ADMIN_TELEGRAM_IDS`, `SESSION_SECRET`, `SITE_URL`
(bot xabarlaridagi havolalar; bo'sh bo'lsa so'rov manzili),
`DIMED_AWS_REGION`, `DIMED_TABLE_PREFIX`, `DIMED_AWS_ACCESS_KEY_ID`,
`DIMED_AWS_SECRET_ACCESS_KEY`, `LC_API_KEY` (meros),
`PAYMENT_ENABLED` (bo'sh = kassada to'lash), `PAYME_MERCHANT_ID`,
`PAYME_KEY`, `PAYME_TEST_KEY`

To'liq izohlar bilan — `.env.example`. Har o'zgarishdan keyin —
**Trigger deploy** (14-tuzoq).

### Xavfsizlik qoidalari

- Kalit va token **qiymatlari** hech qachon repoga, hujjatga yoki commit'ga
  yozilmaydi — bu fayl ham faqat nomlarni aytadi.
- Chatga tushib qolgan kalit — oshkor bo'lgan kalit: darhol rotatsiya
  (yuqoridagi checklist'da tartibi bor).
- Lokal ishda kalitlar faqat vaqtinchalik faylda (chmod 600) turadi va
  ish tugashi bilan qaytarib bo'lmas o'chiriladi.

---

## Ish uslubi (shu loyihada kelishilgan)

- Muloqot va kod izohlari — **o'zbek tilida**; foydalanuvchiga javoblar
  qisqa va sodda («qisqa qisqa ayt»).
- Har bir o'zgarishdan keyin: `npm run typecheck && npm test && npm run build`
- Yangi mantiq yozilsa — unga test ham yoziladi (`scripts/test-*.mjs`)
- Sahifa o'zgarsa — brauzerda (Playwright, Chromium `/opt/pw-browsers/chromium`)
  light/dark va mobil rejimda tekshiriladi
- Commit xabarlari o'zbekcha, nima o'zgargani va nima uchun tushuntiriladi
- Har ish alohida `claude/*` branch'ida boradi (oxirgisi —
  `claude/dimed-bug-fixes-improvements-7u2pat`, PR #23), har blok
  alohida conventional commit (`feat:` / `fix:` / `docs:`), PR
  `master` ga ochiladi; ega «merge» desa — merge qilinadi.
