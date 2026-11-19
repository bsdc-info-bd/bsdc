import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Prose, SectionHeading } from '@/design-system';
import { ROUTES, SITE } from '@/lib/site';

/**
 * The terms of service, written from what the platform actually does.
 *
 * Beside the privacy policy, this is the document a member agrees to when they
 * create an account, and the one Google Play reviewers open alongside it. Every
 * section names a real behaviour of this codebase — the 30-day recovery window,
 * the bKash payment flow, the moderation console, the account deletion path —
 * rather than a template's guess at them.
 *
 * The sections are keyed rather than hand-written so Bangla and English cannot
 * drift apart: adding a section means adding one key to both locale files, and
 * the page renders whatever the two locales agree exists.
 */
const SECTION_KEYS = [
  'theService',
  'yourAccount',
  'yourContent',
  'marketplace',
  'payments',
  'acceptableUse',
  'moderation',
  'suspension',
  'deletingYourAccount',
  'liability',
  'changes',
  'contact',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * Sections that are a list of rules rather than prose. Rendering them as a list
 * keeps the obligations scannable, which matters: this is the part a member
 * actually reads before they agree.
 */
const LIST_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>(['acceptableUse']);

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('terms.metaTitle')}
        description={t('terms.metaDescription')}
        path={ROUTES.terms}
        jsonLd={[
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('nav.home'), item: SITE.url },
              {
                '@type': 'ListItem',
                position: 2,
                name: t('terms.heading'),
                item: `${SITE.url}${ROUTES.terms}`,
              },
            ],
          },
        ]}
      />

      <article className="fab-container py-6 sm:py-10">
        <h1 className="text-3xl">{t('terms.heading')}</h1>
        <Prose className="mt-3">
          <p>{t('terms.intro')}</p>
          <p className="text-sm text-muted">{t('terms.updated')}</p>
        </Prose>

        {SECTION_KEYS.map((key) => (
          <section key={key} className="mt-8" id={key}>
            <SectionHeading title={t(`terms.sections.${key}.title`)} level={2} />
            <Prose>
              <p>{t(`terms.sections.${key}.body`)}</p>
              {LIST_SECTIONS.has(key) ? (
                <ul className="mt-2 list-disc ps-5">
                  {(t(`terms.sections.${key}.items`, { returnObjects: true }) as string[]).map(
                    (item) => (
                      <li key={item}>{item}</li>
                    ),
                  )}
                </ul>
              ) : null}
            </Prose>
          </section>
        ))}
      </article>
    </>
  );
}
