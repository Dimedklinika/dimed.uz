import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLES, queryAllPages } from './db.ts';
import { logToAdmin } from './telegram.ts';
import { phoneVariants } from './phone.ts';

/**
 * 1C `individuals` jadvalidagi bemor profili. 1C o'zi yozadi:
 * kalit — telefon (+998...) va sort_key = 1C bemor kodi, maydonlar
 * inglizcha (Surname, Name, ...). Bu yerda o'qib, saytning
 * snake_case nomlariga o'giramiz.
 */
type IndividualRecord = {
  phone?: string;
  sort_key?: string;
  Code?: string;
  Surname?: string;
  Name?: string;
  Patronymic?: string;
  FullName?: string;
  IsMale?: boolean;
  Birthday?: string;
  Email?: string;
  PriceCategory?: string;
  BirthArea?: string;
  ResidenceArea?: string;
  Address?: string;
  WhereHeard?: string;
  /* 1C bemorni o'chirishga belgilasa — profil sifatida olinmaydi. */
  DeletionMark?: boolean;
};

/** 25.04.1990 yoki 1990-04-25(T…) → 1990-04-25. Boshqasi — o'zgarishsiz. */
export const normalizeBirthday = (raw: string): string => {
  const dmy = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? raw;
};

const MIN_BIRTH_YEAR = 1900;

/**
 * Tug'ilgan sanani tekshiradi (B1): YYYY-MM-DD, haqiqiy kun (30-fevral
 * emas), 1900 dan bugungacha. Bemor yozuviga faqat shu ko'rinishda yoziladi.
 */
export function checkBirthDate(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === 'string' ? normalizeBirthday(raw.trim()) : '';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { ok: false, error: 'Tug‘ilgan sana kerak (YYYY-MM-DD)' };

  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  if (!real || y < MIN_BIRTH_YEAR || date.getTime() > Date.now()) {
    return { ok: false, error: 'Tug‘ilgan sana noto‘g‘ri' };
  }
  return { ok: true, value };
}

/*
  1C bemor kodini son sifatida saqlaydi, matnga o'girganda esa guruh
  ajratkichi qo'shilib qolishi mumkin: "10 482". Kod — identifikator,
  bo'shliqsiz saqlanadi, aks holda bitta bemor ikki xil kod bilan
  ko'rinadi.
*/
const normalizeCode = (raw: string): string => raw.replace(/\s+/g, '');

/** Ismlarni taqqoslash uchun: kichik harf, faqat harf va raqam. */
const nameKey = (raw: string): string => raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Bir telefon ostidagi bemorlardan Telegram egasiga mos kelganini tanlaydi.
 *
 * Oila bitta raqamdan foydalanadi (ota-ona bolasini yozdiradi), shuning
 * uchun "birinchisini ol" qoidasi noto'g'ri odamni tanlab qo'yishi mumkin
 * edi. Telegram bergan ism bilan solishtiramiz; hech biri mos kelmasa —
 * birinchisi (eng kichik kodli, odatda eng eski yozuv).
 */
