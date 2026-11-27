/**
 * `scripts/cloudshell-setup.sh` ni yaratadi.
 *
 * Nega generator: CloudShell skripti AWS CLI bilan ishlaydi, ya'ni
 * jadval ta'riflari va shifokorlar ro'yxati unda tayyor JSON bo'lib
 * yotadi. Qo'lda yozilsa `tables.mjs` yoki `doctors.ts` o'zgarganda
 * jimgina eskirib qolardi. Shuning uchun u shu ikki manbadan
 * yaratiladi, `test-tables.mjs` esa fayl manbaga mos ekanini
 * tekshiradi.
 *
 * Ishlatish: npm run gen-cloudshell
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

import { tables, createTableInput } from './tables.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** JS qiymatini DynamoDB'ning tipli JSON ko'rinishiga aylantiradi. */
const marshal = (v) => {
  if (typeof v === 'string') return { S: v };
  if (typeof v === 'number') return { N: String(v) };
  if (typeof v === 'boolean') return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(marshal) };
  return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshal(x)])) };
};

/**
 * `doctors` jadvaliga yoziladigan maydonlar: baza nomi -> doctors.ts
 * dagi manba nomi. `active` alohida hisoblanadi: doctors.ts da
 * `active: false` bo'lmasa true (faolsiz shifokor seed'da yoqilmaydi).
 * Uchinchi qiymat `true` bo'lsa maydon `if_not_exists` bilan yoziladi:
 * adminda belgilangani (yosh cheklovi) qayta ishga tushirishda
 * o'chib ketmasin.
 *
 * Hammasi `#f0` kabi taxallus bilan yoziladi: DynamoDB'ning band
 * so'zlari ro'yxati uzun (name, hour, status, ...) va u kengayib
 * turadi — taxallus bilan bu savol umuman tug'ilmaydi.
 */
const FIELDS = [
  ['name', 'name'],
  ['job', 'job'],
  ['dept_id', 'deptId'],
  ['shifts', 'shifts'],
  ['slot_minutes', 'slotMinutes'],
  ['workdays', 'workdays'],
  ['price', 'price'],
  ['active', null],
  ['photo', 'photo'],
  ['experience', 'experience'],
  ['hours', 'hours'],
  ['age_group', 'ageGroup', true],
];

