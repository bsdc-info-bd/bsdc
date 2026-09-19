/**
 * BSDC — src/widgets/mobile-nav/BottomNavWidget.tsx
 * Purpose : Shell-level bottom navigation with live route filtering and unread counts
 *           (PART 08.04 R-04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Only live routes are rendered, so no tab can ever lead to an unbuilt screen. Counts
 *           are placeholders-free: they are zero until the notification module supplies them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { BottomNav } from '@/shared/ui/BottomNav';
import { bottomNavItems } from '@/core/config/navigation';
import { liveRoutes } from '@/core/config/routes';

/** Props for the widget. */
export interface BottomNavWidgetProps {
  /** Unread counts keyed by destination id (messages, notifications). */
  readonly counts?: Readonly<Record<string, number>> | undefined;
}

/**
 * Renders the bottom navigation for the app shell.
 * @param props component props
 * @returns a bottom nav element or an empty fragment
 */
export function BottomNavWidget({ counts }: BottomNavWidgetProps): React.ReactElement | null {
  const { t } = useTranslation(['nav']);
  const livePaths = new Set(liveRoutes().map((route) => route.path));
  const items = bottomNavItems().filter((item) => livePaths.has(item.to));
  if (items.length === 0) return null;

  const labels: Record<string, string> = {};
  for (const item of items) labels[item.id] = t(item.labelKey, { ns: 'nav' });

  return <BottomNav items={items} labels={labels} counts={counts} />;
}
