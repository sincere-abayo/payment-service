## **XentriPay Webhook Integration — Payment Service Architecture**

We are building a **multi-tenant payment service** that integrates external payment providers such as XentriPay.

The most important architectural requirement is to clearly separate:

1. **Provider-level webhook authentication**  
2. **Our payment-service tenant webhook authentication**

### **1\. Core architecture**

Our payment service acts as the intermediary between external payment providers and our tenants.

The flow is:

External Payment Provider  
        |  
        | Provider webhook  
        v  
Our Payment Service  
        |  
        | Normalize/validate event  
        v  
Tenant Webhook URL  
        |  
        v  
Tenant Application

For XentriPay specifically:

XentriPay  
    |  
    | POST webhook  
    | X-Xentripay-Signature  
    | XentriPay-generated webhook secret  
    v  
Payment Service  
    |  
    | Verify XentriPay signature  
    | Validate event  
    | Deduplicate event  
    | Map provider transaction  
    | Update payment state  
    v  
Tenant  
    |  
    | POST to tenant-provided webhook URL  
    | Sign using tenant-created webhook secret  
    v  
Tenant Application

---

## **2\. VERY IMPORTANT: Two different secrets**

There are **two completely different webhook secrets** in this architecture.

### **A. XentriPay webhook secret**

This secret belongs to the relationship:

Payment Service \<-\> XentriPay

When our payment service registers its webhook with XentriPay, XentriPay returns a webhook `secret`.

Example:

{  
  "id": 42,  
  "url": "https://payment-service.com/webhooks/xentripay",  
  "enabled": true,  
  "secret": "550e8400-e29b-41d4-a716-446655440000"  
}

According to the XentriPay documentation, this secret is returned when the webhook is registered or toggled and is not returned when webhooks are later listed, so our service MUST securely persist it when it is received.

This secret MUST ONLY be used to verify webhooks coming from XentriPay.

It must NEVER be exposed to our tenants.

It must NEVER be returned through our public API.

It must NEVER be used to sign tenant callbacks.

---

### **B. Tenant webhook secret**

Our payment service has its own webhook system for tenants.

Each tenant must provide:

webhook URL  
webhook secret

The tenant creates/owns this secret.

Example:

Tenant:  
Acme Ltd

Webhook URL:  
https://acme.com/api/payments/webhook

Webhook Secret:  
tenant-generated-secret

This secret belongs to:

Payment Service \<-\> Tenant

It is completely independent from the XentriPay secret.

Our payment service uses the tenant's secret when sending callbacks to that tenant.

---

# **3\. Secret ownership model**

The implementation must enforce this ownership model:

XentriPay Secret  
        ↓  
Owned/managed by Payment Service  
        ↓  
Used ONLY for:  
verifying XentriPay → Payment Service webhooks

Tenant Webhook Secret  
        ↓  
Owned/configured by Tenant  
        ↓  
Used ONLY for:  
signing Payment Service → Tenant webhooks

Never mix these secrets.

---

# **4\. XentriPay webhook registration**

Our payment service should register a webhook with XentriPay using our payment-service webhook endpoint.

Example:

POST /api/webhooks/set  
Authorization: Bearer \<XENTRIPAY\_API\_TOKEN\>  
Content-Type: application/json

Example:

{  
  "businessAccountId": 123,  
  "url": "https://api.ourpaymentservice.com/webhooks/providers/xentripay",  
  "events": \[  
    "COLLECTION\_CREATED",  
    "COLLECTION\_PENDING",  
    "COLLECTION\_SUCCESSFUL",  
    "COLLECTION\_FAILED",  
    "PAYOUT\_CREATED",  
    "PAYOUT\_CONFIRMED",  
    "PAYOUT\_SUCCESS",  
    "PAYOUT\_FAILED",  
    "PAYOUT\_REVERSED",  
    "CHECKOUT\_CREATED",  
    "CHECKOUT\_PENDING",  
    "CHECKOUT\_SUCCESSFUL",  
    "CHECKOUT\_FAILED"  
  \]  
}

The exact events should be limited to those required by our implementation.

XentriPay supports webhook subscriptions for collections, payouts, payment requests, payment links, and checkouts.

When XentriPay returns:

{  
  "secret": "..."  
}

persist that secret securely.

---

# **5\. XentriPay webhook endpoint**

Our payment service should expose a dedicated provider webhook endpoint:

POST /webhooks/providers/xentripay

This endpoint is NOT a tenant webhook endpoint.

It belongs exclusively to the XentriPay provider integration.

---

# **6\. Verify XentriPay webhook before processing**

When XentriPay sends:

X-Xentripay-Signature: sha256=\<hex\>  
X-Xentripay-Event: COLLECTION\_SUCCESSFUL  
X-Xentripay-Idempotency-Key: ...  
X-Xentripay-Timestamp: ...

our payment service must:

1. Read the raw request body.  
2. Load the XentriPay webhook secret.  
3. Calculate HMAC-SHA256 over the raw body.  
4. Compare it securely against `X-Xentripay-Signature`.  
5. Reject the request if verification fails.  
6. Only parse/process the JSON after signature verification.

