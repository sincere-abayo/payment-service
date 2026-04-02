"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminCommands = void 0;
const common_1 = require("@nestjs/common");
const role_enum_1 = require("../common/enums/role.enum");
const command_registry_1 = require("../master/command.registry");
const admin_service_1 = require("./admin.service");
let AdminCommands = class AdminCommands {
    registry;
    adminService;
    initialized = false;
    constructor(registry, adminService) {
        this.registry = registry;
        this.adminService = adminService;
    }
    onModuleInit() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.registry.register({
            code: 'ADM_REGTNT_5I6J',
            description: 'Register a new tenant app.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.adminService.registerTenant(context.adminId, payload);
            },
        });
        this.registry.register({
            code: 'ADM_APPROV_6K7L',
            description: 'Approve a pending tenant.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.adminService.approveTenant(context.adminId, payload.tenantId);
            },
        });
        this.registry.register({
            code: 'ADM_SUSPTNT_7M8N',
            description: 'Suspend an active tenant.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.adminService.suspendTenant(context.adminId, payload.tenantId, payload.reason);
            },
        });
        this.registry.register({
            code: 'ADM_REVTNT_8O9P',
            description: 'Permanently revoke a tenant.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.adminService.revokeTenant(context.adminId, payload.tenantId, payload.reason);
            },
        });
        this.registry.register({
            code: 'ADM_GENKEY_9Q0R',
            description: 'Generate an API key for an active tenant.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.adminService.generateApiKey(context.adminId, payload.tenantId);
            },
        });
        this.registry.register({
            code: 'ADM_REVKEY_1S2T',
            description: 'Revoke a tenant API key.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.adminService.revokeApiKey(context.adminId, payload.apiKeyId, payload.reason);
            },
        });
    }
};
exports.AdminCommands = AdminCommands;
exports.AdminCommands = AdminCommands = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [command_registry_1.CommandRegistry,
        admin_service_1.AdminService])
], AdminCommands);
