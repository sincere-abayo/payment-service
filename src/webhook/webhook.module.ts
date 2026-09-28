import { Module } from '@nestjs/common';
import { PaymentProviderModule } from '../payment/payment-provider.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { WebhookService } from './webhook.service';
import { WebhookXentryController } from './webhook.xentry.controller';

@Module({
	imports: [PrismaModule, QueueModule, PaymentProviderModule],
	controllers: [WebhookController, WebhookXentryController],
	providers: [WebhookService, WebhookProcessor],
	exports: [WebhookService],
})
export class WebhookModule {}