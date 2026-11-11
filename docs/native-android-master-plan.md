# BSDC Native Android Application — Master Architectural Plan (`bd.info.bsdc.app`)

> **Status:** Approved Architectural Blueprint (Pre-Phase 1)  
> **Target Package ID:** `bd.info.bsdc.app`  
> **Primary Language Stack:** Kotlin 2.0 + Java 21 + Jetpack Compose (Material 3 Expressive)  
> **Legacy Replaced:** `android-app/` Capacitor WebView shell (zero Capacitor/Flutter/React Native)  
> **Audience Scope:** Public BSDC Members, Developers, Learners, Marketplace Customers/Vendors, and Public Trust Verification (`vf.bsdc.info.bd` / `vf.main.bsdc.info.bd`). All Admin & Corporate Staff Consoles (`admin-site`, `moderator-site`, `config-site`, etc., `/admin*`) are strictly excluded by design.

---

## 1. Executive Summary & Honest Engineering Boundaries

BSDC (Bangladesh Software Development Community) currently operates across `main-site` (`www.bsdc.info.bd`), `vf-site` (`vf.main.bsdc.info.bd` / `vf.bsdc.info.bd`), `news.bsdc.info.bd`, Cloudflare Pages Functions (`main-site/functions/`), a dedicated Cloudflare Push Worker (`push.api.bsdc.info.bd`), Firebase project `bsdc-bd` (Auth, Firestore, RTDB, FCM), and a 90+ table / 128+ public-member RPC Supabase PostgreSQL database (`supabase/migrations/0001`–`0086`).

The previous `android-app/` directory is a minimal Capacitor wrapper loading remote URLs inside a WebView. This plan replaces `android-app/` completely from scratch with a **100% native multi-module Android application** engineered in **Kotlin 2.0 + Java 21 + Jetpack Compose**, preserving zero-downtime compatibility with BSDC's live backend, database schema, security model, ImgBB-only image pipeline, and FCM HTTP v1 push infrastructure.

### 1.1 Transparent Technical & Policy Constraints
1. **Local Sandbox Build Boundary vs. CI Compilation:** The container workspace does not include JDK, `kotlinc`, Gradle, or the Android SDK (`platforms;android-34`), and external artifact hosts (`dl.google.com`, `repo.maven.apache.org`, `services.gradle.org`) are unreachable from the sandbox. Therefore, Gradle compilation, Android Lint, R8 shrinking, JUnit unit tests, and signed APK/AAB packaging execute inside GitHub Actions (`.github/workflows/android.yml` on `ubuntu-latest` with Java 21 + Android SDK 34/35), while structural manifest, host-allowlist, secret-scan, and TypeScript/Edge checks run directly in the sandbox.
2. **Permission Persistence vs. Google Play Store Policy & Android 11+ OS Behavior:**
   - Starting in Android 11 (API 30), tapping "Deny" twice permanently disables further OS runtime permission dialogs (`shouldShowRequestPermissionRationale == false`); calling `launch()` afterwards becomes a silent no-op unless the app guides the user to `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`.
   - Google Play Console Policy rejects apps that hard-block non-hardware features (such as reading the public developer feed or manually entering a verification code) behind mandatory upfront `CAMERA`, `RECORD_AUDIO`, and `ACCESS_FINE_LOCATION` walls.
   - **Play-Store-Compliant Persistent Readiness Engine:** Requests `POST_NOTIFICATIONS`, `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`, `CAMERA` (QR + photo capture), and `RECORD_AUDIO` (exclusively for real-time Voice Search via `SpeechRecognizer`) cleanly via onboarding + persistent readiness banner + per-feature re-prompt & Settings deep-link fallback.
- **No Audio Hosting / ImgBB Images Only:** Messenger deliberately excludes audio voice-note recording/upload because BSDC's sole media host is ImgBB (images only) with zero Cloudinary/Supabase Storage blobs; `RECORD_AUDIO` serves Voice Search exclusively.
3. **Zero Artificial Inflation ("Not a Feature-Count Generator"):** Consistent with `docs/bsdc-master-implementation-prompt.md`, `docs/native-android-feature-catalog.md` records genuine, verifiable, non-duplicated architectural capabilities (`AND-*` identifiers) mapped directly to real BSDC RPCs, screens, Edge routes, native hardware integrations, offline tables, animations, and tests — rather than inflating numbers with duplicate synthetic prose.

