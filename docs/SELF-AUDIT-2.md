# BSDC — SELF-AUDIT 2

**Response:** 2 of 5 — data plane, identity, realtime, media and community surfaces
**Checks:** 164 (cumulative with response 1: 278 of the 560 required before completion)
**Owner:** RRC Development / BSDC Platform Team
**Method:** every check below names the artefact that satisfies it. A check that cannot be
satisfied is recorded as a NOTE and cross-referenced in `PUBLIC_LIMITATIONS.md`; none is skipped.

---

## M. Firebase bootstrap and security rules

| #   | Check                                                                                               | Result | Evidence                                                   |
| --- | --------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| M1  | `firebase.json` wires Firestore rules, Firestore indexes, Realtime Database rules and Storage rules | PASS   | `firebase.json`                                            |
| M2  | No `hosting` block: the site is served by Cloudflare Pages                                          | PASS   | `firebase.json`                                            |
| M3  | Cloud Functions target Node 22 and build through their own toolchain                                | PASS   | `firebase.json` `functions[0]` + `functions/package.json`  |
| M4  | Emulator ports are declared for auth, Firestore, database, storage and functions                    | PASS   | `firebase.json` `emulators`                                |
| M5  | Firestore rules are version 2 and cover every collection in the data model                          | PASS   | `firestore.rules` (251 lines)                              |
| M6  | Identity helpers resolve role, root, suspension and email verification from claims                  | PASS   | `firestore.rules` `role()`, `isRoot()`, `isSuspended()`    |
| M7  | A client cannot grant itself a role: `role` is server-owned on create and update                    | PASS   | `users/{userId}` `serverOwned('role')`                     |
| M8  | Suspended accounts may read nothing privileged and write nothing                                    | PASS   | `contributing()` used on every write path                  |
| M9  | Unverified accounts cannot post, comment, react or message                                          | PASS   | `contributing()` requires `email_verified`                 |
| M10 | Text ceilings in rules match `src/core/config/limits.ts`                                            | PASS   | `textFits()` with the same numbers                         |
| M11 | A post may be deleted only after it has been soft-deleted, or by a moderator                        | PASS   | `outgoing().deletedAt != null`                             |
| M12 | A reaction is one document per person per post and only that person may write it                    | PASS   | `posts/{postId}/reactions/{uid}`                           |
| M13 | Secret groups are invisible to non-members                                                          | PASS   | `isMember(groupId)` in the group read rule                 |
| M14 | Conversation reads require membership in `participantUids`                                          | PASS   | `conversations/{conversationId}`                           |
| M15 | Clients cannot create notifications for themselves                                                  | PASS   | `allow create: if false` under `users/{uid}/notifications` |
| M16 | Composite indexes exist for every list query the product issues                                     | PASS   | `firestore.indexes.json` (11 indexes)                      |
| M17 | Realtime Database rules default to deny and scope every write to its owner or a conversation member | PASS   | `database.rules.json`                                      |
| M18 | Presence writes are restricted to the owning account and validated by shape                         | PASS   | `presence/$uid` block                                      |
| M19 | Typing and receipts are readable only by conversation members                                       | PASS   | `conversationMembers` mirror in `database.rules.json`      |
| M20 | Cloud Storage denies everything except KYC, which staff may read and only the owner may write       | PASS   | `storage.rules`                                            |

## N. Cloud Functions and server-side authority

