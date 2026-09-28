import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { JobStatus, PaymentProvider as PrismaPaymentProvider } from '@prisma/client';
import { PaymentProviderService } from '../payment/payment-provider.service';
import { XentryPayHelper } from '../payment/xentry-pay/xentry-pay.helper';
import {
  DISBURSEMENT_QUEUE,
  JOB_CHECK_PAYOUT_STATUS,
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
  /** Recipient registered account name — optional; Xentry returns the validated name. */
  recipientName?: string;
  /** Provider-specific telecom code (e.g. 63510 for Xentry MTN MoMo payouts). */
  telecomProviderId?: string;
};

export type CheckPayoutStatusQueueJob = {
  jobId: string;
  batchId: string;
  attempt: number;
};

/** Delay before the first status poll after a provider accepted a pending payout. */
const FIRST_POLL_DELAY_MS = 30_000;
/** Cap for the exponential poll backoff (30 minutes between checks). */
const MAX_POLL_DELAY_MS = 30 * 60_000;
/** A payout that never reaches a terminal status fails after this window. */
const STATUS_POLL_DEADLINE_MS = 24 * 60 * 60 * 1000;

@Injectable()
@Processor(DISBURSEMENT_QUEUE)
export class DisbursementProcessor extends WorkerHost {
  private readonly logger = new Logger(DisbursementProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderService,
    private readonly xentryHelper: XentryPayHelper,
    private readonly webhookService: WebhookService,
    @InjectQueue(DISBURSEMENT_QUEUE) private readonly disbursementQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<DisbursementQueueJob | CheckPayoutStatusQueueJob>): Promise<void> {
    if (job.name === JOB_PROCESS_TRANSFER) {
      await this.handleTransfer((job as Job<DisbursementQueueJob>).data);
      return;
    }

    if (job.name === JOB_CHECK_PAYOUT_STATUS) {
      await this.handleStatusPoll((job as Job<CheckPayoutStatusQueueJob>).data);
      return;
    }
  }

  private async handleTransfer(payload: DisbursementQueueJob): Promise<void> {
    await this.prisma.disbursementJob.update({
      where: { id: payload.jobId },
      data: {
        status: JobStatus.PROCESSING,
        failReason: null,
      },
    });

    try {
      const transfer = await this.paymentProviders.transfer({
        externalId: payload.jobId,
        phone: payload.phone,
        amount: payload.amount,
        tenantId: payload.tenantId,
        recipientName: payload.recipientName,
        providerCode: payload.telecomProviderId,
      });

      const terminalStatus = transfer.pending ? JobStatus.PROCESSING : JobStatus.SUCCESS;

      await this.prisma.disbursementJob.update({
        where: { id: payload.jobId },
        data: {
          status: terminalStatus,
          mtnRef: transfer.referenceId,
          failReason: null,
          ...(transfer.validatedAccountName
            ? { recipientName: transfer.validatedAccountName }
            : {}),
        },
      });

      if (transfer.pending) {
        await this.scheduleStatusPoll(payload, 0);
        this.logger.log(
          `Job ${payload.jobId} accepted by provider, awaiting final status (poll scheduled)`,
        );
      } else {
        this.logger.log(
          `Processed ${payload.jobType} job ${payload.jobId} for batch ${payload.batchId}`,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown transfer error';

      await this.prisma.disbursementJob.update({
        where: { id: payload.jobId },
        data: {
          status: JobStatus.FAILED,
          failReason: reason,
        },
      });

      this.logger.error(
        `Failed ${payload.jobType} job ${payload.jobId} for batch ${payload.batchId}: ${reason}`,
      );
    }

    await this.webhookService.dispatchBatchWebhook(payload.batchId);
  }

  /**
   * Status-poll fallback: a missed provider webhook must not leave the job in
   * PROCESSING forever. Polls provider status with exponential backoff until a
   * terminal status arrives or the 24h deadline fails the job.
   */
  private async handleStatusPoll(payload: CheckPayoutStatusQueueJob): Promise<void> {
    const { jobId, batchId, attempt } = payload;

    const job = await this.prisma.disbursementJob.findUnique({
      where: { id: jobId },
      include: { batch: { select: { provider: true } } },
    });

    if (!job) {
      return;
    }

    if (job.status === JobStatus.SUCCESS || job.status === JobStatus.FAILED) {
      return;
    }

    const deadline = job.createdAt.getTime() + STATUS_POLL_DEADLINE_MS;

    if (Date.now() >= deadline) {
      await this.prisma.disbursementJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          failReason: `Provider status not confirmed within 24 hours (providerRef: ${job.mtnRef ?? 'none'})`,
        },
      });

      this.logger.warn(
        `Poll deadline reached for job ${jobId}; marked FAILED (providerRef: ${job.mtnRef ?? 'none'})`,
      );

      await this.webhookService.dispatchBatchWebhook(batchId);
      return;
    }

    const isXentry = job.batch.provider === PrismaPaymentProvider.XENTRY;

    if (isXentry && job.mtnRef) {
      try {
        const status = await this.xentryHelper.checkPayoutStatus(job.mtnRef);
        const mapped = this.mapProviderStatus(status.status);

        if (mapped === JobStatus.SUCCESS || mapped === JobStatus.FAILED) {
          const validatedName = status.validatedAccountName?.trim();

          await this.prisma.disbursementJob.update({
            where: { id: job.id },
            data: {
              status: mapped,
              mtnRef: status.internalRef || job.mtnRef,
              failReason:
                mapped === JobStatus.FAILED
                  ? `XentriPay: payout ${status.status.toLowerCase()}${status.statusMessage ? ` (${status.statusMessage})` : ''}`
                  : null,
              ...(validatedName ? { recipientName: validatedName } : {}),
            },
          });

          this.logger.log(`Job ${jobId} status resolved via poll: ${status.status}`);
          await this.webhookService.dispatchBatchWebhook(batchId);
          return;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown status poll error';
        this.logger.warn(`Status poll failed for job ${jobId}: ${reason}`);
      }
    }

    await this.scheduleStatusPoll(payload, attempt + 1, deadline);
  }

  private async scheduleStatusPoll(
    payload: CheckPayoutStatusQueueJob | DisbursementQueueJob,
    attempt: number,
    deadline?: number,
  ): Promise<void> {
    const jobId = payload.jobId;
    const batchId = payload.batchId;

    let delay = Math.min(FIRST_POLL_DELAY_MS * 2 ** attempt, MAX_POLL_DELAY_MS);

    if (deadline) {
      delay = Math.min(delay, Math.max(deadline - Date.now(), 1000));
    }

    await this.disbursementQueue.add(
      JOB_CHECK_PAYOUT_STATUS,
      { jobId, batchId, attempt } satisfies CheckPayoutStatusQueueJob,
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );
  }

  private mapProviderStatus(status: string): JobStatus {
    switch (status) {
      case 'SUCCESSFUL':
      case 'COMPLETED':
        return JobStatus.SUCCESS;
      case 'FAILED':
      case 'REVERSED':
        return JobStatus.FAILED;
      case 'PROCESSING':
        return JobStatus.PROCESSING;
      default:
        return JobStatus.QUEUED;
    }
  }
}
