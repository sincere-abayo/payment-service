# Tenant Disbursement Status and Failure Guide

This guide explains how a tenant application tracks XentriPay disbursement jobs,
detects final success or failure, and handles provider rejection details.

## 1. Tenant status contract

Use the tenant backend—not browser or mobile code—to call the Payment Service.

- Production base URL: `https://payments.transpip.com`
- Method and path: `POST /`
- Command: `DSB_STATUS_4E5F`
- Required header service key: `x-api-key`
- Required tenant key: `apiKey` in the JSON request body

```bash
curl -X POST https://payments.transpip.com/ \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <SERVICE_KEY>' \
  -H 'x-command: DSB_STATUS_4E5F' \
  -d '{
    "apiKey": "<TENANT_KEY>",
    "batchId": "<BATCH_ID>"
  }'
```

The `TNT_BTCHSTS_2C2D` command is an alias with the same request and response.

## 2. Status lifecycle

Each batch contains one `PAYOUT` job per recipient and one `CHARGE` job.

| Object | Status | Meaning | Tenant action |
|---|---|---|---|
| Job | `QUEUED` | Waiting for a worker | Keep polling |
| Job | `PROCESSING` | Submitted; XentriPay has not confirmed a final result | Keep polling; do not retry |
| Job | `SUCCESS` | XentriPay reported `COMPLETED` or `SUCCESSFUL` | Reconcile as paid |
| Job | `FAILED` | XentriPay reported `FAILED`, `REVERSED`, or `REJECTED`, or processing expired | Read `failReason`; do not treat as paid |
| Batch | `PROCESSING` | At least one job is not terminal | Keep polling |
| Batch | `COMPLETED` | Every job succeeded | Finalize the batch |
| Batch | `PARTIALLY_FAILED` | At least one job failed | Reconcile successful jobs and handle only failed jobs |

An accepted XentriPay request or a provider reference is not proof of payment.
Only the tenant-visible job status `SUCCESS` is proof that this service received a
terminal success status from XentriPay.

## 3. Status response fields

The important fields in each `jobs[]` item are:

| Field | Meaning |
|---|---|
| `jobId` | Payment Service customer reference sent to XentriPay |
| `type` | `PAYOUT` or `CHARGE` |
| `status` | Tenant-facing job status |
| `mtnRef` | Historical field name containing the provider reference |
| `recipientName` | Submitted name or provider-validated name after processing |
| `validatedRecipientName` | Provider-returned registered name when available on a failure |
| `failReason` | Provider or processing failure explanation; `null` on non-failed jobs |

### Successful example

```json
{
  "jobId": "ef9875a2-563e-4129-885d-baf11c5128f6",
  "phone": "0785988465",
  "amount": 500,
  "type": "PAYOUT",
  "status": "SUCCESS",
  "mtnRef": "Ref42FCC70F46DD",
  "recipientName": "IMANISHIMWE Noel",
  "validatedRecipientName": null,
  "failReason": null
}
```

### Rejected or failed example

XentriPay statuses `REJECTED`, `FAILED`, and `REVERSED` are all returned to the
tenant as `FAILED` because they are terminal and the recipient must not be treated
as paid.

```json
{
  "jobId": "fb747e44-f4de-4116-b81e-ac9be7a31f38",
  "phone": "0789262977",
  "amount": 300,
  "type": "CHARGE",
  "status": "FAILED",
  "mtnRef": "Ref1B39C6556501",
  "recipientName": "Fils Iradukunda",
  "validatedRecipientName": "Fils IRADUKUNDA",
  "failReason": "XentriPay: payout rejected (Correct Registered name is : Fils IRADUKUNDA)"
}
```

The service retains the most useful explanation XentriPay supplies in
`statusMessage`, `reason`, or `message`. If XentriPay sends no detailed explanation,
`failReason` still identifies the terminal result, for example
`XentriPay: payout rejected`.

Other possible processing failures include:

