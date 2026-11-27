# dimed.uz

Dimed klinikasi (Chinoz) sayti: onlayn navbat, Telegram orqali kirish,
shaxsiy kabinet, laboratoriya natijalari, tashrif buyuruvchi shifokorlarga
yozilish va parol bilan kiriladigan `/admin` paneli.

**Stack:** Astro + Tailwind CSS + TypeScript · Netlify Functions · Netlify Blobs (rasmlar) · Amazon DynamoDB + S3 · Telegram Bot API

## Ishga tushirish

```bash
npm install
cp .env.example .env    # qiymatlarni to'ldiring
npm run dev             # http://localhost:4321
```

| Buyruq | Vazifa |
| --- | --- |
| `npm run dev` | Lokal server |
| `npm run build` | Saytni `dist/` ga yig'ish |
| `npm run preview` | Yig'ilgan saytni ko'rish |
| `npm run typecheck` | Astro va funksiyalar tiplarini tekshirish |
| `npm test` | Barcha tekshiruvlar (mantiq + API) |
| `npm run create-tables` | DynamoDB jadvallarini yaratish (bir marta) |
| `npm run create-visiting-tables` | Faqat yangi jadvallar: `visiting_doctors`, `visiting_bookings`, `site_media` |
| `npm run migrate-images` | Repodagi rasmlarni Netlify Blobs'ga ko'chirish (bir marta; `--dry`, `--force`) |
| `npm run seed-doctors` | Shifokorlarni bazaga yozish |
| `npm run seed-prices` | Tahlil narxlarini `prices` jadvaliga yozish (bir marta; `--dry`, `--force`) |
| `npm run migrate-slot-minutes` | Bazadagi shifokorlarni 60 daqiqalik slotga o'tkazish (bir marta) |
| `npm run link-doctor` | Shifokorni Telegram hisobiga bog'lash |
| `npm run import-patients` | 1C CSV ro'yxatini bemorlarga biriktirish |
| `npm run gen-cloudshell` | `scripts/cloudshell-setup.sh` ni qayta yaratish |
| `npm run build-analyses` | `legacy/` dan tahlillar ro'yxatini yangilash |

Testlar haqiqiy AWS'siz ishlaydi: `scripts/fake-dynamo.mjs` xotirada
DynamoDB o'rnini bosadi, Telegram chaqiruvlari esa ushlab qolinadi.

## Loyiha tuzilishi

```
src/
  components/     Nav (burger + Kabinet menyusi), Footer, BookingWidget, Logo, DeptIcon
  data/           doctors.ts, departments.ts, site.ts, analyses.json, i18n.ts (uz/ru/en)
  layouts/        Base.astro — umumiy qolip; Cabinet.astro — kabinet bo'limlari (tablar)
  lib/            lang, birthdate, dates, doctor-cabinet, live-prices,
                  result-title, age, phone, reveal, signin
  pages/          index, tahlillar, kirish, natija, maxfiylik,
                  kabinet/{navbatlar,tahlillar,sozlamalar},
                  kabinet/shifokor/{index,jadval,dam,sozlamalar},
                  kabinet/admin/{index,narxlar,baholar}, robots.txt, sitemap.xml
  styles/         global.css (rang va oraliq tokenlari), fonts.css
netlify/
  functions/      API — har fayl bitta /api/<nom> endpoint; cron'lar config.schedule bilan
    lib/          db, telegram, session, env, http, time, slots, appointments, schedule,
                  auth, payment, patients, results, panels, visits, analyte-info,
                  share, ratings, rate-limit, age, phone, i18n
scripts/          create-tables, seed-doctors, seed-prices, migrate-slot-minutes,
                  link-doctor, import-patients, build-analyses, gen-cloudshell-setup,
                  fake-dynamo (testlar), test-*.mjs
docs/             LOYIHA-XARITASI (kod qayerda nima qiladi), OCHILISH-REJASI,
                  QOLGAN-ISHLAR, ISHGA-TUSHIRISH, HANDOFF,
                  1c-integration, 1c-sync, payme-integration
legacy/           eski Jekyll sayti (arxiv, deploy qilinmaydi)
```

## API