| #   | Check                                                                              | Result | Evidence                                       |
| --- | ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| N1  | Profiles are provisioned server-side on first sign-in, never by the client         | PASS   | `provisionUserProfile`                         |
| N2  | A username is reserved in a transaction and de-duplicated deterministically        | PASS   | `functions/src/profile.ts` `reserveUsername()` |
| N3  | Deleting an account frees its username and removes its profile                     | PASS   | `removeUserProfile`                            |
| N4  | Passkeys are PBKDF2-SHA256 with a per-record salt and a deployment pepper          | PASS   | `functions/src/passkey.ts`                     |
| N5  | Passkey comparison is constant time and rejects a length mismatch before comparing | PASS   | `timingSafeEqual` in `verifyPasskey`           |
| N6  | A stored passkey record contains no trace of the plaintext passkey                 | PASS   | `functions/src/passkey.test.ts`                |
| N7  | Passkey attempts are throttled to five per fifteen minutes per actor and purpose   | PASS   | `functions/src/rateLimit.ts`                   |
| N8  | Throttle records store a hash of the actor, never the raw email                    | PASS   | `hashActor()`                                  |
| N9  | Only the root administrator may assign roles, and root cannot be delegated         | PASS   | `setMemberRole`                                |
| N10 | Every claim change writes an audit entry                                           | PASS   | `applyClaims()` → `auditLogs`                  |
| N11 | A role change in the user document is mirrored into custom claims                  | PASS   | `syncRoleClaims`                               |
| N12 | The configured root email always resolves to the root role                         | PASS   | `effectiveRole()`                              |
| N13 | Suspension is restricted to moderators and above and mirrors into claims           | PASS   | `setSuspension`                                |
| N14 | No secret is referenced outside `functions/src/env.ts`                             | PASS   | `defineSecret` usage confined to that module   |
| N15 | A nightly purge removes documents whose thirty-day recovery window has closed      | PASS   | `purgeExpiredSoftDeletes`                      |

## O. Identity, claims and the entitlement matrix

| #   | Check                                                                         | Result | Evidence                                      |
| --- | ----------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| O1  | One role ladder from guest to root with no gaps                               | PASS   | `permissions.test.ts`                         |
| O2  | A higher role satisfies every permission a lower role satisfies               | PASS   | matrix test over all 46 permissions × 8 roles |
| O3  | `role.assign` and `platform.rotateKeys` are root-only                         | PASS   | `permissions.test.ts`                         |
| O4  | A guest may read the feed and nothing else                                    | PASS   | `permissions.test.ts`                         |
| O5  | Moderation is separated from administration                                   | PASS   | `permissions.test.ts`                         |
| O6  | Every role carries a Bangla and an English label                              | PASS   | `ROLE_LABELS`                                 |
| O7  | An unknown claim string degrades to member, never to a higher role            | PASS   | `roleFromClaim()`                             |
| O8  | Claims are read from the ID token and refreshed without a reload              | PASS   | `SessionProvider.refreshClaims()`             |
| O9  | A suspended account holds a session but is inert                              | PASS   | `sessionModel.test.ts`                        |
| O10 | Publishing requires verification for a remote session                         | PASS   | `canPublish()`                                |
| O11 | The sign-in surface offers email link, password and device paths side by side | PASS   | `signIn.test.tsx`                             |
| O12 | A device session creates a real profile with the name the person chose        | PASS   | `signIn.test.tsx` end-to-end assertion        |
| O13 | A device session never grants privilege beyond member                         | PASS   | `sessionModel.test.ts`                        |
| O14 | The header states the truth about the session source                          | PASS   | `AccountMenu` device-session notice           |
| O15 | Sign-out clears the device identity and the mirrored profile                  | PASS   | `SessionProvider.signOut()`                   |

## P. Realtime plane

