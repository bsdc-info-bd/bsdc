/**
 * BSDC — src/shared/ui/StickyHeader.tsx
 * Purpose : Header that condenses on scroll and never eats more than 15% of the viewport
 *           (PART 08.04 R-18).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Condensing is driven by a scroll threshold with rAF throttling; the header height is a
 *           CSS variable so the rest of the shell reflows without a layout jump.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Props for the StickyHeader component. */
export interface StickyHeaderProps {
  readonly children?: ReactNode | undefined;
  /** Scroll distance in pixels after which the header condenses. */
  readonly condenseAfter?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a sticky, condensing header.
 * @param props component props
 * @returns a header element
 */
export function StickyHeader({
  children,
  condenseAfter = 24,
  className,
}: StickyHeaderProps): React.ReactElement {
  const [condensed, setCondensed] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    const onScroll = (): void => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setCondensed(window.scrollY > condenseAfter);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('scroll', onScroll);
    };
  }, [condenseAfter]);

  return (
    <header
      className={cn('bsdc-top-bar', className)}
      data-condensed={condensed ? 'true' : 'false'}
      style={{ ['--bsdc-header-height' as string]: condensed ? '48px' : '56px' }}
    >
      {children}
    </header>
  );
}
