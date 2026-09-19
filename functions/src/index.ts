/**
 * BSDC — functions/src/index.ts
 * Purpose : Cloud Function entry points. Everything that must be trusted runs here (LAW-03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   Region is asia-south1 for callable and Firestore triggers, matching the Firestore location.
 *   Passkey material is handled exclusively by functions/src/passkey.ts behind secrets; the
 *   plaintext passkey exists only for the duration of one HTTPS request and is never logged.
 *   Cloud Functions are the only server-side compute in the architecture: BSDC uses no
 *   Cloudflare Worker at any point (ADR-036).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import functionsV1 from 'firebase-functions/v1';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { PASSKEY_PEPPER, ROOT_PASSKEY_HASH, ROOT_PASSKEY_SALT, PASSKEY_ITERATIONS } from './env';
import { clearAttempts, recordAttempt } from './rateLimit';
import { verifyPasskey, type PasskeyRecord } from './passkey';
import { applyClaims, effectiveRole, isStaffRole, rankOf, type Role } from './claims';
import { provisionProfile, reserveUsername, teardownProfile, usernameStem } from './profile';

initializeApp();

const REGION = 'asia-south1';

/** Collections that support soft delete, each with the field that marks it. */
const SOFT_DELETABLE: readonly { readonly collection: string; readonly windowDays: number }[] = [
  { collection: 'posts', windowDays: 30 },
  { collection: 'groups', windowDays: 30 },
  { collection: 'mediaAssets', windowDays: 30 },
];

/**
 * Provisions the profile, username and claims for a brand-new account.
 */
export const provisionUserProfile = functionsV1
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    const username = await provisionProfile(user.uid, user.email, user.displayName ?? undefined);
    logger.info('profile provisioned', { uid: user.uid, root: user.email ?? null });
    return { username };
  });

/**
 * Frees the username and removes the profile when an account is deleted.
 */
export const removeUserProfile = functionsV1
  .region(REGION)
  .auth.user()
  .onDelete(async (user) => {
    await teardownProfile(user.uid);
  });

/**
 * Mirrors a role change in the user document into custom claims.
 * The document is the request; this function is the authority.
 */
export const syncRoleClaims = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (before === undefined || after === undefined) return;
    if (before['role'] === after['role'] && before['suspended'] === after['suspended']) return;

    const uid = event.params['uid'] ?? '';
    const stored = (after['role'] ?? 'member') as Role;
    const user = await getAuth().getUser(uid);
    const role = effectiveRole(user.email, stored);
    await applyClaims(uid, role, 'system', {
      suspended: after['suspended'] === true,
      verifiedCreator: after['verifiedCreator'] === true,
    });
  },
);

/**
 * Verifies an administrative passkey.
 * Rate limited to five attempts per fifteen minutes per actor. Never logs the passkey.
 * @param request callable request carrying `{ passkey, purpose }`
 * @returns `{ ok: true, token, expiresAt }` on success
 */
export const verifyAdminPasskey = onCall(
  { region: REGION, secrets: [PASSKEY_PEPPER, ROOT_PASSKEY_HASH], enforceAppCheck: false },
  async (request) => {
    const passkey = request.data?.['passkey'];
    const purpose = request.data?.['purpose'];
    if (typeof passkey !== 'string' || passkey.length === 0) {
      throw new HttpsError('invalid-argument', 'A passkey is required.');
    }
    if (typeof purpose !== 'string' || purpose.length === 0) {
      throw new HttpsError('invalid-argument', 'A purpose is required.');
    }

    const actor =
      request.auth?.uid ?? (request.auth?.token?.['email'] as string | undefined) ?? 'anonymous';
    const throttle = await recordAttempt(actor, `passkey:${purpose}`);
    if (!throttle.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many attempts. Try again after the cooldown window.',
        { retryAt: throttle.retryAt },
      );
    }

    const claims = request.auth?.token;
    const isRoot = claims?.['root'] === true;
    const record: PasskeyRecord = isRoot
      ? {
          salt: ROOT_PASSKEY_SALT.value(),
          hash: ROOT_PASSKEY_HASH.value(),
          iterations: PASSKEY_ITERATIONS,
          updatedAt: '1970-01-01T00:00:00.000Z',
        }
      : (((await getFirestore().doc(`passkeys/${purpose}`).get()).data() as
          PasskeyRecord | undefined) ?? {
          salt: ROOT_PASSKEY_SALT.value(),
          hash: ROOT_PASSKEY_HASH.value(),
          iterations: PASSKEY_ITERATIONS,
          updatedAt: '1970-01-01T00:00:00.000Z',
        });

    const valid = verifyPasskey(passkey, record, PASSKEY_PEPPER.value());
    if (!valid) {
      throw new HttpsError('permission-denied', 'The passkey was not accepted.', {
        attemptsUsed: throttle.attemptsUsed,
        retryAt: throttle.retryAt,
      });
    }

    await clearAttempts(actor, `passkey:${purpose}`);
    await getFirestore().doc(`auditLogs/passkey-${Date.now()}`).set({
      action: 'passkey.verified',
      purpose,
      actorUid: actor,
      createdAt: FieldValue.serverTimestamp(),
    });

    const expiresAt = Date.now() + 30 * 60 * 1000;
    return { ok: true, token: `${purpose}:${actor}:${expiresAt}`, expiresAt };
  },
);

