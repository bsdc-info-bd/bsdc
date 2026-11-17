import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import { Prose, SectionHeading } from '@/design-system';
import { ROUTES, SITE } from '@/lib/site';

/**
 * The privacy policy, written from the data model rather than from a template.
 *
 * Google Play requires a reachable policy URL for any app that collects personal
 * data, and an inaccurate policy is worse than none: it is a statement the platform
 * and the member can both be held to. Every section below names something this
 * codebase actually stores — `profiles`, `addresses`, `mk_orders`, `job_applications`,
 * `gig_proposals`, `messages`, `fcm_tokens`, `mk_credit_ledger` — and the claims about
 * what is *not* collected are true because the site ships no analytics tag, no
 * advertising pixel and no third-party session recorder. See `docs/launch-audit.md`.
 *
 * The sections are keyed rather than hand-written so Bangla and English cannot drift
 * apart: adding a section means adding one key to both locale files, and the page
 * renders whatever the two locales agree exists.
 */
const SECTION_KEYS = [
  'whatWeCollect',
  'whyWeHoldIt',
  'whoSeesIt',
  'payments',
  'messages',
  'location',
  'photos',
  'camera',
  'cookies',
  'retention',
  'yourRights',
  'children',
  'changes',
  'contact',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * Sections that are a list of stored items rather than prose. Rendering them as a
 * list keeps the inventory scannable, which matters: this is the part a reviewer
 * and a suspicious member both read first.
 */
const LIST_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>([
  'whatWeCollect',
  'whoSeesIt',
  'yourRights',
]);

export default function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={t('privacy.metaTitle')}
        description={t('privacy.metaDescription')}
        path={ROUTES.privacy}
        jsonLd={[
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('nav.home'), item: SITE.url },
              {
                '@type': 'ListItem',
                position: 2,
                name: t('privacy.heading'),
                item: `${SITE.url}${ROUTES.privacy}`,
              },
            ],
          },
        ]}
      />

      <article className="fab-container py-6 sm:py-10">
        <h1 className="text-3xl">{t('privacy.heading')}</h1>
        <Prose className="mt-3">
          <p>{t('privacy.intro')}</p>
          <p className="text-sm text-muted">{t('privacy.updated')}</p>
        </Prose>

        {SECTION_KEYS.map((key) => (
          <section key={key} className="mt-8" id={key}>
            <SectionHeading title={t(`privacy.sections.${key}.title`)} level={2} />
            <Prose>
              <p>{t(`privacy.sections.${key}.body`)}</p>
              {LIST_SECTIONS.has(key) ? (
                <ul className="mt-2 list-disc ps-5">
                  {(t(`privacy.sections.${key}.items`, { returnObjects: true }) as string[]).map(
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
