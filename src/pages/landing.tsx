import { ArrowRight, Code2, Mail, MessagesSquare, Send, Users } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { BsdcLogo } from '@/components/brand/bsdc-logo';
import { Button } from '@/components/ui/button';
import { useDocumentMeta } from '@/hooks/use-document-meta';
import { localized, PHASES, type PhaseInfo } from '@/lib/roadmap';
import { cn } from '@/lib/utils';

const PILLARS = [
  { icon: Users, titleKey: 'landing.pillars.connectTitle', bodyKey: 'landing.pillars.connectBody' },
  { icon: Code2, titleKey: 'landing.pillars.publishTitle', bodyKey: 'landing.pillars.publishBody' },
  {
    icon: MessagesSquare,
    titleKey: 'landing.pillars.discussTitle',
    bodyKey: 'landing.pillars.discussBody',
  },
  { icon: Send, titleKey: 'landing.pillars.messageTitle', bodyKey: 'landing.pillars.messageBody' },
] as const;

function PhaseCard({ phase, language }: { phase: PhaseInfo; language: string | undefined }) {
  const { t } = useTranslation();
  const shipped = phase.status === 'shipped';
  return (
    <li
      className={cn(
        'flex h-full flex-col rounded-xl border bg-card p-4',
        shipped ? 'border-primary-600/40' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {t('landing.phase')} {phase.id}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            shipped
              ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {shipped ? t('landing.phaseStatusShipped') : t('landing.phaseStatusPlanned')}
        </span>
      </div>
      <h3 className="mt-2.5 text-base font-semibold">{localized(phase.name, language)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{localized(phase.summary, language)}</p>
      {shipped && (
        <p className="mt-2 text-xs font-medium text-primary-700 dark:text-primary-400">
          {t('landing.phaseShippedNote')}
        </p>
      )}
    </li>
  );
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const location = useLocation();

  useDocumentMeta({
    title: t('landing.docTitle'),
    description: t('landing.subtitle'),
  });

  // In-page anchors arrive via /#about etc. from other routes.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView();
  }, [location.hash]);

  return (
    <>
      {/* Hero — content capped and centered so ≥1920px viewports don't over-stretch (§14.2). */}
      <section className="mx-auto w-full max-w-content px-4 pb-14 pt-12 text-center tablet:pt-20">
        <p className="mx-auto inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {t('landing.badge')}
        </p>
        <div className="mx-auto mt-5 flex items-center justify-center gap-3">
          <BsdcLogo className="h-12 w-12 tablet:h-14 tablet:w-14" />
        </div>
        <h1 className="mx-auto mt-5 max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight md:text-5xl md:leading-tight">
          {t('landing.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground tablet:text-lg">
          {t('landing.subtitle')}
        </p>
        <div className="mt-7">
          <Button asChild size="lg">
            <a href="#roadmap">
              {t('landing.cta')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </section>

      {/* Pillars */}
      <section id="about" className="mx-auto w-full max-w-content scroll-mt-16 px-4 py-12">
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t('landing.aboutTitle')}</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('landing.aboutBody')}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 laptop:grid-cols-4">
          {PILLARS.map(({ icon: Icon, titleKey, bodyKey }) => (
            <li key={titleKey} className="rounded-xl border border-border bg-card p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-base font-semibold">{t(titleKey)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(bodyKey)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Roadmap — real statuses only, no faked features */}
      <section id="roadmap" className="border-y border-border bg-muted/30">
        <div className="mx-auto w-full max-w-content scroll-mt-16 px-4 py-12">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            {t('landing.roadmapTitle')}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('landing.roadmapBody')}</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 laptop:grid-cols-3">
            {PHASES.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} language={language} />
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto w-full max-w-content scroll-mt-16 px-4 py-12">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-2xl font-bold tracking-tight">{t('landing.contactTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('landing.contactBody')}</p>
          <ul className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <li>
              <Button asChild variant="secondary">
                <a href="mailto:hello@bsdc.info.bd">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  hello@bsdc.info.bd
                </a>
              </Button>
            </li>
            <li>
              <Button asChild variant="secondary">
                <a href="mailto:bsdc.rrc@gmail.com">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  bsdc.rrc@gmail.com
                </a>
              </Button>
            </li>
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            {t('landing.founderLabel')}:{' '}
            <span className="font-medium text-foreground">{t('brand.founderName')}</span>
            {' · '}
            {t('brand.parent')}
          </p>
        </div>
      </section>
    </>
  );
}