---

## 2. Deep Verification of Existing BSDC Production Contracts

Every network boundary in the native app aligns identically with the existing BSDC codebase verified across the repository:

### 2.1 Identity, Firebase Auth & Supabase RLS Bridge
- **Firebase Project (`bsdc-bd`):** Native Firebase Android SDK (`firebase-auth-ktx`) handles Email/Password sign-up/sign-in, password reset, email verification, Google Sign-In (`Credential Manager`), and GitHub OAuth (`OAuthProvider`). Corporate Firebase (`bsdc-second`) is never referenced.
- **Claims Minting (`POST https://www.bsdc.info.bd/api/auth/claims`):**
  - Fresh Firebase accounts lack the reserved `role: "authenticated"` claim required by Supabase PostgREST (`bsdc.current_uid()`).
  - Upon login or token check, `DataAccessBootstrapManager` inspects `IdTokenResult.claims["role"]`. If missing, it `POST`s `{ uid, role, vendor: false, staff: false }` with `Authorization: Bearer <firebase_id_token>` to `/api/auth/claims`, then invokes `user.getIdToken(true)` to refresh the JWT before executing any authenticated Supabase query.
  - Database authority overrides cached claims via `public.my_role()`, keeping local `SessionState` strictly synchronized (`member`, `creator`, `vendor`, etc.).
- **Identity Isolation & Leak Prevention:** Switching accounts or signing out immediately cancels all active Kotlin Coroutine scopes, disconnects Supabase Realtime & Firebase RTDB sockets, wipes in-memory ViewModel state, clears encrypted/Room private member caches (`messages`, `notifications`, `drafts`, `cart`, `orders`, `bookmarks`), and calls `FirebaseMessaging.deleteToken()` + `public.forget_fcm_token(token)` in order before completing sign-out.

### 2.2 Supabase PostgreSQL REST & Realtime Layer
- **Direct PostgREST Client:** Typed Ktor HTTP client (`https://<project>.supabase.co/rest/v1/...`) sending `apikey: <SUPABASE_PUBLISHABLE_KEY>`, `Authorization: Bearer <firebase_id_token>`, `x-bsdc-app: android-app`, and `Accept-Profile: public`. Service-role keys never exist in client code or Gradle config.
- **Public & Member RPC Domains Verified in Migrations `0001`–`0085`:**
  - **Profiles & Social Graph (`0001`, `0061`, `0062`):** `claim_username`, `next_username_change`, `follow_suggestions`, follows, blocks, reports.
  - **Feed & Content (`0003`, `0005`, `0050`, `0085`):** `feed_candidates`, `feed_new_count`, `record_feed_impression`, `increment_post_view`, `cast_poll_vote`, `my_deleted_content`, post/article/question/poll/snippet CRUD, tag archives.
  - **Interactions & Bookmarks (`0007`, `0045`, `0076`):** `toggle_reaction` (`like`, `insightful`, `celebrate`, `support`, `curious`), `toggle_comment_reaction`, `mark_answer`, `toggle_bookmark`, `record_share`, `post_interaction_state`, `my_inbox`, `inbox_unread_count`, `mark_inbox_read`, `mark_notifications_read`, `clear_inbox`, `mute_notification_kind`.
  - **Messenger (`0009`, `0048`, `0051`, `0082`):** `conversation_inbox`, `open_direct_conversation`, `create_group_conversation`, `send_message_once` (UUID idempotency key), `conversation_messages`, `conversation_messages_page`, `conversation_state`, `conversation_pins`, `toggle_message_reaction`, `mark_message_read`, `toggle_message_pin`, `toggle_message_star`, `search_messages`, `saved_messages`, `leave_conversation`, `unread_message_count`. Note: Because media hosting is strictly **ImgBB images only**, Messenger carries text, Markdown/code snippets, replies, reactions, pins, stars, and ImgBB images (`comment-image`) with **zero audio voice-note recording or audio file storage**.
  - **Communities & Events (`0011`, `0066`):** `group_directory`, `create_group`, `join_group`, `decide_join_request`, `leave_group`, `set_group_role`, `event_calendar`, `event_detail`, `rsvp_event`, `toggle_page_follow`.
  - **Opportunities & Showcase (`0013`, `0066`):** `job_board`, `job_detail`, `apply_to_job`, `withdraw_application`, `decide_application`, `increment_job_view`, freelance gigs (`submit_proposal`), open-source projects (`toggle_project_star`).
  - **Learning (`0015`):** `course_catalog`, `course_outline`, `enroll_in_course`, `complete_lesson`, `quiz_paper`, `grade_quiz_attempt`.
  - **Public Trust & Verification (`0015`, `0030`, `0080`, `vf-site`):** `verify_code` (`BSDC-CT-*`, `BSDC-NT-*`, `BSDC-ID-*`), `verify_performance_report`, `notice_feed`, `acknowledge_notice`.
  - **Search (`0017`):** `global_search`, `search_suggestions`, `trending_searches`, `log_search`.
  - **Marketplace, Vendor & Ads (`0018`, `0020`, `0022`, `0077`–`0079`):** `product_catalog`, `add_to_cart`, `set_cart_quantity`, `clear_cart`, `my_cart`, `place_order`, `cancel_order`, `my_orders`, `submit_review`, `toggle_wishlist`, `open_shop`, `my_shop`, `shop_products`, `shop_orders`, `shop_balance`, `shop_ledger_entries`, `shop_payouts`, `request_payout`, `publish_product`, `restock_product`, `advance_order`, `mark_order_paid`, `serve_ads`, `record_ad_event`, `ad_wallet_balance`, `topup_ad_wallet`, `create_campaign`, `add_creative`, `submit_campaign`, `set_campaign_paused`, `my_campaigns`, `campaign_performance`, `campaign_timeseries`, `campaign_creative_performance`, `ad_wallet_history`.

