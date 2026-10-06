import { Injectable, Logger } from '@nestjs/common';
import { XentryPayConfigService } from './xentry-pay-config.service';

export type XentryPayConfig = {
  baseUrl: string;
  apiKey: string;
};

export type XentryCollectionRequest = {
  email: string;
  cname: string;
  cnumber: string;
  msisdn: string;
  amount: number;
  currency: 'RWF';
  pmethod: 'momo' | 'cc';
  chargesIncluded?: boolean;
  customerRef?: string;
  redirecturl?: string;
  returl?: string;
  details?: string;
};

export type XentryCollectionResponse = {
  reply: string;
  url: string | null;
  success: number;
  authkey: string;
  tid: string;
  refid: string;
  retcode: number;
};

export type XentryCollectionStatusResponse = {
  customerRef: string;
  rid: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  updatedAt: string;
};

export type XentryPayoutRequest = {
  customerReference: string;
  telecomProviderId: string;
  msisdn: string;
  name: string;
  transactionType: 'PAYOUT';
  currency: 'RWF';
  amount: number;
};

export type XentryPayoutResponse = {
  id: number;
  businessName: string;
  customerReference: string;
  telecomProvider: string;
  telecomProviderId: string;
  msisdn: string;
  transactionType: string;
  currency: string;
  amount: number;
  txnCharge: number;
  status: 'PENDING' | 'COMPLETED' | 'SUCCESSFUL' | 'FAILED' | 'REVERSED' | 'REJECTED';
  statusMessage: string;
  internalRef: string;
  remoteIp: string;
  paymentChanel: string;
  validatedAccountName: string;
  externalTransactionRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type XentryPayoutStatusResponse = XentryPayoutResponse;

type XentryPayoutStatusData = Partial<XentryPayoutResponse> & {
  status: XentryPayoutResponse['status'];
  reference_number?: string;
  reason?: string;
  message?: string;
};

type XentryPayoutStatusEnvelope = {
  timestamp?: string;
  message?: string;
  data: XentryPayoutStatusData;
};

export type XentryCheckoutSessionRequest = {
  amount: number;
  customerFinalUrl: string;
  currency?: 'RWF';
};

export type XentryCheckoutSessionResponse = {
  id: string;
  checkoutUrl: string;
  status: 'CREATED';
};

export type XentryCheckoutPayRequest = {
  customerRef?: string;
  email?: string;
  cname?: string;
  cnumber?: string;
  msisdn?: string;
  details?: string;
  currency?: 'RWF';
  pmethod: 'momo' | 'cc';
  chargesIncluded?: boolean;
  gatewayRedirectUrl?: string;
};

export type XentryCheckoutPayResponse = {
  status: 'PENDING';
  redirectTo: string;
  gatewayUrl: string | null;
  paymentMethod: 'momo' | 'cc';
};

export type XentryCheckoutStatusResponse = {
  refid: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
};

export type XentryErrorResponse = {
  message: string;
  status: number;
};

@Injectable()
export class XentryPayHelper {
  private readonly logger = new Logger(XentryPayHelper.name);

  constructor(private readonly config: XentryPayConfigService) {}

  private async settings(): Promise<XentryPayConfig> {
    const { baseUrl, apiKey } = await this.config.get();
    return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey: apiKey.trim() };
  }

  async isConfigured(): Promise<boolean> {
    const { baseUrl, apiKey } = await this.settings();
    return Boolean(baseUrl && apiKey);
  }

  private getHeaders(apiKey: string): Record<string, string> {
    return {
      'X-XENTRIPAY-KEY': apiKey,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const { baseUrl, apiKey } = await this.settings();

    if (!apiKey) {
      throw new Error('Xentry Pay API key is not configured. Set it in Settings → Providers.');
    }

    const url = `${baseUrl}${path}`;
    this.logger.log(`XentryPay ${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(apiKey),
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed: T;

    try {
      parsed = JSON.parse(text) as T;
    } catch {
      throw new Error(`XentryPay invalid JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      const error = parsed as XentryErrorResponse;
      throw new Error(error.message || `XentryPay ${method} ${path} failed with status ${response.status}`);
    }

    return parsed;
  }

  async initiateCollection(request: XentryCollectionRequest): Promise<XentryCollectionResponse> {
    return this.request<XentryCollectionResponse>('POST', '/api/collections/initiate', request);
  }

  async checkCollectionStatus(reference: string): Promise<XentryCollectionStatusResponse> {
    return this.request<XentryCollectionStatusResponse>('GET', `/api/collections/status/${reference}`);
  }

  async initiatePayout(request: XentryPayoutRequest): Promise<XentryPayoutResponse> {
    return this.request<XentryPayoutResponse>('POST', '/api/payment-requests', request);
  }

  async checkPayoutStatus(customerReference: string): Promise<XentryPayoutStatusResponse> {
    const response = await this.request<XentryPayoutStatusResponse | XentryPayoutStatusEnvelope>(
      'GET',
      `/api/payment-requests/check-status?customerRef=${encodeURIComponent(customerReference)}`,
    );

    // XentriPay's docs show check-status in two shapes: the full payout record
    // and { message, data: { status, ... } }. Normalize both so COMPLETED is
    // not accidentally treated as an unknown/non-terminal status.
    const status = 'data' in response ? response.data : response;
    if (!status?.status) {
      throw new Error('XentryPay payout status response is missing status');
    }

    return status as XentryPayoutStatusResponse;
  }

  async createCheckoutSession(request: XentryCheckoutSessionRequest): Promise<XentryCheckoutSessionResponse> {
    return this.request<XentryCheckoutSessionResponse>('POST', '/api/checkout/sessions', request);
  }

  async payCheckoutSession(sessionId: string, request: XentryCheckoutPayRequest): Promise<XentryCheckoutPayResponse> {
    return this.request<XentryCheckoutPayResponse>('POST', `/api/checkout/sessions/${sessionId}/pay`, request);
  }

  async checkCheckoutSessionStatus(refid: string): Promise<XentryCheckoutStatusResponse> {
    return this.request<XentryCheckoutStatusResponse>('GET', `/api/checkout/sessions/status/${refid}`);
  }

  assertCollectionSuccess(response: XentryCollectionResponse, operation: string): string {
    if (response.success !== 1) {
      throw new Error(`XentryPay ${operation} failed: ${response.reply} (retcode: ${response.retcode})`);
    }

    const refId = response.refid;
    if (!refId) {
      throw new Error(`XentryPay ${operation} succeeded but refid is missing`);
    }

    return refId;
  }

  assertPayoutSuccess(response: XentryPayoutResponse, operation: string): string {
    if (
      response.status === 'FAILED' ||
      response.status === 'REVERSED' ||
      response.status === 'REJECTED'
    ) {
      throw new Error(`XentryPay ${operation} failed: ${response.statusMessage}`);
    }

    const internalRef = response.internalRef;
    if (!internalRef) {
      throw new Error(`XentryPay ${operation} succeeded but internalRef is missing`);
    }

    return internalRef;
  }

  assertCheckoutSuccess(response: XentryCheckoutSessionResponse | XentryCheckoutPayResponse, operation: string): string | null {
    if ('id' in response) {
      if (!response.id) {
        throw new Error(`XentryPay ${operation} succeeded but session id is missing`);
      }
      return response.id;
    }
    if ('redirectTo' in response) {
      return response.redirectTo;
    }
    return null;
  }
}
