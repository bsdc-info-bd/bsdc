/**
 * BSDC — src/features/admin/FlagMatrix.tsx
 * Purpose : The feature register: what is on, what is off, and what is off between two dates.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every capability in BSDC is a plugin behind a flag, and all of them ship switched on
 *   (LAW-11). Turning one off is therefore an act with consequence, which is why it takes the
 *   plugin passkey, why the row says *why* it is in the state it is in (kill switch, not started,
 *   window closed, runtime value, or build default), and why the change is written to the audit
 *   trail with the note the operator typed.
 *   The screen does not decide who may toggle what. It asks the server, and disables itself when
 *   the answer is no — so the control a person sees is the control they have, and a client bug can
 *   never widen that.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Switch,
  Text,
  showToast,
} from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import { FLAG_REGISTRY } from '@/core/config/features';
import type { FlagState } from '@/core/config/flags';
import {
  describeWindow,
  evaluateFlag,
  neutralFlagState,
  validateFlagWindow,
  type FlagVerdict,
} from '@/core/config/flags';
import { AppError } from '@/core/errors/AppError';
import { setFlag } from '@/entities/admin/repository';
import { PasskeyDialog } from './PasskeyDialog';

/** Props for the flag matrix. */
export interface FlagMatrixProps {
  readonly states: readonly FlagState[];
  readonly locale: Locale;
  readonly timezone: string;
  /** Called after a successful change so the page can re-read the register. */
  readonly onChanged: () => void;
}

/** A row the matrix renders: the definition, the current state and the verdict. */
interface FlagRow {
  readonly key: string;
  readonly label: string;
  readonly module: string;
  readonly description: string;
  readonly status: string;
  readonly passkeyRequired: boolean;
  readonly defaultOn: boolean;
  readonly state: FlagState;
  readonly verdict: FlagVerdict;
}

/**
 * Renders the feature register.
 * @param props component props
 * @returns the matrix element
 */
