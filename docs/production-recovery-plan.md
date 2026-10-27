# BSDC production recovery and community excellence plan

Date: 2026-10-26. Baseline: `0351206`. Implementation branch: `arena/dd8d1419-bsdc`.

## Executive decision

Reliability and privacy come before adding more features. BSDC already has fourteen web applications, an Android shell, two Firebase identity projects and a large SQL API. More screens without authorization, transactional writes and browser acceptance tests will multiply the current problems.

This is a repository investigation, not a penetration test of the deployed website. Outbound access in this environment does not include the production Cloudflare, Firebase, Supabase or media-provider hosts. No live accounts, credentials, migrations or customer data were used. No claim that every production error has been found or fixed is justified.

The executable audit's original `103 passed / 0 failed` result did not mean the application worked: baseline unit tests had two failures, and the SQL review uncovered production write failures that its checks never executed. Source-string checks and feature counts are inventory, not acceptance evidence.

## Findings and first implementation

| ID | Priority | Evidence / reproduction | Change and verification |
|---|---|---|---|
| SEC-01 | P0 | `0011` adds `posts.channel_id`; the latest post read policy in `0050` never checks the channel's group. Insert policy also ignores membership/read-only channels. | Migration 0068 adds channel-aware read/write guards. SQL proof t41 checks stranger/anonymous denial and member/moderator success. |
| SEC-02 | P0 | `seo_for_path` is SECURITY DEFINER; non-public posts previously returned their actual title/body excerpt with only a noindex flag. Sitemaps also ignored channel privacy. | 0068 makes non-public post metadata generic and excludes private channel posts from sitemap lists/counts. This is not a full review of all metadata kinds. |
| AUTH-01 | P1 | Bootstrap email checks treated six OAuth provider names as proof even without email verification. | Edge and SQL reduce fallback providers to Google/Apple; other providers require the verified email flag. Negative GitHub regression added. Deployment must apply both halves. |
| DATA-01 | P1 | SEO, redirect, branding and error-resolution RPCs call a four-argument `bsdc.audit`; only the three-argument function existed. A real `set_redirect` write fails with function-not-found. | 0068 supplies an internal four-argument adapter, revokes direct browser execution, and delegates to existing append-only audit. t41 executes redirect, SEO override and brand save successfully. |
| ADS-01 | P1 | `ad_creatives_target_url_check` uses `{4,500}`; PostgreSQL regex repetition bounds cannot exceed 255. `add_creative` fails with invalid repetition count. | Replace with explicit length check plus unbounded whitespace-free HTTPS regex. t41 creates a creative and submits the funded campaign. |
| AUTH-02 | P1 | A database-promoted member cannot synchronize a different role through the token-only self-bootstrap branch. | Add own-account role sync verified by a token-authenticated `my_role()` call. Client-provided role alone grants nothing. This does not solve token revocation/demotion globally. |
| EDGE-01 | P1 | `_rpc`, RSS and homepage edge fetches always put the public key in Bearer authorization, including modern non-JWT `sb_publishable_*` keys. | Shared public-header builder omits Bearer for modern gateway keys; public runtime binding aliases supported. Three new edge regression tests. |
| EDGE-02 | P2 | Middleware performs redirect database lookups for `/sw.js`, fonts, manifests and feeds. | Bypass known asset/feed extensions and `.well-known`. Keep API/auth bypass. |
| SEC-03 | P2 | Redirect writer accepted arbitrary external hosts; existing stored destinations also reached edge redirects unchecked. | Writer and edge restrict external redirects to HTTPS BSDC domains. External partner redirects now require a reviewed policy change. Existing third-party rows are not deleted. |
| OPS-01 | P1 | Admin overview counts pending shops/campaigns but there is no pending submission read model. | Add staff-only queue RPCs and TypeScript contracts. **Review UI is still outstanding**, not delivered by these RPCs. |
| TEST-01 | P2 | Baseline event tests use October 15 as an upcoming date, which expired by October 26. | Freeze Date.now in that test fixture; do not change real ended-event behavior. |
| DATA-02 | P2 | Group post counter had no post trigger. | Maintain published, non-deleted channel-post counts and reconcile existing groups when applying 0068. |

### First-batch evidence

- Main-site unit tests: **824 passed across 64 files**.
- Application and Pages Functions strict typechecking: passed.
- ESLint at zero warnings: passed.
- Production build: passed, 211 precache entries and 13 prerendered routes.
- Full database suite on final tree: **24/24 harnesses passed**. The historical pre-trash fixture explicitly omits 0068 because it intentionally omits the `deleted_at` prerequisite from 0050. t41 passes 30 checks including migration reapplication.
- Prettier checks for all main-site sources, Functions and changed proof scripts: passed.
- No browser E2E, Firebase emulator suite, live IAM/OAuth, real upload, production apply, Android device test or sibling-app gate run is claimed.

