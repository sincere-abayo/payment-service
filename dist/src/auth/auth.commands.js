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
exports.AuthCommands = void 0;
const common_1 = require("@nestjs/common");
const role_enum_1 = require("../common/enums/role.enum");
const command_registry_1 = require("../master/command.registry");
const auth_service_1 = require("./auth.service");
let AuthCommands = class AuthCommands {
    registry;
    authService;
    initialized = false;
    constructor(registry, authService) {
        this.registry = registry;
        this.authService = authService;
    }
    onModuleInit() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.registry.register({
            code: 'ADM_LOGIN_1A2B',
            description: 'Admin login with email and password.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: false,
            requiresApiKey: false,
            handler: async (payload) => {
                const email = payload?.email;
                const password = payload?.password;
                return this.authService.adminLogin(email, password);
            },
        });
        this.registry.register({
            code: 'ADM_VERIFY2FA_2C3D',
            description: 'Verify TOTP code to complete admin login.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: false,
            requiresApiKey: false,
            handler: async (payload) => {
                const preAuthToken = payload?.preAuthToken;
                const totpCode = payload?.totpCode;
                return this.authService.verify2FA(preAuthToken, totpCode);
            },
        });
        this.registry.register({
            code: 'ADM_SETUP2FA_3E4F',
            description: 'Generate 2FA secret and QR code for admin.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (_payload, context) => {
                return this.authService.setup2FA(context.adminId);
            },
        });
        this.registry.register({
            code: 'ADM_CONFIRM2FA_4G5H',
            description: 'Confirm 2FA setup by verifying a TOTP code.',
            roles: [role_enum_1.Role.ADMIN],
            requiresJwt: true,
            requiresApiKey: false,
            handler: async (payload, context) => {
                return this.authService.confirm2FA(context.adminId, payload.totpCode);
            },
        });
    }
};
exports.AuthCommands = AuthCommands;
exports.AuthCommands = AuthCommands = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [command_registry_1.CommandRegistry,
        auth_service_1.AuthService])
], AuthCommands);
