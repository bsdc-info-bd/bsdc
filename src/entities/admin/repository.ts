/**
 * BSDC — src/entities/admin/repository.ts
 * Purpose : The administrator's reads and writes: flags, roles, the audit trail and the bin.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Everything that changes somebody else's standing goes through a Cloud Function, and
 *   every one of those calls needs the passkey or a root claim. The screen can therefore show a
 *   control it has no power to exercise — and that is the point: the toggle disables itself when
 *   the server says no, rather than the client deciding in advance who is allowed to ask.
 *   Reads are the exception. Flags are public (the shell needs them before it renders anything),
 *   the audit trail is admin-only and server-written, and the bin reads the device mirror first so
 *   an operator sees their own deletions even with no network.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { acquireListener, type Unsubscribe } from '@/services/realtime/registry';
import { mirrorList, mirrorPut } from '@/services/offline/mirror';
import { callFunction } from '@/services/backend/callable';
import { validateFlagWindow, type FlagState } from '@/core/config/flags';
import { isRecoverable, sortRecovery, type RecoveryEntry } from './recovery';
import { filterAudit, type AuditEntry, type AuditFilter } from './audit';

/**
 * A flag row in the device mirror. The mirror keys every row on `id`, and the Firestore document
 * id of a flag is its key, so the row simply carries both.
 */
type FlagRow = FlagState & { readonly id: string };

/**
 * Widens a flag state into a mirror row.
 * @param state the flag state
 * @returns the row
 */
function toFlagRow(state: FlagState): FlagRow {
  return { ...state, id: state.key };
}

/** Audit rows read per page. */
export const AUDIT_PAGE_SIZE = 60;

/** Flags read at once. The whole register is small by design. */
export const FLAG_PAGE_SIZE = 200;

/**
 * Reads the runtime flag register.
 * @returns the flag states
 */
export async function listFlagStates(): Promise<readonly FlagState[]> {
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDocs(collection(db, COLLECTIONS.featureFlags));
    const states = fromQuery<FlagState>(snapshot).filter(
      (state) => typeof state.key === 'string' && state.key.length > 0,
    );
    for (const state of states) void mirrorPut('flags', toFlagRow(state));
    return states;
  } catch (error) {
    throw translateFirestoreError(error, 'admin.flags');
  }
}

/**
 * Reads the flag register already held on this device, for the first paint of the shell.
 * @returns the cached states
 */
export async function peekFlagStates(): Promise<readonly FlagState[]> {
  return await mirrorList<FlagRow>('flags');
}

/**
 * Watches the flag register, so a kill switch reaches open sessions without a reload.
 * @param handler receives the register
 * @returns a release function
 */
export function watchFlagStates(handler: (states: readonly FlagState[]) => void): Unsubscribe {
  return acquireListener('admin:flags', 'flags', async () => {
    const { collection, onSnapshot } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(collection(db, COLLECTIONS.featureFlags), (snapshot) => {
      handler(fromQuery<FlagState>(snapshot));
    });
  });
}

/**
 * Turns a flag on or off, optionally inside a scheduled window.
 *
 * The passkey is required by the server for any flag marked `passkeyRequired`, and is sent here
 * rather than decided here: the client does not know which flags need one, and guessing would let
 * a caller find out by trying.
 *
 * @param state the next state
 * @param passkey the operator's passkey, or an empty string when they have not been asked for one
 * @returns the server's answer
 */
export async function setFlag(
  state: FlagState,
  passkey: string,
): Promise<{ readonly key: string; readonly enabled: boolean }> {
  const window = validateFlagWindow(state.startsAt, state.endsAt);
  if (!window.ok) {
    throw new AppError(window.code, { key: state.key });
  }
  return await callFunction('setFeatureFlag', {
    key: state.key,
    enabled: state.enabled,
    forceOff: state.forceOff,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    note: state.note,
    passkey,
  });
}

/**
 * Assigns a platform role. Only the root administrator may do this, and the server decides.
 * @param uid the account
 * @param role the role
 * @param reason why, recorded in the audit trail
 * @returns the server's answer
 */
