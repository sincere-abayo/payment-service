-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" TEXT,
    "payload" JSONB NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_idempotencyKey_key" ON "provider_webhook_events"("provider", "idempotencyKey");

-- CreateIndex
CREATE INDEX "provider_webhook_events_createdAt_idx" ON "provider_webhook_events"("createdAt");