## Second implementation batch — parent-scoped child reads

Migration `0069_post_child_read_privacy.sql` adds restrictive SELECT policies to
`post_tags`, `post_media`, `post_mentions`, `poll_options` and `poll_votes`.
Each checks the parent post through the caller's RLS rather than an elevated
helper. Restrictive policies also constrain existing permissive author `FOR ALL`
policies, preventing those alternate read paths from bypassing the guard.
Existing write permissions and service-role maintenance are unchanged.

The new `t42.mjs` proof first removes the guards to reproduce the private-draft
leak in all five tables, then reapplies the migration and checks anonymous,
stranger, author, follower and private-group member access. It also checks
membership revocation, trash, removed posts and two migration reapplications.
**102 checks passed; the complete database suite passed 25/25 harnesses.**
Main-site typecheck, lint, 824 unit tests, production build and changed-script
Prettier checks passed again after this batch.

This closes the five direct child-table read leaks, not all media privacy issues:
`media_assets` management fields, already-public provider URLs, elevated RPCs,
notifications and aggregate counts still require independent review. No production
migration, live provider test or browser acceptance test was performed.

Release: review and apply 0068 before 0069 using the established staging migration
workflow. 0069 changes policies only and rewrites no data. Do not roll back by
simply removing these guards: doing so reproduces the demonstrated leak. Fix
forward or disable affected reads if a staging compatibility issue is found.

## Third implementation batch — private columns and current account authority

Implemented on 2026-10-27; **production release remains blocked** by the remaining
items below and unperformed staging/browser acceptance.

- `0070_private_columns_are_not_public_reads.sql` replaces browser table-level
  SELECT grants with explicit display-column allowlists. `media_assets.delete_token`
  is write-only to browser clients; `events.join_url` is available only through the
  existing authorized `event_detail` RPC. Raw `SELECT *`, filtering by the secret,
  and ordering by it fail closed. Service-role behavior is unchanged.
- The media repository now requests explicit display fields rather than `*` on
  upload recording and listing. The credential field is optional in its TypeScript
  contract because browser reads intentionally omit it. External table consumers
  must likewise replace `SELECT *`; never restore the secret grant for compatibility.
- `0071_current_account_authority.sql` removes the cached `staff` claim fallback
  from `is_staff`. `actor_role` now denies elevated authority to inactive profiles
  and missing subjects, including inactive verified-email bootstrap accounts.
  Database promotions and first-sign-in verified-email bootstrap still work.
- `t43` passes **35 checks**: raw-column denial, filter/order denial, display reads,
  host/attendee join-link access and RSVP revocation, upload recording, event
  creation and migration reapplication.
- `t44` passes **47 checks**: promotion without fresh claims, immediate demotion,
  suspension/deactivation/deletion, privileged profile RLS, absent profiles/subjects,
  bootstrap status restrictions and migration reapplication.
- Final complete database gate: **27/27 harnesses passed**. Main-site **824 tests
  across 64 files**, typecheck, lint, build and source/Functions formatting passed.

Apply 0068–0071 in sequence in staging first. These changes do not revoke existing
Firebase tokens, fix independent-project UID collisions, or promise that every
legacy permission path uses `actor_role`; those remain review requirements. Public
media URLs also remain public at the external host. No production apply, browser
acceptance, provider integration or sibling-app release gate is claimed.

## Fourth implementation batch — bounded edge requests and platform-wide gates

Added a shared streaming byte limiter and bounded object JSON parser. Claims,
telemetry, push-content and reverse-geocode endpoints use it; telemetry skips
malformed collection entries. Upload multipart parsing and the Firebase auth
proxy now have enforced byte ceilings. Added 26 tests covering the limiter and
actual endpoint rejection behavior, with edge tests included in the normal suite.

Added `scripts/release-check.mjs` and executed all package gates: **98/98 passed
across all 16 packages**. After final main-site changes, its seven gates passed
again; current aggregate is **1,156 unit tests** (850 main-site), with **27/27
database harnesses**. This supersedes earlier batches' lack of sibling-package
execution, but not their lack of browser, provider, native Android or production
acceptance. See [release readiness](release-readiness.md) for the package matrix,
reproduction command and explicit remaining blockers. No production apply occurred.

## Fifth implementation batch — actual Chromium public-browser acceptance

