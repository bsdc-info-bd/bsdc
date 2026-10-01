import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Card, LinkButton, Prose, SectionHeading } from '@/design-system';
import { ROUTES, SITE } from '@/lib/site';

const PRINCIPLE_KEYS = ['free', 'bilingual', 'accessible', 'honest'] as const;

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('about.metaTitle')}
        description={t('about.metaDescription')}
        path={ROUTES.about}
        jsonLd={[
          {
            '@type': 'AboutPage',
            name: t('about.heading'),
            description: t('about.metaDescription'),
            url: `${SITE.url}${ROUTES.about}`,
          },
          {
            '@type': 'Person',
            name: SITE.owner.name,
            jobTitle: 'Founder and Chief Executive Officer',
            worksFor: { '@type': 'Organization', name: SITE.parentOrganization },
            url: SITE.owner.site,
          },
        ]}
      />

      <article className="fab-container py-6 sm:py-10">
        <h1 className="text-3xl">{t('about.heading')}</h1>

        <section className="mt-6">
          <SectionHeading title={t('about.missionTitle')} level={2} />
          <Prose>
            <p>{t('about.missionBody')}</p>
          </Prose>
        </section>

        <section className="mt-8">
          <SectionHeading title={t('about.principlesTitle')} level={2} />
          <ul className="grid gap-3 sm:grid-cols-2">
            {PRINCIPLE_KEYS.map((key) => (
              <Card as="li" key={key}>
                <p className="text-sm">{t(`about.principles.${key}`)}</p>
              </Card>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <SectionHeading title={t('about.ownerTitle')} level={2} />
          <Prose>
            <p>{t('about.ownerBody')}</p>
            <p>
              <strong>{SITE.owner.name}</strong> — {t('contact.ownerTitle')},{' '}
              {SITE.parentOrganization}
            </p>
          </Prose>
          <LinkButton to={ROUTES.contact} className="mt-4" variant="outline">
            {t('about.contactCta')}
          </LinkButton>
        </section>
      </article>
    </>
  );
}
