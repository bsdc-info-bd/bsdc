/**
 * BSDC — src/features/moderation/ReportCard.tsx
 * Purpose : One report, as a reviewer sees it: what, who, how urgent, and what can be done.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The card offers only the actions that are legal from the report's current state, taken
 *   from the same state machine the Cloud Function enforces, so a reviewer never waits for a round
 *   trip to be told an action was refused. Actions that reach the author require a written note,
 *   because "removed" with no explanation is how a community learns to distrust its moderators.
 *   The response target is shown as hours remaining, and past-due reports say so in plain words.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Icon, Select, Text, Textarea, showToast } from '@/shared/ui';
import {
  MODERATION_ACTION_DEFINITIONS,
  actionDefinition,
  type ModerationAction,
} from '@/core/config/moderation';
import type { Locale } from '@/core/config/app';
import { countByState, isOverdue, slaHoursFor } from '@/entities/moderation/model';
import type { Report } from '@/entities/moderation/model';
import { availableActions, pointPenalty, requiresNote } from '@/entities/moderation/state';
import { decideReport } from '@/entities/moderation/repository';

/** Props for the report card. */
export interface ReportCardProps {
  readonly report: Report;
  readonly locale: Locale;
  readonly reviewerUid: string;
  readonly reviewerRole: 'support' | 'moderator' | 'admin' | 'root';
  readonly onDecided: (report: Report) => void;
}

/** Rank used to decide whether a reviewer outranks an action's minimum role. */
const ROLE_RANK: Readonly<Record<string, number>> = {
  support: 0,
  moderator: 1,
  admin: 2,
  root: 3,
};

/**
 * Renders one report for review.
 * @param props component props
 * @returns the card element
 */
export function ReportCard({
  report,
  locale,
  reviewerUid,
  reviewerRole,
  onDecided,
}: ReportCardProps): React.ReactElement {
  const { t } = useTranslation('moderation');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const legal = availableActions(report.state).filter(
    (entry) =>
      (ROLE_RANK[reviewerRole] ?? 0) >= (ROLE_RANK[actionDefinition(entry).minimumRole] ?? 0),
  );
  const overdue = isOverdue(report);
  const hours = slaHoursFor(report);

  const submit = (): void => {
    if (action === null) return;
    if (requiresNote(action) && note.trim().length < 8) return;
    setBusy(true);
    void decideReport(report, action, note)
      .then((state) => {
        onDecided({ ...report, state, decidedBy: reviewerUid, decisionNote: note });
        setAction(null);
        setNote('');
        showToast(locale, {
          titleBn: t('decide.done.bn'),
          titleEn: t('decide.done.en'),
          tone: 'success',
        });
      })
      .catch(() => {
        showToast(locale, {
          tone: 'error',
          titleBn: t('decide.failed.bn'),
          titleEn: t('decide.failed.en'),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="article" className="bsdc-reportCard" data-overdue={overdue ? 'true' : 'false'}>
      <div className="bsdc-reportCard__head">
        <Badge
          tone={report.severity >= 4 ? 'danger' : report.severity === 3 ? 'warning' : 'neutral'}
          variant="solid"
        >
          {t(`category.${report.category}`)}
        </Badge>
        <Badge tone="neutral" variant="outline">
          {t(`state.${report.state}`)}
        </Badge>
        <Text as="p" size="xs" tone={overdue ? 'danger' : 'muted'} lang={lang}>
          {overdue ? t('card.overdue') : t('card.sla', { hours })}
        </Text>
      </div>

      <p className="bsdc-reportCard__target" lang={lang}>
        {bn ? report.targetLabelBn : report.targetLabelEn}
      </p>
      <p className="bsdc-reportCard__reason" lang={lang}>
        {report.reasonText}
      </p>
      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('card.targetType', { type: t(`target.${report.targetType}`) })}
      </Text>

      {legal.length > 0 ? (
        <div className="bsdc-reportCard__decide">
          <Select<ModerationAction>
            label={t('decide.action')}
            value={action ?? legal[0] ?? 'dismiss'}
            onValueChange={setAction}
            options={legal.map((entry) => ({
              value: entry,
              label: actionDefinition(entry)[bn ? 'labelBn' : 'labelEn'],
            }))}
          />
          {action !== null && requiresNote(action) ? (
            <Textarea
              label={t('decide.note')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={400}
              hint={t('decide.noteHint')}
            />
          ) : null}
          {action !== null && pointPenalty(action) > 0 ? (
            <Text as="p" size="xs" tone="danger" lang={lang}>
              <Icon name="alert" size={13} />
              {t('decide.penalty', { points: pointPenalty(action) })}
            </Text>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={action !== null && requiresNote(action) && note.trim().length < 8}
            onClick={submit}
          >
            {t('decide.submit')}
          </Button>
        </div>
      ) : (
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('card.decided', {
            by: report.decidedBy.length > 0 ? t('card.byReviewer') : t('card.bySystem'),
          })}
        </Text>
      )}
    </Card>
  );
}

/**
 * Counts the queue by state for the counters above the list.
 * @param reports the reports
 * @returns a count per state
 */
export function summariseQueue(reports: readonly Report[]): Readonly<Record<string, number>> {
  return countByState(reports);
}

/**
 * Lists the actions the catalogue contains, so the screen and the Function agree.
 * @returns the actions
 */
export function catalogueActions(): readonly ModerationAction[] {
  return MODERATION_ACTION_DEFINITIONS.map((definition) => definition.id);
}