### 2.3 ImgBB-Only Media Pipeline (Zero Cloudinary)
- **Strict Policy (`main-site/functions/_media.ts`, `media-contract.ts`, `0083_imgbb_only_media.sql`):**
  - Accepted purposes: `avatar`, `cover`, `project-cover`, `project-image`, `post-image`, `comment-image`, `product-image`.
  - Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` up to 10 MB (`MAX_BYTES.image`).
  - **Native Pre-Upload Pipeline (Java + Kotlin):**
    1. Read image stream via `ContentResolver` + `ExifInterface` orientation normalization.
    2. Smart dimension resize (512 px max edge for avatars, 1600 px for post/comment/project/product images, 1920 px for covers) and WebP/JPEG compression via `ImageResizeTranscoder.java`.
    3. Magic-byte validation in `ImageSignatureInspector.java` (matching `main-site/src/lib/media/image-signature.ts` before upload).
    4. Upload multipart `POST https://www.bsdc.info.bd/api/media/upload` with `Authorization: Bearer <firebase_id_token>`, fields `file` + `purpose`.
    5. Edge proxy verifies Firebase ID token, inspects bytes, uploads solely to ImgBB (`IMGBB_API_KEY` stays strictly server-side), and returns `{ ok, provider: "imgbb", kind: "image", url, thumbUrl, deleteToken, width, height, bytes, mimeType }`.
    6. Client immediately persists ownership metadata in Postgres via `public.record_media_asset(...)`.
  - **Rendering Resilience:** Coil 3 (`ImageLoader` with OkHttp + memory/disk LRU caches) progressively loads `thumbUrl` then full `url`, automatically falling back to Cloudflare edge cache proxy `GET https://www.bsdc.info.bd/media/i?u=<encoded>` on regional ISP slowdowns, while enforcing strict ImgBB host allowlisting (`i.ibb.co`, `ibb.co`, `i.ibb.co.com`, `*.ibb.co`).

