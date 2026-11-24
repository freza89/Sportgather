'use client';

import {
  FullNameSchema,
  PhoneSchema,
  formatPhone,
  type OtpChallengeResponse,
} from '@sportgather/shared';
import { Alert, Button, IconClock, Input, OtpInput } from '@sportgather/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api-client';

type Props = {
  purpose: 'login' | 'signup';
  onSuccess: () => void | Promise<void>;
  defaultPhone?: string;
  /** Nama wajib untuk akun baru. */
  askName?: boolean;
  submitLabel?: string;
};

function useCountdown(seconds: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (seconds === null) return;
    const until = Date.now() + seconds * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** O-02: nomor WhatsApp → kode 6 digit, kirim ulang setelah 30 detik, cadangan SMS. */
export function OtpLogin({
  purpose,
  onSuccess,
  defaultPhone = '',
  askName = false,
  submitLabel = 'Masuk',
}: Props) {
  const [phone, setPhone] = useState(defaultPhone);
  const [fullName, setFullName] = useState('');
  const [challenge, setChallenge] = useState<OtpChallengeResponse | null>(null);
  const [resendTimer, setResendTimer] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ phone?: string; fullName?: string }>({});
  const [viaSms, setViaSms] = useState(false);
  const left = useCountdown(resendTimer);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const p = PhoneSchema.safeParse(phone);
    const n = askName ? FullNameSchema.safeParse(fullName) : null;
    const errs: { phone?: string; fullName?: string } = {};
    if (!p.success) errs.phone = p.error.issues[0]?.message ?? 'Nomor WhatsApp tidak valid';
    if (n && !n.success) errs.fullName = n.error.issues[0]?.message ?? 'Nama wajib diisi';
    setFieldError(errs);
    if (!p.success || (n && !n.success)) return;
    setBusy(true);
    const res = await api<OtpChallengeResponse>('POST', '/auth/otp/request', { phone, purpose });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setChallenge(res.data);
    setResendTimer(res.data.resendAfter);
    setCode('');
    setViaSms(false);
  }

  async function sendSms() {
    if (!challenge) return;
    setError(null);
    setBusy(true);
    const res = await api<OtpChallengeResponse>('POST', '/auth/otp/sms', {
      challengeId: challenge.challengeId,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setViaSms(true);
    setCode('');
  }

  async function verify(e?: FormEvent, value = code) {
    e?.preventDefault();
    if (!challenge || value.length !== 6 || busy) return;
    setError(null);
    setBusy(true);
    const res = await api('POST', '/auth/otp/verify', {
      challengeId: challenge.challengeId,
      code: value,
      ...(askName ? { fullName } : {}),
    });
    if (!res.ok) {
      setBusy(false);
      setCode('');
      return setError(res.message);
    }
    await onSuccess();
    setBusy(false);
  }

  if (!challenge) {
    return (
      <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
        {askName ? (
          <Input
            label="Nama lengkap"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={fieldError.fullName}
          />
        ) : null}
        <Input
          label="Nomor WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812-3456-7890"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldError.phone}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" block disabled={busy}>
          {busy ? 'Mengirim kode…' : 'Kirim kode lewat WhatsApp'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
      <p className="type-body text-fg-secondary">
        Kode 6 digit dikirim ke {viaSms ? 'SMS' : 'WhatsApp'}{' '}
        <strong className="text-fg">{formatPhone(PhoneSchema.parse(phone))}</strong>.{' '}
        <button type="button" className="text-brand" onClick={() => setChallenge(null)}>
          Ganti nomor
        </button>
      </p>
      <OtpInput
        value={code}
        onChange={(value) => {
          setCode(value);
          // Kirim otomatis begitu 6 digit terisi.
          if (value.length === 6) void verify(undefined, value);
        }}
        disabled={busy}
        error={Boolean(error)}
        autoFocus
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
        <IconClock size={16} />
        {left > 0 ? (
          <>Kirim ulang kode dalam {mmss(left)}</>
        ) : (
          <button
            type="button"
            className="text-brand"
            onClick={() => void requestCode()}
            disabled={busy}
          >
            Kirim ulang kode
          </button>
        )}
      </p>
      {!viaSms ? (
        <p className="type-body-sm text-fg-secondary">
          Kode tidak masuk?{' '}
          <button
            type="button"
            className="text-brand disabled:text-fg-muted"
            onClick={() => void sendSms()}
            disabled={left > 0 || busy}
          >
            Kirim lewat SMS
          </button>
        </p>
      ) : null}
      <Button type="submit" block disabled={busy || code.length !== 6}>
        {busy ? 'Memeriksa…' : submitLabel}
      </Button>
      {process.env.NODE_ENV !== 'production' ? (
        <p className="type-caption text-fg-muted">
          Mode pengembangan: WhatsApp masih mock. Lihat kode di{' '}
          <a
            className="text-brand underline"
            href="/api/dev/outbox"
            target="_blank"
            rel="noreferrer"
          >
            /api/dev/outbox
          </a>
          .
        </p>
      ) : null}
    </form>
  );
}
