import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Role } from '../common/enums/role.enum';
import { MasterGuard } from '../common/guards/master.guard';
import { CommandContext, CommandRegistry } from './command.registry';

@ApiTags('Master')
@Controller('/')
export class MasterController {
  constructor(private readonly registry: CommandRegistry) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(MasterGuard)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-command', required: true, description: 'Command code e.g. ADM_LOGIN_1A2B' })
  @ApiHeader({ name: 'x-api-key', required: true, description: 'Common service API key from COMMON_X_API_KEY' })
  @ApiOperation({ summary: 'Single command endpoint for all API requests' })
  async handle(
    @Headers('x-command') commandCode: string,
    @Body() payload: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.dispatch(commandCode, payload, req);
  }

  private async dispatch(
    commandCode: string | undefined,
    payload: Record<string, unknown>,
    req: Request,
  ) {
    if (!commandCode) {
      throw new BadRequestException('Missing x-command header');
    }

    const command = this.registry.resolve(commandCode.trim().toUpperCase());

    const context: CommandContext = {
      tenantId: (req as any).tenantId,
      adminId: (req as any).adminId,
      userId: (req as any).userId,
      role: (req as any).role ?? Role.TENANT,
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
}