/**
 * BSDC — src/shared/ui/SafeArea.tsx
 * Purpose : Safe-area aware wrapper for notched phones and Android gesture bars
 *           (PART 08.04 R-07).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Only the edges requested are padded, so a full-bleed media surface can still sit under
 *           a status bar when that is the intended design.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Props for the SafeArea component. */
export interface SafeAreaProps {
  readonly children?: ReactNode | undefined;
  readonly edges?: readonly ('top' | 'bottom' | 'left' | 'right')[] | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/**
 * Renders a container that respects device safe areas.
 * @param props component props
 * @returns a wrapper element
 */
export function SafeArea({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  className,
  style,
}: SafeAreaProps): React.ReactElement {
  const padding: CSSProperties = {};
  if (edges.includes('top')) padding.paddingTop = 'max(var(--bsdc-space-2), var(--bsdc-safe-top))';
  if (edges.includes('bottom'))
    padding.paddingBottom = 'max(var(--bsdc-space-2), var(--bsdc-safe-bottom))';
  if (edges.includes('left'))
    padding.paddingLeft = 'max(var(--bsdc-space-3), var(--bsdc-safe-left))';
  if (edges.includes('right'))
    padding.paddingRight = 'max(var(--bsdc-space-3), var(--bsdc-safe-right))';

  return (
    <div className={cn(className)} style={{ ...padding, ...style }}>
      {children}
    </div>
  );
}
