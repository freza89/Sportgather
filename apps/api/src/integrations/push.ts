import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';

/** Notifikasi Web Push (PWA). Payload kecil; detail dibuka lewat `url`. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSender {
  readonly publicKey: string | null;
  /** 'gone' = langganan kedaluwarsa (hapus). */
  send(target: PushTarget, payload: PushPayload): Promise<'ok' | 'gone' | 'error'>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Mock: disimpan di memori (dibaca tes & /v1/dev/push). */
@Injectable()
export class MockPush implements PushSender {
  readonly publicKey =
    'BMockPublicKeyForLocalDevelopmentOnly0000000000000000000000000000000000000000000000000';
  readonly sent: (PushPayload & { endpoint: string; at: string })[] = [];

  async send(target: PushTarget, payload: PushPayload) {
    this.sent.push({ ...payload, endpoint: target.endpoint, at: new Date().toISOString() });
    if (this.sent.length > 500) this.sent.shift();
    return target.endpoint.includes('gone') ? ('gone' as const) : ('ok' as const);
  }
}

export class WebPushSender implements PushSender {
  private readonly logger = new Logger('WebPush');

  constructor(
    readonly publicKey: string,
    privateKey: string,
    subject: string,
  ) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(target: PushTarget, payload: PushPayload) {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 3600, urgency: 'normal' },
      );
      return 'ok' as const;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone' as const;
      this.logger.warn(`Push gagal (${status ?? 'network'}): ${(e as Error).message}`);
      return 'error' as const;
    }
  }
}
