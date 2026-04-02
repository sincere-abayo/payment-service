import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import * as bcrypt from 'bcrypt';
import * as otplib from 'otplib';
import * as qrcode from 'qrcode';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── ADM_LOGIN_1A2B ────────────────────────────────────────────
  // Step 1 of login: validate email + password
  // Returns a short-lived pre-auth token if 2FA is enabled
  async adminLogin(email: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Update last login
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    if (admin.twoFactorEnabled) {
      // Issue a short-lived pre-auth token — only valid for 2FA step
      const preAuthToken = await this.jwtService.signAsync(
        { sub: admin.id, role: Role.ADMIN, step: 'pre-auth' },
        { expiresIn: '5m', secret: this.config.get('JWT_SECRET') },
      );
      return { requires2FA: true, preAuthToken };
    }

    // No 2FA — issue full access token
    return { requires2FA: false, accessToken: await this.issueAccessToken(admin.id) };
  }

  // ── ADM_VERIFY2FA_2C3D ────────────────────────────────────────
  // Step 2 of login: verify TOTP code using pre-auth token
  async verify2FA(preAuthToken: string, totpCode: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(preAuthToken, {
        secret: this.config.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }

    if (payload.step !== 'pre-auth') {
      throw new UnauthorizedException('Invalid token step');
    }

    const admin = await this.prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin?.twoFactorSecret) throw new UnauthorizedException('2FA not configured');

    const valid = otplib.authenticator.verify({
      token: totpCode,
      secret: admin.twoFactorSecret,
    });
    if (!valid) throw new UnauthorizedException('Invalid 2FA code');

    return { accessToken: await this.issueAccessToken(admin.id) };
  }

  // ── ADM_SETUP2FA_3E4F ─────────────────────────────────────────
  // Generate TOTP secret + QR code for admin to scan
  async setup2FA(adminId: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException('Admin not found');
    if (admin.twoFactorEnabled) throw new BadRequestException('2FA already enabled');

    const secret = otplib.authenticator.generateSecret();
    const otpAuthUrl = otplib.authenticator.keyuri(
      admin.email,
      'MTN Disbursement Platform',
      secret,
    );
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    // Store secret (not yet enabled — enabled after confirm)
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { twoFactorSecret: secret },
    });

    return { secret, qrCodeDataUrl };
  }

  // ── ADM_CONFIRM2FA_4G5H ───────────────────────────────────────
  // Confirm 2FA setup by verifying first TOTP code
  async confirm2FA(adminId: string, totpCode: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin?.twoFactorSecret) throw new BadRequestException('Run setup2FA first');

    const valid = otplib.authenticator.verify({
      token: totpCode,
      secret: admin.twoFactorSecret,
    });
    if (!valid) throw new UnauthorizedException('Invalid 2FA code');

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA enabled successfully' };
  }

  // ── Helpers ───────────────────────────────────────────────────
  private async issueAccessToken(adminId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: adminId, role: Role.ADMIN },
      {
        expiresIn: this.config.get('JWT_EXPIRES_IN', '8h'),
        secret: this.config.get('JWT_SECRET'),
      },
    );
  }
}
