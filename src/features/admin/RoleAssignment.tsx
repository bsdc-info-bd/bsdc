/**
 * BSDC — src/features/admin/RoleAssignment.tsx
 * Purpose : The form that changes somebody's standing on the platform.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : This screen asks; it does not decide. The Cloud Function behind it refuses anything
 *   but a root administrator, refuses to hand the root role to a second account, and writes the
 *   reason into the audit trail. What is left here is the part a machine cannot do: making the
 *   operator say why, and showing them the ladder so a promotion is a considered step and not a
 *   dropdown they clicked on the way past.
 *   The reason field is required before the button enables, because "who changed this and why" is
 *   the whole point of the trail, and a trail full of blanks is decoration.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Select, Text, Textarea, showToast } from '@/shared/ui';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import { ASSIGNABLE_ROLES, roleLabel } from '@/core/config/permissions';
import { assignRole } from '@/entities/admin/repository';

/** Props for the role assignment form. */
export interface RoleAssignmentProps {
  readonly locale: Locale;
  /** Called after a successful assignment so the audit trail can be re-read. */
  readonly onAssigned: () => void;
}

/**
 * Renders the role assignment form.
 * @param props component props
 * @returns the form element
 */
export function RoleAssignment({ locale, onAssigned }: RoleAssignmentProps): React.ReactElement {
  const { t } = useTranslation('admin');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [uid, setUid] = useState('');
  const [role, setRole] = useState<string>('member');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const usable = uid.trim().length > 0 && reason.trim().length > 0;

  const submit = (): void => {
    if (!usable || busy) return;
    setBusy(true);
    void assignRole(uid.trim(), role, reason.trim())
      .then(() => {
        showToast(locale, {
          tone: 'success',
          titleBn: t('members.done'),
          titleEn: t('members.done'),
        });
        setUid('');
        setReason('');
        onAssigned();
      })
      .catch((error: unknown) => {
        const code = error instanceof AppError ? error.code : 'BSDC-NET-005';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`flags.passkey.error.${code}`, { defaultValue: t('flags.passkey.error') }),
          titleEn: t(`flags.passkey.error.${code}`, { defaultValue: t('flags.passkey.error') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="section" className="bsdc-roles" padding="md">
      <Text as="h2" size="lg" weight={700} lang={lang}>
        {t('members.title')}
      </Text>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('members.subtitle')}
      </Text>

      <div className="bsdc-roles__grid">
        <Input
          label={t('members.uid')}
          placeholder={t('members.uidPlaceholder')}
          value={uid}
          onChange={(event) => setUid(event.target.value)}
        />
        <Select
          label={t('members.role')}
          value={role}
          onValueChange={setRole}
          options={ASSIGNABLE_ROLES.map((entry) => ({
            value: entry,
            label: roleLabel(entry, locale),
          }))}
        />
      </div>

      <Textarea
        label={t('members.reason')}
        placeholder={t('members.reasonPlaceholder')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('members.ladder')}
      </Text>
      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('members.rootNote')}
      </Text>

      <div className="bsdc-roles__actions">
        <Button variant="primary" onClick={submit} disabled={!usable || busy} loading={busy}>
          {busy ? t('members.submitting') : t('members.submit')}
        </Button>
        {!usable ? (
          <Text as="p" size="xs" tone="muted" lang={lang}>
            {t('members.reasonRequired')}
          </Text>
        ) : null}
      </div>
    </Card>
  );
}
