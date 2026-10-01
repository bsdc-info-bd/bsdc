# BSDC delivery plan

The platform is delivered in 20 build responses. Each response ships complete,
working, wired-up features — never scaffolding for its own sake.

| # | Module | Status |
|---|--------|--------|
| 1 | Foundation and design system | Done |
| 2 | Authentication and identity | Done |
| 3 | Data core: Supabase, RTDB, Firestore, storage | Done |
| 4 | Universal composer and content engine | Done |
| 5 | Feed and 4-stage ranking engine | Done |
| 6 | Social graph and interactions | Done |
| 7 | BSDC Messenger | Done |
| 8 | Communities: groups, channels, pages, events | Done |
| 9 | Jobs, freelance, projects, snippets, playground | Done |
| 10 | Search, notifications and learning | Done |
| 11 | Marketplace part 1 (customer) | Done |
| 12 | Marketplace part 2 (vendor) | Pending |
| 13 | Ads system | Pending |
| 14 | Admin panel core and plugin system | Pending |
| 15 | Admin analytics and PDF reports | Pending |
| 16 | Corporate network I | Pending |
| 17 | Corporate network II (trust empire) | Pending |
| 18 | SEO engine and branding studio | Pending |
| 19 | PWA, i18n, Android, performance | Pending |
| 20 | Verification, audit and launch | Pending |

## Response 1 scope (delivered)

- Monorepo skeleton: 14 web app folders, the Android shell folder and the
  brand library, each documented with its Pages project, domain and access
  model.
- Root governance: `LICENSE.md` (proprietary, legal warning), `SECURITY.md`
  (secret classification plus rotation checklist), `README.md`,
  `CONTRIBUTING.md`, `.gitignore`, Prettier and EditorConfig.
- `main-site`: Vite 5 + React 18 + TypeScript 5 strict project with
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
  `noImplicitOverride`.
- Design tokens for light and dark themes, the Tailwind theme, the Fabric CSS
  helper layer and component styles.
- Brand asset pipeline (`npm run brand`): favicons, PWA icons, maskable icon,
  Apple touch icon, Open Graph and Twitter cards, Android launcher icons —
  all generated from the two source SVGs, nothing committed as binary.
- Design system primitives, layout shell (app bar, bottom tab bar, footer,
  skip link, route progress, offline banner), command palette and toasts.
- Bilingual i18n with key-parity enforced by both types and a unit test.
- PWA manifest, Workbox runtime caching and an explicit update prompt.
- Cloudflare Pages Functions: `/robots.txt` and `/api/health`.
- Security headers and CSP in `public/_headers`.
- CI: secret scan, typecheck, lint, format check, tests, build and a
  250 KB gzip initial-JS budget per app.

## Response 2 scope (delivered)

- Firebase project `bsdc-bd` wired lazily: when the deployment has no Firebase
  configuration the UI shows an honest "not configured" state instead of
  crashing, and every gate (`RequireAuth`, profile page, forms) respects it.
- Email and password sign-up with verification mail, sign-in with a
  "keep me signed in" persistence switch, password reset, and a verification
  screen that can re-send and re-check.
- OAuth with Google, GitHub and Yahoo: popup first, automatic redirect
  fallback when the browser blocks popups, redirect result consumed on return.
- Enumeration-safe error handling: ~30 Firebase codes mapped to bilingual
  messages, unknown email and wrong password share one message, raw codes are
  never shown. Client-side attempt throttling with a visible lockout timer.
- Session store with custom claims (role, vendor, staff), cross-tab
  synchronisation over `BroadcastChannel`, and token refresh handling.
- Four-step onboarding: username claim with debounced availability check,
  profile details, skills and interests, review. Usernames are claimed in a
  Firestore transaction that also releases the previous handle.
- Public member permalink `/@username` with tabs (posts, comments, about,
  badges), profile JSON-LD and privacy-aware indexing.
- Settings with six panels: account, appearance, language, notifications,
  privacy and security (re-authenticated password change, session details).
- App bar account menu, unverified-email reminder banner and safe `next=`
  redirect handling that rejects absolute and protocol-relative targets.
- `POST /api/auth/claims`: a Pages Function that verifies the caller's ID
  token against Google's JWKS with Web Crypto, enforces an owner allowlist,
  and mints custom claims through the Identity Toolkit REST API — no
  firebase-admin dependency in the Workers runtime.
