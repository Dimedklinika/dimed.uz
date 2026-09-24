#!/usr/bin/env bash
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

REGION="${DIMED_AWS_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}}"
PREFIX="${DIMED_TABLE_PREFIX:-dimed}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

command -v aws >/dev/null || { echo "Xato: AWS CLI topilmadi."; exit 1; }

# Hamma DynamoDB chaqiruvi shu orqali — region bir joyda turadi.
# DIMED_DYNAMO_ENDPOINT faqat lokal sinov uchun, odatda bo'sh.
ddb() {
  aws dynamodb --region "$REGION" \
    ${DIMED_DYNAMO_ENDPOINT:+--endpoint-url "$DIMED_DYNAMO_ENDPOINT"} "$@"
}

echo "Region: $REGION · jadval prefiksi: ${PREFIX}_"
echo "Hisob: $(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo '?')"
echo
echo "DIQQAT: shu region Netlify'dagi DIMED_AWS_REGION bilan bir xil"
echo "bo'lishi shart. Boshqasi kerak bo'lsa:"
echo "  DIMED_AWS_REGION=us-east-1 bash cloudshell-setup.sh"
echo

# --- 1-qadam: jadvallar ---
echo "1-qadam: jadvallar"

jadval() {
  local nom="$1" json="$2" toliq="${PREFIX}_$1"

  if ddb describe-table --table-name "$toliq" >/dev/null 2>&1; then
    echo "  =  $toliq — allaqachon bor"
    return
  fi

  ddb create-table --cli-input-json "$json" >/dev/null
  echo "  +  $toliq yaratildi"
}

ttl() {
  local toliq="${PREFIX}_$1" maydon="$2"

  # TTL faqat jadval ACTIVE bo'lgach yoqiladi.
  ddb wait table-exists --table-name "$toliq"

  local hozir
  hozir=$(ddb describe-time-to-live --table-name "$toliq" \
    --query 'TimeToLiveDescription.TimeToLiveStatus' --output text)
  if [ "$hozir" = "ENABLED" ]; then
    echo "     TTL allaqachon yoqilgan"
    return
  fi

  ddb update-time-to-live --table-name "$toliq" \
    --time-to-live-specification "Enabled=true,AttributeName=$maydon" >/dev/null
  echo "     TTL yoqildi: $maydon"
}

pitr() {
  local toliq="${PREFIX}_$1"

  # Zaxira nusxa ham faqat ACTIVE jadvalda yoqiladi.
  ddb wait table-exists --table-name "$toliq"

  local hozir
  hozir=$(ddb describe-continuous-backups --table-name "$toliq" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text 2>/dev/null || echo DISABLED)
  if [ "$hozir" = "ENABLED" ]; then
    echo "     zaxira nusxa allaqachon yoqilgan"
    return
  fi

  ddb update-continuous-backups --table-name "$toliq" \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
  echo "     zaxira nusxa yoqildi (35 kun)"
}