XentriPay explicitly requires HMAC-SHA256 verification against the raw request body. Re-serializing parsed JSON before verification can cause signature verification to fail.

Pseudo-flow:

Receive request  
      |  
      v  
Read RAW body  
      |  
      v  
Load XentriPay secret  
      |  
      v  
Calculate HMAC-SHA256  
      |  
      v  
Compare with X-Xentripay-Signature  
      |  
   \+--+--+  
   |     |  
 INVALID VALID  
   |     |  
   v     v  
 401   Continue  
         |  
         v  
 Parse JSON

---

# **7\. Idempotency**

XentriPay includes:

"idempotencyKey": "..."

and also provides:

X-Xentripay-Idempotency-Key

The payment service MUST use this value to prevent duplicate processing.

XentriPay can retry webhook deliveries when our endpoint does not return a 2xx response. The documentation specifies up to five attempts with exponential-backoff-style delays.

Therefore:

XentriPay webhook  
       |  
       v  
Verify signature  
       |  
       v  
Check idempotency key  
       |  
       \+---- Already processed \---\> return 200  
       |  
       v  
Process event

The idempotency key should be persisted in a durable store/database rather than relying only on memory.

---

# **8\. Map XentriPay events into our internal payment model**

Do NOT expose XentriPay's raw event structure directly as our internal payment model.

Create a provider adapter:

XentriPayWebhookAdapter

Its responsibility is:

XentriPay Event  
      ↓  
Verify  
      ↓  
Parse  
      ↓  
Normalize  
      ↓  
Internal Payment Event

For example:

COLLECTION\_SUCCESSFUL

could become:

{  
  "event": "payment.succeeded",  
  "provider": "xentripay",  
  "paymentId": "...",  
  "tenantId": "...",  
  "amount": 500,  
  "currency": "RWF",  
  "status": "SUCCESSFUL",  
  "providerReference": "COL-20240502-9871"  
}

The exact internal schema should be defined by our payment service rather than coupling tenants to XentriPay's schema.

---

# **9\. Resolve the tenant**

Every payment created through our service must be associated with a tenant.

For example:

payment  
├── id  
├── tenantId  
├── provider  
├── providerReference  
├── amount  
├── currency  
├── status  
└── metadata

When an XentriPay webhook arrives:

XentriPay event  
      |  
      v  
Find payment by provider reference  
      |  
      v  
Get payment.tenantId  
      |  
      v  
Load tenant configuration  
      |  
      v  
Load tenant webhook URL  
      |  
      v  
Load tenant webhook secret

Never determine the tenant from an untrusted client-provided webhook field without validating it against our own payment records.

---

# **10\. Deliver webhook to the tenant**

After the XentriPay webhook has been authenticated and processed, our payment service may send a callback to the tenant.

Example tenant configuration:

{  
  "tenantId": "tenant\_123",  
  "webhookUrl": "https://tenant.com/api/payment-webhook",  
  "webhookSecret": "tenant-secret"  
}

Our service sends:

POST https://tenant.com/api/payment-webhook  
Content-Type: application/json  
X-Payment-Service-Signature: sha256=\<hex\>  
X-Payment-Service-Event: payment.succeeded  
X-Payment-Service-Idempotency-Key: \<our-event-id\>  
X-Payment-Service-Timestamp: \<timestamp\>

The body should use our normalized payment-event schema.

---

# **11\. Sign tenant webhook using TENANT secret**

The tenant webhook signature must be generated using:

tenant.webhookSecret

NOT:

XentriPay webhook secret

Conceptually:

const signature \= crypto  
  .createHmac('sha256', tenant.webhookSecret)  
  .update(rawBody)  
  .digest('hex');

