/**
 * Turning push on, and knowing whether it can be turned on at all.
 *
 * The permission is asked for by a member pressing a button, never on load: a
 * prompt with no reason behind it gets dismissed, and a dismissed prompt is a
 * permission lost for good in most browsers. What does happen on load, silently,
 * is a re-registration of whatever subscription this browser already holds —
 * because a browser rotates its push keys after an update or a restored profile,
 * and a subscription that was recorded once and never refreshed quietly stops
 * being deliverable.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isConfigured } from '@/lib/env';
import {
  PUSH_BLOCK_KEYS,
  describePushEnvironment,
  readPushEnvironment,
  type PushBlock,
} from '@/lib/push/support';
import { uint8ArrayToUrlBase64, urlBase64ToUint8Array } from '@/lib/push/webpush';
import type { PushDevice } from '@/lib/push/push-repository';
import { dataErrorKey } from '@/lib/supabase/errors';
import { resolvePushConfig } from '@/lib/push/push-config';
import { readyServiceWorker } from '@/lib/push/ready-worker';
import {
  browserErrorName,
  recordPushAttempt,
  pushRegistrationErrorKey,
  PushStageError,
} from '@/lib/push/push-registration-error';
import { useAuthStore } from '@/store/auth-store';

// The repository pulls in the Supabase client, so it is imported lazily: this
// hook runs in the settings page and in the notifications page, neither of which
// should drag the SDK along for a member who never touches push.
const repository = () => import('@/lib/push/push-repository');
const fcmClient = () => import('@/lib/push/fcm');

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushControl {
  /** Why push cannot be used here, or `'ok'`. */
  block: PushBlock;
  /** How many devices a notification could actually reach right now. */
  liveDevices: number;
  /** The sentence for `block`, so a page can show it without a lookup. */
  blockKey: string;
  permission: PushPermission;
  devices: PushDevice[];
  busy: boolean;
  errorKey: string | null;
  dismissError: () => void;
  retryConfiguration: () => void;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  removeDevice: (endpoint: string) => Promise<boolean>;
}

function optedOut(uid: string): boolean {
  try {
    return localStorage.getItem(`bsdc.push.off.${uid}`) === '1';
  } catch {
    return false;
  }
}

function setOptOut(uid: string, off: boolean): void {
  try {
    const key = `bsdc.push.off.${uid}`;
    if (off) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Server-side device removal still works when browser storage is disabled.
  }
}

/** Reads the subscription this browser already holds, asking for nothing. */
async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await readyServiceWorker();
  if (registration === null) return null;
  return registration.pushManager.getSubscription();
}

function sameServerKey(existing: PushSubscription, expectedPublicKey: string): boolean {
  const appKey = existing.options?.applicationServerKey;
  if (!appKey) return true;
  try {
    const actual = uint8ArrayToUrlBase64(new Uint8Array(appKey));
    const expected = uint8ArrayToUrlBase64(urlBase64ToUint8Array(expectedPublicKey));
    return actual === expected;
  } catch {
    return true;
  }
}

async function subscribeHere(
  publicKey: string,
  store?: Awaited<ReturnType<typeof repository>>,
): Promise<PushSubscription | null> {
  const registration = await readyServiceWorker();
  if (registration === null) throw new PushStageError('swNotReady');

  const existing = await registration.pushManager.getSubscription();
  if (existing !== null) {
    if (sameServerKey(existing, publicKey)) return existing;
    const oldEndpoint = existing.endpoint;
    await existing.unsubscribe().catch(() => false);
    if (store && oldEndpoint) {
      await store.unregisterPushSubscription(oldEndpoint).catch(() => undefined);
    }
  }

  const keyBytes = urlBase64ToUint8Array(publicKey);
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });
  } catch (error) {
    if (browserErrorName(error) === 'AbortError') {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes,
      });
    }
    if (
      browserErrorName(error) === 'InvalidStateError' ||
      (error instanceof Error && error.message.includes('applicationServerKey'))
    ) {
      const stale = await registration.pushManager.getSubscription().catch(() => null);
      if (stale !== null) {
        await stale.unsubscribe();
        if (store) await store.unregisterPushSubscription(stale.endpoint);
      }
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes,
      });
    }
    throw error;
  }
}

