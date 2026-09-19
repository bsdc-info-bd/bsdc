/**
 * BSDC — src/shared/ui/Chip.tsx
 * Purpose : Filter chips, tag chips and removable chips (PART 08.09, F-175).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Selection is conveyed by colour, weight and underline together, so the state survives
 *           greyscale printing and colour-vision differences (LAW-14).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';

/** Props for the Chip component. */
export interface ChipProps {
  readonly children?: ReactNode | undefined;
  readonly selected?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly size?: ('sm' | 'md') | undefined;
  readonly onToggle?: (next: boolean) => void;
  readonly onRemove?: () => void;
  /** Accessible name for the remove control. */
  readonly removeLabel?: string | undefined;
  readonly className?: string | undefined;
  readonly icon?: Parameters<typeof Icon>[0]['name'] | undefined;
}

/**
 * Renders a chip.
 * @param props component props
 * @returns a chip element
 */
export function Chip({
  children,
  selected = false,
  disabled = false,
  size = 'md',
  onToggle,
  onRemove,
  removeLabel,
  className,
  icon,
}: ChipProps): React.ReactElement {
  const interactive = onToggle !== undefined;
  const element = interactive ? 'button' : 'span';
  const content = (
    <>
      {icon !== undefined && <Icon name={icon} size={16} />}
      <span className="bsdc-chip__label">{children}</span>
      {onRemove !== undefined && (
        <span className="bsdc-chip__remove" role="presentation">
          <Icon name="close" size={12} />
        </span>
      )}
    </>
  );

  const shared = {
    className: cn('bsdc-chip', className),
    'data-selected': selected ? 'true' : 'false',
    'data-disabled': disabled ? 'true' : 'false',
    'data-size': size,
  } as const;

  if (element === 'button') {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={(): void => onToggle?.(!selected)}
        {...shared}
      >
        {content}
      </button>
    );
  }

  return (
    <span {...shared}>
      {content}
      {onRemove !== undefined && (
        <button
          type="button"
          className="bsdc-chip__remove"
          aria-label={removeLabel ?? 'Remove'}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}

/** Props for the ChipGroup component. */
export interface ChipGroupProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
}

/**
 * Renders a wrapping chip group.
 * @param props component props
 * @returns a group element
 */
export function ChipGroup({ children, className, label }: ChipGroupProps): React.ReactElement {
  return (
    <div className={cn('bsdc-chip-group', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Props for the ChipRail component. */
export interface ChipRailProps {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
}

/**
 * Renders a horizontally scrollable chip rail.
 * @param props component props
 * @returns a scrollable group element
 */
export function ChipRail({ children, className, label }: ChipRailProps): React.ReactElement {
  return (
    <div className={cn('bsdc-chip-rail', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}