jadval "users" "$(cat <<JSON
{
  "TableName": "${PREFIX}_users",
  "AttributeDefinitions": [
    {
      "AttributeName": "telegram_id",
      "AttributeType": "S"
    },
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    },
    {
      "AttributeName": "code",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "telegram_id",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "phone-index",
      "KeySchema": [
        {
          "AttributeName": "phone",
          "KeyType": "HASH"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    },
    {
      "IndexName": "code-index",
      "KeySchema": [
        {
          "AttributeName": "code",
          "KeyType": "HASH"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }
  ]
}
JSON
)"
pitr "users"

jadval "otp_codes" "$(cat <<JSON
{
  "TableName": "${PREFIX}_otp_codes",
  "AttributeDefinitions": [
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "phone",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
ttl "otp_codes" "expires_at"

jadval "individuals" "$(cat <<JSON
{
  "TableName": "${PREFIX}_individuals",
  "AttributeDefinitions": [
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    },
    {
      "AttributeName": "sort_key",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "phone",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "sort_key",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "individuals"

jadval "doctors" "$(cat <<JSON
{
  "TableName": "${PREFIX}_doctors",
  "AttributeDefinitions": [
    {
      "AttributeName": "doctor_id",
      "AttributeType": "S"
    },
    {
      "AttributeName": "telegram_id",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "doctor_id",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "telegram-index",
      "KeySchema": [
        {
          "AttributeName": "telegram_id",
          "KeyType": "HASH"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }
  ]
}
JSON
)"
pitr "doctors"

jadval "schedules" "$(cat <<JSON
{
  "TableName": "${PREFIX}_schedules",
  "AttributeDefinitions": [
    {
      "AttributeName": "doctor_id",
      "AttributeType": "S"
    },
    {
      "AttributeName": "date",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "doctor_id",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "date",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "schedules"

jadval "appointments" "$(cat <<JSON
{
  "TableName": "${PREFIX}_appointments",
  "AttributeDefinitions": [
    {
      "AttributeName": "doctor_day",
      "AttributeType": "S"
    },
    {
      "AttributeName": "time",
      "AttributeType": "S"
    },
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    },
    {
      "AttributeName": "starts_at",
      "AttributeType": "S"
    },
    {
      "AttributeName": "date",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "doctor_day",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "time",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "patient-index",
      "KeySchema": [
        {
          "AttributeName": "phone",
          "KeyType": "HASH"
        },
        {
          "AttributeName": "starts_at",
          "KeyType": "RANGE"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    },
    {
      "IndexName": "date-index",
      "KeySchema": [
        {
          "AttributeName": "date",
          "KeyType": "HASH"
        },
        {
          "AttributeName": "starts_at",
          "KeyType": "RANGE"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }
  ]
}
JSON
)"
pitr "appointments"

jadval "analysis_results" "$(cat <<JSON
{
  "TableName": "${PREFIX}_analysis_results",
  "AttributeDefinitions": [
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    },
    {
      "AttributeName": "sort_key",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "phone",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "sort_key",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "analysis_results"

jadval "visits" "$(cat <<JSON
{
  "TableName": "${PREFIX}_visits",
  "AttributeDefinitions": [
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    },
    {
      "AttributeName": "sort_key",
      "AttributeType": "S"
    },
    {
      "AttributeName": "date",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "phone",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "sort_key",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "date-index",
      "KeySchema": [
        {
          "AttributeName": "date",
          "KeyType": "HASH"
        },
        {
          "AttributeName": "sort_key",
          "KeyType": "RANGE"
        }
      ],
      "Projection": {
        "ProjectionType": "ALL"
      }
    }
  ]
}
JSON
)"
pitr "visits"

jadval "payments" "$(cat <<JSON
{
  "TableName": "${PREFIX}_payments",
  "AttributeDefinitions": [
    {
      "AttributeName": "payment_id",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "payment_id",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "payments"

jadval "lab_results" "$(cat <<JSON
{
  "TableName": "${PREFIX}_lab_results",
  "AttributeDefinitions": [
    {
      "AttributeName": "phone",
      "AttributeType": "S"
    },
    {
      "AttributeName": "sort_key",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "phone",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "sort_key",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "lab_results"

jadval "prices" "$(cat <<JSON
{
  "TableName": "${PREFIX}_prices",
  "AttributeDefinitions": [
    {
      "AttributeName": "item_id",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "item_id",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "prices"

jadval "rate_limits" "$(cat <<JSON
{
  "TableName": "${PREFIX}_rate_limits",
  "AttributeDefinitions": [
    {
      "AttributeName": "bucket",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "bucket",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
ttl "rate_limits" "expires_at"

jadval "login_sessions" "$(cat <<JSON
{
  "TableName": "${PREFIX}_login_sessions",
  "AttributeDefinitions": [
    {
      "AttributeName": "nonce",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "nonce",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
ttl "login_sessions" "expires_at"

jadval "ratings" "$(cat <<JSON
{
  "TableName": "${PREFIX}_ratings",
  "AttributeDefinitions": [
    {
      "AttributeName": "doctor_id",
      "AttributeType": "S"
    },
    {
      "AttributeName": "created_at",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "doctor_id",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "created_at",
      "KeyType": "RANGE"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST"
}
JSON
)"
pitr "ratings"

# --- 2-qadam: jadvallar tayyor bo'lishini kutamiz ---
echo
echo "2-qadam: jadvallar tayyor bo'lishini kutamiz"
for t in users otp_codes individuals doctors schedules appointments analysis_results visits payments lab_results prices rate_limits login_sessions ratings; do
  ddb wait table-exists --table-name "${PREFIX}_$t"
done
echo "  hammasi tayyor"

# --- 3-qadam: shifokorlar ---
echo
echo "3-qadam: shifokorlar"

# telegram_id ataylab yozilmaydi — u qo'lda bog'lanadi va qayta
# ishga tushirishda o'chib ketmasligi kerak.
shifokor() {
  local id="$1" nom="$2" qiymatlar="$3"

  ddb update-item --table-name "${PREFIX}_doctors" \
    --key "{\"doctor_id\":{\"S\":\"$id\"}}" \
    --update-expression 'SET #f0 = :v0, #f1 = :v1, #f2 = :v2, #f3 = :v3, #f4 = :v4, #f5 = :v5, #f6 = :v6, #f7 = :v7, #f8 = :v8, #f9 = :v9, #f10 = :v10, #f11 = if_not_exists(#f11, :v11), #upd = :upd' \
    --expression-attribute-names '{"#f0":"name","#f1":"job","#f2":"dept_id","#f3":"shifts","#f4":"slot_minutes","#f5":"workdays","#f6":"price","#f7":"active","#f8":"photo","#f9":"experience","#f10":"hours","#f11":"age_group","#upd":"updated_at"}' \
    --expression-attribute-values "$qiymatlar" >/dev/null

  echo "  +  $id — $nom"
}

shifokor "narimbetov" "Narimbetov Alisher" '{":v0":{"S":"Narimbetov Alisher"},":v1":{"S":"Pediatr"},":v2":{"S":"pediatriya"},":v3":{"L":[{"M":{"start":{"S":"08:30"},"end":{"S":"12:30"}}},{"M":{"start":{"S":"13:30"},"end":{"S":"16:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"60000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/narimbetov-alisher.webp"},":v9":{"S":"10+ yil"},":v10":{"S":"Du–Sh · 08:30–16:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "rahimov" "Rahimov Umidjon" '{":v0":{"S":"Rahimov Umidjon"},":v1":{"S":"Oliy toifali pediatr"},":v2":{"S":"pediatriya"},":v3":{"L":[{"M":{"start":{"S":"08:30"},"end":{"S":"12:00"}}},{"M":{"start":{"S":"13:00"},"end":{"S":"15:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"70000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/rahimov-umid.webp"},":v9":{"S":"20+ yil"},":v10":{"S":"Du–Sh · 08:30–15:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "ashurov" "Ashurov Tursunali" '{":v0":{"S":"Ashurov Tursunali"},":v1":{"S":"Terapevt · Kardiolog"},":v2":{"S":"terapiya"},":v3":{"L":[{"M":{"start":{"S":"08:00"},"end":{"S":"12:00"}}},{"M":{"start":{"S":"13:00"},"end":{"S":"17:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"70000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/ashurov-tursunali.webp"},":v9":{"S":"40+ yil"},":v10":{"S":"Du–Sh · 08:00–17:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "ilxomov" "Ilxomov Laziz" '{":v0":{"S":"Ilxomov Laziz"},":v1":{"S":"Terapevt · Kardiolog"},":v2":{"S":"terapiya"},":v3":{"L":[{"M":{"start":{"S":"09:00"},"end":{"S":"14:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"60000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/ilxomov-laziz.webp"},":v9":{"S":""},":v10":{"S":"Du–Sh · 09:00–14:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "murtazayeva" "Murtazayeva Raʼno" '{":v0":{"S":"Murtazayeva Raʼno"},":v1":{"S":"Ginekolog · UTT shifokori"},":v2":{"S":"ginekologiya"},":v3":{"L":[{"M":{"start":{"S":"09:30"},"end":{"S":"12:30"}}},{"M":{"start":{"S":"13:30"},"end":{"S":"16:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"}]},":v6":{"N":"80000"},":v7":{"BOOL":false},":v8":{"S":"/images/team/murtazayeva-rano.webp"},":v9":{"S":""},":v10":{"S":"Du–Ju · 09:30–16:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "mansurov" "Mansurov Qobil" '{":v0":{"S":"Mansurov Qobil"},":v1":{"S":"Bolalar nevrologi"},":v2":{"S":"nevrologiya"},":v3":{"L":[{"M":{"start":{"S":"09:00"},"end":{"S":"13:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"65000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/mansurov-qobil.webp"},":v9":{"S":"9+ yil"},":v10":{"S":"Du–Sh · 09:00–13:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "umatqulov" "Umatqulov Husan" '{":v0":{"S":"Umatqulov Husan"},":v1":{"S":"Nevrolog · Nevropatolog"},":v2":{"S":"nevrologiya"},":v3":{"L":[{"M":{"start":{"S":"08:00"},"end":{"S":"13:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"65000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/umatqulov-husan.webp"},":v9":{"S":""},":v10":{"S":"Du–Sh · 08:00–13:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "qobilxojayev" "Qobilxoʻjayev Yorqinxoʻja" '{":v0":{"S":"Qobilxoʻjayev Yorqinxoʻja"},":v1":{"S":"LOR · Otorinolaringolog"},":v2":{"S":"lor"},":v3":{"L":[{"M":{"start":{"S":"16:00"},"end":{"S":"19:00"}}},{"M":{"start":{"S":"19:30"},"end":{"S":"22:00"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"0"},{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"70000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/yorqinxoja-qobulxojayev.webp"},":v9":{"S":"3+ yil"},":v10":{"S":"Du–Ya · 16:00–22:00"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'
shifokor "abdullayev" "Abdullayev Bekmirza" '{":v0":{"S":"Abdullayev Bekmirza"},":v1":{"S":"Logoped · Fizioterapevt"},":v2":{"S":"fizio"},":v3":{"L":[{"M":{"start":{"S":"08:30"},"end":{"S":"12:30"}}},{"M":{"start":{"S":"14:00"},"end":{"S":"17:30"}}}]},":v4":{"N":"60"},":v5":{"L":[{"N":"1"},{"N":"2"},{"N":"3"},{"N":"4"},{"N":"5"},{"N":"6"}]},":v6":{"N":"55000"},":v7":{"BOOL":true},":v8":{"S":"/images/team/abdullayev-bekmirza.webp"},":v9":{"S":"10+ yil"},":v10":{"S":"Du–Sh · 08:30–17:30"},":v11":{"S":"all"},":upd":{"S":"'"$NOW"'"}}'

# --- xulosa ---
JAMI=$(ddb scan --table-name "${PREFIX}_doctors" \
  --select COUNT --query Count --output text)
BOGLANGAN=$(ddb scan --table-name "${PREFIX}_doctors" \
  --filter-expression 'attribute_exists(telegram_id)' \
  --select COUNT --query Count --output text)

echo
echo "Tayyor. ${PREFIX}_doctors jadvalida $JAMI ta shifokor."
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
