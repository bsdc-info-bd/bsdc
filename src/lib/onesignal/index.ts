import { config, isOneSignalConfigured } from '@/config';

let isInitialized = false;

export const initOneSignal = async (): Promise<void> => {
  if (isInitialized || !isOneSignalConfigured()) return;

  try {
    // Load OneSignal SDK via script tag
    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.async = true;
    document.head.appendChild(script);

    await new Promise<void>((resolve) => {
      script.onload = () => resolve();
      script.onerror = () => resolve(); // Don't block on failure
    });

    const OneSignal = (window as unknown as Record<string, unknown>).OneSignal as
      | { init: (config: Record<string, unknown>) => void }
      | undefined;
    if (OneSignal) {
      OneSignal.init({
        appId: config.onesignal.appId,
        allowLocalhostAsSecureOrigin: import.meta.env.DEV,
      });
      isInitialized = true;
    }
  } catch (error) {
    console.warn('[BSDC] OneSignal initialization failed:', error);
  }
};

export const subscribeToNotifications = async (): Promise<boolean> => {
  if (!isInitialized) return false;
  try {
    const OneSignal = (window as unknown as Record<string, unknown>).OneSignal as Record<string, unknown> | undefined;
    if (!OneSignal) return false;
    const user = OneSignal.User as Record<string, unknown> | undefined;
    const push = user?.PushSubscription as Record<string, unknown> | undefined;
    if (push?.optIn) await (push.optIn as () => Promise<void>)();
    return true;
  } catch {
    return false;
  }
};

export const unsubscribeFromNotifications = async (): Promise<void> => {
  if (!isInitialized) return;
  try {
    const OneSignal = (window as unknown as Record<string, unknown>).OneSignal as Record<string, unknown> | undefined;
    if (!OneSignal) return;
    const user = OneSignal.User as Record<string, unknown> | undefined;
    const push = user?.PushSubscription as Record<string, unknown> | undefined;
    if (push?.optOut) await (push.optOut as () => Promise<void>)();
  } catch {
    // Silent fail
  }
};

export const getSubscriptionState = async (): Promise<boolean> => {
  if (!isInitialized) return false;
  try {
    const OneSignal = (window as unknown as Record<string, unknown>).OneSignal as Record<string, unknown> | undefined;
    if (!OneSignal) return false;
    const user = OneSignal.User as Record<string, unknown> | undefined;
    const push = user?.PushSubscription as Record<string, unknown> | undefined;
    return Boolean(push?.optedIn);
  } catch {
    return false;
  }
};

export const setExternalUserId = async (userId: string): Promise<void> => {
  if (!isInitialized) return;
  try {
    const OneSignal = (window as unknown as Record<string, unknown>).OneSignal as Record<string, unknown> | undefined;
    if (!OneSignal?.login) return;
    await (OneSignal.login as (id: string) => Promise<void>)(userId);
  } catch {
    // Silent fail
  }
};

export const removeExternalUserId = async (): Promise<void> => {
  if (!isInitialized) return;
  try {
    const OneSignal = (window as unknown as Record<string, unknown>).OneSignal as Record<string, unknown> | undefined;
    if (!OneSignal?.logout) return;
    await (OneSignal.logout as () => Promise<void>)();
  } catch {
    // Silent fail
  }
};
