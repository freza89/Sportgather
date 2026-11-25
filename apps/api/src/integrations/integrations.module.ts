import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { BANK_VERIFIER, MockBankVerifier } from './bank-verification.js';
import { MockOutbox, SMS_SENDER, WHATSAPP_SENDER } from './messaging.js';

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
  exports: [MockOutbox, WHATSAPP_SENDER, SMS_SENDER, BANK_VERIFIER],
})
export class IntegrationsModule {}
