# BSDC delivery plan

The platform is delivered in 20 build responses. Each response ships complete,
working, wired-up features — never scaffolding for its own sake.

| #   | Module                                          | Status |
| --- | ----------------------------------------------- | ------ |
| 1   | Foundation and design system                    | Done   |
| 2   | Authentication and identity                     | Done   |
| 3   | Data core: Supabase, RTDB, Firestore, storage   | Done   |
| 4   | Universal composer and content engine           | Done   |
| 5   | Feed and 4-stage ranking engine                 | Done   |
| 6   | Social graph and interactions                   | Done   |
| 7   | BSDC Messenger                                  | Done   |
| 8   | Communities: groups, channels, pages, events    | Done   |
| 9   | Jobs, freelance, projects, snippets, playground | Done   |
| 10  | Search, notifications and learning              | Done   |
| 11  | Marketplace part 1 (customer)                   | Done   |
| 12  | Marketplace part 2 (vendor)                     | Done   |
| 13  | Ads system                                      | Done   |
| 14  | Admin panel core and plugin system              | Done   |
| 15  | Admin analytics and PDF reports                 | Done   |
| 16  | Corporate network I                             | Done   |
| 17  | Corporate network II (trust empire)             | Done   |
| 18  | SEO engine and branding studio                  | Done   |
| 19  | PWA, i18n, Android, performance                 | Done   |
| 20  | Verification, audit and launch                  | Done   |

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
- Prices and titles are _copied_ onto an order, not referenced, so a shop
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

## Response 12 scope (delivered)

- `supabase/migrations/0020_vendor.sql` and `0021_vendor_rls.sql`:
  `payout_accounts`, `shop_ledger` and `payouts`, two new enums, the
  fulfilment state machine and the dashboard read models.
- **Order movement is a state machine held in SQL.**
  `bsdc.order_transition_allowed(from, to)` is the only definition of a legal
  move: pending to confirmed or cancelled, confirmed to packed or cancelled,
  packed to shipped or cancelled, shipped to delivered, delivered to
  refunded. Nothing else, and nothing backwards. `advance_order()` locks the
  order, checks that the caller owns the shop or is staff, and delegates a
  cancellation to `public.cancel_order()` so stock returns exactly once.
  `shop_orders()` returns the permitted next statuses with each row, so the
  buttons on the screen are generated from the same rule the write re-checks.
- **Cash is only paid at the door.** Delivering a cash-on-delivery order sets
  `payment_status = 'paid'` automatically, and `mark_order_paid()` refuses a
  cash order that has not been delivered — a vendor cannot record money they
  are not holding.
- **The ledger is append-only.** `shop_ledger` stores poisha with credits
  positive and debits negative, a CHECK fixing the direction of each kind,
  and `unique (order_id, kind)` so an order can only ever settle once.
  `bsdc.settle_order()` credits `subtotal + shipping` and debits
  `subtotal * commission_bps / 10000` — **commission is charged on goods and
  never on the courier's shipping.** There is no insert, update or delete
  policy on the table for anybody; only the definer functions write to it.
- **A payout cannot exceed the balance.** `request_payout()` locks the shop
  row, re-sums the ledger, and writes the payout row and its negative ledger
  entry in one transaction. A rejection writes a compensating `adjustment`
  credit rather than editing the original debit, so the history stays true.
- `shop_payouts()` returns only `right(account_ref, 4)`; a full account
  number is never sent to a screen, and `payout_accounts` is readable only by
  the shop's owner.
- A vendor may set their shipping and their shop's name; `commission_bps`,
  `status` and `approved_at` are revoked at column level, as are direct
  writes to `orders.status`, `products.stock` and `products.status`. Opening
  a shop (`open_shop()`) creates it `pending`, one per owner; `decide_shop()`
  is staff-only and archives a suspended shop's products.
- `publish_product()` refuses a product without an active shop, a summary of
  at least ten characters and at least one image. `restock_product()` is
  additive — a delta, never a replacement — and flips a product between
  `out_of_stock` and `active`.
- Client: `src/lib/vendor/vendor-types.ts` mirrors the transition table and
  the commission arithmetic with integer truncation that matches Postgres,
  `vendor-repository.ts` wraps every RPC, `use-vendor.ts` exposes four hooks,
  and `/vendor`, `/vendor/products`, `/vendor/orders` and `/vendor/payouts`
  are member-only lazy routes with full bilingual copy.