/**
 * Grants or revokes a role. Only the root administrator may call this.
 * @param request callable request carrying `{ uid, role, reason }`
 * @returns the resulting claims
 */
export const setMemberRole = onCall({ region: REGION }, async (request) => {
  if (request.auth?.token?.['root'] !== true) {
    throw new HttpsError('permission-denied', 'Only the root administrator may assign roles.');
  }
  const uid = request.data?.['uid'];
  const role = request.data?.['role'];
  const reason = request.data?.['reason'];
  if (typeof uid !== 'string' || typeof role !== 'string') {
    throw new HttpsError('invalid-argument', 'A target account and a role are required.');
  }
  if (!(rankOf(role as Role) >= 0)) {
    throw new HttpsError('invalid-argument', 'Unknown role.');
  }
  if ((role as Role) === 'root' && request.auth?.uid !== uid) {
    throw new HttpsError('permission-denied', 'The root role cannot be delegated.');
  }

  const actorUid = request.auth?.uid ?? 'system';
  if (isStaffRole(role as Role)) {
    logger.info('staff role granted', { uid, role, actorUid, staffGrant: true });
  }

  const claims = await applyClaims(uid, role as Role, actorUid);
  await getFirestore()
    .doc(`users/${uid}`)
    .set(
      {
        role,
        updatedAt: FieldValue.serverTimestamp(),
        roleReason: typeof reason === 'string' ? reason : '',
      },
      { merge: true },
    );
  return claims;
});

/**
 * Suspends or reinstates an account. Only staff may call this.
 * @param request callable request carrying `{ uid, suspended, reason }`
 * @returns the resulting suspension state
 */
