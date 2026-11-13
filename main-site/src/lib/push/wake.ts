/**
 * Instant best-effort push delivery wake-up.
 *
 * After a browser write creates a row in `public.notifications`, calling
 * `wakePushDelivery()` triggers `POST /api/push/wake` with the signed-in
 * member's Firebase ID token so closed browsers and Android phones receive the
 * push in under a second instead of waiting for the next 60s cron tick.
 *
 * Debounced per client tab so bursts settle into one flush, and strictly
 * fire-and-forget so network state never breaks or slows down a write.
 */
import { isConfigured } from '@/lib/env';

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastSentAt = 0;

const DEBOUNCE_MS = 80;
const MIN_GAP_MS = 350;

async function sendWakeRequest(): Promise<void> {
  if (typeof window === 'undefined' || !isConfigured.firebase) return;
  try {
    const { getFirebaseAuth } = await import('@/lib/firebase');
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const idToken = await user.getIdToken(false);
    if (!idToken) return;
    await fetch('/api/push/wake', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
      keepalive: true,
    });
  } catch {
    // Best-effort only: pg_net + 1-minute push worker cron remain active.
  }
}

export function wakePushDelivery(): void {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return;
  if (pendingTimer !== null) return;
  const elapsed = Date.now() - lastSentAt;
  const delay = elapsed >= MIN_GAP_MS ? DEBOUNCE_MS : MIN_GAP_MS - elapsed + DEBOUNCE_MS;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    lastSentAt = Date.now();
    void sendWakeRequest();
  }, delay);
}
