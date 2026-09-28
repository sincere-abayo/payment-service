import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type XentrySettingsView = {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
};

/** Xentry (XentriPay) settings — was XENTRY_PAY_* env vars; DB + dashboard. */
@Injectable()
export class XentryPayConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<XentrySettingsView> {
    const row = await this.prisma.xentryPayConfig.findUnique({ where: { id: 'main' } });

    return {
      baseUrl: (row?.baseUrl ?? 'https://merchant.test.xentripay.com').replace(/\/+$/, ''),
      apiKey: row?.apiKey ?? '',
      webhookSecret: row?.webhookSecret ?? '',
    };
  }

  async isConfigured(): Promise<boolean> {
    const settings = await this.get();
    return Boolean(settings.baseUrl.trim() && settings.apiKey.trim());
  }

  async upsert(payload: {
    baseUrl?: string;
    apiKey?: string;
    webhookSecret?: string;
  }): Promise<XentrySettingsView> {
    const current = await this.get();
    const baseUrl = (payload.baseUrl ?? current.baseUrl).trim().replace(/\/+$/, '');
    const apiKey = (payload.apiKey ?? current.apiKey).trim();
    const webhookSecret = (payload.webhookSecret ?? current.webhookSecret).trim();

    const row = await this.prisma.xentryPayConfig.upsert({
      where: { id: 'main' },
      create: { id: 'main', baseUrl, apiKey, webhookSecret },
      update: { baseUrl, apiKey, webhookSecret },
    });

    return { baseUrl: row.baseUrl, apiKey: row.apiKey, webhookSecret: row.webhookSecret };
  }
}
