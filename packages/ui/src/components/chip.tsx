import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

// Chip filter (P-02, P-03, P-05): pil kecil, terpilih = oranye.
export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean };

export function Chip({ selected = false, className, type = 'button', ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-[6px] type-caption-bold whitespace-nowrap transition-colors',
        selected
          ? 'border-brand bg-brand text-fg-inverse'
          : 'border-line bg-surface text-fg-secondary hover:border-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
