/**
 * BSDC — src/core/config/navigation.ts
 * Purpose : The navigation model: which destinations appear in the bottom nav, the rail and the
 *           three-column shell, and which are reserved for later modules (PART 08.04 R-04).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Data only — icons are resolved by src/shared/ui/iconRegistry.ts so this module stays
 *           free of any UI dependency (ADR-003 import direction).
 *           Every destination carries the feature flag that gates it: a route whose flag is off is
 *           removed from navigation and guarded in the router (LAW-11).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { FLAG_KEYS } from './features';

/** Icon identifiers resolved by the icon registry. */
export type IconName =
  | 'home'
  | 'compass'
  | 'users'
  | 'bell'
  | 'message'
  | 'bookmark'
  | 'search'
  | 'settings'
  | 'store'
  | 'briefcase'
  | 'calendar';

/** A navigation destination. */
export interface NavItem {
  readonly id: string;
  /** Route path. */
  readonly to: string;
  /** Translation key under the `nav` namespace. */
  readonly labelKey: string;
  readonly icon: IconName;
  /** Feature flag that must be on for the item to render. */
  readonly flag: string;
  /** Shown in the bottom navigation (<= 768px). */
  readonly bottom: boolean;
  /** Shown in the left rail (>= 1024px). */
  readonly rail: boolean;
  /** Requires an authenticated session. */
  readonly requiresAuth: boolean;
  /** Rendered as a badge counter when present. */
  readonly badge?: ('messages' | 'notifications') | undefined;
}

/** Primary navigation destinations. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    to: '/',
    labelKey: 'home',
    icon: 'home',
    flag: FLAG_KEYS.shell,
    bottom: true,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'feed',
    to: '/feed',
    labelKey: 'feed',
    icon: 'compass',
    flag: FLAG_KEYS.feed,
    bottom: false,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'search',
    to: '/search',
    labelKey: 'search',
    icon: 'search',
    flag: FLAG_KEYS.search,
    bottom: false,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'groups',
    to: '/groups',
    labelKey: 'groups',
    icon: 'users',
    flag: FLAG_KEYS.groups,
    bottom: true,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'messages',
    to: '/messages',
    labelKey: 'messages',
    icon: 'message',
    flag: FLAG_KEYS.messenger,
    bottom: true,
    rail: true,
    requiresAuth: true,
    badge: 'messages',
  },
  {
    id: 'notifications',
    to: '/notifications',
    labelKey: 'notifications',
    icon: 'bell',
    flag: FLAG_KEYS.notifications,
    bottom: true,
    rail: true,
    requiresAuth: true,
    badge: 'notifications',
  },
  {
    id: 'saved',
    to: '/saved',
    labelKey: 'saved',
    icon: 'bookmark',
    flag: FLAG_KEYS.feed,
    bottom: false,
    rail: true,
    requiresAuth: true,
  },
  {
    id: 'market',
    to: '/market',
    labelKey: 'marketplace',
    icon: 'store',
    flag: FLAG_KEYS.marketplace,
    bottom: true,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'jobs',
    to: '/jobs',
    labelKey: 'jobs',
    icon: 'briefcase',
    flag: FLAG_KEYS.jobs,
    bottom: false,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'events',
    to: '/events',
    labelKey: 'events',
    icon: 'calendar',
    flag: FLAG_KEYS.events,
    bottom: false,
    rail: true,
    requiresAuth: false,
  },
  {
    id: 'settings',
    to: '/settings',
    labelKey: 'settings',
    icon: 'settings',
    flag: FLAG_KEYS.shell,
    bottom: false,
    rail: true,
    requiresAuth: true,
  },
];

/** Secondary destinations rendered in the footer, always crawlable anchors. */
export const FOOTER_LINKS: readonly { readonly to: string; readonly labelKey: string }[] = [
  { to: '/about', labelKey: 'about' },
  { to: '/network', labelKey: 'network' },
  { to: '/design-system', labelKey: 'designSystem' },
];

/**
 * Items for the bottom navigation.
 * @returns destinations flagged for the bottom bar
 */
export function bottomNavItems(): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.bottom);
}

/**
 * Items for the rail navigation.
 * @returns destinations flagged for the rail
 */
export function railNavItems(): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.rail);
}
