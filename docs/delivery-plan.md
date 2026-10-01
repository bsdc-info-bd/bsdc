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
| 6 | Social graph and interactions | Pending |
| 7 | BSDC Messenger | Pending |
| 8 | Communities: groups, channels, pages, events | Pending |
| 9 | Jobs, freelance, projects, snippets, playground | Pending |
| 10 | Search and notifications | Pending |
| 11 | Marketplace part 1 (customer) | Pending |
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
