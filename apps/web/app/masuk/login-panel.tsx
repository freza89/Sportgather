'use client';

import type { MeResponse } from '@sportgather/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OtpLogin } from '@/components/auth/otp-login';
import { PasswordLogin } from '@/components/auth/password-login';
import { api } from '@/lib/api-client';
import { homePath, safeNext } from '@/lib/home';

export function LoginPanel({ next }: { next: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');

  async function done() {
    const me = await api<MeResponse>('GET', '/me');
    router.replace(safeNext(next) ?? (me.ok ? homePath(me.data) : '/'));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === 'otp' ? (
        <OtpLogin purpose="login" onSuccess={done} />
      ) : (
        <PasswordLogin onSuccess={done} />
      )}
      <button
        type="button"
        className="self-start type-body-sm text-brand"
        onClick={() => setMode(mode === 'otp' ? 'password' : 'otp')}
      >
        {mode === 'otp' ? 'Owner/admin: masuk dengan email' : 'Masuk dengan WhatsApp'}
      </button>
    </div>
  );
}
