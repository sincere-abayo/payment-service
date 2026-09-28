-- Flag withdrawal batches (WDR_INIT creates single-job batches with zero fees).
ALTER TABLE "disbursement_batches" ADD COLUMN "isWithdraw" BOOLEAN NOT NULL DEFAULT false;

-- Backfill historical rows: withdrawals are the only batches allowed totalCharges = 0
-- (DSB_INIT requires totalCharges >= 1).
UPDATE "disbursement_batches" SET "isWithdraw" = true WHERE "totalCharges" = 0;

CREATE INDEX "disbursement_batches_isWithdraw_createdAt_idx" ON "disbursement_batches"("isWithdraw", "createdAt");
