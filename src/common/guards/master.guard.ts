import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as crypto from 'crypto';
import { CommandRegistry } from '../../master/command.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../enums/role.enum';

@Injectable()
export class MasterGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly registry: CommandRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const commandCode =
      (req.headers['x-command'] as string | undefined) ??
      (req.params?.commandCode as string | undefined);

    if (!commandCode) {
      return true;
    }

    let command;
    try {
      command = this.registry.resolve(commandCode.trim().toUpperCase());
    } catch {
      return true;
    }

    this.validateCommonApiKey(req);

    if (command.requiresJwt) {
      const token = this.extractBearer(req);
      if (!token) {
        throw new UnauthorizedException('Missing Bearer token');
      }

      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: this.config.get<string>('JWT_SECRET'),
        });
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }

      if (payload.role === Role.ADMIN) {
        (req as any).adminId = payload.sub;
      } else {
        (req as any).tenantId = payload.sub;
        (req as any).userId = payload.userId;
      }

      (req as any).role = payload.role;
    }

    if (command.requiresApiKey && (req as any).role === Role.ADMIN) {
      const apiKey = req.headers['x-api-key'] as string | undefined;
      if (!apiKey) {
        throw new UnauthorizedException('Missing x-api-key header');
      }

      await this.validateApiKey(apiKey, req);
    }

    if (command.requiresApiKey && (req as any).role === Role.TENANT) {
      const apiKey = req.body?.apiKey;
      if (!apiKey) {
        throw new UnauthorizedException('Missing apiKey in payload');
      }

      await this.validateApiKey(apiKey, req);
    }

    const requestRole = (req as any).role as Role | undefined;

    // Public commands (e.g., login) should not fail role checks before identity exists.
    if (command.requiresJwt) {
      if (!requestRole || !command.roles.includes(requestRole)) {
        throw new ForbiddenException('Insufficient permissions for this command');
      }
    }

    return true;
  }

  private extractBearer(req: Request): string | null {
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      return null;
    }

    return auth.slice(7);
  }

  private validateCommonApiKey(req: Request): void {
    const expectedApiKey = this.config.get<string>('COMMON_X_API_KEY')?.trim();
    if (!expectedApiKey) {
      throw new InternalServerErrorException('API key protection is not configured');
    }

    const providedApiKey = (req.headers['x-api-key'] as string | undefined)?.trim();
    if (!providedApiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    if (providedApiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid x-api-key header');
    }
  }

  private async validateApiKey(rawKey: string, req: Request): Promise<void> {
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
    const record = await this.prisma.apiKey.findUnique({
      where: { key: hashed },
      include: { tenant: true },
    });

    if (!record || record.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    if (record.tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant account is not active');
    }

    (req as any).tenantId = record.tenantId;
  }
}