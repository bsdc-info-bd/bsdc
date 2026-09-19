/**
 * BSDC — src/app/boundaries/OfflineBoundary.tsx
 * Purpose : Offline-capable boundary for data surfaces (PART 16.1, PART 26).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : While offline the cached snapshot is shown with an honest "offline" note; if nothing
 *           is cached, the offline empty state explains exactly what will happen next.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { useOfflineStatus } from '../providers/OfflineProvider';
import { EmptyState } from '@/shared/ui/EmptyState';

/** Props for the boundary. */
export interface OfflineBoundaryProps {
  readonly children: ReactNode;
  /** True when a cached snapshot exists for this surface. */
  readonly hasCache?: boolean | undefined;
  readonly locale?: ('bn' | 'en') | undefined;
}

/**
 * Renders children when online, or an honest offline state when not.
 * @param props component props
 * @returns children or an offline state
 */
export function OfflineBoundary({
  children,
  hasCache = false,
  locale = 'bn',
}: OfflineBoundaryProps): ReactNode {
  const { online } = useOfflineStatus();
  if (online || hasCache) return children;
  return (
    <EmptyState
      illustration="offline"
      title={locale === 'bn' ? 'আপনি অফলাইনে আছেন' : 'You are offline'}
      description={
        locale === 'bn'
          ? 'এই স্ক্রিনের জন্য কোনো সংরক্ষিত তথ্য পাওয়া যায়নি। সংযোগ ফিরে এলে বিষয়বস্তু স্বয়ংক্রিয়ভাবে লোড হবে।'
          : 'Nothing is cached for this screen yet. Content loads automatically when the connection returns.'
      }
    />
  );
}
