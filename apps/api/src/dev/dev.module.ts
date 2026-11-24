import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { normalizePhone } from '@sportgather/shared';
import { MockOutbox } from '../integrations/messaging.js';

/**
 * HANYA lokal/tes (tidak dimuat di production): membaca pesan WhatsApp/SMS mock,
 * mis. untuk melihat kode OTP saat mencoba aplikasi tanpa vendor WhatsApp.
 */
@ApiExcludeController()
@Controller('dev')
class DevController {
  constructor(private readonly outbox: MockOutbox) {}

  @Get('outbox')
  list(@Query('to') to?: string) {
    const phone = to ? normalizePhone(to) : null;
    return this.outbox.messages
      .filter((m) => !phone || m.to === phone)
      .slice(-50)
      .reverse();
  }
}

@Module({ controllers: [DevController] })
export class DevModule {}
