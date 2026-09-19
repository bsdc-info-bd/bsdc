# BSDC — Data model

**Owner:** RRC Development / BSDC Platform Team
**Scope:** Firestore (durable), Realtime Database (ephemeral), Cloud Storage (KYC only)
**Companions:** `src/core/config/collections.ts`, `firestore.rules`, `database.rules.json`,
`storage.rules`, `firestore.indexes.json`

---

## 0. The one rule

Firestore holds anything a person would be upset to lose. The Realtime Database holds only what is
worthless tomorrow. Cloud Storage holds KYC documentation and nothing else, because Firebase
Storage is not the media store for user content (LAW-05).

Every path in this document is built by a function in `src/core/config/collections.ts`. A literal
path in a component is a defect, not a shortcut.

---

## 1. Firestore — durable collections

### `users/{uid}`

| Field                   | Type                          | Notes                                     |
| ----------------------- | ----------------------------- | ----------------------------------------- |
| `uid`                   | string                        | Equals the document id                    |
| `username`              | string, 3–30, `^[a-z0-9._]+$` | Reserved words are unclaimable            |
| `displayName`           | string ≤ 60                   | Latin-script name                         |
| `displayNameBn`         | string ≤ 60                   | Shown when the viewer reads Bangla        |
| `photoUrl`              | string                        | Cloudinary delivery URL                   |
| `headline`              | string ≤ 120                  |                                           |
| `bio`                   | string ≤ 320                  |                                           |
| `locale`                | `bn` \| `en`                  |                                           |
| `region` / `district`   | string                        | Division and district ids                 |
| `website`               | string                        |                                           |
| `role`                  | Role                          | Server-owned; mirrored into custom claims |
| `suspended`             | boolean                       | Mirrored into custom claims               |
| `skills`                | string[]                      |                                           |
| `socialLinks`           | map                           |                                           |
| `privacy`               | map                           | Visibility and disclosure switches        |
| `onboardingComplete`    | boolean                       |                                           |
| `createdAt`/`updatedAt` | timestamp                     |                                           |
| `deletedAt`             | timestamp \| null             | Soft delete; purged after 30 days         |

Subcollections: `saved/{postId}`, `drafts/{draftId}`, `notifications/{notificationId}`,
`devices/{deviceId}`.

Created by the `provisionUserProfile` Cloud Function on first sign-in, never by the client, so the
`role` field can never be self-granted.

### `usernames/{username}`

`{ uid, claimedAt }`. Readable by anyone so the composer can check availability without a function
call; writable only by the claiming account.

### `posts/{postId}`

Author identity is denormalised (`authorUsername`, `authorDisplayName`, `authorDisplayNameBn`,
`authorPhotoUrl`, `authorRole`, `authorVerified`) so rendering a feed page costs one read instead
of one read per card. Denormalised fields are refreshed by a Cloud Function; they are a rendering
hint and never an authorisation input.

| Field                   | Type                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `authorUid`             | string                                                                                     |
| `body`                  | string ≤ 100 000                                                                           |
| `language`              | `bn` \| `en` \| `mixed`                                                                    |
| `visibility`            | `public` \| `followers` \| `group` \| `private`                                            |
| `groupId`               | string, empty for a feed post                                                              |
| `media[]`               | `{ kind, url, provider, remoteId, width, height, bytes, alt, blurPreview, dominantColor }` |
| `tags[]`                | string[]                                                                                   |
| `linkUrl` / `linkTitle` | string                                                                                     |
| `counts`                | `{ comments, reactions, shares, saves, views }`                                            |
| `pinned`                | boolean                                                                                    |
| `editedAt`              | timestamp \| null                                                                          |
| `scheduledFor`          | timestamp \| null — the post is invisible until this time                                  |
| `publishedAt`           | timestamp \| null                                                                          |
| `deletedAt`             | timestamp \| null                                                                          |

Subcollections: `comments/{commentId}`, `reactions/{uid}`.

### `posts/{postId}/comments/{commentId}`

