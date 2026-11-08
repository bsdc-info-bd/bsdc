import { callRpc, DatabaseUnavailable } from './api';
import type { Env } from './env';
import { sendFcm } from './fcm';

interface FcmPendingRow {
  notification_id: string;
  device_id: string;
  token: string;
  language: string;
  kind: string;
  actor_name: string;
  path: string;
  created_at: string;
}

export interface FcmRunStats {
  queued: number;
  sent: number;
  invalid: number;
  retry: number;
  failed: number;
  skipped: string;
  milliseconds: number;
}

function words(row: FcmPendingRow): { title: string; body: string; kind: string } {
  if (row.path.startsWith('/messages/')) {
    return row.language === 'en'
      ? { title: 'New message', body: 'You have a new message.', kind: 'message' }
      : { title: 'নতুন বার্তা', body: 'আপনার জন্য একটি নতুন বার্তা এসেছে।', kind: 'message' };
  }
  const actor =
    row.actor_name.trim().slice(0, 80) ||
    (row.language === 'en' ? 'A BSDC member' : 'একজন BSDC সদস্য');
  const english: Record<string, string> = {
    follow: 'started following you',
    reaction: 'reacted to your post',
    comment: 'commented on your post',
    reply: 'replied to your comment',
    mention: 'mentioned you',
    post_published: 'shared a new post',
    share: 'shared your post',
    bookmark: 'saved your post',
  };
  const bengali: Record<string, string> = {
    follow: 'আপনাকে অনুসরণ করা শুরু করেছেন',
    reaction: 'আপনার পোস্টে প্রতিক্রিয়া জানিয়েছেন',
    comment: 'আপনার পোস্টে মন্তব্য করেছেন',
    reply: 'আপনার মন্তব্যের উত্তর দিয়েছেন',
    mention: 'আপনাকে উল্লেখ করেছেন',
    post_published: 'নতুন পোস্ট শেয়ার করেছেন',
    share: 'আপনার পোস্ট শেয়ার করেছেন',
    bookmark: 'আপনার পোস্ট সংরক্ষণ করেছেন',
  };
  const body =
    (row.language === 'en' ? english[row.kind] : bengali[row.kind]) ??
    (row.language === 'en' ? 'You have new BSDC activity.' : 'BSDC-তে আপনার নতুন কার্যকলাপ আছে।');
  return { title: 'BSDC', body: `${actor} ${body}`.slice(0, 240), kind: row.kind };
}

async function inWaves<T>(
  rows: readonly T[],
  size: number,
  work: (row: T) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += size)
    await Promise.all(rows.slice(start, start + size).map(work));
}

/** Independently drains the native FCM queue; web push continues to use its existing delivery path. */
export async function runFcmPush(env: Env, limit = 200): Promise<FcmRunStats> {
  const started = Date.now();
  const stats: FcmRunStats = {
    queued: 0,
    sent: 0,
    invalid: 0,
    retry: 0,
    failed: 0,
    skipped: '',
    milliseconds: 0,
  };
  const account = (env.FCM_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (!account) {
    stats.skipped = 'fcm-not-configured';
    return stats;
  }
  const secret = (env.PUSH_FLUSH_SECRET ?? '').trim();
  if (secret.length < 32)
    throw new DatabaseUnavailable(503, 'PUSH_FLUSH_SECRET is not configured for FCM');
  const pending = await callRpc<FcmPendingRow[]>(env, 'fcm_claim_pending', {
    p_secret: secret,
    p_limit: Math.min(200, Math.max(1, Math.trunc(limit))),
  });
  const rows = Array.isArray(pending) ? pending : [];
  stats.queued = rows.length;
  await inWaves(rows, 8, async (row) => {
    let outcome: 'sent' | 'invalid' | 'retry' | 'failed' = 'retry';
    try {
      const notification = words(row);
      const result = await sendFcm(account, {
        token: row.token,
        title: notification.title,
        body: notification.body,
        path: row.path,
        eventId: row.notification_id,
        kind: notification.kind,
      });
      outcome = result.kind === 'sent' ? 'sent' : 'invalid';
    } catch {
      // Do not print provider errors: their bodies can quote a device token.
      outcome = 'retry';
    }
    try {
      await callRpc(env, 'fcm_finish_delivery', {
        p_secret: secret,
        p_notification_id: row.notification_id,
        p_device_id: row.device_id,
        p_outcome: outcome,
      });
      stats[outcome] += 1;
    } catch {
      // The claim lease expires and makes this pair eligible again; idempotency
      // at FCM is not guaranteed, so the database remains the retry authority.
      stats.failed += 1;
    }
  });
  stats.milliseconds = Date.now() - started;
  return stats;
}
