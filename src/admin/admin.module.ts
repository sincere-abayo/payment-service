import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCommands } from './admin.commands';
import { AdminService } from './admin.service';

@Module({
	imports: [PrismaModule, MasterModule],
	providers: [AdminService, AdminCommands],
	exports: [AdminService],
})
export class AdminModule {}