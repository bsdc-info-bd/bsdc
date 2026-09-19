/**
 * BSDC — src/entities/event/repository.ts
 * Purpose : Event persistence: publish, browse, answer an invitation, and manage a venue.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An answer to an invitation is written at `events/{id}/rsvps/{uid}`. The document id is
 *   the account id, which is what makes a duplicate answer impossible rather than merely unlikely,
 *   and the waiting-list flag is decided from the event's own counters so a full room is a full
 *   room for everybody at the same moment.
 *   The attendee count lives in the Realtime Database as well, because a number that changes while
 *   you look at it belongs on the ephemeral plane, not in a document read.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, eventPath, liveAttendeesPath, rsvpPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb, realtimeDb } from '@/services/firebase/app';
import { fromDocument, fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorGet, mirrorList, mirrorPut, mirrorSoftDelete } from '@/services/offline/mirror';
import { readThrough, writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { rtdbServerTimestamp, rtdbUpdate } from '@/services/firebase/database';
import type { RsvpStatus } from '@/core/config/opportunities';
import { isRsvpOpen, newRsvp, sortEvents, validateEvent, type BsdcEvent, type Rsvp } from './model';

/** Filter used when browsing events. */
export interface EventFilter {
  readonly mode?: 'onsite' | 'online' | 'hybrid' | undefined;
  readonly division?: string | undefined;
  readonly tag?: string | undefined;
  readonly ownerUid?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * Publishes an event.
 * @param event the event entity, built by src/entities/event/model.ts
 * @returns the write outcome, or a refused result when the draft is invalid
 */
export async function createEvent(event: BsdcEvent): Promise<WriteThroughResult> {
  const validation = validateEvent({
    ownerUid: event.ownerUid,
    ownerName: event.ownerName,
    title: event.title,
    titleBn: event.titleBn,
    description: event.description,
    mode: event.mode,
    venue: event.venue,
    onlineUrl: event.onlineUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    capacity: event.capacity,
    tags: event.tags,
  });
  if (!validation.ok) {
    return {
      synced: false,
      queued: false,
      error: new AppError(validation.code ?? 'BSDC-DATA-007', { eventId: event.id }),
    };
  }

  return await writeThrough(
    'events',
    event,
    {
      kind: 'event.create',
      entityId: event.id,
      payload: event as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, eventPath(event.id)), event);
      } catch (error) {
        throw translateFirestoreError(error, 'event.create');
      }
    },
  );
}

/**
 * Edits an event. A cancelled event cannot be brought back from here; publish a new one instead.
 * @param eventId event id
 * @param patch fields to change
 * @returns the write outcome
 */
export async function updateEvent(
  eventId: string,
  patch: Partial<
    Pick<
      BsdcEvent,
      | 'title'
      | 'titleBn'
      | 'description'
      | 'coverUrl'
      | 'onlineUrl'
      | 'startsAt'
      | 'endsAt'
      | 'capacity'
      | 'tags'
      | 'status'
    >
  >,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<BsdcEvent>('events', eventId);
  if (current === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { eventId }) };
  }
  const now = new Date().toISOString();
  const next: BsdcEvent = { ...current, ...patch, updatedAt: now };
  return await writeThrough(
    'events',
    next,
    { kind: 'event.update', entityId: eventId, payload: patch },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, eventPath(eventId)), { ...patch, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'event.update');
      }
    },
  );
}

/**
 * Moves an event to the recovery bin.
 * @param eventId event id
 * @returns the write outcome
 */
export async function softDeleteEvent(eventId: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('events', eventId, now);
  const current = await mirrorGet<BsdcEvent>('events', eventId);
  const next: BsdcEvent =
    current ?? ({ id: eventId, deletedAt: now, createdAt: now, updatedAt: now } as BsdcEvent);
  return await writeThrough(
    'events',
    next,
    { kind: 'event.delete', entityId: eventId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, eventPath(eventId)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'event.delete');
      }
    },
  );
}

/**
 * Lists events, ordered live-first as resolved by src/entities/event/model.ts.
 * @param filter optional filters
 * @param now optional instant
 * @returns the events and their provenance
 */
