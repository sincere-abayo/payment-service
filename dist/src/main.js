"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const admin_commands_1 = require("./admin/admin.commands");
const auth_commands_1 = require("./auth/auth.commands");
const exception_filter_1 = require("./common/filters/exception.filter");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const command_registry_1 = require("./master/command.registry");
const COMMAND_REQUEST_EXAMPLES = {
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
};
const COMMAND_RESPONSE_EXAMPLES = {
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
        status: 'PENDING',
        createdAt: '2026-04-02T16:14:29.000Z',
        updatedAt: '2026-04-02T16:14:29.000Z',
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
};
function applyCommandExamplesToDocument(document, registry) {
    const commands = registry
        .getAll()
        .sort((a, b) => a.code.localeCompare(b.code));
    const postOperation = document.paths?.['/']?.post;
    if (!postOperation) {
        return;
    }
    const commandCodes = commands.map((command) => command.code);
    postOperation.parameters = postOperation.parameters ?? [];
    const commandHeader = postOperation.parameters.find((parameter) => parameter &&
        typeof parameter === 'object' &&
        'name' in parameter &&
        parameter.name === 'x-command');
    if (commandHeader && !('$ref' in commandHeader)) {
        commandHeader.description =
            'Command code. Pick one of the registered commands listed below.';
        commandHeader.schema = {
            type: 'string',
            enum: commandCodes,
        };
        commandHeader.example = commandCodes[0];
    }
    const requestExamples = {};
    const responseExamples = {};
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
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    const port = process.env.PORT ?? 3000;
    app.use((0, helmet_1.default)());
    app.use((0, compression_1.default)());
    app.enableCors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
        methods: ['POST', 'GET'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-command'],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor());
    if (process.env.NODE_ENV !== 'production') {
        const authCommands = app.get(auth_commands_1.AuthCommands, { strict: false });
        const adminCommands = app.get(admin_commands_1.AdminCommands, { strict: false });
        authCommands.onModuleInit();
        adminCommands.onModuleInit();
        const commandRegistry = app.get(command_registry_1.CommandRegistry);
        const config = new swagger_1.DocumentBuilder()
            .setTitle('MTN MoMo Disbursement API')
            .setDescription('Command-first API documentation. Use POST / with x-command and x-api-key headers, and pick the command-specific request/response example.')
            .setVersion('1.0')
            .addTag('Master', 'Single command dispatcher')
            .addBearerAuth()
            .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        applyCommandExamplesToDocument(document, commandRegistry);
        swagger_1.SwaggerModule.setup('docs', app, document, {
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
