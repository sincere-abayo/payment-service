import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MtnDirectProvider } from './mtn/mtn-direct.provider';
import { MtnPayConfigService } from './mtn/mtn-config.service';
import { PaymentProviderService } from './payment-provider.service';
import { ProviderRoutingService } from './provider-routing.service';
import { XentryPayConfigService } from './xentry-pay/xentry-pay-config.service';
import { XentryPayHelper } from './xentry-pay/xentry-pay.helper';
import { XentryPayProvider } from './xentry-pay/xentry-pay.provider';

@Module({
  imports: [PrismaModule],
  providers: [
    MtnDirectProvider,
    MtnPayConfigService,
    PaymentProviderService,
    ProviderRoutingService,
    XentryPayConfigService,
    XentryPayHelper,
    XentryPayProvider,
  ],
  exports: [
    PaymentProviderService,
    MtnPayConfigService,
    ProviderRoutingService,
    XentryPayConfigService,
    XentryPayHelper,
  ],
})
export class PaymentProviderModule {}
