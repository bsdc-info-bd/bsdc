/**
 * BSDC — src/shared/ui/ScrollArea.tsx
 * Purpose : Scroll container with contained overscroll (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : overscroll-behavior: contain stops the page from rubber-banding when a nested list
 *           reaches its end — essential on Android WebView.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/shared/lib/cn';

/** Props for the ScrollArea component. */
export interface ScrollAreaProps {
  readonly children: ReactNode;
  /** Fixed height; omit to inherit from the parent flex box. */
  readonly height?: (number | string) | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a scrollable region.
 * @param props component props
 * @returns a scroll area element
 */
export function ScrollArea({ children, height, className }: ScrollAreaProps): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('bsdc-scroll-area', className)}
      style={height !== undefined ? { height } : undefined}
      type="hover"
    >
      <ScrollAreaPrimitive.Viewport className="bsdc-scroll-area__viewport">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="bsdc-scroll-area__scrollbar"
        data-orientation="vertical"
      >
        <ScrollAreaPrimitive.Thumb className="bsdc-scroll-area__thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Scrollbar
        orientation="horizontal"
        className="bsdc-scroll-area__scrollbar"
        data-orientation="horizontal"
      >
        <ScrollAreaPrimitive.Thumb className="bsdc-scroll-area__thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
