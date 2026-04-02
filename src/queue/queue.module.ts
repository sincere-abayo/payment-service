import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const DISBURSEMENT_QUEUE = 'disbursement';
export const JOB_PROCESS_TRANSFER = 'process-transfer';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DISBURSEMENT_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}