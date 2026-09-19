/**
 * BSDC — src/features/pwa/useInstallPrompt.ts
 * Purpose : Captures the browser's install offer so the platform can make it in its own words.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The browser decides when an app is installable and will only say so once, through an
 *   event that is easy to miss. This hook catches that event and holds it, so the offer can be made
 *   when a person has actually used the platform rather than in the first second of a first visit.
 *   A refusal is remembered: an install prompt that comes back every visit is a nag, and a platform
 *   that nags gets uninstalled. The memory is local and holds for sixty days.
 *   Safari and Firefox do not fire the event at all. On those browsers the hook reports that there
 *   is nothing to offer rather than showing a button that does nothing.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from '@/shared/lib/storage';

/** The shape Chromium hands us. Only the two members we use are read. */
interface InstallEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/** How long a refusal is remembered, in days. */
const COOLDOWN_DAYS = 60;

/** Storage key holding the ISO instant of the last refusal. */
const DISMISS_KEY = 'pwa:install-dismissed-at';

/** Result of the install hook. */
export interface UseInstallPromptResult {
  /** True when the browser has made an offer and the cooldown has passed. */
  readonly canInstall: boolean;
  /** True once the application is already running as an installed app. */
  readonly installed: boolean;
  /**
   * Shows the browser's install dialog.
   * @returns whether the person accepted
   */
  readonly install: () => Promise<boolean>;
  /** Refuses the offer and remembers the refusal. */
  readonly dismiss: () => void;
}

/**
 * Whether the application is already running installed, which makes any offer pointless.
 * @returns true when displayed standalone or from a Capacitor shell
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const ios = 'standalone' in window.navigator && window.navigator.standalone === true;
  return displayMode.matches || ios;
}

/**
 * Whether a remembered refusal is still inside its cooldown.
 * @returns true when the offer should stay hidden
 */
function withinCooldown(): boolean {
  const at = readJson<string | null>(DISMISS_KEY, null);
  if (at === null) return false;
  const elapsed = Date.now() - Date.parse(at);
  if (Number.isNaN(elapsed)) return false;
  return elapsed < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Tracks the browser's install offer.
 * @returns whether the offer can be made, and the actions to make or refuse it
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [refused, setRefused] = useState<boolean>(() => withinCooldown());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOffer = (event: Event): void => {
      // Without preventDefault the browser shows its own prompt immediately, at a moment of its
      // choosing, which is the whole thing this hook exists to avoid.
      event.preventDefault();
      setOffer(event as InstallEvent);
    };
    const onInstalled = (): void => setInstalled(true);

    window.addEventListener('beforeinstallprompt', onOffer);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onOffer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (offer === null) return false;
    await offer.prompt();
    const choice = await offer.userChoice;
    setOffer(null);
    return choice.outcome === 'accepted';
  }, [offer]);

  const dismiss = useCallback((): void => {
    writeJson(DISMISS_KEY, new Date().toISOString());
    setRefused(true);
  }, []);

  return { canInstall: offer !== null && !installed && !refused, installed, install, dismiss };
}
