import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';
import { XentryPayConfigService } from '../payment/xentry-pay/xentry-pay-config.service';
import { WebhookService } from './webhook.service';

interface XentriPayWebhookPayload {
  event: string;
  data: {
    id: number;
    amount: number;
    currency: string;
    status: string;
    reference: string;
    businessAccountId: number;
    createdAt: string;
    [key: string]: unknown;
  };
  timestamp: string;
  idempotencyKey?: string;
}

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('/webhooks/providers/xentripay')
export class WebhookXentryController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly xentryConfig: XentryPayConfigService,
  ) {}

  @Post()
  async receiveCallback(@Req() req: RawBodyRequest, @Body() payload: XentriPayWebhookPayload) {
    // Signature MUST be verified over the exact bytes XentriPay signed — never
    // over JSON.stringify(req.body), which can re-order/re-serialize keys.
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = req.headers['x-xentripay-signature'] as string;
    const eventType = req.headers['x-xentripay-event'] as string;
    const idempotencyKeyHeader = req.headers['x-xentripay-idempotency-key'] as string;

    if (!signature || !eventType || !idempotencyKeyHeader) {
      throw new HttpException('Missing required XentriPay headers', HttpStatus.BAD_REQUEST);
    }

    const { webhookSecret } = await this.xentryConfig.get();
    if (!webhookSecret.trim()) {
      throw new HttpException(
        'Xentry webhook secret not configured. Set it via ADM_SETXTR_1P3R.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const isValid = this.verifySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      throw new HttpException('Invalid XentriPay signature', HttpStatus.UNAUTHORIZED);
    }

    // Prefer the idempotency key from the signed body over the (unsigned) header.
    const idempotencyKey = payload.idempotencyKey || idempotencyKeyHeader;
    if (!idempotencyKey) {
      throw new HttpException('Missing idempotency key', HttpStatus.BAD_REQUEST);
    }

    return this.webhookService.handleXentriPayWebhook({
      event: payload.event,
      data: payload.data,
      timestamp: payload.timestamp,
      idempotencyKey,
      eventType,
    });
  }

  private verifySignature(rawBody: Buffer, receivedSignature: string, secret: string): boolean {
    const expectedSignature =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      const received = Buffer.from(receivedSignature, 'utf8');
      const expected = Buffer.from(expectedSignature, 'utf8');

      if (received.length !== expected.length) {
        return false;
      }

      return crypto.timingSafeEqual(received, expected);
    } catch {
      return false;
    }
  }
}
