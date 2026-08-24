/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * PermissionSoftPrompt — the "soft prompt" pre-permission UX.
 *
 * Flow: explain WHY → user taps Allow → the REAL native browser dialog fires
 * (from the genuine gesture) → live status reflects granted/denied. When the
 * permission is blocked permanently or hardware is missing, a recovery panel
 * shows exact per-browser manual-enable steps.
 */
import { Mic, MapPin, Loader2, Check, X, ShieldCheck, ShieldAlert, MonitorSmartphone, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAppPermissions, type PermissionStatus } from '@/hooks/useAppPermissions';
import { openPermissionsStandalone, inIframe } from '@/lib/permissions';
import { Button } from '@/components/ui/Button';

export interface SoftPromptStrings {
  micWhy: string;
  micFeature: string;
  locWhy: string;
  locFeature: string;
  allow: string;
  granted: string;
  retry: string;
}

export function PermissionSoftPrompt({ strings }: { strings?: Partial<SoftPromptStrings> }) {
  const { t } = useTranslation();
  const { microphone, location, requestMicrophone, requestLocation } = useAppPermissions();
  const copy: SoftPromptStrings = {
    micWhy: t('perms.micWhy'),
    micFeature: t('perms.micFeature'),
    locWhy: t('perms.locWhy'),
    locFeature: t('perms.locFeature'),
    allow: t('perms.allow'),
    granted: t('perms.granted'),
    retry: t('perms.retry'),
    ...strings,
  };

  return (
    <div className="space-y-3">
      <SoftPromptCard
        domain="microphone"
        icon={<Mic className="h-5 w-5" aria-hidden />}
        accent="bg-fb-50 text-fb-600 dark:bg-fb-950/50 dark:text-fb-300"
        title={t('settings.permMic')}
        why={copy.micWhy}
        feature={copy.micFeature}
        status={microphone}
        onRequest={() => void requestMicrophone()}
        allowLabel={copy.allow}
        grantedLabel={copy.granted}
        retryLabel={copy.retry}
      />
      <SoftPromptCard
        domain="geolocation"
        icon={<MapPin className="h-5 w-5" aria-hidden />}
        accent="bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300"
        title={t('settings.permLocation')}
        why={copy.locWhy}
        feature={copy.locFeature}
        status={location}
        onRequest={() => void requestLocation()}
        allowLabel={copy.allow}
        grantedLabel={copy.granted}
        retryLabel={copy.retry}
      />
      <p className="text-center text-[11px] leading-relaxed text-neutral-400">{t('perms.privacy')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function SoftPromptCard({
  domain,
  icon,
  accent,
  title,
  why,
  feature,
  status,
  onRequest,
  allowLabel,
  grantedLabel,
  retryLabel,
}: {
  domain: 'microphone' | 'geolocation';
  icon: React.ReactNode;
  accent: string;
  title: string;
  why: string;
  feature: string;
  status: PermissionStatus;
  onRequest: () => void;
  allowLabel: string;
  grantedLabel: string;
  retryLabel: string;
}) {
  const granted = status.state === 'granted';
  const pending = status.state === 'pending';
  const denied = status.state === 'denied';

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-all duration-300',
        granted
          ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
          : denied
            ? 'border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20'
            : 'border-surface-light-border bg-white dark:border-surface-dark-border dark:bg-surface-dark-muted',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', granted ? 'bg-green-100 text-green-600 dark:bg-green-950/60 dark:text-green-400' : accent)}>
          {granted ? <ShieldCheck className="h-5 w-5" aria-hidden /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">{title}{granted ? <GrantedChip label={grantedLabel} /> : null}</h3>
          {/* The WHY — shown BEFORE the native prompt */}
          <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{why}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400">
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {feature}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {granted ? null : (
          <Button size="sm" onClick={onRequest} disabled={pending} icon={pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : undefined}>
            {pending ? t0() : denied ? retryLabel : allowLabel}
          </Button>
        )}
        {inIframe() && !granted ? (
          <Button size="sm" variant="outline" icon={<ExternalLink className="h-4 w-4" aria-hidden />} onClick={openPermissionsStandalone}>
            {t1()}
          </Button>
        ) : null}
      </div>

      {denied && status.failure ? <DenialFallback domain={domain} failure={status.failure} message={status.message} /> : null}
    </div>
  );
}

function GrantedChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:bg-green-950/60 dark:text-green-300">
      <Check className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

/* -------------------------------------------------------- denial fallback */

const BROWSER_STEPS_MIC = [
  { browser: 'Chrome / Edge', steps: 'Padlock (or tune icon) left of the address bar → Site settings → Microphone → Allow → Reload' },
  { browser: 'Firefox', steps: 'Padlock in the address bar → Clear this permission (the “x”) → Reload → Allow' },
  { browser: 'Safari (macOS)', steps: 'Safari → Settings → Websites → Microphone → set bsdc.info.bd to Allow' },
  { browser: 'Safari (iOS)', steps: 'Settings app → Safari → Microphone → Allow, or the “aa” icon in the address bar → Website Settings' },
];

const BROWSER_STEPS_LOC = [
  { browser: 'Chrome / Edge', steps: 'Padlock left of the address bar → Site settings → Location → Allow → Reload' },
  { browser: 'Firefox', steps: 'Padlock in the address bar → Clear the Location permission → Reload → Allow' },
  { browser: 'Safari (macOS)', steps: 'Safari → Settings → Websites → Location → set bsdc.info.bd to Allow' },
  { browser: 'Safari (iOS)', steps: 'Settings app → Privacy & Security → Location Services → Safari → While Using' },
];

function DenialFallback({ domain, failure, message }: { domain: 'microphone' | 'geolocation'; failure: string; message: string }) {
  const { t } = useTranslation();
  const steps = domain === 'microphone' ? BROWSER_STEPS_MIC : BROWSER_STEPS_LOC;
  return (
    <div className="mt-3 rounded-xl border border-red-200/70 bg-white p-3 dark:border-red-900/60 dark:bg-surface-dark-raised/60">
      <p className="flex items-start gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {message}
      </p>
      {failure === 'no-device' ? (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {domain === 'microphone'
            ? 'Connect a microphone (or check that another app is not exclusively using it), then retry.'
            : 'Make sure location services are enabled in your device settings, then retry.'}
        </p>
      ) : failure === 'iframe' ? (
        <Button size="xs" variant="outline" className="mt-2" icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />} onClick={openPermissionsStandalone}>
          {t('settings.permOpenTab')}
        </Button>
      ) : failure === 'blocked' || failure === 'user-denied' ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-neutral-600 dark:text-neutral-300">{t('perms.manualSteps')}</summary>
          <ul className="mt-2 space-y-2">
            {steps.map((entry) => (
              <li key={entry.browser} className="text-xs leading-relaxed">
                <span className="font-bold text-neutral-700 dark:text-neutral-200">{entry.browser}:</span>{' '}
                <span className="text-neutral-500 dark:text-neutral-400">{entry.steps}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {failure === 'unknown' ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-neutral-400">
          <X className="h-3 w-3" aria-hidden />
          {t('perms.retryLater')}
        </p>
      ) : null}
    </div>
  );
}

/* tiny localizers to avoid re-render loops with i18n keys in props */
function t0(): string {
  return 'Asking…';
}
function t1(): string {
  return 'Open in new tab';
}
