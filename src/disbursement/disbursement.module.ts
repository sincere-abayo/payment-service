import { Module } from '@nestjs/common';
import { MasterModule } from '../master/master.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { DisbursementCommands } from './disbursement.commands';
import { DisbursementService } from './disbursement.service';

@Module({
  imports: [MasterModule, PrismaModule, QueueModule],
  providers: [DisbursementService, DisbursementCommands],
  exports: [DisbursementService],
})
export class DisbursementModule {}
