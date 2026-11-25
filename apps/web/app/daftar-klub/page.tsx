import { IconCheck, Logo } from '@sportgather/ui';
import type { Metadata } from 'next';
import { formatPhone } from '@sportgather/shared';
import { getMeOptional } from '@/lib/api-server';
import { RegisterClubWizard } from './wizard';

export const metadata: Metadata = { title: 'Daftarkan klub' };

const POINTS = [
  'Penempatan KU otomatis dari tanggal kompetisi',
  'Tagihan iuran & pembayaran QRIS/VA lewat Midtrans',
  'Absensi, rapor, dan info untuk orang tua dalam satu aplikasi',
];

// A-01 · Daftar & buat klub
export default async function DaftarKlubPage() {
  const me = await getMeOptional();
  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="hidden w-[560px] shrink-0 flex-col bg-navy-900 px-14 py-16 text-fg-inverse lg:flex">
        <Logo theme="dark" className="-ml-3" />
        <div className="mt-auto flex flex-col gap-8">
          <h1 className="text-[36px] leading-[46px] font-bold">
            Kelola klub usia muda tanpa spreadsheet
          </h1>
          <ul className="flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 type-body text-navy-muted">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-fg-inverse">
                  <IconCheck size={14} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-auto type-caption text-navy-muted">© 2026 SportGather</p>
      </aside>
      <main className="flex flex-1 items-start justify-center px-4 py-10 lg:items-center">
        <div className="flex w-full max-w-[560px] flex-col gap-6">
          <Logo className="lg:hidden" />
          <RegisterClubWizard
            account={
              me
                ? {
                    fullName: me.user.fullName,
                    phone: me.user.phone ? formatPhone(me.user.phone) : null,
                  }
                : null
            }
          />
        </div>
      </main>
    </div>
  );
}
