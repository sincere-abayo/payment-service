import { Injectable, OnModuleInit } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { CommandRegistry } from '../master/command.registry';
import { AdminService } from './admin.service';

@Injectable()
export class AdminCommands implements OnModuleInit {
  private initialized = false;

  constructor(
    private readonly registry: CommandRegistry,
    private readonly adminService: AdminService,
  ) {}

  onModuleInit() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.registry.register({
      code: 'ADM_REGTNT_5I6J',
      description: 'Register a new tenant app.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.registerTenant(context.adminId!, payload);
      },
    });

    this.registry.register({
      code: 'ADM_LSTTNT_3U4V',
      description: 'List all tenants with details.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.listTenants(context.adminId!, payload);
      },
    });

    this.registry.register({
      code: 'ADM_DASHST_8D9E',
      description: 'Get admin dashboard statistics.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.getDashboardStatistics(context.adminId!, payload);
      },
    });

    this.registry.register({
      code: 'ADM_REPORT_0F1G',
      description: 'Get date-filtered admin reports.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.getReportsWithDateFilter(context.adminId!, payload);
      },
    });

    this.registry.register({
      code: 'ADM_GETTNT_2A3B',
      description: 'Get tenant details with API key metadata.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.getTenantWithApiKeys(context.adminId!, payload.tenantId);
      },
    });

    this.registry.register({
      code: 'ADM_UPDTNT_4C5D',
      description: 'Update tenant profile data.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.updateTenant(context.adminId!, payload.tenantId, payload);
      },
    });

    this.registry.register({
      code: 'ADM_APPROV_6K7L',
      description: 'Approve a pending tenant.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.approveTenant(context.adminId!, payload.tenantId);
      },
    });

    this.registry.register({
      code: 'ADM_SUSPTNT_7M8N',
      description: 'Suspend an active tenant.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.suspendTenant(
          context.adminId!,
          payload.tenantId,
          payload.reason,
        );
      },
    });

    this.registry.register({
      code: 'ADM_REVTNT_8O9P',
      description: 'Permanently revoke a tenant.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.revokeTenant(
          context.adminId!,
          payload.tenantId,
          payload.reason,
        );
      },
    });

    this.registry.register({
      code: 'ADM_GENKEY_9Q0R',
      description: 'Generate an API key for an active tenant.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.generateApiKey(context.adminId!, payload.tenantId);
      },
    });

    this.registry.register({
      code: 'ADM_REVKEY_1S2T',
      description: 'Revoke a tenant API key.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.revokeApiKey(
          context.adminId!,
          payload.apiKeyId,
          payload.reason,
        );
      },
    });

    this.registry.register({
      code: 'ADM_REGKEY_6E7F',
      description: 'Regenerate tenant API key (revokes active key and creates a new one).',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.adminService.regenerateApiKey(
          context.adminId!,
          payload.tenantId,
          payload.reason,
        );
      },
    });
  }
}