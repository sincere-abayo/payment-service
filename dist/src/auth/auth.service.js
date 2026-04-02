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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../prisma/prisma.service");
const role_enum_1 = require("../common/enums/role.enum");
const bcrypt = __importStar(require("bcrypt"));
const otplib = __importStar(require("otplib"));
const qrcode = __importStar(require("qrcode"));
let AuthService = class AuthService {
    prisma;
    jwtService;
    config;
    constructor(prisma, jwtService, config) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.config = config;
    }
    async adminLogin(email, password) {
        if (!email || !email.trim()) {
            throw new common_1.BadRequestException('email is required');
        }
        if (!password || !password.trim()) {
            throw new common_1.BadRequestException('password is required');
        }
        const admin = await this.prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const valid = await bcrypt.compare(password, admin.passwordHash);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.prisma.admin.update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date() },
        });
        if (admin.twoFactorEnabled) {
            const preAuthToken = await this.jwtService.signAsync({ sub: admin.id, role: role_enum_1.Role.ADMIN, step: 'pre-auth' }, { expiresIn: '5m', secret: this.config.get('JWT_SECRET') });
            return { requires2FA: true, preAuthToken };
        }
        return { requires2FA: false, accessToken: await this.issueAccessToken(admin.id) };
    }
    async verify2FA(preAuthToken, totpCode) {
        if (!preAuthToken || !preAuthToken.trim()) {
            throw new common_1.BadRequestException('preAuthToken is required');
        }
        if (!totpCode || !totpCode.trim()) {
            throw new common_1.BadRequestException('totpCode is required');
        }
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(preAuthToken, {
                secret: this.config.get('JWT_SECRET'),
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired pre-auth token');
        }
        if (payload.step !== 'pre-auth') {
            throw new common_1.UnauthorizedException('Invalid token step');
        }
        const admin = await this.prisma.admin.findUnique({ where: { id: payload.sub } });
        if (!admin?.twoFactorSecret) {
            throw new common_1.UnauthorizedException('2FA not configured');
        }
        const valid = otplib.authenticator.verify({
            token: totpCode,
            secret: admin.twoFactorSecret,
        });
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid 2FA code');
        }
        return { accessToken: await this.issueAccessToken(admin.id) };
    }
    async setup2FA(adminId) {
        const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin) {
            throw new common_1.UnauthorizedException('Admin not found');
        }
        if (admin.twoFactorEnabled) {
            throw new common_1.BadRequestException('2FA already enabled');
        }
        const secret = otplib.authenticator.generateSecret();
        const otpAuthUrl = otplib.authenticator.keyuri(admin.email, 'MTN Disbursement Platform', secret);
        const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);
        await this.prisma.admin.update({
            where: { id: adminId },
            data: { twoFactorSecret: secret },
        });
        return { secret, qrCodeDataUrl };
    }
    async confirm2FA(adminId, totpCode) {
        const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin?.twoFactorSecret) {
            throw new common_1.BadRequestException('Run setup2FA first');
        }
        const valid = otplib.authenticator.verify({
            token: totpCode,
            secret: admin.twoFactorSecret,
        });
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid 2FA code');
        }
        await this.prisma.admin.update({
            where: { id: adminId },
            data: { twoFactorEnabled: true },
        });
        return { message: '2FA enabled successfully' };
    }
    async issueAccessToken(adminId) {
        return this.jwtService.signAsync({ sub: adminId, role: role_enum_1.Role.ADMIN }, {
            expiresIn: this.config.get('JWT_EXPIRES_IN', '8h'),
            secret: this.config.get('JWT_SECRET'),
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
