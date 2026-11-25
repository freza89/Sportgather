'use client';

import { Alert, Button, Input } from '@sportgather/ui';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api-client';

/** Login email + kata sandi — opsi untuk owner/admin yang sudah mengaturnya. */
export function PasswordLogin({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api('POST', '/auth/password/login', { email, password });
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    await onSuccess();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        label="Kata sandi"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" block disabled={busy}>
        {busy ? 'Memeriksa…' : 'Masuk'}
      </Button>
    </form>
  );
}
