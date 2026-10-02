import { Github, Mail, ShieldAlert, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Card, ExternalLink, Prose } from '@/design-system';
import { ROUTES, SITE } from '@/lib/site';

export default function ContactPage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('contact.metaTitle')}
        description={t('contact.metaDescription')}
        path={ROUTES.contact}
        jsonLd={[
          {
            '@type': 'ContactPage',
            name: t('contact.heading'),
            url: `${SITE.url}${ROUTES.contact}`,
            mainEntity: {
              '@type': 'Organization',
              name: SITE.name,
              email: SITE.emails.primary,
              contactPoint: [
                {
                  '@type': 'ContactPoint',
                  contactType: 'customer support',
                  email: SITE.emails.primary,
                  availableLanguage: ['bn', 'en'],
                },
              ],
            },
          },
        ]}
      />

      <div className="fab-container py-6 sm:py-10">
        <h1 className="text-3xl">{t('contact.heading')}</h1>
        <Prose className="mt-3">
          <p>{t('contact.intro')}</p>
        </Prose>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          <Card as="li">
            <h2 className="flex items-center gap-2 text-lg">
              <Mail size={18} aria-hidden="true" className="text-green-700" />
              {t('contact.generalTitle')}
            </h2>
            <p className="mt-2 text-sm">
              <a
                className="text-blue underline underline-offset-2"
                href={`mailto:${SITE.emails.primary}`}
              >
                {SITE.emails.primary}
              </a>
            </p>
          </Card>

          <Card as="li">
            <h2 className="flex items-center gap-2 text-lg">
              <Mail size={18} aria-hidden="true" className="text-green-700" />
              {t('contact.partnershipTitle')}
            </h2>
            <p className="mt-2 text-sm">
              <a
                className="text-blue underline underline-offset-2"
                href={`mailto:${SITE.emails.secondary}`}
              >
                {SITE.emails.secondary}
              </a>
            </p>
          </Card>

          <Card as="li">
            <h2 className="flex items-center gap-2 text-lg">
              <ShieldAlert size={18} aria-hidden="true" className="text-green-700" />
              {t('contact.securityTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted">{t('contact.securityBody')}</p>
          </Card>

          <Card as="li">
            <h2 className="flex items-center gap-2 text-lg">
              <Github size={18} aria-hidden="true" className="text-green-700" />
              {t('contact.repositoryTitle')}
            </h2>
            <p className="mt-2 text-sm">
              <ExternalLink href={SITE.repository}>bsdc-info-bd/bsdc</ExternalLink>
            </p>
          </Card>

          <Card as="li" className="sm:col-span-2">
            <h2 className="flex items-center gap-2 text-lg">
              <User size={18} aria-hidden="true" className="text-green-700" />
              {t('contact.ownerTitle')}
            </h2>
            <p className="mt-2 text-sm">
              {SITE.owner.name} — {SITE.parentOrganization}
            </p>
            <p className="mt-1 text-sm">
              <ExternalLink href={SITE.owner.site}>
                {SITE.owner.site.replace('https://', '')}
              </ExternalLink>
            </p>
          </Card>
        </ul>
      </div>
    </>
  );
}
