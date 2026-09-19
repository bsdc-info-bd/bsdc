/**
 * BSDC — src/pages/system/MaintenancePage.tsx
 * Purpose : Shown during a scheduled maintenance window (PART 03.05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The page states the reason, the window and where to follow progress. It never pretends
 *           the platform is up.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Heading, Text } from '@/shared/ui/Typography';
import { CONTACT } from '@/core/config/app';

/**
 * Renders the maintenance page.
 * @returns the maintenance page element
 */
export function MaintenancePage(): ReactElement {
  const { i18n } = useTranslation(['common']);
  const bn = i18n.resolvedLanguage !== 'en';

  return (
    <>
      <EmptyState
        illustration="maintenance"
        title={bn ? 'রক্ষণাবেক্ষণ চলছে' : 'Under maintenance'}
        description={
          bn
            ? 'আমরা BSDC আপগ্রেড করছি। কাজ শেষ হলে প্ল্যাটফর্ম স্বয়ংক্রিয়ভাবে ফিরে আসবে।'
            : 'We are upgrading BSDC. The platform returns automatically when the work is done.'
        }
        lang={bn ? 'bn' : 'en'}
      />
      <div className="mt-8">
        <Heading level={2} size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
          {bn ? 'জরুরি প্রয়োজনে' : 'Urgent enquiries'}
        </Heading>
        <Text size="sm" tone="muted" className="mt-1" lang={bn ? 'bn' : 'en'}>
          <a className="underline underline-offset-4" href={`mailto:${CONTACT.general}`}>
            {CONTACT.general}
          </a>
        </Text>
      </div>
    </>
  );
}
