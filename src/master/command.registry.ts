import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';

export interface CommandDefinition {
  code: string;
  description: string;
  roles: Role[];
  requiresApiKey: boolean;
  requiresJwt: boolean;
  handler: (payload: any, context: CommandContext) => Promise<unknown>;
}

export interface CommandContext {
  tenantId?: string;
  adminId?: string;
  userId?: string;
  role: Role;
  ip: string;
}

@Injectable()
export class CommandRegistry {
  private readonly logger = new Logger(CommandRegistry.name);
  private readonly commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition): void {
    if (this.commands.has(command.code)) {
      throw new Error(`Duplicate command registration: ${command.code}`);
    }

    this.commands.set(command.code, command);
    this.logger.log(`Registered command: ${command.code}`);
  }

  resolve(code: string): CommandDefinition {
    const command = this.commands.get(code);
    if (!command) {
      throw new NotFoundException(`Unknown command: ${code}`);
    }

    return command;
  }

  getAll(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }
}