- `src/test/vendor.test.ts` adds 25 tests covering the state machine,
  commission, ledger balances, payout limits and draft validation. The suite
  is 211 tests over 17 files; initial JS is 195.9 KB gzip against the 250 KB
  budget.

## Response 13 scope (delivered)

- `supabase/migrations/0022_ads.sql` and `0023_ads_rls.sql`: `ad_campaigns`,
  `ad_creatives`, `ad_wallet_entries`, `ad_events` and `ad_daily_stats`, with
  five new enums.
- **The advertiser never states a price.** A bid is stored once;
  `bsdc.ad_event_cost()` derives every charge from it, and `record_ad_event()`
  counts the event and spends the money in the same transaction. A cpm bid is
  divided by a thousand with integer truncation that the client mirrors
  exactly, so the figure on the screen is the figure that will be charged.
- **An event can only be counted once.** `ad_events` carries a bucket column
  — the hour for an impression, the day for a click — inside a unique index,
  so a retry, a double render or a refresh is a no-op rather than a second
  charge. A click is refused outright unless that same viewer was served an
  impression of that creative in the previous two hours: a click without a
  view is not a click, it is someone calling an endpoint.
- **Money cannot be spent twice.** The wallet is append-only with no write
  policy for anyone; the campaign row is locked before anything is counted;
  the final charge is clamped to what is left; and the statement that spends
  the last poisha is the statement that marks the campaign `completed`. There
  is no sweep job that could forget to run.
- **A budget must exist before it is promised.** `submit_campaign()` refuses
  to send a campaign for review unless the wallet already covers the
  outstanding budget, and unless at least one creative is enabled. Only staff
  can credit a wallet (`topup_ad_wallet()`), against a payment finance has
  actually seen.
- Review is real: `status`, `spent` and `review_note` are revoked at column
  level, an owner's update policy only applies to a draft or a rejected
  campaign, and `add_creative()` sends a live campaign back to
  `pending_review` — an approved ad is the ad that was approved, not whatever
  replaced it afterwards.
- `serve_ads()` runs as the definer but returns no bid, budget or owner. It
  honours the daily cap at serve time, treats an empty targeting list as
  everyone rather than nobody, and caps the same creative at eight views per
  person per day. It is granted to `anon` so a guest sees a working page.
- Client: `src/lib/ads/ads-types.ts` (pricing, pacing, CTR, eligibility and
  validation, all pure), `ads-repository.ts`, `use-ads.ts`, and
  `components/ads/AdSlot.tsx` — an impression is reported only after the
  creative has been at least half visible for a full second, every ad is
  labelled Sponsored, and the slot renders nothing when there is no eligible
  ad. The `/ads` console covers the wallet, campaign creation with a reach
  forecast, creatives and per-campaign numbers; the shop page carries the
  first live placement.
- `src/test/ads.test.ts` adds 29 tests. The suite is 240 tests over 18 files;
  initial JS is 198.0 KB gzip against the 250 KB budget.

## Response 14 scope (delivered)

- `supabase/migrations/0024_admin.sql` and `0025_admin_rls.sql`:
  `role_permissions`, `admin_settings`, `moderation_actions`, plugin metadata
  on `feature_flags`, and assignment plus resolution columns on `reports`.
- **A permission is a row, not an `if` in a component.** `bsdc.has_permission()`
  reads `role_permissions` against the role on the caller's _profile_ — not a
  JWT claim that might predate a demotion — and every privileged function
  begins with `bsdc.require_permission()`. `my_permissions()` hands the same
  list to the client so the UI and the database agree about what is possible.
- **Privilege escalation is a constraint, not a review item.**
  `set_user_role()` refuses to change your own role, refuses to grant a rank
  at or above your own, refuses to touch anyone who already outranks you, and
  refuses to demote the last owner. `profiles.role` and `profiles.status` are
  revoked from `authenticated`, so those functions are the only path.
- **Every feature is a plugin.** The registry now carries a label, a module,
  a dependency list, a rollout percentage and an `is_core` flag, and is seeded
  with 24 plugins across eight modules. A core plugin cannot be switched off.
  Enabling a plugin whose dependency is off is refused with the names of what
  to enable first; disabling one walks the dependency graph recursively and
  switches off everything standing on it **in the same transaction**, so the
  system is never half on. `plugin_registry()` returns `blocked_by` so the
  panel can state the real reason a plugin is dark.
