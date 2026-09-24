/**
 * Testlar uchun xotiradagi soxta DynamoDB.
 *
 * Haqiqiy AWS'siz API funksiyalarini uchdan-uchgacha sinash imkonini
 * beradi. Faqat loyihada ishlatiladigan amallar qo'llab-quvvatlanadi:
 * PutItem, GetItem, DeleteItem, UpdateItem, Query, Scan (ikkalasi
 * sahifalanadi) va oddiy ConditionExpression'lar.
 */
import { createServer } from 'node:http';

const tables = new Map(); // jadval -> Map(kalit -> item)
const keySchema = {
  test_users: ['telegram_id'],
  test_otp_codes: ['phone'],
  test_individuals: ['phone', 'sort_key'],
  test_analysis_results: ['phone', 'sort_key'],
  test_visits: ['phone', 'sort_key'],
  test_doctors: ['doctor_id'],
  test_schedules: ['doctor_id', 'date'],
  test_appointments: ['doctor_day', 'time'],
  test_payments: ['payment_id'],
  test_lab_results: ['phone', 'sort_key'],
  test_prices: ['item_id'],
  test_ratings: ['doctor_id', 'created_at'],
  test_rate_limits: ['bucket'],
  test_login_sessions: ['nonce'],
};
for (const t of Object.keys(keySchema)) tables.set(t, new Map());

/** `${amal}:${jadval}` → so'rovlar soni (testlar "necha marta o'qildi"ni tekshiradi). */
const calls = new Map();

const un = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if ('S' in v) return v.S;
  if ('N' in v) return Number(v.N);
  if ('BOOL' in v) return v.BOOL;
  if ('NULL' in v) return null;
  if ('L' in v) return v.L.map(un);
  if ('M' in v) return Object.fromEntries(Object.entries(v.M).map(([k, x]) => [k, un(x)]));
  return v;
};
const marshal = (v) => {
  if (v === null || v === undefined) return { NULL: true };
  if (typeof v === 'string') return { S: v };
  if (typeof v === 'number') return { N: String(v) };
  if (typeof v === 'boolean') return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(marshal) };
  return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshal(x)])) };
};
const itemKey = (table, item) => keySchema[table].map((k) => String(item[k])).join('|');

