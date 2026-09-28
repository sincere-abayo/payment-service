-- Deduplicate webhook logs per batch (keep earliest row) before adding unique constraint
DELETE FROM "webhook_logs" wl
USING "webhook_logs" wl2
WHERE wl."batchId" = wl2."batchId"
  AND wl."createdAt" > wl2."createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "webhook_logs_batchId_key" ON "webhook_logs"("batchId");
