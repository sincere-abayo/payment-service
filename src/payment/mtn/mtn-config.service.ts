import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type MtnSettingsView = {
  baseUrl: string;
  subscriptionKey: string;
  apiUser: string;
  apiKey: string;
  environment: string;
  callbackUrl: string;
};

export type MtnSettingsInput = Partial<MtnSettingsView>;

/** MTN MoMo settings — was MTN_* env vars; DB + dashboard. */
@Injectable()
export class MtnPayConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<MtnSettingsView> {
    const row = await this.prisma.mtnPayConfig.findUnique({ where: { id: 'main' } });

    return {
      baseUrl: row?.baseUrl ?? '',
      subscriptionKey: row?.subscriptionKey ?? '',
      apiUser: row?.apiUser ?? '',
      apiKey: row?.apiKey ?? '',
      environment: row?.environment || 'sandbox',
      callbackUrl: row?.callbackUrl ?? '',
    };
  }

  async upsert(payload: MtnSettingsInput): Promise<MtnSettingsView> {
    const current = await this.get();
    const merged: MtnSettingsView = {
      baseUrl: (payload.baseUrl ?? current.baseUrl).trim().replace(/\/+$/, ''),
      subscriptionKey: (payload.subscriptionKey ?? current.subscriptionKey).trim(),
      apiUser: (payload.apiUser ?? current.apiUser).trim(),
      apiKey: (payload.apiKey ?? current.apiKey).trim(),
      environment: (payload.environment ?? current.environment).trim() || 'sandbox',
      callbackUrl: (payload.callbackUrl ?? current.callbackUrl).trim(),
    };

    const row = await this.prisma.mtnPayConfig.upsert({
      where: { id: 'main' },
      create: { id: 'main', ...merged },
      update: merged,
    });

    return {
      baseUrl: row.baseUrl,
      subscriptionKey: row.subscriptionKey,
      apiUser: row.apiUser,
      apiKey: row.apiKey,
      environment: row.environment,
      callbackUrl: row.callbackUrl,
    };
  }
}