export function FlagMatrix({
  states,
  locale,
  timezone,
  onChanged,
}: FlagMatrixProps): React.ReactElement {
  const { t } = useTranslation('admin');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<FlagRow | null>(null);
  const [note, setNote] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<readonly FlagRow[]>(
    () =>
      FLAG_REGISTRY.map((definition) => {
        const state =
          states.find((entry) => entry.key === definition.key) ?? neutralFlagState(definition.key);
        return {
          key: definition.key,
          label: locale === 'bn' ? definition.labelBn : definition.labelEn,
          module: definition.module,
          description: definition.description,
          status: definition.status,
          passkeyRequired: definition.passkeyRequired,
          defaultOn: definition.defaultOn,
          state,
          verdict: evaluateFlag(state, definition.defaultOn),
        };
      }),
    [states, locale],
  );

  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      needle.length === 0 ||
      row.key.toLowerCase().includes(needle) ||
      row.label.toLowerCase().includes(needle) ||
      row.module.toLowerCase().includes(needle),
  );

  const openEditor = (row: FlagRow): void => {
    setPending(row);
    setNote('');
    setStartsAt(row.state.startsAt === null ? '' : toLocalInput(row.state.startsAt));
    setEndsAt(row.state.endsAt === null ? '' : toLocalInput(row.state.endsAt));
  };

  const apply = (passkey: string): Promise<void> => {
    if (pending === null) return Promise.resolve();
    const next: FlagState = {
      ...pending.state,
      enabled: !pending.verdict.enabled,
      startsAt: startsAt.trim().length === 0 ? null : new Date(startsAt).toISOString(),
      endsAt: endsAt.trim().length === 0 ? null : new Date(endsAt).toISOString(),
      note,
      updatedAt: new Date().toISOString(),
    };
    const window = validateFlagWindow(next.startsAt, next.endsAt);
    if (!window.ok) {
      return Promise.reject(new AppError(window.code, { key: pending.key }));
    }
    setBusy(true);
    return setFlag(next, passkey)
      .then(() => {
        showToast(locale, {
          tone: 'success',
          titleBn: t('flags.saved', { name: pending.label, state: flagStateLabel(next, locale) }),
          titleEn: t('flags.saved', { name: pending.label, state: flagStateLabel(next, locale) }),
        });
        setPending(null);
        onChanged();
      })
      .catch((reason: unknown) => {
        showToast(locale, {
          tone: 'error',
          titleBn: t(errorKey(reason), { defaultValue: t('flags.passkey.error') }),
          titleEn: t(errorKey(reason), { defaultValue: t('flags.passkey.error') }),
        });
        throw reason;
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="section" className="bsdc-flags" padding="md">
      <div className="bsdc-flags__head">
        <div>
          <Text as="h2" size="lg" weight={700} lang={lang}>
            {t('flags.title')}
          </Text>
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {t('flags.subtitle')}
          </Text>
        </div>
        <Input
          type="search"
          label={t('flags.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('flags.empty')}
          description={t('flags.subtitle')}
          lang={lang}
        />
      ) : (
        <ul className="bsdc-flags__list">
          {visible.map((row) => {
            const window = describeWindow(row.state);
            return (
              <li key={row.key} className="bsdc-flags__row">
                <div className="bsdc-flags__rowMain">
                  <Text as="h3" size="md" weight={600} lang={lang}>
                    {row.label}
                  </Text>
                  <Text as="p" size="sm" tone="muted" lang={lang}>
                    {row.description}
                  </Text>
                  <p className="bsdc-flags__meta">
                    <code>{row.key}</code>
                    <Badge tone={row.verdict.enabled ? 'success' : 'neutral'}>
                      {verdictLabel(row.verdict, (key) => t(key), row.defaultOn)}
                    </Badge>
                    {row.passkeyRequired ? (
                      <Badge tone="warning">{t('flags.passkey.title')}</Badge>
                    ) : null}
                    {window === 'none' ? null : (
                      <Badge tone="info">{t(`flags.schedule.${window}`)}</Badge>
                    )}
                  </p>
                </div>
                <div className="bsdc-flags__rowAction">
                  <Switch
                    checked={row.verdict.enabled}
                    onCheckedChange={() => openEditor(row)}
                    label={row.label}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending === null ? '' : pending.label}
        description={pending === null ? '' : t('flags.note')}
        size="md"
        footer={
          <div className="bsdc-flags__actions">
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              {t('flags.passkey.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (pending?.passkeyRequired === true) {
                  setPasskeyOpen(true);
                  return;
                }
                void apply('').catch(() => undefined);
              }}
              disabled={busy || pending === null}
              loading={busy}
            >
              {t('flags.save')}
            </Button>
          </div>
        }
      >
        {pending === null ? null : (
          <div className="bsdc-flags__editor">
            <Text as="p" size="sm" tone="muted" lang={lang}>
              {pending.verdict.enabled ? t('flags.state.off') : t('flags.state.on')}
            </Text>
            <div className="bsdc-flags__window">
              <Input
                type="datetime-local"
                label={t('flags.schedule.startsAt')}
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
              <Input
                type="datetime-local"
                label={t('flags.schedule.endsAt')}
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </div>
            <Input
              label={t('flags.note')}
              placeholder={t('flags.notePlaceholder')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Text as="p" size="xs" tone="muted" lang={lang}>
              {timezone}
            </Text>
          </div>
        )}
      </Modal>

      <PasskeyDialog
        open={passkeyOpen}
        onOpenChange={setPasskeyOpen}
        locale={locale}
        intent={pending === null ? '' : `${pending.label} — ${pending.key}`}
        onConfirm={apply}
      />
    </Card>
  );
}

/**
 * Converts an ISO instant to the value a datetime-local input expects, in the viewer's own zone.
 * @param iso the instant
 * @returns the input value
 */
function toLocalInput(iso: string): string {
  const at = new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * Labels a verdict for the row badge.
 * @param verdict the verdict
 * @param translate the translation function
 * @param defaultOn the build-time default
 * @returns the label
 */
function verdictLabel(
  verdict: FlagVerdict,
  translate: (key: string) => string,
  defaultOn: boolean,
): string {
  if (verdict.reason === 'forced-off') return translate('flags.state.forcedOff');
  if (verdict.reason === 'not-started') return translate('flags.state.ended');
  if (verdict.reason === 'ended') return translate('flags.state.ended');
  if (verdict.reason === 'default') {
    return `${translate('flags.state.default')} — ${
      defaultOn ? translate('flags.state.on') : translate('flags.state.off')
    }`;
  }
  return verdict.enabled ? translate('flags.state.on') : translate('flags.state.off');
}

/**
 * Labels the state a flag is being moved into, for the confirmation toast.
 * @param state the next state
 * @param locale the viewer's locale
 * @returns the label
 */
function flagStateLabel(state: FlagState, locale: Locale): string {
  return locale === 'bn' ? (state.enabled ? 'চালু' : 'বন্ধ') : state.enabled ? 'on' : 'off';
}

/**
 * Resolves the translation key of an error, falling back to a generic one.
 * @param reason the thrown value
 * @returns the i18n key
 */
function errorKey(reason: unknown): string {
  const code =
    reason instanceof AppError
      ? reason.code
      : typeof reason === 'object' &&
          reason !== null &&
          'code' in reason &&
          typeof (reason as { code?: unknown }).code === 'string'
        ? (reason as { code: string }).code
        : 'BSDC-NET-005';
  return `flags.passkey.error.${code}`;
}
