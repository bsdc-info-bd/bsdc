/**
 * BSDC — src/shared/ui/Tooltip.tsx
 * Purpose : Supplementary tooltips, suppressed on touch where hovering does not exist
 *           (PART 08.04 R-15).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A tooltip never carries the only copy of essential information: anything important is
 *           rendered as visible text or an aria-label on the control itself.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/shared/lib/cn';

/** Props for the Tooltip component. */
export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: ('top' | 'right' | 'bottom' | 'left') | undefined;
  readonly delayMs?: number | undefined;
}

/**
 * Renders a tooltip around a trigger.
 * @param props component props
 * @returns a tooltip provider-wrapped trigger
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 250,
}: TooltipProps): React.ReactElement {
  return (
    <TooltipPrimitive.Provider delayDuration={delayMs}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className={cn('bsdc-tooltip__content')}
            side={side}
            sideOffset={6}
            collisionPadding={8}
          >
            {content}
            <TooltipPrimitive.Arrow className="bsdc-tooltip__arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
