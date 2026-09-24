import type { Context } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES } from './lib/db.ts';
import { required } from './lib/env.ts';
import { sendMessage, logToAdmin } from './lib/telegram.ts';
import { generateOtp } from './lib/session.ts';
import { mergeIndividualProfile } from './lib/patients.ts';
import { handleRatingCallback, handleRatingComment, type CallbackQuery } from './lib/ratings.ts';
import { json } from './lib/http.ts';
import { parsePhone, COUNTRY_CODE } from './lib/phone.ts';
import { loginNonceFromStart, markLoginReady, LOGIN_TTL_SECONDS } from './lib/login.ts';

const OTP_TTL_SECONDS = 5 * 60;

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; language_code?: string };
    text?: string;
    contact?: {
      phone_number: string;
      user_id?: number;
      first_name?: string;
      last_name?: string;
    };
  };
  /** Inline tugma bosildi — baho (G2). */
  callback_query?: CallbackQuery;
};

const shareContactKeyboard = {
  keyboard: [[{ text: '📱 Kontaktni ulashish', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Faqat POST' }, 405);

  /*
    Telegram webhook'ni faqat bizning secret bilan qabul qilamiz.
    trim: Netlify paneliga nusxalashda qiymat oxiriga probel yoki
    qator ilashib qolishi mumkin — bu ko'zga ko'rinmaydigan 401.
  */
  const secret = (request.headers.get('x-telegram-bot-api-secret-token') ?? '').trim();
  const expected = required('TELEGRAM_WEBHOOK_SECRET').trim();
  // Vaqtga chidamli taqqoslash (lc-results va Payme kabi): `!==` birinchi
  // farq qilgan belgida to'xtaydi va javob vaqti sirni sezdirishi mumkin.
  const given = Buffer.from(secret);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    // Netlify function logida ko'rinadi. Qiymat emas, faqat uzunlik —
    // sir oshkor bo'lmaydi, lekin qaysi tomon xato ekani darhol ayon.
    console.log(
      `telegram-webhook 401: Telegram yuborgani ${secret.length} belgi, ` +
        `Netlify'dagi ${expected.length} belgi`,
    );
    return json({ error: 'Ruxsat yo‘q' }, 401);
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return json({ error: 'JSON o‘qib bo‘lmadi' }, 400);
  }

  if (update.callback_query) {
    try {
      await handleRatingCallback(update.callback_query);
    } catch (err) {
      await logToAdmin('telegram-webhook/baho', err);
    }
    return json({ ok: true });
  }

  const message = update.message;
  if (!message) return json({ ok: true });

  try {
    if (message.contact) {
      /*
        Telegram foydalanuvchi ISTALGAN kontaktni yuborishi mumkin
        (attachment → Contact), nafaqat o'zinikini. Faqat o'z raqamini
        ulashgan bo'lsa qabul qilamiz: aks holda birov begona raqamni
        yuborib, o'sha telefon uchun kod olib, begona hisobga (va uning
        tahlil natijalariga) kira olardi. `request_contact` tugmasi
        ulashilgan kontaktning `user_id` sini yuboruvchining o'ziga teng
        qilib beradi; qo'lda tanlangan begona kontaktda esa mos kelmaydi
        yoki umuman bo'lmaydi.
      */
      const fromId = message.from?.id ?? message.chat.id;
      if (message.contact.user_id === fromId) {
        await handleContact(message.chat.id, message.contact);
      } else {
        await sendMessage(
          message.chat.id,
          'Iltimos, faqat <b>o‘zingizning</b> raqamingizni pastdagi tugma orqali ulashing.',
          shareContactKeyboard,
        );
      }
    } else if (message.text?.startsWith('/start')) {
      /*
        Kontakt bir marta so'raladi. Telefon allaqachon bog'langan
        bo'lsa — darhol yangi kod yuboriladi: har /start da tugma
        bosishga majburlash bemorni charchatadi.

        `/start kirish_<nonce>` — saytdagi "Kodni olish" havolasi. nonce
        kirish sessiyasiga bog'lanadi: telefon ma'lum bo'lsa darhol,
        aks holda kontakt ulashilgach (handleContact) yoziladi. Sayt uni
        poll qilib kod maydonini avtomatik ochadi (lib/login.ts).
      */
      const nonce = loginNonceFromStart(message.text);
      const existing = await db.send(
        new GetCommand({
          TableName: TABLES.users,
          Key: { telegram_id: String(message.chat.id) },
        }),
      );
      const user = existing.Item as { phone?: string; contact_verified_at?: string } | undefined;
      /*
        Saqlangan telefon faqat qat'iy tekshiruvdan o'tgan kontaktdan
        olingan bo'lsa ishlatiladi (`contact_verified_at`). Oldingi
        yozuvlarda chet el raqami begona O'zbek raqamiga aylangan bo'lishi
        mumkin (handleContact izohiga qarang) — bunday bemor kontaktini
        bir marta qayta ulashadi.
      */
      const phone = user?.contact_verified_at ? user.phone : undefined;

      if (phone) {
        if (nonce) await markLoginReady(nonce, phone, String(message.chat.id));
        await sendOtp(message.chat.id, phone);
      } else {
        // Telefon hali yo'q: nonce'ni eslab qolamiz — kontakt kelgach
        // shu kirish sessiyasi "ready" bo'ladi.
        if (nonce) {
          await db.send(
            new UpdateCommand({
              TableName: TABLES.users,
              Key: { telegram_id: String(message.chat.id) },
              UpdateExpression: 'SET pending_login_nonce = :n, pending_login_at = :t',
              ExpressionAttributeValues: {
                ':n': nonce,
                ':t': Math.floor(Date.now() / 1000),
              },
            }),
          );
        }
        await sendMessage(
          message.chat.id,
          user?.phone
            ? 'Xavfsizlik uchun raqamingizni bir marta qayta tasdiqlang — ' +
                'pastdagi tugma orqali kontaktingizni ulashing.'
            : 'Assalomu alaykum! <b>Dimed</b> klinikasiga xush kelibsiz.\n\n' +
                'Saytga kirish uchun pastdagi tugma orqali kontaktingizni ulashing.',
          shareContactKeyboard,
        );
      }
    } else if (message.text === '/help') {
      await sendMessage(
        message.chat.id,
        'Buyruqlar:\n/start — kirish kodini olish\n\n' +
          'Savollar uchun: +998 55 9009 103',
      );
    } else if (message.text && !message.text.startsWith('/')) {
      // Baho qo'yilgach yozilgan matn — o'sha bahoga izoh (G2).
      await handleRatingComment(
        message.chat.id,
        String(message.from?.id ?? message.chat.id),
        message.text,
        message.from?.language_code,
      );
    }
  } catch (err) {
    await logToAdmin('telegram-webhook', err);
    // Telegram qayta yubormasligi uchun 200 qaytaramiz.
  }

  return json({ ok: true });
};

/**
 * Telegram kontaktidagi raqam — faqat to'liq O'zbekiston raqami
 * (998 + 9 xona); boshqasi — null.
 *
 * Telegram raqamni doim mamlakat kodi bilan yuboradi. Avval tanilmagan
 * raqam "tuzatib" olinardi (`normalizePhone`: oxirgi 9 xona + 998):
 * +7 999 123 45 67 → +998 99 123 45 67 — bu boshqa, begona odamning
 * raqami. Chet el raqamli foydalanuvchi o'sha bemor uchun kod olib, uning
 * hisobiga va tahlil natijalariga kirib qolardi. 9 xonali chet el
 * raqamlari esa hatto `parsePhone` dan ham o'tadi — shuning uchun
 * mamlakat kodi aniq talab qilinadi.
 */
function uzPhoneFromContact(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== COUNTRY_CODE.length + 9 || !digits.startsWith(COUNTRY_CODE)) return null;
  const checked = parsePhone(digits);
  return checked.ok ? checked.value : null;
}

async function handleContact(
  chatId: number,
  contact: NonNullable<NonNullable<TelegramUpdate['message']>['contact']>,
): Promise<void> {
  const phone = uzPhoneFromContact(contact.phone_number);
  if (!phone) {
    /*
      Oldingi kod shu hisobga chet el raqamidan "yasalgan" begona O'zbek
      raqamini yozgan bo'lishi mumkin — endi bu ma'lum bo'ldi, uni olib
      tashlaymiz: aks holda o'sha bemorning natija xabarlari (va ulashish
      havolalari) bu hisobga ketaverardi. Yozuv yo'q bo'lsa — yaratilmaydi.
    */
    await db
      .send(
        new UpdateCommand({
          TableName: TABLES.users,
          Key: { telegram_id: String(chatId) },
          UpdateExpression: 'REMOVE phone, contact_verified_at',
          ConditionExpression: 'attribute_exists(telegram_id)',
        }),
      )
      .catch((err) => {
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
      });
    await sendMessage(
      chatId,
      'Kechirasiz, saytga faqat O‘zbekiston raqami (+998) bilan kirish mumkin.\n\n' +
        'Savollar uchun: +998 55 9009 103',
      { remove_keyboard: true },
    );
    return;
  }
  const firstName = contact.first_name ?? '';
  const lastName = contact.last_name ?? '';
  const fullName = [lastName, firstName].filter(Boolean).join(' ');
  const now = new Date().toISOString();

  /*
    Put emas, Update: bemor qayta /start bosganda 1C sinxronlagan
    profil maydonlari (code, birth_date, gender, ...) o'chib ketmasligi
    kerak — faqat Telegram bergan maydonlarni yangilaymiz.
    `name` DynamoDB'da band so'z, shuning uchun taxallus bilan.

    `telegram_name` — Telegram bergan ism o'zgarishsiz saqlanadigan
    yagona joy: qolgan ism maydonlarini 1C profili qayta yozadi. U
    bir telefon ostidagi oila a'zolaridan kimligini aniqlashga kerak.
  */
  const updated = await db.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { telegram_id: String(chatId) },
      UpdateExpression:
        'SET phone = :p, first_name = :f, last_name = :l, full_name = :fn, ' +
        // contact_verified_at — telefon qat'iy tekshirilgan kontaktdan
        // olingani; /start faqat shunday telefonga kod yuboradi.
        '#name = :n, telegram_name = :tn, updated_at = :u, contact_verified_at = :u ' +
        // Kutayotgan kirish nonce'si bo'lsa — bir yo'la iste'mol qilamiz.
        'REMOVE pending_login_nonce, pending_login_at',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: {
        ':p': phone,
        ':f': firstName,
        ':l': lastName,
        ':fn': fullName,
        ':n': firstName,
        ':tn': fullName || firstName,
        ':u': now,
      },
      // Eski qiymatlar — "Kodni olish" orqali kelgan nonce shu yerda.
      ReturnValues: 'ALL_OLD',
    }),
  );

  /*
    Bemor "Kodni olish" havolasi orqali kelib, endi kontakt ulashdi.
    Kirish sessiyasini "ready" qilamiz — sayt poll qilib kod maydonini
    ochadi. Eskirgan nonce (10 daqiqadan oshgan) e'tiborga olinmaydi.
  */
  const old = updated.Attributes as { pending_login_nonce?: string; pending_login_at?: number } | undefined;
  const pendingNonce = old?.pending_login_nonce;
  const pendingAt = Number(old?.pending_login_at ?? 0);
  if (pendingNonce && Math.floor(Date.now() / 1000) - pendingAt < LOGIN_TTL_SECONDS) {
    await markLoginReady(pendingNonce, phone, String(chatId));
  }

  /*
    1C bemorlar jadvalida bo'lsa, F.I.Sh. va kodini shu yerda olamiz.
    Bu qulaylik, kirish sharti emas — 1C jadvali hali bo'lmasa yoki
    bemor unda topilmasa, kirish baribir davom etadi.
  */
  await mergeIndividualProfile(phone, String(chatId)).catch((err) =>
    logToAdmin('telegram-webhook/1c-profil', err),
  );

  await sendOtp(chatId, phone);
}

/** Yangi kirish kodi yasab yuboradi. */
async function sendOtp(chatId: number, phone: string): Promise<void> {
  const code = generateOtp();
  await db.send(
    new PutCommand({
      TableName: TABLES.otpCodes,
      Item: {
        phone,
        code,
        telegram_id: String(chatId),
        // DynamoDB TTL: yaroqsiz kodlar o'zi o'chib ketadi.
        expires_at: Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS,
      },
    }),
  );

  // <code> — Telegram'da bosilsa nusxalanadi.
  await sendMessage(
    chatId,
    `Saytga kirish kodingiz:\n\n<code>${code}</code>\n\n` +
      'Kod ustiga bossangiz — nusxalanadi. 5 daqiqa amal qiladi, hech kimga bermang.',
    { remove_keyboard: true },
  );
}
