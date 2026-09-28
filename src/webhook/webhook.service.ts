import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { BatchStatus, JobStatus, Prisma, WebhookStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_SEND_WEBHOOK,
  WEBHOOK_QUEUE,
} from '../queue/queue.module';

type CallbackPayload = {
  externalId?: string;
  status?: string;
  reason?: string;
  financialTransactionId?: string;
};

export type XentriPayWebhookInput = {
  event: string;
  data: {
    id: number;
    amount: number;
    currency: string;
    status: string;
    reference: string;
    businessAccountId: number;
    createdAt: string;
    [key: string]: unknown;
  };
  timestamp: string;
  idempotencyKey: string;
  eventType: string;
};

type NormalizedXentriPayEvent = {
  event: string;
  provider: 'xentripay';
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  providerReference: string;
  providerEventId: number;
  metadata: Record<string, unknown>;
};

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

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

  async handleXentriPayWebhook(input: XentriPayWebhookInput) {
    const { event, data, timestamp, idempotencyKey, eventType } = input;

    this.logger.log(
      `XentriPay webhook received event=${event} eventType=${eventType} idempotencyKey=${idempotencyKey} providerReference=${data.reference}`,
    );

    const idempotency = await this.checkAndRecordIdempotency(idempotencyKey, event, data);
    if (idempotency.duplicate) {
      this.logger.log(`Duplicate XentriPay webhook ignored idempotencyKey=${idempotencyKey}`);
      return { handled: true, duplicate: true };
    }
    const recordId = idempotency.recordId;

    const normalized = this.normalizeXentriPayEvent(event, data, eventType, idempotencyKey, timestamp);
    if (!normalized) {
      this.logger.warn(`Unsupported XentriPay event type: ${event}`);
      await this.markWebhookProcessed(recordId);
      return { handled: false, reason: 'unsupported event type' };
    }

    const payment = await this.findPaymentByProviderReference(normalized.providerReference);
    if (!payment) {
      this.logger.warn(`Payment not found for provider reference ${normalized.providerReference}`);
      return { handled: false, reason: 'payment not found' };
    }

    await this.updatePaymentStatus(payment, normalized);

    await this.markWebhookProcessed(recordId);

    return { handled: true, jobId: payment.id, batchId: payment.batchId };
  }

  /**
   * Inbound webhook idempotency (provider_webhook_events): record every key on
   * first sight, and skip reprocessing once the event has been fully handled.
   */
  private async checkAndRecordIdempotency(
    idempotencyKey: string,
    event: string,
    data: XentriPayWebhookInput['data'],
  ): Promise<{ duplicate: boolean; recordId: string | null }> {
    const existing = await this.prisma.providerWebhookEvent.findUnique({
      where: {
        provider_idempotencyKey: { provider: 'xentry', idempotencyKey },
      },
    });

    if (existing) {
      return { duplicate: Boolean(existing.processedAt), recordId: existing.id };
    }

    try {
      const record = await this.prisma.providerWebhookEvent.create({
        data: {
          provider: 'xentry',
          idempotencyKey,
          eventType: event,
          payload: { event, data } as Prisma.InputJsonValue,
          signatureVerified: true,
        },
      });

      return { duplicate: false, recordId: record.id };
    } catch (error) {
      const known = error instanceof Prisma.PrismaClientKnownRequestError;
      if (known && error.code === 'P2002') {
        // Lost a race with a concurrent delivery of the same event.
        const raced = await this.prisma.providerWebhookEvent.findUnique({
          where: {
            provider_idempotencyKey: { provider: 'xentry', idempotencyKey },
          },
        });

        return { duplicate: Boolean(raced?.processedAt), recordId: raced?.id ?? null };
      }

      throw error;
    }
  }

  private async markWebhookProcessed(recordId: string | null): Promise<void> {
    if (!recordId) {
      return;
    }

    await this.prisma.providerWebhookEvent.update({
      where: { id: recordId },
      data: { processedAt: new Date() },
    });
  }

  private normalizeXentriPayEvent(
    event: string,
    data: XentriPayWebhookInput['data'],
    eventType: string,
    idempotencyKey: string,
    timestamp: string,
  ): NormalizedXentriPayEvent | null {
    let internalEvent: string;
    let internalStatus: string;

    switch (event) {
      case 'COLLECTION_SUCCESSFUL':
        internalEvent = 'payment.succeeded';
        internalStatus = 'SUCCESSFUL';
        break;
      case 'COLLECTION_FAILED':
        internalEvent = 'payment.failed';
        internalStatus = 'FAILED';
        break;
      case 'COLLECTION_CREATED':
        internalEvent = 'payment.initiated';
        internalStatus = 'PENDING';
        break;
      case 'COLLECTION_PENDING':
        internalEvent = 'payment.pending';
        internalStatus = 'PENDING';
        break;
      case 'PAYOUT_SUCCESS':
        internalEvent = 'payout.succeeded';
        internalStatus = 'SUCCESSFUL';
        break;
      case 'PAYOUT_FAILED':
        internalEvent = 'payout.failed';
        internalStatus = 'FAILED';
        break;
      case 'PAYOUT_CREATED':
        internalEvent = 'payout.initiated';
        internalStatus = 'PENDING';
        break;
      case 'PAYOUT_CONFIRMED':
        internalEvent = 'payout.confirmed';
        internalStatus = 'PROCESSING';
        break;
      case 'PAYOUT_REVERSED':
        internalEvent = 'payout.reversed';
        internalStatus = 'REVERSED';
        break;
      case 'CHECKOUT_SUCCESSFUL':
        internalEvent = 'checkout.succeeded';
        internalStatus = 'SUCCESSFUL';
        break;
      case 'CHECKOUT_FAILED':
        internalEvent = 'checkout.failed';
        internalStatus = 'FAILED';
        break;
      case 'CHECKOUT_CREATED':
        internalEvent = 'checkout.initiated';
        internalStatus = 'PENDING';
        break;
      case 'CHECKOUT_PENDING':
        internalEvent = 'checkout.pending';
        internalStatus = 'PENDING';
        break;
      case 'PAYMENT_REQUEST_COMPLETED':
        internalEvent = 'payment_request.completed';
        internalStatus = 'SUCCESSFUL';
        break;
      case 'PAYMENT_REQUEST_FAILED':
        internalEvent = 'payment_request.failed';
        internalStatus = 'FAILED';
        break;
      default:
        return null;
    }

    return {
      event: internalEvent,
      provider: 'xentripay',
      paymentId: data.reference,
      amount: data.amount,
      currency: data.currency,
      status: internalStatus,
      providerReference: data.reference,
      providerEventId: data.id,
      metadata: {
        xentriPayEvent: event,
        xentriPayEventType: eventType,
        xentriPayBusinessAccountId: data.businessAccountId,
        xentriPayCreatedAt: data.createdAt,
        xentriPayTimestamp: timestamp,
        idempotencyKey,
      },
    };
  }

  private async findPaymentByProviderReference(providerReference: string) {
    // XentriPay references can be either our customerReference (job id) or the
    // provider-returned internalRef (stored in mtnRef after initiation).
    return this.prisma.disbursementJob.findFirst({
      where: {
        OR: [{ mtnRef: providerReference }, { id: providerReference }],
      },
      select: { id: true, batchId: true },
    });
  }

  private async updatePaymentStatus(
    payment: { id: string; batchId: string },
    event: NormalizedXentriPayEvent,
  ) {
    const newStatus = this.mapEventToStatus(event.status);

    await this.prisma.disbursementJob.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        mtnRef: event.providerReference,
        failReason:
          newStatus === JobStatus.FAILED ? `XentriPay: ${event.status.toLowerCase()}` : null,
      },
    });

    await this.dispatchBatchWebhook(payment.batchId);
  }

  private mapEventToStatus(eventStatus: string): JobStatus {
    switch (eventStatus) {
      case 'SUCCESSFUL':
        return JobStatus.SUCCESS;
      case 'FAILED':
      case 'REVERSED':
        return JobStatus.FAILED;
      case 'PENDING':
      case 'PROCESSING':
        return JobStatus.PROCESSING;
      default:
        return JobStatus.PROCESSING;
    }
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
      where: {
        batchId: batch.id,
        status: {
          in: [WebhookStatus.PENDING, WebhookStatus.RETRYING, WebhookStatus.SUCCESS],
        },
      },
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

    await this.webhookQueue.add(
      JOB_SEND_WEBHOOK,
      { webhookLogId: log.id },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    return { dispatched: true };
  }

  async processWebhookDelivery(
    webhookLogId: string,
    currentAttempt: number,
    maxAttempts: number,
  ): Promise<boolean> {
    const log = await this.prisma.webhookLog.findUnique({
      where: { id: webhookLogId },
    });

    if (!log) {
      return false;
    }

    const now = new Date();

    try {
      const response = await fetch(log.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(log.payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookStatus.SUCCESS,
          attempts: currentAttempt,
          lastAttemptAt: now,
        },
      });

      this.logger.log(`Delivered webhook ${log.id} to ${log.url}`);
      return false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown webhook delivery error';
      const exhausted = currentAttempt >= maxAttempts;

      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: exhausted ? WebhookStatus.FAILED : WebhookStatus.RETRYING,
          attempts: currentAttempt,
          lastAttemptAt: now,
        },
      });

      this.logger.warn(
        `Failed webhook ${log.id} attempt ${currentAttempt}/${maxAttempts}: ${reason}`,
      );

      return !exhausted;
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