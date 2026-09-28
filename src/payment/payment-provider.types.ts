/** Supported upstream money-movement providers in this deployment (no ITEC). */
export enum PaymentProviderName {
  MTN = 'mtn',
  XENTRY = 'xentry',
}

export type MoneyMovementInput = {
  /** Internal id (disbursement job id) for logging and callbacks. */
  externalId: string;
  phone: string;
  amount: number;
  /** Owning tenant — used for logging/provider context. */
  tenantId?: string;
  /** Recipient full name — optional; Xentry falls back to a generated name and returns the validated account name. */
  recipientName?: string;
  /** Provider-specific telecom code — used by Xentry (e.g. 63510 for MTN MoMo). */
  providerCode?: string;
};

export type MoneyMovementResult = {
  referenceId: string;
  provider: PaymentProviderName;
  /** When true, final status arrives via provider callback/poll rather than this response. */
  pending?: boolean;
  /** Recipient account name as validated by the provider (Xentry validatedAccountName). */
  validatedAccountName?: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  collect(input: MoneyMovementInput): Promise<MoneyMovementResult>;
  transfer(input: MoneyMovementInput): Promise<MoneyMovementResult>;
}
