import { Injectable, OnModuleInit } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { CommandRegistry } from '../master/command.registry';
import { CollectionService } from './collection.service';

@Injectable()
export class CollectionCommands implements OnModuleInit {
  private initialized = false;

  constructor(
    private readonly registry: CommandRegistry,
    private readonly collectionService: CollectionService,
  ) {}

  onModuleInit() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.registry.register({
      code: 'COL_INIT_8A9B',
      description: 'Request a Mobile Money collection from a customer phone.',
      roles: [Role.TENANT],
      requiresJwt: false,
      requiresApiKey: true,
      handler: async (payload, context) =>
        this.collectionService.initiateCollection(context.tenantId, payload),
    });

    this.registry.register({
      code: 'COL_STATUS_9C0D',
      description: 'Get a collection transaction status by ID.',
      roles: [Role.TENANT],
      requiresJwt: false,
      requiresApiKey: true,
      handler: async (payload, context) =>
        this.collectionService.getCollectionStatus(context.tenantId, payload),
    });
  }
}
