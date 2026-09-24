# Loyiha xaritasi

> **Kim uchun:** loyihaga yangi kelgan dasturchi yoki AI agent uchun.
> Nima qayerda, nima nimaga bog'liq va nimaga e'tibor berish kerak.
>
> Qarindosh hujjatlar: `HANDOFF.md` — texnik qarorlar va nega shunday
> qilingani; `1c-sync.md` — 1C bilan shartnoma; `OCHILISH-REJASI.md` —
> klinika egasi uchun qadamlar.

## 1. Bir qarashda

Chinoz shahridagi **Dimed** klinikasining sayti: onlayn navbat, bemor
kabineti, tahlil natijalari. Uch tilda (uz asosiy, ru, en).

| Qatlam | Texnologiya | Qayerda |
| --- | --- | --- |
| Sayt | Astro 5 (statik HTML) + Tailwind 4 | `src/` → `dist/` |
| API | Netlify Functions (TypeScript, Node) | `netlify/functions/` |
| Baza | AWS DynamoDB, region **`us-east-1`** | `scripts/tables.mjs` |
| Kirish | Telegram bot (parolsiz) | `telegram-webhook.ts`, `auth-verify.ts` |
| Klinika tizimi | 1C **MedHisob** — DynamoDB orqali, ikki tomonlama | `docs/1c-sync.md` |
| Hosting | Netlify (oldida Cloudflare) | `netlify.toml` |

**Server yo'q, ma'lumotlar bazasi ulanishi yo'q.** Har sahifa statik,
har API — alohida funksiya. Holat faqat DynamoDB'da va imzolangan
cookie'da.

## 2. Papkalar

```
src/
  pages/           har fayl — bitta manzil (Astro file-based routing)
  components/      qayta ishlatiladigan bo'laklar (.astro)
  layouts/         Base (ommaviy) va Cabinet (yopiq sahifalar)
  lib/             brauzerda ishlaydigan yordamchilar
  data/            matnlar, tarjimalar, statik ro'yxatlar
  styles/          global.css (tokenlar, umumiy klasslar), fonts.css
  types/           tashqi paketlar uchun tip ta'riflari

netlify/functions/
  *.ts             har fayl — bitta /api/<nom> endpoint
  lib/             server tomonidagi umumiy modullar

scripts/           bir martalik va xizmat skriptlari + testlar
docs/              hujjatlar
legacy/            eski Jekyll sayti — DEPLOY QILINMAYDI, lekin
                   `build-analyses.mjs` undan tahlillar ro'yxatini
                   o'qiydi, shuning uchun o'chirilmaydi
public/            shriftlar, rasmlar, favicon
```

## 3. Ma'lumot oqimlari

### 3.1. Kirish (parolsiz, Telegram orqali)

```
bemor → botga /start → kontakt ulashadi
      → telegram-webhook.ts telefonni users jadvaliga yozadi
      → saytda "Kirish" → bot 6 xonali kod yuboradi
      → auth-verify.ts kodni tekshiradi → imzolangan cookie
```

Cookie — `HttpOnly`, `SameSite=Lax`, HMAC bilan imzolangan
(`lib/session.ts`). Brauzer uni o'qiy olmaydi, shuning uchun
"kim kirgan" ni bilish uchun alohida yengil endpoint bor:
`GET /api/session`.

Qulaylik uchun **«Kodni olish»** bir tugmali oqim (A-auth): sayt
`auth-start.ts` da nonce ochadi, bemor `t.me/dimedcbot?start=kirish_<nonce>`
havolasi orqali botga o'tadi, bot telefonni kirish sessiyasiga yozadi va
kodni yuboradi, sayt esa nonce'ni poll qilib telefonni oldindan to'ldiradi
va kod maydonini ochadi (`lib/login.ts`). Kod baribir kiritiladi —
xavfsizlik chegarasi o'sha.

Kodni taxmin qilishga qarshi uch qatlam: bitta kodga urinishlar soni,
bitta raqamga soatiga so'rovlar, IP bo'yicha cheklov
(`lib/rate-limit.ts` → `dimed_rate_limits`, TTL bilan o'zi o'chadi).

### 3.2. Bron

```
BookingWidget.astro → /api/doctors (shifokorlar)
                    → /api/slots   (bo'sh vaqtlar)
                    → /api/book    (band qilish)
```