### 2.4 Real-Time FCM HTTP v1 & Cloudflare Push Worker (`push.api.bsdc.info.bd`)
- **Zero Legacy VAPID / Zero Legacy FCM Server Keys:**
  - `BsdcFirebaseMessagingService` registers tokens via `public.register_fcm_token(p_token, 'android', userAgent, language)` (`bn` or `en`) and mirrors device state to Firestore `devices/{uid}/tokens/{sha256}` (matching `main-site/src/lib/push/fcm.ts`).
  - `push-worker` (`https://push.api.bsdc.info.bd`) runs cron `* * * * *` (and queue bursts) reading `public.fcm_pending_devices`, exchanging `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` RSA-256 JWT for OAuth2 Google tokens, and firing FCM HTTP v1 (`priority: HIGH` / `NORMAL`, localized `bn`/`en` title/body, `click_action: "OPEN_URL"`, `data.url`, `data.path`, `data.kind`, `data.tag`).
  - **Companion Backend Polish (Planned in Phase 7):** Extend `push-worker/src/fcm.ts` `android.notification.channel_id` mapping so Android O+ cleanly routes notifications into 5 user-tunable channels (`bsdc_messages`, `bsdc_social`, `bsdc_following`, `bsdc_opportunities`, `bsdc_verification`), while preserving backward compatibility for Web Push & older tokens.
  - **Lock-Screen & Killed-App Delivery:** Handling both notification-tray intents (`action="OPEN_URL"` + `extras["url"]`) and high-priority data payloads (`BsdcFirebaseMessagingService.onMessageReceived`) ensures delivery when locked, backgrounded, or killed — including `MessagingStyle` grouped chats with inline **Quick Reply** (`RemoteInput` -> `WorkManager` -> `send_message_once`) and **Mark Read** actions.

### 2.5 Deep Links vs. Smart News WebView Routing
- **Verified Android App Links (`android:autoVerify="true"`):**
  - Hosts routed **100% natively into Jetpack Compose screens (ZERO WebView)**:
    - `https://www.bsdc.info.bd` & `https://bsdc.info.bd`
    - `https://vf.main.bsdc.info.bd` & `https://vf.bsdc.info.bd`
    - Custom URI scheme `bsdc://`
  - Companion `vf-site/functions/.well-known/assetlinks.json.ts` will be added alongside `main-site/functions/.well-known/assetlinks.json.ts` so Play App Signing SHA-256 fingerprints verify App Links on both community and verification domains.
- **Dedicated Smart News WebView (`https://news.bsdc.info.bd`):**
  - All `news.bsdc.info.bd` URLs open inside `NewsReaderScreen`, an isolated sandboxed WebView featuring an animated top progress bar, strict host & HTTPS navigation guard (`shouldOverrideUrlLoading` rejects HTTP, non-news domains break out to Chrome Custom Tabs), zero exposed `@JavascriptInterface` auth bridges (no Firebase/Supabase tokens ever injected into WebView storage), font-size toggle, share-to-BSDC-feed shortcut, and article bookmarking.
- **Untrusted / External Links:** Strictly routed to Android Chrome Custom Tabs / System Browser (`AppLinkUriRouter.java`), never inside the app shell.

### 2.6 Geo Reverse Geocode (`/api/geo/reverse`)
- Uses `FusedLocationProviderClient` (Play Services Location) when user taps "Use my location" in Onboarding, Profile, Events, Marketplace, or Feed Local Meetups.
- Rounds coordinates client-side before `POST https://www.bsdc.info.bd/api/geo/reverse` `{ latitude, longitude, language }`, displaying city/division name without persisting raw GPS history.

---

## 3. Hybrid Kotlin + Java + Jetpack Compose Architecture

The native project replaces `android-app/` with a clean Gradle Kotlin DSL (`build.gradle.kts`) multi-module Clean Architecture + MVI (`StateFlow` + sealed `Intent` + one-shot `Effect`) workspace:

