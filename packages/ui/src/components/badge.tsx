import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

// Figma: Komponen › Badge (Tone=Success|Warning|Danger|Info|Neutral|Brand)
export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-[10px] py-[4px] type-caption-bold whitespace-nowrap',
  {
    variants: {
      tone: {
        success: 'bg-success-bg text-success',
        warning: 'bg-warning-bg text-warning',
        danger: 'bg-danger-bg text-danger',
        info: 'bg-info-bg text-info',
        neutral: 'bg-canvas text-fg-secondary',
        brand: 'bg-brand-tint text-brand-dark',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
