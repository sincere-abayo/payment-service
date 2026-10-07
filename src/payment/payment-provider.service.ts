import { BadRequestException, Injectable } from '@nestjs/common';
import { MtnDirectProvider } from './mtn/mtn-direct.provider';
import { ProviderRoutingService } from './provider-routing.service';
import { XentryPayHelper } from './xentry-pay/xentry-pay.helper';
import { XentryPayProvider } from './xentry-pay/xentry-pay.provider';
import {
  MoneyMovementInput,
  MoneyMovementResult,
  PaymentProvider,
  PaymentProviderName,
} from './payment-provider.types';

export type MoneyMovementKind = 'collection' | 'disbursement';

@Injectable()
export class PaymentProviderService {
  private readonly providers: Map<PaymentProviderName, PaymentProvider>;

  constructor(
    private readonly routing: ProviderRoutingService,
    private readonly xentryHelper: XentryPayHelper,
    mtnProvider: MtnDirectProvider,
    xentryProvider: XentryPayProvider,
  ) {
    this.providers = new Map<PaymentProviderName, PaymentProvider>([
      [PaymentProviderName.MTN, mtnProvider],
      [PaymentProviderName.XENTRY, xentryProvider],
    ]);
  }

  async collect(input: MoneyMovementInput): Promise<MoneyMovementResult> {
    const provider = await this.resolve('collection', input);
    return provider.collect(input);
  }

  async collectWithProvider(
    name: PaymentProviderName,
    input: MoneyMovementInput,
  ): Promise<MoneyMovementResult> {
    await this.assertNamedProviderConfigured(name);
    return this.providers.get(name)!.collect(input);
  }

  async transfer(input: MoneyMovementInput): Promise<MoneyMovementResult> {
    const provider = await this.resolve('disbursement', input);
    return provider.transfer(input);
  }

  async resolveDisbursementProviderName(): Promise<PaymentProviderName> {
    return this.routing.resolve('disbursement');
  }

  /**
   * Resolves the active provider for a money-movement kind and fails fast
   * when its credentials are missing, so tenants get the error synchronously
   * instead of a queued-then-failed payment.
   */
  async assertProviderConfigured(
    kind: MoneyMovementKind,
    tenantId?: string,
  ): Promise<PaymentProviderName> {
    const name = await this.routing.resolve(kind);

    await this.assertNamedProviderConfigured(name);

    return name;
  }

  private async assertNamedProviderConfigured(name: PaymentProviderName): Promise<void> {
    if (!this.providers.has(name)) {
      throw new BadRequestException(`Unknown payment provider: ${name}`);
    }

    if (name === PaymentProviderName.XENTRY && !(await this.xentryHelper.isConfigured())) {
      throw new BadRequestException(
        'Xentry Pay provider selected but Xentry Pay is not configured. Set the API key via ADM_SETXTR_1P3R.',
      );
    }
  }

  private async resolve(
    kind: MoneyMovementKind,
    input?: MoneyMovementInput,
  ): Promise<PaymentProvider> {
    const name = await this.assertProviderConfigured(kind, input?.tenantId);
    return this.providers.get(name)!;
  }
}