export const setSuspension = onCall({ region: REGION }, async (request) => {
  const actorRole = (request.auth?.token?.['role'] ?? 'member') as Role;
  if (rankOf(actorRole) < rankOf('moderator')) {
    throw new HttpsError(
      'permission-denied',
      'Only moderators and administrators may suspend accounts.',
    );
  }
  const uid = request.data?.['uid'];
  const suspended = request.data?.['suspended'];
  const reason = request.data?.['reason'];
  if (typeof uid !== 'string' || typeof suspended !== 'boolean') {
    throw new HttpsError(
      'invalid-argument',
      'A target account and a suspension flag are required.',
    );
  }
  const stored = (await getFirestore().doc(`users/${uid}`).get()).get('role') as Role | undefined;
  const user = await getAuth().getUser(uid);
  const role = effectiveRole(user.email, stored ?? 'member');
  const claims = await applyClaims(uid, role, request.auth?.uid ?? 'system', {
    suspended,
    verifiedCreator: request.auth?.token?.['verifiedCreator'] === true,
  });
  await getFirestore()
    .doc(`users/${uid}`)
    .set(
      {
        suspended,
        suspensionReason: typeof reason === 'string' ? reason : '',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return claims;
});

/**
 * Claims a username for the calling account.
 * @param request callable request carrying `{ username }`
 * @returns the reserved username
 */
export const claimUsername = onCall({ region: REGION }, async (request) => {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in to choose a username.');
  }
  const desired = request.data?.['username'];
  if (typeof desired !== 'string') {
    throw new HttpsError('invalid-argument', 'A username is required.');
  }
  const stem = usernameStem(desired);
  if (stem.length < 3 || stem.length > 30) {
    throw new HttpsError('invalid-argument', 'A username must be between 3 and 30 characters.');
  }
  const username = await reserveUsername(stem, request.auth.uid);
  await getFirestore()
    .doc(`users/${request.auth.uid}`)
    .set({ username, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { username };
});

/**
 * Turns a feature flag on or off, optionally inside a scheduled window.
 *
 * Two locks, because this is the switch that can take a whole feature away from everybody at once:
 * the caller must hold the admin role, and when the flag is marked `passkeyRequired` the caller
 * must also present the plugin passkey. The passkey is verified against the PBKDF2 record with a
 * five-attempt-per-fifteen-minute limit, and is never written to the document, the log or the
 * response. Both the previous and the next state are written to the audit trail, so a flag can be
 * put back the way it was without anybody having to remember what it was.
 *
 * @param request callable request carrying `{ key, enabled, forceOff, startsAt, endsAt, note, passkey }`
 * @returns the resulting state
 */
export const setFeatureFlag = onCall(
  { region: REGION, secrets: [PASSKEY_PEPPER, ROOT_PASSKEY_HASH] },
  async (request) => {
    const actorRole = (request.auth?.token?.['role'] ?? 'member') as Role;
    if (rankOf(actorRole) < rankOf('admin') && request.auth?.token?.['root'] !== true) {
      throw new HttpsError('permission-denied', 'Only an administrator may change a feature flag.');
    }

    const key = request.data?.['key'];
    const enabled = request.data?.['enabled'];
    const forceOff = request.data?.['forceOff'];
    const startsAt = request.data?.['startsAt'];
    const endsAt = request.data?.['endsAt'];
    const note = request.data?.['note'];
    const passkey = request.data?.['passkey'];
    if (typeof key !== 'string' || key.length === 0 || !/^[a-z][a-zA-Z0-9.]{2,80}$/.test(key)) {
      throw new HttpsError('invalid-argument', 'A valid flag key is required.');
    }
    if (typeof enabled !== 'boolean' || typeof forceOff !== 'boolean') {
      throw new HttpsError('invalid-argument', 'A boolean state is required.');
    }
    const document = await getFirestore().doc(`featureFlags/${key}`).get();
    const existing = document.data() as
      | { enabled?: boolean; forceOff?: boolean; startsAt?: string | null; endsAt?: string | null }
      | undefined;

    // A flag marked passkeyRequired cannot be moved without the passkey. The requirement is read
    // from the stored register, not from the client, so a caller cannot talk their way out of it,
    // and a flag with no recorded requirement is treated as requiring one.
    const passkeyRequired = document.get('passkeyRequired') !== false;
    if (passkeyRequired) {
      if (typeof passkey !== 'string' || passkey.length === 0) {
        throw new HttpsError('permission-denied', 'This flag requires the plugin passkey.');
      }
      const actor = request.auth?.uid ?? 'anonymous';
      const throttle = await recordAttempt(actor, `passkey:plugin`);
      if (!throttle.allowed) {
        throw new HttpsError(
          'resource-exhausted',
          'Too many attempts. Try again after the cooldown window.',
          { retryAt: throttle.retryAt },
        );
      }
      const record: PasskeyRecord = ((await getFirestore().doc(`passkeys/plugin`).get()).data() as
        PasskeyRecord | undefined) ?? {
        salt: ROOT_PASSKEY_SALT.value(),
        hash: ROOT_PASSKEY_HASH.value(),
        iterations: PASSKEY_ITERATIONS,
        updatedAt: '1970-01-01T00:00:00.000Z',
      };
      if (!verifyPasskey(passkey, record, PASSKEY_PEPPER.value())) {
        throw new HttpsError('permission-denied', 'The passkey was not accepted.', {
          attemptsUsed: throttle.attemptsUsed,
        });
      }
      await clearAttempts(actor, 'passkey:plugin');
    }

    const actorUid = request.auth?.uid ?? 'system';
    await getFirestore()
      .doc(`featureFlags/${key}`)
      .set(
        {
          key,
          enabled,
          forceOff,
          startsAt: typeof startsAt === 'string' ? startsAt : null,
          endsAt: typeof endsAt === 'string' ? endsAt : null,
          note: typeof note === 'string' ? note : '',
          updatedByUid: actorUid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    await getFirestore()
      .doc(`auditLogs/flag-${key}-${Date.now()}`)
      .set({
        action: startsAt !== null || endsAt !== null ? 'flag.schedule' : 'flag.toggle',
        actorUid,
        actorRole,
        targetUid: '',
        targetType: 'flag',
        targetId: key,
        before: JSON.stringify({
          enabled: existing?.enabled ?? true,
          forceOff: existing?.forceOff ?? false,
        }),
        after: JSON.stringify({ enabled, forceOff }),
        reason: typeof note === 'string' ? note : '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    logger.info('feature flag updated', { key, enabled, forceOff, actorUid });
    return { key, enabled };
  },
);

/**
 * Restores a soft-deleted document inside its recovery window.
 * @param request callable request carrying `{ kind, entityId }`
 * @returns whether it was restored
 */
export const restoreSoftDeleted = onCall({ region: REGION }, async (request) => {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in to restore an item.');
  }
  const kind = request.data?.['kind'];
  const entityId = request.data?.['entityId'];
  if (typeof kind !== 'string' || typeof entityId !== 'string' || entityId.length === 0) {
    throw new HttpsError('invalid-argument', 'A kind and an entity id are required.');
  }

  const actorRole = (request.auth.token?.['role'] ?? 'member') as Role;
  const isStaff = rankOf(actorRole) >= rankOf('support');
  const document = getFirestore().doc(`${kind}s/${entityId}`);
  const snapshot = await document.get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'That item is not in the recovery bin.');
  }
  const ownerUid = snapshot.get('ownerUid') as string | undefined;
  if (!isStaff && ownerUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Only the owner or staff may restore this item.');
  }
  const deletedAt = snapshot.get('deletedAt') as string | null | undefined;
  if (typeof deletedAt !== 'string' || deletedAt.length === 0) {
    throw new HttpsError('failed-precondition', 'That item was not deleted.');
  }
  const closedAt = Date.parse(deletedAt) + 30 * 24 * 60 * 60 * 1000;
  if (Date.now() >= closedAt) {
    throw new HttpsError('failed-precondition', 'The recovery window for this item has closed.');
  }

  await document.set(
    {
      deletedAt: null,
      restoredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await getFirestore()
    .doc(`auditLogs/restore-${entityId}-${Date.now()}`)
    .set({
      action: 'content.restore',
      actorUid: request.auth.uid,
      actorRole,
      targetUid: ownerUid ?? '',
      targetType: kind,
      targetId: entityId,
      before: 'deleted',
      after: 'restored',
      reason: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { restored: true };
});

/**
 * Purges a soft-deleted document permanently, before its window closes.
 *
 * The caller must type the entity id back as a confirmation. There is no undo, and an operator who
 * is asked to do something irreversible by hand makes fewer irreversible mistakes.
 *
 * @param request callable request carrying `{ kind, entityId, confirmation }`
 * @returns whether it was purged
 */
export const purgeSoftDeleted = onCall({ region: REGION }, async (request) => {
  if (request.auth === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in to purge an item.');
  }
  const kind = request.data?.['kind'];
  const entityId = request.data?.['entityId'];
  const confirmation = request.data?.['confirmation'];
  if (typeof kind !== 'string' || typeof entityId !== 'string' || entityId.length === 0) {
    throw new HttpsError('invalid-argument', 'A kind and an entity id are required.');
  }
  if (confirmation !== entityId) {
    throw new HttpsError(
      'invalid-argument',
      'Type the item id exactly to confirm that it will be deleted permanently.',
    );
  }

  const actorRole = (request.auth.token?.['role'] ?? 'member') as Role;
  const isStaff = rankOf(actorRole) >= rankOf('support');
  const document = getFirestore().doc(`${kind}s/${entityId}`);
  const snapshot = await document.get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'That item does not exist.');
  }
  const ownerUid = snapshot.get('ownerUid') as string | undefined;
  if (!isStaff && ownerUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Only the owner or staff may purge this item.');
  }

  await document.delete();
  await getFirestore()
    .doc(`auditLogs/purge-${entityId}-${Date.now()}`)
    .set({
      action: 'content.purge',
      actorUid: request.auth.uid,
      actorRole,
      targetUid: ownerUid ?? '',
      targetType: kind,
      targetId: entityId,
      before: 'deleted',
      after: 'purged',
      reason: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  logger.info('item purged before window close', { kind, entityId, actorUid: request.auth.uid });
  return { purged: true };
});

/**
 * Purges documents whose recovery window has closed.
 * Runs daily in Asia/Dhaka; the window itself is 30 days (soft delete first, purge after).
 */
export const purgeExpiredSoftDeletes = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Asia/Dhaka', region: REGION, timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let purged = 0;

    for (const entry of SOFT_DELETABLE) {
      const expired = await db
        .collection(entry.collection)
        .where('deletedAt', '!=', null)
        .where('deletedAt', '<=', cutoff)
        .limit(400)
        .get();
      for (const document of expired.docs) {
        await document.ref.delete();
        purged += 1;
      }
    }

    logger.info('soft-delete purge complete', { purged, cutoff: cutoff.toDate().toISOString() });
  },
);
