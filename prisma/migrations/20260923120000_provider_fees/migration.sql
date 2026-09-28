-- XENTRY was added to the Prisma enum without a migration earlier
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'XENTRY';

-- Per-provider fixed fee for withdrawal/cashout/disbursement
CREATE TABLE "provider_fee_configs" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "fixedFee" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_fee_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_fee_configs_provider_key" ON "provider_fee_configs"("provider");

-- Fee breakdown on batches: totalCharged = totalAmount + providerFee
ALTER TABLE "disbursement_batches" ADD COLUMN "providerFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "disbursement_batches" ADD COLUMN "totalCharged" INTEGER NOT NULL DEFAULT 0;

-- Fee breakdown per job: totalCharged = amount + providerFee (payout jobs only)
ALTER TABLE "disbursement_jobs" ADD COLUMN "providerFee" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "disbursement_jobs" ADD COLUMN "totalCharged" INTEGER NOT NULL DEFAULT 0;
