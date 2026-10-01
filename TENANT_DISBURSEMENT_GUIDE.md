# Tenant Integration Guide — Disbursement (XentriPay / MoMo Payouts)

How your app backend sends payout batches to the Payment Service via the **XentriPay (Xentry)** provider and tracks them to completion.

---

## 1. Overview

```
Your backend ──POST / (x-command)──▶ Payment Service ──▶ XentriPay ──▶ MTN MoMo
     │                                   │
     │◀── batch.completed webhook ───────┤   (optional, when tenant webhookUrl is set)
     │                                   │
     └── DSB_STATUS_4E5F (poll) ────────▶│   (recommended primary mechanism)
```

- One API call creates a **batch**: N payout jobs (`PAYOUT`) + 1 fee job (`CHARGE`).
- The service submits jobs to XentriPay asynchronously (queue), then polls the provider
  (first check ~30 s, exponential backoff up to 30 min, hard deadline 24 h).
- You track progress by polling `DSB_STATUS_4E5F`, optionally receiving a
  `batch.completed` webhook when every job is terminal.

**Base URLs**

| Environment | URL |
|---|---|
| Production | `https://payments.transpip.com` |
| Local dev  | `http://localhost:3000` |

All commands: `POST <base-url>/` with JSON body. Interactive API docs: `GET /docs`
(non-production only).

---

## 2. Authentication

Every request needs three things:

| Where | Name | Value |
|---|---|---|
| Header | `Content-Type` | `application/json` |
| Header | `x-api-key` | Service key (identifies this deployment) |
| Header | `x-command` | e.g. `DSB_INIT_3C4D` |
| Body   | `apiKey` | Your **tenant key** (identifies your tenant) |

No JWT is required for tenant commands. Your tenant key is issued when the tenant
account is created — keep it secret; every payout command must include it in the body.

**Success envelope**

```json
{
  "success": true,
  "command": "DSB_INIT_3C4D",
  "data": { },
  "timestamp": "2026-09-28T16:47:27.463Z"
}
```

**Error envelope** (HTTP status matches the error)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "totalAmount must be a positive integer",
  "timestamp": "2026-09-28T16:47:27.463Z",
  "error": "Bad Request"
}
```

Always branch on `success`, and use `message` for operator-facing diagnostics.

---

## 3. Commands

### 3.1 `DSB_INIT_3C4D` — Initiate a disbursement batch

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `apiKey` | string | ✅ | Your tenant key |
| `idempotencyKey` | string | ✅ | Unique per batch attempt (see §8) |
| `userPseudoId` | string | ✅ | Your reference for the end user/order |
| `senderPhone` | string | ✅ | Must differ from `chargeReceiver` |
| `totalAmount` | int | ✅ | **Positive integer**, must equal Σ recipient amounts |
| `totalCharges` | int | ✅ | **Positive integer (≥ 1)** — always creates a charge job |
| `chargeReceiver` | string | ✅ | Phone receiving the fee payout |
| `chargeReceiverName` | string | ⬜ | Registered MoMo name of `chargeReceiver` (required in practice by Xentry — see §5) |
| `recipients` | array | ✅ | Non-empty, see below |

**Each recipient**

| Field | Type | Required | Rules |
|---|---|---|---|
| `phone` | string | ✅ | Non-empty; `+2507…`/`2507…` are normalized to local `07…` automatically |
| `amount` | int | ✅ | Positive integer |
| `name` | string | ⬜ | Registered MoMo account name (strongly recommended — see §5) |
| `telecomProviderId` | string | ⬜ | Provider code, e.g. `"63510"` for Xentry MTN MoMo |

**Example**

```bash
curl -X POST https://payments.transpip.com/ \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <SERVICE_KEY>' \
  -H 'x-command: DSB_INIT_3C4D' \
  -d '{
    "apiKey": "<TENANT_KEY>",
    "idempotencyKey": "order_20260928_0001",
    "userPseudoId": "user_abc123",
    "senderPhone": "0786729283",
    "totalAmount": 1500,
    "totalCharges": 300,
    "chargeReceiver": "0789262977",
    "chargeReceiverName": "Fils IRADUKUNDA",
    "recipients": [
      { "phone": "0791963569", "amount": 500, "name": "Terah UWAWE" },
      { "phone": "0784424423", "amount": 500, "name": "Amani FADHILI" },
      { "phone": "0785988465", "amount": 500, "name": "IMANISHIMWE Noel" }
    ]
  }'
