-- Add sender phone to identify the debit/approval line for each batch.
ALTER TABLE "public"."disbursement_batches"
ADD COLUMN "senderPhone" TEXT;

CREATE INDEX "disbursement_batches_senderPhone_idx"
ON "public"."disbursement_batches"("senderPhone");