- **Every administrative act writes its own audit row.** `bsdc.audit()` is
  called inside the transaction that performs the act, and `audit_log` has no
  insert, update or delete policy for anybody — an owner cannot erase what
  they did.
- Moderation is claim-then-close: `claim_report()` gives one moderator
  ownership, `resolve_report()` refuses a report somebody else holds, refuses
  one that is already handled, requires `content.hide` for a hide or restore,
  performs the hide in the same transaction that records the reason, and
  writes an append-only `moderation_actions` row. A reversal is a new row,
  never an edit.
- Client: `src/lib/admin/admin-types.ts` (rank comparison, assignable roles,
  the dependency cascade, a stable FNV-1a rollout bucket, queue ordering),
  repository, `use-admin.ts` with five hooks, and four routes — `/admin`,
  `/admin/plugins`, `/admin/moderation`, `/admin/people` — each of which
  renders a plain refusal rather than an empty page when the permission is
  absent.
- `src/test/admin.test.ts` adds 25 tests. The suite is 265 tests over 19
  files; initial JS is 200.4 KB gzip against the 250 KB budget.

## Response 20 scope (delivered)

- `scripts/audit.mjs`: the launch audit as a program. **107 checkpoints**
  across delivery shape, database, front end, safety, search readiness,
  performance, offline behaviour, tests, continuous integration and
  documentation, each one re-runnable on any commit. A number in a launch
  document is worth exactly what the command that reproduces it is worth.
- `scripts/count-registry.mjs`: the feature registry counted from the tree
  rather than from memory — pages, RPCs, policies, console screens, domain
  rules, plugin flags and edge endpoints, split into core, administration
  and staff.
- `docs/launch-audit.md` and `docs/feature-registry.md`: the output of those
  two commands, with the reasoning that cannot be automated written beside
  it.
- **The audit found real faults, which is the only reason to run one.** Four
  were fixed in this response:
  1. **The verification portal had lost its head.** Re-running the scaffold
     in Responses 18 and 19 overwrote `vf-site/index.html`, taking its
     title, description, canonical link, Open Graph tags and JSON-LD with
     it — the one indexable console had been silently de-indexed for two
     responses. The head is restored, and the scaffold now refuses to
     overwrite any `index.html` marked `bsdc:hand-written`.
  2. **Thirteen consoles shipped with no security headers at all.** Only
     `main-site` had `public/_headers`. Every console now sends a content
     security policy with `script-src 'self'`, `frame-ancestors 'none'`,
     HSTS and, for the eleven private ones, `X-Robots-Tag: noindex`.
  3. **A dependency drifted and broke the build.** No lockfiles are
     committed, so `npm install` resolved `@supabase/supabase-js` 2.117
     against a range written for 2.45; its stricter insert typing exposed
     a product insert writing a column that does not exist
     (`products.image_url`) and a sketch update trying to change its own
     owner. Both were real faults that older types had hidden. The client
     is now pinned exactly in all fifteen packages.
  4. **Three type sizes were below the readable floor.** A 10px tab label
     is not legible on the 250px screens this interface promises to
     support; the screen minimum is now 12px, with the print stylesheet
     explicitly exempt.
- **What the audit asserts, in one line each.** No emoji in any interface
  chrome. No placeholder, demo content or suppression comment anywhere. One
  hundred tables with row level security, 184 policies, every
  security-definer function with a pinned search path. Twenty-eight
  functions an anonymous browser may call, seven of which write, every one
  of them a clamped counter or an append-only log. No key material, no
  tracked `.env`, no service-role key reachable from a browser or from the
  edge. Bangla and English at key parity with 25,133 Bangla code points. No
  horizontal overflow, no blocked zoom, no third-party font, no plain-HTTP
  fetch, alternative text on every image. Initial JavaScript between 100 and
  205 KB gzip against a 250 KB budget, on all fourteen applications.
- 627 tests across the sixteen packages; typecheck, lint, format, test and
  build clean on every one.

## Response 19 scope (delivered)

- `supabase/migrations/0034_performance.sql` and `0035_performance_rls.sql`:
  the measurement schema — `web_vitals`, `client_errors`, `bundle_sizes` and
  the capacity series, with their ingest functions and reader functions.
