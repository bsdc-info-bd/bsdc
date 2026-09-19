/**
 * BSDC — src/entities/event/model.ts
 * Purpose : The event entity: where a community meets, on a map or on a call.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An event is either on-site, online or both, and the shape of the venue tells you
 *   which: an online event has a `onlineUrl` and no coordinates, an on-site event has coordinates
 *   picked on an OpenStreetMap map, and a hybrid event has both. The picker never invents a
 *   coordinate — it reads the one the organiser clicked, and the attribution stays on screen.
 *   Capacity is a real promise: once it is reached the platform stops saying "going" and starts
 *   saying "waiting list", because a full room that still sells tickets is a lie.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import { BD_TIMEZONE } from '@/shared/lib/date';
import { uid } from '@/shared/lib/uid';
import type { Division } from '@/core/config/opportunities';
import type { EventMode, EventStatus, RsvpStatus } from '@/core/config/opportunities';

/** A place an on-site event happens, chosen on an OpenStreetMap map. */
export interface EventVenue {
  /** Human label, e.g. a hall name. */
  readonly label: string;
  readonly addressLine: string;
  readonly area: string;
  readonly division: Division;
  readonly countryCode: string;
  readonly latitude: number;
  readonly longitude: number;
  /** OSM zoom level the organiser chose. */
  readonly zoom: number;
}