| Endpoint | Vazifa |
| --- | --- |
| `POST /api/telegram-webhook` | Bot: `/start`, kontakt, OTP; baho tugmalari (`callback_query`) va izoh |
| `POST /api/auth-verify` | OTP kodni tekshirish, sessiya ochish |
| `POST /api/logout` | Sessiyani tugatish |
| `GET /api/session` | Kim kirgan: ism, telefon, rollar (header'dagi Kabinet menyusi) |
| `GET,POST /api/settings` | Bemor tili (uz/ru/en) |
| `GET,POST /api/patients` | Bir telefon — bir oila: bemorni tanlash, qo'shish, tug'ilgan sana |
| `POST /api/lc-results` | 1C dan tahlil natijalari (meros yo'l; 1C endi bazaga o'zi yozadi) |
| `GET /api/doctors` | Faol shifokorlar: jadval, narx, o'rtacha baho |
| `GET /api/slots` | Bo'sh slotlar (shifokor + sana) |
| `POST /api/book` | Slotni atomik band qilish — bemor, tug'ilgan sana, rozilik majburiy |
| `POST /api/reschedule` | Vaqtni ko'chirish (1 soat qoidasi) |
| `GET /api/me` | Bemor: qabullari va tahlillari (`?include=`) |
| `GET /api/result` | Bitta natija hujjati (sahifa uchun); `?share=1` — ulashish havolasi |
| `GET /api/prices` | Saytdagi narxlar: tahlil turlari (`prices`) va shifokor qabuli |
| `GET,POST /api/doctor-schedule` | Shifokor: smenalar, slot davomiyligi, kun navbati, dam kuni |
| `POST /api/doctor-off` | «Shifokor ishga chiqa olmadi»: kunni yopish |
| `POST /api/appointment-status` | Shifokor: «Qabul qilindi» / «Kelmadi» (baho so'rovini ishga tushiradi) |
| `GET,POST,DELETE /api/admin-doctors` | Admin: shifokorlar (faollik, narx, davomiylik) |
| `GET,POST /api/admin-prices` | Admin: tahlil va qabul narxlari |
| `GET,POST /api/admin-ratings` | Admin: baholar ro'yxati, yashirish |
| `POST /api/payment-webhook` | Payme webhook — faqat `PAYMENT_ENABLED=1` bo'lsa (hozir o'chiq) |
| `GET /api/site-content` | Tashrif shifokorlari kartalari + admin almashtirgan rasmlar (CDN kesh) |
| `GET /api/visiting-slots` | Tashrif shifokorining yaqin kunlari va **faqat bo'sh** vaqtlari |
| `POST /api/visiting-book` | Tashrif shifokoriga yozilish (kirishsiz, bepul, to'lov klinikada) |
| `GET /media/*` | Netlify Blobs'dagi rasmlar; `/media/slot/banner` — og:image |
| `GET,POST,DELETE /api/admin-auth` | `/admin` ga parol bilan kirish / chiqish |
| `GET,POST,PATCH,DELETE /api/admin-visiting` | Admin: tashrif shifokorlari |
| `GET,POST /api/admin-visiting-bookings` | Admin: yozilganlar, holat |
| `POST /api/admin-upload` | Admin: rasm yuklash (siqish, WebP) |
| `GET,POST,DELETE /api/admin-media` | Admin: banner, galereya, shifokor rasmlari |

Tashrif shifokorlari va `/admin` paneli haqida batafsil —
[`docs/TASHRIF-SHIFOKORLAR.md`](docs/TASHRIF-SHIFOKORLAR.md).

### Rejalashtirilgan funksiyalar (cron)

Netlify Scheduled Functions — tashqaridan chaqirilmaydi, faqat jadval bo'yicha:

| Funksiya | Jadval (UTC) | Vazifa |
| --- | --- | --- |
| `remind-patients` | `*/10 * * * *` | Qabulga ~1 soat qolgan bemorlarga eslatma |
| `doctor-daily` | `0 2 * * *` | Toshkentda 07:00 — shifokorga «bugungi navbatlaringiz» |
| `notify-results` | `*/15 * * * *` | 1C yangi natija yozganda bemorga nom, sana va sahifa havolasi |
| `ask-ratings` | `*/15 * * * *` | Qabul vaqti + davomiyligi o'tgan navbat uchun bahoni so'rash |

Hech biri takror yubormaydi: eslatma — `reminded_at`, kunlik xulosa —
`schedules.summary_sent_at`, natija xabari — `users.results_notified`,
baho so'rovi — `rating_asked_at` bilan bir martaga bog'langan.

### Slot va bron qoidalari

- Slotlar shifokorning smenalaridan hisoblanadi; smenalar orasidagi
  bo'shliq — tanaffus, unga slot tushmaydi. Standart davomiylik —
  **60 daqiqa** (08:30, 09:30, …); shifokor 10/15/20/30/60 dan tanlaydi.
- Qabul boshlanishiga **kamida 1 soat** qolgan bo'lishi kerak.
- Slot DynamoDB shartli yozuvi bilan band qilinadi — ikki bemor bitta
  slotni ola olmaydi (ikkinchisiga 409 qaytadi).
- Bron darhol kuchga kiradi, to'lov qabulxona kassasida. (Onlayn
  to'lov yoqilsa slot 5 daqiqaga *hold* qilinadi va to'lov o'tmasa
  avtomatik bo'shaydi.)
- Klinika vaqti — Asia/Tashkent (UTC+5), server UTC'da ishlasa ham.
- Bemor navbatni **boshqa vaqtga ko'chira** (`moved`) yoki **bekor qila**
  (`cancelled`) oladi — ikkalasi ham 1 soat qoidasiga bo'ysunadi va
  slotni bo'shatadi. Shifokor o'zgarmaydi: boshqa shifokor — yangi navbat.
- Shifokor kunni yopsa (`/api/doctor-off`) o'sha kundagi navbatlar
  `cancelled_by_clinic` bo'ladi, bemorlarga bot orqali xabar ketadi va
  slotlar bo'shaydi.
- Qabuldan keyin shifokor navbatni `done` («Qabul qilindi») yoki
  `no_show` («Kelmadi») deb belgilaydi; `done` bo'lsa bemorga botda
  1–5 yulduzli baho so'rovi keladi, o'rtacha baho shifokor kartasida.
- Navbat olishda bemor (oila a'zosi) va uning tug'ilgan sanasi hamda
  maxfiylik siyosatiga rozilik (`/maxfiylik`) majburiy.

### To'lov rejimi

Onlayn to'lov ishlatilmaydi: sayt **"qabulxona kassasida to'lash"**
rejimida ishlaydi — bemor slotni band qiladi, tasdiqlash qadamida
narx va «Qabulxona kassasiga X so'm to'laysiz» matni ko'rinadi, to'lov
klinikada. Payme integratsiya kodi (`lib/payment.ts`,
`payment-webhook.ts`) saqlangan, lekin global `PAYMENT_ENABLED`
sozlamasi ortida o'chiq (standart — bo'sh). Kelajakda qaytarish:
`PAYMENT_ENABLED=1` + Payme kalitlari — bron mantig'i o'zgarmaydi.

## Sozlash (bir martalik)

### 1. Telegram botlar

1. [@BotFather](https://t.me/BotFather) da `/newbot` — asosiy bot yarating,
   tokenni `TELEGRAM_BOT_TOKEN` ga yozing.
2. Yana bir bot yarating (xatolar uchun) — `TELEGRAM_LOG_BOT_TOKEN`.
   Log-botni yopiq guruhga qo'shing va guruh id sini `TELEGRAM_LOG_CHAT_ID` ga yozing.
3. Webhook'ni ulang:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://dimed.uz/api/telegram-webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

### 2. AWS

```bash
npm run create-tables    # 11 ta jadval, PAY_PER_REQUEST
npm run seed-doctors     # shifokorlar
npm run seed-prices      # tahlil narxlari (keyin admin panel → Narxlar)
```

PDF fayllar uchun S3 bucket yarating (ommaviy kirish **yopiq**) va nomini
`LAB_S3_BUCKET` ga yozing.

### 3. Netlify

Reponi ulang — `netlify.toml` dagi sozlamalar avtomatik qo'llanadi.
Barcha `.env.example` dagi o'zgaruvchilarni Netlify environment
variables bo'limiga qo'shing.

### 4. Integratsiyalar

[`docs/1c-integration.md`](docs/1c-integration.md) va
[`docs/1c-sync.md`](docs/1c-sync.md) ni 1C dasturchisiga bering,
[`docs/payme-integration.md`](docs/payme-integration.md) ni esa to'lov
tizimini ulaydigan dasturchiga (kassa ochilgach).

## Hujjatlar

| Fayl | Kim uchun |
| --- | --- |
| [`docs/TASHRIF-SHIFOKORLAR.md`](docs/TASHRIF-SHIFOKORLAR.md) | Klinika egasi — `/admin` paneli, tashrif shifokorlari, rasmlar; ishga tushirish |
| [`docs/LOYIHA-XARITASI.md`](docs/LOYIHA-XARITASI.md) | **Yangi dasturchi yoki AI — nima qayerda: oqimlar, jadvallar, endpointlar, tuzoqlar** |
| [`docs/OCHILISH-REJASI.md`](docs/OCHILISH-REJASI.md) | Klinika egasi — ochilishdan oldingi to'rt qadam (deploy, 1C, shifokorlar, sozlamalar) |
| [`docs/QOLGAN-ISHLAR.md`](docs/QOLGAN-ISHLAR.md) | Klinika egasi — hozir nima qilish kerak (joriy ro'yxat) |
| [`docs/ISHGA-TUSHIRISH.md`](docs/ISHGA-TUSHIRISH.md) | Klinika egasi — qadamma-qadam ishga tushirish |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Sayt dasturchisi — texnik qarorlar, kod tuzilishi, tuzoqlar |
| [`docs/1c-integration.md`](docs/1c-integration.md) | 1C dasturchisi — bemor profili va tahlil natijalari |
| [`docs/1c-sync.md`](docs/1c-sync.md) | 1C dasturchisi — navbatlarni 1C bilan sinxronlash (maydonlar, yo'nalish, tekshiruv) |
| [`docs/payme-integration.md`](docs/payme-integration.md) | To'lov dasturchisi — Payme kassasini ulash |

## Eski sayt

Avvalgi Jekyll sayti `legacy/` papkasida saqlanmoqda — kontent manbasi
sifatida ishlatiladi (`npm run build-analyses`) va deploy qilinmaydi.
