import type { AnchorHTMLAttributes, ComponentType, ElementType, ReactNode } from 'react';
import { cn } from '../cn';
import type { IconProps } from '../icons/index';

// Figma: Komponen › NavItem (State=Default|Active). Sidebar admin, lebar 208px, tinggi 40px.
export type NavItemProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon: ComponentType<IconProps>;
  active?: boolean;
  children: ReactNode;
  /** Komponen link router, mis. `next/link`. Default `<a>`. */
  as?: ElementType;
  href: string;
};

export function NavItem({
  icon: Icon,
  active = false,
  as: As,
  className,
  children,
  ...props
}: NavItemProps) {
  const Comp = As ?? 'a';
  return (
    <Comp
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 w-full items-center gap-3 rounded-control px-3 type-body-medium transition-colors',
        active
          ? 'bg-brand text-fg-inverse'
          : 'text-navy-muted hover:bg-navy-700 hover:text-fg-inverse',
        className,
      )}
      {...props}
    >
      <Icon size={20} />
      <span className="truncate">{children}</span>
    </Comp>
  );
}