async function pickForTelegram(
  first: IndividualRecord,
  rest: IndividualRecord[],
  telegramId: string,
): Promise<IndividualRecord> {
  const user = await db
    .send(new GetCommand({ TableName: TABLES.users, Key: { telegram_id: telegramId } }))
    .catch(() => undefined);
  const record = user?.Item as { telegram_name?: string; name?: string } | undefined;

  const wanted = new Set(
    (record?.telegram_name ?? record?.name ?? '')
      .split(/\s+/)
      .map(nameKey)
      .filter(Boolean),
  );
  if (wanted.size === 0) return first;

  let best = first;
  let bestScore = 0;
  for (const one of [first, ...rest]) {
    const own = [one.Surname, one.Name, one.Patronymic, ...(one.FullName ?? '').split(/\s+/)]
      .filter((v): v is string => Boolean(v))
      .map(nameKey)
      .filter(Boolean);
    const score = new Set(own.filter((token) => wanted.has(token))).size;
    if (score > bestScore) {
      best = one;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 1C profilini bemorning `users` yozuviga birlashtiradi.
 *
 * Topilmasa jimgina chiqadi: 1C hali bu bemorni yubormagan. Xato
 * yuqoriga otiladi — ushlash chaqiruvchining zimmasida, kirish oqimi
 * bu sababdan to'xtamasligi kerak.
 */
export async function mergeIndividualProfile(phone: string, telegramId: string): Promise<boolean> {
  /*
    Bir telefon ostida bir nechta bemor bo'lishi mumkin (oila bitta
    raqamdan foydalanadi). Hammasi o'qiladi va Telegram egasiga mos
    kelgani tanlanadi — chegara oilaga yetarli.
  */
  const [first, ...rest] = (await readIndividuals(phone)).filter(
    (one) => one.DeletionMark !== true,
  );
  if (!first) return false;

  const individual = rest.length === 0 ? first : await pickForTelegram(first, rest, telegramId);

  const profile: Record<string, string> = {};
  // sort_key — 1C bemor kodi. Eski "PROFILE" yozuvlari kod emas.
  const raw = individual.sort_key !== 'PROFILE' ? individual.sort_key : individual.Code;
  const code = raw ? normalizeCode(raw) : '';
  if (code) profile.code = code;
  if (individual.Surname) profile.last_name = individual.Surname;
  if (individual.Name) profile.first_name = individual.Name;
  if (individual.Patronymic) profile.patronymic = individual.Patronymic;
  if (individual.FullName) profile.full_name = individual.FullName;
  if (typeof individual.IsMale === 'boolean') profile.gender = individual.IsMale ? 'male' : 'female';
  if (individual.Birthday) profile.birth_date = normalizeBirthday(individual.Birthday);
  if (individual.Email) profile.email = individual.Email;
  if (individual.PriceCategory) profile.price_category = individual.PriceCategory;
  if (individual.Address) profile.address = individual.Address;
  if (Object.keys(profile).length === 0) return false;

  const names: Record<string, string> = { '#upd': 'synced_1c_at' };
  const values: Record<string, string> = { ':upd': new Date().toISOString() };
  const sets = Object.entries(profile).map(([field, value], i) => {
    names[`#f${i}`] = field;
    values[`:v${i}`] = value;
    return `#f${i} = :v${i}`;
  });

  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression: `SET ${sets.join(', ')}, #upd = :upd`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
  return true;
}

/**
 * Bemorni tanlash uchun variant.
 *
 * `id` — 1C bemor kodi yoki saytda qo'shilgan yozuvning `local-…`
 * identifikatori. Saytdagi hamma joyda shu id bilan ishlanadi.
 */
export type PatientOption = {
  id: string;
  name: string;
  source: '1c' | 'local';
  /** YYYY-MM-DD; bron uchun majburiy (B1). Yo'q bo'lsa avval so'raladi. */
  birthDate: string | null;
};

/** Saytda qo'lda qo'shilgan oila a'zosi (dimed_users ichida saqlanadi). */
type LocalPatient = {
  id: string;
  first_name: string;
  last_name: string;
  patronymic?: string;
  birth_date?: string;
};

type UserRecord = {
  patients?: LocalPatient[];
  active_patient_id?: string;
  telegram_name?: string;
  name?: string;
  /*
    1C bemorida Birthday bo'lmasa, saytda kiritilgani shu yerda turadi
    (1C jadvaliga sayt yozmaydi). Kalit — 1C bemor kodi.
  */
  birth_dates?: Record<string, string>;
};

/** "Familiya Ism Sharif" — bo'sh bo'laklarsiz. */
const fullNameOf = (p: {
  last_name?: string;
  first_name?: string;
  patronymic?: string;
}): string => [p.last_name, p.first_name, p.patronymic].filter(Boolean).join(' ');

const readUser = async (telegramId: string): Promise<UserRecord> => {
  const found = await db.send(
    new GetCommand({ TableName: TABLES.users, Key: { telegram_id: telegramId } }),
  );
  return (found.Item ?? {}) as UserRecord;
};

/**
 * 1C yozuvlarini oxirigacha o'qiydi.
 *
 * Avval `Limit: 25` turardi va sahifalash yo'q edi: bir telefon ostida
 * 25 tadan ko'p yozuv bo'lsa (1C bitta odamga bir necha marta yozgan
 * bo'lishi mumkin) oilaning bir qismi jimgina yo'qolardi.
 *
 * Xato bo'lsa ham kirish va bron to'xtamaydi — lekin endi jim emas:
 * sabab log-botga boradi, aks holda "hamma ko'rinmayapti" ni
 * tekshirib bo'lmaydi.
 */
async function readIndividuals(phone: string): Promise<IndividualRecord[]> {
  const read = (key: string) =>
    queryAllPages({
      TableName: TABLES.individuals,
      KeyConditionExpression: 'phone = :p',
      ExpressionAttributeValues: { ':p': key },
    }) as Promise<IndividualRecord[]>;

  try {
    const rows = await read(phone);
    /*
      1C kalitni satr sifatida yozadi: "+998901234567" va "998901234567"
      ikki xil bemor bo'lib qoladi. Asosiy kalit bo'yicha topilmasa,
      boshqa yozilishlarini ham qaraymiz — aks holda bemor o'z
      oilasini ko'rmaydi. Topilsa qo'shimcha so'rov bo'lmaydi.
    */
    if (rows.length) return rows;

    const others = phoneVariants(phone).filter((v) => v !== phone);
    const extra = await Promise.all(others.map((key) => read(key).catch(() => [])));
    const found = extra.flat();
    if (found.length) {
      await logToAdmin(
        'patients/1c-telefon-formati',
        new Error(`${phone} uchun yozuvlar boshqa formatdagi kalitda topildi — 1C "+998…" yozishi kerak`),
      );
    }
    return found;
  } catch (err) {
    await logToAdmin('patients/1c-royxat', err);
    return [];
  }
}

/**
 * Bir odam ikki marta chiqmasin: bir xil id, yoki eski "PROFILE"
 * yozuvi kodli yozuv bilan bir xil ismda bo'lsa — biri qoladi.
 */
function dedupe(list: PatientOption[]): PatientOption[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const out: PatientOption[] = [];

  // Kodli yozuvlar oldin: "PROFILE" faqat o'zi yolg'iz bo'lsa qoladi.
  for (const one of [...list].sort((a, b) => Number(a.id === 'PROFILE') - Number(b.id === 'PROFILE'))) {
    const nameKey = one.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenIds.has(one.id) || (one.id === 'PROFILE' && seenNames.has(nameKey))) continue;
    seenIds.add(one.id);
    seenNames.add(nameKey);
    out.push(one);
  }
  return out;
}

/**
 * Telefonga bog'langan bemorlar ro'yxati.
 *
 * Ikki manba qo'shiladi: 1C katalogidagi (klinikada ro'yxatdan o'tgan)
 * va saytning o'zida qo'shilgan oila a'zolari. Bemor qaysi biri
 * ekanini o'zi tanlaydi — bir raqamdan butun oila foydalanadi.
 */
export async function listPatients(
  phone: string,
  telegramId: string,
): Promise<{ patients: PatientOption[]; activeId: string | null }> {
  const [rows, user] = await Promise.all([readIndividuals(phone), readUser(telegramId)]);

  const overrides = user.birth_dates ?? {};

  const fromOneC = rows
    .filter((one) => one.DeletionMark !== true)
    .map((one) => {
      /*
        Yozuv kaliti — 1C bemor kodi. Eski yozuvlarda u "PROFILE" bo'lib,
        kod alohida maydonda turadi. Ikkalasi ham bo'lmasa yozuvni
        tashlab yubormaymiz: sort_key o'zi ham telefon ichida yagona,
        ya'ni identifikator sifatida yetadi — aks holda bunday oila
        a'zosi ro'yxatdan butunlay yo'qolardi.
      */
      const code = one.sort_key !== 'PROFILE' ? one.sort_key : one.Code;
      const id = normalizeCode(code || one.sort_key || '');
      const fromOneCBirthday = one.Birthday ? checkBirthDate(one.Birthday) : null;
      return {
        id,
        name:
          one.FullName?.trim() ||
          fullNameOf({
            last_name: one.Surname,
            first_name: one.Name,
            patronymic: one.Patronymic,
          }),
        source: '1c' as const,
        // 1C bergan sana ustun; bo'lmasa saytda kiritilgani.
        birthDate: fromOneCBirthday?.ok ? fromOneCBirthday.value : (overrides[id] ?? null),
      };
    })
    .filter((one) => one.id && one.name);

  const local = (user.patients ?? []).map((p) => ({
    id: p.id,
    name: fullNameOf(p),
    source: 'local' as const,
    birthDate: p.birth_date ?? null,
  }));

  const patients = dedupe([...fromOneC, ...local]);
  const activeId =
    user.active_patient_id && patients.some((p) => p.id === user.active_patient_id)
      ? user.active_patient_id
      : null;

  return { patients, activeId };
}

/** Ro'yxatdagi bitta bemor. Topilmasa — null. */
export async function findPatient(
  phone: string,
  telegramId: string,
  id: string,
): Promise<PatientOption | null> {
  const { patients } = await listPatients(phone, telegramId);
  return patients.find((p) => p.id === id) ?? null;
}

/** Ism-familiyani tozalaydi: ortiqcha bo'shliqlarsiz, uzunligi cheklangan. */
const cleanName = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, 60) : '';

/**
 * Saytda yangi oila a'zosini qo'shadi.
 *
 * Klinikada hali ro'yxatdan o'tmagan odam uchun (yangi tug'ilgan bola,
 * qarindosh). 1C keyinchalik o'z kodi bilan yozsa — ikkalasi yonma-yon
 * turadi, tanlashda chalkashlik bo'lmasin deb ism to'liq ko'rsatiladi.
 */
export async function addLocalPatient(
  telegramId: string,
  input: { firstName: unknown; lastName: unknown; patronymic?: unknown; birthDate?: unknown },
): Promise<PatientOption | { error: string }> {
  const first_name = cleanName(input.firstName);
  const last_name = cleanName(input.lastName);
  const patronymic = cleanName(input.patronymic);

  if (!first_name || !last_name) return { error: 'Ism va familiya kerak' };

  // Tug'ilgan sana majburiy (B1): shifokor va laboratoriya uchun kerak.
  const birth = checkBirthDate(input.birthDate);
  if (!birth.ok) return { error: birth.error };

  const user = await readUser(telegramId);
  if ((user.patients ?? []).length >= 20) {
    return { error: 'Juda ko‘p odam qo‘shilgan — klinikaga murojaat qiling' };
  }

  const patient: LocalPatient = {
    id: `local-${crypto.randomUUID().slice(0, 8)}`,
    first_name,
    last_name,
    ...(patronymic ? { patronymic } : {}),
    birth_date: birth.value,
  };

  /*
    list_append + if_not_exists: ro'yxat hali yo'q bo'lsa bo'shdan
    boshlanadi. Butun ro'yxatni qayta yozmaymiz — ikki qurilmadan
    bir vaqtda qo'shilsa ham biri yo'qolmaydi.
  */
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression:
        'SET #p = list_append(if_not_exists(#p, :empty), :new), active_patient_id = :id',
      ExpressionAttributeNames: { '#p': 'patients' },
      ExpressionAttributeValues: { ':empty': [], ':new': [patient], ':id': patient.id },
    }),
  );

  return { id: patient.id, name: fullNameOf(patient), source: 'local', birthDate: birth.value };
}

