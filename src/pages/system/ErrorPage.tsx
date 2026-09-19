/**
 * BSDC — src/pages/system/ErrorPage.tsx
 * Purpose : Application error page rendered by the router error element (PART 24.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Shows a generic message with a reload action. Nothing about the failure is leaked into
 *           the UI beyond the support code (PART 05.04, PART 24.4).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorState } from '@/shared/ui/EmptyState';

/**
 * Renders the error page.
 * @returns the error page element
 */
export function ErrorPage(): ReactElement {
  const error = useRouteError();
  const { i18n } = useTranslation(['common']);
  const locale: 'bn' | 'en' = i18n.resolvedLanguage === 'en' ? 'en' : 'bn';
  return (
    <ErrorState
      error={error}
      locale={locale}
      action={
        <Button variant="primary" onClick={(): void => window.location.assign('/')}>
          {locale === 'bn' ? 'হোমে ফিরুন' : 'Back to home'}
        </Button>
      }
    />
  );
}
