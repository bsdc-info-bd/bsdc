# BSDC account lifecycle requests

## What this phase implements

The native app now provides an authenticated **request** workflow for:

- a BSDC data-export request; and
- an account-erasure review request.

It is intentionally not labelled “Download my data” or “Delete account now.” A full export/erasure must cover Firestore, Realtime Database, Firebase Auth, Cloudinary media, reports, message-safety considerations, backups, retention obligations, and jurisdiction-specific review. Claiming that a button completed those operations before such a system exists would be misleading and unsafe.

## Security model

The client cannot create or alter lifecycle records directly. Firestore Rules deny all writes to `accountLifecycleRequests`. The only creation/cancellation path is through trusted callable Functions:

- `submitAccountLifecycleRequest`
- `cancelAccountLifecycleRequest`

Those Functions require all of the following:

1. a signed-in Firebase user;
2. the current Admin-issued `legalAcceptanceVersion` custom claim; and
3. an `auth_time` no older than ten minutes.

The last condition requires a member to sign out and sign in again before creating or cancelling a sensitive request. It prevents a long-lived session on an unlocked/shared device from being enough to initiate an account-lifecycle process.

The persisted record is account-bound and written by the Admin SDK:

```text
accountLifecycleRequests/{uid}
  requesterId: uid
  requestType: EXPORT | ERASURE
  state: PENDING | CANCELLED | ACKNOWLEDGED
  requestedAt: server timestamp
  cancelledAt: server timestamp (when applicable)
  acknowledgedAt / acknowledgedBy / staffNote: trusted operations fields
```

The requester can read their own request after current legal acceptance. Only trusted `admin` operators—not all moderators—can read operations records. A member may cancel only while the request is still pending. The app does not expose a client-side completion state.

## Required operations before marking anything complete

A production lifecycle team needs a reviewed, auditable procedure that at least addresses:

- authenticated requester verification and applicable legal basis;
- scoped export generation, encryption, expiration, and secure delivery;
- Firestore profile/content/subcollections and Realtime Database conversation/message handling;
- Firebase Authentication disable/deletion ordering and recovery window;
- Cloudinary asset deletion or documented lawful retention, using server-only credentials;
- reports, fraud/abuse evidence, legal holds, backups, and retention schedules;
- audit events, appeal/support handling, and operator separation of duties.

The source does not provide a magic server secret or a hard-coded owner. Use the protected Firebase setup and least-privilege custom-claim process in [`FIREBASE_PRODUCTION_SETUP.md`](FIREBASE_PRODUCTION_SETUP.md) before operating this workflow.