export async function listEvents(
  filter: EventFilter = {},
  now: Date = new Date(),
): Promise<{ readonly items: readonly BsdcEvent[]; readonly source: 'remote' | 'local' }> {
  const result = await readThrough<BsdcEvent>(
    'events',
    async () => {
      const { collection, query, where, orderBy, limit, getDocs } =
        await import('firebase/firestore');
      const db = await firestoreDb();
      const constraints = [where('deletedAt', '==', null), where('status', '==', 'published')];
      if (filter.mode !== undefined) {
        constraints.push(where('mode', '==', filter.mode));
      }
      if (filter.ownerUid !== undefined) {
        constraints.push(where('ownerUid', '==', filter.ownerUid));
      }
      if (filter.tag !== undefined) {
        constraints.push(where('tags', 'array-contains', filter.tag));
      }
      constraints.push(orderBy('startsAt', 'asc') as never, limit(filter.limit ?? 40) as never);
      try {
        const snapshot = await getDocs(query(collection(db, COLLECTIONS.events), ...constraints));
        return fromQuery<BsdcEvent>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'event.list');
      }
    },
    {
      orderBy: 'startsAt',
      direction: 'asc',
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
    },
  );
  return { items: sortEvents(result.items, now), source: result.source };
}

/**
 * Reads a single event.
 * @param eventId event id
 * @returns the event, or undefined when it does not exist
 */
export async function loadEvent(eventId: string): Promise<BsdcEvent | undefined> {
  const result = await readThrough<BsdcEvent>(
    'events',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDoc(doc(db, eventPath(eventId)));
        const event = fromDocument<BsdcEvent>(snapshot);
        return event === undefined ? [] : [event];
      } catch (error) {
        throw translateFirestoreError(error, 'event.read');
      }
    },
    { limit: 1 },
  );
  return result.items[0] ?? (await mirrorGet<BsdcEvent>('events', eventId));
}

/**
 * Records a person's answer to an invitation, or withdraws it.
 * @param event the event
 * @param uid the person answering
 * @param status the answer; null withdraws an existing answer
 * @param note optional note to the organiser
 * @returns the write outcome
 */
export async function setRsvp(
  event: BsdcEvent,
  uid: string,
  status: RsvpStatus | null,
  note = '',
): Promise<WriteThroughResult> {
  if (status !== null && !isRsvpOpen(event)) {
    return {
      synced: false,
      queued: false,
      error: new AppError('BSDC-EVT-004', { eventId: event.id }),
    };
  }
  const now = new Date();
  const rsvp = status === null ? null : newRsvp(event.id, uid, status, event, note, now);

  if (rsvp === null) {
    await mirrorSoftDelete('rsvps', uid, now.toISOString());
  } else {
    await mirrorPut('rsvps', rsvp);
  }

  return await writeThrough(
    'rsvps',
    rsvp ?? {
      id: uid,
      eventId: event.id,
      uid,
      status: 'declined',
      note: '',
      waitlisted: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: now.toISOString(),
    },
    {
      kind: 'rsvp.set',
      entityId: uid,
      payload: { eventId: event.id, status: status ?? 'withdrawn', note },
    },
    async () => {
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        if (rsvp === null) await deleteDoc(doc(db, rsvpPath(event.id, uid)));
        else await setDoc(doc(db, rsvpPath(event.id, uid)), rsvp);
      } catch (error) {
        throw translateFirestoreError(error, 'rsvp.set');
      }
    },
  );
}

/**
 * Reads one person's answer to one event.
 * @param eventId event id
 * @param uid the person
 * @returns the answer, or undefined when they have not answered
 */
export async function loadRsvp(eventId: string, uid: string): Promise<Rsvp | undefined> {
  const local = await mirrorList<Rsvp>('rsvps', {
    limit: 1,
    where: [(rsvp: Rsvp) => rsvp.eventId === eventId && rsvp.uid === uid],
  });
  return local[0];
}

/**
 * Publishes the live attendee count for an event on the ephemeral plane.
 * Called by the host's device when the door count changes, read by everyone watching the page.
 * @param eventId event id
 * @param count attendee count
 * @returns true when the count was written
 */
export async function publishAttendeeCount(eventId: string, count: number): Promise<boolean> {
  try {
    await rtdbUpdate(liveAttendeesPath(eventId), {
      count,
      updatedAt: await rtdbServerTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Watches the live attendee count of an event.
 * @param eventId event id
 * @param handler receives the count
 * @returns a release function
 */
export function watchAttendeeCount(eventId: string, handler: (count: number) => void): Unsubscribe {
  return acquireListener(`event:attendees:${eventId}`, 'event', async () => {
    const { onValue, ref } = await import('firebase/database');
    const db = await realtimeDb();
    return onValue(ref(db, liveAttendeesPath(eventId)), (snapshot) => {
      const value = snapshot.val() as { count?: number } | null;
      handler(typeof value?.count === 'number' ? value.count : 0);
    });
  });
}

/**
 * Lists the answers one person has given, newest first, for their own "going" screen.
 * @param uid the person
 * @returns their answers
 */
export async function listMyRsvps(uid: string): Promise<readonly Rsvp[]> {
  return await mirrorList<Rsvp>('rsvps', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(rsvp: Rsvp) => rsvp.uid === uid && rsvp.deletedAt === null],
  });
}
