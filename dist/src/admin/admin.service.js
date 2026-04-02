"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async registerTenant(adminId, payload) {
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
    async approveTenant(adminId, tenantId) {
        const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            throw new common_1.NotFoundException('Tenant not found');
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
    async suspendTenant(adminId, tenantId, reason) {
        const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            throw new common_1.NotFoundException('Tenant not found');
        }
        if (tenant.status !== 'ACTIVE') {
            throw new common_1.BadRequestException('Only ACTIVE tenants can be suspended');
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
    async revokeTenant(adminId, tenantId, reason) {
        const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            throw new common_1.NotFoundException('Tenant not found');
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
    async generateApiKey(adminId, tenantId) {
        const tenant = await this.prisma.tenantApp.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            throw new common_1.NotFoundException('Tenant not found');
        }
        if (tenant.status !== 'ACTIVE') {
            throw new common_1.BadRequestException('Tenant must be ACTIVE to generate an API key');
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
    async revokeApiKey(adminId, apiKeyId, reason) {
        const apiKey = await this.prisma.apiKey.findUnique({ where: { id: apiKeyId } });
        if (!apiKey) {
            throw new common_1.NotFoundException('API key not found');
        }
        if (apiKey.status === 'REVOKED') {
            throw new common_1.BadRequestException('API key already revoked');
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
    createRawApiKey() {
        return `momo_${(0, crypto_1.randomBytes)(32).toString('hex')}`;
    }
    hashKey(rawKey) {
        return (0, crypto_1.createHash)('sha256').update(rawKey).digest('hex');
    }
    async logAction(adminId, data) {
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
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