- **A measurement is attached to a route, never to a person.** There is no
  user column and no session column on `web_vitals`, by design, so the
  performance console cannot quietly become a surveillance console. The
  browser collector carries no identifier either: a test asserts the beacon
  body contains the two keys it is allowed to contain and nothing else.
- **A URL with an identifier in it is not a route.** `bsdc.route_pattern()`
  collapses `/@someone`, UUIDs, slugs and numeric segments, and
  `src/lib/perf/vitals.ts` performs the same reduction _before_ the beacon
  leaves the device, so a private draft's slug never reaches a server log.
  The SQL copy is the second line of defence, not the first.
- **Speed is reported at the 75th percentile, never as an average**, with the
  sample count printed beside it, and a route with fewer than twenty samples
  is labelled as not yet worth believing instead of being ranked.
- **Ingestion is the one door an anonymous browser may write through**, and
  it clamps on the way in: an unknown metric or device is dropped, a CLS over
  10 or a duration over ten minutes is discarded, strings are truncated, and
  the endpoint answers 204 whatever happens — a beacon has nobody to tell,
  and an endpoint that returns errors teaches pages to retry.
- **Errors are grouped by fingerprint**, computed from the message with URLs,
  identifiers and line numbers stripped out, so the same bug in two builds is
  one row rather than two, and a fault that recurs after being closed reopens
  itself.
- **Capacity is a regression, honestly labelled.** `capacity_forecast()`
  reports "not enough days to say anything", "the trend is noisy" or "there
  is no trend, only noise" rather than dressing a weak correlation up as a
  prediction.
- `performance-site` (port 5192): Experience, Edge, Errors and Weight —
  field measurements per route and device with their verdicts in sentences,
  cache behaviour at the edge, the error board ordered by who it affects, and
  bundle weight against budget, with CSV export of anything on screen.
- `moderator-site` (port 5193): the queue in the order the work should be
  done — severity first, overdue second, corroboration third, age last — with
  the decision and its reason taken together, because the reason is published
  to the member and a decision without one is indistinguishable from malice.
  The decisions offered are exactly the four `resolve_report()` accepts.
- `corporate-kit` 0.19.0 adds `domain/perf.ts` (thresholds mirrored from SQL,
  trustworthiness, verdict sentences, sparklines that break on missing days,
  budget arithmetic) and `domain/moderation.ts` (severity table, response
  targets of 1, 4, 24 and 48 hours, queue ordering, queue health and the
  rules a published reason must satisfy).
- `android-app` is now a real package rather than a note: `capacitor.config.ts`,
  the routing rules in `src/links.ts` with the native wiring isolated in
  `src/shell.ts`, and fourteen tests. **A link opens inside the app only if it
  belongs to BSDC** — everything else goes to the system browser where the
  address bar is visible, with look-alike hosts such as
  `bsdc.info.bd.attacker.test` held out by test. A notification with no
  destination says so rather than opening the home page and wasting the tap.
  The native project is generated, not committed; `/.well-known/assetlinks.json`
  is served from an environment variable and serves an empty statement list
  until a release key exists, which is the honest answer.
- Continuous integration now records the gzipped size of each `main-site`
  push into `bundle_sizes`, beside the field measurements, and never fails
  the build if that bookkeeping call cannot be made.
- 627 tests across the sixteen packages, every application builds, and
  `main-site` initial JavaScript is 205 KB gzip against the 250 KB budget.

## Response 18 scope (delivered)

- `supabase/migrations/0032_seo.sql` and `0033_seo_rls.sql`: per-path
  metadata overrides, redirects, brand themes, the sitemap functions and the
  colour arithmetic.
- **A URL is one string.** `bsdc.normalise_path()` lower-cases, drops the
  query, the fragment, duplicate slashes and the trailing slash, and the
  override table stores nothing else — `/About/` and `/about` cannot be given
  two different titles by two different editors. The client mirrors the same
  function, so the console can say what will be stored while it is typed.
- **Metadata is a chain with no empty link.** `seo_for_path()` returns an
  editor's override if there is one, otherwise what the thing at that path
  says about itself, otherwise the site default — and it returns which of the
  three answered, because "where did this title come from?" is the first
  question anybody asks when a search result looks wrong.