- The Firebase SDK is loaded on demand, so the initial JavaScript budget stays
  far below the 250 KB gzip CI gate.

## Response 3 scope (delivered)

- `supabase/migrations/0001_core_schema.sql`: the `bsdc` helper schema
  (`current_uid()`, `current_role_name()`, `is_staff()`), enums, and the
  `profiles`, `reserved_usernames`, `follows`, `blocks`, `media_assets`,
  `feature_flags`, `reports` and `audit_log` tables with indexes, counter
  triggers and the `claim_username()` security-definer function.
- `supabase/migrations/0002_row_level_security.sql`: RLS enabled everywhere,
  least-privilege policies, and column-level update grants so `role`,
  `status`, counters and reputation can never be written from a browser.
- Identity bridge: the browser sends its Firebase ID token to PostgREST, so
  policies resolve the caller through the JWT `sub` claim. No second password
  and no Supabase Auth user.
- `firebase/firestore.rules` and `firebase/database.rules.json`: deny by
  default, public read for the profile cache and username index, presence and
  typing limited to the owning member with validated shapes.
- Typed data layer: `lib/supabase/types.ts` mirrors the SQL exactly,
  `lib/supabase/client.ts` builds the client lazily with the Firebase token,
  and `lib/supabase/errors.ts` turns Postgrest failures into `DataError` with
  bilingual message keys — SQL state codes never reach a member.
- `profile-service` is now a facade over two interchangeable backends
  (Supabase first, Firestore cache second) behind the interface Response 2
  already used, with best-effort cache mirroring that can never fail a write.
- Realtime: `trackPresence()` with `onDisconnect`, visibility-aware away
  state, and `usePresence()` for watching another member — live on the
  profile page avatar.
- Media pipeline: validation by MIME type and size, Cloudinary for avatars,
  covers, documents and voice notes, imgbb for ordinary images, XHR progress
  reporting, Cloudinary delivery transforms and a `media_assets` record for
  every upload. Wired into settings as a working avatar uploader.
- Plugin registry: `feature_flags` with audience resolution, built-in
  defaults when the database is unreachable, and the `useFeatureFlag` hook.
- Social graph repository (follow, unfollow, block, unblock) ready for
  Response 6, with counters maintained by a database trigger.

## Response 4 scope (delivered)

- `supabase/migrations/0003_content.sql`: one `posts` table for every kind of
  contribution (post, article, question, poll, snippet, media) with a stored
  `tsvector` search column, kind-specific check constraints, author post
  counters, `post_tags`, `post_media`, `post_mentions`, `poll_options`,
  `poll_votes`, `post_revisions`, the curated `tags` vocabulary, and the
  `cast_poll_vote()` and `increment_post_view()` functions.
- `0004_content_rls.sql`: reading goes through `bsdc.can_read_post()`, so
  drafts, follower-only posts and removed posts are filtered by the database.
  Authors write only their own rows; counters and vote totals are revoked
  from the client key.
- Sanitised markdown: `lib/content/markdown.ts` is the only module allowed to
  produce HTML. External links become `nofollow ugc noopener noreferrer`,
  images get lazy loading, and scripts, styles, iframes, forms and event
  handlers are stripped. Code blocks are escaped, then highlighted by a
  lazily loaded highlight.js with fourteen registered languages.
- Universal composer at `/compose`: kind switcher, markdown editor with a
  live preview tab, poll builder, snippet editor with language selector,
  multi-image attachments with alt text, tag input with hashtag suggestions
  pulled from the body, visibility and language selectors, comment and
  sensitivity switches.
- Draft safety: debounced local autosave with an honest status line, an
  explicit offer to restore an abandoned draft, and server drafts as real
  rows with status `draft`.
- Post permalink `/p/:slug` with kind-aware JSON-LD (Article, QAPage,
  TechArticle, DiscussionForumPosting), author card, media gallery, poll
  voting with one ballot per member, reading time, view counting, and
  tag links.
- Tag archive `/tag/:slug` and a reusable `PostCard`, now also powering the
  posts tab on `/@username`.

## Response 5 scope (delivered)