export async function assignRole(
  uid: string,
  role: string,
  reason: string,
): Promise<{ readonly role: string }> {
  return await callFunction('assignRole', { uid, role, reason });
}

/**
 * Reads the audit trail, newest first. The rules refuse this read without admin claims.
 * @param filter the operator's filter
 * @returns the entries
 */
export async function listAudit(filter: AuditFilter = {}): Promise<readonly AuditEntry[]> {
  try {
    const {
      collection,
      query: buildQuery,
      orderBy,
      limit,
      getDocs,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDocs(
      buildQuery(
        collection(db, COLLECTIONS.auditLogs),
        orderBy('createdAt', 'desc'),
        limit(AUDIT_PAGE_SIZE),
      ),
    );
    const entries = fromQuery<AuditEntry>(snapshot);
    for (const entry of entries) void mirrorPut('audit', entry);
    return filterAudit(entries, filter);
  } catch (error) {
    throw translateFirestoreError(error, 'admin.audit');
  }
}

/**
 * Watches the audit trail so a second administrator's action appears immediately.
 * @param filter the operator's filter
 * @param handler receives the entries
 * @returns a release function
 */
export function watchAudit(
  filter: AuditFilter,
  handler: (entries: readonly AuditEntry[]) => void,
): Unsubscribe {
  return acquireListener('admin:audit', 'audit', async () => {
    const {
      collection,
      query: buildQuery,
      orderBy,
      limit,
      onSnapshot,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    return onSnapshot(
      buildQuery(
        collection(db, COLLECTIONS.auditLogs),
        orderBy('createdAt', 'desc'),
        limit(AUDIT_PAGE_SIZE),
      ),
      (snapshot) => {
        const entries = fromQuery<AuditEntry>(snapshot);
        for (const entry of entries) void mirrorPut('audit', entry);
        handler(filterAudit(entries, filter));
      },
    );
  });
}

/**
 * Reads the audit trail from the device mirror, for the first paint.
 * @param filter the operator's filter
 * @returns the cached entries
 */
export async function peekAudit(filter: AuditFilter = {}): Promise<readonly AuditEntry[]> {
  return filterAudit(await mirrorList<AuditEntry>('audit'), filter);
}

/**
 * Reads the recovery bin from the device mirror. The bin is assembled locally from soft-deleted
 * mirror rows, which is what lets an operator recover their own work with no network at all.
 * @param now the instant
 * @returns the entries that can still be recovered, soonest purge first
 */
export async function listRecovery(now: Date = new Date()): Promise<readonly RecoveryEntry[]> {
  const entries = await mirrorList<RecoveryEntry>('recovery');
  return sortRecovery(
    entries.filter((entry) => isRecoverable(entry, now)),
    now,
  );
}

/**
 * Restores a soft-deleted item. The server writes the original document back and records the
 * restore in the audit trail.
 * @param kind what kind of thing it is
 * @param entityId the entity id
 * @returns true when the server restored it
 */
export async function restoreItem(kind: string, entityId: string): Promise<boolean> {
  const result = await callFunction('restoreSoftDeleted', { kind, entityId });
  return result.restored;
}

/**
 * Purges an item permanently, before its window closes.
 *
 * The confirmation is the entity id typed back by the operator. A purge that can be triggered by
 * the same single click as a restore is a purge waiting to happen, and there is no undo to appeal
 * to afterwards.
 *
 * @param kind what kind of thing it is
 * @param entityId the entity id
 * @param confirmation the entity id, typed back by the operator
 * @returns true when the server purged it
 */
export async function purgeItem(
  kind: string,
  entityId: string,
  confirmation: string,
): Promise<boolean> {
  if (confirmation.trim() !== entityId.trim()) {
    throw new AppError('BSDC-ADMIN-004', { entityId });
  }
  const result = await callFunction('purgeSoftDeleted', { kind, entityId, confirmation });
  return result.purged;
}
