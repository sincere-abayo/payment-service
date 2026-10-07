import { Injectable } from '@nestjs/common';
import { XentryPayHelper } from './xentry-pay.helper';
import {
  MoneyMovementInput,
  MoneyMovementResult,
  PaymentProvider,
  PaymentProviderName,
} from '../payment-provider.types';

@Injectable()
export class XentryPayProvider implements PaymentProvider {
  readonly name = PaymentProviderName.XENTRY;

  constructor(private readonly xentry: XentryPayHelper) {}

  async collect(input: MoneyMovementInput): Promise<MoneyMovementResult> {
    const phone = this.normalizePhone(input.phone);

    const response = await this.xentry.initiateCollection({
      email: input.customerEmail?.trim() || `collection-${input.externalId}@transpip.com`,
      cname: input.customerName?.trim() || `Customer ${input.externalId}`,
      cnumber: phone.local,
      msisdn: phone.international,
      amount: input.amount,
      currency: 'RWF',
      pmethod: 'momo',
      chargesIncluded: true,
      customerRef: input.externalId,
    });

    const referenceId = this.xentry.assertCollectionSuccess(response, 'collection');

    return {
      referenceId,
      provider: this.name,
      pending: true,
    };
  }

  async transfer(input: MoneyMovementInput): Promise<MoneyMovementResult> {
    const phone = this.normalizePhone(input.phone);

    const response = await this.xentry.initiatePayout({
      customerReference: input.externalId,
      telecomProviderId: input.providerCode?.trim() || '63510',
      msisdn: phone.local,
      name: input.recipientName?.trim() || `User ${input.externalId}`,
      transactionType: 'PAYOUT',
      currency: 'RWF',
      amount: input.amount,
    });

    const referenceId = this.xentry.assertPayoutSuccess(response, 'transfer');

    return {
      referenceId,
      provider: this.name,
      pending: true,
      validatedAccountName: response.validatedAccountName?.trim() || undefined,
    };
  }

  private normalizePhone(phone: string): { local: string; international: string } {
    const cleaned = phone.replace(/\D/g, '');

    let local: string;
    let international: string;

    if (cleaned.startsWith('250')) {
      international = cleaned;
      local = '0' + cleaned.slice(3);
    } else if (cleaned.startsWith('0')) {
      local = cleaned;
      international = '250' + cleaned.slice(1);
    } else {
      local = '0' + cleaned;
      international = '250' + cleaned;
    }

    return { local, international };
  }
}
