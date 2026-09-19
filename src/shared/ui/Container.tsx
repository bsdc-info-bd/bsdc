/**
 * BSDC — src/shared/ui/Container.tsx
 * Purpose : Layout primitives: page container, responsive container, stack and auto-grid
 *           (PART 08.04 R-05, R-06).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Grids always use auto-fit/minmax so no breakpoint list can fall out of sync, and the
 *           container caps content width while the shell stretches to 5120px.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { CONTENT_MAX_WIDTH } from '@/core/config/breakpoints';

/** Content width caps by surface. */
export type ContainerWidth = 'prose' | 'feed' | 'marketplace' | 'admin' | 'full';

/** Props for the Container component. */
export interface ContainerProps {
  readonly children?: ReactNode | undefined;
  readonly width?: ContainerWidth | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
}

/**
 * Renders a width-capped, centred container.
 * @param props component props
 * @returns a container element
 */
export function Container({
  children,
  width = 'full',
  className,
  style,
  id,
}: ContainerProps): React.ReactElement {
  const maxWidth =
    width === 'prose'
      ? CONTENT_MAX_WIDTH.prose
      : width === 'feed'
        ? `${CONTENT_MAX_WIDTH.feed}px`
        : width === 'marketplace'
          ? `${CONTENT_MAX_WIDTH.marketplace}px`
          : width === 'admin'
            ? `${CONTENT_MAX_WIDTH.admin}px`
            : undefined;

  return (
    <div
      id={id}
      className={cn('bsdc-container mx-auto w-full', className)}
      style={{ maxWidth, ...style }}
    >
      {children}
    </div>
  );
}

/** Props for the ResponsiveContainer component. */
export interface ResponsiveContainerProps extends ContainerProps {
  /** Minimum column width for the auto-fit grid. */
  readonly minColumn?: number | undefined;
}

/**
 * Renders a container that becomes a container-query context for its children.
 * @param props component props
 * @returns a container element with `container-type: inline-size`
 */
export function ResponsiveContainer({
  children,
  minColumn,
  className,
  id,
  width,
}: ResponsiveContainerProps): React.ReactElement {
  return (
    <Container
      id={id}
      {...(width !== undefined ? { width } : {})}
      className={cn('bsdc-container', className)}
      style={
        minColumn !== undefined
          ? { containerType: 'inline-size', ['--bsdc-min-column' as string]: `${minColumn}px` }
          : { containerType: 'inline-size' }
      }
    >
      {children}
    </Container>
  );
}

/** Props for the Stack component. */
export interface StackProps {
  readonly children?: ReactNode | undefined;
  /** Logical gap step from the spacing scale. */
  readonly gap?: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 8) | undefined;
  readonly direction?: ('column' | 'row') | undefined;
  readonly align?: ('start' | 'center' | 'end' | 'stretch') | undefined;
  readonly justify?: ('start' | 'center' | 'end' | 'between') | undefined;
  readonly wrap?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a flex stack.
 * @param props component props
 * @returns a flex container
 */
export function Stack({
  children,
  gap = 3,
  direction = 'column',
  align = 'stretch',
  justify = 'start',
  wrap = false,
  className,
}: StackProps): React.ReactElement {
  return (
    <div
      className={cn('flex', className)}
      style={{
        flexDirection: direction,
        gap: `var(--bsdc-space-${gap})`,
        alignItems:
          align === 'start'
            ? 'flex-start'
            : align === 'end'
              ? 'flex-end'
              : align === 'center'
                ? 'center'
                : 'stretch',
        justifyContent:
          justify === 'between'
            ? 'space-between'
            : justify === 'center'
              ? 'center'
              : justify === 'end'
                ? 'flex-end'
                : 'flex-start',
        flexWrap: wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </div>
  );
}

/** Props for the Grid component. */
export interface GridProps {
  readonly children?: ReactNode | undefined;
  /** Minimum column width in pixels. */
  readonly min?: number | undefined;
  readonly gap?: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 8) | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders an auto-fit grid that adapts to its own width (PART 08.04 R-05).
 * @param props component props
 * @returns a grid container
 */
export function Grid({ children, min = 240, gap = 4, className }: GridProps): React.ReactElement {
  return (
    <div
      className={cn('bsdc-grid-auto grid', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
        gap: `var(--bsdc-space-${gap})`,
      }}
    >
      {children}
    </div>
  );
}
