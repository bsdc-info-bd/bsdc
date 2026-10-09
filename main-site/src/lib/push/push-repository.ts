/**
 * The member's side of push: the devices that asked to be woken.
 *
 * A subscription belongs to a browser, not to a person, and the browser hands
 * out a new one whenever it rotates its keys — an update, a restored profile, a
 * key that expired. So registration is not something a member does once: the app
 * re-registers whatever `pushManager` holds every time it is opened, which is the
 * only moment it can prove whose device it is.
 */
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';

export interface PushDeviceRow {
  endpoint: string;
  user_agent: string;
  language: string;
  created_at: string;
}

export interface PushDevice {
  endpoint: string;
  userAgent: string;
  language: 'bn' | 'en';
  createdAt: string;
}

function toDevice(row: PushDeviceRow): PushDevice {
  return {
    endpoint: row.endpoint,
    userAgent: row.user_agent ?? '',
    language: row.language === 'en' ? 'en' : 'bn',
    createdAt: row.created_at,
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
  const { error } = await getSupabase().rpc('unregister_push_subscription', {
    p_endpoint: endpoint,
  });
  if (error) throw toDataError(error);
}

export async function fetchMyPushDevices(): Promise<PushDevice[]> {
  const { data, error } = await getSupabase()
    .rpc('my_push_subscriptions')
    .returns<PushDeviceRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toDevice);
}
