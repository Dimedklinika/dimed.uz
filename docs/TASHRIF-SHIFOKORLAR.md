# Tashrif buyuruvchi shifokorlar va sayt rasmlari (admin)

> **Kim uchun:** klinika egasi va administrator.
> Texnik tafsilotlar (jadvallar, endpointlar) — `LOYIHA-XARITASI.md`.

## Nima qilindi

1. **Tashrif buyuruvchi shifokorlar.** Klinikaga ma'lum kunlarda
   tashqaridan keladigan shifokorlar (hozir — travmatolog va
   endokrinolog) uchun:
   - bosh sahifada alohida bo'lim (3 tagacha karta) va
     `/tashrif-shifokorlar` sahifasi — o'zbek, rus, ingliz tillarida;
   - kartada: rasm, ism, mutaxassislik, qisqa ma'lumot, qaysi kunlari
     keladi (va yaqin 3 sana), qabul soatlari, narx («klinikada to'lanadi»);
   - **«Yozilish»** → kun → bo'sh vaqt → ism, telefon → tasdiqlash oynasi:
     «To'lov klinikada amalga oshiriladi» va summa. Onlayn to'lov yo'q,
     yozilish bepul;
   - band qilingan vaqt boshqalarga umuman ko'rinmaydi; ikki kishi bir
     vaqtni bir zumda tanlasa ham faqat bittasi yoziladi;
   - Telegram shart emas — faqat sayt.

2. **Admin bo'limlari** — `/kabinet/admin` ichida, boshqa admin
   bo'limlari bilan bir joyda va bir xil kirish bilan: «Tashrif
   shifokorlari», «Tashrif yozuvlari», «Rasmlar». (Avvalgi alohida
   `/admin` paneli olib tashlandi, eski manzil shu yerga yo'naltiriladi.)

3. **Rasmlar koddan chiqarildi.** Banner, galereya va shifokorlar rasmini
   endi `/kabinet/admin` → «Rasmlar» dan almashtirasiz — GitHub ham, dasturchi ham
   kerak emas. Rasm yuklanganda avtomatik kichraytiriladi va WebP
   qilinadi, fayl Netlify Blobs'da, bazada faqat havola.

Mavjud qismlar (Telegram kirish, oddiy navbat, kabinet, `/kabinet/admin`)
o'zgarmadi.

## Ishga tushirish (bir marta, ~15 daqiqa)

### 1. Kim kira oladi

Yangi kalit kerak emas. Admin bo'limlariga `ADMIN_TELEGRAM_IDS` dagi
Telegram hisoblar kiradi (boshqa admin sahifalari kabi). Netlify Blobs va
kesh tozalash Netlify ichida o'zi ishlaydi. Avvalgi `ADMIN_PASSWORD`
endi ishlatilmaydi — Netlify'dan o'chirib qo'yish mumkin.

### 2. Yangi jadvallar (DynamoDB)

Kompyuterda (PowerShell), repo papkasida:

```powershell
$env:DIMED_AWS_ACCESS_KEY_ID="..."
$env:DIMED_AWS_SECRET_ACCESS_KEY="..."
$env:DIMED_AWS_REGION="us-east-1"
npm run create-visiting-tables
```

Faqat uchta yangi jadval yaratiladi: `dimed_visiting_doctors`,
`dimed_visiting_bookings`, `dimed_site_media`. Mavjud jadvallarga
umuman murojaat qilinmaydi.

**Pullik imkoniyat yoqilmaydi.** Jadvallar AWS Free Tier ichida:
PROVISIONED rejim, jadval va har bir indeks 1 RCU / 1 WCU (uchalasi jami
5 RCU / 5 WCU; bepul chegara — hisob bo'yicha 25/25), auto scaling yo'q,
PITR (uzluksiz zaxira) yo'q. Rasm fayllari — Netlify Blobs (sayt tarifiga
kiradi, bir necha MB), boshqa AWS xizmati (S3, CloudFront, Lambda)
ishlatilmaydi.

> 1 RCU / 1 WCU klinika uchun yetadi (DynamoDB foydalanilmagan sig'imni
> 5 daqiqagacha jamlab, to'satdan ko'paygan so'rovlarni ham ko'taradi).
> Juda ko'p tashrif bo'lsa (masalan reklama paytida) so'rov sekinlashishi
> mumkin — unda sig'imni 25/25 chegarasi ichida oshirish mumkin.

> **Zaxira:** PITR o'chiq, ya'ni yozilganlar jadvalini o'tgan vaqtga
> qaytarib bo'lmaydi. Kerak bo'lsa — vaqti-vaqti bilan qo'lda eksport.

> AWS IAM foydalanuvchisining huquqlari `dimed_*` jadvallarga
> berilgan bo'lsa, yangilari ham shu ichiga tushadi. Agar huquq aniq
> jadval nomlari bilan yozilgan bo'lsa — uchta yangi nomni (va
> `dimed_visiting_bookings/index/*`) qo'shing.

### 3. Deploy

> **Tartib muhim emas.** Kod jadvallardan yoki rasmlarni ko'chirishdan
> oldin tushsa ham sayt buzilmaydi: bosh sahifadagi bo'lim jim
> yashirinadi, alohida sahifada «jadval hali e'lon qilinmagan» va telefon
> chiqadi, rasmlar repodagi standartlari bilan qoladi. Admin panel esa
> nima yetishmayotganini aniq aytadi.

PR `master` ga qo'shilgach Netlify o'zi yig'adi.

### 4. Hozirgi rasmlarni ko'chirish

```powershell
$env:NETLIFY_SITE_ID="..."     # Site configuration → Site details → Site ID
$env:NETLIFY_AUTH_TOKEN="..."  # User settings → Applications → Personal access tokens
npm run migrate-images -- --dry   # avval reja
npm run migrate-images
```

Banner, galereyadagi 3 surat va har bir shifokor rasmi Blobs'ga
yuklanadi. Qayta ishga tushirish xavfsiz: allaqachon ko'chirilgan yoki
admin almashtirgan rasm o'tkazib yuboriladi (`--force` — baribir qayta).
Token faqat shu skript uchun, Netlify'ga qo'shilmaydi; ishdan keyin
uni o'chirib qo'yish mumkin.

> Ko'chirilmasa ham sayt ishlayveradi — repodagi standart rasmlar
> ko'rinadi. Skript faqat hammasini bitta joyga (Blobs) to'playdi.

### 5. Shifokorlarni qo'shish

`dimed.uz/kabinet/admin` → «Tashrif shifokorlari» → **+ Yangi shifokor** →
travmatolog va endokrinologni kiriting (pastda batafsil).

## Admin paneldan foydalanish

Manzil: **`dimed.uz/kabinet/admin`** — tablar: «Tashrif shifokorlari»,
«Tashrif yozuvlari», «Rasmlar» (boshqa admin tablari yonida; header'dagi
Kabinet menyusida ham). Kirish — Telegram orqali, boshqa admin sahifalari
bilan bir xil: bot yuborgan kod (bitta kodga 5 urinish, raqam va IP
bo'yicha soatlik cheklov), keyin `ADMIN_TELEGRAM_IDS` ro'yxati tekshiriladi.
Ro'yxatda yo'q odamga «huquq yo'q» va uning Telegram ID si ko'rsatiladi.

### Tashrif shifokorlari

- **+ Yangi shifokor** — forma:
  - **Rasm tanlash** — telefondagi surat ham bo'ladi, avtomatik siqiladi;
  - **Matnlar** — «Oʻzbekcha / Русский / English» tugmalari bilan almashadi.
    O'zbekchada ism va mutaxassislik majburiy; rus/ingliz bo'sh qolsa saytda
    o'zbekchasi chiqadi. Yashil nuqta — shu tilda matn bor;
  - **Qaysi kunlari keladi** — «Har hafta» (masalan Sh), «Alohida sanalar»
    (masalan oyda ikki marta) va «Kelmaydigan sanalar» (odatdagi shanba,
    lekin bu safar kelmaydi);
  - **Qabul soatlari** — masalan 09:00–14:00; tanaffus bo'lsa
    «+ oraliq qo'shish» (09:00–12:00 va 13:00–16:00);
  - **Bitta qabul davomiyligi** — 10…90 daqiqa: vaqtlar shundan hosil
    bo'ladi (30 daq → 09:00, 09:30, …);
  - **Narx** — saytda ko'rinadi, kassada olinadi (bepul bo'lsa 0);
  - **Tartib raqami** — kartalar tartibi (kichigi oldin);
  - **Saytda ko'rinsin** — olib tashlansa karta yashirinadi.
- **Tahrirlash** — saqlangan zahoti saytda yangilanadi.
- **Yashirish / Ko'rsatish** — vaqtincha olib tashlash (yozuvlar saqlanadi).
- **O'chirish** — butunlay. Kelgusi yozuvlari bo'lsa panel ogohlantiradi;
  o'chirilsa ham yozuvlar «Yozilganlar» da qoladi.

### Yozilganlar

- **Bugun / Ertaga / Kelgusi 7 kun / O'tgan 7 kun** yoki «Dan–Gacha»
  sanalari (62 kungacha), shifokor bo'yicha filtr.
- Har yozuvda: vaqt, bemor ismi, **telefon** (bosilsa qo'ng'iroq),
  shifokor, narx.
- **Holat:** Kutilmoqda → **Keldi** / **Kelmadi** / **Bekor qilingan**.
  «Bekor» qilingan vaqt saytda yana bo'sh bo'ladi va boshqa odam
  yozilishi mumkin.
- Yuqoridagi hisoblagichlar bosilsa ro'yxat shu holat bo'yicha
  saralanadi; «Kelganlar bo'yicha» — kelganlarning qabul narxlari yig'indisi.
- Bemor yozilishni bekor qilmoqchi bo'lsa — klinikaga qo'ng'iroq qiladi
  (saytdagi tasdiq oynasida shunday yozilgan), siz holatni «Bekor» qilasiz.

### Rasmlar

- **Banner** — sayt havolasi Telegram/Facebook'da tashlanganda chiqadigan
  muqova (1200×630 ga avtomatik qirqiladi).
- **Galereya** — bosh sahifadagi «Bizda shunday» bo'limidagi 3 surat.
- **Shifokorlar** — asosiy jamoa (bosh sahifa kartalari va navbat olish
  oynasi). Ro'yxat `/kabinet/admin` dagi shifokorlardan olinadi.
- **Almashtirish** — fayl tanlang, bir necha soniyada saytda ko'rinadi.
  **Standartga qaytarish** — repodagi asl rasm.
- Tashrif shifokorlarining rasmi o'z formasida («Tashrif shifokorlari»).

## Cheklovlar va qoidalar

- Yozilish: qabul boshlanishiga kamida **1 soat** qolganda; **60 kun**
  oldinga; formada yaqin **8** ta kelish kuni.
- Bitta telefon raqamidan bir vaqtda **3** tadan ko'p kelgusi yozuv
  bo'lmaydi (oila a'zolari uchun bir kunda bir nechta yozuv mumkin).
  Bitta IP dan soatiga 8 ta urinish — botlarga qarshi.
