import type { Context } from '@netlify/functions';
import { timingSafeEqual } from 'node:crypto';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { db, TABLES, scanAllPages } from './lib/db.ts';
import { optional } from './lib/env.ts';
import { toTiyin } from './lib/payment.ts';
import { doctorDayKey } from './lib/slots.ts';
import { getDoctor } from './lib/auth.ts';
import { sendMessage, logToAdmin, escapeHtml } from './lib/telegram.ts';
import { json } from './lib/http.ts';

/**
 * Payme Merchant API (JSON-RPC 2.0). Payme serveri to'lov jarayonida
 * shu endpoint'ni o'zi chaqiradi:
 *
 *   CheckPerformTransaction -> CreateTransaction -> PerformTransaction
 *   (bekor bo'lsa: CancelTransaction; holat so'rovi: CheckTransaction)
 *
 * Hisob maydoni — ac.order_id — bizning payments jadvalidagi
 * payment_id. Payme tranzaksiyasi alohida yozuvda saqlanadi
 * (payment_id = "payme#<id>"), chunki Perform/Cancel/Check so'rovlari
 * faqat Payme'ning o'z id sini beradi.
 *
 * Protokol talabi: javob HAR DOIM HTTP 200, xato JSON ichida bo'ladi.
 * Batafsil: docs/payme-integration.md
 */

/** To'lanmagan tranzaksiya shu vaqtdan keyin o'z-o'zidan bekor bo'ladi. */
const TX_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Payme holatlari: 1 yaratildi, 2 to'landi, -1/-2 bekor qilindi. */
type PaymeTx = {
  payment_id: string;
  ref: string;
  state: 1 | 2 | -1 | -2;
  create_time: number;
  created_at_ms: number;
  perform_time?: number;
  cancel_time?: number;
  reason?: number;
};

type Order = {
  payment_id: string;
  phone: string;
  doctor_id: string;
  date: string;
  time: string;
  amount: number;
  mode: string;
  status: string;
  payme_id?: string;
};

type RpcRequest = {
  id?: number | string | null;
  method?: string;
  params?: {
    id?: string;
    time?: number;
    amount?: number;
    reason?: number;
    from?: number;
    to?: number;
    account?: { order_id?: string };
  };
};

const msg = (uz: string, ru: string, en: string) => ({ uz, ru, en });

const rpcResult = (id: RpcRequest['id'], result: unknown): Response =>
  json({ jsonrpc: '2.0', id: id ?? null, result });

const rpcError = (
  id: RpcRequest['id'],
  code: number,
  message: ReturnType<typeof msg>,
  data?: string,
): Response =>
  json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });

const txKey = (paymeId: string) => `payme#${paymeId}`;

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Faqat POST' }, 405);

  if (!authorized(request)) {
    return rpcError(null, -32504, msg('Ruxsat yo‘q', 'Доступ запрещён', 'Access denied'));
  }

  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, msg('JSON o‘qib bo‘lmadi', 'Ошибка парсинга JSON', 'Parse error'));
  }

  const { id, method, params = {} } = body;

  try {
    switch (method) {
      case 'CheckPerformTransaction':
        return await checkPerform(id, params);
      case 'CreateTransaction':
        return await createTx(id, params);
      case 'PerformTransaction':
        return await performTx(id, params);
      case 'CancelTransaction':
        return await cancelTx(id, params);
      case 'CheckTransaction':
        return await checkTx(id, params);
      case 'GetStatement':
        return await statement(id, params);
      default:
        return rpcError(id, -32601, msg('Metod topilmadi', 'Метод не найден', 'Method not found'));
    }
  } catch (err) {
    await logToAdmin('payment-webhook', err);
    return rpcError(id, -32400, msg('Ichki xatolik', 'Внутренняя ошибка', 'Internal error'));
  }
};

/**
 * Payme "Basic base64(Paycom:KEY)" bilan keladi. Sinov kassasi alohida
 * kalit ishlatadi, shuning uchun ikkala kalit ham qabul qilinadi.
 */
