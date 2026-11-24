import { cn } from '../cn';
import { IconBall } from '../icons/index';

// Figma: Komponen › Logo (Theme=Light|Dark). Mark 34px oranye radius 9 + ikon bola 22px.
export type LogoProps = { theme?: 'light' | 'dark'; className?: string };

export function Logo({ theme = 'light', className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[10px]',
        theme === 'dark' && 'rounded-control bg-navy-900 px-3 py-2',
        className,
      )}
    >
      <span className="flex size-[34px] items-center justify-center rounded-[9px] bg-brand text-fg-inverse">
        <IconBall size={22} />
      </span>
      <span
        className={cn(
          'text-[19px] leading-normal font-extrabold',
          theme === 'dark' ? 'text-fg-inverse' : 'text-fg',
        )}
      >
        SportGather
      </span>
    </span>
  );
}
