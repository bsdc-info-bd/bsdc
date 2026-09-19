/**
 * BSDC — src/pages/about/AboutPage.tsx
 * Purpose : Who BSDC is, who owns it and what transparency commitments bind it (PART 31.4).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Ownership is stated plainly: BSDC is a platform of RRC Development, owned and led by
 *           Rizwan Rahim Chowdhury. This page is indexable and is the source of truth for press.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Separator } from '@/shared/ui/Separator';
import { Heading, Text } from '@/shared/ui/Typography';
import { CONTACT, OWNERSHIP } from '@/core/config/app';

/** Transparency commitment keys. */
const COMMITMENTS = ['roadmap', 'moderation', 'data', 'money'] as const;

/**
 * Renders the about page.
 * @returns the about page element
 */
export function AboutPage(): ReactElement {
  const { t, i18n } = useTranslation(['about', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';

  return (
    <article className="min-w-0">
      <Heading level={1} size="3xl" lang={bn ? 'bn' : 'en'}>
        {t('title', { ns: 'about' })}
      </Heading>

      <section className="mt-8" aria-labelledby="intro">
        <Heading level={2} id="intro" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('introTitle', { ns: 'about' })}
        </Heading>
        <Text tone="muted" lang={bn ? 'bn' : 'en'} className="bsdc-prose mt-3">
          {t('introBody', { ns: 'about' })}
        </Text>
      </section>

      <Separator className="my-8" />

      <section aria-labelledby="ownership">
        <Heading level={2} id="ownership" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('ownershipTitle', { ns: 'about' })}
        </Heading>
        <Text tone="muted" lang={bn ? 'bn' : 'en'} className="mt-3 max-w-[70ch]">
          {t('ownershipBody', { ns: 'about' })}
        </Text>
        <dl className="mt-4 grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
          <dt className="text-sm font-semibold text-ink-2" lang={bn ? 'bn' : 'en'}>
            {t('ownerLabel', { ns: 'about' })}
          </dt>
          <dd className="text-sm text-ink" lang={bn ? 'bn' : 'en'}>
            {OWNERSHIP.owner}
          </dd>
          <dt className="text-sm font-semibold text-ink-2" lang={bn ? 'bn' : 'en'}>
            Organisation
          </dt>
          <dd className="text-sm text-ink">{OWNERSHIP.organisation}</dd>
          <dt className="text-sm font-semibold text-ink-2" lang={bn ? 'bn' : 'en'}>
            Legal
          </dt>
          <dd className="text-sm text-ink">{OWNERSHIP.legalLine}</dd>
        </dl>
      </section>

      <Separator className="my-8" />

      <section aria-labelledby="transparency">
        <Heading level={2} id="transparency" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('transparencyTitle', { ns: 'about' })}
        </Heading>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {COMMITMENTS.map((key) => (
            <Card key={key} variant="outlined" padding="md">
              <CardHeader>
                <CardTitle>{t(`transparency.${key}.title`, { ns: 'about' })}</CardTitle>
              </CardHeader>
              <CardBody>
                <Text size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
                  {t(`transparency.${key}.body`, { ns: 'about' })}
                </Text>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <Separator className="my-8" />

      <section aria-labelledby="contact">
        <Heading level={2} id="contact" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('contactTitle', { ns: 'about' })}
        </Heading>
        <Text tone="muted" lang={bn ? 'bn' : 'en'} className="mt-3 max-w-[70ch]">
          {t('contactBody', { ns: 'about' })}
        </Text>
        <ul className="mt-3 grid gap-1 text-sm">
          <li>
            <a
              className="text-[var(--bsdc-green-600)] underline underline-offset-4"
              href={`mailto:${CONTACT.general}`}
            >
              {CONTACT.general}
            </a>
          </li>
          <li>
            <a
              className="text-[var(--bsdc-green-600)] underline underline-offset-4"
              href={`mailto:${CONTACT.operations}`}
            >
              {CONTACT.operations}
            </a>
          </li>
        </ul>
      </section>

      <Separator className="my-8" />

      <section aria-labelledby="legal">
        <Heading level={2} id="legal" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('legalTitle', { ns: 'about' })}
        </Heading>
        <Text tone="muted" lang={bn ? 'bn' : 'en'} className="bsdc-prose mt-3">
          {t('legalBody', { ns: 'about' })}
        </Text>
      </section>
    </article>
  );
}
