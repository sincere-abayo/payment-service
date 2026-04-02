import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

type TransferInput = {
  externalId: string;
  phone: string;
  amount: number;
};

@Injectable()
export class MtnService {
  private readonly logger = new Logger(MtnService.name);

  async transfer(input: TransferInput): Promise<{ referenceId: string }> {
    // Stubbed transfer for current phase. Callback-driven reconciliation will replace
    // this optimistic response path when MTN integration is fully wired.
    const referenceId = randomUUID();

    this.logger.log(
      `Accepted MTN transfer request externalId=${input.externalId} phone=${input.phone} amount=${input.amount}`,
    );

    return { referenceId };
  }
}