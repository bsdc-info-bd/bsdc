import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import { Alert, Button, Card, PageSkeleton, SectionHeading, TextField } from '@/design-system';
import { useCertificateVerification } from '@/hooks/use-learning';
import { isCertificateCode, normaliseCertificateCode } from '@/lib/learning/learning-types';
import { formatAbsoluteDate } from '@/lib/format';
import { certificatePath, coursePath, ROUTES, SITE } from '@/lib/site';

/**
 * Public certificate verification. Anyone with a code can confirm a claim; the
 * server answers with a name, a course and a date, and nothing else — no uid,
 * no email, no way to enumerate holders.
 */
export default function VerifyCertificatePage() {
  const { code } = useParams<{ code: string }>();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const navigate = useNavigate();
  const [typed, setTyped] = useState(code ?? '');

  const verification = useCertificateVerification(code);
  const certificate = verification.certificate;
  const typedValid = isCertificateCode(typed);

  const credential =
    certificate !== null && !certificate.revoked
      ? {
          '@context': 'https://schema.org',
          '@type': 'EducationalOccupationalCredential',
          name: certificate.courseTitle,
          credentialCategory: 'certificate',
          identifier: certificate.code,
          dateCreated: certificate.issuedAt,
          recognizedBy: { '@type': 'Organization', name: SITE.name, url: SITE.url },
        }
      : null;

  return (
    <>
      <Seo
        title={t('verify.metaTitle')}
        description={t('verify.metaDescription')}
        path={code === undefined ? ROUTES.verifyCertificate : certificatePath(code)}
        noindex={code !== undefined}
        jsonLd={credential === null ? [] : [credential]}
      />

      <div className="fab-container max-w-2xl py-6 sm:py-10">
        <SectionHeading title={t('verify.title')} description={t('verify.description')} />

        <Card className="mt-4">
          <TextField
            label={t('verify.code')}
            hint={t('verify.codeHint')}
            value={typed}
            maxLength={19}
            spellCheck={false}
            className="font-mono"
            onChange={(event) => {
              setTyped(normaliseCertificateCode(event.target.value));
            }}
          />
          <Button
            className="mt-3"
            disabled={!typedValid}
            onClick={() => {
              void navigate(certificatePath(typed));
            }}
          >
            {t('verify.check')}
          </Button>
          {typed.length > 0 && !typedValid ? (
            <p className="mt-2 text-xs text-muted">{t('verify.malformed')}</p>
          ) : null}
        </Card>

        {verification.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {verification.isError ? (
          <Alert tone="danger" title={t('verify.failed')} className="mt-4" />
        ) : null}

        {verification.notFound ? (
          <Alert tone="warning" title={t('verify.notFound')} className="mt-4">
            <p>{t('verify.notFoundBody')}</p>
          </Alert>
        ) : null}

        {certificate !== null ? (
          <Card className="mt-4">
            {certificate.revoked ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
                <ShieldAlert size={18} aria-hidden="true" />
                {t('verify.revoked')}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-green-700">
                <BadgeCheck size={18} aria-hidden="true" />
                {t('verify.valid')}
              </p>
            )}

            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted">{t('verify.recipient')}</dt>
                <dd className="font-semibold">{certificate.recipientName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('verify.course')}</dt>
                <dd>
                  <Link to={coursePath(certificate.courseSlug)} className="fab-link">
                    {certificate.courseTitle}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('verify.issued')}</dt>
                <dd>{formatAbsoluteDate(new Date(certificate.issuedAt), language)}</dd>
              </div>
              {!certificate.revoked ? (
                <div>
                  <dt className="text-xs text-muted">{t('verify.score')}</dt>
                  <dd>{t('learn.scoreLabel', { score: certificate.score })}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted">{t('verify.code')}</dt>
                <dd className="font-mono">{certificate.code}</dd>
              </div>
            </dl>
          </Card>
        ) : null}
      </div>
    </>
  );
}
