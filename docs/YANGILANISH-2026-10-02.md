# Yangilanish 2026-10-02 — nima o'zgardi va qanday joylanadi

> Kim uchun: klinika egasi va dasturchi. Sayt tomoni (Astro + Netlify Functions)
> tayyor va sinalgan; 1C tomoni `docs/1c-tuzatishlar.md` da (kodning katta qismi EDT
> loyihasiga kiritilgan, bazaga qo'llash va eski ob'ektlarni o'chirish — qo'lda).
>
> Tekshiruv: 175 API + 22 brauzer (Chrome, mobil va desktop) + birliklar tekshiruvi
> yashil, `typecheck` 0 xato, `build` o'tadi.

## 1. Sayt: nima o'zgardi

### Xabarlar endi yo'qolmaydi (eng muhimi)
Log-botdagi `remind-patients ... 401 Unauthorized` — Netlify'dagi bot tokeni yaroqsiz bo'lgan.
Ilgari kron avval «yuborildi» deb belgilab, keyin yuborardi, shuning uchun kalit buzilgan
paytdagi **hamma eslatma, shifokor xulosasi, baho so'rovi va natija xabari jimgina yo'qolgan**.
Endi vaqtinchalik xatoda (401, 408, 429, 5xx, tarmoq) belgi qaytariladi va keyingi ishga
tushishda qayta uriniladi. Bemor botni bloklagan bo'lsa (400/403) qayta urinilmaydi.

### Kron funksiyalari himoyalandi
`/api/notify-results`, `/api/remind-patients`, `/api/sync-attendance`, `/api/ask-ratings`,
`/api/doctor-daily` ochiq edi (`?mode=full` butun bemorlar jadvalini skanerlaydi). Endi: Netlify
rejalashtiruvchisi o'tadi; qolganlar 5–7 daqiqada bir marta; qo'lda ishga tushirish uchun
`CRON_SECRET` (ixtiyoriy). `.env.example` ga qo'shildi.

