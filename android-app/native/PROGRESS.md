# Native production track: response log

This is a staged production track. “Response” means a reviewable implementation milestone, not a promise that ten replies alone make a Play-ready release. Each milestone must pass its stated gates.

| Response | Scope | Status |
|---|---|---|
| 1 | Native Gradle/Compose foundation, first public UI slice, domain-restricted incoming-link parser/tests, CI build artifact | Implemented; CI validation pending (local environment has no JDK/Android SDK) |
| 2 | Firebase email/password auth, account creation/verification email, least-privilege database-access bootstrap, safe error copy and build-time public config | Implemented; needs Firebase-configured device/integration verification |
| 3 | Real feed/profile data, pagination, loading/offline/error states | First slice implemented: `feed_candidates`, published-post hydration, loading/empty/error/retry UI and authenticated `toggle_reaction`; pagination, user reaction restoration, profile hydration, offline cache and CI/device validation remain |
| 4 | App link intake, main-site route fallback and news-only isolated WebView | Implemented initial routing and news origin boundary; production `assetlinks.json` for every associated host and physical-device verification remain |
| 5 | Social graph, comments/reactions and safety controls | Comments first slice plus member discovery/follow are implemented: RLS-protected thread read, scoped insert, comment-reaction RPC, global_search-backed people results, idempotent follow insert/unfollow and sign-in prompts; block/report/mute, persisted interaction-state restoration and integration validation remain |
| 6 | Messaging/realtime and account/device lifecycle | Authenticated inbox/thread slice implemented using BSDC inbox/message-page/read/send RPCs, discover-to-direct-conversation flow, UUID idempotency keys reused for same-body retries, periodic refresh and mark-read; no websocket realtime, attachments, delivery receipts, robust offline outbox, pagination or device QA yet |
| 7 | Native FCM HTTP v1, token lifecycle/preferences and reliable server fan-out | Native token lifecycle, owner-scoped Supabase registry, Android notification channel/foreground handler, and Worker HTTP v1 dispatch integrated with leased queue, ack/retry and invalid-token removal; service-account deployment, user preferences, OS/device E2E tests and end-to-end production validation remain |
| 8 | Verification API and QR scanning; confirm canonical verification hostname | First slice implemented: strict QR/manual payload parser, Supabase public RPC lookup for documents and report receipts, CameraX/ML Kit scan UI; parser now rejects ambiguous/duplicate query data and URI fragments, decodes encoded parameters strictly, and has expanded tests; native Gradle test/lint/build is wired in CI; **not yet compiled or executed**, and canonical host and device behavior still need confirmation; RPC field mapping matches checked-in SQL definitions but live deployment is unverified |
| 9 | Voice search, publishing/media migration, accessibility/performance | Not started |
| 10 | Security/privacy review, physical-device QA, signed AAB and Play checklist | Not started |

A milestone is not “done” until its automated tests and acceptance evidence are recorded. Production signing secrets and provider credentials are not available in source and must be configured by authorized maintainers.
