# Tenant Collection Guide

Collections use the same command endpoint as the rest of the service:

```http
POST /
x-command: COL_INIT_8A9B
x-api-key: <common-service-key>
Content-Type: application/json
```

## Initiate a collection

```json
{
  "apiKey": "<tenant-api-key>",
  "idempotencyKey": "collection-20261007-0001",
  "userPseudoId": "customer-123",
  "phone": "0781111111",
  "amount": 500,
  "customerName": "Alice Uwase",
  "customerEmail": "alice@example.com"
}
```

`idempotencyKey`, `userPseudoId`, `phone`, and `amount` are required. The amount
must be a whole number of at least 100 RWF. `customerName` and `customerEmail`
are optional, but should be supplied when available.

An accepted Xentry request remains `PROCESSING` while the customer confirms the
Mobile Money prompt. Acceptance and a provider reference are not proof of
payment.

## Check status

Use `COL_STATUS_9C0D`:

```json
{
  "apiKey": "<tenant-api-key>",
  "collectionId": "0c4b8e06-13d9-4b34-bd10-2da6a38db11d"
}
```

Collection statuses are:

| Status | Meaning |
| --- | --- |
| `QUEUED` | Accepted locally and waiting for a worker. |
| `PROCESSING` | Submitted or being reconciled; payment is not confirmed. |
| `SUCCESS` | Xentry explicitly confirmed payment. |
| `FAILED` | Xentry or the service confirmed terminal failure. |

## Completion webhook

Once the collection reaches `SUCCESS` or `FAILED`, the service queues a webhook
to the tenant's configured webhook URL. Delivery uses the existing retry policy.

```json
{
  "event": "collection.completed",
  "collectionId": "0c4b8e06-13d9-4b34-bd10-2da6a38db11d",
  "tenantId": "f61adb55-62ce-4221-8630-883c3a8bda4e",
  "userPseudoId": "customer-123",
  "phone": "0781111111",
  "amount": 500,
  "status": "SUCCESS",
  "provider": "xentry",
  "providerRef": "RefE1108D491A1C",
  "failReason": null,
  "timestamp": "2026-10-07T12:00:00.000Z"
}
```

Treat duplicate tenant webhooks idempotently using `collectionId`. Do not grant
value while the collection is `QUEUED` or `PROCESSING`.
