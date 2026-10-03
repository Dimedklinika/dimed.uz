# Navbatlarni 1C bilan sinxronlash — qo'llanma (H3)

> Kim uchun: klinika egasi va 1C (MedHisob) dasturchisi. Sayt tomoni
> tayyor ma'lumotni qanday saqlashi, 1C tomoni uni qanday o'qishi va
> ikki tomon bir-birini qanday tekshirishi shu yerda. Ma'lumot
> **oqimi ikki yo'nalishda**: 1C → sayt (bemor profili, tahlil
> natijalari, bemor kelgani) va sayt → 1C (navbatlar). Ikkalasi ham
> ishlaydi. Tahlil natijalari bo'yicha shartnoma
> `docs/1c-integration.md` da, bu hujjat uni **to'ldiradi**.

## 1. Qisqacha

| Yo'nalish | Nima | Qayerda | Holat |
| --- | --- | --- | --- |
| 1C → sayt | Bemor profili (F.I.Sh., jins, tug'ilgan kun, kod) | `dimed_individuals` | ✅ ishlayapti — 1C kengaytmasi (ДинамоДБЭкспорт) yozadi, sayt o'qiydi |
| 1C → sayt | Tahlil natijalari (hujjat + analitlar) | `dimed_analysis_results` | ✅ ishlayapti; sayt har 15 daqiqada yangisini topib bemorga bot orqali havola yuboradi |
| Sayt → 1C | Navbatlar (kim, qaysi shifokorga, qachon, holati) | `dimed_appointments` | ✅ 1C reglament topshirig'i o'qib "Doktorga Qabul" hujjatini yaratadi (6.2) |
| 1C → sayt | Bemor keldimi ("Doktorga Qabul" o'tkazilgani) | `dimed_visits` | ✅ hujjat o'tkazilsa sayt navbatni "keldi" deb belgilaydi (6.3) |

Umumiy qoida o'zgarmaydi: **har bir jadvalga faqat bitta tomon yozadi.**
1C `dimed_individuals`, `dimed_analysis_results` va `dimed_visits` ga
yozadi, sayt — qolgan hammasiga. `dimed_appointments` ni 1C faqat
**o'qiydi**: navbatning holati (`status`) saytniki va uni 1C
o'zgartirmaydi. Bemor kelgani ham shu qoida bilan uzatiladi — 1C
o'ziniki bo'lgan `dimed_visits` ga yozadi, sayt o'qib xulosa chiqaradi.

## 2. Mavjud kengaytma (ДинамоДБЭкспорт) nima qiladi

1C konfiguratsiyasiga o'rnatilgan kengaytma ikkita konstanta bilan
ishlaydi va reglament topshirig'i orqali DynamoDB'ga `PutItem` yuboradi:

| Konstanta | Qiymat | Nima yoziladi |
| --- | --- | --- |
| `DynamoDBIndividualsTable` | `dimed_individuals` | Jismoniy shaxs (bemor) kartasi — telefon bo'yicha |
| `DynamoDBAnalysisResultTable` | `dimed_analysis_results` | Laboratoriya natijasi hujjati — telefon bo'yicha |
| `DynamoVisitsTable` | `dimed_visits` | "Doktorga Qabul" hujjati — bemor kelgani (6.3) |
| `DynamoAppointmentsTable` | `dimed_appointments` | Saytdagi navbatlar — **o'qish uchun** (6.2) |
| `DynamoBookingImportEnabled` | ✓ | Saytdan navbat olib kirishni yoqadi (6.2) |

Kalitlar va yozuv shakli — `docs/1c-integration.md` («1C to'g'ridan-to'g'ri
DynamoDB'ga yozadi»). Kengaytma **o'chirmaydi**: bekor qilingan hujjat
`Posted=false` yoki `DeletionMark=true` bilan qayta yoziladi, sayt uni
yashiradi. Shu tartib navbatlar uchun ham saqlanadi.

**2026-09-07 dan boshlab** kengaytma tahlil natijasi bilan birga
`AnalysisName` (tahlil/panel nomi — `Document.AnalysisResult.Analysis`,
bo'lmasa jadval qismidagi tahlillar nomi) va `Doctor` (yo'naltirgan
shifokor — `ReferencedPerson`) ni ham yuboradi. **2026-10-02 holati
(EDT `Info_Dev`, `DynamoSyncCore` 1.1):** analit qatorida me'yoriy oraliq
(`ReferenceMin` / `ReferenceMax` — sonli, yoki matnli `Reference`), bayroq
(`Status`: H/L/N) va izoh (`Comment`) ham yuboriladi — 4.3 dagi nomlar tasdiqlandi.

## 3. DynamoDB tuzilmasi — `phone` / `sort_key`

1C yozadigan ikkala jadval bir xil kalit bilan: **partition key `phone`**
(`+998XXXXXXXXX`, plyus bilan), **sort key `sort_key`**.

| Jadval | `sort_key` | Bir bemorda nechta yozuv |
| --- | --- | --- |
| `dimed_individuals` | 1C bemor **kodi** (`"10482"`, bo'shliqsiz) | Bir telefon ostida oila a'zolari — har biri o'z kodi bilan |
| `dimed_analysis_results` | Hujjat **UUID** | Har buyurtma alohida; tartibi sanaga bog'liq emas, sayt hammasini oxirigacha o'qiydi |

Sayt bemorni `dimed_users` (kalit `telegram_id`) da saqlaydi va
`phone-index` orqali telefonga, `code-index` orqali 1C kodiga bog'laydi.
Navbat yozuvidagi `patient_id` — aynan shu 1C kodi (bemor 1C katalogida
bo'lsa) yoki saytda qo'shilgan oila a'zosining `local-…` identifikatori.

Navbatlar jadvali boshqacha kalitlanadi, chunki uni sayt slot bandligini
atomik tekshirish uchun ishlatadi:

| Jadval | Partition key | Sort key | Indekslar |
| --- | --- | --- | --- |
| `dimed_appointments` | `doctor_day` = `"<doctor_id>#<YYYY-MM-DD>"` | `time` = `"HH:MM"` (Toshkent) | `date-index` (`date` + `starts_at`) — kun bo'yicha; `patient-index` (`phone` + `starts_at`) — bemor bo'yicha |

1C uchun eng qulay yo'l — **`date-index` bo'yicha `Query`**: bitta so'rov
bilan «shu kundagi barcha shifokorlarning navbatlari».

## 4. Maydonlar

### 4.1 Navbat yozuvi (`dimed_appointments`) — sayt yozadi, 1C o'qiydi

| Maydon | Turi | Misol | Izoh |
| --- | --- | --- | --- |
| `doctor_day` | S | `ashurov#2026-09-08` | Kalit: shifokor + kun |
| `time` | S | `10:00` | Kalit: qabul boshlanishi, Toshkent vaqti |
| `doctor_id` | S | `ashurov` | Sayt shifokor identifikatori (`dimed_doctors.doctor_id`) |
| `date` | S | `2026-09-08` | Qabul kuni (Toshkent) — `date-index` kaliti |
| `starts_at` | S | `2026-09-08T05:00:00.000Z` | Boshlanish lahzasi, **ISO, UTC** (Toshkent = UTC+5) |
| `phone` | S | `+998901234567` | Bron qilgan hisob telefoni (1C `phone` kaliti bilan bir xil format) |
| `telegram_id` | S | `39707325` | Bron qilgan Telegram hisobi (1C uchun kerak emas) |
| `patient_id` | S | `10482` yoki `local-1725…` | Navbat kim uchun: 1C bemor kodi yoki saytda qo'shilgan oila a'zosi |
| `patient_name` | S | `Azizova Aziza` | Bemor ismi (bron paytidagi) |
| `patient_birth_date` | S | `1990-04-25` | Tug'ilgan sana, `YYYY-MM-DD` (B1 — majburiy) |
| `privacy_accepted_at` | S | ISO | Maxfiylik siyosatiga rozilik lahzasi (B4) |
| `status` | S | `booked` | Holat — quyidagi jadval |
| `price` | N | `70000` | Qabul narxi, so'm (bron paytidagi) |
| `hold_until` | N | unix sekund | Faqat `hold` holatida (onlayn to'lov) |
| `payment_id` | S | | Faqat onlayn to'lovda |
| `reminded_at` | S | ISO | Bemorga 1 soat oldin eslatma ketgan lahza |
| `marked_at` | S | ISO | Shifokor `done` / `no_show` deb belgilagan lahza (E2) |
| `rating_asked_at`, `rating`, `rated_at` | S, N, S | | Bemor bahosi (G2); 1C uchun ixtiyoriy |
| `service_id` | S | `massaj` | Faqat qo'shimcha xizmat tanlanganda (asosiy qabulda yo'q); shifokordagi `services[].id` |
| `service_name` | S | `Massaj` | Xizmat nomi (bron paytidagi) |
| `service_code` | S | `00123` | **1C `Catalog.GoodsAndServices` kodi** — admin panelda xizmat qatoriga yozilgan; kod yozilmagan bo'lsa maydon yo'q. 1C `DynamoSyncBookings.ServiceFor` shu bo'yicha xizmatni topadi |
| `service_followup` | BOOL | `true` | Xizmat «qayta ko'rik» (`qayta:N`) — shu shifokorga oddiy qabulga kelgan bemorga, qabuldan keyin N kun ichida (necha marta bo'lsa ham) |
| `followup_verified` | BOOL | `false` | Faqat qayta ko'rikda: sayt shartni (oxirgi N kunda shu shifokorga oddiy qabul) ko'rdimi. `false` — ko'rmadi (qabul faqat 1C da bo'lishi mumkin): navbat baribir yozilgan, **shartni qabulxona 1C tarixi bo'yicha tekshiradi**. Admin va shifokor ro'yxatida xizmat nomi «(qabulxonada tekshirilsin)» bilan chiqadi |
| `payment_skipped_by` | S | `39707325` | Administrator sinov bron uchun to'lovni o'tkazib yuborgan (Telegram ID) |
| `paid_amount` | N | `70000` | **Onlayn to'langan summa (so'm)** — Payme to'lovni tasdiqlaganda yoziladi; holat keyin `done`/`no_show` ga o'tsa ham qoladi; pul qaytarilsa olib tashlanadi. Klinikada to'lanadigan va bepul navbatda yo'q. 1C `DoctorsAdmission.PrepaidAmount` ni shundan to'ldiradi |
| `paid_at` | S | ISO | To'lov tasdiqlangan lahza |
| `created_at`, `updated_at` | S | ISO | |

`price` — tanlangan xizmatning narxi (asosiy qabulda shifokor narxi); `0` — bepul.
**To'lov 1C ga qanday o'tadi:** faqat onlayn to'langan summa — `paid_amount` →
`DoctorsAdmission.PrepaidAmount` (`DynamoSyncBookings.PaidAmountOf`; maydon bo'lmagan eski
`paid` navbatda `price` olinadi). Klinikada to'lanadigan navbatda `PrepaidAmount = 0`, narxni
kassir avvalgidek qo'yadi. `Document.Sales` ni hujjatdan to'ldirishda narx shu maydondan
olinadi — `docs/1c-tuzatishlar.md`, 5-band. (Onlayn to'lov hozir o'chiq: `PAYMENT_ENABLED`.)

**Holatlar (`status`):**

| Qiymat | Ma'nosi | 1C ga o'tkaziladimi |
| --- | --- | --- |
| `booked` | Bron kuchda, to'lov qabulxona kassasida | **ha** |
| `paid` | Onlayn to'langan (hozir ishlatilmaydi) | ha |
| `done` | Qabul bo'lib o'tdi (shifokor belgiladi) | ha — holat yangilanadi |
| `no_show` | Bemor kelmadi (shifokor belgiladi) | ha — holat yangilanadi |
| `hold` | Onlayn to'lov kutilmoqda (5 daqiqa) | **yo'q** |
| `moved` | Bemor boshqa vaqtga ko'chirdi — eski yozuv | yo'q (yangi vaqt alohida yozuv bo'lib keladi) |
| `cancelled` | Bekor qilingan | yo'q (1C dagi hujjat bekor qilinadi) |
| `cancelled_by_clinic` | Shifokor ishga chiqa olmadi — klinika bekor qildi | yo'q (1C dagi hujjat bekor qilinadi) |

Vaqtni ko'chirishda sayt **yangi** yozuv ochadi (yangi `doctor_day`/`time`)
va eskisini `moved` qiladi — ya'ni bitta bron 1C ga ikki qator bo'lib
ko'rinadi. 1C hujjatini yangisiga bog'lash uchun ikkala qatorda ham
`phone` + `patient_id` bir xil.

### 4.2 Shifokor (`dimed_doctors`) — sayt yozadi

`doctor_id` (S, kalit), `name`, `job`, `dept_id`, `price` (N),
`slot_minutes` (N, standart 60), `shifts` (L: `{start, end}`),
`workdays` (L: 0 = yakshanba … 6 = shanba), `active` (BOOL),
`rating_sum` / `rating_count` (N), `services` (L: `{id, name, price, code?, followup_days?}` —
qo'shimcha xizmatlar; admin panelda matn bilan kiritiladi, `netlify/functions/lib/services.ts`).

1C bilan bog'lash uchun `doctor_id` ↔ 1C xodimi mosligi kengaytmada
**bitta lug'at** (yoki `dimed_doctors.onec_ref` maydoni — 1C o'zi
`UpdateItem SET onec_ref` bilan qo'yishi mumkin, sayt bu maydonga
tegmaydi).

### 4.3 Sayt o'qiydigan 1C maydonlari (tasdiqlash kerak)

Natija sahifasi (D1) uchun sayt hujjat va analitda quyidagi nomlarni
**birinchi topilganini** oladi. 1C dasturchisi qaysi nomni yuborishini
tasdiqlasa, ro'yxat bittaga qisqartiriladi:

| Nima | Sayt o'qiydigan nomlar (tartib bilan) | Qayerda |
| --- | --- | --- |
| Tahlil (panel) nomi | `AnalysisName` ✅ yuborilyapti (qolganlari zaxira: `Analysis`, `PanelName`, `Nomenclature`, `ServiceName`, `Title`) | hujjat |
| Yuborgan shifokor | `Doctor` ✅ yuborilyapti (zaxira: `ReferringDoctor`, `DoctorName`, `Physician`) | hujjat |
| Me'yoriy oraliq (matn) | `Reference`, `ReferenceRange`, `ReferenceText`, `Norm`, `NormText` | analit |
| Me'yor pastki / yuqori chegarasi (son) | `ReferenceMin`/`ReferenceMax`, `MinValue`/`MaxValue`, `LowerLimit`/`UpperLimit`, `NormMin`/`NormMax` | analit |
| Me'yordan chetlanish bayrog'i | `Flag` yoki `Status`: `H`/`HIGH`/`↑`, `L`/`LOW`/`↓`, `N` | analit |
| Ko'rsatkich izohi | `Description`, `Comment` | analit |

Tavsiya: **`AnalysisName`**, **`Doctor`**, **`ReferenceMin`/`ReferenceMax`**
(son, `NDS=.; NG=0`), matnli oraliq bo'lsa **`Reference`** (`"3.9 - 5.6"`,
`"< 5.2"`). Bayroq bo'lmasa sayt qiymatni oraliq bilan o'zi taqqoslaydi.
Mavjud maydonlar (`Analyte`, `Result`, `AnalyteUnit`,
`AnalyteInternationalCode`, `PatientName`, `PatientBirthday`,
`PatientIsMale`, `Date`, `Biomaterial`, `SampleID`, `Posted`,
`DeletionMark`) o'zgarmaydi.

## 5. Format

DynamoDB JSON (kengaytma allaqachon shunday yozadi): satr `{"S": …}`,
son `{"N": "70000"}` (**satr ko'rinishida**), mantiqiy `{"BOOL": true}`,
ro'yxat `{"L": [...]}`, xarita `{"M": {...}}`. `date-index` bo'yicha
so'rov:

```json
{
  "TableName": "dimed_appointments",
  "IndexName": "date-index",
  "KeyConditionExpression": "#d = :d",
  "ExpressionAttributeNames": { "#d": "date" },
  "ExpressionAttributeValues": { ":d": { "S": "2026-09-08" } }
}
```

Javob 1 MB da kesiladi — `LastEvaluatedKey` kelsa `ExclusiveStartKey`
bilan davom ettiring (bir kunda 1 MB navbat bo'lmaydi, lekin kod shunga
tayyor bo'lsin). Bitta navbat yozuvi (qisqartirilgan):

```json
{
  "doctor_day": { "S": "ashurov#2026-09-08" },
  "time": { "S": "10:00" },
  "doctor_id": { "S": "ashurov" },
  "date": { "S": "2026-09-08" },
  "starts_at": { "S": "2026-09-08T05:00:00.000Z" },
  "phone": { "S": "+998901234567" },
  "patient_id": { "S": "10482" },
  "patient_name": { "S": "Azizova Aziza" },
  "patient_birth_date": { "S": "1990-04-25" },
  "status": { "S": "booked" },
  "price": { "N": "70000" },
  "created_at": { "S": "2026-09-05T12:41:03.512Z" }
}
```

Vaqtlar: `date` va `time` — **Toshkent** (klinika vaqti), `starts_at` va
`*_at` — **UTC** ISO. 1C da `starts_at` ni `Дата` ga o'girishda +5 soat
qo'shiladi (yoki `date` + `time` dan to'g'ridan-to'g'ri yig'iladi —
osonroq va aniq).

## 6. Yo'nalish va chastota

### 6.1 1C → sayt (hozir ishlayotgani)

- **Nima:** bemor kartasi (`dimed_individuals`) va natija hujjati
  (`dimed_analysis_results`).
- **Qachon:** reglament topshirig'i — hozirgi sozlama (har bir necha
  daqiqada yangi/o'zgargan hujjatlar). Fayl rejimidagi 1C'da reglament
  ishlamaydi — «ma'lumot uzilib qoladi» ning birinchi sababi shu.
- **Sayt tomoni:** profil har kirishda `dimed_users` ga birlashtiriladi;
  natijalar kabinetda darhol ko'rinadi, bot xabari `notify-results`
  cron'i orqali **har 15 daqiqada** (yangi tayyor hujjat topilsa —
  nom, sana va sahifa havolasi).

### 6.2 Sayt → 1C: navbatni "Doktorga Qabul" qilib ro'yxatga olish

> **Holat: bajarildi (2026-09-07).** Kod MedHisob konfiguratsiyasida —
> `CommonModule.DynamoSyncBookings`. Ilgari bu bo'lim `dm_WebBooking`
> degan alohida hujjatni taklif qilardi; endi klinikaning o'z
> **`Document.DoctorsAdmission` ("Doktorga Qabul")** hujjati ishlatiladi.

Yo'nalish — **1C tomondan o'qish (pull)**: 1C serveri internetdan ochiq
emas, kengaytma esa DynamoDB bilan allaqachon gaplashadi.

Reglament topshirig'i (`DynamoSyncJob`) har aylanishda:

1. `dimed_appointments` ni `date-index` bo'yicha bugundan **8 kun**
   oldinga o'qiydi (kuniga bitta `Query`, sahifalash bilan).
2. Har `booked` / `paid` / `done` navbat uchun `Document.DoctorsAdmission`
   topiladi yoki yaratiladi. Kalit — **`WebBookingKey`** = `doctor_day|time`
   (masalan `ashurov#2026-09-08|10:00`). Shu kalit tufayli topshiriq
   necha marta ishlasa ham hujjat nusxalanmaydi.
3. Hujjat **o'tkazilmagan** holda yaratiladi. Uni bemor kelganda
   registrator o'tkazadi — 6.3 ga qarang.
4. Navbat bekor qilinsa yoki ko'chirilsa (`cancelled`, `moved`,
   `cancelled_by_clinic`) hujjat **o'chirishga belgilanadi**. O'tkazilgan
   hujjatga tegilmaydi: bemor kelgan bo'lsa, kelgani rost.
5. `Document.Sales` ga saytdan **yozilmaydi** — kassa va o'zaro
   hisob-kitobga tegilmaydi. Qabul bo'lib o'tgach registrator sotuv
   hujjatini o'zi kiritadi.

**Sozlash (bir marta):**

| Nima | Qiymat |
| --- | --- |
| `Constant.DynamoAppointmentsTable` | `dimed_appointments` |
| `Constant.DynamoBookingImportEnabled` | ✓ (yoqilgan) |
| `Catalog.Staff.WebDoctorID` | har shifokorda saytdagi kodi: `ashurov`, `murtazayeva`, … |

`WebDoctorID` to'ldirilmagan shifokorning navbati **o'tkazib yuboriladi**
va jurnalga yoziladi. Bu ataylab: noto'g'ri shifokorga yozib qo'yishdan
ko'ra ko'rinadigan bo'shliq yaxshiroq. Saytdagi kodlar ro'yxatini
`npm run link-doctor` yoki admin panel (`/kabinet/admin`) ko'rsatadi.

**Bemor qanday topiladi** (`DynamoSyncBookings.PatientOf`, 2026-10-03 holati
— koddan): 1) 1C kodi bo'yicha (`patient_id` raqam bo'lsa; `local-…` bo'lsa
so'rovsiz o'tkaziladi); 2) `WebID` (saytdagi `patient_id`) bo'yicha; 3) telefon
(oxirgi 9 raqam) **va ism** bo'yicha — oila a'zolari ajralsin; topilsa unga
`WebID` yoziladi; 4) hech qayerdan topilmasa **yangi bemor yaratiladi**
(Jismoniy shaxslar → «Bemorlar» papkasi, `WebID` bilan; ism, tug'ilgan sana va
telefon saytdagidan; kartaning «Izoh» maydoniga «Onlayn yuklangan» yoziladi) va
jurnalga yoziladi. 1- va 2-qadam bir-birini kesmaydi (kod — raqam, `WebID` —
`local-…`), tartib faqat tezlikka ta'sir qiladi.

