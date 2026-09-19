/**
 * BSDC — src/features/notifications/PushOptIn.tsx
 * Purpose : Turning web push on, and saying plainly when it cannot be turned on.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Permission is only ever requested from a button a person pressed. A platform that asks
 *   on load gets blocked once and never asked again, and then it has no way to reach anybody.
 *   Each refusal state is named rather than hidden: blocked in the browser, unsupported in this
 *   browser, or not configured in this build. A person who knows why can usually fix it; a person
 *   told "something went wrong" cannot.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Icon, Text, showToast } from '@/shared/ui';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import {
  isPushSupported,
  pushError,
  pushPermission,
  registerPush,
  unregisterPush,
} from '@/services/notifications/tokens';

/** Props for the push opt-in. */
export interface PushOptInProps {
  readonly uid: string;
  readonly locale: Locale;
  /** Digest of the token this device registered, when it has one. */
  readonly tokenDigest: string;
  readonly onRegistered: (tokenDigest: string) => void;
  readonly onRemoved: () => void;
}

/**
 * Renders the push opt-in control.
 * @param props component props
 * @returns the card element
 */
export function PushOptIn({
  uid,
  locale,
  tokenDigest,
  onRegistered,
  onRemoved,
}: PushOptInProps): React.ReactElement {
  const { t } = useTranslation('push');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [busy, setBusy] = useState(false);
  const permission = pushPermission();
  const supported = isPushSupported();
  const enabled = tokenDigest.length > 0 && permission === 'granted';

  const enable = (): void => {
    setBusy(true);
    void registerPush(uid)
      .then((outcome) => {
        if (outcome.status === 'granted') {
          onRegistered(outcome.tokenDigest);
          showToast(locale, {
            titleBn: t('enabled.bn'),
            titleEn: t('enabled.en'),
            tone: 'success',
          });
          return;
        }
        const code =
          outcome.status === 'unsupported'
            ? 'BSDC-PUSH-002'
            : outcome.status === 'denied'
              ? 'BSDC-PUSH-001'
              : 'BSDC-PUSH-001';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}.bn`),
          titleEn: t(`error.${code}.en`),
        });
      })
      .catch((error: unknown) => {
        const appError = error instanceof AppError ? error : pushError(error);
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${appError.code}.bn`),
          titleEn: t(`error.${appError.code}.en`),
        });
      })
      .finally(() => setBusy(false));
  };

  const disable = (): void => {
    setBusy(true);
    void unregisterPush(uid, tokenDigest)
      .then(() => {
        onRemoved();
        showToast(locale, {
          titleBn: t('disabled.bn'),
          titleEn: t('disabled.en'),
          tone: 'success',
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="section" className="bsdc-push" padding="md">
      <div className="bsdc-push__head">
        <Icon name="bell" size={18} />
        <Text as="p" size="md" weight={600} lang={lang}>
          {t('title')}
        </Text>
      </div>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {enabled
          ? t('state.enabled')
          : !supported
            ? t('state.unsupported')
            : permission === 'denied'
              ? t('state.blocked')
              : t('state.off')}
      </Text>
      {enabled ? (
        <Button variant="secondary" loading={busy} onClick={disable}>
          {t('disable')}
        </Button>
      ) : (
        <Button
          variant="primary"
          loading={busy}
          disabled={!supported || permission === 'denied'}
          onClick={enable}
        >
          {t('enable')}
        </Button>
      )}
      <Text as="p" size="xs" tone="muted" lang={lang}>
        {t('privacyNote')}
      </Text>
    </Card>
  );
}
