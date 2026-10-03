# Qolgan ishlar — kim nima qiladi

> **Bu hujjat kimga:** klinika egasiga.
> **Sana:** 2026-09-06. Har o'zgarishdan keyin yangilanadi.
>
> **Batafsil qadamlar — `OCHILISH-REJASI.md` da.** Bu yerda umumiy
> ro'yxat, u yerda esa har qadam qanday bajarilishi va nima bilan
> tekshirilishi.
>
> Boshqa hujjatlar: `LOYIHA-XARITASI.md` — kod qayerda nima qiladi;
> `ISHGA-TUSHIRISH.md` — noldan ishga tushirish (Netlify, AWS,
> Telegram); `HANDOFF.md` — dasturchi uchun texnik qarorlar;
> `1c-sync.md` — 1C dasturchisi uchun.

---

> **Yangilanish 2026-10-02.** Quyidagi «eski nusxa» ogohlantirishi eskirgan: `dimed.uz` hozir
> yangi kod bilan ishlayapti (`/api/doctors` javob beradi). Joriy holat, o'zgarishlar va
> joylash tartibi — `YANGILANISH-2026-10-02.md`; 1C yamoqlari — `1c-tuzatishlar.md`.

## ⚠️ Avval shuni o'qing (2026-09-07 holati — tarixiy)

`dimed.uz` da **eski nusxa** turibdi: sitemap'da atigi 2 ta manzil,
`/natija` va `/ru/` — 404, API javob bermayapti. Ya'ni bron, kirish,
kabinet va tahlil natijasi bemorlar uchun ishlamayapti.

Sabab va tuzatish tartibi — **`OCHILISH-REJASI.md`, 1-qadam**. Bu
tuzalmaguncha quyidagi ro'yxatning ma'nosi yo'q.

## Hozirgi holat

Kod tomoni **tayyor**. Bemor navbat oladi, kabinetiga kiradi, tahlil
natijasini ko'radi; shifokor jadvalini boshqaradi; ega butun klinikani
admin panelda ko'radi. Sayt o'zbek, rus va ingliz tillarida.

Raqamlar (2026-10-02): 24 sahifa, 31 ta Netlify funksiyasi (5 tasi cron),
**175 ta API + 22 ta brauzer tekshiruvi** — hammasi yashil, har deploy'dan
oldin CI ishga tushiradi.

Qolgani — **sizning tomoningizda**: kalitlar, sozlamalar va bir necha
qaror. Ular kodga tegishli emas, lekin ularsiz sayt to'liq ishlamaydi.

---

## 1-qism. Ochilishdan oldin — shart

Tartib bilan bajaring. Har birida «qanday tekshirasiz» bor.

### 1.1. AWS jadvallari — ✅ bajarildi (2026-09-07)

Bu qadam **tugatildi**, hech narsa qilish kerak emas. Nima qilingani:

- yetishmayotgan jadvallar yaratildi: `dimed_prices`, `dimed_rate_limits`,
  `dimed_ratings` va yangi `dimed_visits` (bemor kelgani — 1.6 ga qarang);
- **zaxira nusxa (PITR)** bemor ma'lumoti bor barcha jadvalda yoqildi —
  35 kun ichidagi istalgan soniyaga qaytarish mumkin;