function authorized(request: Request): boolean {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;

  const given = Buffer.from(header.slice(6), 'base64');
  return [optional('PAYME_KEY'), optional('PAYME_TEST_KEY')]
    .filter(Boolean)
    .some((key) => {
      const expected = Buffer.from(`Paycom:${key}`);
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

async function getOrder(orderId: string | undefined): Promise<Order | null> {
  if (!orderId || orderId.startsWith('payme#')) return null;
  const found = await db.send(
    new GetCommand({ TableName: TABLES.payments, Key: { payment_id: orderId } }),
  );
  return (found.Item as Order | undefined) ?? null;
}

async function getTx(paymeId: string | undefined): Promise<PaymeTx | null> {
  if (!paymeId) return null;
  const found = await db.send(
    new GetCommand({ TableName: TABLES.payments, Key: { payment_id: txKey(paymeId) } }),
  );
  return (found.Item as PaymeTx | undefined) ?? null;
}

/** Buyurtma to'lovga yaroqliligini tekshiradi; xato bo'lsa Response qaytaradi. */
async function validateOrder(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<{ order: Order } | { fail: Response }> {
  const order = await getOrder(params.account?.order_id);

  if (!order || order.mode !== 'online') {
    return {
      fail: rpcError(
        id, -31050,
        msg('Buyurtma topilmadi', 'Заказ не найден', 'Order not found'),
        'order_id',
      ),
    };
  }
  if (order.status !== 'pending') {
    return {
      fail: rpcError(
        id, -31051,
        msg('Buyurtma allaqachon yakunlangan', 'Заказ уже завершён', 'Order already finished'),
        'order_id',
      ),
    };
  }
  if (params.amount !== toTiyin(order.amount)) {
    return {
      fail: rpcError(id, -31001, msg('Summa noto‘g‘ri', 'Неверная сумма', 'Wrong amount')),
    };
  }
  return { order };
}

async function checkPerform(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<Response> {
  const checked = await validateOrder(id, params);
  if ('fail' in checked) return checked.fail;
  return rpcResult(id, { allow: true });
}

async function createTx(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<Response> {
  const existing = await getTx(params.id);

  // Payme so'rovni takrorlashi mumkin — bir xil javob qaytariladi.
  if (existing) {
    if (existing.state !== 1) {
      return rpcError(id, -31008, msg(
        'Tranzaksiya bekor qilingan', 'Транзакция отменена', 'Transaction cancelled',
      ));
    }
    if (await expireIfTimedOut(existing)) {
      return rpcError(id, -31008, msg(
        'Tranzaksiya muddati o‘tgan', 'Время транзакции истекло', 'Transaction timed out',
      ));
    }
    return rpcResult(id, {
      create_time: existing.create_time,
      transaction: existing.ref,
      state: 1,
    });
  }

  const checked = await validateOrder(id, params);
  if ('fail' in checked) return checked.fail;
  const { order } = checked;

  /*
    Bitta buyurtmaga bitta faol tranzaksiya: buyurtmaga payme_id ni
    atomik bog'laymiz. Boshqa tranzaksiya ulanib olgan bo'lsa —
    -31099, Payme o'zi keyinroq qayta urinadi yoki bekor qiladi.
  */
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.payments,
        Key: { payment_id: order.payment_id },
        UpdateExpression: 'SET payme_id = :id',
        ConditionExpression: 'attribute_not_exists(payme_id) OR payme_id = :id',
        ExpressionAttributeValues: { ':id': params.id },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return rpcError(id, -31099, msg(
        'Buyurtma boshqa to‘lovda band', 'Заказ занят другой транзакцией', 'Order is busy',
      ));
    }
    throw err;
  }

  const tx: PaymeTx = {
    payment_id: txKey(params.id!),
    ref: order.payment_id,
    state: 1,
    create_time: params.time ?? Date.now(),
    created_at_ms: Date.now(),
  };
  await db.send(new PutCommand({ TableName: TABLES.payments, Item: tx }));

  return rpcResult(id, { create_time: tx.create_time, transaction: tx.ref, state: 1 });
}

async function performTx(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<Response> {
  const tx = await getTx(params.id);
  if (!tx) return txNotFound(id);

  if (tx.state === 2) {
    return rpcResult(id, { transaction: tx.ref, perform_time: tx.perform_time, state: 2 });
  }
  if (tx.state < 0) {
    return rpcError(id, -31008, msg(
      'Tranzaksiya bekor qilingan', 'Транзакция отменена', 'Transaction cancelled',
    ));
  }
  if (await expireIfTimedOut(tx)) {
    return rpcError(id, -31008, msg(
      'Tranzaksiya muddati o‘tgan', 'Время транзакции истекло', 'Transaction timed out',
    ));
  }

  const order = await getOrder(tx.ref);
  if (!order) return txNotFound(id);

  /*
    Hold 5 daqiqa, Payme to'lovi undan cho'zilishi mumkin. Slot hali
    bizniki bo'lsa (payment_id mos) — to'lov o'tadi, hold muddati
    o'tgan bo'lsa ham. Slotni boshqa bemor olib ulgurgan bo'lsa —
    shart buziladi va pul yechilmaydi (-31008).
  */
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLES.appointments,
        Key: { doctor_day: doctorDayKey(order.doctor_id, order.date), time: order.time },
        UpdateExpression: 'SET #s = :paid REMOVE hold_until',
        ConditionExpression: 'payment_id = :pid',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':paid': 'paid', ':pid': order.payment_id },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      await saveTxState(tx, { state: -1, cancel_time: Date.now(), reason: 4 });
      return rpcError(id, -31008, msg(
        'Slot boshqa bemorga o‘tib ketgan', 'Слот уже занят другим пациентом', 'Slot taken',
      ));
    }
    throw err;
  }

  const performTime = Date.now();
  await saveTxState(tx, { state: 2, perform_time: performTime });
  await setOrderStatus(order.payment_id, 'paid');
  await notify(order);

  return rpcResult(id, { transaction: tx.ref, perform_time: performTime, state: 2 });
}

async function cancelTx(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<Response> {
  const tx = await getTx(params.id);
  if (!tx) return txNotFound(id);

  if (tx.state < 0) {
    return rpcResult(id, { transaction: tx.ref, cancel_time: tx.cancel_time, state: tx.state });
  }

  // 1 -> -1 (to'lovgacha), 2 -> -2 (to'lovdan keyin — Payme pulni qaytaradi)
  const newState = tx.state === 1 ? -1 : -2;
  const cancelTime = Date.now();

  const order = await getOrder(tx.ref);
  if (order) {
    // Slot bo'shatiladi; boshqa bemorga o'tib ketgan bo'lsa — tegilmaydi.
    try {
      await db.send(
        new UpdateCommand({
          TableName: TABLES.appointments,
          Key: { doctor_day: doctorDayKey(order.doctor_id, order.date), time: order.time },
          UpdateExpression: 'SET #s = :cancelled, hold_until = :zero',
          ConditionExpression: 'payment_id = :pid',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':cancelled': 'cancelled',
            ':zero': 0,
            ':pid': order.payment_id,
          },
        }),
      );
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }
    await setOrderStatus(order.payment_id, 'cancelled');
  }

  await saveTxState(tx, { state: newState, cancel_time: cancelTime, reason: params.reason });
  return rpcResult(id, { transaction: tx.ref, cancel_time: cancelTime, state: newState });
}

async function checkTx(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<Response> {
  const tx = await getTx(params.id);
  if (!tx) return txNotFound(id);

  return rpcResult(id, {
    create_time: tx.create_time,
    perform_time: tx.perform_time ?? 0,
    cancel_time: tx.cancel_time ?? 0,
    transaction: tx.ref,
    state: tx.state,
    reason: tx.reason ?? null,
  });
}

/** Payme sverka uchun davrdagi tranzaksiyalarni so'raydi. */
async function statement(
  id: RpcRequest['id'],
  params: NonNullable<RpcRequest['params']>,
): Promise<Response> {
  // To'lovlar jadvali o'sib boradi — bitta Scan 1 MB da kesilib,
  // sverkada tranzaksiyalar yetishmay qolardi.
  const found = (await scanAllPages({ TableName: TABLES.payments })) as PaymeTx[];

  const from = params.from ?? 0;
  const to = params.to ?? Number.MAX_SAFE_INTEGER;

  const transactions = found
    .filter((item) => item.payment_id.startsWith('payme#'))
    .filter((item) => item.create_time >= from && item.create_time <= to)
    .map((item) => ({
      id: item.payment_id.slice('payme#'.length),
      time: item.create_time,
      state: item.state,
      transaction: item.ref,
      create_time: item.create_time,
      perform_time: item.perform_time ?? 0,
      cancel_time: item.cancel_time ?? 0,
      reason: item.reason ?? null,
    }));

  return rpcResult(id, { transactions });
}

const txNotFound = (id: RpcRequest['id']): Response =>
  rpcError(id, -31003, msg('Tranzaksiya topilmadi', 'Транзакция не найдена', 'Transaction not found'));

/** To'lanmagan tranzaksiya 12 soatdan oshsa bekor qilinadi (Payme talabi). */
async function expireIfTimedOut(tx: PaymeTx): Promise<boolean> {
  if (Date.now() - tx.created_at_ms <= TX_TIMEOUT_MS) return false;
  await saveTxState(tx, { state: -1, cancel_time: Date.now(), reason: 4 });
  const order = await getOrder(tx.ref);
  if (order) await setOrderStatus(order.payment_id, 'cancelled');
  return true;
}

async function saveTxState(
  tx: PaymeTx,
  patch: { state: PaymeTx['state']; perform_time?: number; cancel_time?: number; reason?: number },
): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: TABLES.payments,
      Item: { ...tx, ...patch },
    }),
  );
}

