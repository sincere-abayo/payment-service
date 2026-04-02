import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

  async adminLogin(email: string, password: string) {
    if (!email || !email.trim()) {
      throw new BadRequestException('email is required');
    }

    if (!password || !password.trim()) {
      throw new BadRequestException('password is required');
    }

    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    if (admin.twoFactorEnabled) {
      const preAuthToken = await this.jwtService.signAsync(
        { sub: admin.id, role: Role.ADMIN, step: 'pre-auth' },
        { expiresIn: '5m', secret: this.config.get<string>('JWT_SECRET') },
      );

      return { requires2FA: true, preAuthToken };
    }

    return { requires2FA: false, accessToken: await this.issueAccessToken(admin.id) };
  }

  async verify2FA(preAuthToken: string, totpCode: string) {
    if (!preAuthToken || !preAuthToken.trim()) {
      throw new BadRequestException('preAuthToken is required');
    }

    if (!totpCode || !totpCode.trim()) {
      throw new BadRequestException('totpCode is required');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(preAuthToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }

    if (payload.step !== 'pre-auth') {
      throw new UnauthorizedException('Invalid token step');
    }

    const admin = await this.prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin?.twoFactorSecret) {
      throw new UnauthorizedException('2FA not configured');
    }

    const valid = otplib.authenticator.verify({
      token: totpCode,
      secret: admin.twoFactorSecret,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    return { accessToken: await this.issueAccessToken(admin.id) };
  }

  async setup2FA(adminId: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (admin.twoFactorEnabled) {
      throw new BadRequestException('2FA already enabled');
    }

    const secret = otplib.authenticator.generateSecret();
    const otpAuthUrl = otplib.authenticator.keyuri(
      admin.email,
      'MTN Disbursement Platform',
      secret,
    );
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { twoFactorSecret: secret },
    });

    return { secret, qrCodeDataUrl };
  }

  async confirm2FA(adminId: string, totpCode: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin?.twoFactorSecret) {
      throw new BadRequestException('Run setup2FA first');
    }

    const valid = otplib.authenticator.verify({
      token: totpCode,
      secret: admin.twoFactorSecret,
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA enabled successfully' };
  }

  private async issueAccessToken(adminId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: adminId, role: Role.ADMIN },
      {
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '8h'),
        secret: this.config.get<string>('JWT_SECRET'),
      },
    );
  }
}