- **A redirect loop is refused at write time.** `set_redirect()` rejects a
  destination that is itself redirected, a redirect to itself and a pair that
  would point at each other, so the edge resolves in one hop and a visitor
  never pays for two round trips. Hits are counted: a redirect nobody follows
  can be retired, and a 404 that is hit constantly is a redirect somebody
  forgot to write.
- **Nothing is listed that a crawler would be refused.** `sitemap_urls()`
  applies the same status and visibility conditions the pages themselves use,
  and skips any URL an override marks `noindex`.
- **A theme must be readable before it can be live.** WCAG 2.1 relative
  luminance and contrast are computed in SQL as well as in TypeScript;
  `save_brand_theme()` refuses a palette whose body text falls below 4.5:1,
  and a partial unique index — not a convention — keeps exactly one theme
  active.
- `corporate-kit` 0.18.0 adds `domain/seo.ts` (path canonicalisation, the
  editorial checks, SERP preview, redirect rules, sitemap and robots writers)
  and `domain/brand.ts` (contrast, grades, nine-step shade ramps, token
  validation, CSS emission and a wordmark drawn from the palette).
- `admin-site`: the SEO centre and the branding studio — look up any path,
  see what it is serving and why, override it, move URLs, read the sitemap
  the edge will serve, and edit a palette with its contrast table, live
  preview and generated wordmark beside it.
- `main-site` gains the SEO engine itself (`src/lib/seo/engine.ts`): canonical
  URLs that strip campaign parameters and sort the ones that remain, the list
  of paths that may never be indexed, sitemap, sitemap index, robots and RSS
  writers, and a JSON-LD pruner that drops empty properties rather than
  emitting them.
- **The prerender and the application cannot drift.** `scripts/prerender.mjs`
  writes one real HTML file per public route — its own head, its own JSON-LD
  and a readable summary with links inside `#root` — and a test asserts,
  route by route, that the head it writes is byte-identical to what
  `headTags()` produces, and that the sitemap and robots.txt it writes are
  identical to the engine's. The template's placeholder head is stripped, not
  appended to: a page with two canonical links is worse than a page with none.
- Pages Functions: `_middleware.ts` answers a moved URL with a real 301
  before the application loads and rewrites title, description, canonical and
  share image into the shell for any page whose content lives in the database
  — so a link preview fetcher that runs no scripts still gets the right card;
  `sitemap.xml`, `sitemaps/<section>-<n>.xml`, `rss.xml` and `brand.css`.
  Every one of them runs with the anonymous key and is therefore subject to
  the same row level security a browser is.
- `robots.txt` is now generated into `dist/` at build time rather than served
  by a function, because the one file a crawler fetches before anything else
  should not depend on a database being reachable.
- 229 tests across the thirteen packages, every app builds, and initial
  JavaScript is 173 to 204 KB gzip against the 250 KB budget.

## Response 17 scope (delivered)

- `supabase/migrations/0030_trust.sql` and `0031_trust_rls.sql`: the trust
  schema — certificate templates, issued certificates, notices with a
  publication window and an audience, acknowledgement receipts, and an
  append-only verification log.
- **One code shape for everything the community issues.**
  `BSDC-<KK>-<8 characters>-<check digit>`, where the kind is `CT` for a
  certificate, `NT` for a notice and `ID` for a staff identity card, all
  sharing the `bsdc.card_check_digit()` function introduced in Response 16.
  `O` and `I` are never issued, so a reader who types one gets it repaired to
  `0` and `1` before the digit is tested, in SQL and in TypeScript alike.
- **One public door.** `verify_code(text)` is the only route an anonymous
  visitor has into the trust tables; there is no anonymous select on
  `public.certificates`, so verification can never degrade into enumeration.
  The function is volatile rather than stable because every attempt is
  written to `verification_log` — a sudden run of failures against one code
  is itself a signal.
- **An issued document is never edited.** The text is frozen into the row at
  issue; a mistake is corrected by revoking with a mandatory reason, and that
  reason becomes part of the public answer rather than disappearing.
- **A notice goes live by time, not by attention.** `publish_at` may be in
  the future, and the window plus the audience are applied in `notice_feed()`
  _and_ in the row-level select policy, so a scheduled notice is invisible to
  a client that queries the table directly. A published row with no
  publication time reads as a draft rather than as live.
- **Acknowledgement is only asked for where it can be given.** A public
  notice cannot require it, because an anonymous reader has no identity to
  record; progress is measured against the staff head count and clamped.
