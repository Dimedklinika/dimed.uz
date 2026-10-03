# Dimed.uz — ishga tushirish qo'llanmasi

Bu hujjat klinika egasi uchun: **kod tomondan nima qilindi**, **sizdan nima
kerak**, **har bir qadamdan keyin nima ishlay boshlaydi**.

Dasturchi uchun texnik hujjat alohida: `docs/HANDOFF.md`.

---

## 1. Bir qatorda: hozirgi holat

**Kod tayyor va tekshirilgan. Sayt hali internetda yo'q, chunki kalitlar
kiritilmagan.** Kalitlar kiritilgach — bir kun ichida ishga tushadi.

| | Holat |
| --- | --- |
| Sayt kodi (3 haftalik reja) | ✅ tugagan, `master` da |
| Avtomatik tekshiruv (CI) | ✅ har o'zgarishda ishlaydi |
| Testlar | ✅ 215 ta (113 mantiq + 102 API) o'tadi |
| Internetda ishlashi | ❌ kalitlar yo'q |
| Onlayn to'lov (Payme) | 🟡 kod tayyor — kassa kalitlari kutilmoqda |

---

## 2. Nima qilindi

### Bemor uchun

| Imkoniyat | Tafsilot |
| --- | --- |
| Onlayn navbat | Bo'lim → shifokor → sana → vaqt → tasdiq |
| Telegram orqali kirish | SMS yo'q, parol yo'q. Botga `/start`, kontakt ulashadi, 6 xonali kod oladi (5 daqiqa amal qiladi, bir martalik) |
| Shaxsiy kabinet | Navbatlari, tahlil natijalari, holati |
| Ko'chirish va bekor qilish | Bemor kabinetdan navbatni boshqa vaqtga o'tkazadi yoki bekor qiladi (qabulga 1 soatdan ko'p qolganda) |
| Eslatma | Qabuldan ~1 soat oldin botga xabar |
| Tahlil natijalari | 1C dan avtomatik keladi; yangi natija tushganda botda havola; natija sahifasi, PDF va ulashish — brauzerda |
| Baho | Qabuldan keyin botda 1–5 yulduz va izoh; o'rtacha baho shifokor kartasida |

### Shifokor uchun

| Imkoniyat | Tafsilot |
| --- | --- |
| Shaxsiy kabinet | Bugungi va keyingi navbatlari |
| Jadvalni boshqarish | Smenalar (masalan 08:30–12:30 va 13:30–16:00), tanaffuslar, dam olish kunlari, slot davomiyligi (10/15/20/30/60 daq, standart 60) |
| «Qabul qilindi / Kelmadi» | Qabuldan keyin bir tugma; «qabul qilindi» bo'lsa bemorga botda 1–5 yulduzli baho so'rovi boradi |
| Kunlik xulosa | Har kuni ertalab 07:00 da botga «bugungi navbatlaringiz» |
| «Ishga chiqa olmayman» | Bitta tugma: kun yopiladi, o'sha kundagi barcha bemorlarga uzr xabari boradi, slotlar bo'shaydi |

### Klinika uchun

- Xato loglari alohida Telegram guruhga tushadi — nosozlikni darhol bilasiz
- Bir slotga ikkita bemor yozila olmaydi (baza darajasida kafolatlangan)
- Qabulga kamida 1 soat qolgan bo'lishi shart — ham bron, ham ko'chirish uchun
- Barcha vaqt hisoblari Toshkent vaqtida (server dunyo vaqtida ishlasa ham)

### Texnik tomondan

- Eski Jekyll sayt → yangi Astro sayt (tezroq, kontent `legacy/` da saqlangan)
- 25 ta server funksiyasi (4 tasi jadval bo'yicha ishlaydigan cron), 11 ta baza jadvali
- Rasmlar 4 barobar siqilgan (423KB → 103KB), shriftlar o'z serverimizda
- SEO: `robots.txt`, `sitemap.xml`

---

## 3. Sizdan kerak — qadamma-qadam

> Kalitlarni menga yubormang. Ularni to'g'ridan-to'g'ri Netlify va AWS
> panelining o'ziga kiriting — shunda ular hech qayerda ortiqcha
> ko'chirilmaydi. Menga «qo'ydim» deb ayting, men tekshiraman.

### Qadam 1 — Telegram botlari · ~10 daqiqa · **siz**

1. Telegram'da **@BotFather** ni oching
2. `/newbot` → nom va username bering → **asosiy bot tokeni** chiqadi, saqlang
   - Bu bot bemorlar bilan ishlaydi: kirish kodi, eslatmalar, bekor qilish xabarlari
3. Yana `/newbot` → **log-bot** yarating → tokenini saqlang
   - Bu faqat sizga xatolar haqida yozadi, bemorlar ko'rmaydi
4. Telegram'da guruh yarating (masalan «Dimed — xatolar»), log-botni a'zo qiling
5. Guruhga biror xabar yozing, so'ng brauzerda oching:
   `https://api.telegram.org/bot<LOG_TOKEN>/getUpdates`
   Javobdagi `"chat":{"id":-100...}` — o'sha manfiy raqam kerak

**Natijada 3 ta qiymat:** asosiy bot tokeni, log-bot tokeni, guruh id.

### Qadam 2 — AWS · ~30 daqiqa · **siz** (bank kartasi kerak)

Bu yerda baza (navbatlar, bemorlar, tahlil natijalari) saqlanadi.
S3 kerak emas — tahlil PDF'ini sayt brauzerning o'zida yasab beradi.

1. https://aws.amazon.com da akkaunt oching
2. **Region tanlang va shuni hamma joyda ishlating** — klinikada `us-east-1`
   (jadvallar shu yerda, 1C kengaytmasi ham shu regionga yozadi)
   (Frankfurt). Keyin o'zgartirish qiyin
3. IAM → foydalanuvchi yarating → quyidagi policy'ni biriktiring
4. Shu foydalanuvchi uchun **Access Key** va **Secret Key** yarating

**Natijada 2 ta qiymat:** Access Key, Secret Key.

#### IAM policy

IAM → Policies → Create policy → JSON. `REGION` va `AKKAUNT_ID` ni
o'zingiznikiga almashtiring:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Baza",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:REGION:AKKAUNT_ID:table/dimed_*",
        "arn:aws:dynamodb:REGION:AKKAUNT_ID:table/dimed_*/index/*"
      ]
    }
  ]
}
```

Bu policy'da **jadval yaratish huquqi yo'q** — ataylab. Jadvallar
CloudShell'dan bir marta yaratiladi (4-qadam), sayt esa faqat
ma'lumot bilan ishlaydi. Kalit o'g'irlansa ham jadvallarni o'chira
olmaydi.

`table/dimed_*` — `DIMED_TABLE_PREFIX` ga mos. Prefiksni
o'zgartirsangiz bu yerni ham o'zgartiring.

### Qadam 3 — Netlify · ~15 daqiqa · **siz**

1. https://netlify.com da akkaunt oching (GitHub orqali kirsangiz qulay)
2. **Add new site → Import an existing project** → `santyx-afk/dimed.uz` ni tanlang
   - Build sozlamalari `netlify.toml` da yozilgan, qo'lda hech narsa kiritmaysiz
3. **Site settings → Environment variables** → 5-bo'limdagi jadval bo'yicha
   qiymatlarni kiriting
4. **Deploy** tugmasi

**Natijada:** sayt vaqtinchalik manzilda ochiladi (`...netlify.app`).

### Qadam 4 — Bazani yaratish · ~10 daqiqa · **siz** (AWS CloudShell)

**Jadvallarni qo'lda yaratmang.** 11 ta jadval, 5 ta indeks va 1 ta TTL
sozlamasi kerak. Qo'lda kiritishda bitta harf xato bo'lsa sayt xato
bermaydi — shunchaki jim ishlamay qo'yadi. Skript hammasini to'g'ri
yaratadi va mavjudini o'tkazib yuboradi (qayta ishga tushirish xavfsiz).

**CloudShell** — AWS konsolining ichidagi terminal. U sizning nomingizdan
ishlaydi, shuning uchun kalit kiritish shart emas va kompyuteringizga
hech narsa o'rnatilmaydi.

#### Yo'l A — bitta fayl (tavsiya etiladi)

Hech narsa o'rnatilmaydi: CloudShell'da AWS CLI ham, kalitlar ham
allaqachon bor. Git, Node.js, npm — kerak emas.

1. `scripts/cloudshell-setup.sh` faylini kompyuteringizga oling
2. AWS konsolida **yuqori o'ngdan region'ni tanlang** (Netlify'dagi
   `DIMED_AWS_REGION` bilan bir xil bo'lsin)
3. Yuqori paneldagi **terminal belgisi** (CloudShell) ni bosing
4. **Actions → Upload file** → shu faylni tanlang
5. Yozing:

```bash
bash cloudshell-setup.sh
```

Skript uchta ishni ketma-ket bajaradi: 11 ta jadvalni yaratadi, ular
tayyor bo'lishini kutadi, keyin 9 ta shifokorni yozadi. Boshida qaysi
region va qaysi AWS hisobi ishlatilayotgani chiqadi — shuni bir
tekshiring.

#### Yo'l B — repo orqali

```bash
git clone https://github.com/santyx-afk/dimed.uz.git
cd dimed.uz
npm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# 11 ta jadval va indekslar
DIMED_AWS_REGION=us-east-1 node scripts/create-tables.mjs

