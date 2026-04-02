import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { MasterModule } from './master/master.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { TenantModule } from './tenant/tenant.module';
import { DisbursementModule } from './disbursement/disbursement.module';
import { WebhookModule } from './webhook/webhook.module';
import { MtnModule } from './mtn/mtn.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    // ── Environment config (global) ───────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Rate limiting (global) ────────────────────────────────
    // 60 requests per minute per IP by default
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 60),
        },
      ],
    }),

    // ── BullMQ (Redis-backed job queues) ──────────────────────
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

    // ── Feature modules ───────────────────────────────────────
    PrismaModule,
    QueueModule,
    MtnModule,
    AuthModule,
    AdminModule,
    TenantModule,
    DisbursementModule,
    WebhookModule,

    // ── Master (must come last — all modules must register
    //    their commands before master builds the registry) ─────
    MasterModule,
  ],
})
export class AppModule {}
