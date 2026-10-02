import { Award, GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Card,
  Chip,
  EmptyState,
  PageSkeleton,
  ProgressBar,
  SectionHeading,
  SelectField,
} from '@/design-system';
import { useCourseCatalog, useMyCertificates } from '@/hooks/use-learning';
import { formatDuration, type CourseLevel } from '@/lib/learning/learning-types';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { certificatePath, coursePath, ROUTES, SITE } from '@/lib/site';

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced'];

/** The course catalogue, plus the certificates this member already holds. */
export default function LearnPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const catalog = useCourseCatalog();
  const mine = useMyCertificates();

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('learn.title'),
    itemListElement: catalog.courses.slice(0, 20).map((course, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Course',
        name: course.title,
        description: course.summary,
        url: new URL(coursePath(course.slug), SITE.url).toString(),
        inLanguage: course.language,
        provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
      },
    })),
  };

  return (
    <>
      <Seo
        title={t('learn.metaTitle')}
        description={t('learn.metaDescription')}
        path={ROUTES.learn}
        jsonLd={[itemList]}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('learn.title')} description={t('learn.description')} />

        <Card className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t('learn.level')}
              value={catalog.filters.level ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                catalog.setFilters({
                  ...catalog.filters,
                  level: value === '' ? null : (value as CourseLevel),
                });
              }}
              options={[
                { value: '', label: t('learn.anyLevel') },
                ...LEVELS.map((level) => ({
                  value: level,
                  label: t(`learn.levels.${level}`),
                })),
              ]}
            />
            <SelectField
              label={t('learn.topic')}
              value={catalog.filters.tag ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                catalog.setFilters({ ...catalog.filters, tag: value === '' ? null : value });
              }}
              options={[
                { value: '', label: t('learn.anyTopic') },
                ...[...new Set(catalog.courses.flatMap((course) => course.tags))]
                  .sort((a, b) => a.localeCompare(b))
                  .map((tag) => ({ value: tag, label: tag })),
              ]}
            />
          </div>
        </Card>

        {catalog.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {catalog.isError ? (
          <Alert tone="danger" title={t('learn.failed')} className="mt-4" />
        ) : null}

        {!catalog.isLoading && !catalog.isError && catalog.courses.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<GraduationCap size={22} />}
              title={t('learn.emptyTitle')}
              description={t('learn.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {catalog.courses.map((course) => (
            <Card as="li" key={course.id}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 text-lg font-semibold">
                  <Link to={coursePath(course.slug)} className="fab-link">
                    {course.title}
                  </Link>
                </h2>
                <Badge tone="neutral">{t(`learn.levels.${course.level}`)}</Badge>
              </div>

              {course.summary.length > 0 ? (
                <p className="mt-1 line-clamp-3 text-sm text-muted">{course.summary}</p>
              ) : null}

              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  {t('learn.lessonCount', { total: formatNumber(course.lessonCount, language) })}
                </span>
                <span>{formatDuration(course.durationMinutes, language)}</span>
                <span>
                  {t('learn.learnerCount', {
                    total: formatNumber(course.enrolledCount, language),
                  })}
                </span>
              </p>

              {course.tags.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1">
                  {course.tags.slice(0, 4).map((tag) => (
                    <li key={tag}>
                      <Chip>{tag}</Chip>
                    </li>
                  ))}
                </ul>
              ) : null}

              {course.myProgress !== null ? (
                <div className="mt-3">
                  <ProgressBar
                    value={course.myProgress}
                    label={t('learn.progressLabel', { percent: course.myProgress })}
                  />
                  <p className="mt-1 text-2xs text-muted">
                    {course.hasCertificate
                      ? t('learn.certified')
                      : t('learn.progressLabel', { percent: course.myProgress })}
                  </p>
                </div>
              ) : null}
            </Card>
          ))}
        </ul>

        {mine.certificates.length > 0 ? (
          <section className="mt-8" aria-labelledby="my-certificates">
            <h2 id="my-certificates" className="text-lg font-semibold">
              {t('learn.myCertificates')}
            </h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {mine.certificates.map((certificate) => (
                <Card as="li" key={certificate.id}>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Award size={16} aria-hidden="true" />
                    {certificate.course_title}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {formatAbsoluteDate(new Date(certificate.issued_at), language)} ·{' '}
                    {t('learn.scoreLabel', { score: certificate.score })}
                  </p>
                  <p className="mt-2 font-mono text-xs">
                    <Link to={certificatePath(certificate.code)} className="fab-link">
                      {certificate.code}
                    </Link>
                  </p>
                  {certificate.revoked_at !== null ? (
                    <p className="mt-1 text-xs text-red-700">{t('learn.revoked')}</p>
                  ) : null}
                </Card>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