/**
 * Mavjud bemorga tug'ilgan sana kiritadi (B1).
 *
 * Saytda qo'shilgan bemorda — ro'yxatdagi yozuvning o'zi yangilanadi;
 * 1C bemorida — `birth_dates` xaritasiga yoziladi (1C jadvaliga sayt
 * yozmaydi; 1C keyin Birthday yuborsa, u ustun bo'ladi). Bemor
 * topilmasa — null.
 */
export async function setPatientBirthDate(
  phone: string,
  telegramId: string,
  id: string,
  birthDate: string,
): Promise<PatientOption | null> {
  const { patients } = await listPatients(phone, telegramId);
  const patient = patients.find((p) => p.id === id);
  if (!patient) return null;

  const user = await readUser(telegramId);

  if (patient.source === 'local') {
    const list = (user.patients ?? []).map((p) => (p.id === id ? { ...p, birth_date: birthDate } : p));
    await db.send(
      new UpdateCommand({
        TableName: TABLES.users,
        Key: { telegram_id: telegramId },
        UpdateExpression: 'SET #p = :list',
        ExpressionAttributeNames: { '#p': 'patients' },
        ExpressionAttributeValues: { ':list': list },
      }),
    );
  } else {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.users,
        Key: { telegram_id: telegramId },
        UpdateExpression: 'SET birth_dates = :map',
        ExpressionAttributeValues: { ':map': { ...(user.birth_dates ?? {}), [id]: birthDate } },
      }),
    );
  }

  return { ...patient, birthDate };
}

