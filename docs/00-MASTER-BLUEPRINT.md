# BSDC — MASTER BLUEPRINT

> Bangladesh Software Development Community. **Code. Community. Commerce. One platform.**
> A platform of **RRC Development**. Owner and CEO: **Rizwan Rahim Chowdhury**.
> Source-available. Re-deployment or rebranding is not permitted.

**Repository** https://github.com/bsdc-info-bd/bsdc
**Public site** https://www.bsdc.info.bd · **Preview** https://bsdc.pages.dev
**Android** `bd.info.bsdc.app` · **Root admin** `rrc@bsdc.info.bd` · **Launch** 2026 (admin-configurable)

This document is the single architectural registry for BSDC. Every ADR below is a decision that
is enforced by tooling wherever tooling can enforce it, and by review everywhere else. A decision
that contradicts an ADR here is a bug.

---

## 0. Delivery contract

The platform is delivered in **five responses**, each ending with a `SELF-AUDIT n`, a
`BUILD LEDGER` and a `NEXT-RESPONSE PREVIEW`. Minimum self-audit checks: R1 = 60, R2 = 80,
R3 = 100, R4 = 120, R5 = 200 (cumulative 560). No response ends with a broken build.

| Response  | Scope                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 (this) | Blueprint, repo tree, build config, design system, themes, responsive contract, primitives, icon + logo pipeline, error/observability foundation, shell + routes + first pages |
| R2        | Firebase bootstrap, auth, entitlements, permissions, presence, user profiles, media pipeline, feed shell, composer, comments/reactions                                         |
| R3        | Groups, events, marketplace, jobs, messaging, notifications, search, discovery, ranking, creator program, vendors, licensing                                                   |
| R4        | Admin panel, feature flags, moderation, ads engine, analytics, points/leaderboards, privacy centre, reports/exports, performance lab                                           |
| R5        | SEO/GEO/LLM/AEO master system, sitemap and feeds, prerender, PWA + APK, CI/CD, launch checklist verification, 500-point certification                                          |

---

## 1. Architecture decision records

### Foundations

**ADR-001 — Product is a platform, not a page.**
BSDC unifies community, learning, freelancing, hiring, local commerce and events. Every module is
built against one shell, one design system and one permission model. _Accepted._