/** DynamoDB ifodalarini juda sodda tarzda hisoblaydi (testlar uchun yetarli). */
function evalCondition(expr, item, names, values) {
  if (!expr) return true;
  const resolve = (token) => {
    if (token.startsWith(':')) return values[token];
    const name = token.startsWith('#') ? names[token] : token;
    return item ? item[name] : undefined;
  };
  // Faqat butun bandni o'rab turgan qavslar olib tashlanadi —
  // attribute_not_exists(...) ichidagilari emas.
  const unwrap = (clause) => {
    const t = clause.trim();
    return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t;
  };

  return expr
    .split(' OR ')
    .some((clause) =>
      unwrap(clause)
        .split(' AND ')
        .every((part) => {
          const t = part.trim();
          let m = t.match(/^attribute_not_exists\((\w+)\)$/);
          if (m) return !item || item[m[1]] === undefined;
          m = t.match(/^attribute_exists\((\w+)\)$/);
          if (m) return Boolean(item && item[m[1]] !== undefined);
          m = t.match(/^([#\w]+)\s*(=|<|>|<=|>=)\s*(:\w+)$/);
          if (m) {
            const left = resolve(m[1]);
            const right = resolve(m[3]);
            if (left === undefined) return false;
            switch (m[2]) {
              case '=': return left === right;
              case '<': return left < right;
              case '>': return left > right;
              case '<=': return left <= right;
              default: return left >= right;
            }
          }
          throw new Error(`Soxta DynamoDB bu shartni bilmaydi: ${t}`);
        }),
    );
}

/** Vergul bo'yicha bo'ladi, lekin qavs ichidagilarni buzmaydi. */
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Qavs tashqarisidagi birinchi + yoki - belgisining o'rni. */
function topLevelOperator(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (c === '+' || c === '-')) return { at: i, sign: c };
  }
  return null;
}

/**
 * SET o'ng tomonidagi ifoda: qiymat, maydon yoki funksiya.
 * DynamoDB'da ishlatadiganlarimiz — list_append va if_not_exists.
 */
function evalValue(expr, item, names, values) {
  const t = expr.trim();
  if (t.startsWith(':')) return values[t];

  // Yig'indilar: `if_not_exists(rating_sum, :z) + :n` — qavs tashqarisidagi + / -.
  const op = topLevelOperator(t);
  if (op) {
    const a = Number(evalValue(t.slice(0, op.at), item, names, values) ?? 0);
    const b = Number(evalValue(t.slice(op.at + 1), item, names, values) ?? 0);
    return op.sign === '+' ? a + b : a - b;
  }

  let m = t.match(/^list_append\((.+)\)$/s);
  if (m) {
    const [left, right] = splitTop(m[1]);
    const a = evalValue(left, item, names, values) ?? [];
    const b = evalValue(right, item, names, values) ?? [];
    return [...(Array.isArray(a) ? a : [a]), ...(Array.isArray(b) ? b : [b])];
  }

  m = t.match(/^if_not_exists\((.+)\)$/s);
  if (m) {
    const [field, fallback] = splitTop(m[1]);
    const name = field.startsWith('#') ? names[field] : field;
    const current = item?.[name];
    return current === undefined ? evalValue(fallback, item, names, values) : current;
  }

  const name = t.startsWith('#') ? names[t] : t;
  return item?.[name];
}

function applyUpdate(item, expr, names, values) {
  const next = { ...item };
  const setPart = expr.match(/SET (.+?)(?: REMOVE |$)/s)?.[1];
  const removePart = expr.match(/REMOVE (.+)$/s)?.[1];

  if (setPart) {
    for (const assign of splitTop(setPart)) {
      const at = assign.indexOf('=');
      if (at === -1) continue;
      const rawKey = assign.slice(0, at).trim();
      const rawVal = assign.slice(at + 1).trim();
      if (!rawKey || !rawVal) continue;
      const key = rawKey.startsWith('#') ? names[rawKey] : rawKey;
      next[key] = evalValue(rawVal, item, names, values);
    }
  }
  if (removePart) {
    for (const raw of removePart.split(',')) {
      const key = raw.trim();
      delete next[key.startsWith('#') ? names[key] : key];
    }
  }
  return next;
}

/**
 * Javobni sahifalaydi: `ExclusiveStartKey` dan keyingisidan boshlab
 * `Limit` tagacha; qolgani bo'lsa `LastEvaluatedKey` beradi.
 *
 * Haqiqiy DynamoDB Query va Scan javobini 1 MB da kesadi, Limit
 * so'ralmasa ham. Soxta jadval ham shunday qiladi (25 tadan) —
 * sahifalashni unutgan kod testda ushlanadi, produksiyada emas.
 */
function pageOf(table, items, payload) {
  if (payload.ExclusiveStartKey) {
    const from = Object.fromEntries(
      Object.entries(payload.ExclusiveStartKey).map(([k, v]) => [k, un(v)]),
    );
    const at = items.findIndex((i) => itemKey(table, i) === itemKey(table, from));
    items = at === -1 ? [] : items.slice(at + 1);
  }

  const limit = payload.Limit ?? 25;
  const page = items.slice(0, limit);
  const last = items.length > limit ? page[page.length - 1] : undefined;

  return {
    Items: page.map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, marshal(v)]))),
    ...(last
      ? {
          LastEvaluatedKey: Object.fromEntries(
            keySchema[table].map((k) => [k, marshal(last[k])]),
          ),
        }
      : {}),
  };
}

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const target = (req.headers['x-amz-target'] ?? '').split('.').pop();
    const payload = JSON.parse(body || '{}');
    const table = payload.TableName;
    const store = tables.get(table);
    calls.set(`${target}:${table}`, (calls.get(`${target}:${table}`) ?? 0) + 1);
    const send = (obj, code = 200) => {
      res.writeHead(code, { 'content-type': 'application/x-amz-json-1.0' });
      res.end(JSON.stringify(obj));
    };
    const fail = (type) =>
      send({ __type: `com.amazonaws.dynamodb.v20120810#${type}`, message: type }, 400);

    const names = payload.ExpressionAttributeNames ?? {};
    const values = Object.fromEntries(
      Object.entries(payload.ExpressionAttributeValues ?? {}).map(([k, v]) => [k, un(v)]),
    );

    if (target === 'PutItem') {
      const item = Object.fromEntries(Object.entries(payload.Item).map(([k, v]) => [k, un(v)]));
      const existing = store.get(itemKey(table, item));
      if (!evalCondition(payload.ConditionExpression, existing, names, values)) {
        return fail('ConditionalCheckFailedException');
      }
      store.set(itemKey(table, item), item);
      return send({});
    }

    if (target === 'GetItem') {
      const key = Object.fromEntries(Object.entries(payload.Key).map(([k, v]) => [k, un(v)]));
      const item = store.get(itemKey(table, key));
      return send(item ? { Item: Object.fromEntries(Object.entries(item).map(([k, v]) => [k, marshal(v)])) } : {});
    }

    if (target === 'DeleteItem') {
      const key = Object.fromEntries(Object.entries(payload.Key).map(([k, v]) => [k, un(v)]));
      store.delete(itemKey(table, key));
      return send({});
    }

    if (target === 'UpdateItem') {
      const key = Object.fromEntries(Object.entries(payload.Key).map(([k, v]) => [k, un(v)]));
      const id = itemKey(table, key);
      const existing = store.get(id);
      if (!evalCondition(payload.ConditionExpression, existing, names, values)) {
        return fail('ConditionalCheckFailedException');
      }
      const before = existing ? { ...existing } : undefined;
      const updated = applyUpdate(existing ?? key, payload.UpdateExpression, names, values);
      store.set(id, updated);
      const asAttrs = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, marshal(v)]));
      if (payload.ReturnValues === 'ALL_NEW') return send({ Attributes: asAttrs(updated) });
      if (payload.ReturnValues === 'ALL_OLD') return send(before ? { Attributes: asAttrs(before) } : {});
      return send({});
    }

    if (target === 'Scan') return send(pageOf(table, [...store.values()], payload));

    if (target === 'Query') {
      const cond = payload.KeyConditionExpression;
      const m = cond.match(/([#\w]+)\s*=\s*(:\w+)/);
      const field = m[1].startsWith('#') ? names[m[1]] : m[1];
      const wanted = values[m[2]];
      let items = [...store.values()].filter((i) => i[field] === wanted);

      /*
        Sort kalit bo'yicha shart: `AND sk > :v`, `BETWEEN`, `begins_with`.
        Haqiqiy DynamoDB uni bajaradi — soxtasi e'tiborsiz qoldirsa,
        ortiqcha yozuv qaytarib, kodni noto'g'ri "ishlayapti" ko'rsatardi.
      */
      const rest = cond.slice(cond.indexOf(m[0]) + m[0].length);
      const nameOf = (tok) => (tok.startsWith('#') ? names[tok] : tok);
      const cmpMatch = rest.match(/AND\s+([#\w]+)\s*(<=|>=|<|>)\s*(:\w+)/);
      if (cmpMatch) {
        const key = nameOf(cmpMatch[1]);
        const bound = values[cmpMatch[3]];
        const cmp = { '<': (a) => a < bound, '<=': (a) => a <= bound, '>': (a) => a > bound, '>=': (a) => a >= bound };
        items = items.filter((i) => i[key] !== undefined && cmp[cmpMatch[2]](i[key]));
      }
      const betweenMatch = rest.match(/AND\s+([#\w]+)\s+BETWEEN\s+(:\w+)\s+AND\s+(:\w+)/i);
      if (betweenMatch) {
        const key = nameOf(betweenMatch[1]);
        const [lo, hi] = [values[betweenMatch[2]], values[betweenMatch[3]]];
        items = items.filter((i) => i[key] !== undefined && i[key] >= lo && i[key] <= hi);
      }
      const prefixMatch = rest.match(/AND\s+begins_with\(\s*([#\w]+)\s*,\s*(:\w+)\s*\)/i);
      if (prefixMatch) {
        const key = nameOf(prefixMatch[1]);
        const prefix = String(values[prefixMatch[2]]);
        items = items.filter((i) => String(i[key] ?? '').startsWith(prefix));
      }

      // Haqiqiy DynamoDB natijani sort kalit bo'yicha beradi —
      // sahifalash shu tartibga tayanadi.
      const range = keySchema[table][1];
      if (range) {
        items.sort((a, b) => String(a[range]).localeCompare(String(b[range])));
        if (payload.ScanIndexForward === false) items.reverse();
      }

      return send(pageOf(table, items, payload));
    }

    return send({ message: `Qo'llab-quvvatlanmaydi: ${target}` }, 400);
  });
});

/** Serverni ishga tushiradi va endpoint manzilini qaytaradi. */
export async function startFakeDynamo() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

export const stopFakeDynamo = () => server.close();

/** Jadvalga tayyor yozuv qo'shadi. */
export const seed = (table, key, item) => tables.get(table).set(key, item);

export const tableOf = (table) => tables.get(table);

/** Shu paytgacha amal (`Scan`, `Query`, ...) jadvalga necha marta kelgani. */
export const callCount = (target, table) => calls.get(`${target}:${table}`) ?? 0;