- **The verification answer distinguishes four kinds of "no".** `revoked`,
  `expired`, `withdrawn` and `unknown` are separate states with separate
  headlines, separate colours and separate advice, because telling somebody
  their certificate is "invalid" when it merely lapsed is a different
  conversation from telling them it was withdrawn.
- **The printed document is written from scratch** (`corporate-kit/src/pdf/`,
  no dependency): a PDF 1.4 writer over the base-14 Helvetica family with
  cross-reference offsets counted in bytes, and a QR encoder that produces
  one matrix used twice — as vector rectangles in the PDF and as an SVG path
  on screen, so the square on the paper and the square on the page can never
  disagree. Printed documents are English-only; unsupported characters
  degrade to spaces rather than to empty boxes.
- Three consoles: `certificate-site` (templates, single and batch issue,
  revocation with reason, registry search, printable certificates),
  `notice-site` (composer, scheduling, audience, acknowledgement tracking,
  printable notices) and `vf-site` — the public verification portal, which
  needs no sign-in, never renders the staff gate, answers a mistyped code
  without touching the network, accepts `?code=` from a scanned QR, mirrors
  its state back into the address bar so a result can be shared, and keeps a
  short recent list in the browser only.
- `vf-site` is the one indexable console: it ships its own title, description,
  canonical link, Open Graph tags, `WebSite` JSON-LD, `robots.txt` and
  sitemap, and `mountConsole()` now leaves that title alone instead of
  overwriting it with a generated one.
- 191 tests across the twelve packages, every console builds, and initial
  JavaScript is 173 to 186 KB gzip against the 250 KB budget.

## Response 16 scope (delivered)

- `supabase/migrations/0028_corporate.sql` and `0029_corporate_rls.sql`: the
  corporate schema — typed configuration with history, custom pages and
  sections, staff records and identity cards, IP rules and events, services,
  checks and incidents, and the corporate chat directory.
- **Configuration is typed and versioned.** Every key declares its type and
  its bounds; `set_site_config()` refuses a value of the wrong type instead
  of coercing it, writes the previous value to an append-only history, and
  `revert_site_config()` is a forward change rather than a deletion of the
  record that explains it.
- **An ordered list is ordered by the database.** `move_page_section()` locks
  the page, parks the moving row outside the range, shifts the block and
  lands it, so positions stay 0..n-1 however many editors are open.
- **A card code carries a check digit.** `bsdc.card_check_digit()` and the
  kit's `cardCheckDigit()` compute the same digit, so a mistyped code is
  refused before the database is asked — this is what the Response 17 public
  verification portal will check.
- **One function answers every IP question.** `ip_decision()` takes the most
  specific unexpired rule, lets an allow beat a block at equal specificity,
  and turns the absence of a rule into a refusal under allowlist mode.
- **Uptime is derived, never typed.** `service_uptime()` computes from
  recorded checks; a day with no check is shown as a gap rather than as a
  success.
- `corporate-kit/`: shared source compiled by every console through the
  `@kit` alias — environment and clients, the session provider that reads the
  role from Postgres rather than from a token claim, error translation,
  realtime chat transport, one hand-written stylesheet, the control set, and
  the pure domain logic. It is not published as a package and not deployed;
  it carries a `package.json` only so continuous integration applies the same
  gates to it.
- Seven consoles, each lean and each owning the kit module it exercises:
  `config-site` (typed editor and history with revert), `customize-site`
  (page composer with database-ordered sections), `connect-site` (staff chat
  over the `bsdc-second` realtime database with membership in Postgres),
  `ip-site` (rules, blast-radius warning, a simulator that answers with the
  same logic the database uses, and recent activity), `status-site` (public,
  no sign-in required, 90-day timelines and an operations panel that appears
  for staff), `users-admin-site` (staff records, card issue and verification)
  and `users-moderator-site` (read-only directory, roster and tenure).
- Continuous integration now installs with `npm install` rather than
  `npm ci`, because no lockfiles are committed, and installs the kit's
  dependencies for any application that imports it.
- 118 tests across the eight packages, every console builds, and initial
  JavaScript is 172 to 178 KB gzip against the 250 KB budget.

## Response 15 scope (delivered)

- `supabase/migrations/0026_analytics.sql` and `0027_analytics_rls.sql`:
  `report_snapshots`, a gapless day series, and five analytics functions.
