import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  label: string;
  className?: string;
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className="h-full rounded-full bg-green-700 transition-[width] duration-300 ease-app"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
