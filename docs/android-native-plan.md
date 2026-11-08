# BSDC Android: repository-grounded native product and delivery plan

**Status:** discovery and architecture plan, not an implementation or release artifact
**Target application ID:** `bd.info.bsdc.app`
**Audience:** public members and visitors; no Android administration console
**Updated:** 2026-11-08

> This plan intentionally does not claim that an app is already built, signed, Play-ready, or contains 10,000 independently implemented capabilities. A 100,000-word document and 10,000 genuinely working features are not useful or verifiable deliverables in one change. This plan translates the request into a testable, staged product with explicit dependencies, release gates, and honest repository findings.

## 1. Executive summary

BSDC is a multi-application community platform, not a blank mobile-app concept. The repository describes a React 18 + TypeScript/Vite member application (`main-site`), Supabase/Postgres as primary relational source of truth, Firebase Authentication as identity, Firebase Realtime Database for realtime features, Firestore for limited cache/configuration, Cloudflare Pages Functions and a Cloudflare push Worker, plus numerous public and staff sites. The existing `android-app/` is explicitly a Capacitor 6 web shell, and its README says it wraps the web application rather than implementing screens natively. Its package ID is already intended to be `bd.info.bsdc.app`.

The requested product is materially different: a native Kotlin Android client with Jetpack Compose screens, no WebView for `www.bsdc.info.bd` and verification pages, and a WebView exception for `news.bsdc.info.bd`. The right direction is a native public client that consumes the existing platform APIs and reuses backend contracts, identity, data, media, and push infrastructure—not an attempt to embed website implementation stacks inside Android. Kotlin/Compose is the Android UI stack; React/Vite remains the website UI stack. Shared behavior belongs in documented API contracts and server-side domain rules.

A native rewrite is a significant product project. The repository currently documents 47 member-facing pages, 128 member/public RPCs, 670 member-site domain rules and extensive social, messaging, community, jobs, learning, marketplace, and other functionality. Those surfaces must be inventoried and prioritized rather than silently omitted or represented by decorative buttons. The native app should launch in vertical slices, each end-to-end and tested against production-compatible APIs.

## 2. What the repository says today

### Existing Android package

- `android-app/README.md`: Capacitor wrapper around `www.bsdc.info.bd`; generated `android/` project is ignored and not committed.
- `android-app/package.json`: Capacitor 6, Firebase authentication and messaging plugins, TypeScript/Vitest toolchain. There is no checked-in Kotlin/Java Android implementation, Gradle project, Compose UI, native QR scanner, or native voice search.
- `android-app/src/links.ts` and tests: host/routing decisions are tested, but README identifies `vf.main.bsdc.info.bd` as the verification host. The request names `vf.bsdc.info.bd`. Confirm the canonical production host and support only explicitly approved aliases.
- Existing push token handoff is through the web host (`ShellHost.onToken`) and Firebase Realtime Database. This is not equivalent to a native app architecture or proof that all requested notification event types are delivered.
- Existing Android workflow builds a debug artifact and signed APK/AAB only when release-tag and signing-secret conditions are met. A signed release cannot be produced without the authorized release keystore, signing configuration, Play listing, and verified domain association.

### Backend and ecosystem

- `README.md` identifies Supabase Postgres as primary SQL source of truth; Firebase Auth for identity; RTDB for realtime/chat/presence/typing/counters; Firestore for limited runtime config/cache.
- Cloudflare Pages Functions provide API endpoints. `push-worker/` is a standalone scheduled Worker for existing web push delivery. This must not be assumed to be FCM delivery: the native FCM path needs an explicit, server-originated dispatch design and end-to-end tests.
- The current documented media policy uses ImgBB for some ordinary user images and Cloudinary for important images, profile pictures, documents and voice notes. Code confirms Cloudinary remains an active configuration/feature flag and diagnostics probe, while ImgBB appears in the content pipeline and tests for legacy Cloudinary assets. This directly conflicts with the request to use ImgBB exclusively and never Cloudinary. It cannot be truthfully described as already eliminated. A migration requires auditing all upload/download/transform workflows, persistence fields, signed URL needs, file-type limits, provider terms, and existing assets. ImgBB suitability for private documents, voice, video, deletion, access control, and durable community content must be validated before moving those use cases. Do not expose an ImgBB or Cloudinary secret in the client.
- Site inventory includes `www.bsdc.info.bd`, a verification site, staff-only domains, and ecosystem partners such as `news.bsdc.info.bd`. The native app must not accidentally absorb staff sites into a public trust boundary.
- `docs/feature-registry.md` derives a repository-wide count of 1,867 surfaces across core, administration and staff/corporate. It is not a list of 1,867 mobile-ready independent features and must not be relabeled as such.

