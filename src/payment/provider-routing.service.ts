import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  fromPrismaPaymentProvider,
  toPrismaPaymentProvider,
} from './payment-provider.mapper';
import { PaymentProviderName } from './payment-provider.types';

/** Codes accepted when writing routing — ITEC is not available in this deployment. */
export type ProviderRoutingCode = 'mtn' | 'xentry';

/** Codes displayed by GETRTE — may include 'itec' when the DB still holds it. */
export type ProviderRoutingViewCode = ProviderRoutingCode | 'itec';

export type ProviderRoutingView = {
  default: ProviderRoutingViewCode | null;
  collection: ProviderRoutingViewCode | null;
  disbursement: ProviderRoutingViewCode | null;
  withdraw: ProviderRoutingViewCode | null;
};

const WRITE_CODES: ProviderRoutingCode[] = ['mtn', 'xentry'];

function toCode(value: PaymentProvider | null): ProviderRoutingViewCode | null {
  return value ? fromPrismaPaymentProvider(value) : null;
}

/**
 * Provider routing (was PAYMENT_PROVIDER_* env vars) — stored in DB and
 * editable from the dashboard via ADM_GETRTE/ADM_SETRTE, so changes apply
 * without a container restart.
 */
@Injectable()
export class ProviderRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ProviderRoutingView> {
    const row = await this.prisma.paymentRoutingConfig.findUnique({ where: { id: 'main' } });

    if (!row) {
      return { default: null, collection: null, disbursement: null, withdraw: null };
    }

    return {
      default: toCode(row.defaultProvider),
      collection: toCode(row.collectionProvider),
      disbursement: toCode(row.disbursementProvider),
      withdraw: toCode(row.withdrawProvider),
    };
  }

  /** Resolved provider for a flow: specific setting, else default. */
  async resolve(kind: 'collection' | 'disbursement' | 'withdraw'): Promise<PaymentProviderName> {
    const routing = await this.get();
    const specific =
      kind === 'collection'
        ? routing.collection
        : kind === 'withdraw'
          ? routing.withdraw
          : routing.disbursement;
    const raw = (specific ?? routing.default ?? '').toLowerCase();

    if (!raw) {
      throw new BadRequestException(
        'Payment provider routing is not configured. Run ADM_SETRTE_5I7K to set the default provider.',
      );
    }

    if (raw === PaymentProviderName.MTN || raw === PaymentProviderName.XENTRY) {
      return raw;
    }

    if (raw === 'itec') {
      throw new BadRequestException(
        'Payment provider "itec" is not available in this deployment. Run ADM_SETRTE_5I7K and set the provider to "mtn" or "xentry".',
      );
    }

    throw new BadRequestException(
      `Invalid payment provider "${raw}". Use "${PaymentProviderName.MTN}" or "${PaymentProviderName.XENTRY}".`,
    );
  }

  async upsert(payload: {
    default: ProviderRoutingCode;
    collection?: ProviderRoutingCode | null;
    disbursement?: ProviderRoutingCode | null;
    withdraw?: ProviderRoutingCode | null;
  }): Promise<ProviderRoutingView> {
    const normalize = (code: ProviderRoutingCode | null | undefined, field: string) => {
      if (code == null) {
        return null;
      }

      if (!WRITE_CODES.includes(code)) {
        throw new BadRequestException(
          `Invalid ${field} provider "${code}". Use "${WRITE_CODES[0]}" or "${WRITE_CODES[1]}".`,
        );
      }

      return toPrismaPaymentProvider(code as PaymentProviderName);
    };

    const data = {
      defaultProvider: normalize(payload.default, 'default') as PaymentProvider,
      collectionProvider: normalize(payload.collection, 'collection'),
      disbursementProvider: normalize(payload.disbursement, 'disbursement'),
      withdrawProvider: normalize(payload.withdraw, 'withdraw'),
    };

    if (!data.defaultProvider) {
      throw new BadRequestException('default provider is required');
    }

    const row = await this.prisma.paymentRoutingConfig.upsert({
      where: { id: 'main' },
      create: { id: 'main', ...data },
      update: data,
    });

    return {
      default: toCode(row.defaultProvider),
      collection: toCode(row.collectionProvider),
      disbursement: toCode(row.disbursementProvider),
      withdraw: toCode(row.withdrawProvider),
    };
  }

  /** Codes accepted by ADM_SETRTE (UI dropdowns). */
  static readonly codes = WRITE_CODES;
}
