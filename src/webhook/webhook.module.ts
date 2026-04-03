import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { WebhookService } from './webhook.service';

@Module({
	imports: [PrismaModule, QueueModule],
	controllers: [WebhookController],
	providers: [WebhookService, WebhookProcessor],
	exports: [WebhookService],
})
export class WebhookModule {}