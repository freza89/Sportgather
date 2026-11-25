import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

// Figma: Komponen › Avatar (40px, inisial Caption/Bold). Ukuran lain diskalakan proporsional
// seperti di desain (32px → 9,6px, 36px → 10,8px).
export type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  size?: number;
  src?: string | undefined;
};

export function initials(name: string): string {
  // Sesuai desain: huruf pertama dua kata pertama — "Coach Andi" → CA, "Belajar Basket Akademi" → BB.
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : (words[0]?.[1] ?? '');
  return (first + second).toUpperCase();
}

export function Avatar({ name, size = 40, src, className, style, ...props }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-tint font-bold text-brand-dark',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.3,
        lineHeight: `${size * 0.4}px`,
        ...style,
      }}
      {...props}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
