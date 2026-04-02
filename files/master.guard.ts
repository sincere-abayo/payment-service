import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CommandRegistry } from '../../master/command.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../enums/role.enum';
import * as crypto from 'crypto';

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
    const commandCode = req.headers['x-command'] as string;

    if (!commandCode) return true; // Let controller handle missing command error

    // ── Resolve command metadata ──────────────────────────────
    let command: ReturnType<CommandRegistry['resolve']>;
    try {
      command = this.registry.resolve(commandCode.trim().toUpperCase());
    } catch {
      return true; // Let controller throw NotFoundException
    }

    // ── JWT validation ────────────────────────────────────────
    if (command.requiresJwt) {
      const token = this.extractBearer(req);
      if (!token) throw new UnauthorizedException('Missing Bearer token');

      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: this.config.get<string>('JWT_SECRET'),
        });
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }

      // Attach identity to request
      if (payload.role === Role.ADMIN) {
        (req as any).adminId = payload.sub;
      } else {
        (req as any).tenantId = payload.sub;
        (req as any).userId = payload.userId;
      }
      (req as any).role = payload.role;
    }

    // ── API key validation (admin routes — from header) ───────
    if (command.requiresApiKey && (req as any).role === Role.ADMIN) {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) throw new UnauthorizedException('Missing x-api-key header');
      await this.validateApiKey(apiKey, req);
    }

    // ── API key validation (tenant payment routes — from body) ─
    if (command.requiresApiKey && (req as any).role === Role.TENANT) {
      const apiKey = req.body?.apiKey;
      if (!apiKey) throw new UnauthorizedException('Missing apiKey in payload');
      await this.validateApiKey(apiKey, req);
    }

    // ── Role enforcement ──────────────────────────────────────
    const requestRole: Role = (req as any).role ?? Role.TENANT;
    if (!command.roles.includes(requestRole)) {
      throw new ForbiddenException('Insufficient permissions for this command');
    }

    return true;
  }

  // ── Helpers ───────────────────────────────────────────────────
  private extractBearer(req: Request): string | null {
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }

  private async validateApiKey(rawKey: string, req: Request): Promise<void> {
    const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
    const record = await this.prisma.apiKey.findUnique({
      where: { key: hashed },
      include: { tenant: true },
    });

    if (!record || record.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or revoked Tenant API key');
    }
    if (record.tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant account is not active');
    }

    (req as any).tenantId = record.tenantId;
  }
}