```text
XentriPay: payout failed (Insufficient wallet balance.)
XentriPay: payout reversed
Provider status not confirmed within 24 hours (providerRef: Ref...)
```

Do not parse a name from `failReason`. Use `validatedRecipientName` when it is
present.

## 4. Full terminal batch example

```json
{
  "success": true,
  "command": "DSB_STATUS_4E5F",
  "data": {
    "batchId": "303789da-7c93-4ba9-9b60-99c9e3faec54",
    "status": "PARTIALLY_FAILED",
    "provider": "XENTRY",
    "totalAmount": 1000,
    "totalCharges": 300,
    "jobs": [
      {
        "jobId": "job-success",
        "phone": "0785988465",
        "amount": 1000,
        "type": "PAYOUT",
        "status": "SUCCESS",
        "mtnRef": "Ref-success",
        "recipientName": "IMANISHIMWE Noel",
        "validatedRecipientName": null,
        "failReason": null
      },
      {
        "jobId": "job-rejected",
        "phone": "0789262977",
        "amount": 300,
        "type": "CHARGE",
        "status": "FAILED",
        "mtnRef": "Ref-rejected",
        "recipientName": "Fils Iradukunda",
        "validatedRecipientName": "Fils IRADUKUNDA",
        "failReason": "XentriPay: payout rejected (Correct Registered name is : Fils IRADUKUNDA)"
      }
    ]
  }
}
```

## 5. Completion webhook

When a tenant has a `webhookUrl`, the Payment Service sends `batch.completed` only
after every job is `SUCCESS` or `FAILED`. Each webhook job includes the same
`status`, `failReason`, and `validatedRecipientName` fields as the status command.

```json
{
  "event": "batch.completed",
  "batchId": "303789da-7c93-4ba9-9b60-99c9e3faec54",
  "status": "PARTIALLY_FAILED",
  "jobs": [
    {
      "jobId": "job-rejected",
      "status": "FAILED",
      "validatedRecipientName": "Fils IRADUKUNDA",
      "failReason": "XentriPay: payout rejected (Correct Registered name is : Fils IRADUKUNDA)"
    }
  ]
}
```

The outgoing tenant webhook is currently unsigned. Treat it as a notification,
respond with `2xx` quickly, and confirm its contents using `DSB_STATUS_4E5F` before
changing financial records.

## 6. Required tenant behavior

1. Poll while the batch is `PROCESSING`. A 5–10 second interval is reasonable at
   first; increase it to 30–60 seconds for longer-running batches.
2. Never retry a `QUEUED` or `PROCESSING` job. It may still complete and a retry
   could create a second payout attempt.
3. Stop polling at `COMPLETED` or `PARTIALLY_FAILED`.
4. On `PARTIALLY_FAILED`, retain all successful jobs. Never resubmit them.
5. Inspect each failed job's `failReason` and `validatedRecipientName`.
6. If the data can be corrected, submit only the failed recipient in a new batch
   with a new `idempotencyKey`.
7. Escalate wallet, provider configuration, reversal, and unexplained rejection
   failures to operations rather than retrying automatically.

## 7. Suggested tenant-side decision logic

```js
function classifyBatch(batch) {
  if (batch.status === 'PROCESSING') {
    return { action: 'POLL_AGAIN' };
  }

  const succeeded = batch.jobs.filter((job) => job.status === 'SUCCESS');
  const failed = batch.jobs.filter((job) => job.status === 'FAILED');

  return {
    action: failed.length === 0 ? 'COMPLETE' : 'REVIEW_FAILURES',
    succeeded,
    failed: failed.map((job) => ({
      jobId: job.jobId,
      phone: job.phone,
      reason: job.failReason,
      correctedName: job.validatedRecipientName,
    })),
  };
}
```

Persist `batchId`, `jobId`, `status`, `mtnRef`, and `failReason` for reconciliation.
Do not store either API key in tenant frontend code or application logs.
