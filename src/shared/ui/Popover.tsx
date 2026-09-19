/**
 * BSDC — src/shared/ui/Popover.tsx
 * Purpose : Inline panels for filters, pickers and explainers (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : On small viewports the caller should use a Sheet instead; the component keeps the
 *           popover geometry correct wherever there is room for it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/shared/lib/cn';

/** Props for the Popover component. */
export interface PopoverProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly label?: string | undefined;
  readonly align?: ('start' | 'center' | 'end') | undefined;
  readonly side?: ('top' | 'right' | 'bottom' | 'left') | undefined;
  readonly open?: boolean | undefined;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string | undefined;
}

/**
 * Renders a popover.
 * @param props component props
 * @returns a popover element
 */
export function Popover({
  trigger,
  children,
  label,
  align = 'center',
  side = 'bottom',
  open,
  onOpenChange,
  className,
}: PopoverProps): React.ReactElement {
  return (
    <PopoverPrimitive.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      <PopoverPrimitive.Trigger asChild aria-label={label}>
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className={cn('bsdc-popover__content', className)}
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
        >
          {children}
          <PopoverPrimitive.Arrow className="bsdc-popover__arrow" width={12} height={6} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