- `supabase/migrations/0005_feed.sql`: `feed_preferences` (algorithm,
  languages, muted tags, sensitivity, hide-seen), `feed_seen` impressions with
  a `prune_feed_seen()` retention job, and `topic_affinity` maintained by a
  trigger on `post_tags` (+3 per tag you publish on, +0.5 per impression,
  capped at 100).
- `public.feed_candidates(p_limit, p_before)` is a stable, security-invoker
  function, so row level security still decides visibility. It returns the
  ranking signals in one round trip: counters, language, sensitivity, whether
  the author is followed, the viewer's affinity, whether the post was already
  seen, and the tag list. Block pairs are excluded in both directions.
- `0006_feed_rls.sql`: preferences, impressions and affinity are owner-only,
  affinity is read-only to its owner because only the security-definer
  functions may write it, and the execute grants are explicit per function.
- `lib/feed/ranking.ts` is the four-stage engine, pure and unit-tested:
  candidates, filtering (mutes, language, sensitivity, seen state, following),
  scoring (recency with a six-hour half-life, affinity, log-scaled quality
  weighted towards conversation, language match, follow boost, seen penalty)
  and diversity (at most two posts per author and three per tag in the primary
  run, the rest demoted rather than dropped). Every post carries the reasons
  it ranked where it did.
- `hooks/use-feed.ts`: an infinite query cursored on the oldest candidate,
  cross-page de-duplication, one impression per post recorded only after it
  has been half on screen, and a polled new-post count.
- Feed UI: For you / Following / Latest tabs on the home route for signed-in
  members, the marketing landing untouched for guests, a sticky new-posts
  pill, an infinite sentinel, and a feed preferences panel in settings.


## Response 6 scope (delivered)

- `supabase/migrations/0007_interactions.sql`: five reaction kinds on one row
  per member per post, so switching reaction never inflates the count;
  threaded `comments` with database-decided depth, thread root and a single
  accepted answer per question; `comment_reactions`; `bookmarks` with optional
  collections; `post_shares` with a channel vocabulary; and `notifications`.
- `bsdc.notify()` is the one place notification policy lives: never notify
  yourself, never notify across a block in either direction, and collapse
  repeats onto one inbox line through a unique index rather than spamming.
  Follows, mentions, reactions, comments, replies, shares and accepted answers
  all route through it from triggers.
- `toggle_reaction`, `toggle_comment_reaction`, `toggle_bookmark`,
  `mark_answer`, `record_share`, `unread_notification_count`,
  `mark_notifications_read` and `post_interaction_state` keep every mutation
  to one idempotent round trip; `post_interaction_state` returns the state of
  a whole page of cards at once.
- `0008_interactions_rls.sql`: comments inherit the visibility of their post
  and are hidden across a block, bookmarks are private, shares are visible to
  staff and their author, the inbox belongs to one member, and the counter
  columns are revoked from the client key.
- `lib/interactions/`: typed repository plus a pure `buildCommentTree()` that
  promotes orphans instead of dropping their subtrees and floats an accepted
  answer to the top.
- UI: reaction bar with a five-way picker, share menu with copy link and five
  networks, bookmark toggle, full comment thread with replies, inline edit,
  moderation delete for the post author, accepted answers for questions, the
  `/notifications` inbox, `/bookmarks`, and an app bar bell with an unread
  badge.
- Bundle discipline held: the interaction repository is reached only through
  dynamic `import()`, because the app bar renders on first paint and must not
  drag the Supabase SDK into the entry chunk.


## Response 7 scope (delivered)

- `supabase/migrations/0009_messaging.sql`: `conversations` (direct or group),
  `conversation_members` with per-member read marker, mute and leave date, and
  `messages` with text, image, file, snippet and system kinds. A direct pair
  is deduplicated by a deterministic sorted `direct_key` with a unique index,
  so opening the same chat twice can never create a second thread.
- `open_direct_conversation()` refuses self-chats and any pair separated by a
  block, and restores membership instead of duplicating it when somebody
  returns after leaving. `create_group_conversation()` caps a group at 256.
- `send_message()` is the only write path for messages: it checks membership,
  writes the row, denormalises the preview and timestamp onto the conversation
  for the sorted inbox, marks the sender as having read their own message, and
  fans one collapsed inbox line out to every member who has not muted.
- `conversation_inbox()` returns the whole list in one round trip — the
  conversation, the other participant for direct chats, the unread count and
  the mute state — and `unread_message_count()` feeds the app bar badge.
