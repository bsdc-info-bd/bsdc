/**
 * BSDC — src/shared/ui/RadioGroup.tsx
 * Purpose : Radio groups and selectable cards for plan and post-type pickers (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Card mode exposes the whole row as the target, which is measurably better on a
 *           250px phone than a 20px dot.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/shared/lib/cn';

/** A radio option. */
export interface RadioOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
}

/** Props for the RadioGroup component. */
export interface RadioGroupProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly RadioOption<T>[];
  readonly variant?: ('default' | 'card') | undefined;
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a radio group.
 * @param props component props
 * @returns a radio group element
 */
export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  variant = 'default',
  label,
  className,
}: RadioGroupProps<T>): React.ReactElement {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next): void => onValueChange(next as T)}
      className={cn(variant === 'card' ? 'grid gap-2' : 'grid gap-2', className)}
      aria-label={label}
    >
      {options.map((option) => {
        const indicator = (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
            className={variant === 'card' ? 'bsdc-radio mt-1' : 'bsdc-radio'}
            id={`radio-${option.value}`}
          >
            <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
              <span className="bsdc-radio__indicator" />
            </RadioGroupPrimitive.Indicator>
          </RadioGroupPrimitive.Item>
        );

        const content: ReactNode = (
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{option.label}</span>
            {option.description !== undefined && (
              <span className="bsdc-field__hint">{option.description}</span>
            )}
          </span>
        );

        return variant === 'card' ? (
          <label
            key={option.value}
            htmlFor={`radio-${option.value}`}
            className="bsdc-radio-card"
            data-state={value === option.value ? 'checked' : 'unchecked'}
          >
            {indicator}
            {content}
          </label>
        ) : (
          <span key={option.value} className="bsdc-checkbox-row">
            {indicator}
            <label className="cursor-pointer text-sm text-ink" htmlFor={`radio-${option.value}`}>
              {option.label}
            </label>
          </span>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