- **A quiet day shows as a quiet day.** `bsdc.day_series()` generates the
  calendar and every series left-joins onto it, so a day with no activity is
  a zero rather than a hole — a chart with missing days tells a comforting
  lie.
- **Turnover is never passed off as revenue.** `analytics_revenue()` reports
  marketplace turnover, the commission the platform actually earned, and ad
  spend as three separate columns, with `platform_total` being only
  commission plus ad spend.
- **Retention is counted from behaviour, not from logins.** The cohort grid
  asks how many of the people who joined in a given week were still _writing_
  N weeks later, so it cannot be inflated by a background tab.
- **A report is a stored set of numbers, not a stored file.**
  `create_report_snapshot()` freezes the figures in `jsonb` inside the
  database, and `report_snapshots` has no insert, update or delete policy —
  re-running a report writes a new row, so the figures reported in March
  still read as they did in March. The PDF is only ever a rendering of a
  snapshot, which is why printing an old report reproduces old numbers.
- Every analytics function opens with a permission check and none of them
  return a member's identity alongside their behaviour.
- **The PDF writer is written from scratch** (`src/lib/reports/pdf.ts`, no
  dependency): a PDF 1.4 document with text wrapping, rules, key/value rows,
  tables and a bar chart, with cross-reference offsets counted in _bytes_. It
  is pure — it returns `Uint8Array` and never touches the DOM — so it is
  tested directly, and it is lazily imported only when somebody prints.
  Reports are written in English because the base-14 PDF fonts carry no
  Bangla glyphs; the UI states that plainly rather than printing empty boxes.
- Client: `analytics-types.ts` (sums, half-period trend that returns `null`
  rather than infinity for growth from zero, moving average, SVG sparkline
  path, cohort grid, RFC 4180 CSV, defensive snapshot parsing),
  `analytics-repository.ts`, `use-analytics.ts`, and the routes
  `/admin/analytics` and `/admin/reports`.
- `src/test/analytics.test.ts` adds 27 tests, including assertions that the
  generated PDF parses, that its `/Size` matches its xref table, and that a
  snapshot written by an older schema still opens. The suite is 292 tests
  over 20 files; initial JS is 202.1 KB gzip against the 250 KB budget.

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

Response 12 adds:
AL-001, AL-002, AL-003, AL-004, AL-005, AL-006, AL-007, AL-008, AL-009,
AL-010, AL-011, AL-012, AL-013, AL-014, AL-015, AL-016, AL-017, AL-018,
AL-019, AL-020, AL-021, AL-022,
AM-001, AM-002, AM-003, AM-004, AM-005, AM-006, AM-007, AM-008, AM-009,
AM-010, AM-011, AM-012, AM-013, AM-014,
AN-001, AN-002, AN-003, AN-004, AN-005, AN-006, AN-007, AN-008, AN-009,
AN-010,
AO-001, AO-002, AO-003, AO-004, AO-005, AO-006,
X-028, X-029, V-027, U-026, Z-012.

Response 13 adds:
AP-001, AP-002, AP-003, AP-004, AP-005, AP-006, AP-007, AP-008, AP-009,
AP-010, AP-011, AP-012, AP-013, AP-014, AP-015, AP-016, AP-017, AP-018,
AP-019, AP-020, AP-021, AP-022, AP-023, AP-024,
AQ-001, AQ-002, AQ-003, AQ-004, AQ-005, AQ-006, AQ-007, AQ-008, AQ-009,
AQ-010, AQ-011, AQ-012,
AR-001, AR-002, AR-003, AR-004, AR-005, AR-006, AR-007, AR-008,
AS-001, AS-002, AS-003, AS-004, AS-005, AS-006,
X-030, X-031, V-028, U-027, Z-013.

Response 14 adds:
AT-001, AT-002, AT-003, AT-004, AT-005, AT-006, AT-007, AT-008, AT-009,
AT-010, AT-011, AT-012, AT-013, AT-014, AT-015, AT-016, AT-017, AT-018,
AT-019, AT-020, AT-021, AT-022, AT-023, AT-024, AT-025, AT-026,
AU-001, AU-002, AU-003, AU-004, AU-005, AU-006, AU-007, AU-008, AU-009,
AU-010, AU-011, AU-012, AU-013, AU-014,
AV-001, AV-002, AV-003, AV-004, AV-005, AV-006, AV-007, AV-008, AV-009,
AV-010,
AW-001, AW-002, AW-003, AW-004, AW-005, AW-006,
X-032, X-033, V-029, U-028, Z-014.

