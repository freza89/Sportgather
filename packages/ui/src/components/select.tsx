import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../cn';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  error?: ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
};

/** Select bawaan browser dengan gaya Input (lebih ramah HP & aksesibel daripada dropdown kustom). */
export function Select({
  label,
  error,
  options,
  placeholder,
  className,
  id,
  ...props
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <div className={cn('flex flex-col gap-[6px]', className)}>
      <label htmlFor={selectId} className="type-caption-bold text-fg-secondary">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(
          'w-full appearance-none rounded-control border border-line bg-surface bg-[length:16px] bg-[right_14px_center] bg-no-repeat px-[14px] py-[12px] pr-10 type-body text-fg',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6480' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")]",
          'focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none',
          error && 'border-danger',
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="type-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