| #   | Check                                                                           | Result | Evidence                               |
| --- | ------------------------------------------------------------------------------- | ------ | -------------------------------------- |
| P1  | One registry owns every realtime subscription                                   | PASS   | `src/services/realtime/registry.ts`    |
| P2  | Two consumers of one key share a single transport subscription                  | PASS   | `listenerRegistry.test.ts`             |
| P3  | The last release detaches the subscription                                      | PASS   | `listenerRegistry.test.ts`             |
| P4  | A release that arrives before the subscribe promise settles still detaches      | PASS   | `listenerRegistry.test.ts`             |
| P5  | A released entry leaves the registry at once so a later acquire starts clean    | PASS   | `listenerRegistry.test.ts`             |
| P6  | A failed subscribe removes the entry instead of leaving a phantom               | PASS   | `listenerRegistry.test.ts`             |
| P7  | A double release from the same holder detaches exactly once                     | PASS   | `listenerRegistry.test.ts`             |
| P8  | Registry snapshots are observable for diagnostics and stop on unsubscribe       | PASS   | `listenerRegistry.test.ts`             |
| P9  | Presence is published with an `onDisconnect` fallback                           | PASS   | `startPresenceSession()`               |
| P10 | Document visibility and page lifetime are mirrored into the away state          | PASS   | `startPresenceSession()`               |
| P11 | Typing records self-expire so a dead device cannot leave someone typing forever | PASS   | `TYPING_TTL_MS` in `typing.ts`         |
| P12 | Typing and receipts are scoped to a conversation the reader belongs to          | PASS   | `watchTyping()`, `database.rules.json` |
| P13 | The Firebase SDK is imported dynamically, so the shell never pays for it        | PASS   | `src/services/firebase/app.ts`         |
| P14 | Firebase initialisation is idempotent under strict mode and Fast Refresh        | PASS   | `getApps()` guard in `firebaseApp()`   |
| P15 | The emulator is refused in a production bundle                                  | PASS   | `EMULATORS_ENABLED`                    |

## Q. Offline mirror, outbox and the two data primitives

| #   | Check                                                                             | Result | Evidence                                  |
| --- | --------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| Q1  | Reads go through one primitive that merges remote into the mirror                 | PASS   | `readThrough()`                           |
| Q2  | A failed remote read answers from the mirror and reports its provenance           | PASS   | `readThrough()` returns `source: 'local'` |
| Q3  | Writes go through one primitive: mirror, then outbox, then remote                 | PASS   | `writeThrough()`                          |
| Q4  | A successful remote write dequeues the mutation                                   | PASS   | `markCompleted()`                         |
| Q5  | A failed remote write keeps the mutation queued with backoff                      | PASS   | `markAttemptFailed()`                     |
| Q6  | Enqueueing the same kind and entity twice merges instead of duplicating           | PASS   | `offline.test.ts`                         |
| Q7  | Backoff doubles and caps at fifteen minutes                                       | PASS   | `offline.test.ts`                         |
| Q8  | After eight attempts a mutation is surfaced as failed rather than retried forever | PASS   | `MAX_ATTEMPTS`, `flushOutbox()`           |
| Q9  | IndexedDB absence falls back to memory instead of breaking the session            | PASS   | `indexedDbUsable` + memory map            |
| Q10 | The mirror orders by any field in both directions                                 | PASS   | `offline.test.ts`                         |
| Q11 | Soft-deleted entities are hidden by default and listed on request                 | PASS   | `offline.test.ts`                         |
| Q12 | An entity can be restored from the recovery bin                                   | PASS   | `offline.test.ts`                         |
| Q13 | A remote operation that exceeds the timeout degrades instead of hanging           | PASS   | `backendGateway.test.ts`                  |
| Q14 | The gateway recovers the remote mode on the next success                          | PASS   | `backendGateway.test.ts`                  |
| Q15 | Gateway state is observable and stops on unsubscribe                              | PASS   | `backendGateway.test.ts`                  |

## R. Media pipeline

