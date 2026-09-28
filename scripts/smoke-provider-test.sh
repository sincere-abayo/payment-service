#!/usr/bin/env bash
# End-to-end smoke test for provider routing + XentriPay disbursement.
#
# Prerequisites:
#   - Postgres + Redis reachable (migrations applied, admin seeded:
#       DATABASE_URL=... npx prisma migrate deploy
#       DATABASE_URL=... ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='...' npx ts-node prisma/seed.ts)
#   - App running, e.g.:
#       DATABASE_URL=postgresql://momo:secret@127.0.0.1:5434/payment_service?schema=public \
#       REDIS_HOST=127.0.0.1 REDIS_PORT=6380 PORT=3100 NODE_ENV=development node dist/src/main.js
#
# Usage:
#   BASE_URL=http://127.0.0.1:3100 bash scripts/smoke-provider-test.sh
#
# Optional env: ADMIN_EMAIL, ADMIN_PASSWORD, SERVICE_API_KEY
set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3100}"
SERVICE_API_KEY="${SERVICE_API_KEY:-1223qwe123}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-StrongPassword123!}"
XENTRY_SECRET="${XENTRY_SECRET:-smoke_webhook_secret_9876}"
RUN_ID="smoke_$(date +%s)"
PASS=0
FAIL=0

say()  { printf '\n== %s\n' "$*"; }
ok()   { PASS=$((PASS+1)); printf '   PASS  %s\n' "$*"; }
bad()  { FAIL=$((FAIL+1)); printf '   FAIL  %s\n' "$*"; }
check(){ # check <description> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got: '$2', want: '$3')"; fi
}

cmd() { # cmd <COMMAND> <JSON> [adminToken]
  local c="$1" body="$2" token="${3:-}"
  if [ -n "$token" ]; then
    curl -s -X POST "$BASE_URL/" -H 'Content-Type: application/json' \
      -H "x-api-key: $SERVICE_API_KEY" -H "x-command: $c" \
      -H "Authorization: Bearer $token" -d "$body"
  else
    curl -s -X POST "$BASE_URL/" -H 'Content-Type: application/json' \
      -H "x-api-key: $SERVICE_API_KEY" -H "x-command: $c" -d "$body"
  fi
}

jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }
SIGN() { python3 -c "
import hmac, hashlib, sys
body = sys.stdin.buffer.read()
print('sha256=' + hmac.new(b'$XENTRY_SECRET', body, hashlib.sha256).hexdigest())
"; }

say "0. app reachable"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/health" || true)
check "health endpoint" "$code" "200"
[ "$code" = "200" ] || { echo "Aborting: app not reachable at $BASE_URL"; exit 1; }

say "1. admin login"
TOKEN=$(cmd ADM_LOGIN_1A2B "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | jget "['data'].get('accessToken','')")
if [ -n "$TOKEN" ]; then ok "login"; else bad "login"; exit 1; fi

say "2. provider routing + credential commands"
R=$(cmd ADM_GETRTE_3E5G '{}' "$TOKEN");                          check "GETRTE works"      "$(echo "$R" | jget "['success']")" "True"
R=$(cmd ADM_SETXTR_1P3R '{"baseUrl":"https://merchant.test.xentripay.com","apiKey":"smoke_test_key_1234","webhookSecret":"'"$XENTRY_SECRET"'"}' "$TOKEN")
check "SETXTR stores baseUrl" "$(echo "$R" | jget "['data']['baseUrl']")" "https://merchant.test.xentripay.com"
R=$(cmd ADM_SETMTN_9X1Z '{"environment":"sandbox"}' "$TOKEN");    check "SETMTN environment" "$(echo "$R" | jget "['data']['environment']")" "sandbox"
R=$(cmd ADM_SETMTN_9X1Z '{"environment":"bogus"}' "$TOKEN" || true)
echo "$R" | grep -q '"success":false' && ok "SETMTN rejects bogus environment" || bad "SETMTN rejects bogus environment: $R"
R=$(cmd ADM_SETRTE_5I7K '{"default":"mtn","disbursement":"mtn"}' "$TOKEN")
check "SETRTE mtn" "$(echo "$R" | jget "['data']['disbursement']")" "mtn"
R=$(cmd ADM_SETRTE_5I7K '{"default":"itec"}' "$TOKEN" || true)
echo "$R" | grep -q '"success":false' && ok "SETRTE rejects itec" || bad "SETRTE rejects itec: $R"

say "3. tenant + api key"
TID=$(cmd ADM_REGTNT_5I6J '{"name":"Smoke Tenant","email":"smoke_'"$RUN_ID"'@tenant.example","status":"APPROVE"}' "$TOKEN" | jget "['data']['id']")
TKEY=$(cmd ADM_GENKEY_9Q0R "{\"tenantId\":\"$TID\"}" "$TOKEN" | jget "['data']['rawApiKey']")
if [ -n "$TID" ] && [ -n "$TKEY" ]; then ok "tenant $TID + api key"; else bad "tenant registration"; exit 1; fi

say "4. DSB_INIT with routing=mtn (stub stays pending)"
INIT=$(cmd DSB_INIT_3C4D '{
  "apiKey":"'"$TKEY"'",
  "idempotencyKey":"'"$RUN_ID"'",
  "userPseudoId":"user_smoke",
  "senderPhone":"0788000000",
  "totalAmount":5000,
  "totalCharges":100,
  "chargeReceiver":"0789000000",
  "recipients":[{"phone":"0781111111","amount":5000,"name":"Alice Uwase","telecomProviderId":"63510"}]
}')
BATCH=$(echo "$INIT" | jget "['data']['batchId']")
check "batch provider pinned" "$(echo "$INIT" | jget "['data']['provider']")" "mtn"
echo "   batchId=$BATCH"
sleep 4
ST=$(cmd DSB_STATUS_4E5F "{\"apiKey\":\"$TKEY\",\"batchId\":\"$BATCH\"}")
PAYOUT_JOB=$(echo "$ST" | jget "['data']['jobs'][0]['jobId']")
check "payout job accepted as pending" "$(echo "$ST" | jget "['data']['jobs'][0]['status']")" "PROCESSING"
check "provider reference stored"      "$(echo "$ST" | jget "['data']['jobs'][0]['mtnRef'] is not None")" "True"
check "recipientName persisted"        "$(echo "$ST" | jget "['data']['jobs'][0]['recipientName']")" "Alice Uwase"

say "5. XentriPay webhook (raw-body HMAC + idempotency)"
WH_URL="$BASE_URL/webhooks/providers/xentripay"
BODY='{
  "event": "PAYOUT_SUCCESS",
  "data": {"id": 55123, "amount": 5000, "currency": "RWF", "status": "SUCCESSFUL",
           "reference": "'"$PAYOUT_JOB"'", "businessAccountId": 7,
           "createdAt": "2026-09-27T14:50:30.000Z"},
  "timestamp": "2026-09-27T14:50:31.000Z",
  "idempotencyKey": "idem-'"$RUN_ID"'"
}'
SIG=$(printf '%s' "$BODY" | SIGN)
R=$(curl -s -X POST "$WH_URL" -H 'Content-Type: application/json' \
      -H "x-xentripay-signature: $SIG" -H "x-xentripay-event: PAYOUT_SUCCESS" \
      -H "x-xentripay-idempotency-key: idem-$RUN_ID" --data-binary "$BODY")
echo "$R" | grep -q '"handled":true' && ok "valid signature accepted" || bad "valid signature accepted: $R"

R=$(curl -s -X POST "$WH_URL" -H 'Content-Type: application/json' \
      -H "x-xentripay-signature: $SIG" -H "x-xentripay-event: PAYOUT_SUCCESS" \
      -H "x-xentripay-idempotency-key: idem-$RUN_ID" --data-binary "$BODY")
echo "$R" | grep -q '"duplicate":true' && ok "duplicate ignored" || bad "duplicate ignored: $R"

R=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WH_URL" -H 'Content-Type: application/json' \
      -H "x-xentripay-signature: sha256=$(printf 'ab%.0s' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32)" \
      -H "x-xentripay-event: PAYOUT_SUCCESS" -H "x-xentripay-idempotency-key: idem-bad-$RUN_ID" --data-binary "$BODY")
check "tampered signature rejected" "$R" "401"

COMPACT=$(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin), separators=(",",":")))')
SIG2=$(printf '%s' "$COMPACT" | SIGN)
R=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WH_URL" -H 'Content-Type: application/json' \
      -H "x-xentripay-signature: $SIG2" -H "x-xentripay-event: PAYOUT_SUCCESS" \
      -H "x-xentripay-idempotency-key: idem-ws-$RUN_ID" --data-binary "$BODY")
