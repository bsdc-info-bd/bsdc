/**
 * Handing one notification to one device.
 *
 * The decision table in this file is the difference between a push system that
 * works and one that quietly stops working: a member has three devices, opens
 * the notification on the phone, and the laptop should not buzz an hour later;
 * a subscription dies and must be retired rather than retried forever; a push
 * service says "slow down" and that is not the same as "gone".
 *
 * Nothing here knows how a notification is fetched. It takes a target, the words
 * already chosen for that target's language, and returns one of five outcomes.
 * That shape is what makes every branch testable with a stub `fetch`.
 */
import {
  encryptPushPayload,
  endpointAudience,
  signVapidJwt,
  vapidHeader,
  type EncryptedPush,
} from './crypto';

/** The most a single push payload may carry. Push services reject larger ones. */
export const MAX_PAYLOAD_BYTES = 3_800;

/** How long a push service should keep trying to reach the device. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Urgency is a hint the device may honour for battery and do-not-disturb. */
export type Urgency = 'very-low' | 'low' | 'normal' | 'high';

export type DeliveryOutcome =
  /** The push service accepted it. */
  | 'sent'
  /** The subscription no longer exists (404/410). The row must be retired. */
  | 'dead'
  /** The key material was unusable; no amount of retrying will help. */
  | 'invalid'
  /** The service refused (401/403). The VAPID key or subject is wrong. */
  | 'unauthorized'
  /** Too many requests, or a service-side failure. Worth retrying later. */
  | 'retry'
  /** The body was too large for the service. Trim the payload and try again. */
  | 'too-large'
  /** The endpoint or the network was unusable right now. */
  | 'failed';

export interface DeliveryTarget {
  endpoint: string;
  /** Base64url `p256dh`. Empty means an empty-body wake-up, which is valid. */
  p256dh: string;
  /** Base64url `auth`. */
  auth: string;
}

export interface DeliveryKeys {
  privateKey: string;
  publicKey: string;
  subject: string;
}

export interface DeliveryRequest {
  target: DeliveryTarget;
  keys: DeliveryKeys;
  /** A JSON payload. Omit for a wake-up with no body. */
  payload?: unknown;
  urgency?: Urgency;
  /** Collapses queued messages with the same topic, per the specification. */
  topic?: string;
  ttlSeconds?: number;
  /** Test seam: the `fetch` to use. */
  fetcher?: typeof fetch;
  /** Test seam: a fixed time. */
  now?: number;
}

/** The words this push replaces if an older one has not been delivered yet. */
function safeTopic(topic: string | undefined): string | null {
  if (topic === undefined) return null;
  // The specification caps a topic at 32 URL-safe base64 characters.
  const cleaned = topic.replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 32) : null;
}

/** Trims a payload until it fits, rather than letting the service refuse it. */
function fitPayload(plaintext: string): string {
  if (new TextEncoder().encode(plaintext).byteLength <= MAX_PAYLOAD_BYTES) return plaintext;
  try {
    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    if (typeof parsed['body'] === 'string') {
      const body = parsed['body'];
      // The title is the part a member reads first; the body is what can go.
      parsed['body'] = body.slice(0, Math.max(0, body.length - 400));
      const trimmed = JSON.stringify(parsed);
      if (new TextEncoder().encode(trimmed).byteLength <= MAX_PAYLOAD_BYTES) return trimmed;
      delete parsed['body'];
      return JSON.stringify(parsed);
    }
  } catch {
    // Not an object; fall through to a hard cut, which is still a valid push.
  }
  return plaintext.slice(0, 1_500);
}

/** A push service's answer, mapped to what this worker should do about it. */
export function classifyStatus(status: number): DeliveryOutcome {
  if (status === 201 || status === 200 || status === 202 || status === 204) return 'sent';
  if (status === 404 || status === 410) return 'dead';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 400 || status === 413) return 'too-large';
  if (status === 429) return 'retry';
  if (status >= 500) return 'retry';
  return 'failed';
}

/**
 * Sends one push.
 *
 * The encrypted body and the VAPID token are both required for a payload. For an
 * empty wake-up only the token is, which is the cheaper path and the one the
 * cron uses when it has nothing to say beyond "come and look".
 */
export async function deliver(request: DeliveryRequest): Promise<DeliveryOutcome> {
  const audience = endpointAudience(request.target.endpoint);
  if (audience === null) return 'invalid';

  let token: string;
  try {
    token = await signVapidJwt({
      privateKey: request.keys.privateKey,
      publicKey: request.keys.publicKey,
      audience,
      subject: request.keys.subject,
      ...(request.now !== undefined ? { now: request.now } : {}),
    });
  } catch {
    // A private key that cannot be imported is a deployment problem, not a
    // device problem: every send fails the same way, so say so once.
    return 'unauthorized';
  }

  const headers: Record<string, string> = {
    authorization: vapidHeader(token, request.keys.publicKey),
    ttl: String(request.ttlSeconds ?? PUSH_TTL_SECONDS),
    urgency: request.urgency ?? 'normal',
  };

  const topic = safeTopic(request.topic);
  if (topic !== null) headers['topic'] = topic;

  let body: BodyInit | undefined;

  if (request.payload !== undefined) {
    if (request.target.p256dh.length === 0 || request.target.auth.length === 0) {
      // A subscription without keys cannot be encrypted for. Sending the
      // cleartext would be refused by the push service, and sending nothing
      // would look like success.
      return 'invalid';
    }
    let encrypted: EncryptedPush;
    try {
      encrypted = await encryptPushPayload({
        p256dh: request.target.p256dh,
        auth: request.target.auth,
        plaintext: fitPayload(JSON.stringify(request.payload)),
      });
    } catch {
      return 'invalid';
    }
    headers['content-encoding'] = encrypted.contentEncoding;
    headers['content-type'] = 'application/octet-stream';
    body = encrypted.body;
  }

  const fetcher = request.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetcher(request.target.endpoint, {
      method: 'POST',
      headers,
      ...(body !== undefined ? { body } : { body: '' }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Reading the body costs a moment and is the only way the worker's own log
      // says why. It is bounded: a push service's error page is not the point.
      const detail = await response.text().catch(() => '');
      if (detail.length > 0) {
        headers['x-bsdc-upstream-detail'] = detail.slice(0, 200);
      }
    }
    return classifyStatus(response.status);
  } catch {
    // A push service that could not be reached is not a dead subscription.
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Whether this run should stop asking about this device.
 *
 * `sent` and `dead` are about the device. `invalid` is about the subscription's
 * keys, which no retry can fix. `unauthorized` is deliberately *not* here: it is
 * about the deployment's own VAPID key or subject, it affects every device at
 * once, and the right response is to leave the rows waiting, report the problem
 * in the worker's response, and fix the secret — not to throw members'
 * notifications away because a rotation was done on a Friday.
 */
export function isTerminal(outcome: DeliveryOutcome): boolean {
  return outcome === 'sent' || outcome === 'dead' || outcome === 'invalid';
}

/** Whether an outcome is worth another attempt by the next run. */
export function shouldRetry(outcome: DeliveryOutcome): boolean {
  return outcome === 'retry' || outcome === 'failed';
}
