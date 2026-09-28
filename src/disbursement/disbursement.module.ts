import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { PaymentProviderModule } from '../payment/payment-provider.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WebhookModule } from '../webhook/webhook.module';
import { DisbursementCommands } from './disbursement.commands';
import { DisbursementProcessor } from './disbursement.processor';
import { DisbursementService } from './disbursement.service';

@Module({
  imports: [MasterModule, PaymentProviderModule, PrismaModule, QueueModule, WebhookModule],
  providers: [DisbursementService, DisbursementCommands, DisbursementProcessor],
  exports: [DisbursementService],
})
export class DisbursementModule {}
