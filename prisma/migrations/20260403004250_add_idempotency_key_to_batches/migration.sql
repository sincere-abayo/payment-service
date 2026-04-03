/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,idempotencyKey]` on the table `disbursement_batches` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "disbursement_batches" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE INDEX "disbursement_batches_idempotencyKey_idx" ON "disbursement_batches"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_batches_tenantId_idempotencyKey_key" ON "disbursement_batches"("tenantId", "idempotencyKey");