/** Skript matnini qaytaradi — sof funksiya, test shuni chaqiradi. */
export function buildScript(tableDefs, doctors) {
  const tableBlocks = tableDefs.map((t) => {
    const body = createTableInput(t, '__PREFIX__');
    const json = JSON.stringify(body, null, 2).replaceAll('__PREFIX__', '${PREFIX}');
    const ttl = t.ttlAttribute ? `\nttl "${t.name}" "${t.ttlAttribute}"` : '';
    const pitr = t.backup ? `\npitr "${t.name}"` : '';
    return `jadval "${t.name}" "$(cat <<JSON\n${json}\nJSON\n)"${ttl}${pitr}`;
  });

  const names = Object.fromEntries(FIELDS.map(([attr], i) => [`#f${i}`, attr]));
  names['#upd'] = 'updated_at';
  const setClause =
    FIELDS.map(([, , keep], i) => (keep ? `#f${i} = if_not_exists(#f${i}, :v${i})` : `#f${i} = :v${i}`)).join(', ') +
    ', #upd = :upd';

  const doctorBlocks = doctors.map((d) => {
    const values = Object.fromEntries(
      FIELDS.map(([attr, src], i) => [
        `:v${i}`,
        marshal(
          attr === 'active' ? d.active !== false : attr === 'age_group' ? d[src] ?? 'all' : d[src] ?? '',
        ),
      ]),
    );
    // $NOW qobiqda hisoblanadi, shuning uchun bitta tirnoqdan chiqamiz.
    values[':upd'] = { S: '__NOW__' };
    const json = JSON.stringify(values).replaceAll('__NOW__', `'"$NOW"'`);
    return `shifokor "${d.id}" "${d.name}" '${json}'`;
  });

  return `#!/usr/bin/env bash
#
# Dimed.uz — birlamchi tayyorlov (AWS CloudShell uchun).
#
# Hech narsa o'rnatish shart emas: CloudShell'da AWS CLI ham,
# kalitlar ham allaqachon bor. Node.js, npm, repo — kerak emas.
#
# ISHLATISH:
#   1. AWS konsolida yuqori o'ngdan kerakli regionni tanlang
#   2. CloudShell'ni oching (yuqoridagi >_ tugmasi)
#   3. Actions -> Upload file -> shu faylni tanlang
#   4. Quyidagini yozing:
#        bash cloudshell-setup.sh
#
# Qayta ishga tushirish xavfsiz: mavjud jadvallar o'tkazib
# yuboriladi, shifokorlarning telegram_id bog'lanishi o'chmaydi.
#
# BU FAYL QO'LDA TAHRIRLANMAYDI — u scripts/tables.mjs va
# src/data/doctors.ts dan yaratiladi: npm run gen-cloudshell

set -euo pipefail

REGION="\${DIMED_AWS_REGION:-\${AWS_REGION:-\${AWS_DEFAULT_REGION:-us-east-1}}}"
PREFIX="\${DIMED_TABLE_PREFIX:-dimed}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

command -v aws >/dev/null || { echo "Xato: AWS CLI topilmadi."; exit 1; }

# Hamma DynamoDB chaqiruvi shu orqali — region bir joyda turadi.
# DIMED_DYNAMO_ENDPOINT faqat lokal sinov uchun, odatda bo'sh.
ddb() {
  aws dynamodb --region "$REGION" \\
    \${DIMED_DYNAMO_ENDPOINT:+--endpoint-url "$DIMED_DYNAMO_ENDPOINT"} "$@"
}

echo "Region: $REGION · jadval prefiksi: \${PREFIX}_"
echo "Hisob: $(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo '?')"
echo
echo "DIQQAT: shu region Netlify'dagi DIMED_AWS_REGION bilan bir xil"
echo "bo'lishi shart. Boshqasi kerak bo'lsa:"
echo "  DIMED_AWS_REGION=us-east-1 bash cloudshell-setup.sh"
echo

# --- 1-qadam: jadvallar ---
echo "1-qadam: jadvallar"

jadval() {
  local nom="$1" json="$2" toliq="\${PREFIX}_$1"

  if ddb describe-table --table-name "$toliq" >/dev/null 2>&1; then
    echo "  =  $toliq — allaqachon bor"
    return
  fi

  ddb create-table --cli-input-json "$json" >/dev/null
  echo "  +  $toliq yaratildi"
}

ttl() {
  local toliq="\${PREFIX}_$1" maydon="$2"

  # TTL faqat jadval ACTIVE bo'lgach yoqiladi.
  ddb wait table-exists --table-name "$toliq"

  local hozir
  hozir=$(ddb describe-time-to-live --table-name "$toliq" \\
    --query 'TimeToLiveDescription.TimeToLiveStatus' --output text)
  if [ "$hozir" = "ENABLED" ]; then
    echo "     TTL allaqachon yoqilgan"
    return
  fi

  ddb update-time-to-live --table-name "$toliq" \\
    --time-to-live-specification "Enabled=true,AttributeName=$maydon" >/dev/null
  echo "     TTL yoqildi: $maydon"
}

pitr() {
  local toliq="\${PREFIX}_$1"

  # Zaxira nusxa ham faqat ACTIVE jadvalda yoqiladi.
  ddb wait table-exists --table-name "$toliq"

  local hozir
  hozir=$(ddb describe-continuous-backups --table-name "$toliq" \\
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \\
    --output text 2>/dev/null || echo DISABLED)
  if [ "$hozir" = "ENABLED" ]; then
    echo "     zaxira nusxa allaqachon yoqilgan"
    return
  fi

  ddb update-continuous-backups --table-name "$toliq" \\
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
  echo "     zaxira nusxa yoqildi (35 kun)"
}

${tableBlocks.join('\n\n')}

# --- 2-qadam: jadvallar tayyor bo'lishini kutamiz ---
echo
echo "2-qadam: jadvallar tayyor bo'lishini kutamiz"
for t in ${tableDefs.map((t) => t.name).join(' ')}; do
  ddb wait table-exists --table-name "\${PREFIX}_$t"
done
echo "  hammasi tayyor"

# --- 3-qadam: shifokorlar ---
echo
echo "3-qadam: shifokorlar"

# telegram_id ataylab yozilmaydi — u qo'lda bog'lanadi va qayta
# ishga tushirishda o'chib ketmasligi kerak.
shifokor() {
  local id="$1" nom="$2" qiymatlar="$3"

  ddb update-item --table-name "\${PREFIX}_doctors" \\
    --key "{\\"doctor_id\\":{\\"S\\":\\"$id\\"}}" \\
    --update-expression 'SET ${setClause}' \\
    --expression-attribute-names '${JSON.stringify(names)}' \\
    --expression-attribute-values "$qiymatlar" >/dev/null

  echo "  +  $id — $nom"
}

${doctorBlocks.join('\n')}

# --- xulosa ---
JAMI=$(ddb scan --table-name "\${PREFIX}_doctors" \\
  --select COUNT --query Count --output text)
BOGLANGAN=$(ddb scan --table-name "\${PREFIX}_doctors" \\
  --filter-expression 'attribute_exists(telegram_id)' \\
  --select COUNT --query Count --output text)

echo
echo "Tayyor. \${PREFIX}_doctors jadvalida $JAMI ta shifokor."
echo "Telegram'ga bog'langani: $BOGLANGAN / $JAMI"

if [ "$BOGLANGAN" -lt "$JAMI" ]; then
  echo
  echo "Keyingi qadam — shifokorlarni Telegram'ga bog'lash."
  echo "Har bir shifokor botga /start yuborib kontaktini ulashgach:"
  echo "  node scripts/link-doctor.mjs <shifokor> --phone +998901234567"
fi

echo
echo "Tekshirish uchun brauzerda oching:"
echo "  https://dimeduz.netlify.app/api/slots?doctor=rahimov&date=$(date -u -d '+2 days' +%Y-%m-%d 2>/dev/null || date -u -v+2d +%Y-%m-%d)"
`;
}

/** doctors.ts to'g'ridan-to'g'ri o'qiladi (node --experimental-strip-types). */
export async function loadDoctors() {
  const { doctors } = await import(pathToFileURL(join(root, 'src', 'data', 'doctors.ts')).href);
  return doctors;
}

export const OUTPUT = join(root, 'scripts', 'cloudshell-setup.sh');

// To'g'ridan-to'g'ri chaqirilganda faylni yozamiz; test faqat import qiladi.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = buildScript(tables, await loadDoctors());
  const oldText = (() => {
    try {
      return readFileSync(OUTPUT, 'utf8');
    } catch {
      return null;
    }
  })();

  writeFileSync(OUTPUT, text);
  console.log(
    oldText === text
      ? 'scripts/cloudshell-setup.sh — o\'zgarishsiz'
      : `scripts/cloudshell-setup.sh yangilandi (${text.split('\n').length} qator)`,
  );
}
