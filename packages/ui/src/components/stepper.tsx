import { Fragment } from 'react';
import { cn } from '../cn';

// Penanda langkah A-01: pil "1 Profil klub — 2 Lokasi latihan — 3 Rekening".
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Langkah">
      {steps.map((label, i) => (
        <Fragment key={label}>
          {i > 0 ? <li aria-hidden className="h-px w-5 bg-line" /> : null}
          <li
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'rounded-full border px-3 py-[6px] type-caption-bold whitespace-nowrap',
              i === current
                ? 'border-navy-900 bg-navy-900 text-fg-inverse'
                : i < current
                  ? 'border-success-bg bg-success-bg text-success'
                  : 'border-line bg-surface text-fg-secondary',
            )}
          >
            {i < current ? '✓' : i + 1} {label}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