## 3. Product scope and non-goals

### In scope

1. Public visitor discovery and public verification lookup.
2. Member account registration/sign-in, onboarding, profiles and privacy-aware member settings.
3. Social feed, posts, comments, reactions, following, notifications, search, and messaging where existing backend contracts permit.
4. Publicly available communities, learning, jobs/projects and other member features after backend/API validation and prioritization.
5. Native push notifications, deep links, QR scan and voice-assisted search, with explicit user consent and meaningful fallback UX.
6. Native rendering for approved BSDC-owned public and member experiences; a constrained WebView only for the approved news host/pages.
7. Accessibility, Bengali/English localization, low-bandwidth resilience, security, observability and Play release readiness.

### Out of scope

- Admin, staff, moderator or corporate console features. The Android client must not grant privileged access merely because a user can reach a staff website.
- A claim that every website feature is automatically available in a native client without APIs, design, and testing.
- A generic WebView of the main site as a substitute for native implementation.
- Unbounded background location or microphone recording. Permissions are requested only when a user invokes a feature that needs them.
- Guaranteed notification display when the user has force-stopped the app, disabled notifications, revoked permission, or the OS/network suppresses delivery. Android and FCM do not permit an app to promise unconditional delivery.
- A 10,000-item vanity feature counter. Features count only when distinct, user-visible behavior has implementation, tests, and backend support where required.

## 4. Architecture decisions

### 4.1 Native client stack

- Kotlin, Android Gradle Plugin, Gradle Kotlin DSL, AndroidX, Jetpack Compose and Material 3; Java interoperability only for libraries or platform APIs that require Java. Do not add Flutter, Capacitor, React Native, or a WebView-based main application.
- Single-activity app; Navigation Compose with typed routes; lifecycle-aware state collection; ViewModels and immutable UI state; Kotlin Coroutines/Flow.
- Multi-module structure: `app`, `core:designsystem`, `core:model`, `core:network`, `core:database`, `core:auth`, `core:notifications`, `core:links`, `core:media`, `core:analytics`, and feature modules (`feature:feed`, `feature:profile`, etc.). Begin modularization only where boundaries have real ownership; avoid empty modules for appearance.
- Retrofit/OkHttp (or a single selected HTTP stack) for documented API contracts; kotlinx serialization; Room for explicitly selected offline data; DataStore for local preferences. Use encrypted storage for local secrets and avoid storing Firebase refresh tokens outside supported SDKs.
- Compose UI tests, unit tests, repository contract tests, API integration tests, screenshot/golden tests where stable, and Macrobenchmark/Baseline Profile for performance.
- Dependency versions pinned via Gradle version catalog; reproducible builds; dependency and license scanning; release artifacts built in CI.

### 4.2 Reusing the website ecosystem correctly

“Same stack as web” is interpreted as the same backend, identity, data, feature semantics, and branding—not using React/Vite to render native Android screens. Android has a different UI stack by requirement. All access goes through public, authenticated, least-privilege contracts. Do not connect a mobile binary directly to a database using privileged credentials. The app may use the existing Supabase client and Firebase SDK only with public client configuration and user-scoped security rules/RLS; privileged operations remain server-side.

First deliver an API capability matrix: each website feature, current RPC/table/function, auth requirement, request/response schema, pagination, idempotency, realtime channel, privacy rule, and mobile readiness. Where a browser-only feature depends on direct database access, either prove the same safe contract works from native or add a versioned server endpoint. Maintain API contract tests against migrations and RLS. Never make the mobile app a bypass around RLS.

### 4.3 FCM and notification delivery

