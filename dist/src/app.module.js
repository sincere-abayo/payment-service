"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const auth_module_1 = require("./auth/auth.module");
const admin_module_1 = require("./admin/admin.module");
const disbursement_module_1 = require("./disbursement/disbursement.module");
const health_module_1 = require("./health/health.module");
const master_module_1 = require("./master/master.module");
const mtn_module_1 = require("./mtn/mtn.module");
const prisma_module_1 = require("./prisma/prisma.module");
const queue_module_1 = require("./queue/queue.module");
const tenant_module_1 = require("./tenant/tenant.module");
const webhook_module_1 = require("./webhook/webhook.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
            }),
            bullmq_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: {
                        host: config.get('REDIS_HOST', 'localhost'),
                        port: config.get('REDIS_PORT', 6379),
                        password: config.get('REDIS_PASSWORD'),
                    },
                }),
            }),
            prisma_module_1.PrismaModule,
            queue_module_1.QueueModule,
            mtn_module_1.MtnModule,
            auth_module_1.AuthModule,
            admin_module_1.AdminModule,
            tenant_module_1.TenantModule,
            disbursement_module_1.DisbursementModule,
            webhook_module_1.WebhookModule,
            health_module_1.HealthModule,
            master_module_1.MasterModule,
        ],
    })
], AppModule);
