import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { BANK_VERIFIER, MockBankVerifier } from './bank-verification.js';
import { MockOutbox, SMS_SENDER, WHATSAPP_SENDER } from './messaging.js';
import { MockPush, PUSH_SENDER, WebPushSender } from './push.js';
import {
  MidtransHttpGateway,
  MockIris,
  MockMidtrans,
  PAYMENT_GATEWAY,
  PAYOUT_PROVIDER,
} from './midtrans.js';

function notConfigured(name: string): never {
  throw new Error(
    `${name} belum punya implementasi nyata — set ke "mock" sampai vendor dipilih (plan Q10)`,
  );
}

@Global()
@Module({
  providers: [
    MockOutbox,
    MockBankVerifier,
    MockMidtrans,
    MockIris,
    MockPush,
    {
      provide: PUSH_SENDER,
      inject: [ENV, MockPush],
      useFactory: (env: Env, mock: MockPush) =>
        env.PUSH_PROVIDER === 'real'
          ? new WebPushSender(env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!, env.VAPID_SUBJECT)
          : mock,
    },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENV, MockMidtrans],
      useFactory: (env: Env, mock: MockMidtrans) => {
        if (env.PAYMENT_PROVIDER === 'real')
          return new MidtransHttpGateway(env.MIDTRANS_SERVER_KEY, env.MIDTRANS_IS_PRODUCTION);
        mock.configure(env.WEB_ORIGIN, env.MIDTRANS_SERVER_KEY);
        return mock;
      },
    },
    {
      provide: PAYOUT_PROVIDER,
      inject: [ENV, MockIris],
      // Iris asli menyusul bersama akses Midtrans (ADR-016).
      useFactory: (env: Env, mock: MockIris) =>
        env.PAYOUT_PROVIDER === 'mock' ? mock : notConfigured('PAYOUT_PROVIDER (Iris)'),
    },
    {
      provide: WHATSAPP_SENDER,
      inject: [ENV, MockOutbox],
      useFactory: (env: Env, outbox: MockOutbox) =>
        env.WHATSAPP_PROVIDER === 'mock'
          ? outbox.sender('whatsapp')
          : notConfigured('WHATSAPP_PROVIDER'),
    },
    {
      provide: SMS_SENDER,
      inject: [ENV, MockOutbox],
      useFactory: (env: Env, outbox: MockOutbox) =>
        env.SMS_PROVIDER === 'mock' ? outbox.sender('sms') : notConfigured('SMS_PROVIDER'),
    },
    {
      provide: BANK_VERIFIER,
      inject: [ENV, MockBankVerifier],
      useFactory: (env: Env, mock: MockBankVerifier) =>
        env.BANK_VERIFICATION_PROVIDER === 'mock'
          ? mock
          : notConfigured('BANK_VERIFICATION_PROVIDER'),
    },
  ],
  exports: [
    MockOutbox,
    WHATSAPP_SENDER,
    SMS_SENDER,
    BANK_VERIFIER,
    MockMidtrans,
    PAYMENT_GATEWAY,
    PAYOUT_PROVIDER,
    MockPush,
    PUSH_SENDER,
  ],
})
export class IntegrationsModule {}