Ran a real Chromium binary with desktop and Pixel 7 mobile emulation, not a
physical device or Android OS emulator. Reproduced overlapping header links at
768–1280px and blank playground execution. Replaced overlapping navigation with
an accessible compact/dialog layout, added mobile language access, and replaced
inline/srcdoc JavaScript execution with an opaque-origin, terminable worker in a
sandboxed Function document. No relaxation of application CSP was introduced.

**47 browser checks passed**, with default/repeated execution, loop termination,
storage/network denial, inert markup, navigation/keyboard behavior at six widths,
and 11 public routes in desktop/mobile contexts. Browser tests now have a CI
workflow. Main-site **854/854 unit tests**, strict typecheck, lint, formatting and
production build passed. Other package gates remain previous-batch evidence.

These are local, unconfigured public-surface checks; live authentication,
providers, PWA/offline, physical devices and staging/production acceptance remain
unperformed. See [browser acceptance](browser-acceptance.md) for exact reproduction,
evidence, limitations and remaining release requirements.

## Remaining risks: next work, not assertions of completion

### P0 — private information and authorization

1. Review all SECURITY DEFINER reads, particularly metadata for secret groups, unpublished courses/products, inactive profiles and editorial overrides. A noindex flag is not access control. Anonymous responses must contain no private title, excerpt, media or existence signal where secrecy is required.
2. Direct child-table reads are now parent-scoped by 0069 (see second batch). Audit elevated RPCs, notifications, aggregate counts and media asset URLs/delete tokens; separate public display data from owner-only management credentials. Already-public hosted bytes cannot be made private by SQL alone.
3. Direct event-table join-link reads are closed by 0070. Continue auditing other elevated reads and live attendee/host journeys; hiding a link in one RPC is insufficient if another endpoint returns the raw column.
4. Cached staff-claim bypass in `is_staff` is closed by 0071, with inactive-account restrictions in `actor_role`. Review all other legacy staff/vendor permission paths and use project-qualified identities; database changes do not revoke Firebase tokens.
5. Audit main/corporate Firebase UID namespaces: identical raw UIDs across independent projects must not accidentally identify the same database principal.
6. Supabase broadcast/presence channels are not automatically protected by table RLS. Implement private-channel authorization before claiming messenger typing/presence is membership-private.

### P1 — production correctness

1. Make post/project publishing atomic. Current multi-request parent update + delete/reinsert side-table writes can partially commit and erase poll votes during edits. Introduce a transactional, invoker-safe save RPC, stable poll option IDs and idempotency key; test rollback on every failing step.
2. Corporate session bootstrap: consoles currently send Firebase tokens without ensuring PostgREST's authenticated claim. Add a tested shared bootstrap transport and runtime bindings, await readiness, and guard stale profile results on sign-out/account switch.
3. Complete shop/ad/payout review UI with actual creative inspection, explicit rejection reasons, per-action permissions, audit rows and pending/error states. Wallet top-up needs verified finance workflow and unique reference idempotency, never an unaudited balance input.
4. Bounded parsing is implemented for upload/vitals/claims/push-content/geocoder and auth-proxy bodies in the fourth batch. Add distributed rate limits and request deadlines; body bounds alone do not stop many concurrent valid-sized requests.
5. Validate upload signatures and purpose-kind compatibility server-side. Current MIME/size checks do not inspect magic bytes. Add distributed quota/rate limits and provider deadlines. Public unsigned Cloudinary uploads need provider-enforced restrictions; a client switch is not an abuse barrier.
6. Harden JWT verification: one implementation, algorithm/kid/type checks, bounded token size, issued/auth time validation, subject bounds, JWKS caching/deadlines and revocation strategy for sensitive actions. Neither existing verifier proves revocation.
7. Firestore cache writes contain `coverUrl`, which completed-profile rules do not allow. Align rules and payloads, protect username/profile index consistency using getAfter, and avoid publicly readable preference documents. Test using Firebase emulators before deploying rules.
8. Correct push deployment variable wiring (`VITE_PUSH_VAPID_PUBLIC_KEY` versus legacy FCM key); restrict push-service destinations and redirect behavior to prevent SSRF; scope delivery acknowledgements per device; ensure notification-click paths cannot escape origin.
9. “Sign out everywhere” currently calls ordinary logout. Rename truthfully until a recent-authenticated server revocation flow exists.

### P2 — browser usability and quality

