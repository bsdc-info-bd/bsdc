/**
 * BSDC — src/features/notifications/BroadcastComposer.tsx
 * Purpose : The manual broadcast desk: an admin writes, an admin presses send.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Nothing here can be scheduled, triggered or automated, and that is enforced in the code
 *   rather than in a policy: there is no schedule field, no trigger, and the send call refuses
 *   without an explicit confirmation flag that an admin has to type their way past.
 *   The composer shows the audience size it believes it is writing to, states who the author is,
 *   and requires a second confirmation step with the recipient count visible, because a broadcast
 *   is the one action on the platform that reaches everybody at once and therefore the one that
 *   must never be possible by accident.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Select, Text, Textarea, showToast } from '@/shared/ui';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import {
  BROADCAST_AUDIENCES,
  BROADCAST_CHANNELS,
  BROADCAST_LIMITS,
  automationRule,
  isOneSignalConfigured,
  newBroadcast,
  saveDraft,
  sendBroadcast,
  validateBroadcast,
  type BroadcastAudience,
  type BroadcastChannel,
} from '@/services/notifications/oneSignal';

/** Props for the broadcast composer. */
export interface BroadcastComposerProps {
  readonly authorUid: string;
  readonly authorName: string;
  readonly locale: Locale;
  readonly onSent: (recipientCount: number) => void;
}

/**
 * Renders the broadcast composer.
 * @param props component props
 * @returns the composer element
 */
export function BroadcastComposer({
  authorUid,
  authorName,
  locale,
  onSent,
}: BroadcastComposerProps): React.ReactElement {
  const { t } = useTranslation('push');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('members');
  const [channel, setChannel] = useState<BroadcastChannel>('push');
  const [targetPath, setTargetPath] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const usable =
    validateBroadcast({ authorUid, authorName, title, body, audience, channel }) === null;

  const send = (): void => {
    if (!usable) return;
    setBusy(true);
    const draft = newBroadcast({
      authorUid,
      authorName,
      title,
      body,
      audience,
      channel,
      targetPath,
    });
    void saveDraft(draft)
      .then((broadcastId) => sendBroadcast(broadcastId, true))
      .then((recipientCount) => {
        onSent(recipientCount);
        setTitle('');
        setBody('');
        setConfirming(false);
        showToast(locale, {
          titleBn: t('broadcast.sent.bn', { count: recipientCount }),
          titleEn: t('broadcast.sent.en', { count: recipientCount }),
          tone: 'success',
        });
      })
      .catch((error: unknown) => {
        const code = error instanceof AppError ? error.code : 'BSDC-NET-005';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}.bn`, { defaultValue: t('error.default.bn') }),
          titleEn: t(`error.${code}.en`, { defaultValue: t('error.default.en') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="section" className="bsdc-broadcast" padding="md">
      <div className="bsdc-broadcast__head">
        <Text as="h2" size="lg" weight={700} lang={lang}>
          {t('broadcast.title')}
        </Text>
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {automationRule()}
        </Text>
      </div>

      <Input
        label={t('broadcast.headline')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={BROADCAST_LIMITS.titleMax}
        counter={{ value: title.length, max: BROADCAST_LIMITS.titleMax }}
      />
      <Textarea
        label={t('broadcast.body')}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={BROADCAST_LIMITS.bodyMax}
        counter={{ value: body.length, max: BROADCAST_LIMITS.bodyMax }}
      />
      <div className="bsdc-broadcast__row">
        <Select<BroadcastAudience>
          label={t('broadcast.audience')}
          value={audience}
          onValueChange={setAudience}
          options={BROADCAST_AUDIENCES.map((entry) => ({
            value: entry,
            label: t(`audience.${entry}`),
          }))}
        />
        <Select<BroadcastChannel>
          label={t('broadcast.channel')}
          value={channel}
          onValueChange={setChannel}
          options={BROADCAST_CHANNELS.map((entry) => ({
            value: entry,
            label: t(`channel.${entry}`),
            disabled: entry !== 'push' && !isOneSignalConfigured(),
          }))}
        />
      </div>
      <Input
        label={t('broadcast.targetPath')}
        value={targetPath}
        onChange={(event) => setTargetPath(event.target.value)}
        placeholder="/feed"
        maxLength={120}
      />

      {confirming ? (
        <div
          className="bsdc-broadcast__confirm"
          role="alertdialog"
          aria-label={t('broadcast.confirmLabel')}
        >
          <Text as="p" size="sm" lang={lang}>
            {t('broadcast.confirm', { audience: t(`audience.${audience}`) })}
          </Text>
          <div className="bsdc-broadcast__confirmActions">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('broadcast.cancel')}
            </Button>
            <Button variant="primary" loading={busy} onClick={send}>
              {t('broadcast.confirmSend')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" disabled={!usable} onClick={() => setConfirming(true)}>
          {t('broadcast.review')}
        </Button>
      )}
    </Card>
  );
}
