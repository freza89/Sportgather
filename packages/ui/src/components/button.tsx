import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

// Figma: Komponen › Button (Type=Primary|Secondary|Ghost|Dark|Danger)
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control px-[18px] py-[10px] type-button whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-fg-inverse hover:bg-brand-dark',
        secondary: 'border border-line bg-surface text-fg hover:bg-canvas',
        ghost: 'text-brand hover:bg-brand-tint',
        dark: 'bg-navy-900 text-fg-inverse hover:bg-navy-700',
        danger: 'bg-danger-bg text-danger hover:bg-danger hover:text-fg-inverse',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, block, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, block }), className)} {...props} />
  );
}
