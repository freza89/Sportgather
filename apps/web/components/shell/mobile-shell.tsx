'use client';

import { Avatar, IconBack, IconBell, TabItem } from '@sportgather/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { activeEntry, hrefFor, PELATIH_NAV, WALI_NAV } from '@/lib/navigation';

const NAV = { pelatih: PELATIH_NAV, wali: WALI_NAV } as const;

export type MobileShellProps = {
  base: string;
  /** Peran menentukan isi bottom nav. Dikirim sebagai string karena ikon tidak bisa diserialisasi dari server. */
  role: keyof typeof NAV;
  title: string;
  subtitle?: string;
  /** Tombol kembali (layar detail seperti P-02). Bila ada, bottom nav disembunyikan. */
  backHref?: string;
  trailing?: 'avatar' | 'bell';
  userName: string;
  children: ReactNode;
};

// Figma P-01 / O-03: app bar navy + konten canvas + bottom nav putih (5 tab).
export function MobileShell({
  base,
  role,
  title,
  subtitle,
  backHref,
  trailing = 'avatar',
  userName,
  children,
}: MobileShellProps) {
  const pathname = usePathname();
  const nav = NAV[role];
  const active = activeEntry(nav, base, pathname);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-canvas shadow-sm">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-navy-900 px-5 pt-[max(8px,env(safe-area-inset-top))] pb-5">
        {backHref ? (
          <Link href={backHref} aria-label="Kembali" className="text-fg-inverse">
            <IconBack />
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <h1
            className={
              backHref ? 'truncate type-h2 text-fg-inverse' : 'truncate type-h1 text-fg-inverse'
            }
          >
            {title}
          </h1>
          {subtitle ? <p className="truncate type-caption text-navy-muted">{subtitle}</p> : null}
        </div>
        {backHref ? null : trailing === 'bell' ? (
          <button
            type="button"
            aria-label="Notifikasi"
            className="flex size-[38px] items-center justify-center rounded-full bg-navy-700 text-fg-inverse"
          >
            <IconBell size={20} />
          </button>
        ) : (
          <Link href="/pilih-klub" aria-label="Akun & ganti klub">
            <Avatar name={userName} />
          </Link>
        )}
      </header>

      <main className="flex-1 px-5 py-4 pb-28">{children}</main>

      {backHref ? null : (
        <nav
          aria-label="Menu utama"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[480px] items-start justify-between border-t border-line bg-surface px-3 pt-[6px] pb-[max(22px,env(safe-area-inset-bottom))]"
        >
          {nav.map((entry) => (
            <TabItem
              key={entry.segment}
              as={Link}
              href={hrefFor(base, entry.segment)}
              icon={entry.icon}
              active={entry === active}
            >
              {entry.label}
            </TabItem>
          ))}
        </nav>
      )}
    </div>
  );
}
