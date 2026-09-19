/**
 * BSDC — src/features/pwa/OfflineBoundary.tsx
 * Purpose : The honest offline state for a data surface that has nothing cached.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : "Offline with no cache" and "nobody has listed anything yet" look identical if a screen
 *   is careless, and they are completely different facts: one is about the network and will fix
 *   itself, the other is about the community and will not. This boundary tells them apart.
 *   It lives in the feature layer rather than in app because a page must be able to use it without
 *   importing upwards (ADR-003), and it reads connectivity from shared hooks rather than from the
 *   app-level provider for the same reason.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/shared/ui';
import { useOnline } from '@/shared/hooks';
import type { Locale } from '@/core/config/app';

/** Props for the boundary. */
export interface OfflineBoundaryProps {
  readonly children: ReactNode;
  /** True when a cached snapshot exists for this surface, which makes offline irrelevant. */
  readonly hasCache?: boolean | undefined;
  readonly locale?: Locale | undefined;
}

/**
 * Renders children when online or cached, and an honest offline state when neither.
 * @param props children, whether a cache exists, and the interface language
 * @returns children, or the offline empty state
 */
export function OfflineBoundary({ children, hasCache = false }: OfflineBoundaryProps): ReactNode {
  // EmptyState takes its language from i18next, which is the language the whole screen is in.
  const { t } = useTranslation('pwa');
  const online = useOnline();
  if (online || hasCache) return children;

  return (
    <EmptyState
      illustration="offline"
      title={t('offline.emptyTitle')}
      description={t('offline.emptyBody')}
    />
  );
}
