import { PaymentProvider as PrismaPaymentProvider } from '@prisma/client';
import { PaymentProviderName } from './payment-provider.types';

export function toPrismaPaymentProvider(name: PaymentProviderName): PrismaPaymentProvider {
  return name === PaymentProviderName.XENTRY
    ? PrismaPaymentProvider.XENTRY
    : PrismaPaymentProvider.MTN;
}

/**
 * Maps a stored provider to a code this deployment understands.
 * Returns 'itec' when the row still holds the legacy/unavailable ITEC value so
 * callers can surface a clear "not available here" error instead of crashing.
 */
export function fromPrismaPaymentProvider(
  provider: PrismaPaymentProvider,
): PaymentProviderName | 'itec' {
  if (provider === PrismaPaymentProvider.XENTRY) {
    return PaymentProviderName.XENTRY;
  }

  if (provider === PrismaPaymentProvider.MTN) {
    return PaymentProviderName.MTN;
  }

  return 'itec';
}