```

**Response `data`**

```json
{
  "batchId": "303789da-7c93-4ba9-9b60-99c9e3faec54",
  "status": "PROCESSING",
  "provider": "xentry",
  "jobCount": 4,
  "message": "Batch accepted. 4 jobs queued (3 payouts + 1 charge)."
}
```

`jobCount` = recipients + 1 charge job. The provider is pinned at creation time by
the deployment's routing config (currently `xentry` for disbursement).

**Idempotent replay** — same tenant + same `idempotencyKey` returns the original
batch instead of creating a new one:

```json
{
  "batchId": "303789da-7c93-4ba9-9b60-99c9e3faec54",
  "status": "PROCESSING",
  "provider": "xentry",
  "jobCount": 4,
  "message": "Idempotent replay: returning existing batch 303789da-7c93-4ba9-9b60-99c9e3faec54."
}
```

### 3.2 `DSB_STATUS_4E5F` — Get batch status with jobs

**Request body:** `{ "apiKey": "<TENANT_KEY>", "batchId": "<uuid>" }`

**Response `data`**

```json
{
  "batchId": "303789da-7c93-4ba9-9b60-99c9e3faec54",
  "status": "PROCESSING",
  "provider": "XENTRY",
  "totalAmount": 1500,
  "totalCharges": 300,
  "senderPhone": "0786729283",
  "chargeReceiver": "0789262977",
  "userPseudoId": "user_live_test",
  "jobs": [
    {
      "jobId": "…",
      "phone": "0791963569",
      "amount": 500,
      "type": "PAYOUT",
      "status": "PROCESSING",
      "mtnRef": "Ref1B39C6556501",
      "recipientName": "Terah UWAWE",
      "validatedRecipientName": null,
      "failReason": null
    },
    {
      "jobId": "…",
      "phone": "0789262977",
      "amount": 300,
      "type": "CHARGE",
      "status": "FAILED",
      "mtnRef": null,
      "recipientName": "Fils Iradukunda",
      "validatedRecipientName": "Fils IRADUKUNDA",
      "failReason": "Correct Registered name is : Fils IRADUKUNDA"
    }
  ],
  "createdAt": "2026-09-28T16:47:27.463Z",
  "updatedAt": "2026-09-28T16:47:27.463Z"
}
```

Field notes:

- `mtnRef` — provider reference (named historically; for Xentry it's the XentriPay
  ref id, e.g. `Ref1B39C6556501`). It may be updated to the provider's internal ref
  once the payout completes.
- `recipientName` — may be replaced with the **provider-validated account name**
  after completion (useful for reconciliation/receipts).
- `validatedRecipientName` — set when the provider rejects a job for a
  **name mismatch**: it carries the exact registered name Xentry expects
  (parsed from `failReason: "Correct Registered name is : …"`). Update your
  beneficiary record to this value and re-submit — do not scrape `failReason`.
- `failReason` — set only on `FAILED` jobs; carries the provider's message verbatim.

Unknown batch id (or another tenant's) → HTTP 404, `message: "Batch not found"`.

### 3.3 `TNT_BTCHSTS_2C2D` — Batch status (alias)

Identical request/response to `DSB_STATUS_4E5F` (same underlying read). Use
whichever fits your naming; both are tenant-scoped.

### 3.4 `TNT_LSTBTCH_1A1B` — List your batches

**Request body:** `{ "apiKey": "<TENANT_KEY>", "limit": 20, "offset": 0 }`
(`limit` defaults to 20, max 100; `offset` defaults to 0; newest first.)

**Response `data`**

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "batchId": "c4d4ac5e-1462-44b9-b0f9-5a5eef815f02",
      "status": "PROCESSING",
      "provider": "XENTRY",
      "totalAmount": 1500,
      "totalCharges": 300,
      "senderPhone": "0786729283",
      "chargeReceiver": "0789262977",
      "jobCount": 4,
      "successCount": 0,
      "createdAt": "2026-09-28T17:02:53.823Z",
      "updatedAt": "2026-09-28T17:02:53.823Z"
    }
  ]
}
```

