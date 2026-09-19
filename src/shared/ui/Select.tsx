/**
 * BSDC — src/shared/ui/Select.tsx
 * Purpose : Accessible select with a scroll-contained viewport (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Radix Select holds type-ahead, keyboard navigation and portal positioning; the trigger
 *           truncates long labels rather than widening its container (PART 08.04 R-01).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';

/** A select option. */
export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

/** Props for the Select component. */
export interface SelectProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SelectOption<T>[];
  readonly placeholder?: string | undefined;
  readonly label?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a select control.
 * @param props component props
 * @returns a select element
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
  label,
  disabled = false,
  className,
}: SelectProps<T>): React.ReactElement {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next): void => onValueChange(next as T)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn('bsdc-select__trigger', className)}
        aria-label={label}
        data-placeholder={value.length === 0 ? 'true' : 'false'}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="bsdc-select__value" />
        <SelectPrimitive.Icon>
          <Icon name="chevronDown" size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="bsdc-select__content" position="popper" sideOffset={6}>
          <SelectPrimitive.Viewport className="bsdc-select__viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                {...(option.disabled !== undefined ? { disabled: option.disabled } : {})}
                className="bsdc-select__item"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
