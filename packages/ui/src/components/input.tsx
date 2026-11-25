import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

// Figma: Komponen › Input (label Caption/Bold + field 14px/12px padding, radius 10)
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-[6px]', className)}>
      <label htmlFor={inputId} className="type-caption-bold text-fg-secondary">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'w-full rounded-control border border-line bg-surface px-[14px] py-[12px] type-body text-fg placeholder:text-fg-muted',
          'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-tint',
          error && 'border-danger focus:border-danger focus:ring-danger-bg',
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="type-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="type-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
