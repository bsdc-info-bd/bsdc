import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | undefined;
  iconStart?: ReactNode;
  addonEnd?: ReactNode;
}

/** Labelled text input with associated hint and error announcements. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, iconStart, addonEnd, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-bg px-3',
          error ? 'border-danger' : 'border-border focus-within:border-green-500',
        )}
      >
        {iconStart ? (
          <span aria-hidden="true" className="shrink-0 text-muted">
            {iconStart}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy : undefined}
          className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
          {...rest}
        />
        {addonEnd}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
