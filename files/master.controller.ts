import {
  Controller,
  Post,
  Headers,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiHeader, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CommandRegistry, CommandContext } from './command.registry';
import { MasterGuard } from '../common/guards/master.guard';
import { Role } from '../common/enums/role.enum';

@ApiTags('Master')
@Controller('/')
export class MasterController {
  constructor(private readonly registry: CommandRegistry) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(MasterGuard)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-command', required: true, description: 'Command code e.g. ADM_APPROV_1A2B' })
  @ApiHeader({ name: 'x-api-key', required: false, description: 'Tenant API key (admin routes only)' })
  @ApiOperation({ summary: 'Single command endpoint — all API requests go here' })
  async handle(
    @Headers('x-command') commandCode: string,
    @Body() payload: Record<string, any>,
    @Req() req: Request,
  ) {
    if (!commandCode) {
      throw new BadRequestException('Missing x-command header');
    }

    // ── Resolve command from registry ─────────────────────────
    const command = this.registry.resolve(commandCode.trim().toUpperCase());

    // ── Build context from request (populated by MasterGuard) ─
    const context: CommandContext = {
      tenantId: (req as any).tenantId,
      adminId: (req as any).adminId,
      userId: (req as any).userId,
      role: (req as any).role ?? Role.TENANT,
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    };

    // ── Dispatch to handler ───────────────────────────────────
    const result = await command.handler(payload, context);

    return {
      success: true,
      command: commandCode,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
