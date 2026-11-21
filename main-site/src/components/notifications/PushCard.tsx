import { BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Alert, Badge, Button, Card, IconButton, Switch, TimeAgo } from '@/design-system';
import { usePush } from '@/hooks/use-push';
import {
  describeDeviceState,
  describeUserAgent,
  deviceCountLabel,
  staleDevicesNote,
} from '@/lib/push/support';

export interface PushCardProps {
  /**
   * `prompt` is the card a member who has not decided yet sees, and it can be
   * put away. `settings` is the panel that says what is true, whatever it is.
   */
  variant?: 'settings' | 'prompt';
}

/**
 * Waking a device that is not open.
 *
 * The switch is the whole of it: on means this browser asked to be woken and the
 * database has somewhere to send it, off means both are undone — the subscription
 * is dropped in the browser and every recorded device is retired, so a member who
 * turns it off on a phone they have lost stops that phone being woken too.
 *
 * Where push cannot work at all, the card says which of the reasons it is instead
 * of showing a switch that does nothing.
 */
export function PushCard({ variant = 'settings' }: PushCardProps) {
  const { t, i18n } = useTranslation();
  const push = usePush();
  const [dismissed, setDismissed] = useState(false);

  const language = i18n.language === 'en' ? 'en' : 'bn';
  const blocked = push.block !== 'ok';
  // `on` is about this browser's permission and the existence of a recorded
  // device. `reachable` is the stricter question the list answers: of those
  // devices, how many can a notification actually arrive on *today*.
  const on = push.permission === 'granted' && push.devices.length > 0;
  const reachable = push.liveDevices;
  const staleNote = staleDevicesNote(
    push.devices.map((device) => device.state),
    language,
  );

  if (variant === 'prompt' && (dismissed || blocked || push.permission !== 'default')) {
    return null;
  }

  async function turnOn() {
    const ok = await push.enable();
    if (ok) toast.success(t('push.turnedOn'));
  }

  async function turnOff() {
    const ok = await push.disable();
    if (ok) toast.success(t('push.turnedOff'));
  }

  if (variant === 'prompt') {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-green-700/10 text-green-700">
            <BellRing aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t('push.prompt.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('push.prompt.body')}</p>
            {push.errorKey ? <p role="alert">{t(push.errorKey)}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void turnOn()} loading={push.busy}>
                {t('push.prompt.accept')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                {t('push.prompt.decline')}
              </Button>
            </div>
          </div>
          <IconButton
            label={t('common.close')}
            icon={<X aria-hidden className="size-4" />}
            size="sm"
            onClick={() => setDismissed(true)}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('push.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('push.body')}</p>
        </div>

        {blocked ? (
          <Alert tone={push.permission === 'denied' ? 'warning' : 'info'} title={t(push.blockKey)}>
            {push.block === 'unconfigured' ? (
              <Button size="sm" variant="secondary" onClick={push.retryConfiguration}>
                {t('common.retry')}
              </Button>
            ) : null}

            {push.permission === 'denied' ? t('push.denied.body') : t('push.blocked.body')}
          </Alert>
        ) : null}

        {push.permission === 'denied' && !blocked ? (
          <Alert tone="warning" title={t('push.errors.permissionDenied')}>
            {t('push.denied.body')}
          </Alert>
        ) : null}
        {push.errorKey ? (
          <Alert tone="warning" title={t(push.errorKey)}>
            <Button size="sm" onClick={push.dismissError}>
              {t('common.close')}
            </Button>
          </Alert>
        ) : null}

        <Switch
          checked={on}
          onCheckedChange={(next) => void (next ? turnOn() : turnOff())}
          label={t('push.switch.label')}
          description={
            on
              ? `${t('push.switch.on')} — ${
                  reachable === push.devices.length
                    ? deviceCountLabel(push.devices.length, language)
                    : t('push.devices.liveCount', {
                        count: reachable,
                        total: push.devices.length,
                      })
                }`
              : t('push.switch.off')
          }
          disabled={blocked || push.busy}
        />

        {push.devices.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-muted">{t('push.devices.title')}</h3>
            {staleNote !== null ? (
              <Alert tone="warning" title={t('push.devices.title')} className="mt-2">
                {staleNote}
              </Alert>
            ) : null}
            <ul className="mt-2 grid gap-2">
              {push.devices.map((device) => {
                const named = describeUserAgent(device.userAgent);
                const words = describeDeviceState(device.state, language);
                return (
                  <li
                    key={device.endpoint}
                    className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2"
                    title={t(words.key)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {named.length > 0 ? named : t('push.devices.unknown')}
                        {words.tone === 'warn' ? (
                          <Badge tone="warn" className="shrink-0">
                            {words.label}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-2xs text-muted">
                        {device.platform ?? 'web'} · {device.language.toUpperCase()} ·{' '}
                        {device.lastUsedAt !== null ? (
                          <>
                            {t('push.devices.lastUsed', {
                              when: device.lastUsedAt.slice(0, 10),
                            })}
                            {' · '}
                          </>
                        ) : (
                          <>{t('push.devices.neverUsed')} · </>
                        )}
                        <TimeAgo date={device.createdAt} />
                      </p>
                    </div>
                    <IconButton
                      label={t('push.devices.remove')}
                      icon={<X aria-hidden className="size-4" />}
                      size="sm"
                      disabled={push.busy}
                      onClick={() =>
                        void push.removeDevice(device.endpoint).then((removed) => {
                          if (removed) toast.success(t('push.deviceRemoved'));
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