check "signed bytes must match raw body exactly" "$R" "401"

say "6. charge job + batch completion"
CH_REF=$(echo "$ST" | jget "['data']['jobs'][1]['mtnRef']")
CH_JOB=$(echo "$ST" | jget "['data']['jobs'][1]['jobId']")
BODY2='{"event":"PAYOUT_SUCCESS","data":{"id":55124,"amount":100,"currency":"RWF","status":"SUCCESSFUL","reference":"'"$CH_REF"'","businessAccountId":7,"createdAt":"2026-09-27T14:50:30.000Z"},"timestamp":"2026-09-27T14:50:33.000Z","idempotencyKey":"idem-ch-'"$RUN_ID"'"}'
SIG3=$(printf '%s' "$BODY2" | SIGN)
curl -s -X POST "$WH_URL" -H 'Content-Type: application/json' \
  -H "x-xentripay-signature: $SIG3" -H "x-xentripay-event: PAYOUT_SUCCESS" \
  -H "x-xentripay-idempotency-key: idem-ch-$RUN_ID" --data-binary "$BODY2" > /dev/null
sleep 1
ST=$(cmd DSB_STATUS_4E5F "{\"apiKey\":\"$TKEY\",\"batchId\":\"$BATCH\"}")
check "payout job final status" "$(echo "$ST" | jget "['data']['jobs'][0]['status']")" "SUCCESS"
check "batch status"            "$(echo "$ST" | jget "['data']['status']")" "COMPLETED"

say "7. routing=xentry with bad credentials -> explicit FAILED (no optimistic success)"
cmd ADM_SETRTE_5I7K '{"default":"mtn","disbursement":"xentry"}' "$TOKEN" > /dev/null
INIT2=$(cmd DSB_INIT_3C4D '{
  "apiKey":"'"$TKEY"'",
  "idempotencyKey":"'"$RUN_ID"'_x",
  "userPseudoId":"user_smoke",
  "senderPhone":"0788000000",
  "totalAmount":2000,
  "totalCharges":100,
  "chargeReceiver":"0789000000",
  "recipients":[{"phone":"0781111111","amount":2000}]
}')
BATCH2=$(echo "$INIT2" | jget "['data']['batchId']")
check "batch provider pinned to xentry" "$(echo "$INIT2" | jget "['data']['provider']")" "xentry"
for _ in $(seq 1 30); do
  sleep 3
  ST2=$(cmd DSB_STATUS_4E5F "{\"apiKey\":\"$TKEY\",\"batchId\":\"$BATCH2\"}")
  S=$(echo "$ST2" | jget "['data']['jobs'][0]['status']")
  [ "$S" = "FAILED" ] && break
done
check "job FAILED with provider reason" "$S" "FAILED"
echo "   failReason: $(echo "$ST2" | jget "['data']['jobs'][0]['failReason']")"

printf '\n==== RESULT: %d passed, %d failed ====\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
