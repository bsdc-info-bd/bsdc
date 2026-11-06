/**
 * The member's side of push: the devices that asked to be woken.
 *
 * A subscription belongs to a browser, not to a person, and the browser hands
 * out a new one whenever it rotates its keys — an update, a restored profile, a
 * key that expired. So registration is not something a member does once: the app
 * re-registers whatever `pushManager` holds every time it is opened, which is the
 * only moment it can prove whose device it is.
 *
 * ## Two questions, two routines
 *
 * `my_push_subscriptions()` (0060) answers "which devices are recorded".
 * `my_push_devices()` (0072) answers the more useful one: "which of them can
 * actually still be woken". A device whose push service answered 404/410 is
 * *dead* — the browser threw its keys away and only a visit from that browser can
 * bring it back. A device whose encryptable keys were rejected is *invalid* — the
 * keys are recorded but the push service refused them, which is usually fixed by
 * the member opening that browser once.
 *
 * The difference matters to the person reading the list. "Notifications are on"
 * when the only recorded device is a laptop they sold in March is a lie the old
 * list told. So this file prefers the richer routine and falls back to the older
 * one only when the database has not had 0072 applied — a deployment that is one
 * migration behind should show its device list, not an error.
 */
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';

/** A row of `my_push_devices()`, exactly as Postgres returns it. */
export interface PushDeviceRow {
  endpoint: string;
  user_agent: string | null;
  language: string | null;
  created_at: string;
  last_used_at: string | null;
  state: string | null;
}

/** A row of `my_push_subscriptions()`, the 0060 shape, used as a fallback. */
export interface PushSubscriptionRow {
  endpoint: string;
  user_agent: string | null;
  language: string | null;
  created_at: string;
}

/**
 * Whether this device can still be woken.
 *
 * - `live` — the push service has accepted a send, or has never refused one.
 * - `invalid` — the recorded keys were rejected. The browser has to open once.
 * - `dead` — the push service says this address is gone. Only that browser can
 *   re-register it, and re-registering gives it a new address.
 */
export type PushDeviceState = 'live' | 'invalid' | 'dead';

export interface PushDevice {
  endpoint: string;
  userAgent: string;
  language: 'bn' | 'en';
  createdAt: string;
  /** When a push was last accepted for this device, if ever. */
  lastUsedAt: string | null;
  state: PushDeviceState;
}

function toState(value: string | null | undefined): PushDeviceState {
  return value === 'dead' || value === 'invalid' ? value : 'live';
}

function toLanguage(value: string | null | undefined): 'bn' | 'en' {
  return value === 'en' ? 'en' : 'bn';
}

function toDevice(row: PushDeviceRow | PushSubscriptionRow): PushDevice {
  const richer = row as Partial<PushDeviceRow>;
  return {
    endpoint: row.endpoint,
    userAgent: row.user_agent ?? '',
    language: toLanguage(row.language),
    createdAt: row.created_at,
    lastUsedAt: richer.last_used_at ?? null,
    state: toState(richer.state),
  };
}

/**
 * Records this device against this member. An endpoint that already exists moves
 * to whoever is signed in now, which is what a shared phone should do.
 */
export async function registerPushSubscription(
  subscription: PushSubscription,
  language: string,
  userAgent: string,
): Promise<void> {
  const keys = subscription.toJSON().keys ?? {};
  const { error } = await getSupabase().rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh ?? '',
    p_auth: keys.auth ?? '',
    p_user_agent: userAgent.slice(0, 400),
    p_language: language === 'en' ? 'en' : 'bn',
  });
  if (error) throw toDataError(error);
}

export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  // `forget_push_device` arrived with 0072 and also drops 0072's extra columns'
  // state; `unregister_push_subscription` is the 0060 name. Neither can fail for
  // a member who owns the row, so trying the newer one first costs one request
  // and keeps the older deployments working.
  const client = getSupabase();
  const richer = await client.rpc('forget_push_device', { p_endpoint: endpoint });
  if (!richer.error) return;
  const { error } = await client.rpc('unregister_push_subscription', { p_endpoint: endpoint });
  if (error) throw toDataError(error);
}

/** True when the failure means the routine itself is absent, not that it refused. */
function missingFunction(message: string | undefined): boolean {
  if (message === undefined) return false;
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('could not find the function') ||
    text.includes('schema cache')
  );
}

/**
 * The member's devices, newest first, with the state of each.
 *
 * Falls back to the 0060 routine when 0072 is not applied, so a deployment that
 * is one migration behind shows a device list without states rather than an
 * error. The fallback is not silent in the type system: every device always has
 * a state, and it is `live` until the database says otherwise.
 */
export async function fetchMyPushDevices(): Promise<PushDevice[]> {
  const client = getSupabase();
  const rich = await client.rpc('my_push_devices').returns<PushDeviceRow[]>();
  if (!rich.error) return (rich.data ?? []).map(toDevice);
  if (!missingFunction(rich.error.message)) throw toDataError(rich.error);

  const plain = await client.rpc('my_push_subscriptions').returns<PushSubscriptionRow[]>();
  if (plain.error) throw toDataError(plain.error);
  return (plain.data ?? []).map(toDevice);
}

/**
 * How many devices can be woken right now. A member with three devices and one
 * dead one has one device, as far as a notification is concerned.
 */
export function countLiveDevices(devices: readonly PushDevice[]): number {
  return devices.filter((device) => device.state === 'live').length;
}