- Desktop navigation has ten entries competing with signed-in action icons; test widths 768–1440 and replace overflow with accessible navigation rather than hiding it.
- Key messenger views by conversation ID; verify drafts, reply/edit state, attachments and pending sends cannot carry into another conversation.
- Isolate query caches on account changes, cancel stale requests, clear privileged data before rendering another identity. Test guest/member/staff transitions, not only logged-out reloads.
- Fix playground execution under real CSP: current srcdoc inline scripts conflict with the parent policy, and generated JavaScript closing markup needs browser verification. Use an isolated runner origin/worker with strict network denial and execution timeout; never loosen application CSP globally.
- Settings saves must wait for success, preserve failed drafts and serialize preference updates. Presence must honor privacy and handle permission errors without unhandled rejections.
- Distinguish unavailable, forbidden, not found, empty and failed states. A network error must not be shown as “no posts” or “no permission”.
- Self-hosted usable fonts, consistent 12px text floor, keyboard menus/dialogs, visible focus, touch targets, reduced motion and screen-reader announcements need rendered acceptance, not grep checks.

## Delivery sequence and acceptance gates

### Phase A — establish trusted measurements

Build a route/role/data-flow inventory and a tracked defect register. Record exact commit, environment, network status and reproduction for every bug. Separate confirmed reproduction, code-evidenced risk and untested deployment hypothesis. Add Playwright tests on production builds served with actual Cloudflare-equivalent headers/functions. Capture redacted console/network failures, screenshots and traces only on failure. Use local synthetic data and emulators, not customer records.

### Phase B — release blockers

Complete P0 privacy, authoritative authorization and transactional write work. Test anonymous, member A, member B, group member, moderator, demoted staff, suspended user and owner. Include raw table/RPC requests bypassing the UI. Apply migrations from empty schema and a production-shaped staging snapshot, then reapply to verify safety. Document data repair and rollback before approval.

### Phase C — essential community journeys

Each journey needs success, validation refusal, permission refusal, offline retry, double-click and reload tests:

- Email/OAuth signup, verification, onboarding, username collision/change, profile/avatar/cover persistence and account switching.
- Publish/edit/delete/restore posts, polls and projects with multiple images; no duplicate rows or lost attachments after retry.
- Follow, bookmark, reactions, answers, blocks and reports, with privacy and moderation effects verified server-side.
- Discover/join/leave groups; restricted channels, requests and moderator decisions; channel reading and publishing.
- Direct/group chat, media/audio, reply/edit/delete, unread markers, archive/mute, reconnect, expired token and revoked membership.
- Event RSVP/capacity/timezone, job application/withdrawal and gig proposals, including expired and closed listings.
- Search visibility, empty states, keyboard palette, notifications and opt-in push.
- Shop approval, products, stock, order totals, concurrent checkout/cancellation, payout/account data and finance audit.
- Staff moderation and role/status changes with immediate denial for revoked permissions.

### Phase D — differentiated, useful features

Only build these after the underlying journey passes:

1. Developer portfolio with project changelogs, contribution calls and verifiable skills without manufactured reputation.
2. Bengali/English technical knowledge spaces with solved Q&A, code formatting, peer review and accessible publishing.
3. Mentorship matching with consent, availability, safety reporting and measurable successful sessions.
4. Local chapters/events, hackathons and contributor matching; moderation and organizer tooling before gamification.
5. Career tools: saved job searches, application tracking, clear paid/free disclosures and scam reporting.
6. High-quality learning paths with real assessments, progress integrity and revocable certificates.
7. Member-controlled recommendations with explanations, mute/block controls, chronological mode and privacy-preserving analytics.
8. Trustworthy marketplace with dispute handling, refunds, seller verification and transparent commission rules before automated payments.

“Best in the world” is a product ambition, not a technical acceptance criterion. Track task completion, publish success, time to first useful interaction, report response time, accessibility defects and retention with consent—not number of screens or badges.

## Release and operations

1. Back up and rehearse restore in staging; inspect migration ledger and unresolved deployment notes.
2. Review 0068, particularly redirect-domain restriction and group counter reconciliation. Apply through the established migration workflow; no historical SQL file was edited.
3. Deploy edge and client together; verify public Supabase bindings and claims credentials. Optional database-role sync needs the edge's public Supabase URL/key too.
4. Verify live smoke tests with authorized synthetic accounts and real headers. Record external console dependencies without copying credentials.
5. Deploy Firebase rules only after emulator tests and compatible client changes; this batch does not change rules.
6. Roll out with explicit owner approval and monitor auth failures, write failures, 5xx, upload failures and permission denials. Keep previous web artifact available. A rollback must not reopen private data access.
7. Rotate historically exposed secrets through provider consoles. Source changes do not revoke previously published credentials.
8. No automated production migration/deploy or live-data repair was executed in this investigation.

See [the reusable implementation prompt](./bsdc-master-implementation-prompt.md) for the execution contract.
