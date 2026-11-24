'use client';

import { homeForRole, type StaffRole } from '@sportgather/shared';
import { Alert, Button } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OtpLogin } from '@/components/auth/otp-login';
import { api } from '@/lib/api-client';

export function AcceptInvitation({
  token,
  phoneMasked,
  loggedIn,
}: {
  token: string;
  phoneMasked: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(loggedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await api<{ slug: string; role: StaffRole }>('POST', '/invitations/accept', {
      token,
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    router.replace(homeForRole(res.data.role, res.data.slug));
    router.refresh();
  }

  if (!authed) {
    return (
      <>
        <p className="type-body text-fg-secondary">
          Masuk dengan nomor WhatsApp yang diundang (
          <strong className="text-fg">{phoneMasked}</strong>).
        </p>
        <OtpLogin
          purpose="login"
          submitLabel="Masuk & terima"
          onSuccess={async () => {
            setAuthed(true);
            await accept();
          }}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </>
    );
  }

  return (
    <>
      <p className="type-body text-fg-secondary">Undangan ini untuk nomor {phoneMasked}.</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button block onClick={() => void accept()} disabled={busy}>
        {busy ? 'Memproses…' : 'Terima undangan'}
      </Button>
    </>
  );
}
