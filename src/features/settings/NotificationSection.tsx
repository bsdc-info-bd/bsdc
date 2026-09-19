/**
 * BSDC — src/features/settings/NotificationSection.tsx
 * Purpose : Which notifications arrive, on which channel, and when they are held back.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Thirteen types across three channels is 39 switches, so the screen offers a row per
 *   type and a switch per channel rather than a wall of prose. Quiet hours are stored in whole
 *   hours in the person's own day, and the window may cross midnight.
 *   Two types are deliberately not switchable off on the push channel: a moderation decision about
 *   your own content and an account-security notice. A platform that lets you silence the message
 *   saying your post was removed is a platform that removes posts silently.
 *   Preferences are stored per account and follow the person between devices; this device's copy is
 *   only the first paint.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, CardBody, CardHeader, CardTitle, Select, Switch, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { NotificationType } from '@/core/config/notifications';
import {
  CHANNELS,
  DEFAULT_QUIET_HOURS,
  channelsFor,
  defaultPreferences,
  isQuietHour,
  preferenceTypes,
  type Channel,
  type ChannelSwitches,
  type NotificationPreferences,
  type QuietHours,
} from '@/services/notifications/preferences';
import { loadSetting, saveSetting, watchSetting } from '@/entities/settings/repository';

/** What one settings document holds. */
export interface NotificationSetting {
  readonly preferences: NotificationPreferences;
  readonly quiet: QuietHours;
}

/** Types whose push channel a person may not switch off. */
const ALWAYS_PUSH: readonly string[] = ['moderation', 'system'];

/** Props for the notification section. */
export interface NotificationSectionProps {
  readonly uid: string;
  readonly locale: Locale;
}

/**
 * Renders the notification preferences.
 * @param props component props
 * @returns the section element
 */
export function NotificationSection({ uid, locale }: NotificationSectionProps): React.ReactElement {
  const { t } = useTranslation('settings');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const fallback = useMemo<NotificationSetting>(
    () => ({ preferences: defaultPreferences(), quiet: DEFAULT_QUIET_HOURS }),
    [],
  );
  const [value, setValue] = useState<NotificationSetting>(fallback);
  const [source, setSource] = useState<'remote' | 'local' | 'default'>('default');

  useEffect(() => {
    let active = true;
    void loadSetting<NotificationSetting>(uid, 'notifications', fallback).then((read) => {
      if (!active) return;
      setValue(read.value);
      setSource(read.source);
    });
    const release = watchSetting<NotificationSetting>(uid, 'notifications', fallback, (next) => {
      if (active) setValue(next);
    });
    return () => {
      active = false;
      release();
    };
  }, [uid, fallback]);

  /**
   * Writes the whole document. Preferences are small and rarely change together, so one document
   * and one write beats a write per switch and a half-applied state when the network drops.
   */
  async function commit(next: NotificationSetting): Promise<void> {
    setValue(next);
    const synced = await saveSetting(uid, 'notifications', 'notifications', next);
    setSource(synced ? 'remote' : 'local');
  }

  function setChannel(type: NotificationType, channel: Channel, on: boolean): void {
    const switches = channelsFor(value.preferences, type);
    void commit({
      ...value,
      preferences: {
        ...value.preferences,
        [type]: { ...switches, [channel]: on },
      },
    });
  }

  const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: t('notifications.hour', { hour }),
  }));

  return (
    <Card as="section" padding="md">
      <CardHeader>
        <CardTitle>{t('notifications.title')}</CardTitle>
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('notifications.subtitle')}
        </Text>
      </CardHeader>
      <CardBody className="bsdc-settings__body">
        <div
          className="bsdc-settings__switchGrid"
          role="group"
          aria-label={t('notifications.gridLabel')}
        >
          <span className="bsdc-settings__switchGridHead" aria-hidden="true" />
          {CHANNELS.map((channel) => (
            <span key={channel} className="bsdc-settings__switchGridHead" lang={lang}>
              {t(`notifications.channel.${channel}`)}
            </span>
          ))}
          {preferenceTypes().map((type) => {
            const switches: ChannelSwitches = channelsFor(value.preferences, type);
            return (
              <div key={type} className="bsdc-settings__switchRow">
                <span className="bsdc-settings__switchLabel" lang={lang}>
                  {t(`notifications.type.${type}`)}
                </span>
                {CHANNELS.map((channel) => (
                  <Switch
                    key={channel}
                    size="sm"
                    checked={switches[channel]}
                    disabled={channel === 'push' && ALWAYS_PUSH.includes(type)}
                    onCheckedChange={(on) => setChannel(type, channel, on)}
                    label={`${t(`notifications.type.${type}`)} — ${t(`notifications.channel.${channel}`)}`}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div className="bsdc-settings__quiet">
          <Switch
            checked={value.quiet.enabled}
            onCheckedChange={(enabled) =>
              void commit({ ...value, quiet: { ...value.quiet, enabled } })
            }
            label={t('notifications.quiet')}
            description={t('notifications.quietNote')}
          />
          <div className="bsdc-settings__quietHours">
            <Select<string>
              value={String(value.quiet.startHour)}
              onValueChange={(next) =>
                void commit({ ...value, quiet: { ...value.quiet, startHour: Number(next) } })
              }
              options={hourOptions}
              label={t('notifications.quietStart')}
              disabled={!value.quiet.enabled}
            />
            <Select<string>
              value={String(value.quiet.endHour)}
              onValueChange={(next) =>
                void commit({ ...value, quiet: { ...value.quiet, endHour: Number(next) } })
              }
              options={hourOptions}
              label={t('notifications.quietEnd')}
              disabled={!value.quiet.enabled}
            />
          </div>
          {value.quiet.enabled ? (
            <Badge tone="neutral" variant="outline">
              {isQuietHour(value.quiet, new Date().getHours())
                ? t('notifications.quietNow')
                : t('notifications.quietLater')}
            </Badge>
          ) : null}
        </div>

        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t(`notifications.source.${source}`)}
        </Text>
      </CardBody>
    </Card>
  );
}