**ADR-002 — React 19 + Vite + TypeScript, strict.**
Strict mode is non-negotiable: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`. `any` is banned by ESLint.
_Accepted._

**ADR-003 — Layered import direction.**
`app -> pages -> widgets -> features -> entities -> services -> shared -> core`. A module may
import from its own layer and any layer to its right; importing leftwards fails ESLint
(`no-restricted-imports`, one generated block per layer). `core` is the deepest layer: config,
errors, logging, events. `shared` is the UI kit, hooks and libraries. _Accepted._

**ADR-004 — Narrow public APIs per module.**
A module exposes an intentional surface (for example `src/shared/ui/index.ts`). Product code
imports deep module paths for bundle hygiene; the barrel remains the documented surface used by
tests and the design-system lab. _Accepted._

**ADR-005 — Routes are data, not JSX.**
`src/core/config/routes.ts` holds every route with its title key, feature flag, auth requirement,
indexability, sitemap hints and breadcrumbs. The router, navigation, breadcrumbs and the sitemap
builder all read that table, so they cannot disagree. _Accepted._

**ADR-006 — Typed event bus over cross-module imports.**
`src/core/events/bus.ts` carries notifications (route, theme, locale, network, flag, toast) so
analytics, presence and badges never import each other's internals. Handlers are isolated in
try/catch: one failing listener cannot break a feature. _Accepted._

### Data and services

**ADR-007 — Firestore is durable truth; Realtime Database is the ephemeral plane.**
Posts, profiles, orders, ledgers and configuration live in Firestore (region `asia-south1`).
Presence, typing, receipts and notification fan-out live in RTDB. _Accepted; implementation in R2._

**ADR-008 — Design tokens are CSS custom properties.**
Every colour, space, radius, shadow, duration and z-index is declared once in
`src/styles/layers/tokens.css`. Tailwind utilities map to those variables; components never branch
on theme. Adding a theme costs one block in `themes.css`. _Accepted._

**ADR-009 — One breakpoint source.**
`src/core/config/breakpoints.ts` owns all nineteen breakpoint numbers. Tailwind screens, the CSS
responsive layers and the `useBreakpoint` hook read the same values. _Accepted._

**ADR-010 — Deliberate chunking.**
Heavy libraries (Monaco, Leaflet, Fabric, jsPDF, wavesurfer, react-player) are never in the shell
and are always reached by dynamic import inside the feature that needs them. _Accepted._

**ADR-011 — One icon registry.**
`src/shared/ui/Icon.tsx` is the only place that maps a semantic name to a glyph. Brand marks live
in `BrandLogo.tsx`. Entries are added when a surface uses them, never "just in case", because each
entry ships to the browser. _Accepted._

**ADR-012 — Preview hosts are first-class.**
The dev server binds `0.0.0.0` with `allowedHosts: true` so `bsdc.pages.dev` and sandbox preview
hosts work. Production adds `www.bsdc.info.bd` at the edge. _Accepted._

**ADR-013 — Hidden source maps in production.**
Stack traces can be symbolicated by the error pipeline while no `sourceMappingURL` comment ships
to the browser. _Accepted._

**ADR-014 — Lint is a build gate, and warnings are errors.**
CI runs `eslint . --max-warnings 0`. _Accepted._

**ADR-015 — Secrets never reach the client bundle.**
`scripts/verify-env.ts` fails the build if an unprefixed secret is present in the environment or if
any secret is exposed through a `VITE_` variable. Firebase web config is public by design and is
typed in `src/vite-env.d.ts` so it is never `any`. _Accepted._

**ADR-016 — Feature flags with schedules.**
Every feature is a plugin behind a flag. Flags default ON; toggling a protected flag requires the
plugin passkey; scheduled windows are re-evaluated every minute so a flag can switch itself at the
right time without a redeploy. _Accepted; remote configuration in R4._

**ADR-017 — Server-side authority.**
Custom claims, Firestore rules, RTDB rules and Cloud Functions decide privilege. The client never
asserts it. _Accepted; implementation in R2/R4._

**ADR-018 — Passkeys are hashed server-side.**
Admin (`RahimRahim`), ads, plugin and vendor-review passkeys are PBKDF2-SHA256 with a per-record
salt and an environment pepper, verified only in Cloud Functions, rate-limited to five attempts per
fifteen minutes, and never present in the bundle, a URL, a query string, a log or a screenshot.
_Accepted; implementation in R2/R4._

**ADR-019 — dayjs is the canonical date library.**
Chosen for size and plugin model. The Bangla locale ships with the app so the calendar works
offline. Timestamps display in Asia/Dhaka. _Accepted._

**ADR-020 — Zod schemas are shared by client and server.**
One schema validates a payload on both sides; the Firestore rule remains the final authority.
_Accepted; implementation in R2._

**ADR-021 — Themes paint before first paint.**
A single inline script reads `localStorage['bsdc:appearance']` (zustand persist shape
`{ state, version }`) and sets `data-theme` before paint. There is no flash of the wrong theme and
no other inline script exists. _Accepted._

**ADR-022 — Prerender at build time; no Cloudflare Workers.**
Public pages are prerendered by a build/CI pipeline. No dynamic SEO is served by a Worker at
request time. _Accepted; implementation in R5._

**ADR-023 — The service worker fails open.**
The app shell and locale dictionaries are precached; an offline navigation is served `/offline`.
Any cache failure falls through to the network: a broken cache must never break the app.
_Accepted._

### Language, layout and motion

**ADR-024 — Bangla is safe by construction.**
The DOM keeps ASCII digits so copying, sorting and screen readers stay correct; Bengali digits are
a display-only transform (`toBanglaNumerals`). Grapheme counting never splits a Bengali conjunct.
Bangla runs at line-height 1.8 for matra clearance; English at 1.55. _Accepted._

**ADR-025 — Virtualise above one hundred rows.**
Feeds, admin tables and chat histories use windowed lists. _Accepted._

**ADR-026 — The OSM pin is authoritative.**
District centroids in `src/core/config/regions.ts` are approximations for centring and distance
maths. Precise geometry always comes from the user-selected OpenStreetMap pin, and the attribution
is always visible. _Accepted._

**ADR-027 — Soft delete first, recovery bin for thirty days.**
Nothing is purged immediately. Deletion is a state change; purge is a scheduled job.
_Accepted; implementation in R2._

**ADR-028 — Optimistic writes reconcile with the server.**
Local state updates immediately, then reconciles; a conflict surfaces BSDC-DATA-005 with both
versions. _Accepted; implementation in R2._

**ADR-029 — Money and moderation are append-only ledgers.**
Balances, payouts, ad spend and moderation actions are derived from immutable entries, never
mutated in place. _Accepted; implementation in R3/R4._

**ADR-030 — Cursor pagination only.**
No offset pagination: it breaks under concurrent writes. _Accepted._

**ADR-031 — Every PDF carries provenance.**
BSDC branding, report id, generated-at timestamp, SHA-256 integrity hash, verification QR and a
public verification URL. _Accepted; implementation in R4._

**ADR-032 — Media storage is split by durability.**
Cloudinary holds durable media; ImgBB holds bulk non-critical media; Firebase Storage is not used
for user media. Every image ships with alt text, width, height, a lazy/priority decision and a
blur placeholder. _Accepted; implementation in R2._

**ADR-033 — No video uploads, ever.**
BSDC hosts no video. A YouTube or Vimeo link becomes a lazy, click-to-load embed
(BSDC-MEDIA-004). _Accepted._

**ADR-034 — One realtime listener registry.**
Listeners are centralised, reference-counted and unsubscribe deterministically. No component
registers a listener directly. _Accepted; implementation in R2._

**ADR-035 — OneSignal broadcasts are manual only.**
No automation sends push notifications. _Accepted; implementation in R4._

**ADR-036 — No Cloudflare Workers.**
Sitemap, RSS, dynamic SEO and any other request-time logic happen in the build pipeline or in
Firebase. This is a hard constraint, not a preference. _Accepted._

**ADR-037 — The page builder renders server-side.**
Blox-style pages prerender to fast, indexable HTML. _Accepted; implementation in R5._

### Experience

**ADR-038 — Nine themes through one attribute.**
Light, dark, OLED black, Facebook blue, green light, green dark, high contrast, sepia and
auto — each a variable block on `:root[data-theme]`. _Accepted._

**ADR-039 — Density is a multiplier.**
`--bsdc-density` scales the spacing scale: comfortable 1.0, compact 0.8, spacious 1.25.
_Accepted._

**ADR-040 — One motion vocabulary.**
`src/shared/lib/motion.ts` holds the variants; CSS holds the durations. Reduced motion collapses
both to a single frame. _Accepted._

**ADR-041 — One error taxonomy.**
Every user-visible failure carries a stable code (`BSDC-XXX-NNN`) with a bilingual message that
says what happened, why and the exact next action. _Accepted._

**ADR-042 — Expected failures are values.**
`Result<T, E>` models validation, permission and quota outcomes; exceptions are for exceptional
situations. _Accepted._

**ADR-043 — Redaction happens before logging.**
`src/core/logger/redact.ts` rewrites secret keys and secret-shaped substrings before any
transport sees a payload. _Accepted._

**ADR-044 — Boundaries everywhere.**
A route boundary renders a recoverable error, a global boundary catches the rest, a silent
boundary hides a failed optional widget and an offline boundary shows the honest offline state.
_Accepted._

**ADR-045 — Accessibility is a build gate.**
Tap targets of at least 44 CSS pixels on touch, visible focus, real landmarks, live regions for
route and state changes, WCAG AA as the floor and AAA in the high-contrast theme. _Accepted._

**ADR-046 — Bilingual by default.**
Every user-facing string exists in Bangla and English under `public/locales/{bn,en}`. Bangla is
the default locale and is handwritten Bangladeshi Bangla, never machine transliteration.
_Accepted._

**ADR-047 — No demo, sample or placeholder content.**
`scripts/check-no-placeholders.sh` scans tracked files; test fixtures are generated at runtime and
never committed. _Accepted._

### Growth, operations and delivery

**ADR-048 — SEO artefacts are generated at build time.**
Sitemaps, feeds, share cards and JSON-LD are produced by the build pipeline in `build/`.
_Accepted; implementation in R5._

**ADR-049 — Private routes are noindex.**
Admin, settings and messaging routes are `noindex` and excluded from sitemaps. _Accepted._

**ADR-050 — The marketplace sells order quota.**
Vendors buy orders, not time: 10/50/100/250/500/1000 order plans, each with a validity window,
plus five free orders on approval. Currency is BDT. _Accepted; implementation in R3._

**ADR-051 — The ads engine is an amount-score ledger.**
Spend accumulates per advertiser; delivery is frequency-capped, never adjacent, at most one ad per
five organic items, and viewability is measured before a charge. _Accepted; implementation in R4._

**ADR-052 — Moderation is accountable.**
Every action has a written reason, every decision can be appealed, and every appeal must be
answered within the published window. _Accepted; implementation in R3/R4._

**ADR-053 — Reports are verifiable.**
Every report carries its id, generated-at timestamp, integrity hash, verification QR and public
verification URL, and can be re-verified later from the URL alone. _Accepted; implementation in R4._

**ADR-054 — Capacitor wraps the same web build.**
The Android package is `bd.info.bsdc.app`. The native shell owns caching; the web service worker
does not register inside the WebView. _Accepted; implementation in R5._

**ADR-055 — CI is the definition of done.**
Typecheck, lint, unit tests, component tests, production build, bundle budget, emoji and
placeholder gates, and a responsive sweep across the verified widths. _Accepted; implementation in R5._

**ADR-056 — Bundle budgets are enforced.**
The initial shell is at most 180 KB gzip; any route chunk at most 250 KB gzip. Measured in R1:
shell 165.65 KB gzip across five chunks. _Accepted._

**ADR-057 — Field performance budgets are enforced.**
LCP below 2.0 s, INP below 200 ms, CLS below 0.05 on a throttled mid-tier Android profile.
_Accepted; measurement in R4/R5._

**ADR-058 — Public repository, source-available licence.**
The repository is public for transparency. The BSDC Source-Available Licence forbids
re-deployment and rebranding. Every source file carries the ownership and licence header.
_Accepted._

**ADR-059 — Flags default ON and are gated by passkey.**
Toggling a protected flag requires the plugin passkey and an audit entry. _Accepted;
remote enforcement in R4._

**ADR-060 — Five responses, audited.**
Each response ships working software and ends with a self-audit, a build ledger and a preview of
the next response. _Accepted._

**ADR-061 — Firestore is durable truth; the Realtime Database is the ephemeral plane.**
Firestore holds anything a person would be upset to lose. The Realtime Database holds only what is
worthless tomorrow: presence, typing, delivery receipts, notification fan-out and live counters.
Nothing ephemeral is written to Firestore and nothing durable is written to the Realtime Database.
_Accepted._

**ADR-062 — Device-local mode is a first-class state, never a demo mode.**
When the backend cannot be reached the application continues on the device: reads come from the
mirror, writes land in the outbox, and the banner says which mode is active. Nothing about that
mode is simulated — the data is the person's own, it is durable on the device, and it reconciles
when the backend returns. _Accepted._

**ADR-063 — A document is addressed through a path constant, never a literal.**
Every Firestore and Realtime Database path is built by `src/core/config/collections.ts`, so the
repositories, the security rules and the data-model document cannot disagree. _Accepted._

**ADR-064 — Every realtime subscription is reference-counted by one registry.**
Components acquire a key from `src/services/realtime/registry.ts`; they never call `onSnapshot`
or `onValue` themselves. Two consumers of the same key share one transport subscription, and the
last release detaches it deterministically — including when the release arrives before the
subscribe promise settles. _Accepted._

**ADR-065 — Privilege is a claim, not a component.**
The client reads the role from the Firebase Auth token and the entitlement matrix in
`src/core/config/permissions.ts` to decide what to render. Firestore rules, Realtime Database rules
and Cloud Functions decide what succeeds. A hidden button is never a security control. _Accepted._

**ADR-066 — Passkeys are derived, peppered and verified server-side only.**
A passkey is PBKDF2-SHA256 with 600 000 iterations, a per-record salt and a deployment pepper held
as a Cloud Functions secret. It is never stored, never logged, never placed in a URL, and is
compared in constant time. Attempts are throttled to five per fifteen minutes per actor.
_Accepted._

**ADR-067 — Read-through and write-through are the only two data primitives.**
Read-through asks the backend, merges into the mirror, answers from the mirror, and falls back to
the mirror when the backend does not answer. Write-through writes the mirror, enqueues the
mutation, then attempts the backend. Every repository is built from these two, so no repository
can skip a step. _Accepted._

**ADR-068 — No write is lost to a dropped connection.**
Every mutation is queued in the outbox with exponential backoff and replayed until it succeeds or
exhausts eight attempts, at which point it is surfaced to the person as a failed action they can
retry or discard. _Accepted._

**ADR-069 — Soft delete first, thirty-day recovery, nightly purge.**
Deleting sets `deletedAt`. The item leaves every list immediately and stays restorable for thirty
days. A scheduled Cloud Function purges expired records daily at 03:00 Asia/Dhaka. _Accepted._

**ADR-070 — Media routing is a table, not a decision at a call site.**
`src/core/config/limits.ts` maps each surface to a provider: Cloudinary for durable assets, ImgBB
for bulk non-critical images, Firebase Storage only for KYC documents. Video is refused at the
picker and again at the validator. _Accepted._

**ADR-071 — Comments thread exactly one level deep.**
The data model permits arbitrary depth; the view renders one level. Deeper trees were unreadable on
the handsets the product is built for, and a reply to a reply still belongs to the same thread.
_Accepted._

**ADR-072 — One reaction document per person per post.**
A reaction lives at `posts/{postId}/reactions/{uid}`, so "one reaction per person" is structural
rather than something the client has to remember, and changing a reaction is one write.
_Accepted._

**ADR-073 — A direct conversation id is derived from its two participants.**
Sorting the two account ids and joining them yields the thread id, so two people opening the same
chat offline arrive at the same thread instead of creating two. _Accepted._

**ADR-074 — Work that is not needed to paint starts after the first paint.**
Anything lazy in spirit but eager in practice — the Firebase SDK, badge subscriptions — is scheduled
through `onIdle`, because "technically a dynamic import" still costs LCP when it starts during the
first frame. _Accepted._

**ADR-075 — Shell badges are fetched outside the shell bundle.**
Unread counts are written into a store by a lazily mounted component, so the header and the bottom
bar can display them without the messenger and notification modules in the initial bundle.
_Accepted._

---

## 2. Locked configuration

| Area                      | Value                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| Brand token               | `bsdc`                                                               |
| Firebase project          | `bsdc-bd` (`bsdc-bd.firebaseapp.com`, `bsdc-bd.firebasestorage.app`) |
| Messaging sender / app id | `1041487418449` / `1:1041487418449:web:350786ca8caf66266a9470`       |
| Realtime Database         | `https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app`  |
| Firestore region          | `asia-south1`                                                        |
| Cloudinary                | cloud `dpemuwrpz`, preset `bsdc_unsigned`                            |
| ImgBB                     | key configured through `VITE_IMGBB_KEY`                              |
| OneSignal                 | app id `5f367dc9-3fc3-4fd9-b452-e32fa438509b`, manual broadcast only |
| Timezone                  | Asia/Dhaka                                                           |
| Currency                  | BDT                                                                  |
| Locales                   | Bangla (default) and English                                         |

---

## 3. Platform laws enforced by tooling

| Law                                   | Enforcement                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| LAW-01 No emoji                       | `tools/lint/eslint-plugin-bsdc.mjs` rule `no-emoji` + `tools/lint/no-emoji.mjs` scan of 405 files |
| LAW-02 No placeholder or demo content | ESLint rule `no-placeholder-text` + `scripts/check-no-placeholders.sh`                            |
| LAW-03 Server-side authority          | `firestore.rules`, `database.rules.json`, `storage.rules`, custom claims (ADR-065)                |
| LAW-05 Cloudinary durable, ImgBB bulk | `src/services/media`, provider table in `src/core/config/limits.ts` (ADR-070)                     |
| LAW-06 Passkeys never stored          | `functions/src/passkey.ts`, PBKDF2-SHA256 + pepper + constant-time compare (ADR-066)              |
| LAW-07 No video, anywhere             | Refused in the file picker and again in `src/services/media/validate.ts`                          |
| LAW-08 Reports carry provenance       | ADR-031, ADR-053                                                                                  |
| LAW-08 Reports carry provenance       | ADR-031, ADR-053                                                                                  |
| LAW-11 Every feature is a flag        | `src/core/config/features.ts`, `src/core/flags/flagClient.ts`                                     |
| LAW-12 Destructive actions confirm    | `ConfirmDialog` with typed phrase and written reason                                              |
| LAW-14 Accessibility                  | `jsx-a11y` rules + 44 px tap targets + `high-contrast` theme                                      |
| LAW-18 Server-side authority          | ADR-017, ADR-065                                                                                  |
| LAW-20 Virtualise long lists          | `VirtualList`                                                                                     |
| LAW-21 Images declare dimensions      | `BrandLogo`, `Avatar` and every image element                                                     |
| LAW-22 Deterministic unsubscribes     | `useEventListener`, `useInterval`, ref-counted listener registry (ADR-034, ADR-064)               |
| LAW-23 Integrity hashes on exports    | ADR-031                                                                                           |
| LAW-24 Alt text                       | `jsx-a11y/alt-text`, editable alt on every composer attachment                                    |

---

## 4. Response 1 ledger (summary)

Foundation delivered: blueprint plus 60 ADRs, repository tree, build and quality tooling, the
complete token and theme layer, the full responsive contract from 250 px to 5120 px, thirty-one
design-system primitives, the brand and icon pipeline, the error taxonomy with redacted logging,
the event bus, the flag client with schedules, the provider stack, the router with lazy routes,
five real pages and the public web assets (manifest, robots, OpenSearch, service worker, generated
icons). Unit and component suites pass; the production build is inside the bundle budget; emoji and
placeholder gates are clean.

The complete audit for this response is in `docs/SELF-AUDIT-1.md`.

---

## 5. Response 2 ledger (summary)

Data, identity and community delivered: the Firebase bootstrap with Firestore, Realtime Database
and Storage security rules plus composite indexes; Cloud Functions for passkey verification, claim
synchronisation, profile provisioning and the nightly soft-delete purge; the entitlement matrix;
the reference-counted realtime registry; presence and typing; the media pipeline with provider
routing and device-generated blur previews; the offline mirror and outbox; eight entity
repositories; and the identity, feed, composer, comment, reaction, group, messenger, notification
and presence features. Four routes went live: `/feed`, `/groups`, `/messages` and
`/notifications`.

The complete audit for this response is in `docs/SELF-AUDIT-2.md`, and the schema is documented in
`docs/02-DATA-MODEL.md`.
