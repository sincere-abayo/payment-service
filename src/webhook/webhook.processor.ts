import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB_SEND_WEBHOOK, WEBHOOK_QUEUE } from '../queue/queue.module';
import { WebhookService } from './webhook.service';

@Injectable()
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly webhookService: WebhookService) {
    super();
  }

  async process(job: Job<{ webhookLogId: string }>): Promise<void> {
    if (job.name !== JOB_SEND_WEBHOOK) {
      return;
    }

    const shouldRetry = await this.webhookService.processWebhookDelivery(
      job.data.webhookLogId,
      job.attemptsMade + 1,
      typeof job.opts.attempts === 'number' ? job.opts.attempts : 1,
    );

    if (shouldRetry) {
      throw new Error('Webhook delivery failed; retry scheduled by queue policy');
    }
  }
}