```text
android-app/
├── build.gradle.kts                 # Root Gradle Kotlin DSL + Version Catalog plugins
├── settings.gradle.kts              # Multi-module registry
├── gradle.properties                # JVM heap, R8 fullMode, Kotlin & Compose flags
├── gradle/libs.versions.toml        # Central dependency catalog (PASVL-1.0 compatible licenses)
├── app/                             # Android Application binary (bd.info.bsdc.app)
│   ├── build.gradle.kts             # Signed release config, ABI splits / AAB config, R8 rules
│   ├── proguard-rules.pro           # Strict release obfuscation & Firebase/Kotlinx serialization rules
│   └── src/main/
│       ├── AndroidManifest.xml      # App Links, FCM service, Permissions, FileProvider
│       ├── java/bd/info/bsdc/app/   # Java 21 + Kotlin Application, MainActivity, NavHost
│       └── res/                     # Adaptive launcher icons, Noto Sans Bengali + Inter fonts, splash XML
├── core/
│   ├── model/                       # Pure Kotlin/Java domain DTOs, enums, Verification & Checksum models
│   ├── common/                      # Java 21 DocCodeChecksum.java, AppLinkUriRouter.java, DateUtils, Dispatchers
│   ├── designsystem/                # BSDC Material 3 tokens (exact base.css palette), animations, Lottie/Motion, Bengali typography
│   ├── network/                     # Ktor Supabase REST + Realtime WebSocket + Edge API + Firebase Claims Interceptor
│   ├── auth/                        # Firebase Auth, Credential Manager, DataAccessBootstrap, Role reconciliation
│   ├── database/                    # Room 2.6 SQLite offline store (Feed, Posts, Threads, Notifications, VerifyHistory, Outbox)
│   ├── media/                       # Java ImageSignatureInspector + ImageResizeTranscoder + ImgBB Uploader + Coil 3
│   ├── push/                        # FCM Service, NotificationChannels, Inline Reply Receiver, PushSyncWorker
│   ├── permissions/                 # Java PermissionStateMachine + Persistent Readiness UI + Settings fallback
│   └── sync/                        # WorkManager Smart Offline Feed Prefetcher, Outbox Flush, Cache Pruning
└── feature/
    ├── onboarding/                  # Animated Splash, Login/Signup/Reset/OAuth, Profile Onboarding, Permissions Setup
    ├── feed/                        # Home Feed (For You/Following/Questions/Polls/Snippets), Story/Highlight strip, Custom Animated Reactions, Post Detail
    ├── compose/                     # Multi-type Post/Article/Question/Poll/Snippet Composer, ImgBB Cropper, Create Directory Hub
    ├── messenger/               # Inbox, Realtime Direct/Group Threads, Typing/Presence, Image Share, Search/Pins/Stars (no audio notes)
    ├── verify/                      # Native vf.bsdc.info.bd Hub: CameraX + MLKit Real-Time QR Scanner, Doc Checksum, PDF SHA-256, Notice Feed
    ├── discover/                    # Global Search + Native SpeechRecognizer Voice Search, Trending Tags, Events, Groups, Profiles
    ├── opportunities/               # Jobs Board, Freelance Gigs, Open-Source Projects + Owner Edit, Code Playground
    ├── learning/                    # Courses, Lesson Reader, Interactive Quizzes, Earned Certificates -> Native Verify
    ├── market/                      # Shop Catalog, Cart, Checkout, Orders, Reviews, Wishlist, Vendor Storefront & Creator Ads
    ├── news/                        # Sandboxed Smart WebView Reader exclusively for news.bsdc.info.bd
    └── settings/                    # Notifications, Bookmarks, Trash Recovery, Offline Sync Settings, Language (bn/en), Theme, System Check
```

### 3.1 Intentional Kotlin + Java Interop Split
- **Java 21 Core Utilities (`core/common`, `core/media`, `core/permissions`):**
  - `DocCodeChecksum.java`: Exact byte-for-byte port of `cardCheckDigit()`, `normaliseDocCode()`, and `parseDocCode()` from `corporate-kit/src/domain/trust.ts` & `staff.ts` (including automatic `O -> 4` / `I -> 8` repair and `BSDC-(CT|NT|ID)-XXXXXXXX-D` check-digit math).
  - `PdfSha256Verifier.java`: Streaming `DigestInputStream` (`MessageDigest.getInstance("SHA-256")`) over Android `ContentResolver` `InputStream` for verifying sealed performance report PDFs without loading large files into RAM.
  - `ImageSignatureInspector.java`: Zero-allocation magic-byte header verifier matching `main-site/src/lib/media/image-signature.ts` (`JPEG`, `PNG`, `GIF`, `WebP`, `AVIF`) before multipart upload.
  - `ImageResizeTranscoder.java`: Deterministic EXIF orientation correction + Lanczos/bilinear scaled `Bitmap` compression respecting BSDC bounding dimensions.
  - `AppLinkUriRouter.java`: Pure URI host/path security validator routing `www.bsdc.info.bd`, `bsdc.info.bd`, `vf.main.bsdc.info.bd`, `vf.bsdc.info.bd`, and `bsdc://` natively, `news.bsdc.info.bd` to `NewsReaderScreen`, and everything else (plus `http://` / `javascript:` / `//` protocol-relative payloads) safely out or rejected.
  - `PermissionStateMachine.java`: Deterministic Android permission finite-state evaluator (`GRANTED`, `NEEDS_REQUEST`, `SHOW_RATIONALE`, `PERMANENTLY_DENIED_OPEN_SETTINGS`).
