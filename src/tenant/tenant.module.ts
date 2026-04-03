import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantCommands } from './tenant.commands';
import { TenantService } from './tenant.service';

@Module({
	imports: [MasterModule, PrismaModule],
	providers: [TenantService, TenantCommands],
	exports: [TenantService],
})
export class TenantModule {}