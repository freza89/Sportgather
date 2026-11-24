'use client';

import {
  Avatar,
  IconBell,
  IconChevron,
  IconLogout,
  IconMore,
  IconSearch,
  IconX,
  Logo,
  NavItem,
  cn,
} from '@sportgather/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LogoutButton } from '@/components/auth/logout-button';
import { ADMIN_NAV, activeEntry, hrefFor } from '@/lib/navigation';

export type AdminShellProps = {
  base: string;
  clubName: string;
  seasonName: string;
  userName: string;
  roleLabel: string;
  /** Tampilkan tautan ganti klub bila orang ini staf di lebih dari satu klub. */
  hasOtherClubs?: boolean;
  children: ReactNode;
};

// Figma A-17: sidebar navy 248px + topbar putih 68px + konten di atas bg/canvas.
export function AdminShell({
  base,
  clubName,
  seasonName,
  userName,
  roleLabel,
  hasOtherClubs = false,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const active = activeEntry(ADMIN_NAV, base, pathname);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-canvas">
      {open ? (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="admin-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col gap-[6px] bg-navy-900 px-4 py-6 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between">
          <Logo theme="dark" />
          <button
            type="button"
            aria-label="Tutup menu"
            className="rounded-control p-2 text-navy-muted hover:text-fg-inverse lg:hidden"
            onClick={() => setOpen(false)}
          >
            <IconX size={20} />
          </button>
        </div>

        <Link
          href={hasOtherClubs ? '/pilih-klub' : base}
          title={hasOtherClubs ? 'Ganti klub' : undefined}
          className="flex items-center gap-[10px] rounded-control bg-navy-700 px-3 py-[10px] hover:bg-navy-700/80"
        >
          <Avatar name={clubName} size={32} />
          <div className="min-w-0 flex-1 type-caption">
            <p className="truncate font-bold text-fg-inverse">{clubName}</p>
            <p className="truncate text-navy-muted">{seasonName}</p>
          </div>
          {hasOtherClubs ? <IconChevron size={16} className="text-navy-muted" /> : null}
        </Link>

        <nav aria-label="Menu utama" className="mt-[10px] flex flex-col gap-[6px]">
          {ADMIN_NAV.map((entry) => (
            <NavItem
              key={entry.segment}
              as={Link}
              href={hrefFor(base, entry.segment)}
              icon={entry.icon}
              active={entry === active}
              onClick={() => setOpen(false)}
            >
              {entry.label}
            </NavItem>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-[10px] px-2 py-3">
          <Avatar name={userName} size={36} />
          <div className="min-w-0 flex-1 type-caption">
            <p className="truncate font-bold text-fg-inverse">{userName}</p>
            <p className="truncate text-navy-muted">{roleLabel}</p>
          </div>
          <LogoutButton className="text-navy-muted hover:text-fg-inverse">
            <IconLogout size={18} />
          </LogoutButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-line bg-surface px-4 lg:px-8">
          <button
            type="button"
            aria-label="Buka menu"
            aria-controls="admin-sidebar"
            aria-expanded={open}
            className="rounded-control p-2 text-fg-secondary lg:hidden"
            onClick={() => setOpen(true)}
          >
            <IconMore size={20} />
          </button>
          <label className="flex h-10 w-full max-w-[380px] items-center gap-2 rounded-control bg-canvas px-3 text-fg-muted">
            <IconSearch size={18} />
            <span className="sr-only">Cari</span>
            <input
              type="search"
              placeholder="Cari pemain, tim, atau tagihan…"
              className="w-full bg-transparent type-body text-fg placeholder:text-fg-muted focus:outline-none"
            />
          </label>
          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              aria-label="Notifikasi"
              className="flex size-[38px] items-center justify-center rounded-control border border-line text-fg hover:bg-canvas"
            >
              <IconBell size={20} />
            </button>
            <Avatar name={userName} size={36} />
          </div>
        </header>

        <main className="flex-1 px-4 py-7 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
