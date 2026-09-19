/**
 * BSDC — src/services/notifications/oneSignal.ts
 * Purpose : The manual broadcast desk, and the guard rail that keeps it manual.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : LAW-09 — nothing on BSDC sends a broadcast automatically. Not a scheduler, not a
 *   trigger, not a threshold, not a "re-engagement" job. A broadcast exists only because an admin
 *   typed it and pressed send, and this module makes that true in the code rather than in a policy
 *   document: there is no exported function that sends, only one that drafts, and the send is a
 *   separate Cloud Function that demands an explicit confirmation flag alongside the id.
 *   The draft carries who wrote it, when, and to whom, so every broadcast has an author the
 *   community can name.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { ONESIGNAL } from '@/core/config/firebase';
import { AppError } from '@/core/errors/AppError';
import { broadcastPath } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { translateFirestoreError } from '@/services/firebase/firestore';
import { callFunction } from '@/services/backend/callable';

/** Who a broadcast reaches. */
export const BROADCAST_AUDIENCES = ['all', 'members', 'creators', 'vendors', 'staff'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/** Which transport carries it. */
export const BROADCAST_CHANNELS = ['push', 'onesignal', 'both'] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];

/** Lifecycle of a broadcast draft. */
export const BROADCAST_STATUSES = ['draft', 'sending', 'sent', 'cancelled'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

/** A manual broadcast draft. Only a Cloud Function may move it to `sent`. */
export interface Broadcast {
  readonly id: string;
  readonly authorUid: string;
  readonly authorName: string;
  readonly title: string;
  readonly body: string;
  readonly audience: BroadcastAudience;
  readonly channel: BroadcastChannel;
  /** In-app route the notification opens, or an empty string for an announcement only. */
  readonly targetPath: string;
  readonly status: BroadcastStatus;
  readonly scheduledAt: string | null;
  readonly sentAt: string | null;
  readonly recipientCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to compose a broadcast. */
export interface NewBroadcastInput {
  readonly authorUid: string;
  readonly authorName: string;
  readonly title: string;
  readonly body: string;
  readonly audience: BroadcastAudience;
  readonly channel: BroadcastChannel;
  readonly targetPath?: string | undefined;
  readonly now?: Date | undefined;
}

/** Minimum and maximum lengths the composer enforces. */
export const BROADCAST_LIMITS = { titleMin: 4, titleMax: 80, bodyMin: 12, bodyMax: 240 } as const;

/**
 * Builds a broadcast draft. The status is always `draft`: nobody sends by constructing one.
 * @param input the draft values
 * @returns a complete broadcast entity
 */
export function newBroadcast(input: NewBroadcastInput): Broadcast {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: `bc-${Date.now().toString(36)}-${input.authorUid.slice(0, 6)}`,
    authorUid: input.authorUid,
    authorName: input.authorName,
    title: input.title.trim().slice(0, BROADCAST_LIMITS.titleMax),
    body: input.body.trim().slice(0, BROADCAST_LIMITS.bodyMax),
    audience: input.audience,
    channel: input.channel,
    targetPath: input.targetPath ?? '',
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    recipientCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Validates a broadcast draft.
 * @param input the draft
 * @returns null when valid, otherwise the BSDC error code to surface
 */
export function validateBroadcast(input: NewBroadcastInput): 'BSDC-PUSH-004' | null {
  if (
    input.title.trim().length < BROADCAST_LIMITS.titleMin ||
    input.body.trim().length < BROADCAST_LIMITS.bodyMin
  ) {
    return 'BSDC-PUSH-004';
  }
  return null;
}

/**
 * Saves a broadcast draft without sending it.
 * @param broadcast the draft
 * @returns the draft id
 */
export async function saveDraft(broadcast: Broadcast): Promise<string> {
  const problem = validateBroadcast({
    authorUid: broadcast.authorUid,
    authorName: broadcast.authorName,
    title: broadcast.title,
    body: broadcast.body,
    audience: broadcast.audience,
    channel: broadcast.channel,
    targetPath: broadcast.targetPath,
  });
  if (problem !== null) throw new AppError(problem, { broadcastId: broadcast.id });
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    await setDoc(doc(db, broadcastPath(broadcast.id)), broadcast);
    return broadcast.id;
  } catch (error) {
    throw translateFirestoreError(error, 'broadcast.save');
  }
}

/**
 * Sends one broadcast, once, because a person asked for it.
 * The Function re-checks the admin claim and refuses without an explicit confirmation flag, so a
 * stray call — a retried request, a double tap, a script — cannot turn into a platform-wide push.
 * @param broadcastId the draft to send
 * @param confirm must be true, and is re-checked server-side
 * @returns the number of devices the platform accepted it for
 */
export async function sendBroadcast(broadcastId: string, confirm: boolean): Promise<number> {
  if (!confirm) throw new AppError('BSDC-PUSH-003', { broadcastId });
  const response = await callFunction('sendBroadcast', { broadcastId, confirm: true });
  return response.recipientCount;
}

/**
 * Reports whether the OneSignal transport is configured for this build.
 * @returns true when an application id is present
 */
export function isOneSignalConfigured(): boolean {
  return ONESIGNAL.appId.length > 0;
}

/**
 * States the rule the platform keeps, in one line, for the broadcast screen to render.
 * @returns the rule
 */
export function automationRule(): string {
  return ONESIGNAL.automatedSendingAllowed
    ? 'Automated sending is enabled on this build, which contradicts the platform rule.'
    : 'Broadcasts are composed and sent by a person. Nothing on BSDC sends one automatically.';
}