Slot bandligi **atomik** tekshiriladi: `dimed_appointments` kaliti
`doctor_day` (`"ashurov#2026-09-08"`) + `time` (`"10:00"`), yozuv
`ConditionExpression: attribute_not_exists(...)` bilan qo'yiladi.
Ikki kishi bir vaqtni bir zumda tanlasa, ikkinchisi rad javobini oladi —
qo'shimcha qulf yoki tranzaksiya kerak emas.

Vaqtni ko'chirishda **yangi yozuv** ochiladi, eskisi `moved` bo'ladi.

### 3.3. Tahlil natijalari (1C → sayt)

1C `dimed_analysis_results` ga hujjat yozadi (kalit: telefon + hujjat
UUID). Sayt uni o'qiydi, har analitni alohida qatorga yoyadi:

```
/api/me?include=results  → kabinet ro'yxati
/api/result?id=…         → natija sahifasi (/natija)
```

Sarlavha (`lib/results.ts` → `titleOf`) tartib bilan:
1C bergan `AnalysisName` → `lib/panels.ts` ko'rsatkichlardan taniydi →
bitta ko'rsatkich bo'lsa uning nomi → uchtagacha bo'lsa nomlari →
biomaterial → umumiy nom.

Nomlar avval `lib/analysis-dict.ts` orqali o'zbekchaga o'giriladi (1C
ruscha/texnik yuborsa; topilmasa asl nom, I1). 1C me'yoriy oraliq
bermagan ko'rsatkichga `lib/references.ts` (admin kiritgan) oralig'i
fallback bo'lib qo'yiladi va holat (me'yor/yuqori/past) hisoblanadi (F4).

### 3.4. Davomat (sayt ↔ 1C, ikki tomonlama)

```
sayt: bemor bron qiladi        → dimed_appointments
1C:   reglament o'qiydi        → "Doktorga Qabul" hujjati (o'tkazilmagan)
1C:   registrator o'tkazadi    → dimed_visits (Posted = true)
sayt: sync-attendance croni    → navbat status = done
      kun tugab hujjat yo'q    → status = no_show
```

Shifokorning qo'lda qo'ygan belgisi ustun: `marked_at` to'ldirilgan
yozuvga avtomat tegmaydi.

## 4. DynamoDB jadvallari

Prefiks `dimed_`, region `us-east-1`. To'liq ta'rif —
`scripts/tables.mjs` (yagona manba: `create-tables.mjs` ham,
`cloudshell-setup.sh` ham shundan hosil bo'ladi).

| Jadval | Kalit | Indekslar | Kim yozadi |
| --- | --- | --- | --- |
| `users` | `telegram_id` | `phone-index`, `code-index` | sayt |
| `otp_codes` | `phone` | — (TTL) | sayt |
| `individuals` | `phone` + `sort_key` | — | **1C** |
| `analysis_results` | `phone` + `sort_key` | — | **1C** |
| `visits` | `phone` + `sort_key` | `date-index` | **1C** |
| `doctors` | `doctor_id` | `telegram-index` | sayt |
| `schedules` | `doctor_id` + `date` | — | sayt |
| `appointments` | `doctor_day` + `time` | `patient-index`, `date-index` | sayt (1C **o'qiydi**) |
| `payments` | `payment_id` | — | sayt |
| `lab_results` | `phone` + `sort_key` | — | sayt (eski API yo'li) |
| `prices` | `item_id` | — | sayt |
| `ratings` | `doctor_id` + `created_at` | — | sayt |
| `rate_limits` | `bucket` | — (TTL) | sayt |
| `login_sessions` | `nonce` | — (TTL) | sayt |

`prices` jadvalida ikki xil yozuv: `item_id="analysis#<kod>"` — tahlil
narxlari; `item_id="reference#<nom>#<jins>"`, `kind="reference"` —
ko'rsatkichlarning me'yoriy oraliqlari (admin kiritadi, F4). Ommaviy
`/api/prices` faqat `kind="analysis"` ni beradi.

> **Qoida: har jadvalga faqat bitta tomon yozadi.** Buzilganda ma'lumot
> jimgina bir-birini bosib ketadi.

Bemor ma'lumoti bor 11 jadvalda **PITR** (35 kunlik zaxira) yoqilgan.

## 5. API — endpointlar

Manzil `/api/<fayl nomi>` (redirect `netlify.toml` da).

### Ommaviy

| Fayl | Nima qiladi |
| --- | --- |
| `doctors.ts` | Faol shifokorlar ro'yxati — bron vidjeti shunga tayanadi |
| `slots.ts` | Bir kundagi bo'sh vaqtlar |
| `prices.ts` | Tahlil va qabul narxlari |
| `session.ts` | Kim kirgan (header'dagi menyu uchun) |
| `telegram-webhook.ts` | Botdan keladigan hamma narsa: `/start` (+ `kirish_<nonce>`), kontakt, tugmalar, izohlar |
| `auth-verify.ts` | Kirish kodini tekshiradi, sessiya ochadi |
| `auth-start.ts` | «Kodni olish» deep-link: nonce ochadi, poll qiladi (A-auth) |
| `logout.ts` | Sessiyani tugatadi |
| `lc-results.ts` | 1C eski API yo'li (`X-API-Key`) — natija qabul qiladi |
| `payment-webhook.ts` | Payme Merchant API (JSON-RPC) |

### Bemor (sessiya kerak)

| Fayl | Nima qiladi |
| --- | --- |
| `me.ts` | Navbatlar va tahlil natijalari (`?include=`) |
| `book.ts` | Bron qilish |
| `reschedule.ts` | Vaqtni ko'chirish |
| `cancel.ts` | Bekor qilish |
| `patients.ts` | Telefonga bog'langan oila a'zolari |
| `result.ts` | Bitta natija + ulashish havolasi |
| `settings.ts` | Til tanlovi |

### Shifokor

| Fayl | Nima qiladi |
| --- | --- |
| `doctor-schedule.ts` | Jadval, smenalar, slot davomiyligi |
| `doctor-off.ts` | «Bugun ishga chiqa olmayman» — kunni yopadi |
| `appointment-status.ts` | «Qabul qilindi» / «Kelmadi» |

### Admin (ega)

| Fayl | Nima qiladi |
| --- | --- |
| `admin-doctors.ts` | Shifokorlar: narx, davomiylik, yosh cheklovi, faollik |
| `admin-appointments.ts` | Butun klinika navbatlari va davr hisoboti |
| `admin-prices.ts` | Tahlil narxlari |
| `admin-references.ts` | Ko'rsatkichlar me'yoriy (referens) oraliqlari (F4) |
| `admin-ratings.ts` | Bemor baholari, yashirish |

### Cron (Netlify Scheduled Functions)

| Fayl | Jadval | Nima qiladi |
| --- | --- | --- |
| `remind-patients.ts` | `*/10 * * * *` | Qabulga ~1 soat qolganda eslatma |
| `doctor-daily.ts` | `0 2 * * *` | Toshkentda 07:00 — «bugungi navbatlaringiz» |
| `notify-results.ts` | `*/15 * * * *` | Yangi tahlil natijasi haqida xabar |
| `ask-ratings.ts` | `*/15 * * * *` | Qabuldan keyin 1–5 yulduz so'rovi |
| `sync-attendance.ts` | `*/10 * * * *` | 1C bo'yicha «keldi / kelmadi» |

Cron jadvali fayl oxiridagi `export const config: Config = { schedule: … }`
da — alohida ro'yxat yo'q.

## 6. Server modullari (`netlify/functions/lib/`)

| Modul | Mas'uliyati |
| --- | --- |
| `db.ts` | DynamoDB mijozi, `TABLES` nomlari, `queryAllPages()` (1 MB chegarasidan oshib o'qiydi) |
| `env.ts` | Muhit o'zgaruvchilari, AWS kalitlari, jadval prefiksi |
| `http.ts` | JSON javoblar, xatolar, so'rov tekshiruvi |
| `session.ts` | Imzolangan cookie, OTP kod yaratish |
| `auth.ts` | Sessiyadan foydalanuvchi, shifokor va admin huquqlari |
| `rate-limit.ts` | So'rov cheklovlari (TTL bilan) |
| `time.ts` | **Asia/Tashkent** — «bugun» va «hozir» har doim shu yerdan |
| `slots.ts` | Slot hisobi, `doctorDayKey()` |
| `schedule.ts` | Smenalar, dam olish kunlari, slot davomiyligi |
| `appointments.ts` | Navbat turi va holatlari, kun/bemor bo'yicha o'qish |
| `results.ts` | Ikkala natija jadvalini o'qiydi, me'yor va holatni hisoblaydi |
| `panels.ts` | Ko'rsatkichlardan tahlil nomini taniydi (CBC, siydik, biokimyo…) |
| `analysis-dict.ts` | 1C ruscha/texnik tahlil va analit nomlarini o'zbekchaga o'giradi (I1) |
| `references.ts` | Admin kiritgan me'yoriy oraliqlar (1C bermaganda fallback, F4) |
| `login.ts` | «Kodni olish» kirish sessiyasi: nonce, poll, `/start` parsing (A-auth) |
| `analyte-info.ts` | Ko'rsatkichlar uchun qisqa tavsif (ⓘ tugmasi) |
| `visits.ts` | 1C qabul hujjatlarini navbatlarga bog'laydi (`matchArrivals`) |
| `patients.ts` | 1C bemor profilini `users` ga birlashtiradi |
| `phone.ts` | Telefonni `+998XXXXXXXXX` ga keltiradi |
| `age.ts` | Shifokorning yosh cheklovi (server tomoni) |
| `ratings.ts` | Baho oqimi: so'rov, saqlash, izoh |
| `share.ts` | Natija uchun imzolangan ulashish tokeni (30 kun) |
| `telegram.ts` | Bot API: xabar, tugma, log-botga xato |
| `i18n.ts` | Bot matnlari uch tilda |
| `payment.ts` | Payme adapteri |

## 7. Sahifalar (`src/pages/`)

| Manzil | Fayl | Izoh |
| --- | --- | --- |
| `/`, `/ru/`, `/en/` | `[...lang]/index.astro` | Bosh sahifa, bron vidjeti |
| `/tahlillar` (+ ru/en) | `[...lang]/tahlillar.astro` | Tahlillar va narxlar |
| `/kirish` | `kirish.astro` | Telegram orqali kirish |
| `/kabinet` | `kabinet.astro` | Bemor kabineti |
| `/kabinet/navbatlar` | `kabinet/navbatlar.astro` | Bemorning navbatlari |
| `/kabinet/tahlillar` | `kabinet/tahlillar.astro` | Tahlil natijalari ro'yxati |
| `/kabinet/sozlamalar` | `kabinet/sozlamalar.astro` | Til va profil |
| `/natija` | `natija.astro` | Natija blanki, PDF, ulashish |
| `/kabinet/shifokor` | `kabinet/shifokor/index.astro` | Bugungi navbatlar |
| `/kabinet/shifokor/jadval` | `.../jadval.astro` | Smenalar |
| `/kabinet/shifokor/dam` | `.../dam.astro` | Ishga chiqmaslik |
| `/kabinet/shifokor/sozlamalar` | `.../sozlamalar.astro` | Shifokor sozlamalari |
| `/kabinet/admin` | `kabinet/admin/index.astro` | Shifokorlar |
| `/kabinet/admin/navbatlar` | `.../navbatlar.astro` | Klinika navbatlari, hisobot |
| `/kabinet/admin/narxlar` | `.../narxlar.astro` | Narxlar |
| `/kabinet/admin/referenslar` | `.../referenslar.astro` | Referens (me'yoriy) qiymatlar |
| `/kabinet/admin/baholar` | `.../baholar.astro` | Baholar |
| `/maxfiylik` | `maxfiylik.astro` | Maxfiylik siyosati |
| 404 | `404.astro` | Topilmadi sahifasi |
| `/sitemap.xml`, `/robots.txt` | `*.ts` | Yig'ilishda hosil bo'ladi |

Ommaviy sahifalar **uch tilda alohida yig'iladi** (`[...lang]`),
kabinet sahifalari esa bitta — til brauzerda almashtiriladi
(`src/lib/lang.ts`, `localStorage.dimed_lang`).

## 8. Skriptlar

| Buyruq | Fayl | Nima qiladi |
| --- | --- | --- |
| `npm run create-tables` | `create-tables.mjs` | Jadvallar + TTL + PITR (idempotent) |
| `npm run seed-doctors` | `seed-doctors.mjs` | Shifokorlarni bazaga yozadi |
| `npm run seed-prices` | `seed-prices.mjs` | Tahlil narxlari |
| `npm run link-doctor` | `link-doctor.mjs` | Shifokorni Telegram hisobiga bog'laydi |
| `npm run import-patients` | `import-patients.mjs` | CSV dan bemor profillari |
| `npm run check-patients` | `check-patients.mjs` | 1C shu raqamga nima yozganini ko'rsatadi |
| `npm run build-analyses` | `build-analyses.mjs` | `legacy/` dan `analyses.json` |
| `npm run gen-cloudshell` | `gen-cloudshell-setup.mjs` | `cloudshell-setup.sh` ni qayta yasaydi |
| `npm run migrate-slot-minutes` | `migrate-slot-minutes.mjs` | Bir martalik migratsiya |

`scripts/aws-env.mjs` — barcha skriptlar uchun AWS sozlamasi
(`env.ts` bilan bir xil qoida). `scripts/tables.mjs` — jadval
ta'riflarining **yagona manbasi**.

## 9. Testlar

`npm test` → **270 ta tekshiruv** (137 modul + 133 API).

| Fayl | Nimani tekshiradi |
| --- | --- |
| `test-api.mjs` | Barcha endpointlar, haqiqiy HTTP so'rovlari bilan |
| `test-lib.mjs` | Sessiya, cookie, muhit o'zgaruvchilari |
| `test-slots.mjs` | Slot hisobi |
| `test-appointments.mjs` | Navbat holatlari, bandlik |
| `test-schedule.mjs` | Smenalar va dam olish |
| `test-panels.mjs` | Tahlil nomini tanish (bazadagi haqiqiy ma'lumot bo'yicha) |
| `test-tables.mjs` | Jadval ta'riflari + `cloudshell-setup.sh` mosligi |
| `test-phone.mjs` | Telefon normallashtirish |
| `test-e2e.mjs` | Brauzer (Playwright): bron vidjeti, yopiq sahifalar |

`scripts/fake-dynamo.mjs` — **xotiradagi soxta DynamoDB**. Testlar
haqiqiy AWS'siz ishlaydi: CI da hech qanday kalit kerak emas. Yangi
jadval qo'shsangiz uni `keySchema` ga ham qo'shing.

CI: `.github/workflows/ci.yml` — har PR va master'ga push'da tiplar,
testlar, build va brauzer testlari.

## 10. Bilib qo'yish kerak bo'lgan joylar

**Vaqt.** Netlify UTC'da ishlaydi, klinika esa UTC+5. «Bugun» va
«hozir soat nechchi» **har doim** `lib/time.ts` orqali. To'g'ridan-to'g'ri
`new Date().getDate()` yozsangiz kechqurun 19:00 dan keyin sana
adashadi.

**DynamoDB 1 MB.** Har `Query` javobi 1 MB da kesiladi. Sahifalashni
unutmang — `queryAllPages()` bor. Soxta DynamoDB ham javobni kesadi,
shuning uchun unutilgan sahifalash **testda** ushlanadi.

**Netlify band qilgan nomlar.** `AWS_ACCESS_KEY_ID` va
`AWS_SECRET_ACCESS_KEY` ni muhit o'zgaruvchisi sifatida qo'shib
bo'lmaydi — shuning uchun `DIMED_` prefiksi ishlatiladi
(`lib/env.ts` da sabab yozilgan).

**CSP.** `netlify.toml` da `script-src 'self'` — tashqi skript
yuklanmaydi. Kutubxona kerak bo'lsa npm orqali qo'shing va dinamik
`import()` bilan chaqiring (PDF uchun `pdfmake` shunday qilingan —
`src/lib/result-pdf.ts`, natija A4 vektor blank), cdnjs'dan emas.

**Til.** Kod izohlari va hujjatlar — **o'zbekcha**. Yangi matn
qo'shsangiz uch tilda: `src/data/i18n.ts` (sayt),
`netlify/functions/lib/i18n.ts` (bot), `src/data/home.ts` (ommaviy
sahifalar).

**1C jadvallariga yozmang.** `individuals`, `analysis_results`,
`visits` — faqat 1C yozadi. Sayt faqat o'qiydi.

**`legacy/` o'chirilmaydi.** `build-analyses.mjs` undan
`_analysis/*.md` va `_data/price.csv` ni o'qib `src/data/analyses.json`
ni hosil qiladi.

## 11. Lokal ishga tushirish

```bash
npm install
npm run dev          # http://localhost:4321

npm test             # 270 ta tekshiruv (AWS kerak emas)
npm run typecheck    # astro check + tsc
npm run build        # dist/
```

Haqiqiy bazaga ulanadigan skriptlar uchun (PowerShell):

```powershell
$env:DIMED_AWS_REGION="us-east-1"
$env:DIMED_AWS_ACCESS_KEY_ID="..."
$env:DIMED_AWS_SECRET_ACCESS_KEY="..."
```
