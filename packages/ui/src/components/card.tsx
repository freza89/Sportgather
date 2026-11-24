import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface', className)} {...props} />;
}

// Kartu statistik dashboard (A-17): label Caption, angka Number/Stat, keterangan berwarna.
export type StatCardProps = {
  label: string;
  value: string;
  note?: string;
  noteTone?: 'success' | 'danger' | 'muted';
  className?: string;
};

export function StatCard({ label, value, note, noteTone = 'muted', className }: StatCardProps) {
  return (
    <Card className={cn('flex flex-col gap-[6px] p-5', className)}>
      <span className="type-caption-bold text-fg-secondary">{label}</span>
      <span className="type-stat text-fg">{value}</span>
      {note ? (
        <span
          className={cn(
            'type-caption',
            noteTone === 'success' && 'text-success',
            noteTone === 'danger' && 'text-danger',
            noteTone === 'muted' && 'text-fg-muted',
          )}
        >
          {note}
        </span>
      ) : null}
    </Card>
  );
}
