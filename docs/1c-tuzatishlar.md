# 1C (MedHisob) tuzatishlari — nima kiritilgan, nima qolgan

> **Kim uchun:** 1C dasturchisi (yoki EDT'da konfiguratsiyani yuritadigan odam).
> **Sana:** 2026-10-03 (yangilangan). **Loyiha:** EDT **`Info_Dev1`** (`D:\workspace edt\Info_Dev1`,
> konfiguratsiya `MedHisob`). Eski `Info_Dev` papkasi eskirgan — u bilan ishlamang.
>
> **Holat.** 2–5-bandlardagi o'zgarishlar `Info_Dev1` EDT loyihasiga **kiritilgan** (2026-10-03:
> `get_project_errors` — `DynamoSync*`, `Individuals`, `DoctorsAdmission` da xato yo'q). Bazaga
> hali qo'llanmagan: EDT holati «Incremental update required» — **Update database** kerak.
> Jonli bazada sinab ko'rilmagan — yangilagach 6-banddagi tekshiruvdan o'ting. 1-bandda 5 ta
> ob'ekt o'chirilgan, **2 ta registr qolgan** (1.1-jadval, 6- va 7-qator).
>
> Boshlashdan oldin EDT loyihasi (`D:\workspace edt\Info_Dev1`) va `.1CD` bazasi zaxirasini oling.
> O'zgarishlardan **oldingi** holat shu yerda: `Desktop\ZAXIRA-2026-10-02\Info_Dev-oldin`.

| Band | Nima | Holat |
| --- | --- | --- |
| 1 | Eski `DynamoDBExport*` ob'ektlarini o'chirish | **5/7 o'chirilgan**; qolgan 2 registr — qo'lda (kodda havola yo'q) |
| 1.3 | `Document.AnalysisResult` ob'ekt moduli | Kiritilgan |
| 2 | `DynamoSyncBookings.ByCode` (kod — son) | Kiritilgan |
| 3 | `DynamoSyncCore.AnalysisRowsList` (takroriy qator, izoh) | Kiritilgan |
| 4 | Natija `0` | Kiritilgan (me'yor jadvaliga tayanadi) — qaytarish yo'li bor |
| 5 | Navbatdagi xizmatni 1C ga o'tkazish (`ServiceFor`) | Kiritilgan |
| 7 | `Info_Dev1` tekshiruvi (2026-10-03): `Booking.Birthday` xatosi, `DynamoIndividualsTable` | Tuzatildi / **qo'lda** — 7-bandga qarang |
| 8 | Sotuv «Doktorga Qabul» asosida: to'lov usuli, Asos, varaqada navbat vaqti | Kiritilgan (2026-10-03) — 8-band |

## 1. Eski eksportni olib tashlash (muhim) — QO'LDA

Yangi tizim (`DynamoSync*`) bilan bir qatorda eski `DynamoDBExport*` hali konfiguratsiyada
turibdi. Eski modul o'chirilgan konstantalarga (`DynamoDBAccessKeyID`, `DynamoDBSecretKey`,
`DynamoDBRegion`, `DynamoDBAnalysisResultTable`, `DynamoDBIndividualsTable`) murojaat qiladi —
EDT shu joylarda «Свойство (метод) объекта не обнаружено» xatosini beradi. Eski reglament
topshirig'i har 5 daqiqada ishga tushib, jurnalni xatolar bilan to'ldiradi.

### 1.1 Qaysi ob'ektlarni o'chirish (shu tartibda)

| # | Ob'ekt (FQN) | Nega |
| --- | --- | --- |
| 1 | `EventSubscription.AnalysisResultPostingHandler` | eski modulga yozadi |
| 2 | `EventSubscription.IndividualWriteHandler` | eski modulga yozadi |
| 3 | `ScheduledJob.DynamoDBExportJob` | har 5 daqiqada eski eksportni yurgizadi |
| 4 | `CommonModule.DynamoDBExportScheduled` | eski navbatni o'qiydi |
| 5 | `CommonModule.DynamoDBExportServer` | eski PutItem kodi |
| 6 | `InformationRegister.AnalysisResultExportQueue` | eski navbat |
| 7 | `InformationRegister.IndividualExportQueue` | eski navbat |

EDT'da ob'ektga o'ng tugma → **Delete**. Avval «Find references» bilan tekshiring: 6- va
7-registrga faqat `Role.BaseRights` huquqlari havola qiladi (kodda esa faqat 4–5-modullar) —
EDT huquqni o'zi tozalaydi. Eski `DynamoDB*` konstantalari konfiguratsiyada allaqachon yo'q.

**Yangi tizimga tegmang:** `DynamoSyncCore`, `DynamoSyncJobs`, `DynamoSyncEvents`,
`DynamoSyncBookings`, `DynamoSyncJob`, `DynamoSyncQueue`, `DynamoTombstoneQueue` qoladi.

### 1.2 O'chirishdan oldin: eski navbatda yuborilmagan narsa qolmasin

Eski navbatdagi yozuvlar bazani yangilaganda yo'qoladi. Yangi tizim hammasini birinchi to'liq
yuklash bilan qayta yuboradi: konstantalarda `FullLoadIndividuals = ✓`,
`FullLoadResults = ✓`, `FullLoadResultsFromDate` — qancha orqaga kerak bo'lsa (masalan, yil
boshi). Reglament topshirig'i porsiyalab navbatga qo'yadi, tugagach belgilarni o'zi o'chiradi.

### 1.3 Kiritilgan: `Document.AnalysisResult` ob'ekt moduli

`Documents/AnalysisResult/ObjectModule.bsl` dan eski navbatga yozadigan qism olib tashlandi
(`Var IsBeingPosted`, `BeforeWrite`, `OnWrite`). Hujjatni saytga yuborishni endi faqat
`DynamoSyncEvents` obunalari bajaradi. Qolgan metodlarga (`Filling`, `Posting`, ...) tegilmagan.
Eski holatni qaytarish kerak bo'lsa — zaxiradagi fayl shu yo'lda.

## 2. `DynamoSyncBookings.ByCode` — bemor kodi bo'yicha qidiruv (kiritilgan)

**Muammo.** `Catalog.Individuals.Code` — **son** (`Number(9)`), saytdan kelgan `patient_id` esa
**matn**. So'rovda son maydonini matn parametri bilan solishtirish turlar nomuvofiqligi tufayli
hech narsa topmasligi (yoki xato berishi) mumkin. U holda bemor 1C kodi bo'yicha topilmay,
telefon+ism bo'yicha ham topilmasa, **yangi karta ochilib ketadi** (ikki nusxa).

**Tuzatish.** Kod bo'shliqlardan tozalanadi, faqat raqamlardan iborat (1–9 raqam) bo'lsa
`Number(Digits)` so'rov parametri sifatida beriladi; `local-...` (oilaga saytda qo'shilgan
a'zo) va raqam bo'lmagan ID lar — «1C kodi emas» (`Undefined`). Qolgan hamma narsa o'zgarmagan.
To'liq matn: EDT → `CommonModules/DynamoSyncBookings/Module.bsl`, `ByCode`.

## 3. `DynamoSyncCore.AnalysisRowsList` — qatorlar takrorlanishi va noto'g'ri izoh (kiritilgan)

**Muammo 1 — takroriy qator.** So'rov `NumericResultDefinitions` va `AnalyteVariants` ga `LEFT JOIN`
qiladi. Bir analitda bir nechta «referens» yozuvi bo'lsa, yoki qiymat ikki ta'rifning umumiy
chegarasiga tushsa (masalan, `3.9–6.1` va `6.1–10` oraliqlari, qiymat `6.1`), **bitta analit
natijada ikki marta chiqadi**.

**Muammo 2 — noto'g'ri izoh (`Comment`).** Mos ta'rifni topish sharti
`ISNULL(AdjustedResult, RawResult)` bilan yozilgan. Hujjat jadval qismida son maydoni hech qachon
`NULL` bo'lmaydi (yozilmagan bo'lsa `0`), shuning uchun `Moslashtirilgan natija` bo'sh bo'lganda
solishtirish **0 bilan** ketadi va analitga boshqa ta'rifning izohi yopishadi. Bemor bu izohni
sayt natija sahifasida o'qiydi.

