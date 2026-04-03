import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async registerTenant(
    adminId: string,
    payload: { name: string; email: string; webhookUrl?: string; status?: string },
  ) {
    const status = this.normalizeTenantStatus(payload.status);

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