const header \= \`sha256=${signature}\`;

This creates a separate trust boundary:

XentriPay  
   |  
   | XentriPay secret  
   v  
Payment Service  
   |  
   | Tenant secret  
   v  
Tenant

---

# **12\. Never forward the XentriPay signature**

Do NOT do this:

XentriPay  
X-Xentripay-Signature  
        ↓  
Payment Service  
        ↓  
Tenant

Instead:

XentriPay  
   |  
   | XentriPay signature  
   v  
Payment Service  
   |  
   | Verify  
   |  
   | Create new normalized event  
   |  
   | Sign using tenant secret  
   v  
Tenant

The tenant should have no knowledge of XentriPay.

Likewise, XentriPay should have no knowledge of the tenant's webhook secret.

---

# **13\. Tenant webhook delivery must have its own retry system**

Our payment service should treat tenant delivery independently from XentriPay delivery.

Example:

XentriPay → Payment Service  
       |  
       | successful  
       v  
Payment Service → Tenant  
       |  
       \+-- 2xx → delivered  
       |  
       \+-- 4xx/5xx/timeout  
                    |  
                    v  
                 retry

A failure delivering to the tenant must NOT cause us to reprocess the original XentriPay payment event.

The provider event and tenant delivery should have separate statuses.

For example:

provider\_event\_status \= PROCESSED

tenant\_delivery\_status \= RETRYING

---

# **14\. sample database model**

At minimum, separate these concepts.

### **Provider configuration**

payment\_providers  
\-------------------------  
id  
provider  
environment  
credentials  
webhook\_url  
webhook\_secret  
status  
created\_at  
updated\_at

The XentriPay webhook secret belongs here or in a secure provider credential store.

### **Payments**

payments  
\-------------------------  
id  
tenant\_id  
provider  
provider\_payment\_id  
provider\_reference  
amount  
currency  
status  
created\_at  
updated\_at

### **Webhook events**

webhook\_events  
\-------------------------  
id  
provider  
provider\_event\_id  
idempotency\_key  
event\_type  
payment\_id  
payload  
signature\_verified  
processed\_at  
created\_at

### **Tenant webhook deliveries**

webhook\_deliveries  
\-------------------------  
id  
tenant\_id  
payment\_id  
event\_id  
url  
event\_type  
idempotency\_key  
status  
attempt\_count  
last\_error  
next\_retry\_at  
created\_at  
updated\_at

This separation is important because receiving a provider webhook and successfully delivering a tenant webhook are two different operations.

---

# **15\. Security requirements**

The implementation MUST satisfy all of the following:

### **XentriPay secret**

* Store encrypted/securely.  
* Never expose through API responses.  
* Never expose to tenants.  
* Never log the secret.  
* Never send it to the frontend.  
* Use only for XentriPay signature verification.  
* Store it immediately after XentriPay registration because XentriPay does not return it when listing webhooks.

### **Tenant secret**

* Tenant creates/configures it.  
* Store securely.  
* Never expose in plaintext after creation.  
* Never send it back in normal API responses.  
* Never log it.  
* Use only to sign callbacks sent to that tenant.

### **Both**

* Use HMAC-SHA256.  
* Use constant-time signature comparison.  
* Verify signatures before processing.  
* Preserve raw request body where required.  
* Use HTTPS.  
* Support key/secret rotation.

---

# **16\. Multi-tenant isolation**

This is critical.

Tenant A must never receive:

Tenant B payment  
Tenant B webhook URL  
Tenant B webhook secret  
Tenant B provider credentials  
Tenant B provider webhook data

Every payment and webhook delivery must be scoped to:

tenantId

Example:

XentriPay Payment  
       |  
       v  
providerReference \= XYZ  
       |  
       v  
Payment Record  
       |  
       v  
tenantId \= tenant\_123  
       |  
       v  
Tenant 123 webhook configuration

Never broadcast provider events to every tenant.

---

# **17\. Final end-to-end flow**

The complete production architecture should be:

                    XENTRIPAY  
                         |  
                         |  
             XentriPay webhook  
             \+ signature  
             \+ event  
             \+ idempotency key  
                         |  
                         v  
              ┌──────────────────┐  
              │ PAYMENT SERVICE  │  
              │                  │  
              │ Verify XentriPay │  
              │ signature        │  
              └────────┬─────────┘  
                       |  
                       v  
                Check idempotency  
                       |  
                       v  
                 Find payment  
                       |  
                       v  
                 Resolve tenant  
                       |  
                       v  
              Normalize event  
                       |  
                       v  
              Update payment DB  
                       |  
                       v  
             Create webhook event  
                       |  
                       v  
             ┌──────────────────┐  
             │ Tenant Webhook   │  
             │ Configuration    │  
             │                  │  
             │ URL \+ Secret     │  
             └────────┬─────────┘  
                      |  
                      v  
             Sign with TENANT  
                  SECRET  
                      |  
                      v  
               POST to tenant  
                      |  
                 \+----+----+  
                 |         |  
                2xx       error  
                 |         |  
                 v         v  
             DELIVERED    RETRY

---

# **18\. The key rule for the implementation**

The agent must remember this distinction throughout the implementation:

> **XentriPay webhook secret authenticates XentriPay → Payment Service.**

> **Tenant webhook secret authenticates Payment Service → Tenant.**

These are two separate secrets, two separate trust relationships, and two separate webhook delivery systems.

Do not combine them, reuse them, forward them, or expose one party's secret to another party.

---

# **19\. What I want the coding agent to implement**

Implement this as a provider-agnostic, multi-tenant webhook architecture.

Create a provider interface similar to:

PaymentProvider  
├── initiatePayment()  
├── checkPaymentStatus()  
├── registerWebhook()  
├── verifyWebhook()  
└── normalizeWebhookEvent()

Then:

XentriPayProvider

implements the XentriPay-specific behavior.

The rest of the payment service should not depend directly on XentriPay-specific headers or event names.

Likewise, create a generic:

TenantWebhookService

responsible for:

get tenant webhook configuration  
sign normalized event  
deliver event  
track delivery  
retry failed delivery  
handle idempotency  
rotate tenant secret

This will allow us to add providers later:

XentriPay  
Provider B  
Provider C  
Provider D  
       |  
       v  
Payment Service  
       |  
       v  
Same Tenant Webhook System

The tenant should not need to know which provider processed the payment unless the normalized event explicitly exposes the provider name as metadata.

