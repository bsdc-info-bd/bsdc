import { BellRing, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Alert, Button, Card, IconButton, Switch, TimeAgo } from '@/design-system';
import { useErrorToast } from '@/hooks/use-error-toast';
import { usePush } from '@/hooks/use-push';
import { describeUserAgent, deviceCountLabel } from '@/lib/push/support';

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

  useErrorToast(push.errorKey, push.dismissError, { title: t('push.title') });

  const language = i18n.language === 'en' ? 'en' : 'bn';
  const blocked = push.block !== 'ok';
  const on = push.permission === 'granted' && push.devices.length > 0;

  if (variant === 'prompt' && (dismissed || blocked || push.permission !== 'default')) {
    return null;
  }

  async function turnOn() {
    await push.enable();
    if (globalThis.Notification?.permission === 'granted') toast.success(t('push.turnedOn'));
  }

  async function turnOff() {
    await push.disable();
    toast.success(t('push.turnedOff'));
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
            <p className="mt-1 text-body-sm text-ink-2">{t('push.prompt.body')}</p>
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
          <p className="mt-1 text-body-sm text-ink-2">{t('push.body')}</p>
        </div>

        {blocked ? (
          <Alert tone={push.permission === 'denied' ? 'warning' : 'info'} title={t(push.blockKey)}>
            {push.permission === 'denied' ? t('push.denied.body') : t('push.blocked.body')}
          </Alert>
        ) : null}

        <Switch
          checked={on}
          onCheckedChange={(next) => void (next ? turnOn() : turnOff())}
          label={t('push.switch.label')}
          description={
            on
              ? `${t('push.switch.on')} — ${deviceCountLabel(push.devices.length, language)}`
              : t('push.switch.off')
          }
          disabled={blocked || push.busy}
        />

        {push.devices.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-ink-2">{t('push.devices.title')}</h3>
            <ul className="mt-2 grid gap-2">
              {push.devices.map((device) => {
                const named = describeUserAgent(device.userAgent);
                return (
                  <li
                    key={device.endpoint}
                    className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {named.length > 0 ? named : t('push.devices.unknown')}
                      </p>
                      <p className="text-2xs text-ink-3">
                        <TimeAgo date={device.createdAt} />
                      </p>
                    </div>
                    <IconButton
                      label={t('push.devices.remove')}
                      icon={<X aria-hidden className="size-4" />}
                      size="sm"
                      disabled={push.busy}
                      onClick={() =>
                        void push.removeDevice(device.endpoint).then(() => {
                          toast.success(t('push.deviceRemoved'));
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
