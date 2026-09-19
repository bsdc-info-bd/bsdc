/**
 * BSDC — src/features/reports/ReportComposer.tsx
 * Purpose : Generate a report: choose one, see its rows, then issue it as a verifiable PDF.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Three steps, in that order, because a document that cannot be checked should not be
 *   issued and a document nobody has looked at should not be signed. The rows are shown before the
 *   PDF is built, so the person issuing it reads what they are about to put their name to.
 *   The heavy lifting happens here and only here: jsPDF and the QR encoder are imported inside the
 *   generate handler, so a visitor who never issues a report never downloads either.
 *   Issuing is server-registered. If the network is down the PDF is still produced — it carries its
 *   id, stamp, hash and QR — and the screen says plainly that it is not yet verifiable, rather than
 *   letting somebody walk away believing it is.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Select, Text, showToast } from '@/shared/ui';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import { canSeal, sealReport, type ReportPayload, type SealedReport } from '@/core/lib/report';
import { buildReportPdf, downloadPdf } from '@/core/lib/pdf';
import {
  REPORT_DEFINITIONS,
  buildReportPayload,
  mayIssueReport,
  type CommunitySnapshot,
  type ReportKind,
} from '@/entities/report/catalog';
import { issueReport } from '@/entities/report/repository';

/** Props for the report composer. */
export interface ReportComposerProps {
  readonly locale: Locale;
  readonly role: string;
  readonly root: boolean;
  /** Builds the snapshot at issue time, so the report counts what exists now, not what existed when the screen opened. */
  readonly buildSnapshot: () => Promise<CommunitySnapshot>;
}

/** Where the issuing process has got to. */
type IssueState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'building' }
  | { readonly phase: 'ready'; readonly report: SealedReport; readonly registered: boolean }
  | { readonly phase: 'failed'; readonly code: string };

/**
 * Renders the report composer.
 * @param props component props
 * @returns the composer element
 */
export function ReportComposer({
  locale,
  role,
  root,
  buildSnapshot,
}: ReportComposerProps): React.ReactElement {
  const { t } = useTranslation('reports');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [kind, setKind] = useState<ReportKind>('moderation');
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<IssueState>({ phase: 'idle' });

  const definition = REPORT_DEFINITIONS.find((entry) => entry.kind === kind);
  const allowed = definition === undefined ? false : mayIssueReport(definition, role, root);

  const preview = useCallback((): void => {
    setLoading(true);
    void buildSnapshot()
      .then((snapshot) => {
        setPayload(buildReportPayload(kind, snapshot, locale === 'bn' ? 'bn' : 'en'));
        setState({ phase: 'idle' });
      })
      .catch(() => {
        setPayload(null);
        setState({ phase: 'failed', code: 'BSDC-REPORT-001' });
      })
      .finally(() => setLoading(false));
  }, [buildSnapshot, kind, locale]);

  useEffect(preview, [preview]);

  const generate = (): void => {
    if (payload === null || !allowed) return;
    setState({ phase: 'building' });
    void sealReport(payload)
      .then(async (report) => {
        const pdf = await buildReportPdf(report, payload, locale === 'bn' ? 'bn' : 'en');
        downloadPdf(pdf.fileName, pdf.bytes);
        try {
          await issueReport(report, payload);
          setState({ phase: 'ready', report, registered: true });
        } catch {
          // The PDF exists and is internally consistent; only the server record is missing.
          setState({ phase: 'ready', report, registered: false });
        }
      })
      .catch((reason: unknown) => {
        const code = reason instanceof AppError ? reason.code : 'BSDC-REPORT-002';
        setState({ phase: 'failed', code });
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}`, { defaultValue: t('error.default') }),
          titleEn: t(`error.${code}`, { defaultValue: t('error.default') }),
        });
      });
  };

  if (!canSeal()) {
    return (
      <Card as="section" padding="md">
        <Text as="h2" size="lg" weight={700} lang={lang}>
          {t('title')}
        </Text>
        <Text as="p" size="sm" tone="danger" lang={lang}>
          {t('noCrypto')}
        </Text>
      </Card>
    );
  }

  return (
    <Card as="section" className="bsdc-reports" padding="md">
      <Text as="h2" size="lg" weight={700} lang={lang}>
        {t('title')}
      </Text>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('subtitle')}
      </Text>

      <Select<ReportKind>
        label={t('kind')}
        value={kind}
        onValueChange={setKind}
        options={REPORT_DEFINITIONS.map((entry) => ({
          value: entry.kind,
          label: locale === 'bn' ? entry.labelBn : entry.labelEn,
        }))}
      />

      {definition === undefined ? null : (
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {locale === 'bn' ? definition.descriptionBn : definition.descriptionEn}
        </Text>
      )}

      {!allowed ? (
        <Badge tone="warning">{t('notAllowed')}</Badge>
      ) : loading || payload === null ? (
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('loading')}
        </Text>
      ) : (
        <>
          <div className="bsdc-reports__preview">
            <Text as="h3" size="md" weight={600} lang={lang}>
              {payload.title}
            </Text>
            <ul className="bsdc-reports__rows">
              {payload.rows.map((row) => (
                <li key={`${row.label}-${row.note ?? ''}`}>
                  <span lang={lang}>{row.label}</span>
                  <strong>{row.value}</strong>
                  {row.note === undefined || row.note.length === 0 ? null : (
                    <span className="bsdc-reports__note" lang={lang}>
                      {row.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <ul className="bsdc-reports__rows bsdc-reports__rows--totals">
              {payload.totals.map((row) => (
                <li key={row.label}>
                  <span lang={lang}>{row.label}</span>
                  <strong>{row.value}</strong>
                </li>
              ))}
            </ul>
          </div>

          <Button
            variant="primary"
            onClick={generate}
            disabled={state.phase === 'building'}
            loading={state.phase === 'building'}
          >
            {state.phase === 'building' ? t('building') : t('issue')}
          </Button>

          {state.phase === 'ready' ? (
            <div className="bsdc-reports__result">
              <Text as="p" size="sm" lang={lang}>
                {t('issued', { id: state.report.reportId })}
              </Text>
              <p className="bsdc-reports__hash">
                <span lang={lang}>{t('integrity')}</span>
                <code>{state.report.integrity}</code>
              </p>
              <a
                className="bsdc-reports__verify"
                href={state.report.verificationUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                {t('verifyLink')}
              </a>
              {state.registered ? (
                <Badge tone="success">{t('registered')}</Badge>
              ) : (
                <Badge tone="warning">{t('notRegistered')}</Badge>
              )}
            </div>
          ) : null}

          {state.phase === 'failed' ? (
            <Text as="p" size="sm" tone="danger" lang={lang}>
              {t(`error.${state.code}`, { defaultValue: t('error.default') })}
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}
