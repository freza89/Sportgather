import { homeForRole, ROLE_LABEL, type StaffRole } from '@sportgather/shared';
import { Avatar, Badge, Card, IconChevron, Logo, buttonVariants } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { getMe } from '@/lib/api-server';

export const metadata: Metadata = { title: 'Pilih klub' };

export default async function PilihKlubPage() {
  const me = await getMe('/pilih-klub');
  const clubs = me.clubs;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-6 px-5 pt-12 pb-10">
      <Logo />
      <div className="flex flex-col gap-1">
        <h1 className="type-h1">Halo, {me.user.fullName}</h1>
        <p className="type-body text-fg-secondary">Pilih klub yang ingin Anda buka.</p>
      </div>
      <div className="flex flex-col gap-3">
        {clubs.map((c) =>
          c.status === 'active' ? (
            <Link key={c.orgId} href={homeForRole(c.role as StaffRole, c.slug)}>
              <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand">
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate type-body-medium">{c.name}</p>
                  <p className="type-caption text-fg-muted">{ROLE_LABEL[c.role as StaffRole]}</p>
                </div>
                <IconChevron size={18} className="text-fg-muted" />
              </Card>
            </Link>
          ) : (
            <Card key={c.orgId} className="flex items-center gap-3 p-4">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate type-body-medium">{c.name}</p>
                <p className="type-caption text-fg-muted">
                  Diundang sebagai {ROLE_LABEL[c.role as StaffRole]} · buka link undangan di
                  WhatsApp untuk menerima
                </p>
              </div>
              <Badge tone="warning">Undangan</Badge>
            </Card>
          ),
        )}
        {clubs.length === 0 ? (
          <Card className="p-5 type-body text-fg-secondary">
            Anda belum terdaftar sebagai staf di klub mana pun.
          </Card>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/daftar-klub" className={buttonVariants({ variant: 'secondary' })}>
          Daftarkan klub baru
        </Link>
        <Link href="/wali" className={buttonVariants({ variant: 'ghost' })}>
          Area orang tua
        </Link>
        <LogoutButton
          className={buttonVariants({ variant: 'ghost', className: 'ml-auto text-fg-secondary' })}
        >
          Keluar
        </LogoutButton>
      </div>
    </main>
  );
}
