"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const crypto = __importStar(require("crypto"));
const command_registry_1 = require("../../master/command.registry");
const prisma_service_1 = require("../../prisma/prisma.service");
const role_enum_1 = require("../enums/role.enum");
let MasterGuard = class MasterGuard {
    jwtService;
    config;
    registry;
    prisma;
    constructor(jwtService, config, registry, prisma) {
        this.jwtService = jwtService;
        this.config = config;
        this.registry = registry;
        this.prisma = prisma;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const commandCode = req.headers['x-command'] ??
            req.params?.commandCode;
        if (!commandCode) {
            return true;
        }
        let command;
        try {
            command = this.registry.resolve(commandCode.trim().toUpperCase());
        }
        catch {
            return true;
        }
        if (command.requiresJwt) {
            const token = this.extractBearer(req);
            if (!token) {
                throw new common_1.UnauthorizedException('Missing Bearer token');
            }
            let payload;
            try {
                payload = await this.jwtService.verifyAsync(token, {
                    secret: this.config.get('JWT_SECRET'),
                });
            }
            catch {
                throw new common_1.UnauthorizedException('Invalid or expired token');
            }
            if (payload.role === role_enum_1.Role.ADMIN) {
                req.adminId = payload.sub;
            }
            else {
                req.tenantId = payload.sub;
                req.userId = payload.userId;
            }
            req.role = payload.role;
        }
        if (command.requiresApiKey && req.role === role_enum_1.Role.ADMIN) {
            const apiKey = req.headers['x-api-key'];
            if (!apiKey) {
                throw new common_1.UnauthorizedException('Missing x-api-key header');
            }
            await this.validateApiKey(apiKey, req);
        }
        if (command.requiresApiKey && req.role === role_enum_1.Role.TENANT) {
            const apiKey = req.body?.apiKey;
            if (!apiKey) {
                throw new common_1.UnauthorizedException('Missing apiKey in payload');
            }
            await this.validateApiKey(apiKey, req);
        }
        const requestRole = req.role;
        if (command.requiresJwt) {
            if (!requestRole || !command.roles.includes(requestRole)) {
                throw new common_1.ForbiddenException('Insufficient permissions for this command');
            }
        }
        return true;
    }
    extractBearer(req) {
        const auth = req.headers['authorization'];
        if (!auth?.startsWith('Bearer ')) {
            return null;
        }
        return auth.slice(7);
    }
    async validateApiKey(rawKey, req) {
        const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
        const record = await this.prisma.apiKey.findUnique({
            where: { key: hashed },
            include: { tenant: true },
        });
        if (!record || record.status !== 'ACTIVE') {
            throw new common_1.UnauthorizedException('Invalid or revoked API key');
        }
        if (record.tenant.status !== 'ACTIVE') {
            throw new common_1.ForbiddenException('Tenant account is not active');
        }
        req.tenantId = record.tenantId;
    }
};
exports.MasterGuard = MasterGuard;
exports.MasterGuard = MasterGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof jwt_1.JwtService !== "undefined" && jwt_1.JwtService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object, command_registry_1.CommandRegistry,
        prisma_service_1.PrismaService])
], MasterGuard);
