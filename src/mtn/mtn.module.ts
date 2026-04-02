import { Module } from '@nestjs/common';
import { MtnService } from './mtn.service';

@Module({
	providers: [MtnService],
	exports: [MtnService],
})
export class MtnModule {}