- `0010_messaging_rls.sql`: a conversation is visible only to its members and
  a message only to the members of its conversation; direct inserts into
  `messages` stay closed so the activity trigger and notification fan-out can
  never be bypassed; a member may update only their own membership row, and
  only owners and admins may rename a group.
- Realtime split kept honest: durable messages in Postgres, typing signals in
  Realtime Database under `typing/$conversationId/$uid`, written with
  `onDisconnect().remove()` and throttled to one write every three seconds.
- Pure, tested helpers: `groupMessages()` (five-minute runs per sender,
  deleted messages keep their slot), `readCount()` (receipts derived from
  each member's `last_read_at`, one row per member rather than one per
  message), `conversationName()` and `activeTypers()`.
- UI: `/messages` with a list-and-thread layout that collapses to two views
  on narrow screens, read receipts, typing line, Enter to send, tombstoned
  deletes, older-message paging, an app bar badge, and a Send a message
  button on every other member's profile.


## Response 8 scope (delivered)

- `supabase/migrations/0011_communities.sql`: `groups` with three privacy
  levels, `group_members` with a four-rank role ladder, `group_join_requests`,
  `channels` (and a nullable `posts.channel_id`, so a post can have a home
  without disturbing the ordinary feed), `pages` with followers rather than
  members, `events` and `event_rsvps`.
- Privacy is a database concept, not a UI one: `bsdc.can_see_group()` makes a
  secret group invisible to outsiders, a private group visible but closed, and
  a public group readable. Every policy in `0012_communities_rls.sql` is built
  on it, plus `bsdc.can_moderate_group()` for the role ladder.
- `join_group()` encodes the three behaviours — public joins instantly,
  private queues a request, secret refuses — and `decide_join_request()` both
  admits the member and notifies them. `leave_group()` refuses to let the last
  owner walk out and leave a group headless.
- `rsvp_event()` enforces capacity server-side and only `going` answers count
  towards `going_count`, so a limit means something. `create_group()` seeds the
  owner's membership and a general channel, so a new group is never an empty
  shell.
- `group_directory()` and `event_calendar()` each return a whole screen in one
  round trip, including the viewer's own role, pending request or RSVP.
- Pure, tested client logic: `joinAction()` mirrors the database's join rules
  so the button can never promise something the server will refuse;
  `sortMembers()` ranks by role then seniority; `isEventFull()`,
  `isEventLive()` and `groupEventsByDay()` drive the calendar.
- UI: `/groups` directory with contextual join controls, `/g/:slug` with
  channels, members, about and a moderator-only requests queue, and `/events`
  grouped by day with one-tap RSVP and `Event` JSON-LD. Groups and Events are
  now first-class destinations in the app bar and the mobile tab bar.


## Response 9 scope (delivered)

- `supabase/migrations/0013_opportunities.sql`: `jobs`, `gigs`,
  `job_applications`, `gig_proposals`, `projects`, `project_stars` and
  `playground_sketches`, with five new enums (`bsdc_job_type`,
  `bsdc_work_mode`, `bsdc_listing_status`, `bsdc_application_status`,
  `bsdc_experience_level`).
- Money rules live in Postgres, not in a form handler:
  `jobs_salary_range_ordered` and `gigs_budget_ordered` reject an upper bound
  below the lower one, and `jobs_remote_or_city` requires a city unless the
  role is remote. A listing can state no figure at all; nothing is invented
  to fill the gap.
- An application cannot be duplicated (`unique (job_id, applicant_uid)`,
  `unique (gig_id, freelancer_uid)`) and cannot be inserted directly: there is
  no INSERT policy on `job_applications` or `gig_proposals`, so `apply_to_job()`
  and `submit_proposal()` are the only write paths. Both refuse
  self-application and closed or expired listings, and notify the counterpart
  through `bsdc.notify()`.
- An application row is readable only by the applicant, the owner of the
  listing and staff — other candidates cannot see who else applied, only how
  many did.
- Counter columns (`applications_count`, `proposals_count`, `views_count`,
  `stars_count`) are trigger-maintained and revoked from `authenticated`, so a
  client cannot write its own numbers.
- `job_board(limit, work_mode, skill)` returns a whole screen in one round
  trip including the viewer's own `my_status`, and is granted to `anon` so the
  board is indexable. `toggle_project_star()` is idempotent per viewer.
