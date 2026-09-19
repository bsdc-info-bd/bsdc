/**
 * BSDC — src/shared/ui/Checkbox.tsx
 * Purpose : Checkbox with label, indeterminate state and bulk-selection support (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Indeterminate is used by admin tables to represent a partially selected page.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useId } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';

/** Props for the Checkbox component. */
export interface CheckboxProps {
  readonly checked: boolean | 'indeterminate';
  readonly onCheckedChange: (checked: boolean | 'indeterminate') => void;
  readonly label?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly id?: string | undefined;
}

/**
 * Renders a checkbox.
 * @param props component props
 * @returns a checkbox element
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
  id,
}: CheckboxProps): React.ReactElement {
  const generated = useId();
  const boxId = id ?? generated;

  const control = (
    <CheckboxPrimitive.Root
      id={boxId}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn('bsdc-checkbox', className)}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {checked === 'indeterminate' ? (
          <Icon name="minus" size={14} />
        ) : (
          <Icon name="check" size={14} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (label === undefined) return control;

  return (
    <span className="bsdc-checkbox-row">
      {control}
      <label className="cursor-pointer text-sm text-ink" htmlFor={boxId}>
        {label}
      </label>
    </span>
  );
}
