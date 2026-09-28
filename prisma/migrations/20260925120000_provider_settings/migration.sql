-- Provider routing (was PAYMENT_PROVIDER_* env vars) — singleton row
CREATE TABLE "payment_routing_configs" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "defaultProvider" "PaymentProvider" NOT NULL DEFAULT 'ITEC',
    "collectionProvider" "PaymentProvider",
    "disbursementProvider" "PaymentProvider",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_routing_configs_pkey" PRIMARY KEY ("id")
);

-- Xentry settings (was XENTRY_PAY_* env vars) — singleton row
CREATE TABLE "xentry_pay_configs" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "baseUrl" TEXT NOT NULL DEFAULT 'https://merchant.test.xentripay.com',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "webhookSecret" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xentry_pay_configs_pkey" PRIMARY KEY ("id")
);

-- MTN MoMo settings (was MTN_* env vars) — singleton row
CREATE TABLE "mtn_pay_configs" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "subscriptionKey" TEXT NOT NULL DEFAULT '',
    "apiUser" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "callbackUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mtn_pay_configs_pkey" PRIMARY KEY ("id")
);