# shifokorlarni bazaga yozish
DIMED_AWS_REGION=us-east-1 node --experimental-strip-types scripts/seed-doctors.mjs

# tahlil narxlarini bazaga yozish (bir marta; keyin admin panel → Narxlar)
DIMED_AWS_REGION=us-east-1 node scripts/seed-prices.mjs
```

Ikkala yo'l ham bir xil natija beradi — `cloudshell-setup.sh` aynan
shu ikki skriptdan yaratiladi.

`+ dimed_users yaratildi` kabi qatorlar chiqadi. Natijani menga yuboring —
tekshiraman.

> Region'ni Netlify'dagi `DIMED_AWS_REGION` bilan bir xil qiling.
> Butun loyihada faqat bitta region ishlatiladi. Boshqasi kerak bo'lsa:
> `DIMED_AWS_REGION=us-east-1 bash cloudshell-setup.sh`

#### Jadvallar tarkibi

Skript nima yaratishini bilib qo'yish uchun (yoki qo'lda yaratish
kerak bo'lib qolsa). Prefiks `dimed_`, hammasi **PAY_PER_REQUEST**,
barcha maydon turi **String**, barcha indeks proyeksiyasi **ALL**:

| Jadval | Partition key | Sort key | Indeks (GSI) | TTL |
| --- | --- | --- | --- | --- |
| `dimed_users` | `telegram_id` | — | `phone-index`: `phone`<br>`code-index`: `code` (1C bemor kodi) | — |
| `dimed_otp_codes` | `phone` | — | — | `expires_at` |
| `dimed_individuals` | `phone` | `sort_key` | — | — |
| `dimed_analysis_results` | `phone` | `sort_key` | — | — |
| `dimed_doctors` | `doctor_id` | — | `telegram-index`: `telegram_id` | — |
| `dimed_schedules` | `doctor_id` | `date` | — | — |
| `dimed_appointments` | `doctor_day` | `time` | `patient-index`: `phone` + `starts_at`<br>`date-index`: `date` + `starts_at` | — |
| `dimed_payments` | `payment_id` | — | — | — |
| `dimed_lab_results` | `phone` | `sort_key` | — | — |
| `dimed_prices` | `item_id` | — | — | — |
| `dimed_ratings` | `doctor_id` | `created_at` | — | — |

`date-index` siz eslatmalar va shifokorning kunlik xulosasi ishlamaydi.
`dimed_otp_codes` dagi TTL — eskirgan kirish kodlarini bazaning o'zi
o'chirib turadi.

### Qadam 5 — Telegram webhook'ini ulash · ~2 daqiqa · **siz**

Bu **deploy'dan keyin** qilinadi, chunki Telegram'ga saytning haqiqiy
manzili aytiladi. Buyruqda bot tokeni bor, shuning uchun uni o'zingiz
yuritasiz (CloudShell yoki istalgan terminal):

```bash
curl -X POST "https://api.telegram.org/bot<ASOSIY_TOKEN>/setWebhook" \
  -d "url=https://<sayt-manzili>/api/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

