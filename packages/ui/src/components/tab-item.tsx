import type { AnchorHTMLAttributes, ComponentType, ElementType, ReactNode } from 'react';
import { cn } from '../cn';
import type { IconProps } from '../icons/index';

// Figma: Komponen › TabItem (State=Default|Active). Bottom nav mobile, lebar 72px.
export type TabItemProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon: ComponentType<IconProps>;
  active?: boolean;
  children: ReactNode;
  as?: ElementType;
  href: string;
};

export function TabItem({
  icon: Icon,
  active = false,
  as: As,
  className,
  children,
  ...props
}: TabItemProps) {
  const Comp = As ?? 'a';
  return (
    <Comp
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-[72px] flex-col items-center gap-1 py-[6px] type-caption',
        active ? 'text-brand' : 'text-fg-muted hover:text-fg-secondary',
        className,
      )}
      {...props}
    >
      <Icon size={24} />
      <span className="whitespace-nowrap">{children}</span>
    </Comp>
  );
}
