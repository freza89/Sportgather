'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../cn';

export type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  label?: string;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
};

// O-02: enam kotak kode verifikasi. Mendukung tempel kode & autofill SMS (one-time-code).
export function OtpInput({
  value,
  onChange,
  length = 6,
  label = 'Kode verifikasi',
  disabled,
  error,
  autoFocus,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, length));
  };

  const handleInput = (index: number, raw: string) => {
    const only = raw.replace(/\D/g, '');
    if (only.length > 1) {
      onChange(only.slice(0, length));
      refs.current[Math.min(only.length, length) - 1]?.focus();
      return;
    }
    setAt(index, only);
    if (only && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
      setAt(index - 1, '');
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      refs.current[Math.min(pasted.length, length) - 1]?.focus();
    }
  };

  return (
    <fieldset className="flex flex-col gap-[6px]">
      <legend className="mb-[6px] type-caption-bold text-fg-secondary">{label}</legend>
      <div className="flex gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            aria-label={`Digit ${i + 1}`}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              'h-[52px] w-full min-w-0 rounded-control border bg-surface text-center text-[22px] font-bold text-fg',
              'focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none',
              error ? 'border-danger' : 'border-line',
            )}
          />
        ))}
      </div>
    </fieldset>
  );
}