`{"ok":true,...}` kelsa — ulandi. Tekshirish uchun:

```bash
curl "https://api.telegram.org/bot<ASOSIY_TOKEN>/getWebhookInfo"
```

Javobdagi `url` to'g'ri bo'lsin, `last_error_message` bo'sh bo'lsin.

**Shu qadamdan keyin bot javob bera boshlaydi.** Usiz botga yozsangiz
javob bo'lmaydi. Domen ulangach (8-qadam) bu buyruq yangi manzil bilan
qayta yuritiladi.

### Qadam 6 — Shifokorlarni Telegram'ga bog'lash · ~10 daqiqa · **siz**

**Bu qadamsiz birorta shifokor o'z kabinetiga kira olmaydi.**

Bemor Telegram raqami orqali tanaladi, shifokor esa — `doctors`
jadvalidagi `telegram_id` orqali. Uni `seed-doctors` yozmaydi (aks
holda har safar seed qilganda bog'lanish o'chib ketardi), shuning
uchun bir marta qo'lda bog'lanadi.

**Har bir shifokor** avval botga `/start` yuborib, kontaktini
ulashsin. Shundan keyin CloudShell'da (4-qadamdagi papkada):

```bash
# kim bog'langan, kim yo'q — ko'rish
node scripts/link-doctor.mjs

# telefon raqami bo'yicha bog'lash
node scripts/link-doctor.mjs ashurov --phone +998901234567
```