**Tuzatish (to'liq matn — EDT, `CommonModules/DynamoSyncCore/Module.bsl`, `AnalysisRowsList`):**

- so'rovga `NumericReference.LineNumber AS ReferenceLine`, `MatchedNumeric.LineNumber AS MatchedLine`
  qo'shildi, `ORDER BY LineNumber, ReferenceLine, MatchedLine`;
- `ISNULL(AdjustedResult, RawResult)` → `CASE WHEN AdjustedResult <> 0 THEN AdjustedResult ELSE RawResult END`;
- tsiklda `LineNumber` oldingisi bilan bir xil bo'lsa qator o'tkazib yuboriladi
  (`If Selection.LineNumber = PreviousLine Then Continue; EndIf;`);
- bo'sh (qiymati yo'q) sonli qatorga `Status` va `Comment` qo'shilmaydi (`HasNumericResult`).

## 4. Natija `0` — qaror qabul qilingan (kiritilgan)

**Muammo edi.** Son maydoni yozilmagan qatorda ham `0` turadi, ya'ni «kiritilmagan» bilan
«haqiqiy nol» farqlanmaydi. Ilgari `0` har doim bo'sh yetardi — leykoformuladagi
**Bazofillar: 0**, Miyelotsitlar, Plazmatik hujayralar kabi odatiy nollar saytda bo'sh chiqardi.
Hammasini «0» deb yuborish esa teskari xato: kiritilmagan qator soxta «0 — past» bo'lib qolardi.

