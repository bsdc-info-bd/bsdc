# BSDC Native Android (`bd.info.bsdc.app`)

100% pure native Android application for the **Bangladesh Software Development Community (BSDC)** built from scratch with **Kotlin 2.0 + Java 21 + Jetpack Compose (Material 3)**.

Zero Capacitor, zero Flutter, zero web wrappers, zero Cloudinary, zero legacy VAPID, and zero admin panels.

## Architecture Overview

- `:app` — Application shell (`bd.info.bsdc.app`), edge-to-edge `MainActivity`, adaptive `NavigationBar` / `NavigationRail`, verified Android App Links (`www.bsdc.info.bd`, `bsdc.info.bd`, `vf.main.bsdc.info.bd`, `vf.bsdc.info.bd`, `news.bsdc.info.bd`, `bsdc://`), R8 release configuration, and environment-driven Play Store signing.
- `:core:model` — Pure domain contracts, verification states, reaction enums, ImgBB-only media contracts, notification taxonomy, and route destinations.
- `:core:common` — Deterministic **Java 21** core engines:
  - `DocCodeChecksum.java` (100% parity with `vf-site` / Postgres `bsdc.card_check_digit()`, automatic `O -> 4` / `I -> 8` repair)
  - `AppLinkUriRouter.java` (strict host validation routing BSDC & `vf.*` natively, `news.bsdc.info.bd` to isolated `NewsReaderScreen`, blocking `/admin*`, routing external domains to Chrome Custom Tabs)
  - `PdfSha256Verifier.java` (streaming `SHA-256` performance report verifier)
  - `BanglaDigitFormatter.java` (`০–৯` localization)
  - `AppVersionResolver.java` (tag/CI version computation)
- `:core:designsystem` — Exact BSDC light/dark emerald color system matching `main-site/src/styles/base.css`, vector shield mark matching `Logo.tsx`, reduced-motion physics, shimmer skeletons, and reusable Compose primitives.
- `:core:permissions` — Play-Store-compliant runtime permission state machine (`PermissionStateMachine.java`), DataStore request tracking, `PermissionCoordinator`, persistent non-blocking readiness banner, and Android Settings fallback sheet (`POST_NOTIFICATIONS`, `LOCATION`, `CAMERA`, `RECORD_AUDIO` exclusively for Voice Search).
- `:core:network` — Ktor OkHttp client (`BsdcHttpClientFactory`), PostgREST + RPC client (`SupabaseRestClient`), 2-decimal city rounding (`GeoCoordinatePrivacy.java`), fault-tolerant `ProfileRowCoercer`, and `BsdcPlatformApi` (`/api/auth/claims`, `/api/geo/reverse`, `profiles`, `claim_username`).
- `:core:auth` — Firebase Auth (`Email/Password`, Credential Manager `Google`, `GitHub OAuth`), single-flight JWT `role = "authenticated"` bootstrap (`DataAccessBootstrapManager`), password scorer & username/claims validators (`AuthDomainValidators.java`), and atomic sign-out.
- `:core:media` — ImgBB-only media pipeline (`ImageSignatureInspector.java` magic bytes, `ImgbbUrlAllowlist.java` host guard + Cloudinary/audio blocker, `ImageResizeTranscoder.java` EXIF + WebP compression, `/api/media/upload` + `record_media_asset`, Coil 3 `BsdcImgbbImage` + pinch-zoom lightbox).
- `:core:database` — Room SQLite offline-first store (`CachedPostEntity`, `BookmarkEntity`, `PendingDraftEntity`, `PendingOutboxMessageEntity`, `CachedThreadEntity`, `CachedMessageEntity`, `VerificationHistoryEntity`, `SavedSearchEntity`) + atomic sign-out wipe.
- `:core:sync` — WorkManager smart offline feed prefetcher (`OfflineSyncPolicy.java`, `OfflineSyncPreferencesStore`, `FeedPrefetchService`, `FeedAutoSyncWorker`, `SyncScheduler`) + outbox message flush (`send_message_once`).
- `:feature:onboarding` — Bilingual Sign In / Sign Up (4-bar strength bar) / Password Reset / Email Verification gate + 4-step Profile & Device Readiness onboarding wizard with one-tap approximate city lookup.
- `:feature:feed` — Native Home Feed (`FeedRankingEngine.java` 4-stage parity with `main-site`), horizontal algorithm/format tabs (`For You`, `Following`, `Latest`, `Questions`, `Polls`, `Snippets`), Trash Bin recovery sheet, pull-to-refresh, new-post badge, animated 5-reaction spring dock (`ReactionDock`), interactive Poll voting, Markdown & copyable syntax-highlighted code snippets, native `PostDetailScreen` with nested threaded Comments (`depth <= 3`), accepted-answer toggle, Follow/Block/Report abuse modal, and offline Room/Bookmark integration.
- `:feature:compose` — Rich bilingual Post/Article/Question/Poll/Snippet Composer & Unified Directory Hub (`ComposerValidationEngine.java`, live Markdown preview, Room draft auto-save/resume, ImgBB multi-photo uploader with progress & retry, curated tag autocomplete & `#tag`/`@mention` extraction, plus Event, Job, Freelance Gig, Open-Source Project w/ screenshots, and Community Group creation).
- `:feature:messenger` — Native Real-Time Messenger (`MessengerEngine.java`, Supabase Phoenix Realtime WebSocket transport + polling fallback, Room `threads_cache`/`messages_cache`/`pending_outbox_messages` w/ `send_message_once` UUID idempotency, direct & group chat creation, live typing signal, swipe-to-reply, 6-emoji reactions, pins, starred saved messages, in-thread search highlights, code snippets, and ImgBB photo chat — zero voice/audio notes).
- `:core:push` & `:feature:notifications` — Native FCM HTTP v1 Engine (`BsdcFirebaseMessagingService`, `BsdcPushRegistrationManager` w/ `register_fcm_token('android')` + Firestore mirror, 5 Android O+ channels aligned with `push-worker/src/fcm.ts`, `MessagingStyle` grouped alerts + `RemoteInput` inline lock-screen reply, `OPEN_URL` safe deep-link router, and bilingual Notifications Inbox w/ per-category mute & device revocation).

## Building & Signing (GitHub Actions / Android Studio)

- **Android Studio:** Open `android-app/` directly (JDK 21 + Android SDK 35). Debug builds generate a non-secret placeholder `app/google-services.json` via `node scripts/prepare-firebase.mjs`.
- **Debug APK & Unit Tests:**
  ```bash
  node scripts/prepare-firebase.mjs
  gradle test testDebugUnitTest :app:lintDebug :app:assembleDebug
  ```
- **Signed Release APK & Play Store AAB:**
  Requires real `ANDROID_GOOGLE_SERVICES_JSON` and signing keystore variables (`BSDC_KEYSTORE_PATH`, `BSDC_KEYSTORE_PASSWORD`, `BSDC_KEY_ALIAS`, `BSDC_KEY_PASSWORD`):
  ```bash
  node scripts/prepare-firebase.mjs --require-real-firebase
  gradle assembleRelease bundleRelease
  ```