- Native registration uses the current Firebase Android Messaging SDK and Firebase project `bsdc-bd`; register token lifecycle including rotation, logout, account switch and device removal.
- Server-side sender obtains OAuth2 access tokens from a Firebase service account held only as a Cloudflare Worker secret (or another approved server-side secret store), calls FCM HTTP v1, and never ships service account JSON/private key in APK, source, logs, or client configuration. Use least-privilege service identity and rotation procedures.
- Define durable notification event records and idempotency keys. Producers create events transactionally/outbox-style; Worker claims batches safely, sends FCM, records outcome, applies retry/backoff and dead-letter handling. A cron poller is acceptable only with bounded latency and concurrency-safe claims; use queue/event triggers if available and justified.
- Payload includes a stable event ID, type, safe title/body, approved deep-link route, and minimal identifiers. Do not put private message bodies or sensitive profile details in lock-screen payload unless the member explicitly opts in. Native app fetches authorized details after tap.
- Handle foreground messages in-app; background notification/data behavior according to Android rules; notification channels, category, priority, sound, badge, grouping, collapse keys, expiration/TTL and per-user preferences. Android 13+ notification runtime permission is contextual and optional.
- Document reliability truth: FCM offers best-effort delivery, not a hard guarantee. Delivery can be delayed or suppressed by force-stop, connectivity, battery policy, vendor firmware, token invalidation, permission settings and Firebase service conditions. Measure sent/accepted/opened, not “guaranteed delivered.”
- Event taxonomy: follow, post from followed member, reply, comment, reaction, mention, message, community activity, verification result, security event. Each category has user controls, batching/deduplication, quiet hours, privacy policy and abuse controls. No event is enabled until its producer and recipient authorization are tested.

### 4.4 Media and ImgBB decision

The requested no-Cloudinary rule is a repository-wide migration request, not an app-only flag. Inventory every Cloudinary usage, including upload paths, transformations, avatar/cover images, product media, documents and voice notes. Create provider abstraction and migration ledger; write tests that fail if a Cloudinary SDK/URL/endpoint remains in approved runtime paths. Validate ImgBB API limits, allowed formats/sizes, deletion, retention, content moderation, privacy/access controls and data export. Do not upload identity documents or sensitive/private materials to a public image host absent a security/privacy review and suitable controls. If ImgBB cannot serve a requirement safely, clarify whether the product requirement permits a private BSDC-controlled store; never silently claim “all media uses ImgBB.” No browser/mobile app should hold a provider secret; uploads require a short-lived server-mediated capability or a documented public-key model with abuse controls.

### 4.5 Link routing and WebView boundary

- Android App Links for `https://www.bsdc.info.bd/*` and the confirmed verification hostname, with `assetlinks.json` listing the release signing certificate fingerprint. Debug certificate support belongs only in non-production testing.
- Resolve all approved BSDC main-site and verification links to corresponding native routes, including cold-start links, existing-task links, signed-in/out states, malformed URLs, encoded paths, and safe authentication return URLs. Unrecognized BSDC paths show native not-found/unsupported route UI or an explicit browser fallback; do not silently load the site in WebView.
- `news.bsdc.info.bd` may open in an isolated Android WebView only after strict host validation. Enable JavaScript only if the news product requires it; disable file/content access, mixed content, unsafe bridges and third-party navigation. Open all external links in Custom Tabs/system browser. Apply safe browsing, HTTPS-only, download policy, clear cookies/storage where appropriate and test redirects/subdomains. No `addJavascriptInterface` for untrusted pages.
- `vf.bsdc.info.bd` versus `vf.main.bsdc.info.bd` is a decision blocker: production DNS, TLS, assetlinks hosting and current app behavior must be checked before manifest filters are finalized.

### 4.6 QR and voice

- QR: CameraX + ML Kit Barcode Scanning (or another maintained scanner after dependency/security review), runtime camera permission requested on scan action, torch/zoom, low-light guidance, haptic feedback, frame throttling, lifecycle-safe camera, accessible manual code entry. Parse only allowlisted HTTPS BSDC verification URLs; validate signature/server-side status before displaying “verified.” Distinguish valid, revoked, expired, malformed, unavailable, and suspicious URLs. Never treat QR content as trusted merely because it decodes.
- Voice search: explicit microphone action and permission, Android speech recognizer/on-device availability where supported, text-search fallback, bilingual Bengali/English, clear listening/partial/final/error states, no background listening and no retaining raw audio unless a separately disclosed feature requires it. Search query confirmation before irreversible actions. Respect device speech services and privacy policies.
- Location: not requested at launch unless a specific opt-in feature needs it. Ask at point of use, prefer approximate location, explain purpose, allow denial and provide manual alternative. Never track continuously by default.

## 5. Product UX principles

“Ultra animated” should not compromise speed, accessibility, battery, or low-end devices. Use purposeful motion (shared-axis navigation, state transitions, subtle reaction feedback, skeleton-to-content transitions), respect system reduced-motion settings, avoid blocking animations and avoid scroll jank. Compose screens should have loading, empty, offline, error, permission-denied, stale-data, retry, and success states. Design for one-handed reach, adaptive phone/tablet layouts, large font scales, TalkBack semantics, minimum touch targets, contrast, RTL readiness if required, and Bengali/English copy parity.

