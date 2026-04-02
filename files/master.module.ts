import { Module } from '@nestjs/common';
import { MasterController } from './master.controller';
import { CommandRegistry } from './command.registry';

@Module({
  controllers: [MasterController],
  providers: [CommandRegistry],
  exports: [CommandRegistry],
})
export class MasterModule {}
