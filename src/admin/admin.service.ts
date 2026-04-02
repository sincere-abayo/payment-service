import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async registerTenant(
    adminId: string,
    payload: { name: string; email: string; webhookUrl?: string },
  ) {
    const tenant = await this.prisma.tenantApp.create({
      data: {
        name: payload.name,
        email: payload.email,
        webhookUrl: payload.webhookUrl,
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