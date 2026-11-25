'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../cn';
import { IconX } from '../icons';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Dialog modal memakai <dialog> bawaan (fokus & Escape ditangani browser). */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-32px)] max-w-[480px] rounded-card border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-navy-900/50',
        className,
      )}
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="type-h2">{title}</h2>
            {description ? <p className="mt-1 type-body text-fg-secondary">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="text-fg-muted hover:text-fg"
          >
            <IconX size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
