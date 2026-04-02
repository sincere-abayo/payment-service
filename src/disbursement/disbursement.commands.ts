import { Injectable, OnModuleInit } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { CommandRegistry } from '../master/command.registry';
import { DisbursementService } from './disbursement.service';

@Injectable()
export class DisbursementCommands implements OnModuleInit {
  private initialized = false;

  constructor(
    private readonly registry: CommandRegistry,
    private readonly disbursementService: DisbursementService,
  ) {}

  onModuleInit() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.registry.register({
      code: 'DSB_INIT_3C4D',
      description: 'Initiate a disbursement batch.',
      roles: [Role.TENANT],
      requiresJwt: false,
      requiresApiKey: true,
      handler: async (payload, context) => {
        return this.disbursementService.initiateBatch(context.tenantId, payload);
      },
    });

    this.registry.register({
      code: 'DSB_STATUS_4E5F',
      description: 'Get disbursement batch status by ID.',
      roles: [Role.TENANT],
      requiresJwt: false,
      requiresApiKey: true,
      handler: async (payload, context) => {
        return this.disbursementService.getBatchStatus(context.tenantId, payload);
      },
    });
  }
}