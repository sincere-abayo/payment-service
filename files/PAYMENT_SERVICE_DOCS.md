# MTN MoMo Disbursement Platform — Backend Developer Documentation

> Complete technical reference for backend engineers working on the command-based NestJS payment service.

> Implementation status (April 2026): Auth, Admin tenant-management, disbursement batch intake/status, queue worker processing, MTN callback receiver, outbound tenant webhooks, and tenant query commands are implemented. MTN transfer execution is currently stubbed in optimistic-success mode and will be replaced with full provider integration next.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Tech Stack](#4-tech-stack)
5. [Environment Setup](#5-environment-setup)
6. [Database Schema](#6-database-schema)
7. [Command Pattern](#7-command-pattern)
8. [Authentication & Security](#8-authentication--security)
9. [API Reference — All Commands](#9-api-reference--all-commands)
10. [Disbursement Flow](#10-disbursement-flow)
11. [Queue & Worker System](#11-queue--worker-system)
12. [Webhook & Callback System](#12-webhook--callback-system)
13. [MTN MoMo Integration](#13-mtn-momo-integration)
14. [Admin Module](#14-admin-module)
15. [Error Handling](#15-error-handling)
16. [Docker & Deployment](#16-docker--deployment)
17. [Kubernetes](#17-kubernetes)
18. [Security Checklist](#18-security-checklist)
19. [Development Workflow](#19-development-workflow)
20. [Postman & Testing](#20-postman--testing)

---

## 1. System Overview

This platform is a **multi-tenant payment middleware** that sits between client applications (tenant apps) and the MTN Mobile Money API. Businesses integrate once via API key and use the platform to disburse money to multiple recipients in a single batch request.

### What it does

- Accepts a batch disbursement request from a tenant app
- Splits the batch into individual MTN transfer jobs
- Processes each job via the MTN MoMo Disbursement API
- Sends a charge fee transfer to a designated charge receiver
- Notifies the tenant app of results via webhook

### Key design decisions

| Decision   | Choice                                    | Reason                                               |
| ---------- | ----------------------------------------- | ---------------------------------------------------- |
| API style  | Single endpoint, command-based            | Uniform security, easier versioning, no route sprawl |
| Framework  | NestJS (TypeScript)                       | Modular, DI-first, enterprise-grade                  |
| DB ORM     | Prisma + PostgreSQL                       | Type-safe queries, migrations, schema-as-code        |
| Queue      | BullMQ + Redis                            | Reliable async job processing with retries           |
| Auth       | JWT + TOTP 2FA (admin), API Key (tenants) | Layered security per actor type                      |
| Deployment | Docker + Kubernetes                       | Scalable, zero-downtime deploys                      |

---

## 2. Architecture

### High-level flow

```
Tenant App
  │
  │  POST /  { x-command, x-api-key (common), Authorization?, apiKey? }
  ▼
API Gateway (NestJS MasterController)
  │
  ├── MasterGuard  →  common x-api-key validate  →  JWT/API key validate per command  →  Role check
  │
  ├── CommandRegistry.resolve(x-command)
  │
  ▼
Command Handler (inside feature module)
  │
  ├── [Auth]        ADM_LOGIN_*, ADM_VERIFY2FA_*
  ├── [Admin]       ADM_REGTNT_*, ADM_GETTNT_*, ADM_UPDTNT_*, ADM_APPROV_*, ADM_REVTNT_*, ADM_GENKEY_*, ADM_REVKEY_*, ADM_REGKEY_*
  ├── [Tenant]      TNT_LSTBTCH_*, TNT_BTCHSTS_*
  └── [Disbursement] DSB_INIT_*, DSB_STATUS_*
        │
        ▼
    DisbursementService
        │
        ├── Store batch in DB (status: PENDING)
        ├── Create 6 DisbursementJob rows (5 payouts + 1 charge)
        └── Enqueue all 6 jobs → BullMQ
              │
              ▼
          DisbursementProcessor (Worker)
              │
              ├── Pick job from queue
              ├── Call MtnService.transfer(phone, amount)
              ├── MTN responds via callback
              └── Update job status → trigger WebhookService
                        │
                        ▼
                  WebhookService
                        │
                        ├── Build payload { batch, jobs[] }
                        ├── POST to tenant webhookUrl
                        └── Retry with exponential backoff on failure
```

### Module dependency graph

```
AppModule
  ├── ConfigModule (global)
  ├── ThrottlerModule (global)
  ├── BullModule (global)
  ├── PrismaModule (global)
  ├── QueueModule
  ├── MtnModule
  ├── AuthModule      → MasterModule, PrismaModule, JwtModule
  ├── AdminModule     → MasterModule, PrismaModule
  ├── TenantModule    → MasterModule, PrismaModule
  ├── DisbursementModule → MasterModule, PrismaModule, QueueModule, MtnModule, WebhookModule
  ├── WebhookModule   → PrismaModule
  └── MasterModule    ← (loaded last)
```

---

## 3. Project Structure

```
/project-root
│
├── src/
│   ├── main.ts                           # Entrypoint: helmet, CORS, Swagger, pipes
│   ├── app.module.ts                     # Root module wiring
│   │
│   ├── master/
│   │   ├── command.registry.ts           # Map<code, CommandDefinition>
│   │   ├── master.controller.ts          # POST / — single endpoint
│   │   └── master.module.ts
│   │
│   ├── auth/
│   │   ├── auth.service.ts               # Login, JWT, 2FA logic
│   │   ├── auth.commands.ts              # Registers ADM_LOGIN_*, ADM_VERIFY2FA_*
│   │   └── auth.module.ts
│   │
│   ├── admin/
│   │   ├── admin.service.ts              # Tenant mgmt, API key ops, audit log
│   │   ├── admin.commands.ts             # Registers ADM_APPROV_*, ADM_REVOKE_*, etc.
│   │   └── admin.module.ts
│   │
│   ├── tenant/
│   │   ├── tenant.service.ts             # Batch queries, status lookups per tenant
│   │   ├── tenant.commands.ts            # Registers TNT_* commands
│   │   └── tenant.module.ts
│   │
│   ├── disbursement/
│   │   ├── disbursement.service.ts       # Batch creation, job splitting
│   │   ├── disbursement.processor.ts     # BullMQ worker — processes each job
│   │   ├── disbursement.commands.ts      # Registers DSB_* commands
│   │   ├── dto/
│   │   │   └── initiate-disbursement.dto.ts
│   │   └── disbursement.module.ts
│   │
│   ├── webhook/
│   │   ├── webhook.service.ts            # Send + retry webhook to tenant
│   │   └── webhook.module.ts
│   │
│   ├── mtn/
│   │   ├── mtn.service.ts                # MTN MoMo API client (transfer, status)
│   │   └── mtn.module.ts
│   │
│   ├── queue/
│   │   ├── queue.module.ts               # BullMQ queue registration
│   │   └── queue.constants.ts            # Queue + job name constants
│   │
│   └── common/
│       ├── enums/
│       │   └── role.enum.ts              # Role.ADMIN | Role.TENANT
│       ├── guards/
│       │   └── master.guard.ts           # JWT + API key + role enforcement
│       ├── pipes/
│       │   └── validation.pipe.ts
│       ├── filters/
│       │   └── exception.filter.ts       # Global error shape
│       └── interceptors/
│           └── logging.interceptor.ts    # Per-command request logs
│
├── prisma/
│   ├── schema.prisma                     # Full DB schema
│   └── seed.ts                           # Seeds initial admin account
│
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml                      # TLS + nginx rate limiting
│   ├── configmap.yaml
│   ├── secrets.yaml
│   └── hpa.yaml                          # Auto-scale 2 → 10 pods
│
├── postman/
│   └── collection.json
│
├── Dockerfile                            # Multi-stage, non-root user
├── docker-compose.yml                    # API + PostgreSQL + Redis
├── docker-entrypoint.sh                  # migrate → seed → start
├── .env.example
└── package.json
```

---

## 4. Tech Stack

| Layer              | Technology                                   | Version |
| ------------------ | -------------------------------------------- | ------- |
| Runtime            | Node.js                                      | 20 LTS  |
| Framework          | NestJS                                       | ^10     |
| Language           | TypeScript                                   | ^5      |
| Database           | PostgreSQL                                   | 16      |
| ORM                | Prisma                                       | ^5      |
| Queue              | BullMQ                                       | ^5      |
| Cache/Queue broker | Redis                                        | 7       |
| Auth               | JWT (`@nestjs/jwt`) + bcrypt + otplib (TOTP) | latest  |
| HTTP security      | helmet, compression, throttler               | latest  |
| Docs               | Swagger (`@nestjs/swagger`)                  | latest  |
| Container          | Docker (multi-stage)                         | latest  |
| Orchestration      | Kubernetes                                   | 1.28+   |

### Key packages

```json
{
  "dependencies": {
    "@nestjs/common": "^10",
    "@nestjs/core": "^10",
    "@nestjs/config": "^3",
    "@nestjs/jwt": "^10",
    "@nestjs/swagger": "^7",
    "@nestjs/throttler": "^5",
    "@nestjs/bullmq": "^10",
    "@prisma/client": "^5",
    "bullmq": "^5",
    "bcrypt": "^5",
    "otplib": "^12",
    "qrcode": "^1",
    "helmet": "^7",
    "compression": "^1",
    "class-validator": "^0.14",
    "class-transformer": "^0.5",
    "axios": "^1"
  },
  "devDependencies": {
    "prisma": "^5",
    "typescript": "^5",
    "@types/node": "^20",
    "@types/bcrypt": "^5",
    "ts-node": "^10"
  }
}
```

---

## 5. Environment Setup

### Local development

```bash
# 1. Clone and install
git clone <repo>
cd project-root
npm install

# 2. Configure environment
cp .env.example .env
# Fill in all values in .env

# 3. Start infrastructure (PostgreSQL + Redis)
docker-compose up postgres redis -d

# 4. Run migrations
npx prisma migrate dev

# 5. Seed admin account
npx ts-node prisma/seed.ts

# 6. Start dev server
npm run start:dev

# Swagger docs available at:
# http://localhost:3000/docs
```

### Environment variables reference

| Variable               | Required | Description                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------ |
| `NODE_ENV`             | yes      | `development` \| `production`                                      |
| `PORT`                 | no       | Default `3000`                                                     |
| `COMMON_X_API_KEY`     | yes      | Shared header key required for every command request (`x-api-key`) |
| `DATABASE_URL`         | yes      | PostgreSQL connection string                                       |
| `REDIS_HOST`           | yes      | Redis hostname                                                     |
| `REDIS_PORT`           | yes      | Default `6379`                                                     |
| `REDIS_PASSWORD`       | yes      | Redis auth password                                                |
| `JWT_SECRET`           | yes      | Min 32 chars, random string                                        |
| `JWT_EXPIRES_IN`       | no       | Default `8h`                                                       |
| `MTN_BASE_URL`         | yes      | MTN MoMo API base URL                                              |
| `MTN_SUBSCRIPTION_KEY` | yes      | From MTN developer portal                                          |
| `MTN_API_USER`         | yes      | MTN API user UUID                                                  |
| `MTN_API_KEY`          | yes      | MTN API key                                                        |
| `MTN_ENVIRONMENT`      | yes      | `sandbox` \| `production`                                          |
| `MTN_CALLBACK_URL`     | yes      | Your public callback URL                                           |
| `ADMIN_EMAIL`          | yes      | Initial admin email (seed)                                         |
| `ADMIN_PASSWORD`       | yes      | Initial admin password (seed)                                      |
| `ALLOWED_ORIGINS`      | no       | Comma-separated CORS origins                                       |
| `THROTTLE_TTL`         | no       | Rate limit window ms, default `60000`                              |
| `THROTTLE_LIMIT`       | no       | Max requests per window, default `60`                              |
| `RUN_SEED`             | no       | `true` to seed on Docker start                                     |

---

## 6. Database Schema

### Entity relationship summary

```
Admin ──────────────── AdminAction
  (1)                     (many)

TenantApp ──────────── ApiKey
  (1)                   (many)
  │
  ├──────────────────── DisbursementBatch
  │                         (many)
  │                           │
  │                           ├──── DisbursementJob (many)
  │                           └──── WebhookLog (many)
  │
  └──────────────────── WebhookLog (many)
```

### Models

#### `Admin`

| Field              | Type          | Notes                             |
| ------------------ | ------------- | --------------------------------- |
| `id`               | UUID PK       |                                   |
| `email`            | String unique |                                   |
| `passwordHash`     | String        | bcrypt, cost factor 12            |
| `twoFactorSecret`  | String?       | TOTP secret, nullable until setup |
| `twoFactorEnabled` | Boolean       | Default false                     |
| `lastLoginAt`      | DateTime?     |                                   |

#### `AdminAction` (audit log)

| Field        | Type            | Notes                      |
| ------------ | --------------- | -------------------------- |
| `id`         | UUID PK         |                            |
| `adminId`    | UUID FK → Admin |                            |
| `action`     | String          | e.g. `APPROVED_TENANT`     |
| `targetType` | String          | e.g. `TenantApp`, `ApiKey` |
| `targetId`   | String          | ID of affected record      |
| `note`       | String?         | Optional reason            |

#### `TenantApp`

| Field        | Type          | Notes                                       |
| ------------ | ------------- | ------------------------------------------- |
| `id`         | UUID PK       |                                             |
| `name`       | String        |                                             |
| `email`      | String unique |                                             |
| `webhookUrl` | String?       | Where to POST results                       |
| `status`     | Enum          | `PENDING \| ACTIVE \| SUSPENDED \| REVOKED` |

#### `ApiKey`

| Field       | Type                | Notes                   |
| ----------- | ------------------- | ----------------------- |
| `id`        | UUID PK             |                         |
| `tenantId`  | UUID FK → TenantApp |                         |
| `key`       | String unique       | SHA-256 hash of raw key |
| `status`    | Enum                | `ACTIVE \| REVOKED`     |
| `revokedAt` | DateTime?           |                         |

> **Important:** The raw API key is shown only once on creation. Only the SHA-256 hash is stored.

#### `DisbursementBatch`

| Field            | Type                | Notes                                                    |
| ---------------- | ------------------- | -------------------------------------------------------- |
| `id`             | UUID PK             |                                                          |
| `tenantId`       | UUID FK → TenantApp |                                                          |
| `userPseudoId`   | String              | End-user within the tenant app                           |
| `totalAmount`    | Int                 | Sum of all recipient amounts (smallest unit)             |
| `totalCharges`   | Int                 | Flat fee for the whole batch                             |
| `chargeReceiver` | String              | Phone number receiving the charge                        |
| `status`         | Enum                | `PENDING \| PROCESSING \| COMPLETED \| PARTIALLY_FAILED` |

#### `DisbursementJob`

| Field        | Type                        | Notes                                       |
| ------------ | --------------------------- | ------------------------------------------- |
| `id`         | UUID PK                     |                                             |
| `batchId`    | UUID FK → DisbursementBatch |                                             |
| `phone`      | String                      | Recipient phone number                      |
| `amount`     | Int                         | Amount for this transfer                    |
| `jobType`    | Enum                        | `PAYOUT \| CHARGE`                          |
| `status`     | Enum                        | `QUEUED \| PROCESSING \| SUCCESS \| FAILED` |
| `mtnRef`     | String?                     | MTN transaction reference from callback     |
| `failReason` | String?                     | Error message if failed                     |

#### `WebhookLog`

| Field           | Type                        | Notes                                      |
| --------------- | --------------------------- | ------------------------------------------ |
| `id`            | UUID PK                     |                                            |
| `batchId`       | UUID FK → DisbursementBatch |                                            |
| `tenantId`      | UUID FK → TenantApp         |                                            |
| `url`           | String                      | Tenant webhook URL at time of send         |
| `payload`       | Json                        | Full payload sent                          |
| `status`        | Enum                        | `PENDING \| SUCCESS \| FAILED \| RETRYING` |
| `attempts`      | Int                         | Retry counter                              |
| `lastAttemptAt` | DateTime?                   |                                            |

---

## 7. Command Pattern

### How it works

Every API request hits `POST /`. The `x-command` header determines what gets executed.

```
POST /
Headers:
  x-command: ADM_LOGIN_1A2B
  x-api-key: <COMMON_X_API_KEY>        ← required for every command
  Authorization: Bearer <jwt>          ← required for commands with requiresJwt=true
Body:
  {
    "apiKey": "raw_tenant_key",        ← tenant-only commands in next phase
    ...
  }
```

### Command definition interface

```typescript
interface CommandDefinition {
  code: string; // e.g. "DSB_INIT_3C4D"
  description: string; // shown in Swagger
  roles: Role[]; // [Role.ADMIN] or [Role.TENANT]
  requiresJwt: boolean; // enforce Bearer token
  requiresApiKey: boolean; // enforce API key
  handler: (payload: any, context: CommandContext) => Promise<any>;
}

interface CommandContext {
  tenantId?: string; // resolved from API key
  adminId?: string; // resolved from JWT
  userId?: string; // userPseudoId from payload/JWT
  role: Role;
  ip: string;
}
```

### Command naming convention

```
{MDL}_{ACTN}_{HASH}

MDL   = 3-letter module code  (ADM, DSB, TNT, WBH)
ACTN  = action abbreviation   (LOGIN, INIT, APPROV, REVOKE)
HASH  = 4-char unique code    (1A2B, 3C4D, ...)
```

### Registering a command

Each feature module implements `OnModuleInit` and registers its commands:

```typescript
@Injectable()
export class MyCommands implements OnModuleInit {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly myService: MyService,
  ) {}

  onModuleInit() {
    this.registry.register({
      code: "MDL_ACTN_XXXX",
      description: "Does something useful",
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.myService.doSomething(payload, context);
      },
    });
  }
}
```

### Response envelope

Every command returns the same shape:

```json
{
  "success": true,
  "command": "DSB_INIT_3C4D",
  "data": { ... },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

Error shape:

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid or expired token",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## 8. Authentication & Security

### Security layers (in order of execution)

```
Request
  │
  ├── 1. Helmet (security headers)
  ├── 2. CORS (POST only, whitelisted origins)
  ├── 3. Rate limiter (60 req/min per IP)
  ├── 4. MasterGuard
  │       ├── a. Resolve command from registry
  │       ├── b. Validate common x-api-key header (all commands)
  │       ├── c. JWT validation (if requiresJwt)
  │       ├── d. Tenant API key validation from body (tenant commands, next phase)
  │       └── e. Role check (command.roles includes request role?)
  ├── 5. ValidationPipe (DTO whitelist + transform)
  └── 6. Command handler
```

### Admin authentication flow

```
Step 1 — ADM_LOGIN_1A2B
  POST /
  Headers: { x-api-key: <COMMON_X_API_KEY>, x-command: ADM_LOGIN_1A2B }
  Body: { email, password }
  → Returns: { requires2FA: true, preAuthToken }   (if 2FA enabled)
  → Returns: { requires2FA: false, accessToken }   (if no 2FA)

Step 2 — ADM_VERIFY2FA_2C3D  (only if 2FA enabled)
  POST /
  Headers: { x-api-key: <COMMON_X_API_KEY>, x-command: ADM_VERIFY2FA_2C3D }
  Body: { preAuthToken, totpCode }
  → Returns: { accessToken }

All subsequent admin calls:
  POST /
  Headers: x-api-key: <COMMON_X_API_KEY>
           Authorization: Bearer <accessToken>
           x-command: ADM_*
```

### Tenant authentication flow

```
Tenant flows are planned for next phase. They will require both keys:

  POST /
  Headers: {
    x-api-key: <COMMON_X_API_KEY>,
    x-command: DSB_INIT_3C4D
  }
  Body: {
    apiKey: "raw_tenant_api_key",
    userPseudoId: "user_123",
    ...command-specific fields
  }

No JWT needed for tenant flows — tenant apiKey identifies tenant while common x-api-key authorizes service access.
```

### API key lifecycle

```
1. Admin registers tenant    → TenantApp created (status: PENDING)
2. Admin approves tenant     → TenantApp status: ACTIVE
3. System auto-generates key → Raw key shown ONCE to admin
                             → SHA-256 hash stored in DB
4. Admin shares key with tenant
5. Admin can revoke key      → ApiKey status: REVOKED
6. Admin can regenerate key  → Old key revoked, new key created
```

### JWT token types

| Token          | Purpose                              | Expiry            | Payload                           |
| -------------- | ------------------------------------ | ----------------- | --------------------------------- |
| Pre-auth token | Between login steps when 2FA enabled | 5 min             | `{ sub, role, step: 'pre-auth' }` |
| Access token   | Full admin session                   | 8h (configurable) | `{ sub, role: 'ADMIN' }`          |

### Security headers (via helmet)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`

---

## 9. API Reference — All Commands

### Auth commands

| Code                  | Roles | JWT | API Key           | Description                     |
| --------------------- | ----- | --- | ----------------- | ------------------------------- |
| `ADM_LOGIN_1A2B`      | ADMIN | ✗   | ✓ (common header) | Email + password login          |
| `ADM_VERIFY2FA_2C3D`  | ADMIN | ✗   | ✓ (common header) | Verify TOTP to get access token |
| `ADM_SETUP2FA_3E4F`   | ADMIN | ✓   | ✓ (common header) | Generate 2FA secret + QR code   |
| `ADM_CONFIRM2FA_4G5H` | ADMIN | ✓   | ✓ (common header) | Confirm 2FA setup               |

#### `ADM_LOGIN_1A2B`

```json
// Request body
{ "email": "admin@example.com", "password": "StrongPass123!" }

// Response (2FA enabled)
{ "requires2FA": true, "preAuthToken": "eyJ..." }

// Response (2FA disabled)
{ "requires2FA": false, "accessToken": "eyJ..." }
```

#### `ADM_VERIFY2FA_2C3D`

```json
// Request body
{ "preAuthToken": "eyJ...", "totpCode": "123456" }

// Response
{ "accessToken": "eyJ..." }
```

---

### Admin commands

| Code               | Roles | JWT | API Key           | Description                      |
| ------------------ | ----- | --- | ----------------- | -------------------------------- |
| `ADM_REGTNT_5I6J`  | ADMIN | ✓   | ✓ (common header) | Register new tenant app          |
| `ADM_LSTTNT_3U4V`  | ADMIN | ✓   | ✓ (common header) | List all tenants with details    |
| `ADM_GETTNT_2A3B`  | ADMIN | ✓   | ✓ (common header) | Get tenant with API key metadata |
| `ADM_UPDTNT_4C5D`  | ADMIN | ✓   | ✓ (common header) | Update tenant profile data       |
| `ADM_APPROV_6K7L`  | ADMIN | ✓   | ✓ (common header) | Approve pending tenant           |
| `ADM_SUSPTNT_7M8N` | ADMIN | ✓   | ✓ (common header) | Suspend active tenant            |
| `ADM_REVTNT_8O9P`  | ADMIN | ✓   | ✓ (common header) | Permanently revoke tenant        |
| `ADM_GENKEY_9Q0R`  | ADMIN | ✓   | ✓ (common header) | Generate API key for tenant      |
| `ADM_REVKEY_1S2T`  | ADMIN | ✓   | ✓ (common header) | Revoke an API key                |
| `ADM_REGKEY_6E7F`  | ADMIN | ✓   | ✓ (common header) | Regenerate tenant API key        |

#### `ADM_REGTNT_5I6J`

```json
// Request body
{
  "name": "Acme Payments Ltd",
  "email": "tech@acme.com",
  "webhookUrl": "https://acme.com/payment-callback"
}

// Response
{
  "id": "uuid",
  "name": "Acme Payments Ltd",
  "status": "PENDING"
}
```

#### `ADM_GENKEY_9Q0R`

```json
// Request body
{ "tenantId": "uuid" }

// Response — raw key shown ONCE, never again
{
  "apiKeyId": "uuid",
  "rawKey": "momo_live_xxxxxxxxxxxxxxxxxxxx",
  "warning": "Store this key securely. It will not be shown again."
}
```

---

### Tenant commands

| Code               | Roles  | JWT | API Key                           | Description               |
| ------------------ | ------ | --- | --------------------------------- | ------------------------- |
| `TNT_LSTBTCH_1A1B` | TENANT | ✗   | ✓ (common header + body `apiKey`) | List tenant's own batches |
| `TNT_BTCHSTS_2C2D` | TENANT | ✗   | ✓ (common header + body `apiKey`) | Get batch + job statuses  |

#### `TNT_BTCHSTS_2C2D`

```json
// Request body
{ "apiKey": "momo_live_xxx", "batchId": "uuid" }

// Response
{
  "batchId": "uuid",
  "status": "COMPLETED",
  "totalAmount": 35000,
  "totalCharges": 500,
  "jobs": [
    { "phone": "07XXXXXXXX", "amount": 2000, "type": "PAYOUT", "status": "SUCCESS", "mtnRef": "xxx" },
    { "phone": "07XXXXXXXX", "amount": 3000, "type": "PAYOUT", "status": "SUCCESS", "mtnRef": "xxx" },
    { "phone": "07XXXXXXXX", "amount": 10000, "type": "PAYOUT", "status": "FAILED", "failReason": "Recipient not found" },
    { "phone": "07XXXXXXXX", "amount": 15000, "type": "PAYOUT", "status": "SUCCESS", "mtnRef": "xxx" },
    { "phone": "07XXXXXXXX", "amount": 5000, "type": "PAYOUT", "status": "SUCCESS", "mtnRef": "xxx" },
    { "phone": "07XXXXXXXX", "amount": 500,  "type": "CHARGE", "status": "SUCCESS", "mtnRef": "xxx" }
  ]
}
```

---

### Disbursement commands

| Code              | Roles  | JWT | API Key                           | Description                   |
| ----------------- | ------ | --- | --------------------------------- | ----------------------------- |
| `DSB_INIT_3C4D`   | TENANT | ✗   | ✓ (common header + body `apiKey`) | Initiate a disbursement batch |
| `DSB_STATUS_4E5F` | TENANT | ✗   | ✓ (common header + body `apiKey`) | Get batch status by ID        |

#### `DSB_INIT_3C4D` — Main payment command

```json
// Request body
{
  "apiKey": "momo_live_xxxxxxxxxxxxxxxxxxxx",
  "idempotencyKey": "idem_20260403_0001",
  "userPseudoId": "user_abc123",
  "totalAmount": 35000,
  "totalCharges": 500,
  "chargeReceiver": "0788000000",
  "recipients": [
    { "phone": "0781111111", "amount": 2000 },
    { "phone": "0782222222", "amount": 3000 },
    { "phone": "0783333333", "amount": 10000 },
    { "phone": "0784444444", "amount": 15000 },
    { "phone": "0785555555", "amount": 5000 }
  ]
}

// Validation rules:
// - idempotencyKey is required and unique per tenant
// - sum(recipients[].amount) must equal totalAmount
// - totalCharges > 0
// - chargeReceiver must be valid phone format
// - recipients[] min 1 item

// Response
{
  "batchId": "uuid",
  "status": "PROCESSING",
  "jobCount": 6,
  "message": "Batch accepted. 6 jobs queued (5 payouts + 1 charge)."
}
```

---

## 10. Disbursement Flow

> Status: live. Batch intake, queue processing, callback updates, and webhook delivery are implemented.

> Note: Until full MTN API integration is completed, disbursement worker/callback paths use optimistic success by default for all jobs.

### Step-by-step

```
1. DSB_INIT_3C4D received
   └── MasterGuard validates API key → resolves tenantId
   └── DisbursementService.initiateBatch(payload, context)

2. DisbursementService.initiateBatch()
  └── Validate idempotencyKey and return existing batch on duplicate key
   └── Validate: sum(amounts) === totalAmount
   └── Create DisbursementBatch (status: PENDING)
   └── Create 5 DisbursementJob rows (type: PAYOUT)
   └── Create 1 DisbursementJob row  (type: CHARGE, phone: chargeReceiver, amount: totalCharges)
   └── Update batch status → PROCESSING
   └── Enqueue all 6 jobs into BullMQ queue "disbursement"
   └── Return { batchId, status: PROCESSING, jobCount: 6 }

3. DisbursementProcessor (worker) picks job from queue
   └── Update job status → PROCESSING
   └── Call MtnService.transfer({ phone, amount, externalId: job.id })
  └── MTN service stub returns { referenceId } and marks SUCCESS by default

4. MTN MoMo sends callback to MTN_CALLBACK_URL
   └── WebhookReceiver validates callback signature
   └── Finds job by externalId (= job.id)
  └── Updates job in optimistic-success mode and stores callback reference
   └── Checks: are all 6 jobs in terminal state?
       ├── Yes → update batch status (COMPLETED or PARTIALLY_FAILED)
       │         → trigger WebhookService.sendToBatch(batchId)
       └── No  → wait for remaining callbacks
```

### Batch status transitions

```
PENDING → PROCESSING → COMPLETED
                     → PARTIALLY_FAILED
```

### Job status transitions

```
QUEUED → PROCESSING → SUCCESS
                    → FAILED
```

### Amount validation rule

```typescript
// In DisbursementService — enforced before any DB write
const recipientTotal = payload.recipients.reduce((s, r) => s + r.amount, 0);
if (recipientTotal !== payload.totalAmount) {
  throw new BadRequestException(
    `totalAmount (${payload.totalAmount}) must equal sum of recipient amounts (${recipientTotal})`,
  );
}
```

---

## 11. Queue & Worker System

> Status: live. Queue registration and processor execution are implemented.

### Queue setup

```typescript
// queue.constants.ts
export const DISBURSEMENT_QUEUE = "disbursement";
export const JOB_PROCESS_TRANSFER = "process-transfer";
```

### Job payload

```typescript
interface DisbursementJobPayload {
  jobId: string; // DisbursementJob.id
  batchId: string;
  tenantId: string;
  phone: string;
  amount: number;
  jobType: "PAYOUT" | "CHARGE";
}
```

### Worker configuration

```typescript
@Processor(DISBURSEMENT_QUEUE, {
  concurrency: 5,       // process 5 jobs in parallel
})
export class DisbursementProcessor {
  @Process(JOB_PROCESS_TRANSFER)
  async handleTransfer(job: Job<DisbursementJobPayload>) { ... }
}
```

### BullMQ retry policy

```typescript
// Applied when enqueuing
const jobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};
```

### Queue monitoring

Use **Bull Board** for a web UI to inspect queues in development:

```typescript
// Add to app.module.ts in development
import { BullBoardModule } from "@bull-board/nestjs";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
```

---

## 12. Webhook & Callback System

> Status: live. `/mtn-callback` endpoint and webhook dispatch persistence are implemented.

### MTN callback endpoint

MTN posts transaction results to `MTN_CALLBACK_URL`. This is a separate, public endpoint (not behind `x-command`) that receives raw MTN callbacks.

```
POST /mtn-callback
Body (from MTN):
{
  "externalId": "disbursement-job-uuid",
  "status": "SUCCESSFUL" | "FAILED",
  "reason": "...",
  "financialTransactionId": "mtn-ref-xxx"
}
```

### Webhook payload sent to tenant

After all 6 jobs resolve, the system POSTs to the tenant's `webhookUrl`:

```json
{
  "event": "batch.completed",
  "batchId": "uuid",
  "tenantId": "uuid",
  "userPseudoId": "user_abc123",
  "status": "COMPLETED",
  "totalAmount": 35000,
  "totalCharges": 500,
  "jobs": [
    {
      "jobId": "uuid",
      "phone": "0781111111",
      "amount": 2000,
      "type": "PAYOUT",
      "status": "SUCCESS",
      "mtnRef": "xxx"
    },
    {
      "jobId": "uuid",
      "phone": "0788000000",
      "amount": 500,
      "type": "CHARGE",
      "status": "SUCCESS",
      "mtnRef": "xxx"
    }
  ],
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Retry logic

```
Attempt 1 → immediately
Attempt 2 → queued retry with exponential backoff (base 30s)
Attempt 3 → queued retry with exponential backoff
Attempt 4 → queued retry with exponential backoff
Attempt 5 → queued retry with exponential backoff

After 5 failed attempts → WebhookLog.status = FAILED
```

The tenant app must respond with HTTP `200` to acknowledge receipt. Any other status code triggers a retry.

---

## 13. MTN MoMo Integration

> Status: partial. Current transfer call is a service stub; full MTN API/token integration is next.

### API flow

```
1. Get access token
   POST https://sandbox.momodeveloper.mtn.com/disbursement/token/
   Headers: Authorization: Basic base64(apiUser:apiKey)
            Ocp-Apim-Subscription-Key: subscriptionKey
   → { access_token, token_type, expires_in }

2. Initiate transfer
   POST https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer
   Headers: Authorization: Bearer <access_token>
            X-Reference-Id: <uuid>   ← this is your externalId = jobId
            X-Target-Environment: sandbox | production
            Ocp-Apim-Subscription-Key: subscriptionKey
   Body: {
     "amount": "2000",
     "currency": "RWF",
     "externalId": "<jobId>",
     "payee": { "partyIdType": "MSISDN", "partyId": "07XXXXXXXX" },
     "payerMessage": "Salary disbursement",
     "payeeNote": "Payment from Acme"
   }
   → 202 Accepted (async)

3. MTN sends callback to MTN_CALLBACK_URL when done
   (or poll GET /disbursement/v1_0/transfer/{referenceId} for status)
```

### Token caching

The MTN access token expires in ~1 hour. Cache it in Redis:

```typescript
// MtnService caches token in Redis with TTL = expires_in - 60s buffer
const cachedToken = await this.redis.get("mtn:access_token");
if (cachedToken) return cachedToken;

const token = await this.fetchNewToken();
await this.redis.set(
  "mtn:access_token",
  token.access_token,
  "EX",
  token.expires_in - 60,
);
return token.access_token;
```

### Environments

| Environment | Base URL                                |
| ----------- | --------------------------------------- |
| Sandbox     | `https://sandbox.momodeveloper.mtn.com` |
| Production  | `https://proxy.momoapi.mtn.com`         |

Set `MTN_ENVIRONMENT=sandbox` for development and testing.

---

## 14. Admin Module

### What admin can do

| Action             | Command            | Effect                                       |
| ------------------ | ------------------ | -------------------------------------------- |
| Register tenant    | `ADM_REGTNT_5I6J`  | Creates TenantApp (PENDING)                  |
| List tenants       | `ADM_LSTTNT_3U4V`  | Returns paginated tenant details             |
| Get tenant + keys  | `ADM_GETTNT_2A3B`  | Returns tenant details with API key metadata |
| Update tenant      | `ADM_UPDTNT_4C5D`  | Updates name/email/webhook/status            |
| Approve tenant     | `ADM_APPROV_6K7L`  | Status → ACTIVE, logs action                 |
| Suspend tenant     | `ADM_SUSPTNT_7M8N` | Status → SUSPENDED, logs action              |
| Revoke tenant      | `ADM_REVTNT_8O9P`  | Status → REVOKED, all keys revoked           |
| Generate API key   | `ADM_GENKEY_9Q0R`  | Creates ApiKey, returns raw key once         |
| Revoke API key     | `ADM_REVKEY_1S2T`  | Status → REVOKED                             |
| Regenerate API key | `ADM_REGKEY_6E7F`  | Revokes active keys and creates a new key    |

Planned admin commands:

| Action         | Command             | Effect                            |
| -------------- | ------------------- | --------------------------------- |
| View batches   | `ADM_LSTBTCH_5W6X`  | All batches across all tenants    |
| View audit log | `ADM_AUDITLOG_7Y8Z` | All admin actions with timestamps |

### Audit log

Every admin action writes to `AdminAction`:

```typescript
await this.prisma.adminAction.create({
  data: {
    adminId: context.adminId,
    action: "APPROVED_TENANT",
    targetType: "TenantApp",
    targetId: tenantId,
    note: "Verified business documents",
  },
});
```

---

## 15. Error Handling

### HTTP status codes

| Status | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| 200    | Command executed successfully                            |
| 400    | Bad request — invalid payload or business rule violation |
| 401    | Unauthorized — missing/invalid JWT or API key            |
| 403    | Forbidden — valid credentials but insufficient role      |
| 404    | Unknown command code                                     |
| 429    | Rate limit exceeded                                      |
| 500    | Internal server error                                    |

### Error response shape

```json
{
  "success": false,
  "statusCode": 400,
  "message": {
    "statusCode": 400,
    "message": ["totalAmount must equal sum of recipient amounts"],
    "error": "Bad Request"
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Common errors

| Error                          | Cause                       | Fix                                        |
| ------------------------------ | --------------------------- | ------------------------------------------ |
| `Unknown command: X`           | Invalid `x-command` header  | Check command code spelling                |
| `Missing Bearer token`         | JWT required, not provided  | Add `Authorization: Bearer <token>` header |
| `Invalid or expired token`     | JWT expired or wrong secret | Re-authenticate                            |
| `Invalid or revoked  API key`  | Bad API key in body         | Check `apiKey` field                       |
| `Tenant account is not active` | Tenant suspended/pending    | Contact admin                              |
| `Insufficient permissions`     | Wrong role for command      | Check command roles                        |
| `totalAmount must equal sum`   | Payload math error          | Sum recipients matches totalAmount         |

---

## 16. Docker & Deployment

### Multi-stage Dockerfile summary

```
Stage 1 (builder):
  node:20-alpine
  → npm ci
  → prisma generate
  → npm run build
  → npm ci --only=production

Stage 2 (production):
  node:20-alpine
  → copy: node_modules, dist, prisma, package.json
  → user: nestjs (uid 1001, non-root)
  → EXPOSE 3000
  → HEALTHCHECK GET /health
  → ENTRYPOINT: docker-entrypoint.sh
```

### docker-entrypoint.sh

```bash
#!/bin/sh
npx prisma migrate deploy          # run pending migrations
[ "$RUN_SEED" = "true" ] && node dist/prisma/seed.js
exec node dist/main.js
```

### Local stack with docker-compose

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f api

# Run migrations manually
docker-compose exec api npx prisma migrate deploy

# Rebuild after code change
docker-compose up -d --build api
```

Services started by `docker-compose up`:

| Service    | Port | Notes                 |
| ---------- | ---- | --------------------- |
| `api`      | 3000 | NestJS app            |
| `postgres` | 5432 | PostgreSQL 16         |
| `redis`    | 6379 | Redis 7 with password |

---

## 17. Kubernetes

### Apply all manifests

```bash
# Create namespace first
kubectl apply -f k8s/namespace.yaml

# Apply secrets (fill in base64 values first)
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# Deploy
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Check status
kubectl get pods -n momo
kubectl get svc -n momo
kubectl logs -f deployment/momo-api -n momo
```

### Manifest summary

| File              | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| `namespace.yaml`  | Isolates all resources under `momo` namespace         |
| `deployment.yaml` | 2 replicas, rolling update, non-root, resource limits |
| `service.yaml`    | ClusterIP, routes port 80 → 3000                      |
| `ingress.yaml`    | TLS via cert-manager, nginx rate limiting (30 rps)    |
| `configmap.yaml`  | Non-secret env vars                                   |
| `secrets.yaml`    | Sensitive env vars (base64 encoded)                   |
| `hpa.yaml`        | Auto-scale 2 → 10 pods on CPU 70% / memory 80%        |

### Secrets best practice

Never commit real values to `secrets.yaml`. Use one of:

- **Kubernetes Sealed Secrets** — encrypt secrets before committing
- **HashiCorp Vault** — external secret injection
- **AWS Secrets Manager** + External Secrets Operator
- **Doppler** / **Infisical** for secret sync

---

## 18. Security Checklist

### Application level

- [x] Helmet security headers on all responses
- [x] CORS restricted to `POST` only and whitelisted origins
- [x] Rate limiting: 60 requests/min per IP (configurable)
- [x] JWT with short expiry (8h) and pre-auth token (5min) for 2FA step
- [x] TOTP 2FA for admin login (otplib)
- [x] API keys hashed (SHA-256) before storage — raw key shown once only
- [x] Passwords hashed with bcrypt (cost factor 12)
- [x] DTO whitelist — unknown fields stripped by ValidationPipe
- [x] No stack traces exposed in production responses
- [x] Admin action audit log for all sensitive operations

### Infrastructure level

- [x] Docker: non-root user (uid 1001), read-only filesystem
- [x] Docker: dropped all Linux capabilities
- [x] K8s: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`
- [x] K8s: resource limits (CPU + memory) on all containers
- [x] K8s: TLS enforced at ingress (cert-manager + Let's Encrypt)
- [x] K8s: rate limiting at nginx ingress level (30 rps)
- [x] Redis: password-protected
- [x] Secrets: never committed — use sealed secrets or external manager

### Things to add before production

- [ ] Request signing for MTN callbacks (validate `X-Callback-Signature` header)
- [ ] IP allowlist for MTN callback endpoint
- [ ] Refresh token rotation for admin sessions
- [x] Idempotency key on `DSB_INIT_3C4D` to prevent duplicate batches
- [ ] PII field encryption for phone numbers at rest (Prisma middleware)
- [ ] Centralized logging (Datadog / ELK / Loki)
- [ ] Alerting on FAILED batches and webhook retries exhausted

---

## 19. Development Workflow

### Scripts

```bash
npm run start:dev        # watch mode
npm run build            # compile TypeScript → dist/
npm run start:prod       # run compiled dist/main.js

npx prisma migrate dev   # create + apply migration
npx prisma migrate deploy # apply migrations in production
npx prisma studio        # visual DB browser at localhost:5555
npx prisma generate      # regenerate Prisma client after schema change
npx ts-node prisma/seed.ts  # seed admin account
```

### Adding a new command

1. Add handler method to the relevant service
2. Register it in `*.commands.ts` → `onModuleInit()`
3. Add command to API reference table in this doc
4. Add request/response example to Postman collection
5. Swagger auto-updates from registry on next start

### Adding a new module

1. `nest g module src/mymodule`
2. Create `mymodule.service.ts` and `mymodule.commands.ts`
3. Implement `OnModuleInit` in commands class
4. Import `MasterModule` and `PrismaModule` in `mymodule.module.ts`
5. Add module to `app.module.ts` imports (before `MasterModule`)

---

## 20. Postman & Testing

### Postman collection structure

```
MTN MoMo Disbursement Platform
  ├── Auth
  │   ├── ADM_LOGIN_1A2B
  │   ├── ADM_VERIFY2FA_2C3D
  │   ├── ADM_SETUP2FA_3E4F
  │   └── ADM_CONFIRM2FA_4G5H
  ├── Admin
  │   ├── ADM_REGTNT_5I6J
  │   ├── ADM_LSTTNT_3U4V
  │   ├── ADM_GETTNT_2A3B
  │   ├── ADM_UPDTNT_4C5D
  │   ├── ADM_APPROV_6K7L
  │   ├── ADM_SUSPTNT_7M8N
  │   ├── ADM_REVTNT_8O9P
  │   ├── ADM_GENKEY_9Q0R
  │   ├── ADM_REVKEY_1S2T
  │   └── ADM_REGKEY_6E7F
  ├── Disbursement
  │   ├── DSB_INIT_3C4D
  │   └── DSB_STATUS_4E5F
  └── Tenant
      ├── TNT_LSTBTCH_1A1B
      └── TNT_BTCHSTS_2C2D
```

### Postman environment variables

```
baseUrl         = http://localhost:3000
serviceApiKey   = COMMON_X_API_KEY value
adminAccessToken = (set after login/2FA)
preAuthToken    = (set after step 1 of 2FA login)
tenantApiKey    = (set after admin generates key)
tenantId        = (set after tenant registration)
apiKeyId        = (set after key generation)
batchId         = (set after DSB_INIT)
```

### Postman auto-capture token (test script)

Add to `ADM_LOGIN_1A2B` Tests tab:

```javascript
const res = pm.response.json();
if (res.data.accessToken) {
  pm.environment.set("adminAccessToken", res.data.accessToken);
}
if (res.data.preAuthToken) {
  pm.environment.set("preAuthToken", res.data.preAuthToken);
}
```

### Testing the full flow end-to-end

```
1. ADM_LOGIN_1A2B         → get token
2. ADM_VERIFY2FA_2C3D     → get full access token (if 2FA on)
3. ADM_REGTNT_5I6J        → create tenant
4. ADM_GETTNT_2A3B        → verify tenant metadata
5. ADM_UPDTNT_4C5D        → update tenant profile (optional)
6. ADM_APPROV_6K7L        → approve tenant
7. ADM_GENKEY_9Q0R        → generate raw tenant API key
8. ADM_REGKEY_6E7F        → rotate tenant API key (optional)
9. DSB_INIT_3C4D          → initiate batch (common x-api-key header + tenant apiKey in body)
10. DSB_STATUS_4E5F       → poll status
11. TNT_LSTBTCH_1A1B      → list tenant batches
12. TNT_BTCHSTS_2C2D      → fetch tenant batch/job status

Next-phase flow:
13. replace optimistic success with full MTN transfer integration
```

---

_Last updated: April 2026 — scope aligned with current implementation (Auth + Admin + Disbursement + Tenant query commands live; full MTN API integration planned)._