Use a coherent BSDC token system (color, typography, spacing, shape, elevation, motion), dark/light/system theme, dynamic color only where consistent with brand. Avoid cloning Facebook/Instagram assets or confusing users into thinking this is Meta. “Modern social usability” means familiar interaction patterns while preserving BSDC identity and transparent controls.

## 6. Screen and capability inventory

The exact route list must be generated from `main-site` routing and the current feature registry before implementation. Proposed public native navigation:

1. **Launch and onboarding:** splash/initialization, consent and privacy notice, sign-in/sign-up, password recovery, verification status, username/profile onboarding, notification explanation and later opt-in.
2. **Home:** personalized feed, following feed, sort/filter controls, refresh, paging, offline cache policy, post detail, share sheet.
3. **Create:** text/media/post types supported by backend, drafts, image selection/camera capture, upload progress, content warning/visibility, mention/tag controls, validation and retry.
4. **Social:** member profile, follow state, followers/following lists, comments/replies, reactions, saves/bookmarks if supported, report/block/mute and privacy settings.
5. **Inbox:** conversation list, chat, message sending state, retry, unread markers, push deep links, attachments only if their security and hosting design is approved. Voice notes require a separate privacy/storage decision.
6. **Discover/search:** members, posts, tags and approved platform catalogs; voice query input; recent searches with deletion controls.
7. **Notifications:** activity list and category controls, read state, pagination, linked destination; notification settings and OS-level status explanation.
8. **Verification:** QR scanner, manual certificate/notice/report code lookup, result details, issuer/date/status, share/export controls and anti-phishing warnings. This is a public verification surface, not staff issuance tooling.
9. **News:** strict-origin WebView for approved `news.bsdc.info.bd` pages with visible source identity, back navigation, loading/offline/error states and external navigation policy.
10. **Settings and help:** account, language, theme, privacy, notification categories, blocked members, accessibility, permissions, data export/delete pathways if supported, legal/privacy, support and app diagnostics.
11. **Other member features:** communities, events, learning, jobs/projects, marketplace and other features only after route/API inventory and release prioritization. No admin/staff console.

## 7. Ten structured delivery responses (not ten giant unreviewable patches)

### Response 1 — Discovery, constraints and baseline
Produce route/RPC/schema/media/push/domain inventory, confirm domains, current live behavior, API contracts, privacy/data map, threat model, target SDK, min SDK, supported devices, accessibility targets and baseline performance. Separate verified facts from README claims. Deliver acceptance criteria and decision log. No feature claims beyond current evidence.

### Response 2 — Native foundation and design system
Add Gradle Kotlin project with application ID, signing-config separation, Compose Material 3 foundation, navigation skeleton, design tokens, localized strings, dependency pinning, lint/format/test CI, startup/error handling and crash reporting choice. Generated artifacts remain ignored; no credentials committed. A minimal app must install and launch in CI.

### Response 3 — Identity and safe API access
Integrate Firebase Auth using supported native SDK, session restore, sign-in/up/recovery/verification, onboarding and account switch. Prove ID-token use with existing Supabase/API security and RLS. Add secure networking, certificate policy (no unsafe pinning), error model, token refresh, logout cleanup and authorization tests.

### Response 4 — Public shell, routing and verification
Build native public landing/discovery and verification lookup; App Links and Digital Asset Links; allowlisted `vf` domain decision; manual verification code path; QR scanner with robust validation. WebView excluded except news. Test cold/warm links, external-host attacks and QR phishing cases.

### Response 5 — Feed and publishing vertical slice
Read paginated feed and member/profile details; implement post detail, reactions/comments where APIs support them; compose supported post type; safe media upload path; optimistic state with rollback and idempotency. Instrument latency, empty/error/offline states and accessibility.

### Response 6 — Social graph, search and member controls
Implement follows, member search, mentions/tags supported by backend, mute/block/report and privacy behavior. Add voice-assisted search with text fallback, language coverage, permission UX and no background microphone. Abuse/privacy review required.

### Response 7 — Messaging and realtime
Map existing RTDB/Supabase message model and authorization; build conversation list/message thread, lifecycle-safe realtime, offline/retry semantics, unread state and attachment policy. Verify push tap routing. Do not promise message delivery/read receipts without server semantics.

