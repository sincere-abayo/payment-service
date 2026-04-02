import { Injectable, OnModuleInit } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { CommandRegistry } from '../master/command.registry';
import { AuthService } from './auth.service';

@Injectable()
export class AuthCommands implements OnModuleInit {
  private initialized = false;

  constructor(
    private readonly registry: CommandRegistry,
    private readonly authService: AuthService,
  ) {}

  onModuleInit() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.registry.register({
      code: 'ADM_LOGIN_1A2B',
      description: 'Admin login with email and password.',
      roles: [Role.ADMIN],
      requiresJwt: false,
      requiresApiKey: false,
      handler: async (payload) => {
        const email = payload?.email as string;
        const password = payload?.password as string;
        return this.authService.adminLogin(email, password);
      },
    });

    this.registry.register({
      code: 'ADM_VERIFY2FA_2C3D',
      description: 'Verify TOTP code to complete admin login.',
      roles: [Role.ADMIN],
      requiresJwt: false,
      requiresApiKey: false,
      handler: async (payload) => {
        const preAuthToken = payload?.preAuthToken as string;
        const totpCode = payload?.totpCode as string;
        return this.authService.verify2FA(preAuthToken, totpCode);
      },
    });

    this.registry.register({
      code: 'ADM_SETUP2FA_3E4F',
      description: 'Generate 2FA secret and QR code for admin.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (_payload, context) => {
        return this.authService.setup2FA(context.adminId!);
      },
    });

    this.registry.register({
      code: 'ADM_CONFIRM2FA_4G5H',
      description: 'Confirm 2FA setup by verifying a TOTP code.',
      roles: [Role.ADMIN],
      requiresJwt: true,
      requiresApiKey: false,
      handler: async (payload, context) => {
        return this.authService.confirm2FA(context.adminId!, payload.totpCode);
      },
    });
  }
}