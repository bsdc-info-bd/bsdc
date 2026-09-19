/**
 * BSDC — src/pages/home/HomePage.tsx
 * Purpose : The BSDC landing surface: what the platform is, what it does and when it launches.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every string on this page is bilingual and comes from the `home` namespace. No demo
 *           statistics are shown: a number appears only once the platform can count it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Container, Grid } from '@/shared/ui/Container';
import { Separator } from '@/shared/ui/Separator';
import { Heading, Text } from '@/shared/ui/Typography';
import { LaunchCountdown } from '@/widgets/countdown/LaunchCountdown';
import { NetworkHub } from '@/widgets/footer/NetworkHub';
import { CONTACT, OWNERSHIP } from '@/core/config/app';

/** Ids of the principle cards, kept in one place so copy and layout cannot drift. */
const PRINCIPLES = ['communityFirst', 'transparent', 'local', 'merit'] as const;

/** Ids of the feature cards. */
const FEATURES = ['feed', 'groups', 'marketplace', 'jobs', 'events', 'messaging'] as const;

/**
 * Renders the home page.
 * @returns the home page element
 */
export function HomePage(): ReactElement {
  const { t, i18n } = useTranslation(['home', 'common']);
  const bn = i18n.resolvedLanguage !== 'en';

  return (
    <Container className="py-6 md:py-10">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Heading level={1} size="hero" lang={bn ? 'bn' : 'en'} className="bsdc-balance">
            {t('heroTitle', { ns: 'home' })}
          </Heading>
          <Text size="md" tone="muted" lang={bn ? 'bn' : 'en'} className="mt-4 max-w-[56ch]">
            {t('heroSubtitle', { ns: 'home' })}
          </Text>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button to="/about" size="lg" iconRight="arrowRight">
              {t('heroSecondary', { ns: 'home' })}
            </Button>
            <Button href={`mailto:${CONTACT.general}`} variant="secondary" size="lg">
              {t('ctaSecondary', { ns: 'home' })}
            </Button>
          </div>
          <p className="mt-4 text-xs text-ink-3" lang={bn ? 'bn' : 'en'}>
            {OWNERSHIP.legalLine}
          </p>
        </div>
        <div className="min-w-0">
          <LaunchCountdown />
        </div>
      </section>

      <Separator className="my-10" />

      <section aria-labelledby="what-is">
        <Heading level={2} id="what-is" lang={bn ? 'bn' : 'en'}>
          {t('whatIsTitle', { ns: 'home' })}
        </Heading>
        <Text tone="muted" lang={bn ? 'bn' : 'en'} className="mt-3 max-w-[70ch]">
          {t('whatIsBody', { ns: 'home' })}
        </Text>
      </section>

      <section className="mt-10" aria-labelledby="principles">
        <Heading level={2} id="principles" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('principlesTitle', { ns: 'home' })}
        </Heading>
        <Grid min={240} className="mt-4">
          {PRINCIPLES.map((key) => (
            <Card key={key} variant="outlined" padding="md">
              <CardHeader>
                <CardTitle>{t(`principles.${key}.title`, { ns: 'home' })}</CardTitle>
              </CardHeader>
              <CardBody>
                <Text size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
                  {t(`principles.${key}.body`, { ns: 'home' })}
                </Text>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </section>

      <section className="mt-10" aria-labelledby="features">
        <Heading level={2} id="features" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('featuresTitle', { ns: 'home' })}
        </Heading>
        <Grid min={260} className="mt-4">
          {FEATURES.map((key) => (
            <Card key={key} variant="default" padding="md">
              <CardHeader>
                <CardTitle>{t(`features.${key}.title`, { ns: 'home' })}</CardTitle>
              </CardHeader>
              <CardBody>
                <Text size="sm" tone="muted" lang={bn ? 'bn' : 'en'}>
                  {t(`features.${key}.body`, { ns: 'home' })}
                </Text>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </section>

      <section className="mt-10" aria-labelledby="network">
        <Heading level={2} id="network" size="xl" lang={bn ? 'bn' : 'en'}>
          {t('networkTitle', { ns: 'home' })}
        </Heading>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Text tone="muted" lang={bn ? 'bn' : 'en'} className="max-w-[70ch]">
            {t('networkBody', { ns: 'home' })}
          </Text>
          <NetworkHub />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="cta">
        <Card variant="brand" padding="lg">
          <Heading level={2} id="cta" size="lg" lang={bn ? 'bn' : 'en'}>
            {t('ctaTitle', { ns: 'home' })}
          </Heading>
          <Text lang={bn ? 'bn' : 'en'} className="mt-2 max-w-[60ch] opacity-90">
            {t('ctaBody', { ns: 'home' })}
          </Text>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button to="/network" variant="inverse">
              {t('ctaPrimary', { ns: 'home' })}
            </Button>
            <Button href={`mailto:${CONTACT.general}`} variant="outline">
              {t('ctaSecondary', { ns: 'home' })}
            </Button>
          </div>
        </Card>
      </section>
    </Container>
  );
}