**Qoida (laboratoriyaning o'z me'yor jadvaliga tayanadi).** Nol natija sifatida yuboriladi,
**agar** analitning me'yor yozuvi (`IsReferenceValue = ✓`) bor va uning quyi chegarasi `0` bo'lsa
(me'yor `0–1`, `0–2` ...). Me'yori `3.9–6.1` bo'lgan ko'rsatkichda nol hech qachon haqiqiy natija
emas — u bo'sh qoladi. Me'yor yozuvi umuman yo'q analitda ham bo'sh qoladi.

Kodda bu `AnalysisRowsList` ichidagi bitta tarmoq:

```bsl
ElsIf ValueIsFilled(Selection.ReferenceLine) And Selection.ReferenceFrom = 0 Then // ZeroByReference
	ResultValue = NumberToString(0);
	HasNumericResult = True;
```

**Qaytarish** (avvalgi xulq — nol bo'sh): shu `ElsIf` tarmog'ini (ikki qator + izoh) o'chiring.

**Cheklov (halol aytaman).** Me'yori `0` dan boshlanadigan analitda laborant qiymatni umuman
kiritmagan bo'lsa ham «0» yuboriladi (masalan, leykoformula to'ldirilmagan hujjatda barcha
bazofil/eozinofil `0` bo'lib ketadi). Bu tibbiy jihatdan zararsiz (me'yor ichida), lekin
laborant ataylab bo'sh qoldirgan qator ham «0» ko'rinadi. Muammo bo'lsa — yuqoridagidek
qaytaring yoki hujjatga «Natija kiritilgan» belgisini qo'shish (to'g'ri, lekin forma
mantig'iga tegadigan yo'l) haqida kelishing.

## 5. Navbatdagi xizmatni 1C ga o'tkazish — `ServiceFor` (kiritilgan)

Saytda shifokorga qo'shimcha xizmat (massaj, UZI, qayta ko'rik ...) qo'shilgan
(`docs/YANGILANISH-2026-10-02.md`, 1-band). Navbat 1C ga o'tganda xizmat ham o'tishi uchun:

