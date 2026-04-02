import { Injectable, OnModuleInit } from '@nestjs/common';
import { CommandRegistry } from '../master/command.registry';
import { AuthService } from './auth.service';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthCommands implements OnModuleInit {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly authService: AuthService,
  ) {}

  onModuleInit() {
    // ── ADM_LOGIN_1A2B ──────────────────────────────────────────
    // Public — no JWT, no API key required
    this.registry.register({
      code: 'ADM_LOGIN_1A2B',
      description: 'Admin login with email + password. Returns pre-auth token if 2FA enabled.',
      roles: [Role.ADMIN],
      requiresJwt: false,
      requiresApiKey: false,
      handler: async (payload) => {
        const { email, password } = payload;
        return this.authService.adminLogin(email, password);
      },
    });

    // ── ADM_VERIFY2FA_2C3D ──────────────────────────────────────
    // Uses pre-auth token (short-lived), not full JWT
    this.registry.register({
      code: 'ADM_VERIFY2FA_2C3D',
      description: 'Verify TOTP code to complete 2FA login. Returns full access token.',
      roles: [Role.ADMIN],
      requiresJwt: false,
      requiresApiKey: false,
      handler: async (payload) => {
        const { preAuthToken, totpCode } = payload;
        return this.authService.verify2FA(preAuthToken, totpCode);
      },
    });

    // ── ADM_SETUP2FA_3E4F ───────────────────────────────────────
    // Requires full JWT — admin must be logged in first
    this.registry.register({
      code: 'ADM_SETUP2FA_3E4F',
      description: 'Generate 2FA secret and QR code for admin to scan.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (_payload, context) => {
        return this.authService.setup2FA(context.adminId!);
      },
    });

    // ── ADM_CONFIRM2FA_4G5H ─────────────────────────────────────
    this.registry.register({
      code: 'ADM_CONFIRM2FA_4G5H',
      description: 'Confirm 2FA setup by verifying first TOTP code.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.authService.confirm2FA(context.adminId!, payload.totpCode);
      },
    });
  }
}
