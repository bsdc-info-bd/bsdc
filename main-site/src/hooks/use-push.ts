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

import { env } from '@/lib/env';
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

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushControl {
  /** Why push cannot be used here, or `'ok'`. */
  block: PushBlock;
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

async function subscribeHere(): Promise<PushSubscription | null> {
  const navigation = globalThis.navigator;
  const registration = await navigation.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing !== null) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.push.webPushPublicKey),
  });
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

  const supported = block === 'ok';

  const devicesQuery = useQuery({
    queryKey: ['push-devices', uid],
    queryFn: async () => (await repository()).fetchMyPushDevices(),
    enabled: uid !== null && supported,
    staleTime: 60_000,
  });

  useEffect(() => {
    const described = describePushEnvironment(readPushEnvironment(env.push.webPushPublicKey));
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
        const subscription = await subscribeHere();
        if (subscription === null) return;
        await (
          await repository()
        ).registerPushSubscription(subscription, i18n.language, globalThis.navigator.userAgent);
        await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
      } catch {
        // A key that rotated while the site was closed and a permission that was
        // withdrawn both land here. The member is not told: nothing was asked of
        // them, and the button is still there when they want it.
      }
    })();
  }, [uid, i18n.language, queryClient]);

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
      const subscription = await subscribeHere();
      if (subscription === null) {
        setErrorKey('push.errors.failed');
        return;
      }
      await (
        await repository()
      ).registerPushSubscription(subscription, i18n.language, globalThis.navigator.userAgent);
      refreshedFor.current = uid;
      setErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
    } catch (error) {
      setErrorKey(dataErrorKey(error));
    } finally {
      setBusy(false);
    }
  }, [uid, block, i18n.language, queryClient]);

  const disable = useCallback(async () => {
    if (uid === null) return;
    setBusy(true);
    try {
      // Reading only: a "turn off" that had to subscribe first would be a
      // permission prompt on the way out.
      const subscription = block === 'ok' ? await currentSubscription().catch(() => null) : null;
      const endpoints = new Set<string>(devicesQuery.data?.map((device) => device.endpoint) ?? []);
      if (subscription !== null) endpoints.add(subscription.endpoint);

      const store = await repository();
      for (const endpoint of endpoints) await store.unregisterPushSubscription(endpoint);
      if (subscription !== null) await subscription.unsubscribe();

      setErrorKey(null);
      await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
    } catch (error) {
      setErrorKey(dataErrorKey(error));
    } finally {
      setBusy(false);
    }
  }, [uid, block, devicesQuery.data, queryClient]);

  const removeDevice = useCallback(
    async (endpoint: string) => {
      if (uid === null) return;
      setBusy(true);
      try {
        await (await repository()).unregisterPushSubscription(endpoint);
        await queryClient.invalidateQueries({ queryKey: ['push-devices', uid] });
      } catch (error) {
        setErrorKey(dataErrorKey(error));
      } finally {
        setBusy(false);
      }
    },
    [uid, queryClient],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  return {
    block,
    blockKey: PUSH_BLOCK_KEYS[block],
    permission,
    devices: devicesQuery.data ?? [],
    busy,
    errorKey,
    dismissError,
    enable,
    disable,
    removeDevice,
  };
}