- Pure, tested client logic: `formatSalaryRange()` (collapses an equal band,
  omits what was never stated), `canWithdraw()`/`isApplied()`/`isDecided()`,
  `filterJobs()` and `skillFacets()`.
- The playground never executes code on a server. `buildSandboxDocument()`
  builds a document for an iframe sandboxed to `allow-scripts` only: no
  same-origin, no storage, no session access. TypeScript annotations are not
  stripped, so a TS sketch reports a genuine syntax error instead of
  pretending to run.
- UI: `/jobs` with server-side mode and skill facets plus instant text
  narrowing and `JobPosting` JSON-LD, `/freelance` with budgets and sealed
  proposals, `/projects` with optimistic starring, and `/playground` with a
  sketch library for signed-in members. Jobs and Projects joined the app bar.


## Response 10 scope (delivered)

- `supabase/migrations/0015_learning.sql` and `0016_learning_rls.sql`:
  `courses`, `course_modules`, `lessons`, `enrollments`, `lesson_progress`,
  `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts` and
  `certificates`, with five new enums.
- A learner cannot read the answer key. Row policies cannot hide a column, so
  `revoke select (is_correct) on public.quiz_options` does it outright and
  `grade_quiz_attempt()` reads the key as the definer. A question scores only
  when the chosen set equals the correct set exactly.
- A learner cannot award themselves anything. `certificates` has no insert,
  update or delete policy at all; a certificate is minted inside the grader
  and only when the database itself confirms both a pass and 100% progress.
  `certificates.code` is a human-readable `BSDC-XXXX-XXXX-XXXX` drawn from an
  alphabet with no ambiguous I, O, 0 or 1.
- Progress is counted, not reported: `lesson_progress` rows drive a trigger
  that recomputes `enrollments.progress`, and `progress`, `status` and
  `completed_at` are revoked from `authenticated`. `complete_lesson()` is
  idempotent, so replaying it never inflates a percentage.
- `course_outline()` withholds a lesson body unless the lesson is a free
  preview or the member enrolled, and `verify_certificate()` answers a public
  code lookup with a name, a course and a date — never a uid or an email.
- `supabase/migrations/0017_search.sql`: generated `tsvector` columns on
  profiles, groups, courses, jobs and projects (posts already had one), GIN
  and trigram indexes, and `global_search()` across all six kinds.
- Search runs as the caller, not as a definer, so the ordinary row policies
  decide what can be found: a secret group, an unpublished course or a member
  who turned off discoverability simply are not in the results. The text
  configuration is `simple` on purpose — English stemming would mangle Bangla.
- `search_log` has no uid column by design: the platform records the words
  typed, never who typed them, and `trending_searches()` only surfaces terms
  used at least twice in the last seven days.
- `profiles.notifications` has existed since migration 0001 and the settings
  screen has been writing to it; nothing read it until now.
  `bsdc.notification_allowed()` maps each kind to its switch and
  `bsdc.notify()` consults it, so a muted kind is never stored at all.
  Moderation notices are deliberately unmutable.
- Pure, tested client logic: `courseProgress()`, `nextLesson()`,
  `remainingMinutes()`, `formatDuration()`, `groupLessonsByModule()`,
  `isAnswerSheetComplete()`, `toggleAnswer()`, `isCertificateCode()`,
  `parseQuery()` (understands `in:jobs` without inventing a query language),
  `resultPath()`, `groupByKind()` and `highlight()` (segments, never HTML).
- UI: `/learn` catalogue with `Course` JSON-LD, `/learn/:slug` with outline,
  lesson reader and server-marked quiz, `/verify/:code` public certificate
  verification with `EducationalOccupationalCredential` JSON-LD, `/search`
  with per-kind tabs and shareable `?q=`, and live suggestions inside the
  command palette.


## Response 11 scope (delivered)

- `supabase/migrations/0018_marketplace.sql` and `0019_marketplace_rls.sql`:
  `shops`, `products`, `carts`, `cart_items`, `addresses`, `orders`,
  `order_items`, `wishlist_items` and `product_reviews`, with five new enums.
- All money is an integer number of poisha. There is no floating point in the
  schema and none in the client either; `formatMoney()` is the single place
  that turns poisha into something a person reads.