- **Kotlin 2.0 + Jetpack Compose (`app`, `feature/*`, `core/network`, `core/database`, `core/auth`):**
  - Reactive UI with Compose Navigation Type-Safe Routes, `SharedTransitionLayout` hero transitions (avatar/post-card/image lightbox), spring-physics custom animated reaction dock (`like`, `insightful`, `celebrate`, `support`, `curious`), adaptive `NavigationBar` -> `NavigationRail` across compact/tablet/foldable screens, Coroutines + StateFlow, Room offline-first Paging 3 RemoteMediator, Ktor serialization, CameraX + ML Kit Barcode Analyzer, and `SpeechRecognizer` audio RMS visualizer.

---

## 4. Visual Design System, UX Motion & Accessibility Standards

1. **BSDC Brand Identity Tokens (`core/designsystem`):** Exact port of `main-site/src/styles/base.css` light (`#FFFFFF` / `#F2F7F5` / `#1B4332` / `#40916C` / `#1877F2`) and dark (`#0B1512` / `#101E19` / `#52B788` / `#4E9BFF`) themes, plus dynamic Material You wallpaper harmonization toggle in Settings.
2. **Bilingual Typography (`bn` & `en`):** Bundled `NotoSansBengali` variable TTF + `Inter` + `JetBrainsMono` font families; live in-app Bangla/English toggle (`AppCompatDelegate.setApplicationLocales`) plus Bangla numeral formatter matching `toBanglaDigits()`.
3. **Facebook / Instagram / YouTube-Grade Tactile Motion & Ergonomics:**
   - Pull-to-refresh spring header & floating **"N new posts"** pill (via `feed_new_count`) with smooth scroll-to-top anchor.
   - Long-press or tap reaction trigger popping an animated spring emoji/custom-SVG reaction tray with drag-to-select magnification + `HapticFeedbackType.LongPress` / `TextHandleMove`.
   - Swipe-right-to-reply inside Messenger chat bubbles with animated velocity snap-back.
   - Pinch-to-zoom ImgBB full-screen media viewer with swipe-down-to-dismiss shared element transition.
   - Double-tap to react on media cards, animated skeleton shimmers during initial cold fetch, and deterministic offline indicators.
4. **Accessibility (WCAG 2.2 AA & TalkBack):** Minimum `48dp × 48dp` touch targets, `contentDescription` on all custom icons, `semantics(mergeDescendants = true)` on feed cards, `liveRegion = LiveRegionMode.Polite` status updates for upload/verification states, and full support for `prefers-reduced-motion` (`ANIMATOR_DURATION_SCALE == 0f` disables springs gracefully).

---

## 5. Offline-First Smart Sync & Storage Architecture (`core/database` + `core/sync`)

- **Room SQLite Entities:**
  - `CachedPostEntity` + `FeedRemoteKeyEntity` (stores For You / Following / Latest feed snapshots, author metadata, reaction counts, parsed tags, ImgBB URLs).
  - `CachedPostDetailEntity` (full Markdown body, poll options, comments tree snapshot).
  - `CachedThreadEntity` & `CachedMessageEntity` (instant Messenger cold boot + 500-message rolling window).
  - `PendingOutboxMessageEntity` (offline queued chat messages with deterministic `client_id` UUID flushed automatically when network returns via `send_message_once`).
  - `PendingDraftEntity` (auto-saved post/article/question drafts & pending ImgBB media URIs).
  - `BookmarkEntity` (full readable offline copy of bookmarked posts).
  - `VerificationHistoryEntity` (offline audit log of scanned/verified `BSDC-CT/NT/ID` codes & report SHA-256 checks).
  - `NewsBookmarkEntity` & `SavedSearchEntity`.
