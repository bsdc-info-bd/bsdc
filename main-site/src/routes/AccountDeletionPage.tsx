import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import { Prose, SectionHeading } from '@/design-system';
import { ROUTES, SITE } from '@/lib/site';

/**
 * The public page that explains how to delete a BSDC account.
 *
 * Google Play asks for a deletion URL that works without the app: a reviewer
 * opens it from the store listing, and a member who has lost their phone, or
 * uninstalled the app, needs it to be true for them too. The in-app button is
 * the fast path — this page is the one that exists when the app does not.
 *
 * Every step named here is one the product actually has. The in-app path is the
 * "Delete account" panel in Settings on both clients; the email path is the
 * support address that appears in the privacy policy; and the fact that order
 * records survive in de-identified form is a property of migration 0119, not a
 * promise invented for this page.
 */
const SECTION_KEYS = ['inTheApp', 'onTheWeb', 'byEmail', 'whatHappens', 'whatStays'] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

const LIST_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>(['whatHappens']);

export default function AccountDeletionPage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('accountDeletion.metaTitle')}
        description={t('accountDeletion.metaDescription')}
        path={ROUTES.accountDeletion}
        jsonLd={[
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('nav.home'), item: SITE.url },
              {
                '@type': 'ListItem',
                position: 2,
                name: t('accountDeletion.heading'),
                item: `${SITE.url}${ROUTES.accountDeletion}`,
              },
            ],
          },
        ]}
      />

      <article className="fab-container py-6 sm:py-10">
        <h1 className="text-3xl">{t('accountDeletion.heading')}</h1>
        <Prose className="mt-3">
          <p>{t('accountDeletion.intro')}</p>
          <p className="text-sm text-muted">{t('accountDeletion.updated')}</p>
        </Prose>

        {SECTION_KEYS.map((key) => (
          <section key={key} className="mt-8" id={key}>
            <SectionHeading title={t(`accountDeletion.sections.${key}.title`)} level={2} />
            <Prose>
              <p>{t(`accountDeletion.sections.${key}.body`)}</p>
              {LIST_SECTIONS.has(key) ? (
                <ul className="mt-2 list-disc ps-5">
                  {(
                    t(`accountDeletion.sections.${key}.items`, { returnObjects: true }) as string[]
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </Prose>
          </section>
        ))}

        <Prose className="mt-8">
          <p>
            <Link to={ROUTES.privacy} className="underline">
              {t('accountDeletion.readPolicy')}
            </Link>
            {' · '}
            <Link to={ROUTES.terms} className="underline">
              {t('accountDeletion.readTerms')}
            </Link>
          </p>
          <p className="mt-2 text-sm text-muted">
            <a href={`mailto:${SITE.emails.primary}`} className="underline">
              {SITE.emails.primary}
            </a>
          </p>
        </Prose>
      </article>
    </>
  );
}
