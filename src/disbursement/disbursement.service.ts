import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BatchStatus, JobType, JobStatus } from '@prisma/client';
import {
  DISBURSEMENT_QUEUE,
  JOB_PROCESS_TRANSFER,
} from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';

type RecipientInput = {
  phone: string;
  amount: number;
};

type InitiateDisbursementPayload = {
  apiKey?: string;
  idempotencyKey?: string;
  userPseudoId?: string;
  totalAmount?: number;
  totalCharges?: number;
  chargeReceiver?: string;
  recipients?: RecipientInput[];
};

@Injectable()
export class DisbursementService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DISBURSEMENT_QUEUE) private readonly disbursementQueue: Queue,
  ) {}

  async initiateBatch(tenantId: string | undefined, payload: InitiateDisbursementPayload) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context could not be resolved');
    }

    const idempotencyKey = this.requireString(payload.idempotencyKey, 'idempotencyKey');
    const userPseudoId = this.requireString(payload.userPseudoId, 'userPseudoId');
    const chargeReceiver = this.requireString(payload.chargeReceiver, 'chargeReceiver');
    const totalAmount = this.requirePositiveInteger(payload.totalAmount, 'totalAmount');
    const totalCharges = this.requirePositiveInteger(payload.totalCharges, 'totalCharges');
    const recipients = this.requireRecipients(payload.recipients);

    const recipientTotal = recipients.reduce((sum, recipient) => sum + recipient.amount, 0);
    if (recipientTotal !== totalAmount) {
      throw new BadRequestException(
        `totalAmount (${totalAmount}) must equal sum of recipient amounts (${recipientTotal})`,
      );
    }

    const existing = await this.prisma.disbursementBatch.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: {
        jobs: {
          select: { id: true },
        },
      },
    });

    if (existing) {
      return {
        batchId: existing.id,
        status: existing.status,
        jobCount: existing.jobs.length,
        message: `Idempotent replay: returning existing batch ${existing.id}.`,
      };
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.disbursementBatch.create({
        data: {
          tenantId,
          idempotencyKey,
          userPseudoId,
          totalAmount,
          totalCharges,
          chargeReceiver,
          status: BatchStatus.PROCESSING,
        },
      });

      const queuedJobs: Array<{
        jobId: string;
        batchId: string;
        tenantId: string;
        userPseudoId: string;
        phone: string;
        amount: number;
        jobType: JobType;
      }> = [];

      for (const recipient of recipients) {
        const createdJob = await tx.disbursementJob.create({
          data: {
            batchId: createdBatch.id,
            phone: recipient.phone,
            amount: recipient.amount,
            jobType: JobType.PAYOUT,
            status: JobStatus.QUEUED,
          },
        });

        queuedJobs.push({
          jobId: createdJob.id,
          batchId: createdBatch.id,
          tenantId,
          userPseudoId,
          phone: recipient.phone,
          amount: recipient.amount,
          jobType: JobType.PAYOUT,
        });
      }

      const chargeJob = await tx.disbursementJob.create({
        data: {
          batchId: createdBatch.id,
          phone: chargeReceiver,
          amount: totalCharges,
          jobType: JobType.CHARGE,
          status: JobStatus.QUEUED,
        },
      });

      queuedJobs.push({
        jobId: chargeJob.id,
        batchId: createdBatch.id,
        tenantId,
        userPseudoId,
        phone: chargeReceiver,
        amount: totalCharges,
        jobType: JobType.CHARGE,
      });

      return {
        batch: createdBatch,
        queuedJobs,
      };
    });

    await Promise.all(
      batch.queuedJobs.map((queuedJob) =>
        this.disbursementQueue.add(JOB_PROCESS_TRANSFER, queuedJob, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        }),
      ),
    );

    return {
      batchId: batch.batch.id,
      status: batch.batch.status,
      jobCount: batch.queuedJobs.length,
      message: `Batch accepted. ${batch.queuedJobs.length} jobs queued (${recipients.length} payouts + 1 charge).`,
    };
  }

  async getBatchStatus(tenantId: string | undefined, payload: { batchId?: string }) {
    if (!tenantId) {
      throw new BadRequestException('Tenant context could not be resolved');
    }

    const batchId = this.requireString(payload.batchId, 'batchId');

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

  private requireString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return value.trim();
  }

  private requirePositiveInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }

    return value;
  }

  private requireRecipients(value: unknown): RecipientInput[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('recipients must be a non-empty array');
    }

    return value.map((recipient, index) => {
      if (
        !recipient ||
        typeof recipient !== 'object' ||
        Array.isArray(recipient) ||
        typeof (recipient as RecipientInput).phone !== 'string' ||
        !(recipient as RecipientInput).phone.trim() ||
        typeof (recipient as RecipientInput).amount !== 'number' ||
        !Number.isInteger((recipient as RecipientInput).amount) ||
        (recipient as RecipientInput).amount <= 0
      ) {
        throw new BadRequestException(`recipients[${index}] must include phone and positive integer amount`);
      }

      return {
        phone: (recipient as RecipientInput).phone.trim(),
        amount: (recipient as RecipientInput).amount,
      };
    });
  }
}