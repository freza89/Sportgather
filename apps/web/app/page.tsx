import { Badge, Card, Logo, buttonVariants } from '@sportgather/ui';
import Link from 'next/link';
import { DEMO } from '@/lib/demo';

export default function Home() {
  const links = [
    {
      href: `/admin/${DEMO.orgSlug}`,
      title: 'Admin & Owner',
      desc: 'Desktop · sidebar',
      tone: 'brand' as const,
    },
    {
      href: `/pelatih/${DEMO.orgSlug}`,
      title: 'Pelatih',
      desc: 'Mobile · bottom nav',
      tone: 'info' as const,
    },
    {
      href: '/wali',
      title: 'Orang tua / wali',
      desc: 'Mobile · bottom nav',
      tone: 'success' as const,
    },
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-12">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="type-display">Kelola klub usia muda tanpa spreadsheet</h1>
        <p className="type-body text-fg-secondary">
          Kerangka aplikasi (milestone M0). Pilih peran untuk melihat tata letak, atau buka halaman
          design system.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="group">
            <Card className="flex h-full flex-col gap-2 p-5 transition-colors group-hover:border-brand">
              <Badge tone={l.tone} className="self-start">
                {l.desc}
              </Badge>
              <span className="type-h3">{l.title}</span>
            </Card>
          </Link>
        ))}
      </div>
      <Link
        href="/design"
        className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
      >
        Lihat design system
      </Link>
    </main>
  );
}
