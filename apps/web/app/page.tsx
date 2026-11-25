import { Logo, buttonVariants } from '@sportgather/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMeOptional } from '@/lib/api-server';
import { homePath } from '@/lib/home';

export default async function Home() {
  const me = await getMeOptional();
  if (me) redirect(homePath(me));
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-12">
      <Logo />
      <div className="flex flex-col gap-3">
        <h1 className="type-display">Kelola klub usia muda tanpa spreadsheet</h1>
        <p className="type-body text-fg-secondary">
          Pemain per kelompok umur, jadwal & absensi, iuran lewat QRIS/VA, dan rapor untuk orang tua
          — dalam satu aplikasi.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/masuk" className={buttonVariants()}>
          Masuk
        </Link>
        <Link href="/daftar-klub" className={buttonVariants({ variant: 'secondary' })}>
          Daftarkan klub
        </Link>
      </div>
      <Link href="/design" className="mt-auto type-caption text-fg-muted underline">
        Design system
      </Link>
    </main>
  );
}
