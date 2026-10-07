import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { PaymentProviderModule } from '../payment/payment-provider.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WebhookModule } from '../webhook/webhook.module';
import { CollectionCommands } from './collection.commands';
import { CollectionProcessor } from './collection.processor';
import { CollectionService } from './collection.service';

@Module({
  imports: [MasterModule, PaymentProviderModule, PrismaModule, QueueModule, WebhookModule],
  providers: [CollectionService, CollectionCommands, CollectionProcessor],
  exports: [CollectionService],
})
export class CollectionModule {}
