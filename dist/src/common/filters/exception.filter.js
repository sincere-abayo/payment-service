"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var HttpExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let HttpExceptionFilter = HttpExceptionFilter_1 = class HttpExceptionFilter {
    logger = new common_1.Logger(HttpExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        const status = exception instanceof common_1.HttpException ? exception.getStatus() : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const responseBody = exception instanceof common_1.HttpException ? exception.getResponse() : 'Internal server error';
        const normalized = this.normalizeResponse(responseBody, status);
        if (status >= common_1.HttpStatus.INTERNAL_SERVER_ERROR) {
            this.logger.error(`[${req.method}] ${req.url} - ${status} - ${normalized.message}`);
        }
        else {
            this.logger.warn(`[${req.method}] ${req.url} - ${status} - ${normalized.message}`);
        }
        res.status(status).json({
            success: false,
            statusCode: status,
            message: normalized.message,
            timestamp: new Date().toISOString(),
            ...(normalized.error ? { error: normalized.error } : {}),
        });
    }
    normalizeResponse(responseBody, status) {
        if (typeof responseBody === 'string') {
            return {
                message: responseBody,
                error: common_1.HttpStatus[status] ?? undefined,
            };
        }
        const body = responseBody;
        const message = Array.isArray(body.message)
            ? body.message.join(', ')
            : body.message ?? 'Request failed';
        return {
            message,
            error: body.error,
        };
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = HttpExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], HttpExceptionFilter);
