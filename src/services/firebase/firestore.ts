/**
 * BSDC — src/services/firebase/firestore.ts
 * Purpose : Thin, typed helpers over the Firestore SDK: conversion, paging and timestamps.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Firestore is the durable source of truth (ADR-018). Repositories in src/entities use these
 *   helpers and never import the SDK directly, so a pagination bug is fixed in one place and the
 *   SDK surface stays behind a single boundary.
 *   Timestamps are normalised to ISO strings at this boundary: storing a Firestore Timestamp in
 *   application state would leak the SDK into every component.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from '@/core/errors/AppError';

import type { Timestamp, DocumentSnapshot, QuerySnapshot } from 'firebase/firestore';

/**
 * Converts a Firestore value into a plain JSON-compatible value.
 * @param value raw value
 * @returns a plain value
 */
export function normaliseValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map((entry) => normaliseValue(entry));
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(source)) output[key] = normaliseValue(source[key]);
    return output;
  }
  return value;
}

/**
 * Converts a document snapshot into a typed record including its id.
 * @param snapshot Firestore document snapshot
 * @returns the record, or undefined when the document does not exist
 */
export function fromDocument<T>(
  snapshot: DocumentSnapshot,
): (T & { readonly id: string }) | undefined {
  if (!snapshot.exists()) return undefined;
  return { ...(normaliseValue(snapshot.data()) as T), id: snapshot.id };
}

/**
 * Converts a query snapshot into an array of typed records.
 * @param snapshot Firestore query snapshot
 * @returns the records in query order
 */
export function fromQuery<T>(snapshot: QuerySnapshot): readonly (T & { readonly id: string })[] {
  return snapshot.docs
    .map((document) => fromDocument<T>(document))
    .filter((entry): entry is T & { readonly id: string } => entry !== undefined);
}

/**
 * Builds the id of the last document in a page, used as the next cursor.
 * @param snapshot Firestore query snapshot
 * @returns the last document id, or null when the page was empty
 */
export function lastCursor(snapshot: QuerySnapshot): string | null {
  const last = snapshot.docs[snapshot.docs.length - 1];
  return last?.id ?? null;
}

/**
 * Converts an ISO timestamp into a Firestore Timestamp.
 * @param iso ISO-8601 string
 * @returns a Firestore Timestamp
 */
export async function toTimestamp(iso: string): Promise<Timestamp> {
  const { Timestamp } = await import('firebase/firestore');
  return Timestamp.fromDate(new Date(iso));
}

/**
 * Returns a Firestore server-timestamp sentinel.
 * @returns the sentinel value
 */
export async function serverTimestamp(): Promise<unknown> {
  const { serverTimestamp: sentinel } = await import('firebase/firestore');
  return sentinel();
}

/**
 * Translates an SDK failure into a BSDC AppError with a stable code.
 * @param error thrown value
 * @param operation short description of the attempted operation
 * @returns an AppError
 */
export function translateFirestoreError(error: unknown, operation: string): AppError {
  if (error instanceof AppError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied'))
    return new AppError('BSDC-AUTH-002', { operation }, error);
  if (code.includes('unauthenticated')) return new AppError('BSDC-AUTH-001', { operation }, error);
  if (code.includes('unavailable')) return new AppError('BSDC-NET-005', { operation }, error);
  if (code.includes('deadline-exceeded') || code.includes('cancelled')) {
    return new AppError('BSDC-NET-002', { operation }, error);
  }
  if (code.includes('already-exists')) return new AppError('BSDC-DATA-006', { operation }, error);
  return new AppError('BSDC-DATA-001', { operation }, error);
}
