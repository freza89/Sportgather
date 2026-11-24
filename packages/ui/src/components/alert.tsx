import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';
import { IconShield, type IconProps } from '../icons';

// Kotak info/peringatan (A-02 "Ganti rekening butuh persetujuan…", A-03 info audit log).
const TONES = {
  warning: 'bg-warning-bg text-warning',
  info: 'bg-info-bg text-info',
  danger: 'bg-danger-bg text-danger',
  success: 'bg-success-bg text-success',
} as const;

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: keyof typeof TONES;
  icon?: ComponentType<IconProps>;
  children: ReactNode;
};

export function Alert({
  tone = 'info',
  icon: Icon = IconShield,
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-control px-4 py-3 type-body-sm',
        TONES[tone],
        className,
      )}
      {...props}
    >
      <Icon size={18} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
