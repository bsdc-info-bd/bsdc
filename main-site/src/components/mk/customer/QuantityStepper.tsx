import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  disabled?: boolean;
}

/** Accessible +/- control. Values are clamped to [min, max]. */
export function QuantityStepper({ value, min = 0, max, onChange, label, disabled = false }: Props) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-xl border border-border bg-surface"
    >
      <button
        type="button"
        aria-label={`−1 ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="grid h-9 w-9 place-items-center rounded-l-xl hover:bg-surface-2 disabled:opacity-40"
      >
        <Minus size={14} aria-hidden />
      </button>
      <output
        aria-live="polite"
        className="min-w-[2.25rem] text-center text-sm font-semibold tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label={`+1 ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="grid h-9 w-9 place-items-center rounded-r-xl hover:bg-surface-2 disabled:opacity-40"
      >
        <Plus size={14} aria-hidden />
      </button>
    </div>
  );
}