`{ authorUid, authorUsername, authorDisplayName, authorDisplayNameBn, authorPhotoUrl, authorRole,
body ≤ 4 000, language, parentId, counts: { reactions, replies }, editedAt, deletedAt }`.
`parentId` is empty for a top-level comment. The view threads one level deep (ADR-071).

### `posts/{postId}/reactions/{uid}`

`{ type, createdAt }` where `type` is one of the ten reactions. Keying by uid makes "one reaction
per person" structural rather than remembered (ADR-072).

### `groups/{groupId}`, `groups/{groupId}/members/{uid}`

Group: `{ name, slug, description, coverUrl, avatarUrl, privacy, category, region, district, rules,
tags[], ownerUid, memberCount, postCount, requiresApproval }`.
Member: `{ uid, role: 'member' | 'manager', joinedAt, notifications, deletedAt }`.
`privacy` is `public`, `closed` or `secret`; the difference is enforced in rules, not in the UI.

### `conversations/{conversationId}`, `.../messages/{messageId}`

Conversation: `{ kind, title, participantUids[], participantNames[], participantPhotos[],
avatarUrl, lastMessagePreview, lastMessageAt, lastMessageSenderUid, unread: { uid: number } }`.
Message: `{ clientId, senderUid, senderName, senderPhotoUrl, kind, body ≤ 8 000, attachment,
replyToId, deliveredTo[], readBy[], editedAt, deletedAt }`.
A direct conversation id is `[a, b].sort().join('--')` (ADR-073), so it can be computed offline.

### `mediaAssets/{assetId}`

`{ ownerUid, context, provider, url, remoteId, width, height, bytes, alt, blurPreview,
dominantColor, deleteUrl }`. Width and height are stored so every render can emit them and never
cause layout shift.

### `reports/{reportId}`, `auditLogs/{logId}`, `appConfig/{docId}`, `featureFlags/{flagKey}`, `rateLimits/{id}`, `passkeys/{purpose}`

`appConfig` and `featureFlags` are world-readable and admin-writable. `auditLogs` and
`rateLimits` are admin-only. `passkeys` is written by an operator and read only inside Cloud
Functions.

---

## 2. Realtime Database — ephemeral plane

| Path                                          | Shape                                    | Written by                       |
| --------------------------------------------- | ---------------------------------------- | -------------------------------- |
| `presence/{uid}`                              | `{ state, lastChanged, device, locale }` | the account, with `onDisconnect` |
| `typing/{conversationId}/{uid}`               | `{ at }`, self-expiring after 4 s        | the account                      |
| `conversationMembers/{conversationId}/{uid}`  | boolean                                  | members                          |
| `receipts/{conversationId}/{messageId}/{uid}` | `{ state: 'delivered' \| 'read', at }`   | the recipient                    |
| `notificationFanout/{uid}/{notificationId}`   | `{ type, read, at }`                     | Cloud Functions                  |
| `liveCounters/{entityId}`                     | `{ views, reactions, comments }`         | Cloud Functions                  |
| `liveEvents/{scope}`                          | broadcast payload                        | Cloud Functions only             |

Nothing here is a source of truth. If it is lost, the worst outcome is a dot that fails to turn
green.

---

## 3. Cloud Storage

`/kyc/{uid}/{file}` — owner may upload (≤ 10 MB, PNG/JPEG/WebP/PDF), staff may read, nobody else
may read or write. Every other path is denied outright.

---

## 4. Custom claims

`{ role, root, suspended, verifiedCreator }`, written only by `applyClaims` in Cloud Functions and
mirrored into `users/{uid}`. The client reads them; only the server sets them (ADR-065).

---

## 5. Soft delete and recovery

Deleting any post, comment, group or media asset writes `deletedAt`. The item leaves every list at
once and remains restorable for thirty days. `purgeExpiredSoftDeletes` runs daily at 03:00
Asia/Dhaka and removes records whose `deletedAt` has aged out (ADR-069).
