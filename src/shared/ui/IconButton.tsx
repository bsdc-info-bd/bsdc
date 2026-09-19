/**
 * BSDC — src/shared/ui/IconButton.tsx
 * Purpose : Square icon-only button. Always labelled for assistive technology (LAW-14).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An icon-only control must carry an accessible name; `label` is therefore required.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Icon, type IconProps } from './Icon';

/** Props for the IconButton component. */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Icon name. */
  readonly icon: IconProps['name'];
  /** Required accessible name. */
  readonly label: string;
  readonly variant?: ('ghost' | 'secondary' | 'outline' | 'danger' | 'primary') | undefined;
  readonly size?: ('sm' | 'md' | 'lg') | undefined;
  readonly active?: boolean | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * Renders an icon-only button.
 * @param props component props
 * @returns a labelled button element
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', active = false, className, ...rest },
  ref,
): React.ReactElement {
  const box = size === 'sm' ? 34 : size === 'lg' ? 48 : 40;
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      aria-label={label}
      aria-pressed={rest['aria-pressed'] ?? (variant === 'ghost' ? undefined : active)}
      title={label}
      className={cn(
        'bsdc-button',
        'inline-flex shrink-0 justify-center',
        variant === 'ghost' && 'bg-transparent text-ink-2',
        variant === 'secondary' && 'bg-surface-2 text-ink',
        variant === 'outline' && 'border border-line bg-transparent text-ink',
        variant === 'danger' && 'bg-[var(--bsdc-danger)] text-white',
        variant === 'primary' && 'bg-green-500 text-white',
        active && 'ring-2 ring-[var(--bsdc-green-400)]',
        className,
      )}
      style={{ width: box, height: box, minWidth: box, minHeight: box, padding: 0 }}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
});