- **A client never sends an amount.** `place_order()` reads prices from the
  product rows and shipping from the shop row at the moment of checkout; the
  browser contributes an address, a payment method and quantities. `orders`
  carries `check (total = subtotal + shipping - discount)` and `order_items`
  carries `check (line_total = unit_price * quantity)`, so an order that does
  not add up cannot be stored.
- **Stock cannot be oversold.** Each product row is taken `for update` inside
  the same transaction that writes the order, so two buyers racing for the
  last unit are serialised; the loser gets "only N left of X" rather than a
  confirmed order that cannot be filled. `cancel_order()` returns the stock
  to the shelf in the same transaction and reopens an `out_of_stock` product.
- **Only a delivered purchase can be reviewed.** `product_reviews` has no
  insert policy; `submit_review()` looks for a delivered order containing
  that product before it will write anything, and `unique (product_id, uid)`
  makes it one review per buyer, editable but not repeatable.
- Prices and titles are *copied* onto an order, not referenced, so a shop
  changing its catalogue tomorrow cannot rewrite what a customer agreed to
  today. Rating sums, sold counts and order counts are trigger-maintained and
  revoked from `authenticated`.
- A cart lives in Postgres, keyed one per member, and `my_cart()` returns
  live prices with the quantity measured against current stock — so a cart
  cannot quietly promise a price the shop has since changed.
- Addresses are private to the member until checkout copies them onto an
  order the shop must fulfil; `addresses.phone` is checked against the real
  Bangladeshi operator range and `isBangladeshiPhone()` mirrors it exactly.
