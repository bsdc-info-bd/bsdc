import {
  BadgeCheck,
  Briefcase,
  Globe2,
  Megaphone,
  MessagesSquare,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Card, Countdown, ExternalLink, LinkButton, SectionHeading } from '@/design-system';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { launchConfig } from '@/lib/launch';
import { ECOSYSTEM_LINKS, PILLARS, ROUTES, SITE, type Pillar } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const PILLAR_ICONS: Record<Pillar, ReactNode> = {
  community: <MessagesSquare size={22} />,
  knowledge: <Sparkles size={22} />,
  opportunity: <Briefcase size={22} />,
  commerce: <ShoppingBag size={22} />,
  advertising: <Megaphone size={22} />,
  trust: <BadgeCheck size={22} />,
  reach: <Globe2 size={22} />,
};

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'bn' ? 'bn' : 'en';
  const isSignedIn = useAuthStore(selectIsSignedIn);

  if (isSignedIn) {
    return (
      <>
        <Seo title={t('feed.heading')} description={t('feed.description')} path="/" noindex />
        <section className="fab-container py-6">
          <SectionHeading title={t('feed.heading')} description={t('feed.description')} />
          <div className="mt-4">
            <FeedTabs />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo
        title={t('home.metaTitle')}
        description={t('home.metaDescription')}
        path="/"
        jsonLd={[
          {
            '@type': 'WebApplication',
            name: SITE.name,
            applicationCategory: 'SocialNetworkingApplication',
            operatingSystem: 'Web, Android',
            url: SITE.url,
            inLanguage: ['bn-BD', 'en-US'],
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'BDT' },
          },
        ]}
      />

      <section className="fab-container py-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
          {t('home.eyebrow')}
        </p>
        <h1 className="mt-2 text-4xl">{t('home.heading')}</h1>
        <p className="mt-3 max-w-[60ch] text-base text-muted">{t('home.subheading')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton to={ROUTES.about}>{t('common.learnMore')}</LinkButton>
          <LinkButton to={ROUTES.guidelines} variant="outline">
            {t('nav.guidelines')}
          </LinkButton>
        </div>
      </section>

      <section className="fab-container pb-8" aria-labelledby="public-feed">
        <SectionHeading title={t('home.feedTitle')} description={t('home.feedBody')} />
        <h2 id="public-feed" className="fab-sr-only">
          {t('home.feedTitle')}
        </h2>
        <div className="mt-4">
          <FeedTabs signedIn={false} />
        </div>
        <div className="mt-4">
          <LinkButton to={ROUTES.signup}>{t('home.feedJoin')}</LinkButton>
        </div>
      </section>

      {launchConfig.launched ? null : (
        <section className="fab-container pb-8" aria-labelledby="launch-countdown">
          <Card>
            <h2 id="launch-countdown" className="text-xl">
              {t('home.countdownTitle')}
            </h2>
            <Countdown target={launchConfig.launchDate} className="mt-3" />
            <p className="mt-3 text-sm text-muted">{t('home.countdownNote')}</p>
          </Card>
        </section>
      )}

      <section className="fab-container pb-8" aria-labelledby="pillars">
        <SectionHeading title={t('home.pillarsTitle')} />
        <h2 id="pillars" className="fab-sr-only">
          {t('home.pillarsTitle')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {PILLARS.map((pillar) => (
            <Card as="li" key={pillar} interactive>
              <div className="flex items-center gap-2 text-green-700">
                <span aria-hidden="true">{PILLAR_ICONS[pillar]}</span>
                <h3 className="text-lg">{t(`home.pillars.${pillar}.title`)}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{t(`home.pillars.${pillar}.body`)}</p>
            </Card>
          ))}
        </ul>
      </section>

      <section className="fab-container pb-10" aria-labelledby="ecosystem">
        <SectionHeading title={t('home.ecosystemTitle')} description={t('home.ecosystemBody')} />
        <h2 id="ecosystem" className="fab-sr-only">
          {t('home.ecosystemTitle')}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ECOSYSTEM_LINKS.map((link) => (
            <Card as="li" key={link.href} padded={false} className="p-3">
              <ExternalLink href={link.href}>{t(link.labelKey)}</ExternalLink>
              <p className="mt-1 text-xs text-muted" lang={language}>
                {link.href.replace('https://', '')}
              </p>
            </Card>
          ))}
        </ul>
      </section>
    </>
  );
}