Chiqishi:

```
+998901234567 → telegram_id 777

Tayyor: ashurov (Ashurov Tursunali) → telegram_id 777
Shifokor endi /kabinet/shifokor sahifasiga kira oladi.
```

Shifokor identifikatorlari (`ashurov`, `narimbetov`, ...) —
argumentsiz `node scripts/link-doctor.mjs` ro'yxatida ko'rinadi.

Skript o'zi tekshiradi: bitta Telegram akkaunt ikkita shifokorga
biriktirilmaydi, bog'lanmagan shifokorlar sonini oxirida ko'rsatadi.
Hammasi bog'langunicha qaytarib ishga tushiraverish mumkin.

### Qadam 7 — Uchdan-uchgacha sinov · ~30 daqiqa · **birgalikda**

Men tekshiraman, siz o'z telefoningizdan takrorlaysiz:

1. Botga `/start` → kontakt ulashish → kod keladimi
2. Saytga kod bilan kirish
3. Navbat olish → kabinetda ko'rinadimi
4. Vaqtni ko'chirish
5. Shifokor kabinetiga kirish (shifokor telegram id bo'yicha)
6. «Ishga chiqa olmayman» → bemorga xabar bordimi
7. Eslatma: qabulga 1 soat qolganda xabar keladimi
8. Xato loglari guruhga tushyaptimi

### Qadam 8 — Domen · ~1 kun (DNS tarqalishi) · **siz + men**

Beta muvaffaqiyatli bo'lgach: `dimed.uz` DNS yozuvlarini Netlify'ga
yo'naltirasiz, men saytda domenni tasdiqlayman. HTTPS sertifikati
avtomatik chiqadi.

---

## 4. Boshqalarga bog'liq — bugundan boshlang

Bular javob kutadi, shuning uchun yuqoridagi qadamlarga parallel yuritiladi.

| Kim | Nima berasiz | Nima olasiz | Nega bugun |
| --- | --- | --- | --- |
| **Payme** | Kassa arizasi (merchant.payme.uz, yuridik shaxs hujjatlari bilan) | Kassa ID + kalitlar | Kod tayyor — faqat kalitlar yetishmayapti |
| **1C dasturchisi** | `docs/1c-integration.md` + `LC_API_KEY` | Ular yozadigan yuborish moduli | Tahlil natijalari shunga bog'liq |
| **Shifokorlar** | Narx va jadval so'rovnomasi | Har biri uchun: qabul narxi, ish kunlari, smena vaqtlari, slot davomiyligi | Hozirgi qiymatlar taxminiy |

**Payme haqida aniqlik:** integratsiya kodi **yozib bo'lingan va
testlangan** (`docs/payme-integration.md`). Kassa ochilgach kalitlar
Netlify'ga qo'yiladi, `PAYMENT_ENABLED=1` qilinadi va **bron mantig'i
umuman o'zgarmaydi**. Kassa ochilmaguncha sayt «klinikada to'lash»
rejimida to'liq ishlaydi. Yoqilgach saytdagi to'lov matnlari («kassaga
to'laysiz» → «Payme orqali to'laysiz») o'zi almashadi — qo'lda hech narsa
o'zgartirilmaydi; o'zgaruvchidan keyin Netlify'da qayta deploy qiling.

---

## 5. Muhit o'zgaruvchilari — to'liq jadval

Netlify → Site settings → Environment variables.

| O'zgaruvchi | Qiymat qayerdan | Kim |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | @BotFather, asosiy bot | siz |
| `TELEGRAM_WEBHOOK_SECRET` | Tasodifiy satr | men yarataman |
| `TELEGRAM_LOG_BOT_TOKEN` | @BotFather, log-bot | siz |
| `TELEGRAM_LOG_CHAT_ID` | Guruh id (manfiy raqam) | siz |
| `SESSION_SECRET` | Tasodifiy satr, ≥32 belgi | men yarataman |
| `DIMED_AWS_REGION` | `us-east-1` | tayyor |
| `DIMED_TABLE_PREFIX` | `dimed` | tayyor |
| `DIMED_AWS_ACCESS_KEY_ID` | AWS IAM | siz |
| `DIMED_AWS_SECRET_ACCESS_KEY` | AWS IAM | siz |
| `LC_API_KEY` | Tasodifiy satr → 1C ga beriladi | men yarataman |
| `ADMIN_TELEGRAM_IDS` | Sizning Telegram ID(lar)ingiz | siz |
| `PAYME_MERCHANT_ID` | Payme kassa ID | kassa ochilgach |
| `PAYME_KEY` | Payme ishchi kalit | kassa ochilgach |
| `PAYME_TEST_KEY` | Payme sinov kaliti | kassa ochilgach |
| `PAYMENT_ENABLED` | Hozircha bo'sh (kassada to'lash); kassadan keyin `1` | keyin |
| `SITE_URL` | `https://dimed.uz` — bot xabarlaridagi havolalar uchun | tayyor |

