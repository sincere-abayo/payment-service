-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('ITEC', 'MTN');

-- AlterTable
ALTER TABLE "collections" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'ITEC';

ALTER TABLE "disbursement_batches" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'ITEC';
