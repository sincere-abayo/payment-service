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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const role_enum_1 = require("../common/enums/role.enum");
const master_guard_1 = require("../common/guards/master.guard");
const command_registry_1 = require("./command.registry");
let MasterController = class MasterController {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    async handle(commandCode, payload, req) {
        return this.dispatch(commandCode, payload, req);
    }
    async dispatch(commandCode, payload, req) {
        if (!commandCode) {
            throw new common_1.BadRequestException('Missing x-command header or commandCode path param');
        }
        const command = this.registry.resolve(commandCode.trim().toUpperCase());
        const context = {
            tenantId: req.tenantId,
            adminId: req.adminId,
            userId: req.userId,
            role: req.role ?? role_enum_1.Role.TENANT,
            ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
        };
        const result = await command.handler(payload, context);
        return {
            success: true,
            command: commandCode,
            data: result,
            timestamp: new Date().toISOString(),
        };
    }
};
exports.MasterController = MasterController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(master_guard_1.MasterGuard),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 60 } }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiHeader)({ name: 'x-command', required: true, description: 'Command code e.g. ADM_LOGIN_1A2B' }),
    (0, swagger_1.ApiHeader)({ name: 'x-api-key', required: false, description: 'Tenant API key for protected commands' }),
    (0, swagger_1.ApiOperation)({ summary: 'Single command endpoint for all API requests' }),
    __param(0, (0, common_1.Headers)('x-command')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MasterController.prototype, "handle", null);
exports.MasterController = MasterController = __decorate([
    (0, swagger_1.ApiTags)('Master'),
    (0, common_1.Controller)('/'),
    __metadata("design:paramtypes", [command_registry_1.CommandRegistry])
], MasterController);
