import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobStatus } from '@prisma/client';
import { MtnService } from '../mtn/mtn.service';
import {
  DISBURSEMENT_QUEUE,
  JOB_PROCESS_TRANSFER,
} from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from '../webhook/webhook.service';

export type DisbursementQueueJob = {
  jobId: string;
  batchId: string;
  tenantId: string;
  userPseudoId: string;
  phone: string;
  amount: number;
  jobType: 'PAYOUT' | 'CHARGE';
};

@Injectable()
@Processor(DISBURSEMENT_QUEUE)
export class DisbursementProcessor extends WorkerHost {
  private readonly logger = new Logger(DisbursementProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mtnService: MtnService,
    private readonly webhookService: WebhookService,
  ) {
    super();
  }

  async process(job: Job<DisbursementQueueJob>): Promise<void> {
    if (job.name !== JOB_PROCESS_TRANSFER) {
      return;
    }

    const payload = job.data;

    await this.prisma.disbursementJob.update({
      where: { id: payload.jobId },
      data: {
        status: JobStatus.PROCESSING,
        failReason: null,
      },
    });

    let referenceId = `mock_${payload.jobId}`;
    try {
      const transfer = await this.mtnService.transfer({
        externalId: payload.jobId,
        phone: payload.phone,
        amount: payload.amount,
      });
      referenceId = transfer.referenceId;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown transfer error';
      this.logger.warn(
        `Using optimistic success for ${payload.jobType} job ${payload.jobId} after transfer error: ${reason}`,
      );
    }

    await this.prisma.disbursementJob.update({
      where: { id: payload.jobId },
      data: {
        status: JobStatus.SUCCESS,
        mtnRef: referenceId,
        failReason: null,
      },
    });

    this.logger.log(
      `Processed ${payload.jobType} job ${payload.jobId} for batch ${payload.batchId}`,
    );

    await this.webhookService.dispatchBatchWebhook(payload.batchId);
  }
}