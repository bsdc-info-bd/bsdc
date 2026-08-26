/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Permission onboarding — the moment BSDC actually ASKS.
 *
 * Browsers only show the native permission prompts from an explicit user
 * gesture; previously BSDC never asked, so the prompts never appeared. This
 * welcome card fires the REAL browser dialogs (Notifications, Location,
 * Microphone) from real button taps — once automatically after sign-in,
 * on demand from Settings, or automatically when opened standalone via
 * ?bsdc-permissions=1 (escaping embedded-preview iframes).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Check, ShieldCheck, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { inIframe, openPermissionsStandalone } from '@/lib/permissions';
import {
  getNotificationState, registerWebPush, requestNotificationPermission, sendTestNotification,
} from '@/lib/pushNotifications';
import { PermissionSoftPrompt } from '@/components/permissions/PermissionSoftPrompt';

const STORAGE_KEY = 'bsdc-perm-onboarding';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function shouldAutoShow(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const state = JSON.parse(raw) as { skipped?: boolean; snoozedAt?: number };
    if (state.skipped) return false;
    if (state.snoozedAt && Date.now() - state.snoozedAt < SNOOZE_MS) return false;
    return true;
  } catch {
    return true;
  }
}

function markSnooze(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ snoozedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

function markSkipped(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ skipped: true }));
  } catch {
    /* ignore */
  }
}

export function PermissionOnboarding() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [notifState, setNotifState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [busy, setBusy] = useState<'notifications' | null>(null);
  const [embedded] = useState(() => inIframe());
  void profile;

  // Auto-show after first paint (signed in OR out) or when opened standalone
  // with the flag. Snooze lapses re-show — the FAB is always available too.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('bsdc-permissions') === '1';
    if (forced) {
      setOpen(true);
      return;
    }
    if (!shouldAutoShow()) return;
    const timer = setTimeout(() => setOpen(true), 3000);
    return () => clearTimeout(timer);
  }, [profile?.uid]);

  // On demand from Settings (or anywhere) via a custom event.
  useEffect(() => {
    const openNow = () => setOpen(true);
    window.addEventListener('bsdc:open-permissions', openNow);
    return () => window.removeEventListener('bsdc:open-permissions', openNow);
  }, []);

  // Live statuses.
  useEffect(() => {
    if (!open) return;
    setNotifState(getNotificationState());
  }, [open]);

  async function askNotifications() {
    setBusy('notifications');
    try {
      const state = await requestNotificationPermission();
      setNotifState(state);
      if (state === 'granted') {
        toast.success(t('settings.permGranted', { name: t('settings.permNotifications') }));
        // Real Web Push registration (FCM token) + a live test notification.
        if (profile) void registerWebPush(profile.uid);
        void sendTestNotification();
      } else if (state === 'denied') {
        toast.error(t('settings.permDeniedHint'), { duration: 8000 });
      }
    } finally {
      setBusy(null);
    }
  }




  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) markSnooze();
      }}
      title={t('settings.onboardingTitle')}
      description={t('settings.onboardingDesc')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => { markSkipped(); setOpen(false); }}>
            {t('settings.onboardingSkip')}
          </Button>
          <Button variant="outline" onClick={() => { markSnooze(); setOpen(false); }}>
            {t('settings.onboardingLater')}
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        {embedded ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{t('settings.onboardingIframeTitle')}</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">{t('settings.onboardingIframeDesc')}</p>
              <Button size="xs" variant="outline" className="mt-2" onClick={openPermissionsStandalone}>
                {t('settings.permOpenTab')}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Notifications — real native prompt + Web Push registration + live test */}
        <div className="flex items-center gap-3 rounded-2xl border border-surface-light-border p-4 dark:border-surface-dark-border">
          <span className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            notifState === 'granted'
              ? 'bg-green-100 text-green-600 dark:bg-green-950/60 dark:text-green-400'
              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
          )}>
            <Bell className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-bold">
              {t('settings.permNotifications')}
              {notifState === 'granted' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-950/60 dark:text-green-300">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> {t('settings.permAllowed')}
                </span>
              ) : null}
            </span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">{t('settings.permNotifDesc')}</span>
          </span>
          {notifState === 'granted' ? (
            <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" aria-hidden />
            </span>
          ) : (
            <Button size="sm" loading={busy === 'notifications'} onClick={() => void askNotifications()} icon={<Sparkles className="h-4 w-4" aria-hidden />}>
              {t('settings.onboardingAsk')}
            </Button>
          )}
        </div>

        {/* Microphone + Location — the soft prompt explains WHY, then asks for real */}
        <PermissionSoftPrompt />
      </div>
    </Modal>
  );
}