async function registerCurrentBrowser(
  uid: string,
  language: string,
  config: { mode: 'webpush' | 'fcm'; publicKey: string } | null,
): Promise<boolean> {
  if (config === null) throw new PushStageError('configUnavailable');
  const store = await repository();
  let stage: 'subscribeRefused' | 'fcmTokenFailed' | 'registerRpcFailed' =
    config.mode === 'fcm' ? 'fcmTokenFailed' : 'subscribeRefused';
  try {
    if (globalThis.navigator.onLine === false) throw new PushStageError('networkOffline');
    if (config.mode === 'webpush') {
      const subscription = await subscribeHere(config.publicKey, store);
      if (subscription === null) throw new PushStageError('swNotReady');
      stage = 'registerRpcFailed';
      await store.registerPushSubscription(subscription, language, globalThis.navigator.userAgent);
    } else {
      const fcm = await fcmClient();
      const registration = await readyServiceWorker();
      if (registration === null) throw new PushStageError('swNotReady');
      const token = await fcm.getFcmBrowserToken(config.publicKey, registration);
      const lang = language === 'en' ? 'en' : 'bn';
      stage = 'registerRpcFailed';
      const hash = await store.registerFcmToken(token, 'web', lang, globalThis.navigator.userAgent);
      if (!hash) throw new Error('register_fcm_token returned no hash');
      const previous = fcm.readRegisteredFcmHash(uid);
      if (previous && previous !== hash) {
        await store.forgetFcmDevice(previous);
        void fcm.removeFcmTokenFromFirestore(uid, previous);
      }
      fcm.writeRegisteredFcmHash(uid, hash);
      void fcm.syncFcmTokenToFirestore(uid, hash, 'web', lang);
    }
    recordPushAttempt(config.mode, 'registered');
    return true;
  } catch (error) {
    const failure = error instanceof PushStageError ? error : new PushStageError(stage, error);
    recordPushAttempt(config.mode, pushRegistrationErrorKey(failure), error);
    throw failure;
  }
}

