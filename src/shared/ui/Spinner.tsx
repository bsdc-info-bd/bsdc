/**
 * BSDC — src/shared/ui/Spinner.tsx
 * Purpose : Inline loading indicator with an accessible label (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The spinner is decorative when a sibling status region already announces the pending
 *           state; pass `label` to make it self-describing.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { cn } from '@/shared/lib/cn';

/** Props for the Spinner component. */
export interface SpinnerProps {
  readonly size?: number | undefined;
  readonly className?: string | undefined;
  /** When provided, the spinner becomes an img-role status element with this label. */
  readonly label?: string | undefined;
}

/**
 * Renders a spinner.
 * @param props component props
 * @returns a spinning indicator
 */
export function Spinner({ size = 20, className, label }: SpinnerProps): React.ReactElement {
  return (
    <span
      className={cn('bsdc-button__spinner', className)}
      style={{ width: size, height: size }}
      role={label === undefined ? undefined : 'status'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    />
  );
}
