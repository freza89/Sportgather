import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ICONS,
  IconHome,
  Input,
  Logo,
  NavItem,
  StatCard,
  TabItem,
} from '@sportgather/ui';
import { formatRupiah, formatRupiahRingkas, formatTanggal } from '@sportgather/shared';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Design System' };

const COLORS: [string, string][] = [
  ['brand', 'brand/primary'],
  ['brand-dark', 'brand/primary-dark'],
  ['brand-tint', 'brand/tint'],
  ['navy-900', 'navy/900'],
  ['navy-700', 'navy/700'],
  ['navy-muted', 'navy/muted'],
  ['canvas', 'bg/canvas'],
  ['surface', 'bg/surface'],
  ['line', 'border/default'],
  ['fg', 'text/primary'],
  ['fg-secondary', 'text/secondary'],
  ['fg-muted', 'text/muted'],
  ['success', 'status/success'],
  ['success-bg', 'status/success-bg'],
  ['warning', 'status/warning'],
  ['warning-bg', 'status/warning-bg'],
  ['danger', 'status/danger'],
  ['danger-bg', 'status/danger-bg'],
  ['info', 'status/info'],
  ['info-bg', 'status/info-bg'],
];

const TYPE: [string, string][] = [
  ['type-display', 'Display/28'],
  ['type-h1', 'Heading/H1'],
  ['type-h2', 'Heading/H2'],
  ['type-h3', 'Heading/H3'],
  ['type-body', 'Body/Regular'],
  ['type-body-medium', 'Body/Medium'],
  ['type-body-sm', 'Body/Small'],
  ['type-caption', 'Caption/Medium'],
  ['type-caption-bold', 'Caption/Bold'],
  ['type-button', 'Label/Button'],
  ['type-stat', 'Number/Stat'],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-h2">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="type-display">SportGather Design System</h1>
        <p className="type-body text-fg-secondary">
          Token & komponen dari Figma “00 · Design System”. Font: Plus Jakarta Sans.
        </p>
      </div>

      <Section title="Warna">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {COLORS.map(([token, figma]) => (
            <div key={token} className="flex flex-col gap-1">
              <div
                className="h-16 rounded-control border border-line"
                style={{ background: `var(--color-${token})` }}
              />
              <span className="type-caption-bold">{figma}</span>
              <code className="type-caption text-fg-muted">{token}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografi">
        <div className="flex flex-col gap-3">
          {TYPE.map(([cls, figma]) => (
            <div key={cls} className="flex items-baseline gap-6">
              <code className="w-40 shrink-0 type-caption text-fg-muted">{figma}</code>
              <span className={cls}>Iuran Oktober KU12 sudah lunas</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Ikon (${Object.keys(ICONS).length})`}>
        <div className="flex flex-wrap gap-5 text-fg">
          {Object.entries(ICONS).map(([name, Icon]) => (
            <span key={name} title={name} className="flex flex-col items-center gap-1">
              <Icon />
              <span className="type-caption text-fg-muted">{name}</span>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Komponen">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Simpan</Button>
          <Button variant="secondary">Simpan</Button>
          <Button variant="ghost">Simpan</Button>
          <Button variant="dark">Simpan</Button>
          <Button variant="danger">Simpan</Button>
          <Button disabled>Nonaktif</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge tone="success">Lunas</Badge>
          <Badge tone="warning">Lunas</Badge>
          <Badge tone="danger">Lunas</Badge>
          <Badge tone="info">Lunas</Badge>
          <Badge tone="neutral">Lunas</Badge>
          <Badge tone="brand">Lunas</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip selected>Hadir 12</Chip>
          <Chip>Izin 2</Chip>
          <Chip>Sakit 0</Chip>
          <Chip>Alpa 1</Chip>
        </div>
        <div className="flex flex-wrap items-start gap-8">
          <Input label="Nama lengkap anak" defaultValue="Zaki Pratama" className="w-80" />
          <Input
            label="Nomor WhatsApp"
            placeholder="08xx"
            error="Nomor WhatsApp tidak valid"
            className="w-80"
          />
          <div className="flex items-center gap-3">
            <Avatar name="Zaki Pratama" />
            <Avatar name="Belajar Basket Akademi" size={32} />
            <Avatar name="Rizky Ramadhan" size={36} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <Logo theme="dark" />
        </div>
        <div className="flex flex-wrap items-start gap-8">
          <div className="flex w-[240px] flex-col gap-[6px] rounded-card bg-navy-900 p-4">
            <NavItem href="#" icon={IconHome}>
              Beranda
            </NavItem>
            <NavItem href="#" icon={IconHome} active>
              Beranda
            </NavItem>
          </div>
          <div className="flex gap-2 rounded-card border border-line bg-surface p-2">
            <TabItem href="#" icon={IconHome} active>
              Beranda
            </TabItem>
            <TabItem href="#" icon={IconHome}>
              Beranda
            </TabItem>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Pemain aktif"
            value="142"
            note="+6 pemain bulan ini"
            noteTone="success"
          />
          <StatCard label="Kehadiran 30 hari" value="86%" note="Target ≥85%" noteTone="success" />
          <StatCard
            label="Iuran Oktober terbayar"
            value="87%"
            note={`${formatRupiahRingkas(38_600_000)} dari ${formatRupiahRingkas(44_100_000)}`}
          />
          <StatCard
            label="Tagihan terlambat"
            value="11"
            note="Rp3,4 jt · perlu tindak lanjut"
            noteTone="danger"
          />
        </div>
      </Section>

      <Section title="Format">
        <Card className="flex flex-col gap-1 p-5 type-body">
          <span>{formatRupiah(350_000)}</span>
          <span>{formatTanggal({ year: 2027, month: 10, day: 12 })}</span>
        </Card>
      </Section>
    </main>
  );
}
