/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { ONESIGNAL_APP_ID } from './constants';

type OneSignalNamespace = {
  Slidedown: { promptPush: (opts?: { forceSlidedownOverNativePrompt?: boolean }) => Promise<void> };
  initialized?: boolean;
  User?: {
    PushSubscription?: {
      optInOnce?: () => Promise<void>;
      id?: string;
    };
  };
  Notifications?: {
    permission?: boolean;
    requestPermission?: () => Promise<boolean>;
  };
  init?: (opts: Record<string, unknown>) => Promise<void> | void;
};

declare global {
  interface Window {
    OneSignal?: OneSignalNamespace;
  }
}

let initialized = false;

/** Initialize the OneSignal Web Push SDK (loaded via script tag in index.html). */
export async function initOneSignal(): Promise<void> {
  if (initialized || !ONESIGNAL_APP_ID || typeof window === 'undefined') return;
  try {
    await waitForOneSignal(8000);
    if (window.OneSignal && !window.OneSignal.initialized) {
      await window.OneSignal.init?.({
        appId: ONESIGNAL_APP_ID,
        notifyButton: { enable: false },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: 'push',
                autoPrompt: false,
                text: {
                  actionMessage:
                    'BSDC would like to notify you about new messages, mentions and community announcements.',
                  acceptButton: 'Allow notifications',
                  cancelButton: 'Not now',
                },
              },
            ],
          },
        },
      });
      window.OneSignal.initialized = true;
    }
    initialized = true;
  } catch {
    initialized = true;
  }
}

function waitForOneSignal(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) return resolve();
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.OneSignal) {
        window.clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        reject(new Error('OneSignal SDK unavailable'));
      }
    }, 250);
  });
}

/** Non-intrusive permission prompt, invoked only after a meaningful user action. */
export async function promptPushPermission(): Promise<void> {
  await initOneSignal();
  try {
    await window.OneSignal?.Slidedown.promptPush({ forceSlidedownOverNativePrompt: true });
  } catch {
    /* user dismissed — respected silently */
  }
}

export function getOneSignalPlayerId(): string {
  return window.OneSignal?.User?.PushSubscription?.id || '';
}
