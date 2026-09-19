/**
 * BSDC — src/pages/system/NotFoundPage.tsx
 * Purpose : 404 page with real recovery paths (PART 07.01, PART 09.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A 404 offers the three destinations that actually help, plus a search entry. It never
 *           blames the member for the broken link.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Heading, Text } from '@/shared/ui/Typography';
import { FOOTER_LINKS } from '@/core/config/navigation';

/**
 * Renders the not-found page.
 * @returns the 404 page element
 */
export function NotFoundPage(): ReactElement {
  const { t, i18n } = useTranslation(['nav', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';

  return (
    <>
      <EmptyState
        illustration="not-found"
        title={bn ? 'পাতাটি পাওয়া যায়নি' : 'Page not found'}
        description={
          bn
            ? 'আপনি যে পাতাটি খুঁজছেন তা নেই, সরানো হয়েছে অথবা ঠিকানা ভুল।'
            : 'The page you are looking for does not exist, was moved, or the address is wrong.'
        }
        lang={bn ? 'bn' : 'en'}
        action={
          <Button to="/" variant="primary">
            {t('home', { ns: 'nav' })}
          </Button>
        }
        secondaryAction={
          <Button to="/network" variant="secondary">
            {t('network', { ns: 'nav' })}
          </Button>
        }
      />
      <div className="mt-8">
        <Heading level={2} size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
          {bn ? 'সাহায্যকারী পাতাসমূহ' : 'Helpful pages'}
        </Heading>
        <ul className="mt-2 grid gap-1 text-sm">
          {FOOTER_LINKS.map((link) => (
            <li key={link.to}>
              <a
                className="text-[var(--bsdc-green-600)] underline underline-offset-4"
                href={link.to}
              >
                {t(link.labelKey, { ns: 'nav' })}
              </a>
            </li>
          ))}
        </ul>
        <Text tone="subtle" size="xs" className="mt-4" lang={bn ? 'bn' : 'en'}>
          {bn
            ? 'ভুল ঠিকানা মনে হলে আমাদের জানান, আমরা ঠিক করে দেব।'
            : 'If you believe this link should work, tell us and we will fix it.'}
        </Text>
      </div>
    </>
  );
}
