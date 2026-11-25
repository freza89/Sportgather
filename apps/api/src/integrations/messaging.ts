import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '@sportgather/shared';

/**
 * Pesan keluar. WhatsApp memakai template yang disetujui Meta (PRD bagian 16); `template`
 * adalah nama template, `params` isiannya. SMS hanya untuk cadangan OTP.
 */
export interface OutboundMessage {
  channel: 'whatsapp' | 'sms';
  to: string;
  template: string;
  params: Record<string, string>;
}

export interface MessageSender {
  send(message: OutboundMessage): Promise<{ providerRef: string }>;
}

export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');
export const SMS_SENDER = Symbol('SMS_SENDER');

/**
 * Implementasi mock: pesan disimpan di memori (bisa dibaca lewat /v1/dev/outbox di
 * lingkungan non-produksi) dan dicatat ke log dengan nomor tersamar.
 */
@Injectable()
export class MockOutbox {
  private readonly logger = new Logger('MockOutbox');
  readonly messages: (OutboundMessage & { id: number; sentAt: string })[] = [];
  private seq = 0;

  sender(channel: OutboundMessage['channel']): MessageSender {
    return {
      send: async (message) => {
        const entry = { ...message, channel, id: ++this.seq, sentAt: new Date().toISOString() };
        this.messages.push(entry);
        if (this.messages.length > 500) this.messages.shift();
        this.logger.log(`[${channel}] ${message.template} → ${maskPhone(message.to)}`);
        return { providerRef: `mock-${entry.id}` };
      },
    };
  }

  /** Pesan terakhir ke nomor tertentu (dipakai tes & e2e untuk membaca OTP). */
  latest(to: string, template?: string) {
    return [...this.messages]
      .reverse()
      .find((m) => m.to === to && (!template || m.template === template));
  }
}
