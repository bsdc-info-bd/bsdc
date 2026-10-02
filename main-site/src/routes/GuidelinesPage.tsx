import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Card, Prose, SectionHeading } from '@/design-system';
import { ROUTES, SITE } from '@/lib/site';

const RULE_KEYS = ['respect', 'authentic', 'useful', 'legal', 'safety'] as const;

export default function GuidelinesPage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('guidelines.metaTitle')}
        description={t('guidelines.metaDescription')}
        path={ROUTES.guidelines}
        jsonLd={[
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('nav.home'), item: SITE.url },
              {
                '@type': 'ListItem',
                position: 2,
                name: t('guidelines.heading'),
                item: `${SITE.url}${ROUTES.guidelines}`,
              },
            ],
          },
        ]}
      />

      <article className="fab-container py-6 sm:py-10">
        <h1 className="text-3xl">{t('guidelines.heading')}</h1>
        <Prose className="mt-3">
          <p>{t('guidelines.intro')}</p>
        </Prose>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {RULE_KEYS.map((key, index) => (
            <Card as="li" key={key}>
              <h2 className="text-lg">
                <span className="me-2 text-green-700 tabular-nums">{index + 1}.</span>
                {t(`guidelines.rules.${key}.title`)}
              </h2>
              <p className="mt-1 text-sm text-muted">{t(`guidelines.rules.${key}.body`)}</p>
            </Card>
          ))}
        </ol>

        <section className="mt-8">
          <SectionHeading title={t('guidelines.enforcementTitle')} level={2} />
          <Prose>
            <p>{t('guidelines.enforcementBody')}</p>
          </Prose>
        </section>

        <section className="mt-8">
          <SectionHeading title={t('guidelines.appealTitle')} level={2} />
          <Prose>
            <p>{t('guidelines.appealBody')}</p>
          </Prose>
        </section>
      </article>
    </>
  );
}