«Men yarataman» deganlari — tasodifiy parollar, ularni hech kimdan
so'ramaysiz. Kerak bo'lsa o'zingiz ham yaratasiz: `openssl rand -base64 32`.

> **AWS kalitlari nega `DIMED_` bilan boshlanadi?**
> Netlify `AWS_ACCESS_KEY_ID` va `AWS_SECRET_ACCESS_KEY` nomlarini o'zi
> band qilgan — ularni kiritmoqchi bo'lsangiz *«reserved environment
> variable»* xatosi chiqadi. Shuning uchun kod `DIMED_AWS_ACCESS_KEY_ID`
> va `DIMED_AWS_SECRET_ACCESS_KEY` ni ham o'qiydi. Netlify'da **faqat
> prefiksli nomlarni** ishlating.
>
> Lokal ishlashda yoki CloudShell'da standart nomlar ham ishlayveradi —
> kod ikkalasini ham tan oladi.

---

## 5a. Admin panel — shifokorlarni boshqarish

Manzil: **`/kabinet/admin`**. Bu yerdan terminalsiz:

- yangi shifokor **qo'shish**
- narx, jadval, lavozim, ish kunlari va h.k. **tahrirlash**
- shifokorni **o'chirish** (faolsizlantirish — saytdan yo'qoladi, tarixi
  saqlanadi, kerak bo'lsa qayta faollashtiriladi)
