-- ITEC Pay admin-configurable settings per account type (normal / merchant)
CREATE TYPE "ItecAccountType" AS ENUM ('NORMAL', 'MERCHANT');

CREATE TABLE "itec_pay_configs" (
    "id" TEXT NOT NULL,
    "accountType" "ItecAccountType" NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itec_pay_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "itec_pay_configs_accountType_key" ON "itec_pay_configs"("accountType");

-- Per-tenant ITEC account type: NORMAL uses the normal account config, MERCHANT the merchant config
ALTER TABLE "tenant_apps" ADD COLUMN "itecAccountType" "ItecAccountType" NOT NULL DEFAULT 'NORMAL';
