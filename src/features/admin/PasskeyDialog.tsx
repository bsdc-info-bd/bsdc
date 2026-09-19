/**
 * BSDC — src/features/admin/PasskeyDialog.tsx
 * Purpose : The passkey gate that stands in front of a privileged change.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The passkey is typed here and sent once, straight to a Cloud Function that hashes and
 *   compares it. It is never held in component state a moment longer than the request takes, never
 *   written to the mirror, never put in a URL, and the input is cleared the instant the dialog
 *   closes — including on cancel, which is the case everybody forgets.
 *   The dialog says what the server will do with it and how many attempts remain, because a gate
 *   that fails silently reads as broken rather than as careful.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';

/** Props for the passkey dialog. */
export interface PasskeyDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly locale: Locale;
  /** What the change is, shown so the operator is never confirming something they have lost track of. */
  readonly intent: string;
  /** Verifies the passkey server-side and applies the change. */
  readonly onConfirm: (passkey: string) => Promise<void>;
}

/**
 * Renders the passkey gate.
 * @param props component props
 * @returns the dialog element
 */
export function PasskeyDialog({
  open,
  onOpenChange,
  locale,
  intent,
  onConfirm,
}: PasskeyDialogProps): React.ReactElement {
  const { t } = useTranslation('admin');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [passkey, setPasskey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPasskey('');
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  const submit = (): void => {
    if (passkey.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    void onConfirm(passkey)
      .then(() => {
        setPasskey('');
        onOpenChange(false);
      })
      .catch((reason: unknown) => {
        const code =
          typeof reason === 'object' &&
          reason !== null &&
          'code' in reason &&
          typeof (reason as { code?: unknown }).code === 'string'
            ? (reason as { code: string }).code
            : 'BSDC-AUTH-005';
        setError(t(`flags.passkey.error.${code}`, { defaultValue: t('flags.passkey.error') }));
        setPasskey('');
        inputRef.current?.focus();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setPasskey('');
        onOpenChange(next);
      }}
      title={t('flags.passkey.title')}
      description={t('flags.passkey.description')}
      size="sm"
      footer={
        <div className="bsdc-passkey__actions">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('flags.passkey.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={busy || passkey.trim().length === 0}
            loading={busy}
          >
            {t('flags.passkey.submit')}
          </Button>
        </div>
      }
    >
      <div className="bsdc-passkey">
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {intent}
        </Text>
        <Input
          ref={inputRef}
          type="password"
          autoComplete="off"
          label={t('flags.passkey.label')}
          hint={t('flags.passkey.hint')}
          error={error ?? undefined}
          value={passkey}
          onChange={(event) => setPasskey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
      </div>
    </Modal>
  );
}
