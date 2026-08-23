/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/** Live permission status row: real PermissionStatus, one-tap request, iframe guidance. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MapPin, Bell, ShieldCheck, ShieldAlert, ShieldQuestion, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  inIframe, openStandalone, queryPermission, requestLocation, requestMicrophone,
  requestNotifications, watchPermission, type PermissionKind, type PermissionStateInfo,
} from '@/lib/permissions';

const META: Record<PermissionKind, { labelKey: string; icon: typeof Mic }> = {
  microphone: { labelKey: 'settings.permMic', icon: Mic },
  geolocation: { labelKey: 'settings.permLocation', icon: MapPin },
  notifications: { labelKey: 'settings.permNotifications', icon: Bell },
};

export function PermissionRow({ kind }: { kind: PermissionKind }) {
  const { t } = useTranslation();
  const [state, setState] = useState<PermissionStateInfo>('prompt');
  const [busy, setBusy] = useState(false);
  const embedded = inIframe();

  useEffect(() => {
    void queryPermission(kind).then(setState);
    void watchPermission(kind, setState);
  }, [kind]);

  async function request() {
    setBusy(true);
    try {
      if (kind === 'notifications') {
        const p = await requestNotifications();
        setState(p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt');
      } else if (kind === 'microphone') {
        const stream = await requestMicrophone();
        stream.getTracks().forEach((track) => track.stop());
        setState('granted');
      } else {
        await requestLocation();
        setState('granted');
      }
      toast.success(t('settings.permGranted', { name: t(META[kind].labelKey) }));
    } catch {
      setState('denied');
      toast.error(t('settings.permDeniedHint'));
    } finally {
      setBusy(false);
    }
  }

  const Icon = META[kind].icon;
  const badge =
    state === 'granted' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-950/60 dark:text-green-300">
        <ShieldCheck className="h-3 w-3" aria-hidden /> {t('settings.permAllowed')}
      </span>
    ) : state === 'denied' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
        <ShieldAlert className="h-3 w-3" aria-hidden /> {t('settings.permBlocked')}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        <ShieldQuestion className="h-3 w-3" aria-hidden /> {t('settings.permAsk')}
      </span>
    );

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', state === 'granted' ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400' : 'bg-neutral-100 text-neutral-500 dark:bg-surface-dark-raised')}>
        <Icon style={{ width: 18, height: 18 }} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {t(META[kind].labelKey)}
          {badge}
        </span>
        {embedded && state !== 'granted' ? (
          <button type="button" onClick={openStandalone} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            <ExternalLink className="h-3 w-3" aria-hidden />
            {t('settings.permOpenTab')}
          </button>
        ) : null}
      </span>
      {state === 'granted' ? (
        <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {t('settings.permReady')}
        </span>
      ) : (
        <Button size="sm" variant="outline" loading={busy} onClick={() => void request()} disabled={state === 'denied' && !embedded}>
          {t('settings.permRequest')}
        </Button>
      )}
    </div>
  );
}