### Response 8 — FCM notification platform
Ship server-side FCM HTTP v1 sender and event outbox/queue with service-account secret isolation, token lifecycle, event templates, per-category preferences, dedupe/retry, audit and dashboard/alerts. Test app foreground/background/terminated states on physical devices and multiple OEMs; document OS limitations. Existing web-push Worker remains separate unless deliberately unified behind tested dispatch modules.

### Response 9 — News WebView, remaining prioritized features and media migration
Implement news allowlisted WebView and external link handling. Deliver next member modules only from agreed priorities. Execute ImgBB/Cloudinary migration plan with privacy review, provider abstraction, old asset continuity and no-secret client policy. Validate upload failures, deletion, moderation and data portability before claiming Cloudinary removal.

### Response 10 — Hardening, signed candidate and Play readiness
Release candidate QA, security review, accessibility audit, localization, performance and battery profiling, staged rollout, crash-free/ANR monitoring, privacy disclosures, Data safety form, content rating, target SDK compliance, Play App Signing decision, internal/closed testing, production App Links certificate fingerprint, rollback plan and signed AAB provenance. Produce a release only with authorized signing and Play credentials; otherwise produce an unsigned/debug test artifact and clearly label it.

## 8. Feature accounting: a useful alternative to “10,000 features”

Do not inflate counts by counting every button, string, animation, route state, database field, device size or notification template as an independent product feature. Maintain a machine-readable registry where each item has a stable ID, user story, owner, platform, dependencies, API contract, privacy/security class, test evidence, rollout state and failure modes. A feature is “working” only if its complete path is implemented and validated.

A sensible inventory can eventually contain thousands of testable behaviors when combinations are meaningful (e.g. route + auth state + network state), but combinatorial cases must be labeled test cases, not advertised as distinct user capabilities. Build actual breadth incrementally from the repository's existing 1,867 counted surfaces, then publish a measured count generated from accepted native feature records. Do not state 10,000 implemented Android features until the registry and tests substantiate that number.

Suggested feature registry fields:

`id`, `title`, `user_value`, `screen`, `role=public/member`, `platform=android`, `api_contract`, `permissions`, `privacy_class`, `offline_behavior`, `accessibility`, `analytics_event`, `test_ids`, `status`, `release`, `owner`, `known_limitations`.

Suggested primary feature groups: app lifecycle; authentication; profile; feed; create; media; interactions; social graph; discovery; messaging; notifications; verification; QR; voice; news; preferences; accessibility; privacy/safety; offline/recovery; performance; release/update. Every entry must be finite, observable, and auditable. Count accepted leaf capabilities, publish the taxonomy and automate validation; do not fabricate a 10,000-line list.

## 9. Security, privacy and abuse requirements

- Threat-model deep links, WebView navigation, QR payloads, FCM payloads, media uploads, auth redirects, cached private data, screenshots/lock-screen disclosure, account takeover, spam and scraping.
- Backend authorization is authoritative. Client-side hidden controls are not security.
- Never embed service-account keys, signing keys, database service-role keys, ImgBB private secrets, Cloudflare secrets, or privileged API keys in source/APK. Build config and public Firebase config are not authorization secrets.
- Restrict Android exported components and intent filters; validate every incoming URI; use Android App Links; do not trust referrer or notification payload identifiers.
- Use HTTPS; redact tokens, private messages and personal data from logs and analytics. Define retention and consent for diagnostics.
- Permission minimization: notifications, camera, microphone, and location are requested contextually, never all at first launch without explanation. Device permission denial does not block unrelated app features.
- Provide block/report/mute where social interaction exists; rate-limit and abuse-protect server endpoints. Protect verification lookup against enumeration and distinguish unavailable from invalid.
- Review privacy policy and Play Data Safety declarations against all SDKs and data flows, including Firebase, crash reporting, speech recognition, WebView cookies and media providers.

## 10. Performance and quality targets

Set targets after measuring supported devices and network conditions. Proposed gates: no main-thread disk/network; smooth scrolling under representative feed payloads; bounded image dimensions and memory; paginated queries; no unbounded realtime listeners; startup and navigation budgets tracked on low/mid-tier Android devices; APK/AAB size budget agreed after baseline. Use Coil with bounded caching and server-generated thumbnails if backend supports them; avoid shipping every image at original resolution. Network retry is bounded, jittered and idempotent. Offline cache must respect privacy on shared devices and clear on logout.

Accessibility gate: TalkBack navigation and labels, keyboard/switch support where applicable, large font scale, contrast, touch target, motion reduction, localization overflow and Bengali copy review. Reliability gate: process death, rotation, background/foreground, no network, timeout, token refresh, account switch, app upgrade, notification tap and stale deep link.

