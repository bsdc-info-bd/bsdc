import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface StepperProps {
  steps: readonly string[];
  current: number;
  label: string;
  className?: string;
}

/** Horizontal progress for multi-step flows such as onboarding. */
export function Stepper({ steps, current, label, className }: StepperProps) {
  return (
    <ol aria-label={label} className={cn('flex items-center gap-1.5', className)}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                done && 'bg-green-700 text-white',
                active && 'border-2 border-green-700 text-green-700',
                !done && !active && 'border border-border text-muted',
              )}
            >
              {done ? <Check size={12} aria-hidden="true" /> : index + 1}
            </span>
            <span className="fab-truncate hidden text-xs font-medium text-muted sm:inline">
              {step}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
