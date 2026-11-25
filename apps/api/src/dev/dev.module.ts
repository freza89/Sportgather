import {
  Controller,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { normalizePhone } from '@sportgather/shared';
import { z } from 'zod';
import { BillingModule } from '../billing/billing.controller.js';
import { PaymentsService } from '../billing/payments.service.js';
import { ZodPipe } from '../common/zod.js';
import { MockOutbox } from '../integrations/messaging.js';
import { MockMidtrans } from '../integrations/midtrans.js';

/**
 * HANYA lokal/tes (tidak dimuat di production): membaca pesan WhatsApp/SMS mock,
 * mis. untuk melihat kode OTP saat mencoba aplikasi tanpa vendor WhatsApp.
 */
@ApiExcludeController()
@Controller('dev')
class DevController {
  constructor(
    private readonly outbox: MockOutbox,
    private readonly midtrans: MockMidtrans,
    private readonly payments: PaymentsService,
  ) {}

  @Get('outbox')
  list(@Query('to') to?: string) {
    const phone = to ? normalizePhone(to) : null;
    return this.outbox.messages
      .filter((m) => !phone || m.to === phone)
      .slice(-50)
      .reverse();
  }

  /** Halaman bayar simulasi (PAYMENT_PROVIDER=mock). */
  @Get('midtrans/:orderId')
  tx(@Param('orderId') orderId: string) {
    const tx = this.midtrans.info(orderId);
    if (!tx) throw new NotFoundException('Transaksi mock tidak ditemukan');
    return tx;
  }

  /** Simulasikan hasil bayar lalu kirim notifikasi bertanda tangan ke webhook. */
  @Post('midtrans/:orderId/simulate')
  @HttpCode(200)
  async simulate(
    @Param('orderId') orderId: string,
    @Body(new ZodPipe(z.object({ outcome: z.enum(['settlement', 'expire', 'deny']) })))
    body: { outcome: 'settlement' | 'expire' | 'deny' },
  ) {
    if (!this.midtrans.info(orderId)) throw new NotFoundException('Transaksi mock tidak ditemukan');
    const n = this.midtrans.simulate(orderId, body.outcome);
    await this.payments.handleNotification(n);
    return { finishUrl: this.midtrans.info(orderId)!.finishUrl };
  }
}

@Module({ imports: [BillingModule], controllers: [DevController] })
export class DevModule {}