- **Smart Auto-Download Feed Sync (`FeedAutoSyncWorker` via `WorkManager`):**
  - Configurable in Settings: *Wi-Fi Only (Default)*, *Wi-Fi + Cellular*, or *Off*.
  - Periodic background sync + post-launch idle prefetch fetches top N unread posts, bookmarked articles, and small ImgBB `thumbUrl` assets into Coil disk cache within configurable storage budget (default 150 MB LRU cap), making underground/commute reading instantaneous and seamless.

---

## 6. Security, Privacy, R8 & Play Store Release Engineering

- **Zero Secrets in APK/AAB:** Only public runtime client keys (Firebase client config + Supabase URL & publishable key) live in `BuildConfig` / `google-services.json`. `IMGBB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSH_FLUSH_SECRET`, and `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` never touch Android code.
- **Transport Hardening:** `android:usesCleartextTraffic="false"`, `network_security_config.xml` permitting HTTPS system CAs only (zero user-installed proxy trust in release builds), `allowBackup="false"`, encrypted `DataStore`/`EncryptedSharedPreferences` for device preferences, and zero token logging in `Logcat` during release (`BuildConfig.DEBUG` guard).
- **Play Store Artifacts & Monorepo Integration:**
  - `android-app/app/build.gradle.kts` produces ABI-split / universal signed **APK** (for sideload verification & GitHub Releases) and Google Play **AAB** (`bundleRelease`) with R8 full-mode shrinking + resource shrinking (`isMinifyEnabled = true`, `isShrinkResources = true`) + mapping upload artifacts.
  - `AndroidManifest.xml` targets `compileSdk = 35`, `targetSdk = 35`, `minSdk = 26` (Android 8.0+), covering >96% of active Android devices in Bangladesh while complying with current Google Play API-level mandates.
  - **Monorepo Updates Required During Migration:**
    1. Replace Capacitor files in `android-app/` with native Gradle project.
    2. Update `scripts/audit.mjs` (`A-03`, `A-04`, `D-06`, `H-02`), `scripts/release-check.mjs`, `scripts/count-registry.mjs`, `.github/workflows/ci.yml`, and `.github/workflows/android.yml` to verify native Kotlin/Java sources, AndroidManifest deep links, cleartext=false, ImgBB-only URLs, zero Cloudinary/admin leakage, JUnit unit tests, Android Lint, and Debug/Signed Release builds.
    3. Add `vf-site/functions/.well-known/assetlinks.json.ts` alongside `main-site/functions/.well-known/assetlinks.json.ts`.
    4. Enhance `push-worker/src/fcm.ts` to populate Android `channel_id` cleanly by notification category.

---

## 7. Ten-Phase Implementation Roadmap