- shifokorni **Telegram'ga bog'lash** (kabinetiga kirishi uchun)
- **Narxlar** (`/kabinet/admin/narxlar`): shifokor qabuli va barcha
  tahlil turlari narxi, tayyor bo'lish muddati, «Saytda» belgisi —
  o'zgarish saytda darhol ko'rinadi
- **Baholar** (`/kabinet/admin/baholar`): bemorlar qo'ygan baholar va
  izohlar, nomaqbulini yashirish (o'rtachaga kirmaydi)

Kirish — xuddi shifokorlarnikidek, **Telegram orqali** (parol yo'q).
Faqat `ADMIN_TELEGRAM_IDS` ro'yxatidagi hisob kira oladi.

**Qanday sozlanadi:**

1. Botga `/start` yuborib, kabinetga kiring (`/kirish`).
2. `/kabinet/admin` sahifasini oching. Ruxsat bo'lmasa, sahifa
   **sizning Telegram ID**ingizni ko'rsatadi.
3. O'sha ID ni Netlify → `ADMIN_TELEGRAM_IDS` ga qo'ying (bir nechta
   bo'lsa, vergul bilan: `39707325,12345678`).
4. **Deploy** qiling — endi sahifa ochiladi.

Admin panelda qilingan o'zgarish bron oynasida **darhol** ko'rinadi
(vidjet shifokorlarni jonli `/api/doctors` dan oladi). Bosh sahifadagi
jamoa kartalari esa keyingi deploy'da yangilanadi.

---

## 6. Nima qilgandan keyin nima ishlaydi

Bu eng muhim jadval — har bir kalit nimani ochishini ko'rsatadi.

| Nima kiritilsa | Nima ishlay boshlaydi | Nima hali ishlamaydi |
| --- | --- | --- |
| **Hech narsa** (hozir) | Hech narsa — sayt internetda yo'q | Hammasi |
| **Netlify** (kalitsiz) | Sayt ochiladi, sahifalar ko'rinadi, narxlar va shifokorlar ro'yxati | Navbat, kirish — baza yo'q |
| **+ AWS** | Baza ishlaydi, slotlar ko'rinadi, navbat yoziladi | Kirish — kod yuboradigan bot yo'q |
| **+ Telegram (asosiy bot va webhook)** | Bemor tomoni to'liq: kirish, navbat, kabinet, ko'chirish, eslatmalar | Shifokorlar kabinetiga kira olmaydi |
| **+ shifokorlar bog'landi** (6-qadam) | **Sayt to'liq ishlaydi** — shifokor kabineti, jadval boshqaruvi, kunlik xulosa, «ishga chiqa olmayman» | Xatolarni bilmaysiz; to'lov qabulxonada; tahlil natijalari yo'q |
| **+ log-bot** | Har qanday nosozlik guruhga tushadi | — |
| **+ 1C moduli** | Tahlil natijalari kabinetga avtomatik keladi | — |
| **+ Payme kassa kalitlari** | Onlayn to'lov | — |
| **+ domen** | `dimed.uz` da ochiladi | — |

**Diqqat:** «Sayt to'liq ishlaydi» qatoriga yetish uchun **Netlify + AWS
+ Telegram asosiy bot + shifokorlarni bog'lash** kerak. Qolganlari
(log-bot, 1C, Payme, domen) — yaxshilanish, ular kutsa ham sayt ishlaydi.

**Eng ko'p unutiladigan joy — shifokorlarni bog'lash (6-qadam).** Usiz
bemor tomoni benuqson ishlaydi, lekin shifokor kabinetiga kirmoqchi
bo'lganda «ruxsat yo'q» oladi va sabab ko'rinmaydi.

---

## 7. Beta-test rejasi

Butun klinikani birdan ochish shart emas.

**Taklif: Pediatriya bo'limi, 1 hafta.**

- Faqat 2 pediatr saytda ko'rinadi, qolgan bo'limlar vaqtincha yopiq
- Qabulxona parallel ravishda eski usulda ham yozib boradi (xavfsizlik uchun)
- Har kuni tekshiriladi: navbatlar to'g'ri tushdimi, eslatmalar bordimi,
  log guruhda xato bormi

**Nimani kuzatamiz:** bemorlar Telegram orqali kirishni tushundimi,
shifokor jadvalini o'zi boshqara oldimi, ikki tizim (sayt va qog'oz)
mos keldimi.

**Bir hafta muammosiz o'tsa** — qolgan 5 bo'lim ochiladi va qabulxona
parallel yozishni to'xtatadi.

---

## 8. Ma'lum cheklovlar — oldindan biling

1. **To'lov hozircha qabulxonada.** Slot band qilinadi, pul klinikada
   to'lanadi. Payme kassasi ochilgach onlayn to'lov yoqiladi
2. **Bekor qilish bor.** Bemor navbatni kabinetdan bekor qila oladi yoki
   boshqa vaqtga ko'chira oladi — ikkalasi ham qabulga 1 soatdan ko'p
   qolganda. Shifokorni almashtirish — bu yangi navbat
3. **1 soat qoidasi.** Qabulga 1 soatdan kam qolgan bo'lsa bron ham,
   ko'chirish ham mumkin emas
4. **Kirish faqat Telegram orqali.** Telegram'i yo'q bemor saytdan
   yozila olmaydi — u qabulxonaga qo'ng'iroq qiladi
5. **Agar AWS jadvallari ilgari yaratilgan bo'lsa**, `date-index`
   indeksini qo'lda qo'shish kerak — usiz eslatmalar ishlamaydi.
   Noldan yaratilsa bu muammo yo'q

---

## 9. Xulosa: kim nima qiladi

**Siz — bugun:**
- [ ] Payme'da kassa ochishga ariza (merchant.payme.uz)
- [ ] 1C dasturchisiga `docs/1c-integration.md` ni yuboring
- [ ] Shifokorlardan narx va jadval so'rang

**Siz — shu hafta (tartib bilan):**
- [ ] 1. Telegram: 2 ta bot + log guruh (10 daq)
- [ ] 2. AWS: akkaunt, IAM policy va kalitlar (30 daq)
- [ ] 3. Netlify: repo ulash, kalitlarni kiritish, deploy (15 daq)
- [ ] 4. CloudShell: jadvallar + shifokorlar (10 daq)
- [ ] 5. Telegram webhook'ini ulash (2 daq)
- [ ] 6. Shifokorlarni Telegram'ga bog'lash (10 daq)

**Men — siz tugatgandan keyin, bir kun ichida:**
- [ ] Har bir qadam natijasini tekshirish
- [ ] Uchdan-uchgacha sinov va hisobot
- [ ] Pediatriya bo'limini beta rejimga tayyorlash

**Kassa ochilgach:**
- [ ] Payme kalitlarini Netlify'ga qo'yish va sandbox sinovi
      (`docs/payme-integration.md` — kod tayyor)

---

## Hujjatlar ro'yxati

| Fayl | Kim uchun |
| --- | --- |
| `docs/QOLGAN-ISHLAR.md` | Klinika egasi — hozir nima qilish kerak (joriy ro'yxat) |
| `docs/ISHGA-TUSHIRISH.md` | Klinika egasi — shu hujjat |
| `docs/HANDOFF.md` | Sayt dasturchisi — texnik qarorlar, kod tuzilishi |
| `docs/1c-integration.md` | 1C dasturchisi — bemor profili va tahlil natijalari |
| `docs/1c-sync.md` | 1C dasturchisi — navbatlarni 1C bilan sinxronlash |
| `docs/payme-integration.md` | Payme kassasini ulaydigan odam |
| `scripts/cloudshell-setup.sh` | Siz — AWS CloudShell'ga yuklanadigan fayl |

---

*Savol tug'ilsa yoki biror qadamda to'xtab qolsangiz — qaysi qadam
ekanini ayting, o'sha joyidan davom ettiramiz.*
