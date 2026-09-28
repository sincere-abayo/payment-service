-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "userPseudoId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'QUEUED',
    "mtnRef" TEXT,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- AlterTable: optional batch link on webhook_logs for collection events
ALTER TABLE "webhook_logs" ALTER COLUMN "batchId" DROP NOT NULL;

ALTER TABLE "webhook_logs" ADD COLUMN "collectionId" TEXT;

-- CreateIndex
CREATE INDEX "collections_tenantId_idx" ON "collections"("tenantId");
CREATE INDEX "collections_userPseudoId_idx" ON "collections"("userPseudoId");
CREATE INDEX "collections_phone_idx" ON "collections"("phone");
CREATE INDEX "collections_status_idx" ON "collections"("status");
CREATE UNIQUE INDEX "collections_tenantId_idempotencyKey_key" ON "collections"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "webhook_logs_collectionId_key" ON "webhook_logs"("collectionId");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
