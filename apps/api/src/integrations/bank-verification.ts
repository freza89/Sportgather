import { Injectable } from '@nestjs/common';

export interface BankVerificationResult {
  status: 'verified' | 'rejected' | 'pending_verification';
  registeredName: string | null;
  note: string | null;
}

/**
 * Verifikasi rekening tujuan (FEE-08): nama pemilik harus cocok. Implementasi nyata
 * memakai validasi rekening Midtrans Iris atau pendaftaran penerima Split (M4).
 */
export interface BankVerifier {
  verify(input: {
    bankCode: string;
    accountNumber: string;
    holderName: string;
  }): Promise<BankVerificationResult>;
}

export const BANK_VERIFIER = Symbol('BANK_VERIFIER');

/** Mock: nomor berakhiran 0000 ditolak, berakhiran 9999 tetap menunggu; lainnya lolos. */
@Injectable()
export class MockBankVerifier implements BankVerifier {
  async verify(input: {
    accountNumber: string;
    holderName: string;
  }): Promise<BankVerificationResult> {
    if (input.accountNumber.endsWith('0000')) {
      return {
        status: 'rejected',
        registeredName: null,
        note: 'Nama pemilik rekening tidak cocok',
      };
    }
    if (input.accountNumber.endsWith('9999')) {
      return { status: 'pending_verification', registeredName: null, note: null };
    }
    return { status: 'verified', registeredName: input.holderName, note: null };
  }
}
