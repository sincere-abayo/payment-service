-- Allow withdrawal/cashout to select a provider independently of disbursement.
ALTER TABLE "payment_routing_configs"
ADD COLUMN "withdrawProvider" "PaymentProvider";
