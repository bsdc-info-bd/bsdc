import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: readonly SelectOption[];
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /**
   * A flat option list. Optional because a select with neither options nor
   * groups is a bug the component cannot fix, but it must be explicit — the
   * grouped form below is not a fallback for a missing list.
   */
  options?: readonly SelectOption[];
  /** Grouped option list, rendered as <optgroup> elements. */
  groups?: readonly SelectGroup[];
  hint?: string | undefined;
  error?: string | undefined;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, options, groups, hint, error, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const renderOptions = (items: readonly SelectOption[]) =>
    items.map((option) => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    ));

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-11 w-full rounded-xl border bg-bg px-3 text-sm outline-none',
          error ? 'border-danger' : 'border-border focus:border-green-500',
        )}
        {...rest}
      >
        {groups
          ? groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {renderOptions(group.options)}
              </optgroup>
            ))
          : renderOptions(options ?? [])}
      </select>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
