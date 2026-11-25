'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/api-client';

export function LogoutButton({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Keluar"
      className={className}
      onClick={async () => {
        await api('POST', '/auth/logout');
        router.replace('/masuk');
        router.refresh();
      }}
    >
      {children}
    </button>
  );
}
