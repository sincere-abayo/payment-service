import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async listBatches(
    tenantId: string | undefined,
    payload: { limit?: number; offset?: number },
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context could not be resolved');
    }

    const limit =
      typeof payload.limit === 'number' && Number.isInteger(payload.limit) && payload.limit > 0
        ? Math.min(payload.limit, 100)
        : 20;

    const offset =
      typeof payload.offset === 'number' && Number.isInteger(payload.offset) && payload.offset >= 0
        ? payload.offset
        : 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.disbursementBatch.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          jobs: {
            select: {
              status: true,
            },
          },
        },
      }),
      this.prisma.disbursementBatch.count({ where: { tenantId } }),
    ]);

    return {
      total,
      limit,
      offset,
      items: items.map((batch) => ({
        batchId: batch.id,
        status: batch.status,
        totalAmount: batch.totalAmount,
        totalCharges: batch.totalCharges,
        chargeReceiver: batch.chargeReceiver,
        jobCount: batch.jobs.length,
        successCount: batch.jobs.filter((job) => job.status === 'SUCCESS').length,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      })),
    };
  }

  async getBatchStatus(tenantId: string | undefined, payload: { batchId?: string }) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context could not be resolved');
    }

    const batchId = payload.batchId?.trim();
    if (!batchId) {
      throw new BadRequestException('batchId is required');
    }

    const batch = await this.prisma.disbursementBatch.findFirst({
      where: { id: batchId, tenantId },
      include: {
        jobs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    return {
      batchId: batch.id,
      status: batch.status,
      totalAmount: batch.totalAmount,
      totalCharges: batch.totalCharges,
      chargeReceiver: batch.chargeReceiver,
      userPseudoId: batch.userPseudoId,
      jobs: batch.jobs.map((job) => ({
        jobId: job.id,
        phone: job.phone,
        amount: job.amount,
        type: job.jobType,
        status: job.status,
        mtnRef: job.mtnRef,
        failReason: job.failReason,
      })),
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }
}