- Pure, tested client logic: `formatMoney()`, `discountPercent()` (refuses a
  "discount" that raises the price), `averageRating()` (null, never a fake
  zero), `purchaseCeiling()`, `cartTotals()` (shipping charged once per shop
  and waived at the shop's threshold), `canCheckout()`, `groupByShop()`,
  `canCancelOrder()`, `canReviewOrder()`, `orderStepIndex()`, `isPostcode()`.
- UI: `/shop` with server-side sorting and category facets plus `ItemList`
  JSON-LD, `/shop/:slug` with `Product`, `Offer` and `AggregateRating` JSON-LD
  and verified-purchase reviews, `/cart` grouped by shop, `/checkout` with
  address book and payment method, `/orders` with a progress track and
  cancellation. A cart badge joined the app bar.


## Registry coverage so far

Y-001, Y-002, Y-004, Y-006, Y-008, Y-017, Y-018, Y-019, Y-020, Y-022, Y-023,
Y-024, Y-027, Y-028, Y-029, Y-031, Y-032, Y-035, Y-036, Y-040,
W-001, W-002, W-003, W-004, W-005, W-006, W-007, W-008, W-009, W-010, W-014,
W-017, W-018, W-020, W-021, W-023, W-024, W-025,
V-001, V-002, V-003, V-004, V-005, V-007, V-009, V-013, V-020, V-021, V-022,
V-031,
U-003, U-004, U-007, U-009, U-010, U-011, U-013, U-014, U-036,
X-010, X-034, X-045,
L-001 (shell), Z-026 (environment flags foundation).

Response 2 adds:
A-001, A-002, A-003, A-004, A-005, A-006, A-007, A-008, A-009, A-010, A-011,
A-012, A-013, A-014, A-015, A-016, A-017, A-018, A-019, A-020, A-021, A-022,
A-023, A-024, A-025, A-026, A-027, A-028, A-029, A-030,
B-001, B-002, B-003, B-004, B-005, B-006, B-007, B-008, B-009, B-010, B-011,
B-012, B-013, B-014, B-015,
Y-003, Y-005, Y-021, Y-030, W-011, W-012, V-006, V-008, V-010, U-001, U-002,
Z-001, Z-002, Z-003.

Response 3 adds:
C-001, C-002, C-003, C-004, C-005, C-006, C-007, C-008, C-009, C-010, C-011,
C-012, C-013, C-014, C-015, C-016, C-017, C-018, C-019, C-020,
D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, D-009, D-010,
E-001, E-002, E-003, E-004, E-005, E-006, E-007, E-008,
Z-004, Z-005, Z-026 (registry storage), U-015, U-016, V-011, V-012.

Response 4 adds:
F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011,
F-012, F-013, F-014, F-015, F-016, F-017, F-018, F-019, F-020, F-021, F-022,
F-023, F-024, F-025,
G-001, G-002, G-003, G-004, G-005, G-006, G-007, G-008, G-009, G-010,
H-001, H-002, H-003, H-004, H-005, H-006,
X-011, X-012, X-013, V-014, V-015, U-017.

Response 5 adds:
I-001, I-002, I-003, I-004, I-005, I-006, I-007, I-008, I-009, I-010, I-011,
I-012, I-013, I-014, I-015, I-016, I-017, I-018, I-019, I-020,
J-001, J-002, J-003, J-004, J-005, J-006, J-007, J-008, J-009, J-010,
K-001, K-002, K-003, K-004, K-005, K-006,
X-014, X-015, V-016, U-018, Z-006.

Response 6 adds:
L-002, L-003, L-004, L-005, L-006, L-007, L-008, L-009, L-010, L-011, L-012,
L-013, L-014, L-015, L-016, L-017, L-018, L-019, L-020,
M-001, M-002, M-003, M-004, M-005, M-006, M-007, M-008, M-009, M-010, M-011,
M-012,
N-001, N-002, N-003, N-004, N-005, N-006, N-007, N-008,
X-016, X-017, V-017, V-018, U-019, U-020.

Response 7 adds:
O-001, O-002, O-003, O-004, O-005, O-006, O-007, O-008, O-009, O-010, O-011,
O-012, O-013, O-014, O-015, O-016, O-017, O-018, O-019, O-020, O-021, O-022,
O-023, O-024, O-025,
P-001, P-002, P-003, P-004, P-005, P-006, P-007, P-008,
X-018, X-019, V-019, U-021, Z-007.

Response 8 adds:
Q-001, Q-002, Q-003, Q-004, Q-005, Q-006, Q-007, Q-008, Q-009, Q-010, Q-011,
Q-012, Q-013, Q-014, Q-015, Q-016, Q-017, Q-018, Q-019, Q-020, Q-021, Q-022,
R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-009, R-010,
S-001, S-002, S-003, S-004, S-005, S-006, S-007, S-008, S-009, S-010, S-011,
S-012,
X-020, X-021, V-020, U-022, Z-008.

Response 9 adds:
T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011,
T-012, T-013, T-014, T-015, T-016, T-017, T-018, T-019, T-020, T-021, T-022,
T-023, T-024, T-025,
AA-001, AA-002, AA-003, AA-004, AA-005, AA-006, AA-007, AA-008, AA-009,
AA-010, AA-011, AA-012,
AB-001, AB-002, AB-003, AB-004, AB-005, AB-006, AB-007, AB-008,
AC-001, AC-002, AC-003, AC-004, AC-005, AC-006,
X-022, X-023, V-023, U-023, Z-009.

Response 10 adds:
AD-001, AD-002, AD-003, AD-004, AD-005, AD-006, AD-007, AD-008, AD-009,
AD-010, AD-011, AD-012, AD-013, AD-014, AD-015, AD-016, AD-017, AD-018,
AD-019, AD-020,
AE-001, AE-002, AE-003, AE-004, AE-005, AE-006, AE-007, AE-008, AE-009,
AE-010,
AF-001, AF-002, AF-003, AF-004, AF-005, AF-006, AF-007, AF-008, AF-009,
AF-010, AF-011, AF-012,
AG-001, AG-002, AG-003, AG-004, AG-005, AG-006,
X-024, X-025, V-024, V-025, U-024, Z-010.

Response 11 adds:
AH-001, AH-002, AH-003, AH-004, AH-005, AH-006, AH-007, AH-008, AH-009,
AH-010, AH-011, AH-012, AH-013, AH-014, AH-015, AH-016, AH-017, AH-018,
AH-019, AH-020, AH-021, AH-022, AH-023, AH-024, AH-025,
AI-001, AI-002, AI-003, AI-004, AI-005, AI-006, AI-007, AI-008, AI-009,
AI-010, AI-011, AI-012, AI-013, AI-014, AI-015,
AJ-001, AJ-002, AJ-003, AJ-004, AJ-005, AJ-006, AJ-007, AJ-008,
AK-001, AK-002, AK-003, AK-004, AK-005, AK-006,
X-026, X-027, V-026, U-025, Z-011.
