import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, awsCredentials, optional, tableName } from './env.ts';

// Testlarda lokal soxta DynamoDB ishlatiladi.
const endpoint = optional('DIMED_DYNAMO_ENDPOINT');
const credentials = awsCredentials();

const client = new DynamoDBClient({
  region: AWS_REGION,
  ...(endpoint ? { endpoint } : {}),
  ...(credentials ? { credentials } : {}),
});

export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  users: tableName('users'),
  otpCodes: tableName('otp_codes'),
  individuals: tableName('individuals'),
  analysisResults: tableName('analysis_results'),
  visits: tableName('visits'),
  doctors: tableName('doctors'),
  schedules: tableName('schedules'),
  appointments: tableName('appointments'),
  payments: tableName('payments'),
  labResults: tableName('lab_results'),
  prices: tableName('prices'),
  ratings: tableName('ratings'),
  rateLimits: tableName('rate_limits'),
  loginSessions: tableName('login_sessions'),
} as const;

/**
 * Query natijasini oxirigacha o'qiydi.
 *
 * DynamoDB javobni 1 MB da kesadi va qolganini `LastEvaluatedKey` bilan
 * qaytaradi. Bitta chaqiruvga ishonib qolsak, ma'lumotning bir qismi
 * jimgina yo'qoladi — bemor tahlilini ko'rmaydi, cron esa eslatma
 * yubormaydi. `cap` — buzuq kursorda cheksiz aylanmaslik uchun.
 */
export async function queryAllPages(
  input: ConstructorParameters<typeof QueryCommand>[0],
  cap = 2000,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const page = await db.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }));
    items.push(...((page.Items ?? []) as Record<string, unknown>[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey && items.length < cap);

  return items;
}

/**
 * Scan natijasini oxirigacha o'qiydi — `queryAllPages` ning egizagi.
 *
 * Scan ham javobni 1 MB da kesadi. Vaqt o'tishi bilan o'sadigan
 * jadvallar (bemorlar, baholar, to'lovlar) uchun bitta chaqiruv
 * yetmaydi: bir kuni natija xabari ba'zi bemorlarga bormay qoladi,
 * Payme sverkasida tranzaksiyalar yetishmaydi — hech qanday xatosiz.
 */
export async function scanAllPages(
  input: ConstructorParameters<typeof ScanCommand>[0],
  cap = 50_000,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const page = await db.send(new ScanCommand({ ...input, ExclusiveStartKey: startKey }));
    items.push(...((page.Items ?? []) as Record<string, unknown>[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey && items.length < cap);

  return items;
}
