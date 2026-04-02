import { Body, Controller, Post } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('/mtn-callback')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  async receiveCallback(
    @Body()
    payload: {
      externalId?: string;
      status?: string;
      reason?: string;
      financialTransactionId?: string;
    },
  ) {
    return this.webhookService.handleMtnCallback(payload);
  }
}