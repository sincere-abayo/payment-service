import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const DISBURSEMENT_QUEUE = 'disbursement';
export const JOB_PROCESS_TRANSFER = 'process-transfer';
export const JOB_CHECK_PAYOUT_STATUS = 'check-payout-status';
export const COLLECTION_QUEUE = 'collection';
export const JOB_PROCESS_COLLECTION = 'process-collection';
export const JOB_CHECK_COLLECTION_STATUS = 'check-collection-status';
export const WEBHOOK_QUEUE = 'webhook';
export const JOB_SEND_WEBHOOK = 'send-webhook';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DISBURSEMENT_QUEUE,
    }),
    BullModule.registerQueue({
      name: WEBHOOK_QUEUE,
    }),
    BullModule.registerQueue({
      name: COLLECTION_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
