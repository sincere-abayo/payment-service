import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async registerTenant(
    adminId: string,
    payload: { name: string; email: string; webhookUrl?: string; status?: string },
  ) {
    const status = this.normalizeTenantStatus(payload.status);

    try {
      const tenant = await this.prisma.tenantApp.create({
        data: {
          name: payload.name,
          email: payload.email,
          webhookUrl: payload.webhookUrl,
          status,
        },
      });

      await this.logAction(adminId, {
        action: 'REGISTERED_TENANT',
        targetType: 'TenantApp',
        targetId: tenant.id,
        note: `Registered tenant ${tenant.email}`,
      });

      return tenant;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('A tenant with this email already exists');
        }
      }
      throw error;
    }
  }

  async getTenantWithApiKeys(adminId: string, tenantId: string) {
    const tenant = await this.prisma.tenantApp.findUnique({
      where: { id: tenantId },
      include: {
        apiKeys: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            createdAt: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    await this.logAction(adminId, {
      action: 'VIEWED_TENANT',
      targetType: 'TenantApp',
      targetId: tenantId,
    });

    return tenant;
  }

  async listTenants(
    adminId: string,
    payload: { limit?: number; offset?: number; status?: string; q?: string },
  ) {
    const limit =
      typeof payload.limit === 'number' && Number.isInteger(payload.limit) && payload.limit > 0
        ? Math.min(payload.limit, 200)
        : 100;

    const offset =
      typeof payload.offset === 'number' && Number.isInteger(payload.offset) && payload.offset >= 0
        ? payload.offset
        : 0;

    const where: {
      status?: TenantStatus;
      OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; email?: { contains: string; mode: 'insensitive' } }>;
    } = {};

    if (payload.status !== undefined) {
      where.status = this.normalizeTenantStatus(payload.status);
    }

    const query = payload.q?.trim();
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantApp.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          apiKeys: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              createdAt: true,
              revokedAt: true,
            },
          },
          batches: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.tenantApp.count({ where }),
    ]);

    await this.logAction(adminId, {
      action: 'LISTED_TENANTS',
      targetType: 'TenantApp',
      targetId: 'all',
      note: `limit=${limit}, offset=${offset}${where.status ? `, status=${where.status}` : ''}${query ? `, q=${query}` : ''}`,
    });

    return {
      total,
      limit,
      offset,
      items: items.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        webhookUrl: tenant.webhookUrl,
        status: tenant.status,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        apiKeys: tenant.apiKeys,
        batchSummary: {
          total: tenant.batches.length,
          completed: tenant.batches.filter((batch) => batch.status === 'COMPLETED').length,
          partiallyFailed: tenant.batches.filter((batch) => batch.status === 'PARTIALLY_FAILED').length,
          processing: tenant.batches.filter((batch) => batch.status === 'PROCESSING').length,
        },
      })),
    };
  }

  async getDashboardStatistics(
    adminId: string,
    payload: { fromDate?: string; toDate?: string },
  ) {
    const range = this.resolveDateRange(payload, { defaultLastDays: 30 });
    const createdAtFilter: Prisma.DateTimeFilter = {
      gte: range.from,
      lte: range.to,
    };

    const [tenantTotal, tenantByStatus, batchAggregate, batchByStatus, jobByStatus, webhookByStatus] =
      await this.prisma.$transaction([
        this.prisma.tenantApp.count({ where: { createdAt: createdAtFilter } }),
        this.prisma.tenantApp.groupBy({
          by: ['status'],
          where: { createdAt: createdAtFilter },
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.disbursementBatch.aggregate({
          where: { createdAt: createdAtFilter },
          _count: { _all: true },
          _sum: { totalAmount: true, totalCharges: true },
        }),
        this.prisma.disbursementBatch.groupBy({
          by: ['status'],
          where: { createdAt: createdAtFilter },
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.disbursementJob.groupBy({
          by: ['status'],
          where: { batch: { createdAt: createdAtFilter } },
          orderBy: { status: 'asc' },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.webhookLog.groupBy({
          by: ['status'],
          where: { createdAt: createdAtFilter },
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
      ]);

    await this.logAction(adminId, {
      action: 'VIEWED_DASHBOARD_STATS',
      targetType: 'Dashboard',
      targetId: 'summary',
      note: `from=${range.from.toISOString()},to=${range.to.toISOString()}`,
    });

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      tenants: {
        total: tenantTotal,
        byStatus: this.toCountMap(tenantByStatus),
      },
      batches: {
        total: batchAggregate._count._all,
        totalAmount: batchAggregate._sum.totalAmount ?? 0,
        totalCharges: batchAggregate._sum.totalCharges ?? 0,
        byStatus: this.toCountMap(batchByStatus),
      },
      jobs: {
        byStatus: jobByStatus.reduce<Record<string, { count: number; totalAmount: number }>>(
          (acc, row) => {
            acc[row.status] = {
              count: this.extractCountAll(row),
              totalAmount: this.extractSumNumber(row, 'amount'),
            };
            return acc;
          },
          {},
        ),
      },
      webhooks: {
        byStatus: this.toCountMap(webhookByStatus),
      },
    };
  }

  async getReportsWithDateFilter(
    adminId: string,
    payload: { fromDate?: string; toDate?: string },
  ) {
    const range = this.resolveDateRange(payload, { requireExplicit: true });
    const createdAtFilter: Prisma.DateTimeFilter = {
      gte: range.from,
      lte: range.to,
    };

    const [batches, jobs, webhookLogs, topTenantRows] = await this.prisma.$transaction([
      this.prisma.disbursementBatch.findMany({
        where: { createdAt: createdAtFilter },
        select: {
          id: true,
          tenantId: true,
          createdAt: true,
          status: true,
          totalAmount: true,
          totalCharges: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.disbursementJob.findMany({
        where: { batch: { createdAt: createdAtFilter } },
        select: {
          createdAt: true,
          status: true,
          amount: true,
        },
      }),
      this.prisma.webhookLog.findMany({
        where: { createdAt: createdAtFilter },
        select: {
          createdAt: true,
          status: true,
        },
      }),
      this.prisma.disbursementBatch.groupBy({
        by: ['tenantId'],
        where: { createdAt: createdAtFilter },
        _count: { _all: true },
        _sum: { totalAmount: true, totalCharges: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      }),
    ]);

    const tenantIds = topTenantRows.map((row) => row.tenantId);
    const tenantMap = new Map<string, { id: string; name: string; email: string }>();
    if (tenantIds.length) {
      const tenants = await this.prisma.tenantApp.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, email: true },
      });
      for (const tenant of tenants) {
        tenantMap.set(tenant.id, tenant);
      }
    }

    const daily = new Map<
      string,
      {
        batches: number;
        batchAmount: number;
        batchCharges: number;
        successfulJobs: number;
        failedJobs: number;
        webhooksSuccess: number;
        webhooksFailed: number;
      }
    >();

    const ensureDaily = (date: string) => {
      if (!daily.has(date)) {
        daily.set(date, {
          batches: 0,
          batchAmount: 0,
          batchCharges: 0,
          successfulJobs: 0,
          failedJobs: 0,
          webhooksSuccess: 0,
          webhooksFailed: 0,
        });
      }

      return daily.get(date)!;
    };

    for (const batch of batches) {
      const date = this.toIsoDate(batch.createdAt);
      const row = ensureDaily(date);
      row.batches += 1;
      row.batchAmount += batch.totalAmount;
      row.batchCharges += batch.totalCharges;
    }

    for (const job of jobs) {
      const date = this.toIsoDate(job.createdAt);
      const row = ensureDaily(date);
      if (job.status === 'SUCCESS') {
        row.successfulJobs += 1;
      } else if (job.status === 'FAILED') {
        row.failedJobs += 1;
      }
    }

    for (const webhook of webhookLogs) {
      const date = this.toIsoDate(webhook.createdAt);
      const row = ensureDaily(date);
      if (webhook.status === 'SUCCESS') {
        row.webhooksSuccess += 1;
      }
      if (webhook.status === 'FAILED') {
        row.webhooksFailed += 1;
      }
    }

    await this.logAction(adminId, {
      action: 'VIEWED_REPORTS',
      targetType: 'Report',
      targetId: 'date-range',
      note: `from=${range.from.toISOString()},to=${range.to.toISOString()}`,
    });

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      summary: {
        totalBatches: batches.length,
        totalJobs: jobs.length,
        totalWebhooks: webhookLogs.length,
        totalAmount: batches.reduce((sum, batch) => sum + batch.totalAmount, 0),
        totalCharges: batches.reduce((sum, batch) => sum + batch.totalCharges, 0),
      },
      topTenants: topTenantRows.map((row) => ({
        tenantId: row.tenantId,
        name: tenantMap.get(row.tenantId)?.name ?? 'Unknown tenant',
        email: tenantMap.get(row.tenantId)?.email ?? null,
        batchCount: this.extractCountAll(row),
        totalAmount: this.extractSumNumber(row, 'totalAmount'),
        totalCharges: this.extractSumNumber(row, 'totalCharges'),
      })),
      daily: Array.from(daily.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, row]) => ({ date, ...row })),
    };
  }

  async updateTenant(
    adminId: string,
    tenantId: string,
    payload: { name?: string; email?: string; webhookUrl?: string | null; status?: string },
  ) {
    const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const data: {
      name?: string;
      email?: string;
      webhookUrl?: string | null;
      status?: TenantStatus;
    } = {};

    if (payload.name !== undefined) {
      data.name = payload.name;
    }
    if (payload.email !== undefined) {
      data.email = payload.email;
    }
    if (payload.webhookUrl !== undefined) {
      data.webhookUrl = payload.webhookUrl;
    }
    if (payload.status !== undefined) {
      data.status = this.normalizeTenantStatus(payload.status);
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No fields provided for update');
    }

    const updated = await this.prisma.tenantApp.update({
      where: { id: tenantId },
      data,
    });

    await this.logAction(adminId, {
      action: 'UPDATED_TENANT',
      targetType: 'TenantApp',
      targetId: tenantId,
    });

    return updated;
  }

  async approveTenant(adminId: string, tenantId: string) {
    const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.tenantApp.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });

    await this.logAction(adminId, {
      action: 'APPROVED_TENANT',
      targetType: 'TenantApp',
      targetId: tenantId,
    });

    return updated;
  }

  async suspendTenant(adminId: string, tenantId: string, reason?: string) {
    const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE tenants can be suspended');
    }

    const updated = await this.prisma.tenantApp.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' },
    });

    await this.logAction(adminId, {
      action: 'SUSPENDED_TENANT',
      targetType: 'TenantApp',
      targetId: tenantId,
      note: reason,
    });

    return updated;
  }

  async revokeTenant(adminId: string, tenantId: string, reason?: string) {
    const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const updated = await this.prisma.tenantApp.update({
      where: { id: tenantId },
      data: { status: 'REVOKED' },
    });

    await this.logAction(adminId, {
      action: 'REVOKED_TENANT',
      targetType: 'TenantApp',
      targetId: tenantId,
      note: reason,
    });

    return updated;
  }

  async generateApiKey(adminId: string, tenantId: string) {
    const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Tenant must be ACTIVE to generate an API key');
    }

    const rawKey = this.createRawApiKey();
    const hashedKey = this.hashKey(rawKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId,
        key: hashedKey,
        status: 'ACTIVE',
      },
    });

    await this.logAction(adminId, {
      action: 'GENERATED_API_KEY',
      targetType: 'ApiKey',
      targetId: apiKey.id,
      note: `Generated API key for tenant ${tenantId}`,
    });

    return {
      apiKeyId: apiKey.id,
      tenantId,
      rawApiKey: rawKey,
      createdAt: apiKey.createdAt,
    };
  }

  async revokeApiKey(adminId: string, apiKeyId: string, reason?: string) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.status === 'REVOKED') {
      throw new BadRequestException('API key already revoked');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await this.logAction(adminId, {
      action: 'REVOKED_API_KEY',
      targetType: 'ApiKey',
      targetId: apiKeyId,
      note: reason,
    });

    return updated;
  }

  async regenerateApiKey(adminId: string, tenantId: string, reason?: string) {
    const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Tenant must be ACTIVE to regenerate API key');
    }

    await this.prisma.apiKey.updateMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    const generated = await this.generateApiKey(adminId, tenantId);

    await this.logAction(adminId, {
      action: 'REGENERATED_API_KEY',
      targetType: 'TenantApp',
      targetId: tenantId,
      note: reason,
    });

    return generated;
  }

  private normalizeTenantStatus(status?: string): TenantStatus {
    if (!status) {
      return 'PENDING';
    }

    const normalized = status.trim().toUpperCase();

    // Allow admin UX aliases.
    if (normalized === 'APPROVE' || normalized === 'APPROVED') {
      return 'ACTIVE';
    }

    const valid = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'];
    if (!valid.includes(normalized)) {
      throw new BadRequestException(
        `Invalid status. Expected one of: ${valid.join(', ')}`,
      );
    }

    return normalized as TenantStatus;
  }

  private resolveDateRange(
    payload: { fromDate?: string; toDate?: string },
    options: { requireExplicit?: boolean; defaultLastDays?: number } = {},
  ) {
    const { requireExplicit = false, defaultLastDays = 30 } = options;
    const fromRaw = payload.fromDate?.trim();
    const toRaw = payload.toDate?.trim();

    if (requireExplicit && (!fromRaw || !toRaw)) {
      throw new BadRequestException('fromDate and toDate are required');
    }

    const to = toRaw ? new Date(toRaw) : new Date();
    const from = fromRaw
      ? new Date(fromRaw)
      : new Date(to.getTime() - defaultLastDays * 24 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO date-time strings');
    }

    if (from > to) {
      throw new BadRequestException('fromDate must be less than or equal to toDate');
    }

    return { from, to };
  }

  private toIsoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toCountMap<T extends { status: string; _count?: unknown }>(
    rows: T[],
  ) {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = this.extractCountAll(row);
      return acc;
    }, {});
  }

  private extractCountAll(row: { _count?: unknown }): number {
    if (!row || row._count === undefined || row._count === true || row._count === false) {
      return 0;
    }

    const countValue = (row._count as Record<string, unknown>)._all;
    return typeof countValue === 'number' ? countValue : 0;
  }

  private extractSumNumber(
    row: { _sum?: unknown },
    field: string,
  ): number {
    if (!row || row._sum === undefined || row._sum === true || row._sum === false) {
      return 0;
    }

    const value = (row._sum as Record<string, unknown>)[field];
    return typeof value === 'number' ? value : 0;
  }

  private createRawApiKey(): string {
    return `momo_${randomBytes(32).toString('hex')}`;
  }

  private hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  private async logAction(
    adminId: string,
    data: {
      action: string;
      targetType: string;
      targetId: string;
      note?: string;
    },
  ) {
    await this.prisma.adminAction.create({
      data: {
        adminId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        note: data.note,
      },
    });
  }
}