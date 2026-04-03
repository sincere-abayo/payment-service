import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const DISBURSEMENT_QUEUE = 'disbursement';
export const JOB_PROCESS_TRANSFER = 'process-transfer';
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
  ],
  exports: [BullModule],
})
export class QueueModule {}