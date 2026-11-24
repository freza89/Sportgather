import type { ReactNode } from 'react';
import { SettingsTabs } from './settings-tabs';

/** Judul halaman + tab pengaturan (A-02, A-03). */
export function SettingsHeader({
  base,
  title,
  subtitle,
  action,
}: {
  base: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">{title}</h1>
          <p className="type-body text-fg-secondary">{subtitle}</p>
        </div>
        {action}
      </div>
      <SettingsTabs base={base} />
    </div>
  );
}
