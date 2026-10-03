import { required, optional } from './env.ts';

/**
 * Xabar ostidagi tugma: `callback_data` — bosilsa `callback_query` keladi
 * (baho so'rovi), `url` — havolani ochadi, `copy_text` — matnni bir
 * bosishda nusxalaydi (kirish kodi uchun).
 */
export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }
  | { text: string; copy_text: { text: string } };

export type ReplyMarkup = {
  keyboard?: { text: string; request_contact?: boolean }[][];
  /** Xabar ostidagi tugmalar (baho so'rovi, G2; kirish havolasi). */
  inline_keyboard?: InlineButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  remove_keyboard?: boolean;
};

async function callBot(token: string, method: string, payload: unknown): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Telegram `ok: false` qaytargan xato. `status` bo'yicha xato vaqtinchalikmi
 * (kalit almashtirilmoqda, Telegram band) yoki doimiymi (bemor botni
 * bloklagan) ajratiladi — qarang `isTransientTelegramError`.
 */
export class TelegramError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`Telegram sendMessage muvaffaqiyatsiz (${status}): ${body}`);
    this.status = status;
  }
}

/**
 * Xabar yetmay qolgani keyinroq urinsa tuzaladimi?
 *
 * Ha: tarmoq xatosi, 401 (kalit yaroqsiz — almashtirilgach ishlaydi),
 * 408, 429 va 5xx. Yo'q: 400/403 — bemor botni bloklagan yoki chat yo'q,
 * qayta urinish foydasiz va log-botni to'ldiradi.
 *
 * Cron'lar shunga qarab "yuborildi" belgisini qaytaradi: aks holda kalit
 * buzilgan paytdagi hamma eslatma va natija xabarlari jimgina yo'qolardi.
 */
export function isTransientTelegramError(err: unknown): boolean {
  if (!(err instanceof TelegramError)) return true;
  return err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500;
}

/** Bemorga xabar yuborish (asosiy bot). */
export async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  const res = await callBot(required('TELEGRAM_BOT_TOKEN'), 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });

  if (!res.ok) {
    throw new TelegramError(res.status, await res.text());
  }
}

/**
 * Inline tugma bosilganiga javob: Telegram tugma ustidagi "soat"ni
 * to'xtatadi, `text` bo'lsa kichik bildirishnoma ko'rsatadi.
 * Javob kechiksa Telegram uni rad etadi — bu asosiy ishni buzmasin.
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await callBot(required('TELEGRAM_BOT_TOKEN'), 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  } catch (err) {
    console.error('[answerCallbackQuery]', err);
  }
}

/** Yuborilgan xabar ostidagi tugmalarni almashtiradi (yoki olib tashlaydi). */
export async function editMessageReplyMarkup(
  chatId: number | string,
  messageId: number,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  try {
    await callBot(required('TELEGRAM_BOT_TOKEN'), 'editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    });
  } catch (err) {
    console.error('[editMessageReplyMarkup]', err);
  }
}

/**
 * Xatolikni admin log-botga yuboradi. Log yuborishning o'zi ham
 * yiqilsa, asosiy so'rovni buzmaslik uchun faqat konsolga yoziladi.
 */
export async function logToAdmin(context: string, error: unknown): Promise<void> {
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error(`[${context}]`, detail);

  const token = optional('TELEGRAM_LOG_BOT_TOKEN');
  const chatId = optional('TELEGRAM_LOG_CHAT_ID');
  if (!token || !chatId) return;

  try {
    await callBot(token, 'sendMessage', {
      chat_id: chatId,
      // Avval kesiladi, keyin ekranlanadi: aksincha bo'lsa kesish "&amp;"
      // ni o'rtasidan bo'lib, Telegram butun xabarni rad etardi.
      text: `🚨 <b>${escapeHtml(context)}</b>\n<pre>${escapeHtml(detail.slice(0, 3500))}</pre>`,
      parse_mode: 'HTML',
    });
  } catch (sendError) {
    console.error('[log-bot yuborilmadi]', sendError);
  }
}

/**
 * Telegram HTML rejimi (`parse_mode: 'HTML'`) uchun matnni ekranlaydi.
 *
 * Xabarga qo'yiladigan har bir o'zgaruvchi qiymat (bemor yoki shifokor
 * ismi, tahlil nomi, sabab matni) shundan o'tishi kerak: `<` yoki `&`
 * bo'lsa Telegram xabarni butunlay rad etadi ("can't parse entities") va
 * bemor xabarsiz qoladi; `<a href>` kabi teg esa begona havolani xabar
 * ichiga yashirib qo'yardi.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
