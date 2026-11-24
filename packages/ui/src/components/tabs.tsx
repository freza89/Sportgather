import type { AnchorHTMLAttributes, ElementType, ReactNode } from 'react';
import { cn } from '../cn';

// Tab garis bawah (A-02: Profil klub · Lokasi latihan · Rekening · Staf & peran · …).
export function Tabs({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn('flex gap-6 overflow-x-auto border-b border-line', className)}
    >
      {children}
    </nav>
  );
}

export type TabLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  active?: boolean;
  as?: ElementType;
};

export function TabLink({ active = false, as: As, className, ...props }: TabLinkProps) {
  const Comp = As ?? 'a';
  return (
    <Comp
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 pb-3 type-body-medium whitespace-nowrap transition-colors',
        active ? 'border-brand text-brand' : 'border-transparent text-fg-secondary hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}
