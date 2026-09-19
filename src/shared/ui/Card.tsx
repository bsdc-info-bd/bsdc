/**
 * BSDC — src/shared/ui/Card.tsx
 * Purpose : Six card variants with header, body and footer slots (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The interactive variant renders a real button when `onPress` is supplied, keeping
 *           keyboard activation free of custom key handling.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import type { ElementType } from 'react';
import { cn } from '@/shared/lib/cn';

export type CardVariant =
  'default' | 'plain' | 'elevated' | 'outlined' | 'glass' | 'interactive' | 'brand';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

/** Props for the Card component. */
export interface CardProps {
  readonly children?: ReactNode | undefined;
  readonly variant?: CardVariant | undefined;
  readonly padding?: CardPadding | undefined;
  readonly className?: string | undefined;
  /** When provided, the card becomes a real button. */
  readonly onPress?: () => void;
  /** Element to render. Defaults to a div; a feed uses `article`, a list uses `li`. */
  readonly as?: ElementType | undefined;
  readonly 'aria-label'?: string;
}

/**
 * Renders a card surface.
 * @param props component props
 * @returns a card element
 */
export function Card({
  children,
  variant = 'default',
  padding = 'none',
  className,
  onPress,
  as,
  'aria-label': ariaLabel,
}: CardProps): React.ReactElement {
  const classes = cn('bsdc-card', className);
  const data = {
    'data-variant': variant,
    'data-padding': padding,
  };
  if (onPress !== undefined) {
    return (
      <button type="button" onClick={onPress} className={classes} aria-label={ariaLabel} {...data}>
        {children}
      </button>
    );
  }
  const Element: ElementType = as ?? 'div';
  return (
    <Element className={classes} {...data}>
      {children}
    </Element>
  );
}

/**
 * Renders the card header.
 * @param props component props
 * @returns a header element
 */
export function CardHeader({
  children,
  className,
}: {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}): React.ReactElement {
  return <div className={cn('bsdc-card__header', className)}>{children}</div>;
}

/**
 * Renders the card title and optional description.
 * @param props component props
 * @returns a heading wrapper
 */
export function CardTitle({
  children,
  description,
  className,
}: {
  readonly children?: ReactNode | undefined;
  readonly description?: string | undefined;
  readonly className?: string | undefined;
}): React.ReactElement {
  return (
    <div className={cn('min-w-0', className)}>
      <h3 className="bsdc-card__title">{children}</h3>
      {description !== undefined && <p className="bsdc-card__description">{description}</p>}
    </div>
  );
}

/**
 * Renders the card body.
 * @param props component props
 * @returns a body element
 */
export function CardBody({
  children,
  className,
}: {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}): React.ReactElement {
  return <div className={cn('bsdc-card__body', className)}>{children}</div>;
}

/**
 * Renders the card footer.
 * @param props component props
 * @returns a footer element
 */
export function CardFooter({
  children,
  className,
}: {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}): React.ReactElement {
  return <div className={cn('bsdc-card__footer', className)}>{children}</div>;
}
