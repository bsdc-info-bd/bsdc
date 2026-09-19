/**
 * BSDC — src/shared/ui/BottomNav.tsx
 * Purpose : Bottom tab navigation for viewports at or below 768px (PART 08.04 R-04, PART 08.05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The active item is marked with aria-current="page", which is what makes the bar usable
 *           with a screen reader rather than decorative. Badges render counts, never dots alone.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { NavLink } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';
import type { NavItem } from '@/core/config/navigation';

/** Props for the BottomNav component. */
export interface BottomNavProps {
  readonly items: readonly NavItem[];
  readonly labels: Readonly<Record<string, string>>;
  /** Unread counts keyed by nav item id. */
  readonly counts?: Readonly<Record<string, number>> | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders the bottom navigation bar.
 * @param props component props
 * @returns a navigation element
 */
export function BottomNav({
  items,
  labels,
  counts,
  className,
}: BottomNavProps): React.ReactElement {
  return (
    <nav className={cn('bsdc-bottom-nav', className)} aria-label="Primary">
      {items.map((item) => {
        const count = counts?.[item.id] ?? 0;
        return (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.to === '/'}
            className="bsdc-bottom-nav__item"
          >
            <span className="relative inline-flex">
              <Icon name={item.icon} size={22} />
              {count > 0 && (
                <span className="bsdc-bottom-nav__badge">
                  <span
                    className="bsdc-badge"
                    data-tone="danger"
                    data-variant="count"
                    aria-label={`${count} unread`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                </span>
              )}
            </span>
            <span className="bsdc-bottom-nav__label">{labels[item.id] ?? item.id}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
