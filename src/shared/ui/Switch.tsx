/**
 * BSDC — src/shared/ui/Switch.tsx
 * Purpose : Switch and switch row for settings and feature flags (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The visible label is associated with the control through htmlFor, so tapping the text
 *           toggles the switch on every platform.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useId } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/shared/lib/cn';

/** Props for the Switch component. */
export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly size?: ('sm' | 'md') | undefined;
  readonly className?: string | undefined;
  readonly id?: string | undefined;
}

/**
 * Renders a switch, optionally inside a labelled row.
 * @param props component props
 * @returns a switch element
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
  id,
}: SwitchProps): React.ReactElement {
  const generated = useId();
  const switchId = id ?? generated;

  const control = (
    <SwitchPrimitive.Root
      id={switchId}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn('bsdc-switch', className)}
      data-size={size}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <SwitchPrimitive.Thumb className="bsdc-switch__thumb" />
    </SwitchPrimitive.Root>
  );

  if (label === undefined) return control;

  return (
    <div className="bsdc-switch-row">
      <label className="min-w-0 cursor-pointer" htmlFor={switchId}>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description !== undefined && <span className="bsdc-field__hint">{description}</span>}
      </label>
      {control}
    </div>
  );
}