- `DynamoSyncBookings.BookingFromItem` navbat elementidan `ServiceCode` va `ServiceName`
  maydonlarini ham o'qiydi (saytdagi `service_code`, `service_name`);
- yangi `ServiceFor(Booking, Doctor)`: avval `Catalog.GoodsAndServices` ni **saytdagi admin
  panelda xizmat qatoriga yozilgan 1C kodi** bo'yicha topadi; topilmasa (yoki kod yozilmagan
  bo'lsa) — avvalgidek shifokorning `Catalog.Staff.WebDoctorService` i; kod yozilgan-u
  topilmasa jurnalga ogohlantirish: `Xizmat kodi topilmadi: ...`;
- `RegisterBooking` hujjat yaratishda `Document.Service = ServiceFor(Booking, Doctor)`.

Asosiy qabulda (xizmat tanlanmagan) kod kelmaydi — hamma narsa avvalgidek ishlaydi.

**To'lov va narx.** `Document.Sales` ni `DoctorsAdmission` dan to'ldirishda
(`Documents/Sales/ObjectModule.bsl`) qator xizmati `FillingData.Service` dan, **narxi esa
`FillingData.PrepaidAmount` dan** olinadi (to'lov usuli — `OnlinePaymentMethod` konstantasi).
2026-10-03 dan sayt **onlayn to'langan** summani `PrepaidAmount` ga yozadi: Payme to'lovni
tasdiqlaganda navbatga `paid_amount` (so'm) yoziladi, 1C esa hujjat yaratishda
(`BookingFromItem` → `PaidAmountOf` → `RegisterBooking`) uni `PrepaidAmount` ga qo'yadi.
Hujjat allaqachon bor-u o'tkazilmagan bo'lsa va sayt keyin to'lovni tasdiqlasa — summa
yangilanadi; sayt «to'lanmagan» desa registrator qo'lda kiritgan summaga tegilmaydi;
o'tkazilgan hujjatga umuman tegilmaydi. **Klinikada to'lanadigan** (va hozirgi — onlayn
to'lov o'chiq, `PAYMENT_ENABLED` bo'sh) navbatda `PrepaidAmount = 0`: sotuv qatorining narxini
kassir avvalgidek 1C da qo'yadi. Xizmat (kod bo'yicha) har ikkala holda ham o'tadi.

**Bepul qayta ko'rik.** Bemorga saytda «bepul» ko'rinadi, to'lov yo'q (`payments.status = free`).
1C da sotuv qatori narxi `PrepaidAmount = 0` dan keladi — kassirga «qayta ko'rik — 0 so'm»
ekanini aytib qo'ying, 1C dagi «Qayta ko'rik» tovar-xizmati narxini 0 qilish ham ma'qul.

**1C kodlarini yozish:** `/kabinet/admin` → shifokor → «Qo'shimcha xizmatlar», har qatorda
`Nomi | narx | 1C kodi | qayta:N` (masalan, `Massaj | 50000 | 00123`).
`Catalog.GoodsAndServices` kodi son yoki satr bo'lishi mumkin; kod mos kelmasa topilmadi deb olinadi.

## 6. Bazani yangilashdan keyin (qisqa)

1. Konstantalar: `DynamoSyncEnabled ✓`, `DynamoRegion = us-east-1`, `DynamoAccessKeyID`,
   `DynamoSecretKey` (yangi kalit), `DynamoIndividualsTable = dimed_individuals`,
   `DynamoAnalysisResultsTable = dimed_analysis_results`, `DynamoVisitsTable = dimed_visits`,
   `DynamoAppointmentsTable = dimed_appointments`, `DynamoBookingImportEnabled ✓`.
2. `Catalog.Staff.WebDoctorID` — har shifokorda (admin paneldagi kodlar bilan bir xil yozing:
   to'ldirilmagan shifokorning navbati o'tkazib yuboriladi va jurnalga yoziladi).
3. Reglament topshirig'i **fayl rejimida ishlamaydi** — server rejimi yoki «yurituvchi» seans.
4. Tekshiruv: `DynamoSyncJobs.QueueState()` — `QueueCount` kamayib boradi, `DeadCount = 0`,
   `LastRunAt` 20 daqiqadan eski emas; jurnalda `DynamoSync.*` xatolari yo'q.
5. Qo'shimcha tekshiruv (yangi): leykoformulali sinov natija — bazofil `0` saytda «0» bo'lib
   chiqadimi, `3.9–6.1` me'yorli ko'rsatkich bo'sh qolsa ham «0 — past» chiqmaydimi;
   xizmatli sinov navbat — 1C da «Doktorga Qabul» hujjatida to'g'ri xizmat tanlanganmi.

## 7. `Info_Dev1` tekshiruvi (2026-10-03)

`Info_Dev1` bazadan yangidan olingan nusxa bo'lib chiqdi: 2–5-bandlardagi tuzatishlar unda
yo'q edi (AnalysisResult moduli hali eski navbatga yozardi, shu sababli 2 registr o'chmagan).
Ularni **`Info_Dev1` ga qayta kiritdim** — mavjud kodingizga tegmasdan, faqat kerakli joylarga
(`DynamoSyncCore` va `AnalysisResult` moduli avvalgi tekshirilgan nusxa bilan bayt-baytiga bir xil).

Qo'shimcha topilma — **`DynamoSyncBookings.PatientOf`** (sizning versiyangiz, `NameSplit` bilan):
yangi bemor yaratishda `Booking.Birthday` ga murojaat qiladi, lekin `BookingFromItem` bu maydonni
yaratmasdi → 1C «Поле объекта не обнаружено» deb yangi bemorni yaratolmasdi (jurnalda
«Yangi bemorni yaratib bo'lmadi»). `BookingFromItem` ga `Birthday` (saytdagi `patient_birth_date`dan,
yangi `BirthdayFromISO`) qo'shildi — yaratish kodi o'zgarmadi.
**Ega qarori (2026-10-03):** yangi bemor «Bemorlar» guruhiga tushsin va kartasida izoh bo'lsin.
`PatientOf` endi yangi bemorni `Parent = Catalogs.Individuals.Patients` bilan yaratadi va
`Izoh` (`Comments`, umumiy rekvizit) ga «Onlayn yuklangan» deb yozadi — saytdan yaratilgan
kartani ro'yxatda tanib olish uchun. (Faqat **yangi** yaratilgan bemorga; 1C da allaqachon
bor bemorga tegilmaydi.) Qidiruv tartibi ham ega aytganidek: **kod → `WebID` → telefon+ism**
(avval `WebID` birinchi edi; natija bir xil, kod birinchi bo'lsa bitta so'rov kam).