---

## 4. Status model

**Job (`type`: `PAYOUT` | `CHARGE`)**

```
QUEUED ──▶ PROCESSING ──▶ SUCCESS
                      └─▶ FAILED      (terminal)
```

**Batch**

```
PROCESSING ──▶ COMPLETED         (all jobs SUCCESS)
           └─▶ PARTIALLY_FAILED  (≥ 1 job FAILED — others may be SUCCESS)   (both terminal)
```

Terminal job statuses are `SUCCESS` and `FAILED` only. A batch is safe to finalize
when its status is `COMPLETED` or `PARTIALLY_FAILED`.

---

## 5. Xentry-specific rules

1. **Registered MoMo names are mandatory in practice.** XentriPay validates the
   recipient name against the number's registered account name. If it doesn't match
   exactly, the job fails immediately with:
   `failReason: "Correct Registered name is : <expected full name>"`, and the
   expected name is also provided structured in `validatedRecipientName`.
   Always send `name` (and `chargeReceiverName`) with the exact registered names.
   On success the provider's validated name is written back to `recipientName`.

   **Phone format:** send either local (`0785988465`) or international
   (`+250785988465`, `250785988465`) — the service normalizes everything to the
   local `0…` format before storing and before calling the provider.

2. **Merchant wallet balance.** Payouts draw from your XentriPay business wallet
   (not from the sender's phone). If it can't cover `amount`, the job fails with
   `failReason: "Insufficient wallet balance."` Funding is an operations task
   (collection/deposit into the wallet) — contact ops if payouts fail this way.

3. **Pending / OTP confirmation.** XentriPay may hold a payout as pending until an
   authorized user confirms an OTP. Such jobs stay `PROCESSING`; the service polls
   the provider until it resolves. Do **not** retry them yourself.

4. **24-hour deadline.** If the provider never confirms, the job is failed with:
   `failReason: "Provider status not confirmed within 24 hours (providerRef: Ref…)"`.

5. **Provider pinning.** Each batch is pinned to the routing config's disbursement
   provider at creation (`provider: "xentry"`).

**Sandbox registered names** (test environment):

| Phone | Registered name |
|---|---|
| 0786729283 | Sincere Aime Margot ABIREBEYE ABAYO |
| 0791963569 | Terah UWAWE |
| 0784424423 | Amani FADHILI |
| 0785988465 | IMANISHIMWE Noel |
| 0789262977 | Fils IRADUKUNDA |

---

## 6. Completion webhook (optional)

If your tenant has a `webhookUrl` configured (set at tenant creation / update), the
service POSTs **once**, when *all* jobs of a batch are terminal:

```json
POST <your-webhookUrl>
Content-Type: application/json

{
  "event": "batch.completed",
  "batchId": "303789da-7c93-4ba9-9b60-99c9e3faec54",
  "tenantId": "baa700a8-083a-410c-9a02-7b4b2c3c6fb0",
  "userPseudoId": "user_abc123",
  "status": "PARTIALLY_FAILED",
  "totalAmount": 1500,
  "totalCharges": 300,
  "jobs": [ { "jobId": "…", "phone": "…", "amount": 500, "type": "PAYOUT",
              "status": "SUCCESS", "mtnRef": "Ref…", "failReason": null } ],
  "timestamp": "2026-09-28T17:10:00.000Z"
}
```

- **No signature** is attached — do not trust the payload blindly. Treat it as a
  *hint*: respond `2xx` quickly, then verify by calling `DSB_STATUS_4E5F`.
- Retries: 5 attempts, exponential backoff starting at 30 s. After exhaustion the
  delivery is dropped — which is why polling must remain your source of truth.
- `status` is `COMPLETED` or `PARTIALLY_FAILED`.

---

## 7. Error reference

**Validation (HTTP 400)** — exact messages you may see:

| message |
|---|
| `idempotencyKey is required` / `userPseudoId is required` / `senderPhone is required` / `chargeReceiver is required` |
| `senderPhone and chargeReceiver must be different` |
| `totalAmount must be a positive integer` / `totalCharges must be a positive integer` |
| `recipients must be a non-empty array` |
| `recipients[0] must include phone and positive integer amount` |
| `recipients[0].name must be a non-empty string when provided` |
| `recipients[0].telecomProviderId must be a non-empty string when provided` |
| `totalAmount (1500) must equal sum of recipient amounts (1000)` |
| `batchId is required` |

**Auth / access**

| HTTP | message |
|---|---|
| 401 | `Missing x-api-key header` / `Invalid x-api-key header` |
| 401 | `Missing apiKey in payload` |
| 401 | `Invalid or revoked Tenant API key` |
| 403 | `Tenant account is not active` |
| 404 | `Batch not found` |

**Provider-side failures** appear per job in `failReason` (not as HTTP errors):
`Insufficient wallet balance.`, `Correct Registered name is : …`,
`Approved charge setting not found.` (ops issue), etc.

---

## 8. Best practices

1. **Idempotency:** derive `idempotencyKey` deterministically
   from your business object (e.g. `payout_<orderId>_<attempt>`). Network retries
   with the same key can never double-pay. Use a *new* key only when you intentionally
   want a new batch (e.g. re-sending failed recipients).
2. **Poll with backoff:** every 5–10 s for the first minute, then every 30–60 s
   while `PROCESSING`; stop immediately at `COMPLETED` / `PARTIALLY_FAILED`. Use the
   webhook as a push hint, not the source of truth.
3. **Handle partial failure:** on `PARTIALLY_FAILED`, read `jobs`, and re-submit
   only the `FAILED` recipients in a **new** batch with a **new**
   `idempotencyKey` (same rules apply).
4. **Validate names client-side** against your KYC/registry data before submitting —
   it converts provider rejections into immediate form errors.
5. **Timeouts:** allow ≥ 30 s per HTTP call (the API occasionally responds in
   several seconds under load).
6. **Reconcile daily** with `TNT_LSTBTCH_1A1B` over your persisted batches to catch
   anything missed by polling/webhooks.

**Minimal Node.js polling loop**

```js
async function initBatch(payload) {
  const res = await fetch('https://payments.transpip.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SERVICE_KEY,
      'x-command': 'DSB_INIT_3C4D',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.message);
  return body.data.batchId;
}

async function waitForBatch(batchId, apiKey, { timeoutMs = 24 * 3600_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let delay = 5_000;
  while (Date.now() < deadline) {
    const res = await fetch('https://payments.transpip.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SERVICE_KEY,
        'x-command': 'DSB_STATUS_4E5F',
      },
      body: JSON.stringify({ apiKey, batchId }),
    });
    const body = await res.json();
    if (!body.success) throw new Error(body.message);
    const { status, jobs } = body.data;
    if (status === 'COMPLETED' || status === 'PARTIALLY_FAILED') return body.data;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 60_000);
  }
  throw new Error('batch did not reach terminal state within timeout');
}
```

---

## 9. Command cheat-sheet

| Command | Purpose |
|---|---|
| `DSB_INIT_3C4D` | Create payout batch (N payouts + 1 charge) |
| `DSB_STATUS_4E5F` | Batch status with per-job detail |
| `TNT_BTCHSTS_2C2D` | Batch status (alias, same shape) |
| `TNT_LSTBTCH_1A1B` | List your batches (paginated) |

Admin-only commands (`ADM_*`) and provider webhook ingress
(`POST /webhooks/providers/xentripay`) are outside tenant scope.