| Phase | Milestone Name | Primary Modules & Deliverables | Key Verification Gate |
| --- | --- | --- | --- |
| **Phase 1** | **Native Foundation, Monorepo Cutover & Design System** | Root Gradle/TOML catalog, `app`, `core:model`, `core:common` (Java 21 `DocCodeChecksum`, `AppLinkUriRouter`, `PdfSha256Verifier`), `core:designsystem` (exact BSDC light/dark theme, Bengali/English typography, motion primitives), updated `scripts/audit.mjs`, `release-check.mjs`, `.github/workflows/{android,ci}.yml`, `vf-site` `assetlinks.json.ts`. | `node scripts/audit.mjs`, Gradle wrapper/build config check, CI `android.yml` compile green |
| **Phase 2** | **Permissions Engine, Firebase Auth & Claims Security Bridge** | `core:permissions` (`PermissionStateMachine.java` + animated onboarding & persistent readiness banner + Settings bridge), `core:auth` (`FirebaseAuth`, Credential Manager Google Sign-In, GitHub OAuth, `/api/auth/claims` token minting, `my_role()` reconciliation, account-switch wipe), `core:network` (Ktor Supabase REST + Interceptor), `feature:onboarding` (Login/Signup/Reset/Onboarding). | JUnit tests for `PermissionStateMachine`, token bootstrap, account-switch isolation |
| **Phase 3** | **Offline Room Database, Smart Auto-Sync & ImgBB Media Pipeline** | `core:database` (Room entities/DAOs/Migrations for Feed, Details, Drafts, Bookmarks, Outbox, VerifyHistory), `core:sync` (`WorkManager` smart Wi-Fi feed prefetcher + LRU disk pruning), `core:media` (`ImageSignatureInspector.java`, `ImageResizeTranscoder.java`, `/api/media/upload` -> `record_media_asset`, Coil 3 ImgBB-only + `/media/i` fallback + fullscreen lightbox). | JUnit tests for magic-byte sniffing, Room DAO queries, ImgBB host enforcement |
| **Phase 4** | **Home Feed, Post Detail, Custom Reactions & Threaded Comments** | `feature:feed` (For You / Following / Latest / Questions / Polls / Snippets feeds, `feed_new_count` floating pill, Pull-to-Refresh, shared-element post detail, Markdown + syntax highlighting, interactive Polls `cast_poll_vote`, custom animated 5-reaction spring tray `toggle_reaction`, nested comments + `mark_answer`, bookmarks, trash, report/block). | Feed Paging + Reaction state tests + Compose UI state tests |
| **Phase 5** | **Rich Composer & Directory Creation Hub** | `feature:compose` (Post/Article/Question/Poll/Snippet composer, Room draft auto-save, multi-image ImgBB crop/upload with progress, tag autocomplete, Markdown live preview, edit existing post `/compose/{id}`, unified `/create` flow for Groups/Events/Jobs/Gigs/Projects). | Draft persistence, upload retry & validation tests |
| **Phase 6** | **Real-Time Messenger, ImgBB Photo Chat & Offline Outbox** | `feature:messenger` (`conversation_inbox`, `open_direct_conversation`, `create_group_conversation`, `send_message_once` idempotency, Supabase Realtime Postgres Changes + RTDB presence/typing, swipe-to-reply, reactions/pins/stars, ImgBB image chat, message search, saved messages, offline outbox — zero audio note storage). | Outbox idempotency, live/reconnect state & search tests |
| **Phase 7** | **FCM HTTP v1 Push Engine, `push-worker` Channels & Notifications Inbox** | `core:push` (`BsdcFirebaseMessagingService`, `register_fcm_token('android')`, Firestore device mirror, 5 Android O+ channels, `MessagingStyle` grouped alerts, `RemoteInput` lock-screen inline reply, `OPEN_URL` deep-link intent handler), `push-worker/src/fcm.ts` channel_id alignment, `feature:notifications` inbox & per-kind muting. | `push-worker` Vitest + Kotlin notification routing & deep-link JUnit tests |
| **Phase 8** | **Merged Native `vf-site` Verification Hub & CameraX+MLKit QR Scanner** | `feature:verify` (`verify_code`, `verify_performance_report`, `notice_feed`, `acknowledge_notice`, CameraX real-time preview + ML Kit Barcode Analyzer with torch/zoom/gallery QR scan, haptic/audio feedback, PDF file SHA-256 verification via `PdfSha256Verifier.java`, verification history list). | `DocCodeChecksum`, PDF SHA-256 tamper & QR URL extraction unit tests |
| **Phase 9** | **Global Search + Voice Search, Communities, Opportunities, Playground & Learning** | `feature:discover` (Global Search + native `SpeechRecognizer` live RMS waveform modal, `/api/geo/reverse` location meetup filter, Groups `/g/{slug}`, Events `/events/{slug}`, Profiles `/@{username}`), `feature:opportunities` (Jobs, Gigs, Open-Source Projects, Multi-lang Code Playground), `feature:learning` (Courses, Lesson progress, Quizzes, Earned Certificates). | Voice recognizer state machine, Geo rounding & Course quiz tests |
| **Phase 10** | **Marketplace, Vendor/Ads, Smart `news.bsdc.info.bd` WebView, Settings & Play Store Release** | `feature:market` (Shop, Cart, Checkout, Orders, Reviews, Wishlist, Vendor & Creator Ads non-admin self-service), `feature:news` (isolated `news.bsdc.info.bd` smart WebView reader), `feature:settings` (Offline sync preferences, bilingual switcher, System Check diagnostics, About/Guidelines/Contact), R8 ProGuard hardening, Play Store AAB + Signed Release Verification in CI. | Full `audit.mjs`, `release-check.mjs`, `push-worker` tests, and green CI `.github/workflows/android.yml` release APK/AAB build |

---
*End of Master Plan — paired directly with `docs/native-android-feature-catalog.md`.*
