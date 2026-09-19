/**
 * BSDC — src/features/reports/VerificationCard.tsx
 * Purpose : The public checker: paste an id or a URL, learn whether the document is the one we issued.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : This screen needs no sign-in and no standing. It answers three different questions with
 *   three different sentences, because collapsing them would be dishonest:
 *     confirmed — the hash matches the record we hold;
 *     refused   — the hash does not match; the document was altered or the hash was copied wrong;
 *     unknown   — we hold no record under that id, which is what an offline-issued report looks like
 *                 until the device that made it syncs.
 *   "Unknown" is not a soft pass. The screen says what it means and what to do next.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Input, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import { parseVerificationInput } from '@/core/lib/report';
import { fetchReportDocument } from '@/entities/report/repository';
import { verdictExplanation, verifyReportDocument } from '@/entities/report/document';
import type { VerificationVerdict } from '@/entities/report/document';

/** Props for the verification card. */
export interface VerificationCardProps {
  readonly locale: Locale;
  /** Report id from the route, when the visitor arrived by scanning the QR code. */
  readonly reportId?: string | undefined;
  /** Hash from the URL, when there is one. */
  readonly hash?: string | undefined;
}

/**
 * Renders the report verifier.
 * @param props component props
 * @returns the verifier element
 */
export function VerificationCard({
  locale,
  reportId,
  hash,
}: VerificationCardProps): React.ReactElement {
  const { t } = useTranslation('reports');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [input, setInput] = useState(reportId ?? '');
  const [hashInput, setHashInput] = useState(hash ?? '');
  const [verdict, setVerdict] = useState<VerificationVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState('');

  const check = (): void => {
    const parsed = parseVerificationInput(input);
    if (parsed === null) {
      setVerdict('malformed');
      setChecked(input);
      return;
    }
    const supplied = hashInput.trim().length > 0 ? hashInput.trim() : parsed.hash;
    setBusy(true);
    setChecked(parsed.reportId);
    void fetchReportDocument(parsed.reportId)
      .then((record) => {
        setVerdict(verifyReportDocument(record, supplied));
      })
      .catch(() => {
        setVerdict('unknown');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="section" className="bsdc-verify" padding="md">
      <Text as="h1" size="xl" weight={700} lang={lang}>
        {t('verify.title')}
      </Text>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('verify.subtitle')}
      </Text>

      <div className="bsdc-verify__form">
        <Input
          label={t('verify.idOrUrl')}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <Input
          label={t('verify.hash')}
          value={hashInput}
          onChange={(event) => setHashInput(event.target.value)}
          hint={t('verify.hashHint')}
        />
        <Button variant="primary" onClick={check} disabled={busy} loading={busy}>
          {t('verify.check')}
        </Button>
      </div>

      {verdict === null ? null : (
        <div className="bsdc-verify__result" role="status">
          <Badge
            tone={
              verdict === 'confirmed'
                ? 'success'
                : verdict === 'refused'
                  ? 'danger'
                  : verdict === 'unknown'
                    ? 'warning'
                    : 'neutral'
            }
          >
            {t(`verify.${verdict}`)}
          </Badge>
          <Text as="p" size="sm" lang={lang}>
            {verdictExplanation(verdict)[lang]}
          </Text>
          <p className="bsdc-verify__id">
            <span lang={lang}>{t('verify.checked')}</span>
            <code>{checked}</code>
          </p>
        </div>
      )}
    </Card>
  );
}