/** Tanlangan bemorni eslab qoladi (kabinet va bron shu bo'yicha ishlaydi). */
export async function selectPatient(telegramId: string, id: string): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression: 'SET active_patient_id = :id',
      ExpressionAttributeValues: { ':id': id },
    }),
  );
}

/**
 * Saytda qo'shilgan oila a'zosining ma'lumotini tuzatadi (noto'g'ri yozilgan
 * ism yoki sana). 1C bemorlari bu yerdan o'zgarmaydi — ularning ismi 1C da
 * yuritiladi (faqat tug'ilgan sanani `setPatientBirthDate` to'ldiradi).
 *
 * Qaytadi: yangilangan bemor; topilmasa `null`; 1C bemori bo'lsa yoki
 * ma'lumot yaroqsiz bo'lsa — `{ error }`.
 */
export async function editLocalPatient(
  telegramId: string,
  id: string,
  input: { firstName: unknown; lastName: unknown; patronymic?: unknown; birthDate?: unknown },
): Promise<PatientOption | { error: string } | null> {
  const user = await readUser(telegramId);
  const existing = (user.patients ?? []).find((p) => p.id === id);
  if (!existing) return null;

  const first_name = cleanName(input.firstName);
  const last_name = cleanName(input.lastName);
  const patronymic = cleanName(input.patronymic);
  if (!first_name || !last_name) return { error: 'Ism va familiya kerak' };

  const birth = checkBirthDate(input.birthDate);
  if (!birth.ok) return { error: birth.error };

  const updated: LocalPatient = {
    id,
    first_name,
    last_name,
    ...(patronymic ? { patronymic } : {}),
    birth_date: birth.value,
  };
  const list = (user.patients ?? []).map((p) => (p.id === id ? updated : p));
  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression: 'SET #p = :list',
      ExpressionAttributeNames: { '#p': 'patients' },
      ExpressionAttributeValues: { ':list': list },
    }),
  );

  return { id, name: fullNameOf(updated), source: 'local', birthDate: birth.value };
}

/**
 * Saytda xato qo'shilgan oila a'zosini ro'yxatdan olib tashlaydi.
 * Oldingi navbatlarda ism nusxasi qoladi (tarix buzilmaydi). Tanlangan
 * bemor shu bo'lsa — tanlov tozalanadi. 1C bemorini o'chirib bo'lmaydi.
 */
export async function removeLocalPatient(telegramId: string, id: string): Promise<boolean> {
  const user = await readUser(telegramId);
  const list = user.patients ?? [];
  if (!list.some((p) => p.id === id)) return false;

  await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: telegramId },
      UpdateExpression:
        user.active_patient_id === id ? 'SET #p = :list REMOVE active_patient_id' : 'SET #p = :list',
      ExpressionAttributeNames: { '#p': 'patients' },
      ExpressionAttributeValues: { ':list': list.filter((p) => p.id !== id) },
    }),
  );
  return true;
}
