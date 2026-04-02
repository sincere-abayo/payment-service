import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';

// ── Shape of a registered command ────────────────────────────────────────────
export interface CommandDefinition {
  code: string;                        // e.g. "ADM_APPROV_1A2B"
  description: string;                 // shown in Swagger
  roles: Role[];                       // who can call this command
  requiresApiKey: boolean;             // enforce x-api-key header
  requiresJwt: boolean;                // enforce Bearer JWT
  handler: (payload: any, context: CommandContext) => Promise<any>;
}

// ── Context passed to every handler ──────────────────────────────────────────
export interface CommandContext {
  tenantId?: string;
  adminId?: string;
  userId?: string;    // userPseudoId from JWT/payload
  role: Role;
  ip: string;
}

@Injectable()
export class CommandRegistry {
  private readonly logger = new Logger(CommandRegistry.name);
  private readonly commands = new Map<string, CommandDefinition>();

  // ── Called by each module's onModuleInit ─────────────────────
  register(command: CommandDefinition): void {
    if (this.commands.has(command.code)) {
      throw new Error(`Duplicate command registration: ${command.code}`);
    }
    this.commands.set(command.code, command);
    this.logger.log(`Registered command: ${command.code}`);
  }

  // ── Used by master controller ─────────────────────────────────
  resolve(code: string): CommandDefinition {
    const command = this.commands.get(code);
    if (!command) {
      throw new NotFoundException(`Unknown command: ${code}`);
    }
    return command;
  }

  // ── Expose all commands for Swagger generation ────────────────
  getAll(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }
}