- Sayt begona raqam haqida hech narsa aytmaydi: «bu raqam allaqachon
  yozilgan» yoki «N ta yozuvi bor» kabi javoblar yo'q — aks holda
  raqamni bilgan odam uning kimga yozilganini bilib olardi.
- Sayt kartalari CDN keshida turadi: admin saqlaganda kesh darhol
  tozalanadi. Juda kamdan-kam hollarda 5 daqiqagacha eski ko'rinishi
  mumkin.
- Rasm: JPEG, PNG yoki WebP; brauzer avval o'zi kichraytiradi, server
  WebP qiladi (shifokor — 800px, galereya — 1600px).

## Muammo bo'lsa

| Belgi | Sabab va yechim |
| --- | --- |
| Admin bo'limida «huquq yo'q» va Telegram ID | Shu ID ni Netlify'da `ADMIN_TELEGRAM_IDS` ga qo'shing, **Trigger deploy** |
| Bosh sahifada bo'lim ko'rinmaydi | Saytda ko'rinadigan tashrif shifokori yo'q (yoki hammasi yashirilgan) |
| Karta bor, «Yozilish» o'chiq | Yaqin 60 kunda kelish kuni yo'q → kunlarni belgilang |
| Panelda «Jadvallar hali yaratilmagan» | 2-qadam: `npm run create-visiting-tables` |
| Panelda «AWS ruxsati yetmaydi» | IAM foydalanuvchisiga uchta yangi jadvalni (va `dimed_visiting_bookings/index/*`) qo'shing |
| Xatolar | Hammasi Telegram log-botga ham boradi (`TELEGRAM_LOG_*`) |