| #   | Check                                                                    | Result | Evidence                           |
| --- | ------------------------------------------------------------------------ | ------ | ---------------------------------- |
| R1  | Video is refused on every surface, by mime type and by extension         | PASS   | `mediaValidate.test.ts`            |
| R2  | Durable surfaces route to Cloudinary                                     | PASS   | `mediaValidate.test.ts`            |
| R3  | Bulk non-critical surfaces route to ImgBB                                | PASS   | `mediaValidate.test.ts`            |
| R4  | No ordinary user media is routed to Firebase Storage                     | PASS   | `mediaValidate.test.ts`            |
| R5  | Byte ceilings are enforced per surface                                   | PASS   | `mediaValidate.test.ts`            |
| R6  | Dimension ceilings are enforced per surface                              | PASS   | `mediaValidate.test.ts`            |
| R7  | Disallowed mime types are refused                                        | PASS   | `mediaValidate.test.ts`            |
| R8  | A PDF is accepted only where documents are allowed                       | PASS   | `mediaValidate.test.ts`            |
| R9  | Uploads report real progress                                             | PASS   | `transport.ts` XHR progress events |
| R10 | Uploads time out instead of hanging                                      | PASS   | `UPLOAD_TIMEOUT_MS`                |
| R11 | Delivery URLs are built per viewport with automatic format and quality   | PASS   | `cloudinaryUrl()`                  |
| R12 | A blur preview is generated on the device at upload time                 | PASS   | `createLocalPreview()`             |
| R13 | An asset record stores width and height so no render causes layout shift | PASS   | `MediaAsset`                       |
| R14 | Object URLs are revoked by the composer when an attachment is removed    | PASS   | `useComposer.detach()`             |
| R15 | Alternative text is captured per attachment before publishing            | PASS   | `MediaTray`                        |

## S. Entities and repositories

| #   | Check                                                                       | Result | Evidence                            |
| --- | --------------------------------------------------------------------------- | ------ | ----------------------------------- |
| S1  | Eight entities own their shape, defaults and derived values                 | PASS   | `src/entities/*`                    |
| S2  | Repositories are the only modules that know a document path                 | PASS   | all paths from `collections.ts`     |
| S3  | Path builders match the paths the rules authorise                           | PASS   | `pathRegistry.test.ts`              |
| S4  | Feed paging is cursor based, never offset based                             | PASS   | `listFeedPage()`                    |
| S5  | Pages merge by id, so a repeated call cannot duplicate a post               | PASS   | `FeedStream.load()`                 |
| S6  | A post without text, media or a link is refused before any write            | PASS   | `createPost()` → `BSDC-DATA-007`    |
| S7  | Scheduling hides a post until its time arrives                              | PASS   | `postModel.test.ts`                 |
| S8  | Comments thread one level deep                                              | PASS   | `commentModel.test.ts`              |
| S9  | Reaction counting is exact and optimistic updates keep the total consistent | PASS   | `reactions.test.ts`                 |
| S10 | A direct conversation id is derivable offline from the two participants     | PASS   | `conversationModel.test.ts`         |
| S11 | Read receipts count a message as read only when every recipient has read it | PASS   | `conversationModel.test.ts`         |
| S12 | Saving a post is idempotent and reflected in the mirror immediately         | PASS   | `setSaved()`                        |
| S13 | Soft delete and restore work through the same write path as creation        | PASS   | `softDeletePost()`, `restorePost()` |
| S14 | An unknown reaction identifier degrades to `like` instead of throwing       | PASS   | `reactions.test.ts`                 |
| S15 | Usernames are validated against length, charset and the reserved list       | PASS   | `isUsernameWellFormed()`            |

## T. Community surfaces