/** An event. */
export interface BsdcEvent {
  readonly id: string;
  readonly ownerUid: string;
  readonly ownerName: string;
  readonly title: string;
  readonly titleBn: string;
  readonly description: string;
  readonly coverUrl: string;
  readonly mode: EventMode;
  readonly venue: EventVenue | null;
  readonly onlineUrl: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  /** Zero means unlimited. */
  readonly capacity: number;
  readonly rsvpCount: number;
  readonly attendeeCount: number;
  readonly tags: readonly string[];
  readonly status: EventStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** A person's answer to an event invitation. */
export interface Rsvp {
  readonly id: string;
  readonly eventId: string;
  readonly uid: string;
  readonly status: RsvpStatus;
  readonly note: string;
  /** True when the person answered after the capacity was reached. */
  readonly waitlisted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to create an event. */
export interface NewEventInput {
  readonly ownerUid: string;
  readonly ownerName: string;
  readonly title: string;
  readonly titleBn: string;
  readonly description: string;
  readonly mode: EventMode;
  readonly venue: EventVenue | null;
  readonly onlineUrl: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone?: string | undefined;
  readonly capacity?: number | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly coverUrl?: string | undefined;
  readonly status?: EventStatus | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds an event entity.
 * @param input event values
 * @returns a complete event entity
 */
export function newEvent(input: NewEventInput): BsdcEvent {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: uid(20),
    ownerUid: input.ownerUid,
    ownerName: input.ownerName,
    title: input.title.trim(),
    titleBn: input.titleBn.trim(),
    description: input.description.slice(0, TEXT_LIMITS.productDescription),
    coverUrl: input.coverUrl ?? '',
    mode: input.mode,
    venue: input.venue,
    onlineUrl: input.mode === 'onsite' ? '' : input.onlineUrl.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone ?? BD_TIMEZONE,
    capacity: Math.max(0, Math.trunc(input.capacity ?? 0)),
    rsvpCount: 0,
    attendeeCount: 0,
    tags: input.tags ?? [],
    status: input.status ?? 'published',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Result of validating an event draft. */
export interface EventValidation {
  readonly ok: boolean;
  /** BSDC error code to surface, or null when the draft is valid. */
  readonly code: 'BSDC-EVT-001' | 'BSDC-EVT-003' | 'BSDC-DATA-007' | null;
}

/**
 * Validates an event draft before it is written.
 * @param input the draft
 * @returns the validation result
 */
export function validateEvent(input: NewEventInput): EventValidation {
  if (input.title.trim().length === 0) return { ok: false, code: 'BSDC-DATA-007' };
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    return { ok: false, code: 'BSDC-EVT-001' };
  }
  if (input.mode !== 'online' && input.venue === null) {
    return { ok: false, code: 'BSDC-EVT-003' };
  }
  if (input.mode !== 'onsite' && input.onlineUrl.trim().length === 0) {
    return { ok: false, code: 'BSDC-EVT-003' };
  }
  return { ok: true, code: null };
}

/** Where an event sits in time. */
export type EventPhase = 'upcoming' | 'live' | 'ended' | 'cancelled';

/**
 * Resolves where an event sits in time.
 * @param event the event
 * @param now optional instant
 * @returns the phase
 */
export function eventPhase(event: BsdcEvent, now: Date = new Date()): EventPhase {
  if (event.status === 'cancelled') return 'cancelled';
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const at = now.getTime();
  if (at < start) return 'upcoming';
  if (at > end) return 'ended';
  return 'live';
}

/**
 * Reports whether a person may still say they are going.
 * @param event the event
 * @param now optional instant
 * @returns true while registration is open
 */
export function isRsvpOpen(event: BsdcEvent, now: Date = new Date()): boolean {
  if (event.status !== 'published') return false;
  return eventPhase(event, now) === 'upcoming' || eventPhase(event, now) === 'live';
}

/**
 * Seats left, or null when the event is unlimited.
 * @param event the event
 * @returns remaining seats, never below zero
 */
export function seatsLeft(event: BsdcEvent): number | null {
  if (event.capacity <= 0) return null;
  return Math.max(0, event.capacity - event.rsvpCount);
}

/**
 * Decides whether an answer lands as a seat or on the waiting list.
 * @param event the event
 * @param status the answer
 * @returns true when the answer joins the waiting list
 */
export function landsOnWaitingList(event: BsdcEvent, status: RsvpStatus): boolean {
  if (status !== 'going') return false;
  const left = seatsLeft(event);
  return left !== null && left <= 0;
}

/**
 * Builds an RSVP entity.
 * @param eventId the event
 * @param uid the person answering
 * @param status the answer
 * @param event the event, used to decide the waiting list
 * @param note optional note to the organiser
 * @param now optional instant
 * @returns a complete RSVP entity
 */
export function newRsvp(
  eventId: string,
  accountUid: string,
  status: RsvpStatus,
  event: BsdcEvent,
  note = '',
  now: Date = new Date(),
): Rsvp {
  const iso = now.toISOString();
  return {
    // The document id is the account id, which is what makes a duplicate answer impossible.
    id: accountUid,
    eventId,
    uid: accountUid,
    status,
    note: note.slice(0, 280),
    waitlisted: landsOnWaitingList(event, status),
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };
}

/**
 * Sorts events for the list: live first, then upcoming soonest-first, then ended newest-first.
 * @param events the events
 * @param now optional instant
 * @returns a sorted copy
 */
export function sortEvents(
  events: readonly BsdcEvent[],
  now: Date = new Date(),
): readonly BsdcEvent[] {
  const rank: Readonly<Record<EventPhase, number>> = {
    live: 0,
    upcoming: 1,
    ended: 2,
    cancelled: 3,
  };
  return [...events].sort((left, right) => {
    const leftPhase = eventPhase(left, now);
    const rightPhase = eventPhase(right, now);
    if (rank[leftPhase] !== rank[rightPhase]) return rank[leftPhase] - rank[rightPhase];
    if (leftPhase === 'ended') return Date.parse(right.startsAt) - Date.parse(left.startsAt);
    return Date.parse(left.startsAt) - Date.parse(right.startsAt);
  });
}

/**
 * Builds an OpenStreetMap deep link for a venue, used when the map itself is not loaded yet.
 * @param venue the venue
 * @returns an OSM URL that opens the same place
 */
export function osmLink(venue: EventVenue): string {
  return `https://www.openstreetmap.org/?mlat=${venue.latitude}&mlon=${venue.longitude}#map=${venue.zoom}/${venue.latitude}/${venue.longitude}`;
}

/**
 * Builds an embeddable OSM static-map style URL for a venue thumbnail.
 * Attribution is rendered next to it wherever it is used (PART 06.06).
 * @param venue the venue
 * @param width image width in pixels
 * @param height image height in pixels
 * @returns a URL for the venue thumbnail
 */
export function venueThumbnail(venue: EventVenue, width = 640, height = 320): string {
  const delta = 0.01;
  const bbox = [
    venue.longitude - delta,
    venue.latitude - delta,
    venue.longitude + delta,
    venue.latitude + delta,
  ].join('%2C');
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${venue.latitude}%2C${venue.longitude}&zoom=${venue.zoom}&size=${width}x${height}&bbox=${bbox}`;
}
