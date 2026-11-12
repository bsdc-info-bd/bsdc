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

import { effectivePushVapidConfig, env, isConfigured } from '@/lib/env';
import {
  PUSH_BLOCK_KEYS,
  describePushEnvironment,
  readPushEnvironment,
  type PushBlock,
} from '@/lib/push/support';
import { urlBase64ToUint8Array } from '@/lib/push/webpush';
import type { PushDevice } from '@/lib/push/push-repository';
import { dataErrorKey } from '@/lib/supabase/errors';
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
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  removeDevice: (endpoint: string) => Promise<void>;
}

/** Reads the subscription this browser already holds, asking for nothing. */
async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await globalThis.navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function subscribeHere(publicKey: string): Promise<PushSubscription | null> {
  const navigation = globalThis.navigator;
  const registration = await navigation.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing !== null) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

async function fetchRuntimeVapidConfig(): Promise<{
  mode: 'webpush' | 'fcm';
  publicKey: string;
} | null> {
  const staticConfig = effectivePushVapidConfig(env.push);
  if (staticConfig !== null) return staticConfig;
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch('/api/push/config', { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as { enabled?: unknown; vapidPublicKey?: unknown };
    if (
      payload.enabled === true &&
      typeof payload.vapidPublicKey === 'string' &&
      payload.vapidPublicKey.trim().length > 0
    ) {
      return { mode: 'webpush', publicKey: payload.vapidPublicKey.trim() };
    }
  } catch {
    // Ignore when /api/push/config is unreachable (e.g. offline or standalone preview).
  }
  return null;
}

async function registerCurrentBrowser(
  uid: string,
  language: string,
  config: { mode: 'webpush' | 'fcm'; publicKey: string } | null,
): Promise<boolean> {
  if (config === null) return false;
  const store = await repository();

  if (config.mode === 'webpush') {
    const subscription = await subscribeHere(config.publicKey);
    if (subscription === null) return false;
    await store.registerPushSubscription(subscription, language, globalThis.navigator.userAgent);
    return true;
  }

  // FCM Web Push mode (when VITE_PUSH_VAPID_PUBLIC_KEY is unset and
  // VITE_FIREBASE_VAPID_PUBLIC_KEY is configured).
  const fcm = await fcmClient();
  const token = await fcm.getFcmBrowserToken(config.publicKey);
  if (token === null) return false;
  const lang: 'bn' | 'en' = language === 'en' ? 'en' : 'bn';
  const hash = await store.registerFcmToken(token, 'web', lang, globalThis.navigator.userAgent);
  if (hash.length > 0 && isConfigured.firebase) {
    void fcm.syncFcmTokenToFirestore(uid, hash, 'web', lang);
  }
  return true;
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

  const staticConfig = effectivePushVapidConfig(env.push);
  const runtimeQuery = useQuery({
    queryKey: ['push-runtime-config'],
    queryFn: fetchRuntimeVapidConfig,
    enabled: staticConfig === null,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const pushConfig = staticConfig ?? runtimeQuery.data ?? null;
  const activeKey = pushConfig?.publicKey ?? '';
  const supported = block === 'ok';

  const devicesQuery = useQuery({
    queryKey: ['push-devices', uid],
    queryFn: async () => (await repository()).fetchAllPushDevices(),
    enabled: uid !== null && supported,
    staleTime: 60_000,
  });

  useEffect(() => {
    const described = describePushEnvironment(readPushEnvironment(activeKey));
    setBlock(described.block);
    if (!described.supported) {
      setPermission('unsupported');
      return;
    }

    const asked = globalThis.Notification.permission;
    setPermission(asked);

    if (uid === null || asked !== 'granted' || refreshedFor.current === uid) return;
    refreshedFor.current = uid;

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

  const enable = useCallback(async () => {
    if (uid === null || block !== 'ok') {
      setErrorKey(PUSH_BLOCK_KEYS[block]);
      return;
    }
    setBusy(true);
    try {
      const asked = await globalThis.Notification.requestPermission();
      setPermission(asked);
      if (asked !== 'granted') {
        setErrorKey('push.errors.permissionDenied');
        return;
      }
      const registered = await registerCurrentBrowser(uid, i18n.language, pushConfig);
      if (!registered) {
        setErrorKey('push.errors.failed');
        return;
      }
      refreshedFor.current = uid;
      setErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
    } catch (error) {
      setErrorKey(dataErrorKey(error));
    } finally {
      setBusy(false);
    }
  }, [uid, block, i18n.language, queryClient, pushConfig]);

  const disable = useCallback(async () => {
    if (uid === null) return;
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
      if (pushConfig?.mode === 'fcm') {
        await (await fcmClient()).deleteFcmBrowserToken();
      }
      if (subscription !== null) await subscription.unsubscribe();

      setErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
    } catch (error) {
      setErrorKey(dataErrorKey(error));
    } finally {
      setBusy(false);
    }
  }, [uid, block, devicesQuery.data, queryClient, pushConfig?.mode]);

  const removeDevice = useCallback(
    async (endpoint: string) => {
      if (uid === null) return;
      setBusy(true);
      try {
        const store = await repository();
        if (endpoint.startsWith(store.FCM_DEVICE_PREFIX)) {
          const hash = endpoint.slice(store.FCM_DEVICE_PREFIX.length);
          await store.forgetFcmDevice(hash);
          if (isConfigured.firebase) {
            void fcmClient().then((fcm) => fcm.removeFcmTokenFromFirestore(uid, hash));
          }
          if (pushConfig?.mode === 'fcm') {
            await (await fcmClient()).deleteFcmBrowserToken();
          }
        } else {
          await store.unregisterPushSubscription(endpoint);
          // A device this browser owns is unsubscribed as well, so the browser
          // does not immediately re-register the row that was just removed.
          if (block === 'ok') {
            const here = await currentSubscription().catch(() => null);
            if (here !== null && here.endpoint === endpoint)
              await here.unsubscribe().catch(() => false);
          }
        }
        await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
      } catch (error) {
        setErrorKey(dataErrorKey(error));
      } finally {
        setBusy(false);
      }
    },
    [uid, block, queryClient, pushConfig?.mode],
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
    enable,
    disable,
    removeDevice,
  };
}
