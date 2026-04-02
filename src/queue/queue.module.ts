import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

export const DISBURSEMENT_QUEUE = 'disbursement';

@Module({
	imports: [
		BullModule.registerQueue({
			name: DISBURSEMENT_QUEUE,
		}),
	],
	exports: [BullModule],
})
export class QueueModule {}