async function setOrderStatus(paymentId: string, status: 'paid' | 'cancelled'): Promise<void> {
  await db.send(
    new UpdateCommand({
      TableName: TABLES.payments,
      Key: { payment_id: paymentId },
      UpdateExpression: 'SET #s = :s, updated_at = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': status, ':u': new Date().toISOString() },
    }),
  );
}

async function notify(order: Order): Promise<void> {
  try {
    const [doctor, appointment] = await Promise.all([
      getDoctor(order.doctor_id),
      db.send(
        new GetCommand({
          TableName: TABLES.appointments,
          Key: { doctor_day: doctorDayKey(order.doctor_id, order.date), time: order.time },
        }),
      ),
    ]);

    const telegramId = (appointment.Item as { telegram_id?: string } | undefined)?.telegram_id;
    if (!telegramId) return;

    await sendMessage(
      telegramId,
      `✅ <b>Broningiz tasdiqlandi!</b>\n\n` +
        `Shifokor: ${escapeHtml(doctor?.name ?? order.doctor_id)}\n` +
        `Sana: ${order.date}, soat ${order.time}\n` +
        `To'lov: ${order.amount.toLocaleString('ru-RU')} so'm qabul qilindi (Payme)\n\n` +
        `Qabulga 1 soat qolganda eslatma yuboramiz.`,
    );
  } catch (err) {
    await logToAdmin('payment-webhook/xabar', err);
  }
}
