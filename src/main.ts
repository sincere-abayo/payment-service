import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AdminCommands } from './admin/admin.commands';
import { AuthCommands } from './auth/auth.commands';
import { DisbursementCommands } from './disbursement/disbursement.commands';
import { TenantCommands } from './tenant/tenant.commands';
import { HttpExceptionFilter } from './common/filters/exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CommandRegistry } from './master/command.registry';

const COMMAND_REQUEST_EXAMPLES: Record<string, Record<string, unknown>> = {
  ADM_LOGIN_1A2B: {
    email: 'admin@example.com',
    password: 'StrongPassword123!',
  },
  ADM_VERIFY2FA_2C3D: {
    preAuthToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    totpCode: '123456',
  },
  ADM_SETUP2FA_3E4F: {},
  ADM_CONFIRM2FA_4G5H: {
    totpCode: '123456',
  },
  ADM_REGTNT_5I6J: {
    name: 'Acme Finance',
    email: 'ops@acme.example',
    webhookUrl: 'https://acme.example/momo/callback',
    status: 'APPROVE',
  },
  ADM_LSTTNT_3U4V: {
    limit: 50,
    offset: 0,
    status: 'ACTIVE',
    q: 'acme',
  },
  ADM_GETTNT_2A3B: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
  },
  ADM_UPDTNT_4C5D: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    name: 'Acme Finance Rwanda',
    webhookUrl: 'https://acme.example/momo/new-callback',
    status: 'ACTIVE',
  },
  ADM_APPROV_6K7L: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
  },
  ADM_SUSPTNT_7M8N: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    reason: 'Compliance investigation',
  },
  ADM_REVTNT_8O9P: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    reason: 'Contract terminated',
  },
  ADM_GENKEY_9Q0R: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
  },
  ADM_REVKEY_1S2T: {
    apiKeyId: '2f88951a-cfad-46d8-bbb9-6753cf925554',
    reason: 'Key rotation',
  },
  ADM_REGKEY_6E7F: {
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    reason: 'Routine key rotation',
  },
  DSB_INIT_3C4D: {
    apiKey: 'momo_live_xxxxxxxxxxxxxxxxxxxx',
    idempotencyKey: 'idem_20260403_0001',
    userPseudoId: 'user_abc123',
    totalAmount: 35000,
    totalCharges: 500,
    chargeReceiver: '0788000000',
    recipients: [
      { phone: '0781111111', amount: 2000 },
      { phone: '0782222222', amount: 3000 },
      { phone: '0783333333', amount: 10000 },
      { phone: '0784444444', amount: 15000 },
      { phone: '0785555555', amount: 5000 },
    ],
  },
  DSB_STATUS_4E5F: {
    apiKey: 'momo_live_xxxxxxxxxxxxxxxxxxxx',
    batchId: '0c4b8e06-13d9-4b34-bd10-2da6a38db11d',
  },
  TNT_LSTBTCH_1A1B: {
    apiKey: 'momo_live_xxxxxxxxxxxxxxxxxxxx',
    limit: 20,
    offset: 0,
  },
  TNT_BTCHSTS_2C2D: {
    apiKey: 'momo_live_xxxxxxxxxxxxxxxxxxxx',
    batchId: '0c4b8e06-13d9-4b34-bd10-2da6a38db11d',
  },
};

