import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CollectionStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { toPrismaPaymentProvider } from '../payment/payment-provider.mapper';
import { PaymentProviderService } from '../payment/payment-provider.service';
import { COLLECTION_QUEUE, JOB_PROCESS_COLLECTION } from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';

type InitiateCollectionPayload = {
  apiKey?: string;
  idempotencyKey?: unknown;
  userPseudoId?: unknown;
  phone?: unknown;
  amount?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
};

@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderService,
    @InjectQueue(COLLECTION_QUEUE) private readonly collectionQueue: Queue,
  ) {}

  async initiateCollection(
    tenantId: string | undefined,
    payload: InitiateCollectionPayload,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context could not be resolved');
    }

    const idempotencyKey = this.requireString(payload.idempotencyKey, 'idempotencyKey');
    const userPseudoId = this.requireString(payload.userPseudoId, 'userPseudoId');
    const phone = this.normalizePhone(this.requireString(payload.phone, 'phone'));
    const amount = this.requireAmount(payload.amount);
    const customerName = this.optionalString(payload.customerName, 'customerName');
    const customerEmail = this.optionalEmail(payload.customerEmail);

    const existing = await this.findIdempotentCollection(tenantId, idempotencyKey);
    if (existing) {
      return this.initiationResponse(existing, true);
    }

    const providerName = await this.paymentProviders.assertProviderConfigured(
      'collection',
      tenantId,
    );

    let collection;
    try {
      collection = await this.prisma.collection.create({
        data: {
          tenantId,
          idempotencyKey,
          provider: toPrismaPaymentProvider(providerName),
          userPseudoId,
          phone,
          amount,
          status: CollectionStatus.QUEUED,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.findIdempotentCollection(tenantId, idempotencyKey);
        if (raced) {
          return this.initiationResponse(raced, true);
        }
      }
      throw error;
    }

    await this.collectionQueue.add(
      JOB_PROCESS_COLLECTION,
      {
        collectionId: collection.id,
        tenantId,
        provider: providerName,
        phone,
        amount,
        customerName: customerName || userPseudoId,
        customerEmail,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    return this.initiationResponse(collection, false);
  }

  async getCollectionStatus(
    tenantId: string | undefined,
    payload: { collectionId?: unknown },
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context could not be resolved');
    }

    const collectionId = this.requireString(payload.collectionId, 'collectionId');
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, tenantId },
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return {
      collectionId: collection.id,
      status: collection.status,
      provider: collection.provider.toLowerCase(),
      userPseudoId: collection.userPseudoId,
      phone: collection.phone,
      amount: collection.amount,
      providerRef: collection.mtnRef,
      failReason: collection.failReason,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  private async findIdempotentCollection(tenantId: string, idempotencyKey: string) {
    return this.prisma.collection.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
  }

  private initiationResponse(collection: {
    id: string;
    status: CollectionStatus;
    provider: string;
    userPseudoId: string;
    phone: string;
    amount: number;
  }, replay: boolean) {
    return {
      collectionId: collection.id,
      status: collection.status,
      provider: collection.provider.toLowerCase(),
      userPseudoId: collection.userPseudoId,
      phone: collection.phone,
      amount: collection.amount,
      message: replay
        ? `Idempotent replay: returning existing collection ${collection.id}.`
        : 'Collection accepted and queued for processing.',
    };
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }
    return value.trim();
  }

  private optionalEmail(value: unknown): string | undefined {
    const email = this.optionalString(value, 'customerEmail');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('customerEmail must be a valid email address');
    }
    return email;
  }

  private requireAmount(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 100) {
      throw new BadRequestException('amount must be a whole number of at least 100 RWF');
    }
    return value;
  }

  private normalizePhone(value: string): string {
    const compact = value.replace(/[\s()-.]/g, '');
    const international = /^\+?250(7\d{8})$/.exec(compact);
    if (international) {
      return `0${international[1]}`;
    }
    if (/^07\d{8}$/.test(compact)) {
      return compact;
    }
    throw new BadRequestException('phone must be a valid Rwandan Mobile Money number');
  }
}
