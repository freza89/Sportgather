'use client';

import { TabLink, Tabs } from '@sportgather/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { segment: '', label: 'Profil klub' },
  { segment: 'lokasi', label: 'Lokasi latihan' },
  { segment: 'rekening', label: 'Rekening penerimaan' },
  { segment: 'staf', label: 'Staf & peran' },
  { segment: 'musim', label: 'Musim & kompetisi' },
  { segment: 'langganan', label: 'Langganan' },
];

export function SettingsTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const root = `${base}/pengaturan`;
  return (
    <Tabs label="Pengaturan klub">
      {TABS.map((t) => {
        const href = t.segment ? `${root}/${t.segment}` : root;
        return (
          <TabLink key={t.label} as={Link} href={href} active={pathname === href}>
            {t.label}
          </TabLink>
        );
      })}
    </Tabs>
  );
}
