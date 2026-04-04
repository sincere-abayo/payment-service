# Tenant Application Integration Guideline

## 1) Short answer to your question

Disbursement requests should be sent by the tenant backend, not directly by the tenant frontend.

Recommended flow:

1. Tenant frontend collects user input and sends it to tenant backend.
2. Tenant backend validates business rules and signs the request with required secrets.
3. Tenant backend calls Payment Service POST /.

Why backend only:

- Tenant apiKey must never be exposed in browser/mobile apps.
- Common x-api-key must never be exposed in browser/mobile apps.
- Backend is the right place for idempotency, audit logging, retries, and rate control.

## 2) Endpoint and protocol

- Method: POST
- Path: /
- Content-Type: application/json
- Command routing: via x-command header

## 3) Required headers for tenant commands

Every tenant command request must include:

- x-api-key: shared common gateway key (COMMON_X_API_KEY)
- x-command: command code
- Content-Type: application/json

Notes:

- Authorization: Bearer token is not required for tenant disbursement commands.
- Tenant identity is resolved from apiKey in request body.

## 4) Tenant commands and body requirements

### A) DSB_INIT_3C4D (initiate disbursement batch)

Required x-command value:

- DSB_INIT_3C4D

Required request body fields:

- apiKey: string (raw active tenant API key)
- idempotencyKey: string (required, unique per tenant for the same logical request)
- userPseudoId: string (required)
- totalAmount: positive integer (required)
- totalCharges: positive integer (required)
- chargeReceiver: non-empty string (required)
- recipients: non-empty array (required)

Each recipients item must include:

- phone: non-empty string
- amount: positive integer

Validation rules enforced by service:

- recipients must be non-empty
- each recipient amount must be a positive integer
- totalAmount must equal sum(recipients.amount)
- tenant apiKey must exist, be active, and belong to an ACTIVE tenant

Idempotency behavior:

- If the same tenantId + idempotencyKey is submitted again, service returns the existing batch instead of creating duplicates.

### B) DSB_STATUS_4E5F (get batch status)

Required x-command value:

- DSB_STATUS_4E5F

Required request body fields:

- apiKey: string (raw active tenant API key)
- batchId: string (required)

Access scope:

- Tenant can only read status for its own batch.

## 5) Example requests

Example for DSB_INIT_3C4D:

POST /
Headers:

- x-api-key: COMMON_X_API_KEY
- x-command: DSB_INIT_3C4D
- Content-Type: application/json

Body:
{
"apiKey": "TENANT_RAW_API_KEY",
"idempotencyKey": "disb-2026-04-04-acme-001",
"userPseudoId": "user-92f1",
"totalAmount": 150000,
"totalCharges": 3000,
"chargeReceiver": "256700000111",
"recipients": [
{ "phone": "256700000001", "amount": 50000 },
{ "phone": "256700000002", "amount": 100000 }
]
}

Example for DSB_STATUS_4E5F:

POST /
Headers:

- x-api-key: COMMON_X_API_KEY
- x-command: DSB_STATUS_4E5F
- Content-Type: application/json

Body:
{
"apiKey": "TENANT_RAW_API_KEY",
"batchId": "b3e0b934-0a7a-4f79-b4ab-4be8c3694de8"
}

## 6) Expected response patterns

DSB_INIT_3C4D success response includes:

- batchId
- status
- jobCount
- message

DSB_STATUS_4E5F success response includes:

- batchId
- status
- totals and chargeReceiver
- userPseudoId
- jobs[] with jobId, phone, amount, type, status, mtnRef, failReason
- createdAt, updatedAt

## 7) Error handling requirements for tenant backend

Handle at least these classes:

- 401 Unauthorized:
  - missing/invalid x-api-key header
  - missing/invalid/revoked tenant apiKey
- 403 Forbidden:
  - tenant account not active
- 400 Bad Request:
  - invalid payload, missing required fields, invalid totals
- 404 Not Found:
  - batch not found (or not owned by tenant)

Recommended behavior:

1. Do not retry 4xx validation/auth failures until corrected.
2. Retry safe transient failures (network/5xx) with backoff.
3. Keep idempotencyKey stable when retrying DSB_INIT_3C4D.

## 8) Security and compliance checklist

Tenant backend must:

- Store apiKey and COMMON_X_API_KEY in secure server-side secrets manager or environment vars.
- Never expose keys in frontend code, browser storage, or logs.
- Redact sensitive headers/body fields in logs.
- Use HTTPS only.
- Add request timeouts and retry policy for upstream resilience.
- Enforce input validation before calling Payment Service.

## 9) Operational checklist for go-live

Before production, tenant must confirm:

1. Backend-only integration is implemented.
2. idempotencyKey generation is deterministic and collision-safe.
3. Request/response logging is sanitized.
4. Alerting exists for repeated failed batches and webhook delivery issues.
5. Runbook exists for key rotation and incident response.

## 10) Integration ownership model

- Tenant frontend: collect and display user-facing transaction info only.
- Tenant backend: all command calls to Payment Service, signing/auth, retries, idempotency, and reconciliation.
- Payment Service: command validation, queueing, processing, and status retrieval.