Response 15 adds:
AX-001, AX-002, AX-003, AX-004, AX-005, AX-006, AX-007, AX-008, AX-009,
AX-010, AX-011, AX-012, AX-013, AX-014, AX-015, AX-016, AX-017, AX-018,
AY-001, AY-002, AY-003, AY-004, AY-005, AY-006, AY-007, AY-008, AY-009,
AY-010, AY-011, AY-012, AY-013, AY-014,
AZ-001, AZ-002, AZ-003, AZ-004, AZ-005, AZ-006, AZ-007, AZ-008, AZ-009,
AZ-010,
BA-001, BA-002, BA-003, BA-004, BA-005, BA-006,
X-034, X-035, V-030, U-029, Z-015.

Response 16 adds:
BB-001, BB-002, BB-003, BB-004, BB-005, BB-006, BB-007, BB-008, BB-009,
BB-010, BB-011, BB-012,
BC-001, BC-002, BC-003, BC-004, BC-005, BC-006, BC-007, BC-008, BC-009,
BC-010,
BD-001, BD-002, BD-003, BD-004, BD-005, BD-006, BD-007, BD-008,
BE-001, BE-002, BE-003, BE-004, BE-005, BE-006, BE-007, BE-008, BE-009,
BE-010,
BF-001, BF-002, BF-003, BF-004, BF-005, BF-006, BF-007, BF-008, BF-009,
BF-010, BF-011, BF-012,
BG-001, BG-002, BG-003, BG-004, BG-005, BG-006, BG-007, BG-008,
BH-001, BH-002, BH-003, BH-004, BH-005, BH-006,
X-036, X-037, V-031, U-030, Z-016.

Response 17 adds:
BI-001, BI-002, BI-003, BI-004, BI-005, BI-006, BI-007, BI-008, BI-009,
BI-010, BI-011, BI-012,
BJ-001, BJ-002, BJ-003, BJ-004, BJ-005, BJ-006, BJ-007, BJ-008, BJ-009,
BJ-010, BJ-011,
BK-001, BK-002, BK-003, BK-004, BK-005, BK-006, BK-007, BK-008, BK-009,
BK-010,
BL-001, BL-002, BL-003, BL-004, BL-005, BL-006, BL-007, BL-008,
X-038, X-039, V-032, U-031, Z-017.

Response 18 adds:
BM-001, BM-002, BM-003, BM-004, BM-005, BM-006, BM-007, BM-008, BM-009,
BM-010, BM-011, BM-012,
BN-001, BN-002, BN-003, BN-004, BN-005, BN-006, BN-007, BN-008, BN-009,
BN-010,
BO-001, BO-002, BO-003, BO-004, BO-005, BO-006, BO-007, BO-008, BO-009,
BO-010, BO-011,
BP-001, BP-002, BP-003, BP-004, BP-005, BP-006, BP-007, BP-008,
X-040, X-041, V-033, U-032, Z-018.

Response 19 adds:
BQ-001, BQ-002, BQ-003, BQ-004, BQ-005, BQ-006, BQ-007, BQ-008, BQ-009,
BQ-010, BQ-011, BQ-012,
BR-001, BR-002, BR-003, BR-004, BR-005, BR-006, BR-007, BR-008, BR-009,
BR-010,
BS-001, BS-002, BS-003, BS-004, BS-005, BS-006, BS-007, BS-008, BS-009,
BS-010, BS-011,
BT-001, BT-002, BT-003, BT-004, BT-005, BT-006, BT-007, BT-008,
X-042, X-043, V-034, U-033, Z-019.

Response 20 adds:
BU-001, BU-002, BU-003, BU-004, BU-005, BU-006, BU-007, BU-008, BU-009,
BU-010,
BV-001, BV-002, BV-003, BV-004, BV-005, BV-006, BV-007, BV-008,
BW-001, BW-002, BW-003, BW-004, BW-005, BW-006,
X-044, X-045, V-035, U-034, Z-020.

The registry is reconciled in `docs/feature-registry.md`, which is generated
by `node scripts/count-registry.mjs` and therefore tells the truth about the
commit it was run on rather than about the commit somebody remembers.
