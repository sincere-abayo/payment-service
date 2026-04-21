-- Backfill senderPhone for pre-existing rows, then enforce non-null sender number.
UPDATE "public"."disbursement_batches"
SET "senderPhone" = "chargeReceiver"
WHERE "senderPhone" IS NULL;

ALTER TABLE "public"."disbursement_batches"
ALTER COLUMN "senderPhone" SET NOT NULL;
