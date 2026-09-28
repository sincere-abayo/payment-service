-- AlterTable
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "userPseudoId" TEXT;

UPDATE "collections" SET "userPseudoId" = 'unknown' WHERE "userPseudoId" IS NULL;

ALTER TABLE "collections" ALTER COLUMN "userPseudoId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "collections_userPseudoId_idx" ON "collections"("userPseudoId");
