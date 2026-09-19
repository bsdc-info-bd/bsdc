/**
 * BSDC — src/shared/ui/RailNav.tsx
 * Purpose : Left rail navigation between 1024px and 1679px (PART 08.04 R-04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The rail contains the primary destinations plus the network hub card slot; it is a
 *           complementary landmark on desktop and is not rendered at all below 1024px.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';
import type { NavItem } from '@/core/config/navigation';

/** Props for the RailNav component. */
export interface RailNavProps {
  readonly items: readonly NavItem[];
  readonly labels: Readonly<Record<string, string>>;
  readonly counts?: Readonly<Record<string, number>> | undefined;
  /** Extra content rendered at the bottom of the rail (network hub, shortcuts). */
  readonly footer?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders the rail navigation.
 * @param props component props
 * @returns a navigation element
 */
export function RailNav({
  items,
  labels,
  counts,
  footer,
  className,
}: RailNavProps): React.ReactElement {
  return (
    <nav className={cn('bsdc-rail-nav', className)} aria-label="Primary">
      {items.map((item) => {
        const count = counts?.[item.id] ?? 0;
        return (
          <NavLink key={item.id} to={item.to} end={item.to === '/'} className="bsdc-rail-nav__item">
            <Icon name={item.icon} size={20} />
            <span className="min-w-0 flex-1 truncate">{labels[item.id] ?? item.id}</span>
            {count > 0 && (
              <span className="bsdc-badge" data-tone="danger" data-variant="count">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </NavLink>
        );
      })}
      {footer !== undefined && <div className="mt-auto pt-4">{footer}</div>}
    </nav>
  );
}
