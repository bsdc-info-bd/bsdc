/**
 * BSDC — src/pages/system/OfflinePage.tsx
 * Purpose : Offline fallback route served by the service worker (PART 16.1, PART 26).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The page is cached with the app shell, so it loads with zero network and explains
 *           plainly what will happen when the connection returns.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useOnline } from '@/shared/hooks';

/**
 * Renders the offline page.
 * @returns the offline page element
 */
export function OfflinePage(): ReactElement {
  const { i18n } = useTranslation(['common']);
  const online = useOnline();
  const bn = i18n.resolvedLanguage !== 'en';

  return (
    <EmptyState
      illustration={online ? 'welcome' : 'offline'}
      title={
        bn
          ? online
            ? 'সংযোগ ফিরে এসেছে'
            : 'আপনি অফলাইনে আছেন'
          : online
            ? 'You are back online'
            : 'You are offline'
      }
      description={
        bn
          ? online
            ? 'সংযোগ ফিরে এসেছে। যেখান থেকে এসেছিলেন সেখানেই ফিরে যান।'
            : 'এই পাতাটি অফলাইনে দেখানোর জন্য সংরক্ষিত। সংযোগ ফিরলে বিষয়বস্তু স্বয়ংক্রিয়ভাবে লোড হবে।'
          : online
            ? 'Your connection is back. Continue where you left off.'
            : 'This page is saved for offline viewing. Content loads automatically when you reconnect.'
      }
      lang={bn ? 'bn' : 'en'}
      action={
        online ? (
          <Button to="/" variant="primary">
            {bn ? 'হোমে যান' : 'Go to home'}
          </Button>
        ) : (
          <Button variant="secondary" onClick={(): void => window.location.reload()}>
            {bn ? 'রিলোড করুন' : 'Reload'}
          </Button>
        )
      }
    />
  );
}
