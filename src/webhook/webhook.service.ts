import { Injectable, Logger } from '@nestjs/common';
import { BatchStatus, JobStatus, WebhookStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CallbackPayload = {
  externalId?: string;
  status?: string;
  reason?: string;
  financialTransactionId?: string;
};

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleMtnCallback(payload: CallbackPayload) {
    if (!payload.externalId) {
      return { handled: false, reason: 'missing externalId' };
    }

    const job = await this.prisma.disbursementJob.findUnique({
      where: { id: payload.externalId },
    });

    if (!job) {
      return { handled: false, reason: 'job not found' };
    }

    const normalized = this.normalizeCallbackStatus(payload.status);

    await this.prisma.disbursementJob.update({
      where: { id: job.id },
      data: {
        status: normalized,
        mtnRef: payload.financialTransactionId ?? job.mtnRef,
        failReason: null,
      },
    });

    await this.dispatchBatchWebhook(job.batchId);

    return { handled: true, jobId: job.id, batchId: job.batchId };
  }

  async dispatchBatchWebhook(batchId: string) {
    const batch = await this.prisma.disbursementBatch.findUnique({
      where: { id: batchId },
      include: {
        tenant: true,
        jobs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!batch) {
      return { dispatched: false, reason: 'batch not found' };
    }

    const allTerminal = batch.jobs.every(
      (job) => job.status === JobStatus.SUCCESS || job.status === JobStatus.FAILED,
    );
    if (!allTerminal) {
      return { dispatched: false, reason: 'jobs still processing' };
    }

    const computedStatus = batch.jobs.some((job) => job.status === JobStatus.FAILED)
      ? BatchStatus.PARTIALLY_FAILED
      : BatchStatus.COMPLETED;

    if (batch.status !== computedStatus) {
      await this.prisma.disbursementBatch.update({
        where: { id: batch.id },
        data: { status: computedStatus },
      });
    }

    const existingLog = await this.prisma.webhookLog.findFirst({
      where: { batchId: batch.id },
    });
    if (existingLog) {
      return { dispatched: false, reason: 'webhook already attempted' };
    }

    if (!batch.tenant.webhookUrl) {
      return { dispatched: false, reason: 'tenant webhook URL not configured' };
    }

    const payload = {
      event: 'batch.completed',
      batchId: batch.id,
      tenantId: batch.tenantId,
      userPseudoId: batch.userPseudoId,
      status: computedStatus,
      totalAmount: batch.totalAmount,
      totalCharges: batch.totalCharges,
      jobs: batch.jobs.map((job) => ({
        jobId: job.id,
        phone: job.phone,
        amount: job.amount,
        type: job.jobType,
        status: job.status,
        mtnRef: job.mtnRef,
        failReason: job.failReason,
      })),
      timestamp: new Date().toISOString(),
    };

    const log = await this.prisma.webhookLog.create({
      data: {
        batchId: batch.id,
        tenantId: batch.tenantId,
        url: batch.tenant.webhookUrl,
        payload,
        status: WebhookStatus.PENDING,
      },
    });

    const now = new Date();

    try {
      const response = await fetch(batch.tenant.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookStatus.SUCCESS,
          attempts: 1,
          lastAttemptAt: now,
        },
      });

      this.logger.log(`Delivered webhook for batch ${batch.id} to ${batch.tenant.webhookUrl}`);
      return { dispatched: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown webhook delivery error';

      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookStatus.FAILED,
          attempts: 1,
          lastAttemptAt: now,
        },
      });

      this.logger.warn(`Failed webhook for batch ${batch.id}: ${reason}`);
      return { dispatched: false, reason };
    }
  }

  private normalizeCallbackStatus(status?: string): JobStatus {
    const normalized = status?.trim().toUpperCase();
    if (normalized && normalized !== 'SUCCESS' && normalized !== 'SUCCESSFUL') {
      this.logger.warn(`Ignoring non-success callback status '${normalized}' and using SUCCESS in mock mode`);
    }

    return JobStatus.SUCCESS;
  }
}