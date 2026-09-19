/**
 * BSDC — src/shared/ui/Separator.tsx
 * Purpose : Horizontal and vertical dividers, with an optional label (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Separators are decorative: assistive technology announces them through the structure
 *           of the surrounding list or region, not through the divider itself.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { cn } from '@/shared/lib/cn';

/** Props for the Separator component. */
export interface SeparatorProps {
  readonly orientation?: ('horizontal' | 'vertical') | undefined;
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a divider.
 * @param props component props
 * @returns a separator element
 */
export function Separator({
  orientation = 'horizontal',
  label,
  className,
}: SeparatorProps): React.ReactElement {
  if (label !== undefined) {
    return (
      <div
        className={cn('bsdc-separator--labelled', className)}
        role="separator"
        aria-orientation="horizontal"
      >
        {label}
      </div>
    );
  }
  return (
    <div
      className={cn('bsdc-separator', className)}
      role="separator"
      aria-orientation={orientation}
    />
  );
}