## 11. CI, release engineering and Play checklist

- Establish `android/` Gradle project strategy: recommended checked-in native project rather than a generated ignored project, so native source, manifest, tests and dependency upgrades are reviewed. Do not leave the Capacitor project concurrently presented as the native app; mark transition and retire only after parity/migration decisions.
- CI: Gradle unit tests, detekt/ktlint (or one agreed lint stack), Android Lint, Compose/UI tests, dependency vulnerability/license checks, secret scanning, API compatibility tests, debug build and release-bundle validation. Cache Gradle safely.
- Signing: upload key and Play App Signing ownership handled by authorized maintainers. Secrets in CI protected environment; no private key files in Git. Validate package ID, version code/name, signing certificate, min/target SDK, 64-bit support, manifest permissions and artifact hash.
- App Links: production `assetlinks.json` uses SHA-256 of the actual Play-distributed signing certificate, not an assumed upload-key certificate. Verify via Android Digital Asset Links tooling and device tests.
- Play: store listing, screenshots, icon, feature graphic, privacy policy, support contact, content rating, target audience, Data Safety, ads declaration, app access instructions, account deletion URL/process if accounts can be created, testing track, staged rollout, pre-launch report and rollback plan.
- Release observability: crash/ANR, startup latency, API errors, FCM accepted/opened events, deep-link failures, media upload failures and verification outcomes with privacy-safe dimensions. Alert and rollback thresholds agreed before production.

## 12. Open decisions / blockers

1. Is the requested product a full replacement of `android-app/` Capacitor shell or a parallel native app during migration? This plan assumes replacement after parity validation.
2. What is the canonical verification host: `vf.bsdc.info.bd` or `vf.main.bsdc.info.bd`? Repository currently names the latter; user requests the former.
3. Which current main-site routes and API endpoints are production-ready for a native client, and which require new API contracts?
4. Does “ImgBB for all images” include private documents, profile images, voice/audio and product media? If yes, provide approved privacy/retention/access policy and verify provider suitability before implementation.
5. What are the authorized release signing/Play App Signing owners and target Android versions/device policy?
6. Which public member capabilities are launch-critical? The site scope is too broad to port all at once without quality and security loss.
7. Is background location genuinely required? No use case is evidenced in this request; default recommendation is not to request it.
8. What notification preferences and lock-screen disclosure are acceptable for private messages and social activity?

## 13. Acceptance criteria for a real native release

A release is not ready until all are true:

- Play-ready native Kotlin/Compose project exists and has no Capacitor/Flutter runtime; main site and verification flows render natively, with only approved news pages in hardened WebView.
- Package ID exactly `bd.info.bsdc.app`; signed AAB has verifiable provenance, versioning and certificate; production assetlinks match the deployed certificate.
- Auth/session and all database/API access pass security/RLS tests; no privileged secrets in APK.
- Every advertised feature has an implementation, success and failure behavior, accessibility semantics and automated/manual evidence.
- QR verification validates results server-side and handles tampered, revoked, expired and unavailable cases; voice has permission-denied and text-fallback paths.
- FCM HTTP v1 sender uses server-held service account credentials; token lifecycle and notification categories/preferences are tested. Delivery limitations are disclosed; no guarantee of delivery under force-stop/permission denial.
- Media policy is accurately documented. If no Cloudinary use is claimed, source/config/runtime scans and migration evidence show all intended flows moved safely; no sensitive uploads are placed on an unsuitable public host.
- Privacy/Data Safety, account deletion/data export obligations, incident response, accessibility, performance, crash/ANR and staged rollout gates are complete.
- No staff/admin console is present or accidentally exposed as a public mobile feature.

## 14. Immediate next work

1. Approve the native-replacement direction and resolve the verification-domain and ImgBB-scope decisions.
2. Produce detailed route/API/media/push inventory from `main-site`, migrations, Pages Functions, Firebase rules, `push-worker`, and `android-app`; identify actual production endpoints and tests.
3. Draft API contracts and mobile data-flow/threat model; establish a phased feature acceptance registry.
4. Create a minimal native Gradle/Compose app and CI in a separate, reviewable slice, retaining the current Capacitor app until replacement evidence exists.
5. Implement one complete public vertical slice (auth → feed read → detail → reaction/comment if supported → deep link → tests), then assess performance and architecture before expanding.

This sequence is how BSDC can become a credible, secure, native public Android product. A broad feature promise without these decisions would produce a fragile prototype, not the “100% working” signed Play release requested.