### Natija havolasi va PDF
- Bot havolasi endi `…netlify.app` emas, `SITE_URL` (yoki `https://dimed.uz`) bilan chiqadi.
- Natija havolasi messenjerga tashlanganda «Shifokorga navbat» rasmi chiqmaydi (`og:image` yo'q).
- **PDF:** haqiqiy logotip (matn «Dimed» emas), «Yuborgan shifokor» bo'sh bo'lsa katak yo'q
  (PDF'da ham, sahifada ham), **vizual ko'rsatkich (shkala)** ustuni, **QR kod**,
  24 ko'rsatkich bir betda, «manfiy g/L» kabi ma'nosiz birlik yo'q.
- **QR kod → `/tekshirish`:** PDF nusxasi haqiqiyligini tekshiradi (tahlil nomi, sana, bemor
  bosh harflari, tug'ilgan yili — natija qiymatlarisiz). 1C hujjatni bekor qilsa, uning PDF
  nusxasi ham tekshiruvdan o'tmaydi. `SESSION_SECRET` almashtirilsa, ilgari chiqqan QR'lar
  yaroqsiz bo'ladi.

### Kirish
- Bot kodni yuborganda xabar ostida **«🔐 Saytga kirish»** (kodsiz kirish) va **«📋 Kodni
  nusxalash»** tugmalari bor. Havola telefon va kodni `#` dan keyin olib yuradi (serverga
  ketmaydi), sahifa uni o'zi tasdiqlaydi va manzildan olib tashlaydi.
- Kod xabari bemorning tilida (uz/ru/en).
- Telegram Login Widget **ishlatilmadi**: u telefon raqamini bermaydi, 1C esa telefon bo'yicha ishlaydi.
- Botga **`/id`** deb yozilsa, u Telegram ID ni qaytaradi (`ADMIN_TELEGRAM_IDS` ga yozish uchun).

### Qo'shimcha xizmatlar va «qayta ko'rik» (yangi)
Shifokorga asosiy qabuldan tashqari xizmat qo'shish mumkin: massaj, qorin bo'shlig'i UZI,
qayta ko'rik va h.k.

- **Qanday kiritiladi:** `/kabinet/admin` → shifokor → «Qo'shimcha xizmatlar» maydoni, har qatorda
  bittadan: `Nomi | narx | 1C kodi | qayta:N`. `narx` — so'm yoki `bepul`; `1C kodi` va `qayta:N`
  ixtiyoriy. Masalan:

  ```
  Massaj | 50000 | 00123
  Qorin bo'shlig'i UZI | 120000
  Qayta ko'rik | bepul | qayta:10
  ```

  Maydon bo'sh qoldirilsa — xizmatlar olib tashlanadi (shifokor avvalgidek). Xato bo'lsa
  qator raqami bilan aytiladi.
- **Bemor:** bron vidjetining 3-qadamida «Xizmatni tanlang» — «Qabul (konsultatsiya)» va
  qo'shimchalar, narxi bilan. Xizmati yo'q shifokorda tanlov umuman chiqmaydi, hammasi avvalgidek.
  Tanlangan xizmat narxda, «Navbatlarim»da, shifokor va admin ro'yxatida, Telegram xabarida ko'rinadi.
- **Narx `bepul` (0) bo'lsa** onlayn to'lov so'ralmaydi, navbat «kassada» rejimida band bo'ladi.
- **Qayta ko'rik qoidasi (ega aytdi: 10 kun, necha marta bo'lsa ham):** `qayta:10` — shifokorga
  **oddiy qabulga** kelgan bemor qabuldan keyin **10 kun ichida** qayta ko'rikni **necha marta
  xohlasa** oladi (qabul kuni ham, 10-kun ham kiradi; Toshkent kalendari). Muddat faqat oddiy
  qabuldan sanaladi — qayta ko'rikning o'zi uni uzaytirmaydi (zanjir bo'lib abadiy bepul
  qolmasin). Qayta ko'rik kuni ham muddatga sig'ishi kerak: 4 kun oldin kelgan bemor 6 kun
  keyingi kunga yoza oladi, 7 kun keyingisiga — yo'q (bemorga oxirgi kun sanasi aytiladi).
  Vaqtni ko'chirishda ham shu tekshiriladi. «Kelgan» = vaqti o'tgan va bekor qilinmagan navbat
  (kun oxirida `kelmadi` qilinganlar sanalmaydi). **«Faqat shu shifokorga» sharti — mening
  taxminim** (ega aytmagan): boshqa shifokorga kelgan bemorga ko'rik berilmaydi. Hammasi kodda
  bir joyda: `netlify/functions/lib/appointments.ts`, `followupCheck`. «Faqat onlayn
  yozilganlarga» sharti **qo'yilmadi**: saytda yozilmagan (1C da ro'yxatdan o'tgan) bemorning
  oldingi qabulini sayt ko'rmaydi.
  **Yangilandi (2026-10-03, ega so'rovi):** shart bajarilmagani ko'rinsa ham qayta ko'rik
  **rad etilmaydi**. Sayt shartni ko'rmasa navbat `followup_verified: false` bilan yoziladi:
  bemorga «qabulxonada tekshiriladi, shart bajarilmasa oddiy qabul narxi olinadi» deyiladi,
  admin va shifokor ro'yxatida xizmat «(qabulxonada tekshirilsin)» bo'lib chiqadi.
- **1C bilan:** navbat 1C ga o'tganda xizmat kodi bo'yicha «Tovar va xizmat» topiladi
  (`docs/1c-tuzatishlar.md`, 5-band). Onlayn **to'langan** summa 1C da `PrepaidAmount` ga tushadi
  (yangi `paid_amount` maydoni); klinikada to'lanadigan navbatda narxni kassir avvalgidek qo'yadi.
- `dimed_appointments` da yangi maydonlar (eski yozuvlarga tegilmaydi): `service_id`,
  `service_name`, `service_code`, `service_followup`, `payment_skipped_by`.

### Telefonda ko'rinish (yangi)
Telefonda hamma sahifada matn ekran chetiga yopishib turgan edi: komponentlardagi
`padding: A 0 B` qoidalari umumiy `.wrap` ning yon bo'shlig'ini nolga tushirgan.
Tuzatildi (`src/styles/global.css`). Bundan tashqari:
- 360 px kenglikdagi telefonda bosh sahifadagi bron vidjeti ekrandan ~20 px chiqib ketardi — ustunlar
  `minmax(0, …)` bo'ldi;
- narxlar jadvalida (bosh sahifa va `/tahlillar`) telefonda «Narx» ustuni ekrandan tashqarida
  qolardi — endi nom va narx ko'rinadi, «Tayyor bo'lish» muddati nom tagida;
- 12 px dan kichik yozuvlar 12 px ga ko'tarildi (natija sahifasining jadvali — chop etiladigan
  hujjat — o'zgarmadi).
Desktop ko'rinishi o'zgarmagan. «Rang ko'zni charchatadi» fikri sub'ektiv — qayta dizayn
qilinmadi; yon bo'shliq xatosi bu taassurotning bir qismi bo'lgan bo'lishi mumkin.

### Kichik tuzatishlar
- Shifokor kartasida «16+» / «under 16» → «Kattalar · 16+» / «Bolalar · 16 yoshgacha» (uch tilda).
- Menyu tili: kabinetda Sozlamalardagi til bilan header bir xil bo'ladi (server tanlagan til ustun).
- «Navbatlarim»: narx yonidagi yozuv holatga mos («onlayn to'langan» / «kassada to'lanadi»).
- Administrator uchun «Sinov bron — to'lovsiz» belgisi (onlayn to'lov yoqilganda ham har safar
  to'lamasdan sinash; server faqat `ADMIN_TELEGRAM_IDS` dagilarga ruxsat beradi, bron
  `payment_skipped_by` izi bilan qoladi).
- Yangi ro'yxatdan o'tgan bemor oxirgi 3 kundagi natija haqida xabar oladi (eskisi — jimgina).
- `test:e2e` Windows'da ham ishlaydi (`npx` o'rniga node orqali).

## 2. Sayt kodini joylash

Kod `santyx-afk/dimed.uz` repozitoriysida (`master`), Netlify shundan yig'adi. Bu papka git emas,
shuning uchun o'zgargan fayllarni o'z git nusxangizga ko'chiring:

1. `Desktop\ZAXIRA-2026-10-02\yangi-fayllar\` ichida **faqat o'zgargan va yangi** fayllar,
   repodagi yo'llari bilan turibdi. Ularni git nusxangizdagi shu yo'llarga ustidan yozing.
2. `git status` — faqat shu fayllar o'zgargan bo'lsin; `git commit` va `git push`
   (yoki GitHub Desktop → Commit → Push). Netlify o'zi yig'adi.
3. **Netlify → Environment variables**: `TELEGRAM_BOT_TOKEN` yangi qiymatda ekanini tekshiring
   (`.env` yangilangan deganingiz uchun shu yetarli), `SITE_URL=https://dimed.uz`.
   Ixtiyoriy: `CRON_SECRET`.
4. **Deploys → Trigger deploy → Deploy site** (env o'zgargan bo'lsa shart).
5. Bot kaliti almashgan bo'lsa **setWebhook** ni qayta chaqiring (secret bilan birga) —
   `docs/ISHGA-TUSHIRISH.md`, «Qadam 5 — Telegram webhook'ini ulash».
6. Tekshiruv:
   - botga `/start` → kod xabari tagida ikki tugma; `/id` → raqam qaytadi;
   - tugmani bosing → sayt o'zi kiradi;
   - Netlify → Functions → `remind-patients` logida 401 yo'q;
   - natijani oching → «PDF yuklash» → logo, shkala va QR bor; QR'ni telefon bilan skanerlang;
   - telefondan saytni oching — matn chetga yopishmagan, narx jadvalida narx ko'rinadi;
   - `/kabinet/admin` → shifokorga «Qo'shimcha xizmatlar» yozing → bosh sahifada shu shifokorni
     tanlang → xizmat tanlovi chiqadi.

### Bir martalik skriptlar (jonli bazada, hali bajarilmagan bo'lishi mumkin)
Jonli `/api/doctors` hali `slotMinutes: 30` beryapti, qoida esa 60 daqiqa. `npm run migrate-slot-minutes -- --dry`
(ko'rish), keyin `npm run migrate-slot-minutes`. AWS kalitlari bilan, CloudShell yoki lokal.

## 3. 1C ni yangilash

Batafsil — `docs/1c-tuzatishlar.md`. EDT loyihasiga (`Info_Dev1`) **allaqachon kiritilgan**:
`ByCode`, `AnalysisRowsList` (takroriy qator, izoh, nol natija), `ServiceFor`, `AnalysisResult`
moduli, `Booking.Birthday` tuzatishi, onlayn to'langan summa → `PrepaidAmount` va Sotuv
(«Doktorga Qabul» asosida: to'lov usuli faqat to'langanda, Asos ko'rinadi, varaqada navbat vaqti). **Qo'lda qoladi** — 2 ta eski registrni o'chirish,
`DynamoIndividualsTable` konstantasini to'g'rilash (`dimed_individuals`) va Update database. Tartib:

1. **Zaxira:** `.1CD` bazasi va EDT loyihasi (`D:\workspace edt\Info_Dev1`).
2. EDT'da eski ob'ektlardan 5 tasi o'chirilgan; qolgan 2 ta registrni
   (`AnalysisResultExportQueue`, `IndividualExportQueue`) o'chirish (`1c-tuzatishlar.md`, 1-band) —
   endi kodda havola yo'q; keyin **Проверка конфигурации** (yangi xato bo'lmasin).
3. Bazaga qo'llash: EDT → loyiha → **Run → Update database** (yoki `.cf` ga eksport qilib
   Konfiguratorda **Конфигурация → Загрузить конфигурацию из файла** → **Обновить конфигурацию БД**).
   Fayl rejimida — hamma foydalanuvchi chiqqach, bir seansda.
4. Konstantalar: `DynamoIndividualsTable` hozir noto'g'ri (`fdssf`) — `dimed_individuals` qiling;
   qolganlari, `WebDoctorID`, `FullLoadIndividuals/FullLoadResults` — 6- va 7-band.
5. Tekshiruv: `DynamoSyncJobs.QueueState()`; jurnalda `DynamoSync.*` xatolari yo'q; saytdan sinov navbat →
   1C da «Doktorga Qabul» → o'tkazing → 10 daqiqada saytda «keldi»; leykoformulali sinov natija
   (bazofil «0» chiqadimi); xizmatli sinov navbat (hujjatda xizmat to'g'rimi).

## 4. Qaror kutayotgan va keyinga qoldirilganlar

| Nima | Holat |
| --- | --- |
| Kechikkan / kelmagan bemor siyosati | **Egasi qoidani yozib beradi** — keyin sayt tomonida qilinadi. Hozir kun oxirida `no_show` (jarimasiz) |
| «Qayta ko'rik faqat onlayn yozilganlarga bepul» | Qilindi — xizmat sifatida (`qayta:10`): 10 kun, necha marta bo'lsa ham (ega aytdi). «Faqat shu shifokorga» — mening taxminim, tasdiqlang. «Faqat onlayn» sharti qo'yilmadi (yuqorida) |
| Xizmat tanlash (massaj, UZI) | Qilindi; xizmatlar ro'yxati, narxi va 1C kodlarini admin panelda kiriting |
| Natija `0` bo'lsa 1C saytga bo'sh yuborardi | Qilindi: me'yor jadvaliga tayanadi, qaytarish yo'li bor (`1c-tuzatishlar.md`, 4-band) |
| 1C `PrepaidAmount` — pul to'langan holda to'lsin | Qilindi (2026-10-03): Payme to'lovni tasdiqlaganda navbatga `paid_amount`, 1C uni `PrepaidAmount` ga oladi. Onlayn to'lov hozir o'chiq (`PAYMENT_ENABLED`), yoqilganda ishlaydi; sayt kodini ham joylash kerak |
| Sayt rangi («ko'zni charchatadi») | Sub'ektiv fikr: 2–3 variant ko'rib tanlang, qayta dizayn emas |
| «Subscribe API uchun IP O'zbekistonda bo'lishi kerakmi» | Qaysi xizmat ekani noma'lum; Netlify serverlari chet elda, odatda IP bo'yicha bloklanmaydi |
| Bot rasmi | BotFather → /setuserpic (kod kerak emas) |
| Yangi shifokor / tahlil qo'shish | Shifokor: `/kabinet/admin`; tahlil narxi/faolligi: `/kabinet/admin/narxlar`; yangi tahlil turi — `legacy/_analysis/*.md` + `legacy/_data/price.csv` → `npm run build-analyses` |
