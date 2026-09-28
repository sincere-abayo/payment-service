import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MtnPayConfigService } from './mtn-config.service';
import {
  MoneyMovementInput,
  MoneyMovementResult,
  PaymentProvider,
  PaymentProviderName,
} from '../payment-provider.types';

/**
 * Direct MTN MoMo API integration (sandbox/production).
 * Still stubbed until OAuth + requestToPay/transfer APIs are wired.
 */
@Injectable()
export class MtnDirectProvider implements PaymentProvider {
  readonly name = PaymentProviderName.MTN;
  private readonly logger = new Logger(MtnDirectProvider.name);

  constructor(private readonly config: MtnPayConfigService) {}

  async collect(input: MoneyMovementInput): Promise<MoneyMovementResult> {
    const referenceId = randomUUID();
    const { environment } = await this.config.get();

    this.logger.log(
      `MTN collect (${environment}) externalId=${input.externalId} phone=${input.phone} amount=${input.amount} ref=${referenceId}`,
    );

    return {
      referenceId,
      provider: this.name,
      pending: true,
    };
  }

  async transfer(input: MoneyMovementInput): Promise<MoneyMovementResult> {
    const referenceId = randomUUID();
    const { environment } = await this.config.get();

    this.logger.log(
      `MTN transfer (${environment}) externalId=${input.externalId} phone=${input.phone} amount=${input.amount} ref=${referenceId}`,
    );

    return {
      referenceId,
      provider: this.name,
      pending: true,
    };
  }
}
