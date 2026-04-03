import { Injectable, OnModuleInit } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { CommandRegistry } from '../master/command.registry';
import { TenantService } from './tenant.service';

@Injectable()
export class TenantCommands implements OnModuleInit {
  private initialized = false;

  constructor(
    private readonly registry: CommandRegistry,
    private readonly tenantService: TenantService,
  ) {}

  onModuleInit() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.registry.register({
      code: 'TNT_LSTBTCH_1A1B',
      description: "List tenant's disbursement batches.",
      roles: [Role.TENANT],
      requiresJwt: false,
      requiresApiKey: true,
      handler: async (payload, context) => {
        return this.tenantService.listBatches(context.tenantId, payload);
      },
    });

    this.registry.register({
      code: 'TNT_BTCHSTS_2C2D',
      description: 'Get tenant batch status with job details.',
      roles: [Role.TENANT],
      requiresJwt: false,
      requiresApiKey: true,
      handler: async (payload, context) => {
        return this.tenantService.getBatchStatus(context.tenantId, payload);
      },
    });
  }
}