Hodisalar jurnalidan (bazadagi holat, 2026-10-03):
- reglament topshirig'i ishlayapti (har 10 daqiqada, 07:00–22:00); saytdan navbat olinib hujjat
  yaratilyapti («o'qildi 6, yaratildi 1»); tashrif (`dimed_visits`) yuborilyapti;
- **`DynamoIndividualsTable` konstantasi noto'g'ri** (`fdssf`): bemorlar yuborilganda
  `DynamoDB (fdssf) HTTP 400 ResourceNotFound`, navbatda 3 ta bemor qolib ketgan. To'g'risi:
  `dimed_individuals`. Tuzatgach navbatni qayta yuborish uchun `FullLoadIndividuals = ✓`
  (reglament o'zi porsiyalab yuboradi va belgini o'chiradi);
- `FullLoadIndividuals` / `FullLoadResults` hali hech qachon qo'yilmagan — eski bemor va natijalar
  saytga o'tmagan (faqat o'zgargani o'tadi). Kerak bo'lsa 1.2-bandga qarang.

## 8. Sotuv: saytdan olingan navbat asosida (2026-10-03, ega talabi)

«Doktorga Qabul» hujjatidan **«Создать на основании → Sotuv»** qilinganda:

1. **To'lov usuli** (`PaymentMethodNew`) faqat hujjatda `PrepaidAmount > 0` (onlayn oldindan
   to'langan) bo'lsa qo'yiladi (`OnlinePaymentMethod`, masalan «Payme Dimed.uz»). To'lanmagan
   navbatda (qayta ko'rik, klinikada to'lanadigan) **bo'sh qoladi** — kassir o'zi tanlaydi
   (maydon majburiy: tanlamaguncha o'tkazib bo'lmaydi).
2. **Asos** (`Sales.Base`) = «Doktorga Qabul» hujjati (avval kodda `BaseDoctorsAdmission` degan
   bo'sh o'zgaruvchiga yozilar edi — hech qayerda ishlatilmasdi). Formada «Asos» qatori (`GroupBase`)
   ko'rinadi; «olib tashlash» havolasi avvalgidek.
3. **Narx** hozircha `PrepaidAmount` dan keladi (to'lanmagan navbatda 0): tovar-xizmatlar jadvali
   **tahrirlanadi**, kassir narxni qo'yadi. (Jadval avval Asos to'lsa yopilar edi — endi faqat
   «Tovar va xizmatlar sarfi» asosidagi sotuvda yopiladi.)
4. **Maslahat varaqasi** (`PrintConsultationPaper`): Asos «Doktorga Qabul» bo'lsa «Navbat»
   qatoriga navbat raqami o'rniga hujjatdagi **navbat vaqti** (`Base.Time`, «10:00») chiqadi.
   Kassadagi oddiy sotuvda — navbat raqami avvalgidek.

**Nega qo'shimcha o'zgarishlar kerak bo'ldi.** `Sales.Base` avval faqat «Tovar va xizmatlar sarfi»
ni bildirardi va unga uch joy bog'langan edi: (a) o'tkazishda qarzni yopish
(`RegisterMutualSettlements`), (b) statsionar hisobida `Base` bo'sh bo'lmagan sotuvni hisobga
olmaslik, (c) formada jadvalni yopish. Asos «Doktorga Qabul» bo'lganda bu mantiq ishlamasligi
kerak (qarz yo'q edi — soxta yozuv chiqardi), shuning uchun uchala joy ham faqat sarf asosida
ishlaydigan qilindi: `Sales.ObjectModule.IsBasedOnExpenditure()`, `Hospitalisation` →
`MutualSettlements` formasi (`FillPayments`), `Sales.DocumentForm.SetBaseVisibile`. Sotuv nusxa
olinganda «Doktorga Qabul» asosi tozalanadi (nusxada varaqada eski navbat vaqti chiqmasin).

Tekshirish (bazani yangilagach): 1) `PrepaidAmount` to'lgan hujjatdan Sotuv — to'lov usuli «Payme»,
Asos ko'rinadi; 2) `PrepaidAmount = 0` — to'lov usuli bo'sh, narxni qo'lda qo'yib, usulni tanlab
o'tkazing; 3) «Maslahat varaqasi» — «Navbat» qatorida vaqt; 4) kassadagi oddiy sotuv — navbat
raqami, Asos qatori yo'q.

## 9. Eslatma: bemor yaratish

`DynamoSyncBookings.PatientOf` hech topilmasa **yangi bemor yaratadi**
(`Catalogs.Individuals.CreateItem`, `Parent = Patients`, `WebID`) — `docs/1c-sync.md` 6.2 dagi
«yangi karta ochilmaydi» deyilgan joy shunga moslab yangilandi. Ism har xil yozilsa
(saytda «Toirov Rozi», 1C da «Toirov Rozimuhammad») ikki nusxa bo'lishi mumkin — registrator
vaqti-vaqti bilan `WebID` to'ldirilgan, kodi yangi bemorlarni ko'rib chiqsin.