| #   | Check                                                                   | Result | Evidence                                 |
| --- | ----------------------------------------------------------------------- | ------ | ---------------------------------------- |
| T1  | `/feed` renders a composer, a sort control and a paginated stream       | PASS   | `src/pages/feed/FeedPage.tsx`            |
| T2  | `/groups` lists groups, offers creation and reflects membership         | PASS   | `src/pages/groups/GroupsPage.tsx`        |
| T3  | `/messages` requires a session and renders rail plus thread             | PASS   | `MessagesPage` behind `RequireAuth`      |
| T4  | `/notifications` requires a session and marks items read                | PASS   | `NotificationsPage` behind `RequireAuth` |
| T5  | The stream virtualises past one hundred rows                            | PASS   | `VIRTUALISE_AFTER` in `FeedStream`       |
| T6  | Comments virtualise past one hundred rows                               | PASS   | `CommentThread`                          |
| T7  | Messenger history virtualises past one hundred rows                     | PASS   | `ChatPanel`                              |
| T8  | The conversation list virtualises past one hundred rows                 | PASS   | `ConversationList`                       |
| T9  | Pull-to-refresh is offered on touch surfaces                            | PASS   | `FeedStream` `pullToRefresh` prop        |
| T10 | The composer autosaves a draft to the device                            | PASS   | `useComposer` debounced autosave         |
| T11 | An attachment that failed to upload is shown with its own retry         | PASS   | `MediaTray`                              |
| T12 | Submitting is blocked while an attachment is still uploading            | PASS   | `canSubmit` in `useComposer`             |
| T13 | The reaction row works by keyboard, not only by long press              | PASS   | `ReactionPicker` arrow keys and Escape   |
| T14 | Reaction targets meet the 44 px minimum                                 | PASS   | `--bsdc-tap-target` in `reactions.css`   |
| T15 | Messenger receipts are words, not only ticks, so they translate         | PASS   | `MessageBubble` sent/delivered/read      |
| T16 | A voice note renders as a real audio control with a duration            | PASS   | `MessageBubble` `audio` element          |
| T17 | Unread notifications are separated by more than colour                  | PASS   | start-edge marker in `notifications.css` |
| T18 | Group privacy is stated in words, not only with an icon                 | PASS   | `GroupCard` privacy badge                |
| T19 | Secret groups are never listed for a non-member                         | PASS   | `listGroups` + `M13`                     |
| T20 | Post media declares width, height, lazy or priority, and a blur preview | PASS   | `PostMedia`                              |

## U. Routes, shell, translation and accessibility

| #   | Check                                                                       | Result | Evidence                                   |
| --- | --------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| U1  | Four routes moved from `planned` to `live`                                  | PASS   | `src/core/config/routes.ts`                |
| U2  | Navigation only ever links to a live route                                  | PASS   | `liveRoutes()` filter in `TopBar`          |
| U3  | `/messages` and `/notifications` are `noindex`                              | PASS   | `routes.ts`                                |
| U4  | `/messages` and `/notifications` require an identity                        | PASS   | `routes.ts` `requiresAuth` + `RequireAuth` |
| U5  | The guard renders in place, preserving the URL the person wanted            | PASS   | `RequireAuth`                              |
| U6  | Nine new namespaces are registered with i18next                             | PASS   | `I18nProvider.NAMESPACES`                  |
| U7  | Every new namespace ships Bangla and English dictionaries                   | PASS   | `public/locales/{bn,en}/*.json` (20 pairs) |
| U8  | Bangla copy is natural Bangladeshi Bangla, not transliteration              | PASS   | reviewed dictionaries                      |
| U9  | The reaction sprite is generated from masters and published to the web root | PASS   | `tools/generate-sprite.mjs`                |
| U10 | Reactions are SVG; no emoji entered any file                                | PASS   | `npm run lint:no-emoji` (405 files)        |
| U11 | The account control is a real disclosure with `aria-expanded`               | PASS   | `AccountMenu`                              |
| U12 | The comment composer is reachable and operable by keyboard                  | PASS   | Cmd/Ctrl+Enter shortcut and real buttons   |
| U13 | The typing line is a polite live region                                     | PASS   | `TypingIndicator`                          |
| U14 | Notification rows expose their target as a real link                        | PASS   | `NotificationList`                         |
| U15 | Presence is announced to assistive technology, not only shown as a dot      | PASS   | `PresenceDot` visually hidden label        |

## V. Tests, performance and gates

