import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { CollectionStatus, PaymentProvider as PrismaPaymentProvider } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { fromPrismaPaymentProvider } from '../payment/payment-provider.mapper';
import { PaymentProviderService } from '../payment/payment-provider.service';
import { PaymentProviderName } from '../payment/payment-provider.types';
import { XentryHttpError, XentryPayHelper } from '../payment/xentry-pay/xentry-pay.helper';
import {
  COLLECTION_QUEUE,
  JOB_CHECK_COLLECTION_STATUS,
  JOB_PROCESS_COLLECTION,
} from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from '../webhook/webhook.service';

type ProcessCollectionJob = {
  collectionId: string;
  tenantId: string;
  provider: PaymentProviderName;
  phone: string;
  amount: number;
  customerName?: string;
  customerEmail?: string;
};

type CheckCollectionStatusJob = {
  collectionId: string;
  attempt: number;
};

const FIRST_POLL_DELAY_MS = 30_000;
const MAX_POLL_DELAY_MS = 30 * 60_000;
const STATUS_POLL_DEADLINE_MS = 24 * 60 * 60 * 1000;

@Injectable()
@Processor(COLLECTION_QUEUE)
export class CollectionProcessor extends WorkerHost {
  private readonly logger = new Logger(CollectionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderService,
    private readonly xentry: XentryPayHelper,
    private readonly webhooks: WebhookService,
    @InjectQueue(COLLECTION_QUEUE) private readonly collectionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ProcessCollectionJob | CheckCollectionStatusJob>): Promise<void> {
    if (job.name === JOB_PROCESS_COLLECTION) {
      await this.initiate(job.data as ProcessCollectionJob);
      return;
    }
    if (job.name === JOB_CHECK_COLLECTION_STATUS) {
      await this.checkStatus(job.data as CheckCollectionStatusJob);
    }
  }

  private async initiate(payload: ProcessCollectionJob): Promise<void> {
    const claimed = await this.prisma.collection.updateMany({
      where: { id: payload.collectionId, status: CollectionStatus.QUEUED },
      data: { status: CollectionStatus.PROCESSING, failReason: null },
    });
    if (claimed.count === 0) {
      return;
    }

    try {
      const result = await this.paymentProviders.collectWithProvider(payload.provider, {
        externalId: payload.collectionId,
        tenantId: payload.tenantId,
        phone: payload.phone,
        amount: payload.amount,
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
      });

      await this.prisma.collection.updateMany({
        where: {
          id: payload.collectionId,
          status: { in: [CollectionStatus.QUEUED, CollectionStatus.PROCESSING] },
        },
        data: {
          status: result.pending ? CollectionStatus.PROCESSING : CollectionStatus.SUCCESS,
          mtnRef: result.referenceId,
          failReason: null,
        },
      });

      if (result.pending && result.provider === PaymentProviderName.XENTRY) {
        await this.scheduleStatusPoll(payload.collectionId, 0);
      } else {
        await this.webhooks.dispatchCollectionWebhook(payload.collectionId);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown collection error';
      const shouldReconcile =
        payload.provider === PaymentProviderName.XENTRY &&
        (!(error instanceof XentryHttpError) || error.status === 429 || error.status >= 500);

      if (shouldReconcile) {
        this.logger.warn(
          `Xentry collection ${payload.collectionId} initiation was inconclusive; reconciling status: ${reason}`,
        );
        await this.scheduleStatusPoll(payload.collectionId, 0);
        return;
      }

      await this.prisma.collection.updateMany({
        where: {
          id: payload.collectionId,
          status: { in: [CollectionStatus.QUEUED, CollectionStatus.PROCESSING] },
        },
        data: { status: CollectionStatus.FAILED, failReason: reason },
      });
      this.logger.error(`Collection ${payload.collectionId} failed: ${reason}`);
      await this.webhooks.dispatchCollectionWebhook(payload.collectionId);
    }
  }

  private async checkStatus(payload: CheckCollectionStatusJob): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: payload.collectionId },
    });
    if (!collection || collection.status !== CollectionStatus.PROCESSING) {
      return;
    }

    const provider = fromPrismaPaymentProvider(collection.provider);
    if (provider !== PaymentProviderName.XENTRY) {
      return;
    }

    const deadline = collection.createdAt.getTime() + STATUS_POLL_DEADLINE_MS;
    if (Date.now() >= deadline) {
      await this.prisma.collection.updateMany({
        where: { id: collection.id, status: CollectionStatus.PROCESSING },
        data: {
          status: CollectionStatus.FAILED,
          failReason: `Provider status not confirmed within 24 hours (providerRef: ${collection.mtnRef ?? 'none'})`,
        },
      });
      await this.webhooks.dispatchCollectionWebhook(collection.id);
      return;
    }

    try {
      const status = await this.lookupXentryStatus(collection.id, collection.mtnRef);
      if (status.status === 'SUCCESS' || status.status === 'FAILED') {
        const terminal =
          status.status === 'SUCCESS' ? CollectionStatus.SUCCESS : CollectionStatus.FAILED;
        await this.prisma.collection.updateMany({
          where: {
            id: collection.id,
            provider: PrismaPaymentProvider.XENTRY,
            status: CollectionStatus.PROCESSING,
          },
          data: {
            status: terminal,
            mtnRef: status.rid || collection.mtnRef,
            failReason: terminal === CollectionStatus.FAILED ? 'Xentry collection failed' : null,
          },
        });
        await this.webhooks.dispatchCollectionWebhook(collection.id);
        return;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Xentry collection ${collection.id} status check failed: ${reason}`);
    }

    await this.scheduleStatusPoll(collection.id, payload.attempt + 1, deadline);
  }

  private async lookupXentryStatus(collectionId: string, providerRef: string | null) {
    try {
      return await this.xentry.checkCollectionStatus(collectionId);
    } catch (error) {
      const notFound =
        error instanceof XentryHttpError &&
        (error.status === 404 ||
          (error.status === 400 && /(?:not found|no (?:transaction|collection) found)/i.test(error.message)));
      if (!notFound || !providerRef) {
        throw error;
      }
      return this.xentry.checkCollectionStatus(providerRef);
    }
  }

  private async scheduleStatusPoll(
    collectionId: string,
    attempt: number,
    deadline?: number,
  ): Promise<void> {
    let delay = Math.min(FIRST_POLL_DELAY_MS * 2 ** attempt, MAX_POLL_DELAY_MS);
    if (deadline) {
      delay = Math.min(delay, Math.max(deadline - Date.now(), 1000));
    }
    await this.collectionQueue.add(
      JOB_CHECK_COLLECTION_STATUS,
      { collectionId, attempt } satisfies CheckCollectionStatusJob,
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );
  }
}
