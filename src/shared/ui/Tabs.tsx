/**
 * BSDC — src/shared/ui/Tabs.tsx
 * Purpose : Accessible tabs with a horizontally scrollable rail (PART 08.09, F-164).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Radix provides roving focus and arrow-key navigation. The rail scrolls instead of
 *           wrapping so the page never grows (PART 08.04 R-01).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/shared/lib/cn';

/** A single tab definition. */
export interface TabItem {
  readonly value: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly disabled?: boolean | undefined;
}

/** Props for the Tabs component. */
export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: (value: string) => void;
  readonly className?: string | undefined;
  /** Accessible label for the tab list. */
  readonly label: string;
}

/**
 * Renders a tab set.
 * @param props component props
 * @returns a tabs element
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  label,
}: TabsProps): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn('bsdc-tabs', className)}
      {...(value !== undefined
        ? { value }
        : { defaultValue: defaultValue ?? items[0]?.value ?? '' })}
      {...(onValueChange !== undefined ? { onValueChange } : {})}
    >
      <TabsPrimitive.List className="bsdc-tabs__list" aria-label={label}>
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className="bsdc-tabs__trigger"
            {...(item.disabled !== undefined ? { disabled: item.disabled } : {})}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value} className="bsdc-tabs__panel">
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
