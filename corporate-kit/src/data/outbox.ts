/**
 * Writes that survive a dropped connection.
 *
 * A moderation console is often used on a phone, in a building with one bar of
 * signal. The failure that matters is not "the page did not load" — it is
 * "I hid that listing, the spinner spun, and the network died". Without a
 * durable intent, the operator has to remember to try again, and the person
 * whose listing it was does not know either way.
 *
 * So a write is recorded *before* it is attempted, and only removed once the
 * server has confirmed it. If the tab dies mid-request, the retry happens on the
 * next open. That ordering — record, then send, then forget — is the only one
 * that cannot lose a write, and it is why this module works on an intent rather
 * than on a promise.
 *
 * Three things it deliberately does not do:
 *
 * - **No automatic retry of an action the server refused.** A refusal is a
 *   decision, not a transport fault; replaying it forever would be a console
 *   arguing with the database.
 * - **No replay across a permission change.** An intent records the actor, and
 *   is dropped rather than replayed by somebody else.
 * - **No silent replay.** Every replayed action announces itself, because an
 *   action taken four minutes ago landing now is something the operator needs
 *   to know about.
 */

export type OutboxStatus = 'pending' | 'sending' | 'failed' | 'abandoned';

export type OutboxIntent = {
  /** Stable across reloads: this is what makes a replay safe to identify. */
  readonly id: string;
  /** The database function to call. */
  readonly rpc: string;
  readonly args: Readonly<Record<string, unknown>>;
  /** Who queued it, so another account cannot inherit it. */
  readonly actor: string;
  /** What to tell the operator when it lands. */
  readonly label: string;
  /** When it was queued, so an old intent can be explained rather than just sent. */
  readonly queuedAt: number;
  /** Attempts so far, so a persistently failing intent stops being retried. */
  readonly attempts: number;
  readonly status: OutboxStatus;
  /** The last refusal or transport error, kept so the operator can see why. */
  readonly lastError?: string | undefined;
};

/** Attempts before an intent is abandoned and handed back to the operator. */
export const MAX_OUTBOX_ATTEMPTS = 5;

/** An intent older than this is not replayed: the world has moved on. */
export const MAX_OUTBOX_AGE_MS = 24 * 60 * 60 * 1_000;

const STORAGE_PREFIX = 'bsdc:outbox';

function keyFor(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

function storageOf(explicit?: Storage | null): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the queue, discarding anything that is not a well-formed intent. */
export function readOutbox(scope: string, storage?: Storage | null): readonly OutboxIntent[] {
  const target = storageOf(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(keyFor(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isIntent);
  } catch {
    return [];
  }
}

function isIntent(value: unknown): value is OutboxIntent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    candidate['id'].length > 0 &&
    typeof candidate['rpc'] === 'string' &&
    typeof candidate['actor'] === 'string' &&
    typeof candidate['label'] === 'string' &&
    typeof candidate['queuedAt'] === 'number' &&
    typeof candidate['attempts'] === 'number' &&
    typeof candidate['status'] === 'string' &&
    typeof candidate['args'] === 'object'
  );
}

function writeOutbox(
  scope: string,
  intents: readonly OutboxIntent[],
  storage?: Storage | null,
): boolean {
  const target = storageOf(storage);
  if (!target) return false;
  try {
    if (intents.length === 0) target.removeItem(keyFor(scope));
    else target.setItem(keyFor(scope), JSON.stringify(intents));
    return true;
  } catch {
    // Quota exceeded, or storage blocked. The caller still holds the intent in
    // memory for this session; it simply will not survive a reload, which is
    // the honest limitation of a browser with no storage.
    return false;
  }
}

/**
 * A stable, collision-resistant id.
 *
 * `crypto.randomUUID` is unavailable on older mobile browsers and in some
 * insecure contexts, so there is a fallback — but the id must still be unique
 * enough that two intents queued in the same millisecond do not merge.
 */
export function newIntentId(now: number = Date.now(), random: () => number = Math.random): string {
  const globalCrypto = typeof crypto === 'undefined' ? undefined : crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  const noise = Math.floor(random() * 1_000_000).toString(36);
  return `intent-${now.toString(36)}-${noise}`;
}

export function enqueue(
  scope: string,
  intent: Omit<OutboxIntent, 'id' | 'attempts' | 'status' | 'queuedAt'> & {
    readonly queuedAt?: number;
    readonly id?: string;
  },
  storage?: Storage | null,
): OutboxIntent {
  const created: OutboxIntent = {
    id: intent.id ?? newIntentId(),
    rpc: intent.rpc,
    args: intent.args,
    actor: intent.actor,
    label: intent.label,
    queuedAt: intent.queuedAt ?? Date.now(),
    attempts: 0,
    status: 'pending',
  };
  const current = readOutbox(scope, storage);
  writeOutbox(scope, [...current, created], storage);
  return created;
}

export function removeIntent(
  scope: string,
  id: string,
  storage?: Storage | null,
): readonly OutboxIntent[] {
  const remaining = readOutbox(scope, storage).filter((intent) => intent.id !== id);
  writeOutbox(scope, remaining, storage);
  return remaining;
}

export function updateIntent(
  scope: string,
  id: string,
  patch: Partial<Omit<OutboxIntent, 'id'>>,
  storage?: Storage | null,
): readonly OutboxIntent[] {
  const next = readOutbox(scope, storage).map((intent) =>
    intent.id === id ? { ...intent, ...patch } : intent,
  );
  writeOutbox(scope, next, storage);
  return next;
}

export type ReplayPlan =
  | { readonly action: 'send'; readonly intent: OutboxIntent }
  | { readonly action: 'drop'; readonly intent: OutboxIntent; readonly why: string };

/**
 * Decides what to do with each queued intent, without doing any of it.
 *
 * Keeping the decision separate from the effect is what lets the caller show
 * "three writes are waiting" before anything is sent, and lets the whole policy
 * be tested without a network.
 */
export function planReplay(
  intents: readonly OutboxIntent[],
  context: {
    readonly actor: string;
    readonly now: number;
    readonly online: boolean;
  },
): readonly ReplayPlan[] {
  return intents.map((intent) => {
    if (intent.status === 'abandoned') {
      return { action: 'drop', intent, why: 'It was already handed back to you as failed.' };
    }
    if (intent.actor !== context.actor) {
      return {
        action: 'drop',
        intent,
        why: 'It was queued by another account, so it will not be sent from this session.',
      };
    }
    if (context.now - intent.queuedAt > MAX_OUTBOX_AGE_MS) {
      return {
        action: 'drop',
        intent,
        why: 'It is more than a day old, so the state it was written against has probably changed.',
      };
    }
    if (intent.attempts >= MAX_OUTBOX_ATTEMPTS) {
      return { action: 'drop', intent, why: 'It has failed too many times to keep retrying.' };
    }
    if (!context.online) {
      // Not a decision to drop: nothing happens until the network returns.
      return { action: 'drop', intent, why: 'Waiting for a connection.' };
    }
    return { action: 'send', intent };
  });
}

/** The summary a shell shows before replaying anything. */
export function outboxSummary(intents: readonly OutboxIntent[]): string {
  const waiting = intents.filter(
    (intent) => intent.status === 'pending' || intent.status === 'failed',
  );
  if (waiting.length === 0) return '';
  if (waiting.length === 1) return `1 change is waiting to be sent: ${waiting[0]?.label ?? ''}`;
  return `${waiting.length} changes are waiting to be sent.`;
}
