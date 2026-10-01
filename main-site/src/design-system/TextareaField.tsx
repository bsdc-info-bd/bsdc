import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string | undefined;
  counterMax?: number;
  value?: string;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField({ label, hint, error, counterMax, className, id, ...rest }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const errorId = `${fieldId}-error`;
    const length = typeof rest.value === 'string' ? rest.value.length : 0;

    return (
      <div className={cn('w-full', className)}>
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">
          {label}
        </label>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rest.rows ?? 4}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'w-full resize-y rounded-xl border bg-bg p-3 text-sm outline-none placeholder:text-muted',
            error ? 'border-danger' : 'border-border focus:border-green-500',
          )}
          {...rest}
        />
        <div className="mt-1 flex items-start justify-between gap-2">
          <span className="text-xs text-muted">{hint}</span>
          {counterMax ? (
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {length}/{counterMax}
            </span>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
