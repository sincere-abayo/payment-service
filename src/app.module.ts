import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { DisbursementModule } from './disbursement/disbursement.module';
import { HealthModule } from './health/health.module';
import { MasterModule } from './master/master.module';
import { MtnModule } from './mtn/mtn.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { TenantModule } from './tenant/tenant.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
    }),
    PrismaModule,
    QueueModule,
    MtnModule,
    AuthModule,
    AdminModule,
    TenantModule,
    DisbursementModule,
    WebhookModule,
    HealthModule,
    MasterModule,
  ],
})
export class AppModule {}