const COMMAND_RESPONSE_EXAMPLES: Record<string, Record<string, unknown>> = {
  ADM_LOGIN_1A2B: {
    requires2FA: false,
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  ADM_VERIFY2FA_2C3D: {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  ADM_SETUP2FA_3E4F: {
    secret: 'JBSWY3DPEHPK3PXP',
    qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  },
  ADM_CONFIRM2FA_4G5H: {
    message: '2FA enabled successfully',
  },
  ADM_REGTNT_5I6J: {
    id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    name: 'Acme Finance',
    email: 'ops@acme.example',
    webhookUrl: 'https://acme.example/momo/callback',
    status: 'ACTIVE',
    createdAt: '2026-04-02T16:14:29.000Z',
    updatedAt: '2026-04-02T16:14:29.000Z',
  },
  ADM_LSTTNT_3U4V: {
    total: 1,
    limit: 50,
    offset: 0,
    items: [
      {
        id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
        name: 'Acme Finance',
        email: 'ops@acme.example',
        webhookUrl: 'https://acme.example/momo/callback',
        status: 'ACTIVE',
        createdAt: '2026-04-02T16:14:29.000Z',
        updatedAt: '2026-04-03T03:10:00.000Z',
        apiKeys: [
          {
            id: '2f88951a-cfad-46d8-bbb9-6753cf925554',
            status: 'ACTIVE',
            createdAt: '2026-04-02T16:18:20.000Z',
            revokedAt: null,
          },
        ],
        batchSummary: {
          total: 3,
          completed: 3,
          partiallyFailed: 0,
          processing: 0,
        },
      },
    ],
  },
  ADM_GETTNT_2A3B: {
    id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    name: 'Acme Finance',
    email: 'ops@acme.example',
    webhookUrl: 'https://acme.example/momo/callback',
    status: 'ACTIVE',
    createdAt: '2026-04-02T16:14:29.000Z',
    updatedAt: '2026-04-02T16:18:20.000Z',
    apiKeys: [
      {
        id: '2f88951a-cfad-46d8-bbb9-6753cf925554',
        status: 'ACTIVE',
        createdAt: '2026-04-02T16:18:20.000Z',
        revokedAt: null,
      },
    ],
  },
  ADM_UPDTNT_4C5D: {
    id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    name: 'Acme Finance Rwanda',
    email: 'ops@acme.example',
    webhookUrl: 'https://acme.example/momo/new-callback',
    status: 'ACTIVE',
    createdAt: '2026-04-02T16:14:29.000Z',
    updatedAt: '2026-04-02T16:18:20.000Z',
  },
  ADM_APPROV_6K7L: {
    id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    status: 'ACTIVE',
    updatedAt: '2026-04-02T16:15:10.000Z',
  },
  ADM_SUSPTNT_7M8N: {
    id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    status: 'SUSPENDED',
    updatedAt: '2026-04-02T16:16:30.000Z',
  },
  ADM_REVTNT_8O9P: {
    id: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    status: 'REVOKED',
    updatedAt: '2026-04-02T16:17:30.000Z',
  },
  ADM_GENKEY_9Q0R: {
    apiKeyId: '2f88951a-cfad-46d8-bbb9-6753cf925554',
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    rawApiKey: 'momo_2f96f6458ec9b84d9f730f2d5d0268f9051df2e75f13ca1312e6cbbf4a97c7ab',
    createdAt: '2026-04-02T16:18:20.000Z',
  },
  ADM_REVKEY_1S2T: {
    id: '2f88951a-cfad-46d8-bbb9-6753cf925554',
    status: 'REVOKED',
    revokedAt: '2026-04-02T16:19:10.000Z',
  },
  ADM_REGKEY_6E7F: {
    apiKeyId: 'c6357cbc-cbe2-4f88-9a7a-5d831e8b5d9a',
    tenantId: 'f61adb55-62ce-4221-8630-883c3a8bda4e',
    rawApiKey: 'momo_08b6d820a79824f65b58e3b41436fadf9d7806f6583fdcfadfdcc2e09ce7dc59',
    createdAt: '2026-04-02T16:20:20.000Z',
  },
  DSB_INIT_3C4D: {
    batchId: '0c4b8e06-13d9-4b34-bd10-2da6a38db11d',
    status: 'PROCESSING',
    jobCount: 6,
    message: 'Batch accepted. 6 jobs queued (5 payouts + 1 charge).',
  },
  DSB_STATUS_4E5F: {
    batchId: '0c4b8e06-13d9-4b34-bd10-2da6a38db11d',
    status: 'COMPLETED',
    totalAmount: 35000,
    totalCharges: 500,
    chargeReceiver: '0788000000',
    userPseudoId: 'user_abc123',
    jobs: [
      {
        jobId: 'job-1',
        phone: '0781111111',
        amount: 2000,
        type: 'PAYOUT',
        status: 'SUCCESS',
        mtnRef: 'mock_job-1',
        failReason: null,
      },
    ],
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
  },
  TNT_LSTBTCH_1A1B: {
    total: 1,
    limit: 20,
    offset: 0,
    items: [
      {
        batchId: '0c4b8e06-13d9-4b34-bd10-2da6a38db11d',
        status: 'COMPLETED',
        totalAmount: 35000,
        totalCharges: 500,
        chargeReceiver: '0788000000',
        jobCount: 6,
        successCount: 6,
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:20.000Z',
      },
    ],
  },
  TNT_BTCHSTS_2C2D: {
    batchId: '0c4b8e06-13d9-4b34-bd10-2da6a38db11d',
    status: 'COMPLETED',
    totalAmount: 35000,
    totalCharges: 500,
    chargeReceiver: '0788000000',
    userPseudoId: 'user_abc123',
    jobs: [
      {
        jobId: 'job-1',
        phone: '0781111111',
        amount: 2000,
        type: 'PAYOUT',
        status: 'SUCCESS',
        mtnRef: 'mock_job-1',
        failReason: null,
      },
    ],
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:20.000Z',
  },
};

function applyCommandExamplesToDocument(
  document: OpenAPIObject,
  registry: CommandRegistry,
) {
  const commands = registry
    .getAll()
    .sort((a, b) => a.code.localeCompare(b.code));

  const postOperation = document.paths?.['/']?.post;
  if (!postOperation) {
    return;
  }

  const commandCodes = commands.map((command) => command.code);

  postOperation.parameters = postOperation.parameters ?? [];
  const commandHeader = postOperation.parameters.find(
    (parameter) =>
      parameter &&
      typeof parameter === 'object' &&
      'name' in parameter &&
      parameter.name === 'x-command',
  );

  if (commandHeader && !('$ref' in commandHeader)) {
    commandHeader.description =
      'Command code. Pick one of the registered commands listed below.';
    commandHeader.schema = {
      type: 'string',
      enum: commandCodes,
    };
    commandHeader.example = commandCodes[0];
  }

  const requestExamples: Record<string, { summary: string; value: Record<string, unknown> }> =
    {};
  const responseExamples: Record<string, { summary: string; value: Record<string, unknown> }> =
    {};

  for (const command of commands) {
    requestExamples[command.code] = {
      summary: command.description,
      value: COMMAND_REQUEST_EXAMPLES[command.code] ?? {},
    };

    responseExamples[command.code] = {
      summary: command.description,
      value: {
        success: true,
        command: command.code,
        data: COMMAND_RESPONSE_EXAMPLES[command.code] ?? {},
        timestamp: '2026-04-02T16:20:00.000Z',
      },
    };
  }

  postOperation.requestBody = {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
        examples: requestExamples,
      },
    },
  };

  postOperation.responses = {
    ...postOperation.responses,
    '200': {
      description: 'Command executed successfully.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              command: { type: 'string' },
              data: { type: 'object', additionalProperties: true },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['success', 'command', 'data', 'timestamp'],
          },
          examples: responseExamples,
        },
      },
    },
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const port = process.env.PORT ?? 3000;

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-command'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (process.env.NODE_ENV !== 'production') {
    // Force command providers to instantiate so they register commands
    // before we generate the Swagger document.
    const authCommands = app.get(AuthCommands, { strict: false });
    const adminCommands = app.get(AdminCommands, { strict: false });
    const disbursementCommands = app.get(DisbursementCommands, { strict: false });
    const tenantCommands = app.get(TenantCommands, { strict: false });
    authCommands.onModuleInit();
    adminCommands.onModuleInit();
    disbursementCommands.onModuleInit();
    tenantCommands.onModuleInit();

    const commandRegistry = app.get(CommandRegistry);

    const config = new DocumentBuilder()
      .setTitle('MTN MoMo Disbursement API')
      .setDescription(
        'Command-first API documentation. Use POST / with x-command and the common x-api-key header (COMMON_X_API_KEY), then pick the command-specific request/response example.',
      )
      .setVersion('1.0')
      .addTag('Master', 'Single command dispatcher')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    applyCommandExamplesToDocument(document, commandRegistry);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'MTN MoMo API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    });
  }

  await app.listen(port);

  console.log(`Server running on port ${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();