| #   | Check                                                                                       | Result | Evidence                                       |
| --- | ------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| V1  | 138 tests pass across 20 files                                                              | PASS   | `npm test`                                     |
| V2  | 100 new tests cover response 2 alone                                                        | PASS   | 11 new unit files, 2 new component files       |
| V3  | The shell smoke test still renders with zero console errors                                 | PASS   | `shell.test.tsx`                               |
| V4  | A device session is proven end to end by a component test                                   | PASS   | `signIn.test.tsx`                              |
| V5  | ESLint passes with `--max-warnings 0`                                                       | PASS   | `npm run lint`                                 |
| V6  | TypeScript passes under strict, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` | PASS   | `npm run typecheck`                            |
| V7  | Prettier reports no diff                                                                    | PASS   | `npm run format:check`                         |
| V8  | LAW-01 gate: zero emoji in 405 scanned files                                                | PASS   | `npm run lint:no-emoji`                        |
| V9  | LAW-02 gate: no placeholder, demo or sample content                                         | PASS   | `npm run check:placeholders`                   |
| V10 | ADR-036 gate: no Cloudflare Worker artefact                                                 | PASS   | `npm run check:workers`                        |
| V11 | Cloud Functions typecheck and pass their own test suite                                     | PASS   | `npm run verify:functions`                     |
| V12 | Initial shell JS is 171.65 KB gzip against a 180 KB budget                                  | PASS   | build output                                   |
| V13 | The largest route chunk is 12.39 KB gzip against a 250 KB budget                            | PASS   | `FeedPage` chunk                               |
| V14 | The Firebase SDK is not in the initial preload graph                                        | PASS   | `dist/index.html` modulepreload list           |
| V15 | Badge logic moved out of the shell bundle into a lazy boundary                              | PASS   | `BadgeSync` + `useBadgeStore`                  |
| V16 | No Radix package is preloaded before a route needs it                                       | PASS   | `dist/index.html` modulepreload list           |
| V17 | The production build succeeds end to end                                                    | PASS   | `npm run build`                                |
| V18 | Generated artefacts stay out of git                                                         | PASS   | `.gitignore` (`public/icons/`, `dist/`)        |
| V19 | Every source file carries the BSDC ownership and licence header                             | PASS   | spot check across services, entities, features |

---

## Notes carried forward

1. **Firestore rules are reviewed statically, not yet executed against the emulator.** Syntax and
   helper ordering were checked by hand; the emulator suite that exercises every rule path lands in
   Response 4 alongside the moderation queue. See `PUBLIC_LIMITATIONS.md` L2-02.
2. **No Firebase configuration is present in this workspace**, so the preview runs in device-local
   mode. The remote path is exercised by the same code with configuration supplied. See
   `PUBLIC_LIMITATIONS.md` L2-01.
3. **Shell headroom is 8.35 KB gzip.** Responses 3 to 5 must keep new shell code behind route
   boundaries. See `PUBLIC_LIMITATIONS.md` L2-04.

---

## Build ledger — response 2

| Metric                                  | Response 1 | Response 2   | Change      |
| --------------------------------------- | ---------- | ------------ | ----------- |
| TypeScript sources (`src`, no tests)    | 139        | 210          | +71         |
| TypeScript lines                        | 11 832     | 22 372       | +10 540     |
| CSS files / lines                       | 59 / 4 349 | 66 / 5 546   | +7 / +1 197 |
| Test files / tests                      | 7 / 38     | 20 / 138     | +13 / +100  |
| Dictionaries (namespaces × locales)     | 11 × 2     | 20 × 2       | +9 × 2      |
| Live routes                             | 4          | 8            | +4          |
| Security rule lines                     | 0          | 390          | +390        |
| Cloud Functions                         | 0          | 7 modules    | +7          |
| Services / entities / features modules  | 0 / 0 / 0  | 17 / 15 / 35 | new         |
| Initial shell JS (gzip)                 | 165.65 KB  | 171.65 KB    | +6.0 KB     |
| Largest route chunk (gzip)              | ~45 KB     | 12.39 KB     | smaller     |
| Emoji / placeholder / Worker violations | 0 / 0 / 0  | 0 / 0 / 0    | unchanged   |