> Ilgari bu hujjatda «yangi karta ochilmaydi» deyilgan edi — kod esa ochadi.
> Xavf: ism har xil yozilsa (saytda «Toirov Rozi», 1C da «Toirov Rozimuhammad»)
> bitta odam ikki kartada bo'lib qolishi mumkin. Registrator `WebID` to'ldirilgan
> yangi kartalarni vaqti-vaqti bilan ko'zdan kechirsin va takrorini birlashtirsin.
> Qidiruvning 1-qadami (kod bo'yicha) uchun `docs/1c-tuzatishlar.md`, 2-band.

### 6.3 Davomat: bemor keldimi-kelmadimi

Bu klinikaning talabi: **1C'da hujjat o'tkazilgan bo'lsa — keldi; kun
davomida o'tkazilmasa — kelmadi.**

Oqim:

1. Registrator bemorni qabul qilganda "Doktorga Qabul" hujjatini
   **o'tkazadi** (Провести).
2. `DoctorsAdmissionOnWrite` obunasi hujjatni navbatga qo'yadi,
   `DynamoSyncJob` esa uni **`dimed_visits`** jadvaliga yozadi.
3. Saytdagi `sync-attendance` cron'i (har 10 daqiqada) o'sha kundagi
   qabullarni o'qib, mos navbatni **`done`** ("keldi") deb belgilaydi.
4. Kun tugagach hujjatsiz qolgan navbatlar **`no_show`** ("kelmadi")
   bo'ladi.

Shifokorning kabinetda qo'lda qo'ygan belgisi **ustun**: `marked_at`
to'ldirilgan navbatga avtomat tegmaydi.

**`dimed_visits` jadvali — 1C yozadi, sayt o'qiydi:**

| Sozlama | Qiymat |
| --- | --- |
| Jadval nomi (`DynamoVisitsTable` konstantasi) | **`dimed_visits`** |
| Partition key | `phone` (S) — `+998XXXXXXXXX` |
| Sort key | `sort_key` (S) — hujjat UUID |
| Indeks | `date-index` (`date` + `sort_key`) |

| Maydon | Turi | Izoh |
| --- | --- | --- |
| `date` | S | `YYYY-MM-DD`, klinika vaqti — `date-index` kaliti |
| `Date` | S | hujjat sanasi va vaqti, ISO |
| `Posted` | BOOL | **eng muhimi**: `true` = bemor keldi |
| `DeletionMark` | BOOL | o'chirishga belgilangan — hisobga olinmaydi |
| `PatientName`, `PatientCode` | S | bemor (kod — `patient_id` bilan bir xil) |
| `DoctorName`, `DoctorCode` | S | shifokor |
| `Queue`, `Symptoms`, `Number` | N, S, S | navbat raqami, simptomlar, hujjat raqami |
| `AppointmentKey` | S | `doctor_day\|time` — saytdan kelgan navbatda |

**Bog'lash tartibi (sayt tomoni):** `AppointmentKey` → telefon + kun
(ikkala tomonda bemor kodi bo'lsa u ham mos kelishi shart). Har hujjat
**bir marta** ishlatiladi: bemor bir kunda ikki shifokorga yozilgan
bo'lsa, bitta hujjat ikkalasini ham "keldi" qilib qo'ymaydi.

Bemor navbatsiz kelsa hujjat baribir `dimed_visits` ga tushadi, lekin
unga bog'lanadigan navbat bo'lmaydi — bunday yozuv e'tiborsiz qoladi.

### 6.4 IAM huquqlari (1C kaliti)

Yuqoridagi ikki yo'nalish uchun kerak:

- `dynamodb:PutItem` — `table/dimed_individuals`, `table/dimed_analysis_results`,
  **`table/dimed_visits`**;
- `dynamodb:Query` — **`table/dimed_appointments`** va
  **`table/dimed_appointments/index/date-index`**.

`DeleteItem` va `UpdateItem` **kerak emas**: bekor qilingan hujjat
`Posted=false` / `DeletionMark=true` bilan qayta yoziladi.

## 7. Xatolarni tekshirish

**1C tomonida**
- Har `PutItem`/`Query`/`UpdateItem` javobi tekshiriladi: HTTP 200 emas —
  `ЗаписьЖурналаРегистрации` (журнал регистрации) ga to'liq javob bilan;
  `ProvisionedThroughputExceededException` / `ThrottlingException` —
  qisqa kutib qayta urinish (jadvallar On-Demand, amalda uchramaydi);
  `ConditionalCheckFailedException` — yozuv o'zgargan, keyingi aylanishda
  qayta olinadi.
- Reglament topshirig'i **oxirgi muvaffaqiyatli vaqtini** konstantada
  saqlaydi; u 30 daqiqadan eskirsa — 1C administratoriga ogohlantirish.
- Telefonsiz yoki ikki raqamli bemor yuborilmaydi va jurnalga yoziladi
  (`docs/1c-integration.md`, 8–10-savollar).

**Sayt tomonida**
- Barcha xatolar log-botga (Telegram guruh) tushadi: `me/1c-natijalar`,
  `notify-results`, `ask-ratings` kabi kontekst bilan.
- `dimed_analysis_results` dagi hujjat kabinetda ko'rinmasa: `phone`
  formati (`+998…`), `Posted`/`DeletionMark`, jadval nomi
  (`dimed_analysis_results`, standart `AnalysisResult` emas) tekshiriladi.

**Birgalikda — solishtirish ro'yxati (haftada bir)**
1. Bir kun uchun `date-index` dagi `booked/paid/done/no_show` qatorlar soni
   = 1C dagi `dm_WebBooking` hujjatlari soni.
2. Tasodifiy 3 ta navbat: `patient_id` 1C kodi bilan mos, `starts_at`
   Toshkent vaqtiga to'g'ri (+5 soat).
3. Kechagi natijalar: 1C da o'tkazilgan hujjatlar soni = bemor kabinetida
   ko'ringanlar (bot xabari ketganlar `dimed_users.results_notified` da).
4. Sinov navbati (test bemor) → 1C da hujjat paydo bo'ldimi → shifokor
   «Qabul qilindi» → 1C da belgi yangilandimi.

## 8. Ochiq savollar (1C dasturchisi bilan kelishiladi)

1. Sayt → 1C yo'nalishi **kerakmi hozir**? (Sayt navbatni o'zida to'liq
   saqlaydi: shifokor kabineti, admin panel.) Kerak bo'lsa — pull
   (6.2) tasdiqlansin.
2. `dm_WebBooking` hujjatining maydonlari: bemor (1C kodi bo'yicha
   topiladi; topilmasa — `patient_name` + `patient_birth_date` bilan yangi
   karta?), shifokor (`doctor_id` ↔ xodim), sana-vaqt, narx, holat.
3. Natija hujjatida `AnalysisName`, `Doctor`, `ReferenceMin`/`ReferenceMax`
   (4.3) — qaysi nomda va qachon yuboriladi.
4. Chastota: 5 yoki 10 daqiqa; 1C serveri fayl rejimida emasligi
   tasdiqlansin.