export function usePush(): PushControl {
  const { i18n } = useTranslation();
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const [block, setBlock] = useState<PushBlock>('unconfigured');
  const [permission, setPermission] = useState<PushPermission>('default');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // One silent re-registration per page load, per member.
  const refreshedFor = useRef<string | null>(null);

  const runtimeQuery = useQuery({
    queryKey: ['push-runtime-config'],
    queryFn: resolvePushConfig,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const pushConfig = runtimeQuery.data ?? null;
  const activeKey = pushConfig?.publicKey ?? '';

  const devicesQuery = useQuery({
    queryKey: ['push-devices', uid],
    queryFn: async () => (await repository()).fetchAllPushDevices(),
    enabled: uid !== null,
    staleTime: 60_000,
  });

  // A service worker can wake for pushsubscriptionchange while this page is
  // already open. It cannot authenticate to Supabase itself, so it asks the
  // signed-in page to persist the replacement; the usual mount-time refresh
  // handles the same change the next time a closed browser is opened.
  useEffect(() => {
    if (uid === null || pushConfig === null || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (
        typeof event.data !== 'object' ||
        event.data === null ||
        !('type' in event.data) ||
        event.data.type !== 'BSDC_PUSH_SUBSCRIPTION_CHANGED'
      )
        return;
      if (optedOut(uid)) return;
      void registerCurrentBrowser(uid, i18n.language, pushConfig)
        .then((registered) =>
          registered
            ? queryClient.invalidateQueries({ queryKey: ['push-devices', uid] })
            : undefined,
        )
        .catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [uid, i18n.language, pushConfig, queryClient]);

  useEffect(() => {
    const described = describePushEnvironment(readPushEnvironment(activeKey));
    setBlock(described.block);
    if (!described.supported) {
      setPermission('unsupported');
      return;
    }

    const asked = globalThis.Notification.permission;
    setPermission(asked);

    if (uid === null) {
      refreshedFor.current = null;
      return;
    }
    const syncKey = `${uid}:${i18n.language === 'en' ? 'en' : 'bn'}`;
    if (asked !== 'granted' || optedOut(uid) || refreshedFor.current === syncKey) return;
    refreshedFor.current = syncKey;

    void (async () => {
      try {
        const registered = await registerCurrentBrowser(uid, i18n.language, pushConfig);
        if (registered) {
          await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
        }
      } catch {
        // A key that rotated while the site was closed and a permission that was
        // withdrawn both land here. The member is not told: nothing was asked of
        // them, and the button is still there when they want it.
      }
    })();
  }, [uid, i18n.language, queryClient, activeKey, pushConfig]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (uid === null) {
      setErrorKey('data.errors.signInRequired');
      return false;
    }
    if (block !== 'ok') {
      setErrorKey(
        block === 'unconfigured' ? 'push.errors.configUnavailable' : PUSH_BLOCK_KEYS[block],
      );
      return false;
    }
    setBusy(true);
    try {
      const asked = await globalThis.Notification.requestPermission();
      setPermission(asked);
      if (asked !== 'granted') {
        setErrorKey('push.errors.permissionDenied');
        return false;
      }
      const registered = await registerCurrentBrowser(uid, i18n.language, pushConfig);
      if (!registered) {
        setErrorKey('push.errors.failed');
        return false;
      }
      setOptOut(uid, false);
      refreshedFor.current = `${uid}:${i18n.language === 'en' ? 'en' : 'bn'}`;
      setErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
      return true;
    } catch (error) {
      setErrorKey(pushRegistrationErrorKey(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [uid, block, i18n.language, queryClient, pushConfig]);

  const disable = useCallback(async (): Promise<boolean> => {
    if (uid === null) return false;
    setBusy(true);
    try {
      // Reading only: a "turn off" that had to subscribe first would be a
      // permission prompt on the way out.
      const subscription = block === 'ok' ? await currentSubscription().catch(() => null) : null;
      const store = await repository();
      const endpoints = new Set<string>();
      const fcmHashes = new Set<string>();
      for (const device of devicesQuery.data ?? []) {
        if (device.endpoint.startsWith(store.FCM_DEVICE_PREFIX)) {
          fcmHashes.add(device.endpoint.slice(store.FCM_DEVICE_PREFIX.length));
        } else {
          endpoints.add(device.endpoint);
        }
      }
      if (subscription !== null) endpoints.add(subscription.endpoint);

      for (const endpoint of endpoints) await store.unregisterPushSubscription(endpoint);
      for (const hash of fcmHashes) {
        await store.forgetFcmDevice(hash);
        if (isConfigured.firebase) {
          void fcmClient().then((fcm) => fcm.removeFcmTokenFromFirestore(uid, hash));
        }
      }
      const fcm = await fcmClient();
      const localHash = fcm.readRegisteredFcmHash(uid);
      if (localHash) await store.forgetFcmDevice(localHash);
      if (localHash || pushConfig?.mode === 'fcm') await fcm.deleteFcmBrowserToken();
      fcm.writeRegisteredFcmHash(uid, null);
      if (subscription !== null) await subscription.unsubscribe();
      setOptOut(uid, true);

      setErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
      return true;
    } catch (error) {
      setErrorKey(dataErrorKey(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [uid, block, devicesQuery.data, queryClient, pushConfig?.mode]);

  const removeDevice = useCallback(
    async (endpoint: string) => {
      if (uid === null) return false;
      setBusy(true);
      try {
        const store = await repository();
        if (endpoint.startsWith(store.FCM_DEVICE_PREFIX)) {
          const hash = endpoint.slice(store.FCM_DEVICE_PREFIX.length);
          await store.forgetFcmDevice(hash);
          if (isConfigured.firebase) {
            void fcmClient().then((fcm) => fcm.removeFcmTokenFromFirestore(uid, hash));
          }
          const fcm = await fcmClient();
          if (fcm.readRegisteredFcmHash(uid) === hash) {
            await fcm.deleteFcmBrowserToken();
            fcm.writeRegisteredFcmHash(uid, null);
            setOptOut(uid, true);
          }
        } else {
          await store.unregisterPushSubscription(endpoint);
          // A device this browser owns is unsubscribed as well, so the browser
          // does not immediately re-register the row that was just removed.
          if (block === 'ok') {
            const here = await currentSubscription().catch(() => null);
            if (here !== null && here.endpoint === endpoint) {
              await here.unsubscribe();
              setOptOut(uid, true);
            }
          }
        }
        await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
        setErrorKey(null);
        return true;
      } catch (error) {
        setErrorKey(dataErrorKey(error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [uid, block, queryClient],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  const devices = devicesQuery.data ?? [];

  return {
    block,
    blockKey: PUSH_BLOCK_KEYS[block],
    liveDevices: devices.filter((device) => device.state === 'live').length,
    permission,
    devices,
    busy,
    errorKey,
    dismissError,
    retryConfiguration: () => {
      void runtimeQuery.refetch();
    },
    enable,
    disable,
    removeDevice,
  };
}