- `rate_limits` yaratilgani uchun so'rov cheklovlari endi haqiqatan
  ishlaydi (ilgari jimgina o'chiq turardi);
- tahlil narxlari bazaga yozildi (43 ta) — endi ularni admin paneldan
  o'zgartirsangiz sayt darhol yangilanadi.

**Qanday tekshirasiz:** `/kabinet/admin/narxlar` da 43 ta tahlil
ko'rinadi va narxni o'zgartirsangiz `/tahlillar` sahifasida yangisi
chiqadi.

> **Diqqat — kalitlarni almashtiring.** AWS kaliti menga xabar orqali
> yuborilgan edi. Ish tugadi; **AWS konsolida o'sha kalitni o'chirib,
> yangisini yarating** va yangi kalitni faqat ikki joyga qo'ying:
> Netlify sozlamalari (`DIMED_AWS_ACCESS_KEY_ID`,
> `DIMED_AWS_SECRET_ACCESS_KEY`) va 1C konstantalari
> (`DynamoAccessKeyID`, `DynamoSecretKey`).

> **Region:** hamma jadval `us-east-1` da. Kodda ham endi standart shu —
> ilgari `eu-central-1` edi va `DIMED_AWS_REGION` unutilsa jadvallar
> "topilmay" qolardi.

### 1.2. Shifokorlarga yosh cheklovini qo'yish (5 daqiqa)

Hozir hamma shifokorda «cheklovsiz» turibdi. Pediatrga kattalar,
kattalar shifokoriga bolalar yozilib qolmasin.

1. Saytda **Kabinet → Shifokorlar** ni oching
2. Har bir shifokorda **Yosh** ustunini tanlang:
   - *Hamma yosh* — cheklovsiz
   - *16 dan katta* — kattalar shifokori
   - *16 gacha* — pediatr

**Qanday tekshirasiz:** bosh sahifada shifokor kartasida yosh belgisi
paydo bo'ladi (masalan «16+»). Bron vidjetida mos kelmagan bemorni
tanlab bo'lmaydi.

### 1.3. Narxlarni tekshirish (5 daqiqa)

Tahlil narxlari bazaga kiritildi (43 ta) — endi ularni admin paneldan
o'zgartira olasiz va sayt darhol yangilanadi.

**Kabinet → Narxlar** ni ochib, narxlar to'g'riligini tekshiring.
Shifokor qabuli narxi esa **Kabinet → Shifokorlar** da.

**Qanday tekshirasiz:** `/tahlillar` sahifasidagi narx admin paneldagi
bilan bir xil.

### 1.4. Telegram va admin (5 daqiqa)

- **Shifokorlar bog'langanmi.** Har bir shifokor o'z kabinetiga kira
  olishi kerak. Bog'lanmagan bo'lsa: `npm run link-doctor`
- **`ADMIN_TELEGRAM_IDS`** Netlify'da to'g'rimi. Bilmasangiz: admin
  sahifasini oching — kirish rad etilsa, ekranda o'z Telegram ID'ingiz
  yoziladi, uni Netlify sozlamalariga qo'shasiz.

**Qanday tekshirasiz:** shifokor telefonidan `/kabinet/shifokor` ochiladi;
sizda `/kabinet/admin/navbatlar` ochiladi.

### 1.5. Domen va Google (15 daqiqa)

- `dimed.uz` Netlify'ga ulanganini tekshiring (Netlify → Domain management)
- **Google Search Console** (search.google.com/search-console):
  1. `dimed.uz` ni qo'shing
  2. **Sitemaps** bo'limiga `sitemap.xml` ni yuboring
  3. `https://dimed.uz/` ni **URL Inspection** dan «Request indexing»

Sayt uch tilda alohida manzilda: `/`, `/ru/`, `/en/`. Google buni
`hreflang` orqali biladi — sitemap'da hammasi ko'rsatilgan.

**Qanday tekshirasiz:** Search Console'da sitemap «Success» va 6 ta
manzil topilgan bo'ladi.

### 1.6. 1C (MedHisob) konfiguratsiyasini yangilash — 1C dasturchisi bilan

Bu qadamsiz ikkita yangi narsa ishlamaydi: **saytdagi navbat 1C ga
tushmaydi** va **"bemor keldi / kelmadi" belgisi qo'yilmaydi**.

Konfiguratsiyaga o'zgartirishlar kiritildi (`C:\...\MH3`). 1C
dasturchisi ularni Konfiguratorda yuklab, sintaksis nazoratidan
o'tkazishi va bazaga qo'yishi kerak. Keyin **konstantalarni to'ldiring**:

| Konstanta | Qiymat |
| --- | --- |
| `DynamoVisitsTable` | `dimed_visits` |
| `DynamoAppointmentsTable` | `dimed_appointments` |
| `DynamoBookingImportEnabled` | ✓ (belgilang) |

Va **har bir shifokorda** (Ma'lumotnomalar → Xodimlar) yangi
«Saytdagi shifokor kodi» (`WebDoctorID`) maydonini to'ldiring:
`ashurov`, `murtazayeva` va hokazo. Ro'yxatni admin panelda
(`/kabinet/admin`) ko'rasiz.

**Qanday ishlaydi:**

1. Bemor saytdan navbat oladi → 1C da **"Doktorga Qabul"** hujjati
   o'z-o'zidan paydo bo'ladi (o'tkazilmagan holda);
2. Bemor kelganda registrator o'sha hujjatni **o'tkazadi** (Провести);
3. Sayt buni ko'rib navbatni **«qabul bo'ldi»** deb belgilaydi;
4. Kun oxirigacha hujjat o'tkazilmasa — **«kelmadi»**.

**Qanday tekshirasiz:** saytdan sinov navbat oling → 5–10 daqiqada 1C
da «Doktorga Qabul» ro'yxatida paydo bo'ladi → uni o'tkazing →
10 daqiqada `/kabinet/admin/navbatlar` da «qabul bo'ldi» yoziladi.

Batafsil: `docs/1c-sync.md`, 6.2–6.4 bo'limlari.

---

## 2-qism. Ochilgandan keyin — birinchi hafta

### 2.1. Google Business Profile

Klinika Google xaritasida va «yaqinimdagi klinika» qidiruvida
chiqishi uchun. Saytdagi razmetka (manzil, ish vaqti, shifokorlar)
allaqachon tayyor — Business Profile uni to'ldiradi.

- business.google.com → klinikani qo'shing
- Manzil, telefon, ish vaqti **saytdagi bilan bir xil** bo'lsin
- Sayt manzili: `https://dimed.uz`

### 2.2. Payme kassasi

Kod to'liq yozilgan, faqat kalitlar kerak.

1. merchant.payme.uz da kassa oching
2. Netlify → Environment variables ga qo'shing:
   - `PAYME_MERCHANT_ID`
   - `PAYME_KEY`
   - `PAYMENT_ENABLED=1`
3. **Trigger deploy** qiling

Batafsil: `docs/payme-integration.md`.

**Qanday tekshirasiz:** bron qilganda «Tasdiqlash» o'rniga Payme
sahifasiga o'tadi.

### 2.3. 1C bilan tasdiqlash

1C dasturchisiga `docs/1c-sync.md` ni yuboring va **maydon nomlarini**
tasdiqlang (§4.3). Nomlar mos kelmasa tahlil natijasi kabinetga
tushmaydi va buni hech kim sezmaydi.

**Qanday tekshirasiz:**

```bash
npm run check-patients -- --phone "+998901234567"
```

Bu buyruq 1C o'sha raqamga nima yozganini ko'rsatadi. Ism-familiyasi
bo'sh yoki boshqa nom bilan yozilgan yozuvlarni alohida belgilaydi.

### 2.4. Eski jadvallarni o'chirish

Bazada ikkita meros jadval qolgan: `dimed_test_table` va
`AnalysisResult`. Sayt ularni ishlatmaydi.

Ichida kerakli ma'lumot yo'qligini tekshirib, AWS konsolidan
o'chiring.

---

## 3-qism. Kontent — istalgan payt

### 3.1. Suratlar

Bosh sahifada uchta surat bor: bino, statsionar palata, laboratoriya.

- `public/images/klinika-utt.webp` — bu **ishlab chiqaruvchining
  katalog surati** (oq fon), shuning uchun saytga qo'yilmadi. O'z
  kabinetingizdagi UTT apparatining suratini yuborsangiz almashtiraman.
- Yana surat bo'lsa yuboring — qabulxona, koridor, bolalar bo'limi.
  Ular saytga ishonch qo'shadi.

### 3.2. Shifokor ma'lumotlari

Har bir shifokorning **lavozimi, tajribasi va ish vaqti** to'g'rimi —
bosh sahifadan tekshiring. Noto'g'ri bo'lsa ayting: ular uch tilda
yozilgan, men ikkalasini ham to'g'rilayman.

### 3.3. Bo'sh joylar

- **Ginekologiya** bo'limi hozir yopiq (shifokor faolsiz). Yangi
  shifokor kelganda admin paneldan yoqasiz.
- Bo'limlar tavsifi va bosh sahifa matnlari o'zgartirilsa — ayting.

---

## 4-qism. Men nima qilaman

Siz 1-qismni tugatib xabar berganingizdan keyin:

1. **To'liq sinov ro'yxatini** tuzaman — nimani, qaysi tartibda va
   nima kutilishini yozib beraman
2. Har bir oqimni birga tekshiramiz: bron, kirish, kabinet, shifokor
   kabineti, admin, bot xabarlari, tahlil natijasi
3. Topilgan kamchiliklarni tuzataman

---

## 5-qism. Hozircha qoldirilgan — keyinroq

Bular ishga xalaqit bermaydi, lekin bilib turganingiz yaxshi.

| Nima | Nega hozir emas | Qachon kerak bo'ladi |
| --- | --- | --- |
| **Qabulxona roli** | Hozir faqat bemor, shifokor va ega roli bor. Qabulxona telefon qilgan bemorni saytdan yoza olmaydi | Qog'ozda yozishni to'xtatmoqchi bo'lsangiz. Bir savol hal qilinishi kerak: maxfiylik roziligini bemor o'rniga kim beradi |
| **Analitika** | Necha kishi kirdi, nechtasi navbat oldi — hozir bilib bo'lmaydi | Reklamaga pul sarflay boshlaganda |
| **CSP da `'unsafe-inline'`** | Astro kichik skriptni sahifa ichiga joylaydi, uning "barmoq izi" har deploy'da o'zgaradi | Xavfsizlik auditi talab qilsa |
| **Statsionar (yotoqxona) boshqaruvi** | Sayt faqat ambulator qabulni biladi | Palatalarni ham saytdan boshqarmoqchi bo'lsangiz |
| **Shifokor ma'lumotini bir joydan olish** | Bosh sahifadagi shifokor kartasi statik ro'yxatdan, admin panel esa bazadan o'qiydi. Admin panelda lavozimni o'zgartirsangiz bosh sahifada eskisi qoladi | Shifokorlar tez-tez o'zgara boshlaganda |

---

## Tez ma'lumotnoma

| Buyruq | Nima qiladi |
| --- | --- |
| `bash scripts/cloudshell-setup.sh` | Jadvallar, indekslar, zaxira nusxa, shifokorlar |
| `npm run seed-prices` | Tahlil narxlarini bazaga yozadi |
| `npm run link-doctor` | Shifokorni Telegram hisobiga bog'laydi |
| `npm run check-patients -- --phone "+998..."` | 1C o'sha raqamga nima yozganini ko'rsatadi |
| `npm test` | Barcha tekshiruvlar |

| Manzil | Kim uchun |
| --- | --- |
| `/kabinet` | Bemor — navbatlari va tahlillari |
| `/kabinet/shifokor` | Shifokor — bugungi navbatlar va jadval |
| `/kabinet/admin/navbatlar` | Ega — butun klinika navbatlari va hisobot |
| `/kabinet/admin` | Ega — shifokorlar (narx, davomiylik, yosh) |
| `/kabinet/admin/narxlar` | Ega — tahlil narxlari |
| `/kabinet/admin/baholar` | Ega — bemor baholari |
