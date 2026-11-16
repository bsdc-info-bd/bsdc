# BSDC Native Android Application — Verified Granular Feature Catalog

> **Package:** `bd.info.bsdc.app`  
> **Counting Rule:** Consistent with `scripts/count-registry.mjs` and `docs/bsdc-master-implementation-prompt.md`, every numbered item (`AND-xxxx`) below represents one distinct, implementable engineering capability — a screen, interactive control, state machine, Supabase RPC contract, Room table/query, Edge/Worker route, permission gate, hardware sensor hook, animation, security guard, or automated verification target. Nothing is duplicated or padded artificially.  
> **Scope Exclusion:** Zero admin or corporate staff console features (`admin-site`, `/admin*`, `bsdc-second`) appear in this catalog or binary.

---

## Domain 1 — Native Gradle Multi-Module Core, CI/CD & Signing (`AND-0001` – `AND-0028`)

- `AND-0001`: Multi-module Gradle Kotlin DSL (`settings.gradle.kts`) organizing `app`, `core:*` (`10` modules), and `feature:*` (`11` modules) for parallel builds and strict boundary isolation.
- `AND-0002`: Centralized `gradle/libs.versions.toml` catalog pinning Kotlin `2.0.21`, Jetpack Compose BOM, Material 3, Room `2.6`, Ktor `3.0`, Hilt `2.52`, CameraX `1.4`, ML Kit, Coil `3.0`, and Firebase BoM with PASVL-1.0 compatible licenses only.
- `AND-0003`: Dual-language Kotlin + Java 21 compilation pipeline (`jvmTarget = 21`) with `@JvmStatic` / `@Nullable` / `@NonNull` explicit interop contracts between Java core engines and Kotlin Coroutine layers.
- `AND-0004`: Deterministic semantic version & Play Store monotonic `versionCode` resolver driven by git tags (`android-vX.Y.Z`) and CI run number.
- `AND-0005`: Environment-driven release signing block (`BSDC_KEYSTORE_PATH`, `BSDC_KEYSTORE_PASSWORD`, `BSDC_KEY_ALIAS`, `BSDC_KEY_PASSWORD`) storing zero signing secrets in source control.
- `AND-0006`: Release-only Firebase configuration guard refusing release APK/AAB builds if placeholder `google-services.json` is active.
- `AND-0007`: Google Play App Bundle (`bundleRelease`) generation with ABI, density, and locale dynamic splits.
- `AND-0008`: Release ABI-split / universal signed APK artifact export with `apksigner verify` verification step in GitHub Actions.
- `AND-0009`: R8 Full-Mode shrinking + `isShrinkResources = true` + ProGuard keep rules for Kotlinx Serialization, Firebase SDK, Room, and Retrofit/Ktor DTOs.
- `AND-0010`: Mapping file artifact archival (`mapping.txt`) for Play Console crash de-obfuscation.
- `AND-0011`: `android:usesCleartextTraffic="false"` and strict HTTPS `network_security_config.xml` disabling user-installed trust anchors in release builds.
- `AND-0012`: `android:allowBackup="false"` and `data_extraction_rules.xml` preventing cloud/USB backup leakage of cached member messages or auth state.
- `AND-0013`: Android 8.0 (`minSdk = 26`) through Android 15 (`targetSdk = 35`, `compileSdk = 35`) edge-to-edge inset compatibility (`enableEdgeToEdge()`).
- `AND-0014`: Predictive Back Gesture (`android:enableOnBackInvokedCallback="true"`) integrated cleanly across Compose navigation backstack and bottom sheets.
- `AND-0015`: Adaptive monochrome & mipmap launcher icon pack matching BSDC emerald identity on Android 13+ themed launchers.
- `AND-0016`: Native `androidx.core:core-splashscreen` cold-boot splash screen smoothly transitioning into Compose theme without white flash.
- `AND-0017`: Static analysis & Android Lint baseline check (`lintRelease` failing on missing translations, security flags, or deprecated unsafe APIs).
- `AND-0018`: Monorepo `scripts/audit.mjs` native checks verifying package ID `bd.info.bsdc.app`, zero Capacitor/Cloudinary references, zero admin imports, cleartext disabled, and verified host intent filters.
- `AND-0019`: Monorepo `scripts/release-check.mjs` and `.github/workflows/ci.yml` integration validating native structural invariants on every commit.
- `AND-0020`: `.github/workflows/android.yml` end-to-end native build executing JUnit tests, Lint, Debug APK, and tagged Signed Release APK + AAB.
- `AND-0021`: `vf-site/functions/.well-known/assetlinks.json.ts` Digital Asset Links endpoint binding `bd.info.bsdc.app` SHA-256 certificate fingerprints to `vf.main.bsdc.info.bd` / `vf.bsdc.info.bd`.
- `AND-0022`: Debug vs Release `BuildConfig` telemetry guard suppressing all HTTP payload/token logs in release builds.
- `AND-0023`: Strict `StrictMode` disk/network violation detection enabled in debug builds to prevent main-thread UI jank.
- `AND-0024`: In-memory/Compose preview fake repository module enabling instant offline UI iteration without live backend credentials.
- `AND-0025`: Crash-safe top-level `Thread.UncaughtExceptionHandler` sanitizing diagnostics (zero PII/tokens) before persisting last-crash breadcrumbs.
- `AND-0026`: Adaptive tablet/foldable window size-class detector switching `NavigationBar` to `NavigationRail` + two-pane split layouts cleanly at `>= 600dp`.
- `AND-0027`: Per-language resource bundle structure (`values/` default English + `values-bn/` Bangla) wired with `AppCompatDelegate.setApplicationLocales`.
- `AND-0028`: In-app build metadata provider reading `versionName`, `versionCode`, and build timestamp for System Check support diagnostics.

---

## Domain 2 — Deep Linking, Security Routing & Smart News WebView (`AND-0029` – `AND-0058`)

- `AND-0029`: `AppLinkUriRouter.java` pure deterministic URL classifier auditing scheme, host, credentials, backslash tricks (`/\`), and protocol-relative (`//`) bypass attempts.
- `AND-0030`: Verified Android App Link (`android:autoVerify="true"`) claiming `https://www.bsdc.info.bd/*` natively inside Compose.
- `AND-0031`: Verified Android App Link (`android:autoVerify="true"`) claiming `https://bsdc.info.bd/*` natively inside Compose.
- `AND-0032`: Verified Android App Link (`android:autoVerify="true"`) claiming `https://vf.main.bsdc.info.bd/*` natively inside Verification Hub.
- `AND-0033`: Verified Android App Link (`android:autoVerify="true"`) claiming `https://vf.bsdc.info.bd/*` natively inside Verification Hub.
- `AND-0034`: Custom URI scheme intent-filter (`bsdc://`) supporting legacy/push routes (`bsdc://post/<slug>` -> `/p/<slug>`, `bsdc://messages/<id>`, `bsdc://verify/<code>`).
- `AND-0035`: Push notification click-action intent filter (`OPEN_URL`) resolving `url`, `path`, `kind`, and `id` extras safely.
- `AND-0036`: Native deep link route resolver mapping `/` -> Home Feed tab with optional feed filter param.
- `AND-0037`: Native route resolver mapping `/p/{slug}` -> `PostDetailScreen` with scroll-to-comment anchor support (`#comment-{id}`).
- `AND-0038`: Native route resolver mapping `/@{username}` -> `ProfileScreen` (and supporting bare `@handle` normalization).
- `AND-0039`: Native route resolver mapping `/tag/{slug}` -> `TagArchiveScreen`.
- `AND-0040`: Native route resolver mapping `/messages` and `/messages/{id}` -> `InboxScreen` / `ConversationScreen`.
- `AND-0041`: Native route resolver mapping `/notifications` -> `NotificationsScreen`.
- `AND-0042`: Native route resolver mapping `/verify`, `/verify/{code}`, `/?code=...`, `/?c=...`, and `/?report=...` on `vf.*` hosts -> `VerificationHubScreen` with immediate verification execution.
- `AND-0043`: Native route resolver mapping `/groups`, `/g/{slug}`, `/events`, `/events/{slug}`, `/jobs`, `/jobs/{slug}`, `/freelance`, `/freelance/{slug}`, `/projects`, `/projects/{slug}`, `/projects/{slug}/edit`, `/playground`, `/learn`, `/learn/{slug}`, `/shop`, `/shop/{slug}`, `/cart`, `/checkout`, `/orders`, `/bookmarks`, `/trash`, `/search`, `/compose`, `/compose/{postId}`, `/create`, `/settings`, `/vendor*`, `/ads`.
- `AND-0044`: Explicit security block routing any `/admin*` URL gracefully to "Admin tools are web-only" notice rather than exposing admin surfaces.
- `AND-0045`: Dedicated `NewsReaderScreen` activating ONLY when host strictly equals `news.bsdc.info.bd` over `https://`.
- `AND-0046`: Isolated sandboxed WebView configuration in `NewsReaderScreen` (no `addJavascriptInterface`, disabled file/content URI access, mixed-content `MIXED_CONTENT_NEVER_ALLOW`).
- `AND-0047`: Strict `WebViewClient.shouldOverrideUrlLoading` guard intercepting any non-`news.bsdc.info.bd` link clicked inside a news article: BSDC links route natively into Compose tabs, external links open in Chrome Custom Tabs.
- `AND-0048`: Animated top determinate `LinearProgressIndicator` reflecting real `WebChromeClient.onProgressChanged` page load percentage.
- `AND-0049`: Pull-to-refresh wrapper and native back/forward browser toolbar controls inside `NewsReaderScreen`.
- `AND-0050`: Reader text-zoom slider (`85%` – `150%`) persisted locally per device inside `DataStore`.
- `AND-0051`: One-tap "Share to BSDC Feed" button pre-populating Compose sheet with news title + canonical `news.bsdc.info.bd` permalink.
- `AND-0052`: One-tap "Save Article Offline" bookmarking news URL + title + snapshot timestamp into Room `NewsBookmarkEntity`.
- `AND-0053`: Native error recovery state inside `NewsReaderScreen` on DNS/TLS failure without leaking raw Chromium error internals.
- `AND-0054`: Secure Chrome Custom Tabs launcher (`CustomTabsIntent` tinted with BSDC emerald toolbar) for external GitHub repos, portfolios, and outbound links.
- `AND-0055`: Fallback system `ACTION_VIEW` browser launcher when Chrome Custom Tabs provider is absent on minimal Android forks.
- `AND-0056`: Duplicate/rapid intent debounce preventing double-stacked screens on cold-start `onNewIntent` delivery.
- `AND-0057`: Unrecognized path graceful 404 screen (`NotFoundScreen`) offering quick navigation back to Feed, Search, or Verification Hub.
- `AND-0058`: Unit test suite (`AppLinkUriRouterTest`) asserting rejection of `http://`, `javascript:`, `file://`, `//evil.com`, `/\evil.com`, userinfo URLs, and verification of all BSDC + `vf.*` + `news.*` routes.

---

## Domain 3 — Persistent Play-Store-Compliant Permission Readiness Engine (`AND-0059` – `AND-0080`)

- `AND-0059`: `PermissionStateMachine.java` tracking exact runtime status (`GRANTED`, `NEEDS_REQUEST`, `SHOW_RATIONALE`, `PERMANENTLY_DENIED_OPEN_SETTINGS`) per capability (`NOTIFICATIONS`, `LOCATION`, `CAMERA`, `MICROPHONE`).
- `AND-0060`: Capability-aware API level resolution (`POST_NOTIFICATIONS` required API 33+, `READ_MEDIA_IMAGES` replaced cleanly by zero-permission Android Photo Picker `PickVisualMedia`).
- `AND-0061`: Animated first-launch "BSDC Device Readiness" step walking through Notifications, Location (Fine/Coarse), Camera, and Microphone with visual illustrations and plain Bangla/English purpose cards.
- `AND-0062`: Sequential multi-permission launcher avoiding jarring simultaneous OS dialog overload while visibly checking off granted items with spring checkmark animations.
- `AND-0063`: Persistent non-blocking top/settings "Device Permissions Incomplete" readiness pill surfaced whenever any core interactive capability (`Notifications`, `Location`, `Camera`, `Microphone`) remains ungranted — re-prompting on tap without blocking feed reading (Play Store compliant).
- `AND-0064`: Automatic `shouldShowRequestPermissionRationale` tracking stored in `EncryptedDataStore` to distinguish "first ask" from "Android OS suppressed after 2 denials".
- `AND-0065`: One-tap `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` deep-link dialog when OS permanently blocks further runtime popups, automatically refreshing permission status on `ON_RESUME`.
- `AND-0066`: Feature-entry re-prompt gate on QR Scanner tab: prompts Camera permission every time until granted, with clear explanation and Settings fallback.
- `AND-0067`: Feature-entry re-prompt gate on Composer Camera Capture: requests Camera cleanly before opening camera preview.
- `AND-0068`: Feature-entry re-prompt gate on Voice Search mic button: requests `RECORD_AUDIO` persistently until allowed (dedicated exclusively to speech-to-query search; zero audio file storage).
- `AND-0069`: Feature-entry re-prompt gate on Location Meetups / Onboarding / Event City / Marketplace Nearby: requests `ACCESS_COARSE_LOCATION` & `ACCESS_FINE_LOCATION` cleanly until allowed.
- `AND-0070`: Feature-entry re-prompt gate on Notifications Inbox & Follow actions when `POST_NOTIFICATIONS` is denied on Android 13+.
- `AND-0071`: Battery optimization exemption helper (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` informational prompt in Settings for aggressive OEMs like Xiaomi/Realme/Oppo) ensuring background FCM notifications survive OEM killing.
- `AND-0072`: Fine-grained Android notification channel status audit inside Settings (detecting if user disabled specific channels like `bsdc_messages` in OS settings and linking directly to `ACTION_CHANNEL_NOTIFICATION_SETTINGS`).
- `AND-0073`: Zero background location (`ACCESS_BACKGROUND_LOCATION`) declaration, honoring strict Play Store privacy minimization while preserving foreground city/meetup features.
- `AND-0074`: Location accuracy graceful handling (supporting both "Precise" and "Approximate" Android 12+ location selection seamlessly).
- `AND-0075`: Foreground microphone indicator banner & guaranteed `SpeechRecognizer` release on `ON_PAUSE` / `DisposableEffect.onDispose`.
- `AND-0076`: Guaranteed `CameraX` `ProcessCameraProvider` lifecycle unbind when navigating away or locking screen.
- `AND-0077`: "Permissions Health Score" interactive checklist inside Settings showing live Green/Amber badges for Camera, Mic, Location, Notifications, and OEM Battery status.
- `AND-0078`: Clear Bangla & English user-facing privacy disclosures explaining exactly why each permission exists (e.g. Location rounded to 1 km for `/api/geo/reverse`, Mic processed only during active voice search/note).
- `AND-0079`: No stale permission caching — re-evaluates `ContextCompat.checkSelfPermission` on every `Lifecycle.Event.ON_RESUME`.
- `AND-0080`: JUnit state-machine tests (`PermissionStateMachineTest`) covering initial request -> single denial -> rationale -> second denial -> permanent suppression -> OS Settings return -> granted transition.

---

## Domain 4 — BSDC Material 3 Design System, Motion & Bilingual Engine (`AND-0081` – `AND-0114`)

- `AND-0081`: Exact light theme color palette matching `main-site/src/styles/base.css` (`#FFFFFF` bg, `#F2F7F5` surface, `#E8F0EC` surface-2, `#1B4332`/`#40916C` emerald primary, `#1877F2` accent blue, `#D9363E` danger, `#E5A50A` warn, `#31A24C` online dot).
- `AND-0082`: Exact dark theme color palette (`#0B1512` bg, `#101E19` surface, `#16281F` surface-2, `#52B788` emerald primary, `#4E9BFF` accent, `#FF6B70` danger, `#F4C04B` warn, `#42B72A` online).
- `AND-0083`: Optional Android 12+ Material You dynamic color toggle overlaid onto BSDC semantic status tokens in Settings.
- `AND-0084`: Bundled `NotoSansBengali` variable font family rendering crisp conjunct glyphs offline without Google Fonts runtime downloads.
- `AND-0085`: Paired `Inter` display/body sans-serif and `JetBrainsMono` code monospace type scale mapped to Material 3 `Typography`.
- `AND-0086`: Live in-app Language Switcher (`bn` <-> `en`) persisted to `DataStore` and synced with Supabase profile preferences + FCM `register_fcm_token(language)`.
- `AND-0087`: Native `BanglaDigitFormatter.java` converting metrics, timestamps, poll percentages, and badges to Bangla digits (`০–৯`) when active locale is `bn`.
- `AND-0088`: Adaptive 5-tab bottom `NavigationBar` (`Home`, `Verify/QR`, `Create`, `Messenger` with live badge, `Explore/Menu`) transitioning to tablet `NavigationRail`.
- `AND-0089`: Collapsing YouTube/Instagram-style `TopAppBar` (`enterAlwaysScrollBehavior`) hiding smoothly on feed down-scroll and returning cleanly on tiny upward scroll.
- `AND-0090`: Expressive spring physics (`Spring.DampingRatioMediumBouncy`, `Spring.StiffnessMediumLow`) on reaction pops, follow toggles, bookmark pops, and floating pills.
- `AND-0091`: `SharedTransitionLayout` hero bounds transition on feed post cards, user avatars, and gallery thumbnails expanding into detail/lightbox views.
- `AND-0092`: Custom animated 5-reaction horizontal pill overlay (`Like`, `Insightful`, `Celebrate`, `Support`, `Curious`) triggered on tap-and-hold with finger-slide magnification and haptic detents (`TextHandleMove`).
- `AND-0093`: Double-tap image gesture triggering centered expanding emerald heart/sparkle burst animation + `toggle_reaction('like')`.
- `AND-0094`: GPU-efficient shimmer skeleton placeholders for Feed cards, Post details, Messenger rows, Profiles, Shop cards, and Verification card.
- `AND-0095`: Tactile `BsdcButton` variants (Primary, Secondary Tonal, Outline, Ghost, Destructive) with inline progress spinner, minimum `48dp` height, and press scale (`0.97f`) micro-interaction.
- `AND-0096`: Verified badge, Role pill (`Creator`, `Vendor`, `Verified Member`), Staff ID emblem, and Status pill system (`Valid` Emerald, `Expired/Withdrawn` Amber, `Revoked/Unknown` Crimson).
- `AND-0097`: `BsdcAvatar` with online green presence dot (`RTDB`), animated story/update ring, initials fallback, and smooth crossfade loading.
- `AND-0098`: `BsdcMarkdownRenderer` native Compose parser supporting headings, bold/italic/strikethrough, blockquotes, tables, ordered/unordered lists, task checkboxes, clickable `@mentions`, `#tags`, safe external links, and horizontal code blocks.
- `AND-0099`: Syntax-highlighted `CodeBlockCard` supporting Kotlin, Java, TypeScript, Python, Rust, SQL, Bash, and JSON with horizontal scroll, line numbers, language pill, and one-tap "Copy Code" toast feedback.
- `AND-0100`: Swipeable `MediaCarousel` with animated page dots, alt-text badge toggle, and tap-to-open pinch/zoom/pan Lightbox (`ImageViewerOverlay`).
- `AND-0101`: Relative timestamp helper (`just now`, `4m ago`, Bangla `এইমাত্র`, `৪ মিনিট আগে`) with live minute-tick updates without recomposing full lists.
- `AND-0102`: Standardized `AsyncStateView` component enforcing consistent Loading, Empty, Offline Cached, Validation Error, Forbidden, and One-Tap Retry states across every screen.
- `AND-0103`: `BsdcSnackbarHost` layered cleanly above bottom navigation bar / FAB with Undo action support (bookmark removal, archive, soft-delete to Trash).
- `AND-0104`: Custom bottom-sheet modals (`ModalBottomSheet`) with drag handle, keyboard IME padding (`imePadding()`), and safe nested scrolling.
- `AND-0105`: `PrefersReducedMotion` detector checking OS `ANIMATOR_DURATION_SCALE` and disabling spring/bounce/shimmer loops cleanly for accessibility.
- `AND-0106`: Screen-reader TalkBack semantics merging card metadata into coherent announcements (`semantics(mergeDescendants = true)`) and labeling all icon buttons in `bn` & `en`.
- `AND-0107`: Edge-to-edge system bar icon contrast auto-toggling between light and dark status/navigation bars seamlessly with theme.
- `AND-0108`: High-contrast code diff / verification receipt typography ensuring readability at 200% Android system font scaling without clipping.
- `AND-0109`: Haptic feedback utility respecting system tactile settings across likes, QR locks, voice-search trigger, and message send.
- `AND-0110`: Empty-state vector/Canvas illustrations drawn natively in Compose (`Canvas` geometric artwork — zero bloated bitmap assets).
- `AND-0111`: Expandable/collapsible `ReadMoreText` handling multi-paragraph Bangla & English posts gracefully with single-line smoothness.
- `AND-0112`: Keyboard-aware sticky composer bars (`windowInsetsPadding(WindowInsets.ime)`) never obscured behind soft keyboards.
- `AND-0113`: Pull-to-refresh material indicator (`PullToRefreshBox`) synced with subtle top progress bar during background refresh.
- `AND-0114`: Compose Screenshot / Preview & Semantic UI tests validating light/dark themes, 200% font scale, and Bangla strings without text truncation.

---

## Domain 5 — Firebase Auth, Claims Bootstrap & Session Security (`AND-0115` – `AND-0148`)

- `AND-0115`: Firebase Android SDK initialized strictly against `bsdc-bd` config from `google-services.json` (never corporate `bsdc-second`).
- `AND-0116`: Email + Password Login screen with real-time validation, show/hide password toggle, autofill credential hints (`AutofillType.EmailAddress`, `Password`), and friendly Bangla/English Firebase error mapping.
- `AND-0117`: Native Registration (`SignUpScreen`) with live password strength meter matching `main-site/src/lib/auth/password-strength.ts`.
- `AND-0118`: Password Reset (`ResetPasswordScreen`) sending Firebase reset email with rate-limit cooldown countdown timer.
- `AND-0119`: Email Verification gate (`VerifyEmailScreen`) with live auto-poll / "I've Verified" refresh and resend cooldown.
- `AND-0120`: Native Google Sign-In via Android Jetpack `CredentialManager` (`GetGoogleIdOption`) — seamless one-tap bottom sheet sign-in.
- `AND-0121`: GitHub OAuth sign-in via Firebase `OAuthProvider.newBuilder("github.com")` Custom Tab flow returning safely to app session.
- `AND-0122`: `DataAccessBootstrapManager` inspecting JWT `role == "authenticated"` claim and atomically calling `POST https://www.bsdc.info.bd/api/auth/claims` when missing.
- `AND-0123`: Single-flight coroutine `Mutex` coalescing concurrent initial claims bootstrap requests during cold start (matching JS `pending` WeakMap pattern).
- `AND-0124`: Forced token refresh (`user.getIdToken(true)`) verifying newly minted `role: "authenticated"` claim before releasing Supabase queries.
- `AND-0125`: Authoritative role reconciliation calling `public.my_role()` after sign-in and syncing UI `SessionClaims` (`role`, `vendor`, `creator`) without ever trusting client-mutable flags for admin privilege.
- `AND-0126`: Bootstrap profile creator ensuring first-time OAuth/Email users have a valid `public.profiles` row before opening Feed or Onboarding.
- `AND-0127`: Guided `OnboardingScreen` multi-step stepper: Display Name -> Handle claim (`claim_username` live availability check) -> Avatar (ImgBB) -> Bio & Tech Stack Tags -> City via `/api/geo/reverse` -> Suggested Developers (`follow_suggestions`).
- `AND-0128`: Live handle validation enforcing lowercase ASCII rules + `next_username_change()` cooldown notice before calling `claim_username`.
- `AND-0129`: Guest / Anonymous Browse Mode allowing unauthenticated visitors to read public feeds, search, view profiles/courses/shop, and verify `vf-site` codes seamlessly.
- `AND-0130`: Smart Sign-In Action Prompt sheet triggered only when a guest taps a gated mutation (React, Comment, Follow, Bookmark, Message, Apply, Buy) — preserving destination intent to resume immediately post-login.
- `AND-0131`: Active ID-token rotation interceptor attached to Ktor HTTP engine automatically refreshing expiring tokens transparently on 401 JWT expiry.
- `AND-0132`: `SessionGuard` validating current UID before publishing any async profile/query response, preventing cross-account stale-data flash.
- `AND-0133`: Atomic Sign-Out Sequence: unregisters FCM token (`forget_fcm_token`), disconnects Supabase Realtime & RTDB presence (`offline`), cancels user Coroutine scopes, clears Room private tables (`messages`, `notifications`, `drafts`, `cart`, `orders`, `bookmarks`), clears Coil user-private headers, clears Firebase session.
- `AND-0134`: Biometric App Lock option (Settings toggle using `androidx.biometric:biometric` fingerprint/face unlock before opening Messenger/Orders/Wallet).
- `AND-0135`: Suspended / Deleted account detection surfacing clear explanation & support contact (`hello@bsdc.info.bd`) rather than silent infinite spinners.
- `AND-0136`: Active Device / Session Management inside Settings displaying registered `my_fcm_devices` rows and letting the member revoke stale devices via `forget_fcm_device`.
- `AND-0137`: Firebase RTDB online presence publisher (`presence/{uid}` with `onDisconnect().set("offline")` and `device = "android"`) cleanly marking away/offline on background/exit.
- `AND-0138`: Auth error taxonomy translator mapping `FirebaseAuthInvalidCredentialsException`, `FirebaseTooManyRequestsException`, network offline, and `/api/auth/claims` 5xx into actionable retry buttons.
- `AND-0139`: Multi-account quick safety wipe on Firebase `IdTokenListener` UID change.
- `AND-0140`: Zero token persistence in plain `SharedPreferences` — session secrets managed exclusively by Firebase SDK + Keystore-encrypted `DataStore`.
- `AND-0141`: Deep-link redirect restoration remembering target route across login/onboarding (`next` path safety check preventing open redirect).
- `AND-0142`: In-app account email/password update & re-authentication dialog inside Security Settings.
- `AND-0143`: Interactive Terms, Guidelines, and Privacy Policy acceptance summary during sign-up.
- `AND-0144`: Rate-limit UX feedback respecting login cooldowns without exposing whether specific emails exist on reset requests.
- `AND-0145`: Auth interceptor unit tests (`ClaimsBootstrapTest`) validating claims minting, single-flight coalescing, and 401 refresh recovery.
- `AND-0146`: Session isolation unit tests (`SessionWipeTest`) verifying Room private tables and ViewModel caches empty cleanly on sign-out/switch.
- `AND-0147`: Handle validation tests matching `main-site/src/lib/profile/username.test.ts`.
- `AND-0148`: Password strength tests matching `main-site/src/lib/auth/password-strength.ts`.

---

## Domain 6 — ImgBB-Only Media Pipeline, Compression & Lightbox (`AND-0149` – `AND-0174`)

- `AND-0149`: Zero Cloudinary references anywhere in dependencies, URL validators, upload clients, or Room schemas (`media_assets` accepts `provider = 'imgbb'` strictly).
- `AND-0150`: `ImageSignatureInspector.java` validating magic bytes (`FF D8 FF`, `89 50 4E 47`, `47 49 46 38`, `RIFF....WEBP`, `ftypavif`) before bytes leave device.
- `AND-0151`: `ImageResizeTranscoder.java` normalizing EXIF rotation (`ExifInterface`) so portrait photos from Samsung/Xiaomi/Pixel cameras never upload sideways.
- `AND-0152`: Purpose-aware smart downscaling & WebP/JPEG encoding (`avatar`: max `512px`, `cover`: max `1920px`, `post-image`/`comment-image`/`project-image`/`product-image`: max `1600px`) minimizing mobile data usage in Bangladesh while retaining crisp visual quality.
- `AND-0153`: Strict 10 MB `MAX_BYTES` client pre-check surfacing localized error message prior to network upload.
- `AND-0154`: Privacy-preserving EXIF GPS/camera-serial stripping during bitmap re-encoding before upload.
- `AND-0155`: Authenticated multipart upload transport posting `file` + `purpose` to `POST https://www.bsdc.info.bd/api/media/upload` with `Authorization: Bearer <firebase_id_token>`.
- `AND-0156`: Byte-level Ktor `onUpload` streaming progress callback powering smooth determinate upload rings on composer/chat thumbnails.
- `AND-0157`: Immediate Supabase `public.record_media_asset(...)` persistence writing `provider='imgbb'`, `kind='image'`, `url`, `thumbUrl`, `deleteToken`, `width`, `height`, `bytes`, `mimeType`.
- `AND-0158`: Built-in `ImageCropScreen` allowing interactive square/1:1 (avatar), 16:9 (cover/project), and free-aspect cropping + 90-degree rotation before upload.
- `AND-0159`: Android Photo Picker (`ActivityResultContracts.PickVisualMedia` & `PickMultipleVisualMedia(4)`) requiring ZERO broad `READ_EXTERNAL_STORAGE` / `READ_MEDIA_IMAGES` storage permissions (Play Store best practice).
- `AND-0160`: In-app CameraX photo capture pipeline saving temporary file via `FileProvider` directly into `ImageResizeTranscoder`.
- `AND-0161`: Resilient Coil 3 `ImgBbInterceptor` checking strict host allowlist (`i.ibb.co`, `ibb.co`, `i.ibb.co.com`, `*.ibb.co`, `www.bsdc.info.bd/media/i`).
- `AND-0162`: Progressive loading pipeline loading lightweight `thumbUrl` first and crossfading into full `url` once ready.
- `AND-0163`: Automatic edge-proxy fallback routing direct ImgBB timeouts/CDN errors seamlessly to `GET https://www.bsdc.info.bd/media/i?u=<encoded_url>`.
- `AND-0164`: Smart Coil disk cache (`150 MB` configurable cap) + in-memory cache (`20%` app heap) tuned against OOM crashes on low-RAM 3 GB devices.
- `AND-0165`: Full-screen `MediaLightboxScreen` featuring smooth double-tap 2.5x zoom, two-finger pinch zoom/pan, horizontal multi-photo pager, alt-text caption toggle, and vertical drag-to-dismiss gesture.
- `AND-0166`: Save-to-Gallery export via `MediaStore` (`Pictures/BSDC`) without requiring legacy storage permissions on Android 10+.
- `AND-0167`: Upload failure queue preserving local picked/cropped URI in Room so members can tap "Retry Upload" when signal returns without re-picking photos.
- `AND-0168`: Media asset garbage-collection helper calling `POST /api/media/purge` or marking draft discards cleanly when unsubmitted attachments are removed.
- `AND-0169`: Quota protection surfacing friendly warning before hitting Postgres 2,000 active asset limit per account (`my_media_assets`).
- `AND-0170`: Accessible Alt-Text prompt badge on every uploaded image slot inside Post & Project composers.
- `AND-0171`: Unit tests (`ImageSignatureInspectorTest`) covering valid PNG/JPEG/GIF/WebP/AVIF, spoofed `.jpg` text files, and oversized buffers.
- `AND-0172`: Unit tests (`ImgBbHostValidatorTest`) confirming Cloudinary URLs are unconditionally rejected and ImgBB + `/media/i` URLs pass.
- `AND-0173`: Unit tests (`MediaTranscoderTest`) verifying dimension caps, orientation math, and EXIF metadata strip.
- `AND-0174`: Unit tests (`MediaUploadRetryTest`) confirming idempotent retry and `record_media_asset` error propagation.

---

## Domain 7 — Offline Room Storage & Smart Auto-Download Feed Sync (`AND-0175` – `AND-0196`)

- `AND-0175`: Room SQLite database (`BsdcDatabase`) with encrypted preference flags, WAL mode enabled, and destructive-free schema version migration hooks.
- `AND-0176`: `CachedPostEntity` + `FeedRemoteKeyEntity` powering Paging 3 `RemoteMediator` so Home Feed renders instantly offline on cold launch.
- `AND-0177`: `CachedPostDetailEntity` caching Markdown article content, poll options, and top comments for offline reading.
- `AND-0178`: `CachedThreadEntity` & `CachedMessageEntity` maintaining the latest inbox list + 500 recent messages per active thread offline.
- `AND-0179`: `PendingOutboxMessageEntity` queueing offline chat sends, edits, and reactions with deterministic `client_id` UUID for `send_message_once`.
- `AND-0180`: `PendingDraftEntity` continuously auto-saving in-progress Posts, Articles, Questions, Polls, Snippets, and attached ImgBB URLs every 1.5 seconds of typing inactivity.
- `AND-0181`: `BookmarkEntity` persisting complete offline snapshots of bookmarked posts/articles/snippets.
- `AND-0182`: `VerificationHistoryEntity` logging verified `BSDC-CT/NT/ID` records and performance report receipts for instant offline re-inspection.
- `AND-0183`: `NewsBookmarkEntity` storing saved `news.bsdc.info.bd` articles for quick recall.
- `AND-0184`: `SavedSearchEntity` caching recent search queries locally while respecting account switch wipe.
- `AND-0185`: `FeedAutoSyncWorker` (`WorkManager`) periodically downloading top `feed_candidates` pages + post details + bookmarked threads automatically in background.
- `AND-0186`: Smart Image Prefetcher caching `thumbUrl` assets for auto-downloaded feed items into Coil disk cache within configured storage ceiling.
- `AND-0187`: Network-aware `WorkManager` constraint presets in Settings: *Wi-Fi & Unmetered Only (Default)*, *Wi-Fi + Cellular (Smart Lite)*, or *Manual Refresh Only*.
- `AND-0188`: Battery-aware sync throttling skipping background auto-download automatically when Android Battery Saver mode is active.
- `AND-0189`: `OutboxFlushWorker` constrained on `NetworkType.CONNECTED` draining offline chat messages & deferred bookmark/reaction retries automatically on reconnect.
- `AND-0190`: Storage inspector inside Settings showing exact Room DB + Coil cache megabytes used with one-tap "Clear Offline Cache" control (without touching unsent Drafts/Outbox).
- `AND-0191`: Live Connectivity Observer (`ConnectivityManager.NetworkCallback`) updating top subtle `"Offline · Showing cached feed"` banner seamlessly without jarring modal interruptions.
- `AND-0192`: Conflict-safe draft recovery dialog prompting to restore unsaved edits if app closed unexpectedly mid-compose.
- `AND-0193`: Automatic 30-day cache TTL pruning keeping SQLite compact during months of daily usage.
- `AND-0194`: Room DAO integration tests (`FeedDaoTest`, `OutboxDaoTest`, `VerifyHistoryDaoTest`) using in-memory SQLite.
- `AND-0195`: `OutboxFlushWorker` JUnit test verifying idempotent `client_id` deduplication across simulated reconnect retries.
- `AND-0196`: Cache eviction & account-switch wipe verification tests confirming zero leftover private records across UID changes.

---

## Domain 8 — Home Feed, Rich Post Detail, Custom Reactions & Comments (`AND-0197` – `AND-0236`)

- `AND-0197`: Multi-tab Home Feed (`For You`, `Following`, `Latest`, `Questions`, `Articles`, `Polls`, `Snippets`) mapped to `feed_candidates` RPC parameters and client ranking signals.
- `AND-0198`: Live new-posts detector polling/subscribing via `feed_new_count(p_since)` and popping an animated floating `"↑ N new posts"` emerald pill at the top of the feed.
- `AND-0199`: Pull-to-refresh gesture refreshing feed, clearing unseen badge, and persisting updated Room snapshot atomically.
- `AND-0200`: `PostCard` component featuring author avatar/online dot/verified badge, relative time, post kind badge (`Article`, `Question`, `Poll`, `Code`), excerpt/Markdown preview, ImgBB multi-photo collage (`1`–`4+` smart grid), code preview, tag chips, and engagement footer.
- `AND-0201`: Viewport visibility tracker firing `record_feed_impression(p_post_id)` once per visible session item (>50% visible for >600ms, throttled) accurately.
- `AND-0202`: Quick community horizontal strip at top of Home Feed surfacing upcoming Events, Featured Courses, and quick `Verify QR` shortcut card.
- `AND-0203`: Interactive Poll cards directly votable inline from Home Feed or Post Detail via `cast_poll_vote(p_post_id, p_option_id)` with smooth animated percentage bar fills and Bangla/English vote count.
- `AND-0204`: Custom animated 5-reaction selector matching Postgres `bsdc_reaction` enum (`like`, `insightful`, `celebrate`, `support`, `curious`) with spring-hover magnification, particle pop burst, and optimistic rollback on RPC failure.
- `AND-0205`: `post_interaction_state(p_post_ids)` batch hydrator syncing viewer's reaction, bookmark status, and vote choice accurately across scrolling cards.
- `AND-0206`: Optimistic double-click-safe reaction & bookmark toggles backed by migration `0045` idempotent Postgres functions.
- `AND-0207`: Bookmark toggle + "Save to Collection" bottom sheet allowing folder organization inside `/bookmarks`.
- `AND-0208`: Native Android `Intent.ACTION_SEND` share sheet paired with `record_share(p_post_id, 'android_share')` and "Copy Permalink (`https://www.bsdc.info.bd/p/{slug}`)".
- `AND-0209`: Inline Post overflow menu: Edit (owner), Move to Trash / Soft Delete (owner), Copy Link, Mute Author, Block User, Report Content (`reports` table).
- `AND-0210`: Post Detail screen (`PostDetailScreen`) firing `increment_post_view(p_post_id)` once on entry, displaying full hero cover, Markdown + math/code formatting, interactive TOC jumper for long Articles, author bio follow card, and full comment thread.
- `AND-0211`: Nested Threaded Comments list supporting infinite reply indentation collapse/expand, sort toggles (`Best / Accepted First`, `Newest`, `Oldest`), and author highlight badge.
- `AND-0212`: Question post Q&A mode displaying emerald `"✓ Accepted Answer"` badge and enabling question author to invoke `mark_answer(p_comment_id)` with celebratory micro-animation.
- `AND-0213`: Comment interaction (`toggle_comment_reaction`), inline reply sheet with `@mention` autocomplete popup, and ImgBB comment image attachment (`purpose = "comment-image"`).
- `AND-0214`: Inline comment edit & soft-delete actions for comment authors with immediate UI update.
- `AND-0215`: Live Realtime listener on open `PostDetailScreen` appending incoming comments and updating live reaction/vote totals without full refresh.
- `AND-0216`: Community-authored Ad slot renderer (`serve_ads`) clearly marked `"Sponsored · বিজ্ঞাপন"` with impression/click telemetry (`record_ad_event`) strictly respecting ad policies.
- `AND-0217`: Tag Archive Screen (`/tag/{slug}`) showing tag description, subscriber count, follow toggle, and filtered feed.
- `AND-0218`: Bookmarks Screen (`/bookmarks`) with collection filter tabs and offline availability badge.
- `AND-0219`: Trash Recovery Screen (`/trash`) displaying `my_deleted_content` 30-day soft-deleted items with one-tap Restore (`0050_thirty_day_recovery`).
- `AND-0220`: Follow toggle button on every author header & profile card updating follower state optimistically across Home Feed + Detail + Profile.
- `AND-0221`: Block & Unblock management with immediate feed/comment filtering of blocked UIDs.
- `AND-0222`: Structured Content Report dialog submitting reason category + detail notes to Postgres `reports` table.
- `AND-0223`: Related Posts / "Continue Reading" footer shelf at bottom of Post Detail.
- `AND-0224`: Smart scroll-position memory preserving exact vertical feed offset when opening and backing out of posts.
- `AND-0225`: Floating Quick-Scroll-to-Top button appearing subtly when scrolled deep into feed.
- `AND-0226`: Copyable snippet "Open in Playground" action button directly on code blocks inside posts.
- `AND-0227`: Feed loading state tests, error/retry tests, and Paging 3 RemoteMediator tests.
- `AND-0228`: Reaction burst state machine & optimistic rollback unit tests.
- `AND-0229`: Poll voting state & percentage math unit tests.
- `AND-0230`: Threaded comment tree flattening & collapse/expand unit tests.
- `AND-0231`: Impression debouncer tests guaranteeing single impression count per item per scroll session.
- `AND-0232`: `feed_new_count` floating pill display & clear unit tests.
- `AND-0233`: Bookmark & Trash recovery repository tests.
- `AND-0234`: Report & Block filtering unit tests.
- `AND-0235`: Markdown parser sanitization & XSS-safe URL linking tests.
- `AND-0236`: Accessibility & Bangla numeral rendering verification on `PostCard` + `PostDetailScreen`.

---

## Domain 9 — Multi-Type Rich Composer & Directory Creator Hub (`AND-0237` – `AND-0260`)

- `AND-0237`: Unified Create Launcher bottom sheet (`+` center navigation tab) offering crisp cards: `Post`, `Technical Article`, `Question`, `Poll`, `Code Snippet`, plus directory items (`Group`, `Event`, `Job`, `Freelance Gig`, `Open-Source Project`).
- `AND-0238`: `ComposePostScreen` supporting all 5 content formats with smooth animated mode switcher preserving common title/tags/body fields.
- `AND-0239`: Markdown Formatting Toolbar pinned above keyboard (`Bold`, `Italic`, `Code`, `Code Block`, `Heading`, `Quote`, `Link`, `Bullet List`, `@Mention`, `#Tag`, `Image`).
- `AND-0240`: Instant side-by-side / tab-switched `Live Markdown Preview` rendering exact final `PostDetailScreen` typography.
- `AND-0241`: Multi-image ImgBB upload tray (up to 4 images per post) with drag-to-reorder handles, individual upload progress rings, alt-text editor, crop trigger, and retry/remove actions.
- `AND-0242`: Poll builder sub-panel allowing 2–6 customizable options, duration selector (1d, 3d, 7d, 14d), and validation against duplicate/blank choices.
- `AND-0243`: Code Snippet composer panel featuring language dropdown (Kotlin, Java, TypeScript, Python, Rust, SQL, C++, Go, Bash), monospace editor, and optional output note.
- `AND-0244`: Tag chip selector with debounced autocomplete (`<= 5` tags), custom slug normalization, and trending tag quick-picks.
- `AND-0245`: `@Mention` popup list fetching matching members as user types `@handle` inside post or comment body.
- `AND-0246`: Target Group selector allowing members to publish straight into a joined Community Group (`/g/{slug}`) or public feed.
- `AND-0247`: Background auto-saving drafts to Room `PendingDraftEntity` + Drafts Drawer letting members juggle multiple unfinished articles offline.
- `AND-0248`: Edit Existing Post mode (`/compose/{postId}`) verifying ownership, loading original metadata, preserving permalink slug & poll votes during update.
- `AND-0249`: Atomic Publish guard disabling submit during pending ImgBB uploads or active RPC mutation, preventing accidental double posts.
- `AND-0250`: Directory Creator (`CreateDirectoryScreen`) supporting Group creation (`create_group` with cover ImgBB upload + privacy visibility toggle).
- `AND-0251`: Event Creator tab (`events` creation with date/time pickers, venue/online link toggle, capacity cap, city reverse-geocode fill, cover upload).
- `AND-0252`: Job Listing Creator tab (`jobs` creation with role type, stack tags, salary range BDT/USD, remote toggle, expiry date).
- `AND-0253`: Freelance Gig Creator tab (`gigs` creation with scope, budget range, timeline, portfolio link).
- `AND-0254`: Open-Source Project Creator & Editor (`/projects/{slug}/edit`) with GitHub URL validation, stack tags, license selector, ImgBB cover (`project-cover`), and multi-screenshot uploader (`project-image`).
- `AND-0255`: Unsaved-changes exit confirmation modal preventing accidental data loss on back navigation.
- `AND-0256`: Composer character counters & validation error summary anchored cleanly to offending fields.
- `AND-0257`: Draft persistence & restore unit tests.
- `AND-0258`: Poll option validation & post-edit permalink preservation unit tests.
- `AND-0259`: Multi-image queue & failure recovery unit tests.
- `AND-0260`: Directory creator form validation unit tests across all 5 entity schemas.

---

## Domain 10 — Real-Time Messenger, ImgBB Photo Chat & Offline Outbox (`AND-0261` – `AND-0294`)

- `AND-0261`: `MessengerInboxScreen` powered by `conversation_inbox(p_limit)` with live unread count badges (`unread_message_count`), online status dots (`RTDB`), muted/pinned indicators, and instant Room cache boot.
- `AND-0262`: Instant "New Message / New Group Chat" modal using member search + `open_direct_conversation(p_other_uid)` and `create_group_conversation`.
- `AND-0263`: Full `ConversationScreen` powered by paginated cursor history (`conversation_messages_page` + `conversation_messages`) with smooth scroll-to-bottom anchor & sticky unread divider.
- `AND-0264`: Live Supabase Realtime WebSocket channel (`messages`, `message_reactions`, `message_receipts`, `message_pins`, `conversation_members`) delivering messages in sub-second real time.
- `AND-0265`: Strict `ConversationChannel` auth guard refreshing Firebase JWT every 45 minutes and validating UID identity before every socket attach (zero cross-account channel leak).
- `AND-0266`: Live connection health pill (`Live` emerald pulse / `Reconnecting` amber / `Offline` slate) with automatic 15s fallback poll during unstable mobile networks.
- `AND-0267`: Real-time typing indicators (`"Karim is typing..."` / Bangla `"করিম লিখছেন..."`) via RTDB/Broadcast with 6s TTL auto-expiry.
- `AND-0268`: Idempotent message delivery via `send_message_once` using client-generated UUID `client_id` so network retries never create duplicate messages.
- `AND-0269`: Offline Outbox seamless queueing: outgoing messages while offline show translucent `"Queued"` clock icon, survive app restarts in Room, and flush automatically via `OutboxFlushWorker` on reconnect.
- `AND-0270`: Swipe-right gesture on any bubble to reply (`reply_to_id`) with subtle haptic detent and dismissible quoted header above composer.
- `AND-0271`: Message Edit & Delete actions (owner only within policy window) reflecting `"Edited"` label or tombstones cleanly in real time.
- `AND-0272`: Long-press bubble context sheet: React (`toggle_message_reaction`), Reply, Pin (`toggle_message_pin`), Star (`toggle_message_star`), Copy Text, Forward, Delete.
- `AND-0273`: Collapsible top Pinned Messages banner powered by `conversation_pins(p_conversation_id)` allowing instant jump to any pinned decision/link.
- `AND-0274`: In-thread keyword search (`search_messages`) highlighting matched occurrences and jumping directly to message index.
- `AND-0275`: Saved / Starred Messages screen (`saved_messages`) collecting every starred message across chats into one developer vault.
- `AND-0276`: ImgBB photo sharing directly in chat (`purpose = "comment-image"`) with live progress bubble and instant Lightbox tap preview.
- `AND-0277`: Formatted code-snippet bubble mode allowing developers to paste & share syntax-highlighted code inside chats with one-tap copy.
- `AND-0278`: Quick Markdown / Code / Emoji / Link formatting drawer directly inside Messenger composer (with zero audio voice-note storage, adhering strictly to ImgBB image-only hosting).
- `AND-0279`: Read receipts (`mark_conversation_read`, `mark_message_read`) showing single-check Sent vs double-check Read state (`conversation_state`).
- `AND-0280`: Group chat member drawer displaying roles, add/leave controls (`leave_conversation`), and notification mute toggle.
- `AND-0281`: Per-thread isolated draft auto-save (typing a draft in Chat A never leaks into Chat B, stored keyed by `conversationId`).
- `AND-0282`: Link preview detector identifying `www.bsdc.info.bd`, `vf.bsdc.info.bd`, and `news.bsdc.info.bd` links cleanly inside messages (routing natively on tap).
- `AND-0283`: External link safety check warning before launching arbitrary untrusted domains in Chrome Custom Tabs.
- `AND-0284`: Sound/vibration tactile chime suppression while viewer is already inside the active open conversation.
- `AND-0285`: Clean Realtime socket and scroll listener release on `ON_STOP` / conversation exit (zero background connection leaks).
- `AND-0286`: Unread inbox filter chip (`All` / `Unread` / `Groups`) on `MessengerInboxScreen`.
- `AND-0287`: Swipe-to-archive or mute thread gestures on Inbox rows.
- `AND-0288`: Direct message button shortcut from Member Profile (`open_direct_conversation`).
- `AND-0289`: Unit tests (`OutboxIdempotencyTest`) confirming duplicate-free retry and queue recovery.
- `AND-0290`: Unit tests (`ThreadDraftIsolationTest`) ensuring draft separation across rapid conversation switches (matching web `messenger-smoke` discipline).
- `AND-0291`: Unit tests (`RealtimeAuthGuardTest`) rejecting socket join on UID mismatch or expired token.
- `AND-0292`: Unit tests (`TypingTtlTest`) verifying 6s expiry & self-filtering of typing indicators.
- `AND-0293`: Unit tests (`MessengerComposerFormatTest`) validating code-fence formatting, `@mention` insertion, and attachment image-only enforcement.
- `AND-0294`: Unit tests (`MessagePinStarSearchTest`) validating search, pin, star, and cursor pagination merging.

---

## Domain 11 — FCM HTTP v1 Push Engine (`push.api.bsdc.info.bd`) & Notifications Inbox (`AND-0295` – `AND-0322`)

- `AND-0295`: `BsdcFirebaseMessagingService` extending `FirebaseMessagingService` handling `onNewToken` and high-priority `onMessageReceived`.
- `AND-0296`: Automatic token registration calling `public.register_fcm_token(p_token, 'android', deviceUserAgent, language)` whenever Firebase issues or rotates an FCM token.
- `AND-0297`: Dual Firestore token mirror (`devices/{uid}/tokens/{sha256}`) matching `main-site/src/lib/push/fcm.ts` schema (`platform`, `language`, `updatedAt`).
- `AND-0298`: Zero legacy VAPID / zero legacy FCM server key (`key=...`) usage anywhere in Android codebase — 100% FCM HTTP v1 powered by `push.api.bsdc.info.bd` + `FIREBASE_SERVICE_ACCOUNT_BSDC_BD`.
- `AND-0299`: Five distinct Android 8.0+ Notification Channels (`bsdc_messages` High Importance + Sound/Vibrate, `bsdc_social` Likes/Comments/Replies/Mentions, `bsdc_following` New Posts from Followed Authors, `bsdc_opportunities` Jobs/Events/Orders/Courses, `bsdc_verification` Notices/Certificates).
- `AND-0300`: Companion enhancement to `push-worker/src/fcm.ts` mapping notification `kind` cleanly to Android `android.notification.channel_id` while preserving fallback defaults.
- `AND-0301`: Locked-screen & killed-app push delivery handling BOTH system tray `OPEN_URL` intent clicks AND background data wakeup payloads seamlessly.
- `AND-0302`: Android `NotificationCompat.MessagingStyle` rich conversation grouping displaying sender name, preview snippet, and unread stacking per `conversationId`.
- `AND-0303`: Lock-screen / Notification-shade inline **Direct Reply** (`RemoteInput`) receiver dispatching `send_message_once` in background via `WorkManager` without even opening the app!
- `AND-0304`: One-tap **Mark as Read** notification action invoking `mark_notifications_read` / `mark_conversation_read` cleanly in background.
- `AND-0305`: Large-icon avatar & post thumbnail hydration via synchronous bounded Coil cache/network fetch inside `onMessageReceived`.
- `AND-0306`: Collapse key / tag deduplication using `words.tag` (`topic`) so repeated likes or batched activity collapse cleanly instead of spamming the user's shade.
- `AND-0307`: Support for all 19 BSDC notification categories (`follow`, `reaction`, `comment`, `reply`, `mention`, `bookmark`, `share`, `post_published`, `moderation`, `message`, `order`, `review`, `payout`, `course`, `job`, `event`, `certificate`, `mention_group`, `group_invite`).
- `AND-0308`: Bilingual `bn` / `en` push copy consistency synchronized automatically when user switches app language.
- `AND-0309`: In-app foreground toast/banner alert (`InAppPushBanner`) sliding cleanly from top when notification arrives while using another screen inside the app (and suppressed if already viewing that exact chat/post).
- `AND-0310`: Live badge updater refreshing bottom-nav `Inbox` & top-bar `Bell` unread counters immediately upon notification receipt.
- `AND-0311`: `NotificationsScreen` backed by `my_inbox(p_limit)` & `inbox_unread_count()` with instant local cache and pull-to-refresh.
- `AND-0312`: Filter tabs inside Notifications (`All`, `Unread`, `Mentions & Replies`, `Followers & Posts`, `Opportunities`).
- `AND-0313`: "Mark All Read" (`mark_inbox_read()`) & swipe-to-mark-single-read (`mark_notifications_read([id])`) actions.
- `AND-0314`: "Clear Older Read Notifications" action invoking `clear_inbox(p_keep_days)`.
- `AND-0315`: Per-kind mute toggle directly from any notification overflow menu invoking `mute_notification_kind(p_kind)`.
- `AND-0316`: Device Push Health Inspector inside Settings verifying live reachability of `https://push.api.bsdc.info.bd/health`, active FCM token hash, and permission status.
- `AND-0317`: Clean FCM token invalidation (`forget_fcm_token` + `FirebaseMessaging.deleteToken()`) on sign-out to prevent notifications to previous account on shared phones.
- `AND-0318`: Deep-link destination safety parser inside notification handler rejecting non-relative/non-BSDC URLs before building `PendingIntent`.
- `AND-0319`: `push-worker` Vitest regression test verifying `android.notification.channel_id` mapping across notification kinds.
- `AND-0320`: Kotlin JUnit tests (`PushPayloadRouterTest`) covering killed-app `intent.extras`, background data payload, and fallback paths.
- `AND-0321`: Kotlin JUnit tests (`InlineReplyWorkerTest`) verifying `RemoteInput` text extraction and `send_message_once` retry.
- `AND-0322`: Inbox repository tests covering mute, bulk read, clear older, and badge sync.

---

## Domain 12 — Merged Native Verification Hub (`vf.bsdc.info.bd`) & CameraX QR Scanner (`AND-0323` – `AND-0356`)

- `AND-0323`: Full native `VerificationHubScreen` merging `vf-site` (`vf.bsdc.info.bd` / `vf.main.bsdc.info.bd`) and `main-site` `/verify` cleanly with zero WebView.
- `AND-0324`: Instant CameraX `PreviewView` + ML Kit `BarcodeScanner` (`FORMAT_QR_CODE`) real-time analyzer running on background `ExecutorService`.
- `AND-0325`: Custom animated viewfinder HUD (`Canvas` corner reticle + smooth vertical laser scan beam + dimming vignette overlay).
- `AND-0326`: Smart QR Payload Extractor recognizing `https://vf.main.bsdc.info.bd/?code=...`, `https://vf.bsdc.info.bd/?code=...`, `https://www.bsdc.info.bd/verify/...`, `?report=<uuid>`, or raw `BSDC-*` strings instantly.
- `AND-0327`: Hardware Flashlight Torch toggle (`CameraControl.enableTorch`) and pinch-to-zoom (`CameraControl.setZoomRatio`) + tap-to-focus metering inside scanner.
- `AND-0328`: "Scan QR from Gallery Photo" button running ML Kit on any saved screenshot/certificate image picked via Photo Picker (`InputImage.fromFilePath`).
- `AND-0329`: Haptic pulse + subtle emerald lock chime + auto-pause scanner lock when a valid BSDC QR code is detected (preventing duplicate rapid RPC spam).
- `AND-0330`: `DocCodeChecksum.java` exact parity validator (`BSDC-(CT|NT|ID)-[0-9A-Z]{8}-[0-9]`, alternating 1/3 weighted check digit, automatic `O -> 4` & `I -> 8` human-typo correction).
- `AND-0331`: Instant local malformed/check-digit error card answering immediately before hitting Supabase (zero wasted network calls on mistyped codes).
- `AND-0332`: Live registry lookup calling `public.verify_code(p_code)` anonymously/publicly (works seamlessly without signing in!).
- `AND-0333`: Rich `VerificationResultCard` rendering all 6 states clearly (`valid` Emerald, `expired` Amber, `withdrawn` Amber, `revoked` Crimson, `unknown` Crimson, `malformed` Crimson) with exact `advice` guidance in `bn` & `en`.
- `AND-0334`: Document kind-aware metadata lines (`CT`: Certificate Recipient, Course/Program, Issued On, Issuer; `NT`: Official Notice Title, Published Date; `ID`: Staff Member Name, Role, Expires On).
- `AND-0335`: Live verification counter display showing how many times the document has been verified (`verifications` count).
- `AND-0336`: One-tap `"Share Verification Link"` copying or sharing `https://vf.main.bsdc.info.bd/?code=...` cleanly.
- `AND-0337`: Performance Report Receipt Verification tab/handler parsing `report=<uuid>` and calling `public.verify_performance_report(p_id)`.
- `AND-0338`: `PdfSha256Verifier.java` streaming Android Storage Access Framework PDF file bytes (`ACTION_OPEN_DOCUMENT` `application/pdf`) through `SHA-256` `MessageDigest` and comparing against registered `report.sha256` to prove tampering or authenticity (`MATCH` vs `ALTERED`).
- `AND-0339`: Public Official Notices Feed sub-tab backed by `public.notice_feed(p_limit)` rendering official BSDC community announcements natively.
- `AND-0340`: Notice Acknowledgment action (`acknowledge_notice(p_id)`) for signed-in members tracking important community policy updates.
- `AND-0341`: One-tap `"Verify This Notice"` action directly verifying a notice's `BSDC-NT-*` code inside the card.
- `AND-0342`: Formatted code auto-hyphenator & uppercase keyboard input helper (`BSDC - CT - ...`) making manual typing effortless.
- `AND-0343`: Persistent Verification History saved locally in Room `VerificationHistoryEntity` (last 50 checked codes/reports with status badges and quick re-check/delete).
- `AND-0344`: Offline Verification behavior: check-digit validation still works offline; cached history results display with cached timestamp badge when network is unavailable.
- `AND-0345`: External non-BSDC QR code safe handling: if a user scans an external URL/Wi-Fi/text QR, show a clear `"Not a BSDC Code"` preview box with raw text copy / external safe inspect (never auto-launch!).
- `AND-0346`: Zero enumeration discipline matching `vf-site` — verifies one code/receipt at a time, never exposes registry browse endpoints.
- `AND-0347`: Dual-tab quick switch between `"QR Camera Scan"`, `"Enter Code"`, `"PDF Report Check"`, and `"Official Notices"`.
- `AND-0348`: TalkBack screen-reader live announcement when verification result state resolves.
- `AND-0349`: JUnit tests (`DocCodeChecksumTest`) mirroring 100% of `corporate-kit/src/domain/trust.ts` & `staff.ts` edge cases (valid CT/NT/ID, O/I repair, en-dash repair, invalid check digit).
- `AND-0350`: JUnit tests (`PdfSha256VerifierTest`) verifying genuine byte digest match and 1-byte tamper detection.
- `AND-0351`: JUnit tests (`QrPayloadParserTest`) testing `vf.main.bsdc.info.bd`, `vf.bsdc.info.bd`, `www.bsdc.info.bd/verify`, `report=` UUID, and untrusted QR rejection.
- `AND-0352`: Repository unit tests (`VerifyRepositoryTest`) covering all 6 states, error mapping, and Room history persistence.
- `AND-0353`: Compose UI tests verifying result card contrast, accessibility labels, and keyboard formatting.
- `AND-0354`: CameraX permission denial -> rationale -> App Settings recovery UI tests.
- `AND-0355`: Notice feed & acknowledgment state tests.
- `AND-0356`: `vf-site` Digital Asset Links endpoint test ensuring `bd.info.bsdc.app` package & fingerprint formatting match `main-site`.

---

## Domain 13 — Global Search, Voice Search, Geo Location & Profiles (`AND-0357` – `AND-0386`)

- `AND-0357`: `SearchScreen` featuring auto-focused query bar, instant category chips (`All`, `Posts`, `People`, `Groups`, `Events`, `Jobs`, `Projects`, `Courses`, `Shop`), and zero-latency suggestion dropdown.
- `AND-0358`: Live debounced `search_suggestions(p_prefix, p_limit)` autocomplete pills as user types.
- `AND-0359`: Discovery view before typing showing `trending_searches(p_limit)` chips + local `SavedSearchEntity` recent history (with single-chip remove & clear-all).
- `AND-0360`: Full `global_search` RPC executor logging completed searches cleanly via `log_search(p_term, p_results)` for community trends.
- `AND-0361`: Native **Voice Search Engine** (`SpeechRecognizer.createSpeechRecognizer`) with custom animated Voice Input Bottom Sheet showing live RMS decibel equalizer bars, partial transcript streaming, `"Listening..."` prompt, and auto-submit on speech end.
- `AND-0362`: Bilingual Voice Search toggle (`bn-BD` Bangla speech recognition <-> `en-US` / `en-BD` English recognition) right inside the voice overlay.
- `AND-0363`: Graceful fallback to `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` if device lacks an embedded Google Speech service binding, plus honest "Voice search unavailable" message when offline without local speech pack.
- `AND-0364`: Persistent `RECORD_AUDIO` permission request trigger & Settings bridge when microphone access is missing.
- `AND-0365`: Rounded Location Geocoder integrating `FusedLocationProviderClient` + `POST https://www.bsdc.info.bd/api/geo/reverse` (coordinate rounded to 1 km) for Profile City, Onboarding, Local Events, and Marketplace Pickup filter.
- `AND-0366`: Public & Member `ProfileScreen` (`/@{username}`) showing ImgBB cover banner + hero avatar, online badge, bio, location, GitHub/Website/LinkedIn external safe links, skills tags, follower/following counts, and stats cards.
- `AND-0367`: Profile content tabs: `Posts`, `Comments`, `Projects`, `Courses & Certificates`, `Liked` (public/owner-scoped by RLS).
- `AND-0368`: One-tap Follow / Unfollow (`follows` table), Direct Message (`open_direct_conversation`), Share Profile URL, Block, and Report Member actions.
- `AND-0369`: Owner-only `EditProfileScreen` updating display name, bio, skills, links, city via GPS reverse-geocode, ImgBB Avatar (`512px`) & Cover (`1920px`) uploads, and handle rename (respecting `next_username_change`).
- `AND-0370`: Followers & Following modal bottom sheets with quick inline Follow buttons.
- `AND-0371`: Developer Suggestion Carousel (`follow_suggestions`) inside Discover & empty-Following states.
- `AND-0372`: Search result highlighting matching query terms cleanly across titles & snippets.
- `AND-0373`: Empty-search & typo recovery suggestions linking cleanly to Trending tags.
- `AND-0374`: `GroupsDirectoryScreen` (`/groups`) backed by `group_directory` with category/join-policy chips and live member counts.
- `AND-0375`: `GroupDetailScreen` (`/g/{slug}`) showing group header, pin announcements, join/request/leave buttons (`join_group`, `leave_group`), group post feed, and admin-free member roster.
- `AND-0376`: Group Moderator/Owner controls inside `GroupDetailScreen` approving/declining `decide_join_request` and promoting/demoting members (`set_group_role`).
- `AND-0377`: `EventsCalendarScreen` (`/events`) backed by `event_calendar` with Upcoming/Past/Nearby City filter chips.
- `AND-0378`: `EventDetailScreen` (`/events/{slug}`) backed by `event_detail`, interactive Going/Interested/Cancel RSVP (`rsvp_event`), venue map intent, and Add-to-Android-Calendar (`CalendarContract.Events`) integration!
- `AND-0379`: `toggle_page_follow` support on official community/chapter pages.
- `AND-0380`: Search debouncer & voice recognizer state tests (`VoiceSearchControllerTest`).
- `AND-0381`: Coordinate rounding unit tests matching `main-site/src/lib/geo/reverse.test.ts`.
- `AND-0382`: Profile coercion & handle normalization unit tests matching `main-site/src/lib/profile/coerce.test.ts`.
- `AND-0383`: Group membership role & join-request transition tests.
- `AND-0384`: Event RSVP optimistic & calendar export intent tests.
- `AND-0385`: Search history isolation on sign-out tests.
- `AND-0386`: Bilingual `bn-BD`/`en-US` SpeechRecognizer locale mapping tests.

---

## Domain 14 — Opportunities, Open-Source Projects & Code Playground (`AND-0387` – `AND-0408`)

- `AND-0387`: `JobsBoardScreen` (`/jobs`) backed by `job_board` with filters for Remote/Hybrid/Onsite, Full-time/Intern/Contract, and tech stack tags.
- `AND-0388`: `JobDetailScreen` (`/jobs/{slug}`) firing `increment_job_view`, showing salary, requirements, company badge, and saved state.
- `AND-0389`: Job Application bottom sheet (`apply_to_job`) with cover note, portfolio/CV URL validation, and `withdraw_application` support.
- `AND-0390`: Job Poster Applicant Manager inside `JobDetailScreen` allowing the job author to review applicants and execute `decide_application`.
- `AND-0391`: `FreelanceGigsScreen` (`/freelance`) & `GigDetailScreen` (`/freelance/{slug}`) displaying project scope, budget, and `submit_proposal` form.
- `AND-0392`: `ProjectsShowcaseScreen` (`/projects`) with Star Count sort, Language filters, Search, and one-tap optimistic star toggle (`toggle_project_star`).
- `AND-0393`: `ProjectDetailScreen` (`/projects/{slug}`) showcasing ImgBB cover & gallery carousel, live demo/GitHub Custom Tab links, tech badges, readme Markdown, and owner `"Edit Project"` shortcut (`/projects/{slug}/edit`).
- `AND-0394`: `ProjectEditScreen` verifying owner UID (`403` guard if non-owner opens deep link), editing metadata & screenshots.
- `AND-0395`: `CodePlaygroundScreen` (`/playground`) featuring tabbed multi-file editor with monospace font, auto-indent, bracket matching, and snippet templates (`Kotlin`, `JavaScript`, `HTML/CSS`, `JSON`, `SQL`).
- `AND-0396`: Isolated Web-worker/JS sandbox runner inside `PlaygroundScreen` executing safe client-side JS/HTML/CSS previews without any app origin/token exposure.
- `AND-0397`: One-tap `"Share as Snippet Post"` sending Playground code directly into `ComposePostScreen` pre-populated in Snippet mode.
- `AND-0398`: One-tap `"Share in Messenger"` sending formatted snippet straight to a selected developer chat.
- `AND-0399`: My Applications & My Proposals tracker screen showing real-time statuses (`submitted`, `shortlisted`, `accepted`, `withdrawn`).
- `AND-0400`: Job & Gig URL slug deep link parity (`https://www.bsdc.info.bd/jobs/{slug}`, `/freelance/{slug}`, `/projects/{slug}`).
- `AND-0401`: Project filter & sort unit tests matching `main-site/src/lib/opportunities/project-filters.test.ts`.
- `AND-0402`: Job application idempotency & withdraw tests matching `0045` Postgres behavior.
- `AND-0403`: Project star double-tap toggle tests.
- `AND-0404`: Playground sandbox CSP & origin isolation tests.
- `AND-0405`: Freelance proposal validation tests.
- `AND-0406`: Non-owner edit rejection guard tests for `ProjectEditScreen`.
- `AND-0407`: Salary/budget formatter tests in `bn` & `en`.
- `AND-0408`: Empty/Expired job listing visual state tests.

---

## Domain 15 — Learning Academy, Quizzes & Certificates (`AND-0409` – `AND-0426`)

- `AND-0409`: `LearnCatalogScreen` (`/learn`) backed by `course_catalog` with difficulty level pills, track categories, enrollment badges, and progress rings.
- `AND-0410`: `CourseDetailScreen` (`/learn/{slug}`) backed by `course_outline` showing syllabus modules, lesson durations, prerequisites, and `"Enroll Free"` (`enroll_in_course`).
- `AND-0411`: `LessonReaderScreen` displaying rich formatted lesson Markdown, embedded syntax-highlighted code blocks, next/previous lesson bottom bar, and `"Mark Complete"` (`complete_lesson`).
- `AND-0412`: Interactive Offline Lesson Caching allowing enrolled learners to save current course outline & Markdown text inside Room for study without internet.
- `AND-0413`: `QuizAttemptScreen` loading questions securely via `quiz_paper(p_quiz_id)` (never exposing answer keys to the client!).
- `AND-0414`: Timed quiz countdown header, question progress stepper, radio/checkbox answer state retention across screen rotation, and submit confirmation.
- `AND-0415`: Server-authoritative grading calling `grade_quiz_attempt` displaying exact pass/fail result, score breakdown, and retake cooldown if failed.
- `AND-0416`: Earned Certificate Card rendered cleanly upon course completion, showing the genuine `BSDC-CT-XXXXXXXX-D` code and embedded QR code generated natively via ZXing/QR matrix.
- `AND-0417`: One-tap `"Verify in Hub"` & `"Share Certificate URL"` deep-linking straight to native `VerificationHubScreen` or `https://vf.main.bsdc.info.bd/?code=...`.
- `AND-0418`: Course bookmark & resume-where-you-left-off banner at top of `LearnCatalogScreen`.
- `AND-0419`: Course progress & lesson completion state tests.
- `AND-0420`: Quiz answer payload & timer boundary unit tests.
- `AND-0421`: Zero-answer-key-leak verification test on `quiz_paper` parser.
- `AND-0422`: Certificate QR vector generation tests verifying round-trip decoding by `DocCodeChecksum`.
- `AND-0423`: Offline lesson persistence & sync reconciliation tests.
- `AND-0424`: Enrollment toggle & guest login prompt tests.
- `AND-0425`: Bilingual course metadata rendering tests.
- `AND-0426`: Certificate revoke state badge rendering test.

---

## Domain 16 — Marketplace, Cart, Orders, Vendor Storefront & Creator Ads (`AND-0427` – `AND-0456`)

- `AND-0427`: `ShopCatalogScreen` (`/shop`) backed by `product_catalog` with category chips, price sort, stock badges, and wishlist heart toggle (`toggle_wishlist`).
- `AND-0428`: `ProductDetailScreen` (`/shop/{slug}`) featuring ImgBB photo gallery, verified vendor pill, stock indicator, Markdown specs, quantity stepper, reviews list, and sticky `"Add to Cart"` bar (`add_to_cart`).
- `AND-0429`: `CartScreen` (`/cart`) backed by `my_cart()` with live quantity updates (`set_cart_quantity`), item removal, `clear_cart()`, and exact BDT integer subtotal calculation.
- `AND-0430`: `CheckoutScreen` (`/checkout`) capturing shipping contact/city (with optional GPS reverse-geocode auto-fill), order notes, payment method instructions, and atomic `place_order`.
- `AND-0431`: `OrdersScreen` (`/orders`) backed by `my_orders()` displaying status timeline (`pending`, `paid`, `shipped`, `delivered`, `cancelled`), order items, and buyer cancellation (`cancel_order`) where eligible.
- `AND-0432`: Verified Purchase Review modal (`submit_review`) supporting star ratings (1–5) and review text.
- `AND-0433`: Vendor Onboarding / Storefront application screen (`open_shop`) allowing eligible members to open a developer storefront.
- `AND-0434`: `VendorDashboardScreen` (`/vendor`) backed by `my_shop()` & `shop_balance()` showing store status, net balance, ledger entries (`shop_ledger_entries`), and sales summary.
- `AND-0435`: `VendorProductsScreen` (`/vendor/products`) backed by `shop_products()` allowing vendors to create products with ImgBB `product-image` uploads, toggle publish (`publish_product`), and adjust inventory (`restock_product`).
- `AND-0436`: `VendorOrdersScreen` (`/vendor/orders`) backed by `shop_orders()` allowing vendors to mark paid (`mark_order_paid`) and advance fulfillment stages (`advance_order`).
- `AND-0437`: `VendorPayoutsScreen` (`/vendor/payouts`) backed by `shop_payouts()` and `request_payout` with exact integer currency validation.
- `AND-0438`: `CreatorAdsScreen` (`/ads`) exposing non-admin self-service creator campaign tools (`ad_wallet_balance`, `ad_wallet_history`, `my_campaigns`).
- `AND-0439`: Wallet Top-Up request (`topup_ad_wallet`) & Campaign Wizard (`create_campaign`, `add_creative` with ImgBB `cover`, `submit_campaign`, `set_campaign_paused`).
- `AND-0440`: Campaign Analytics charts natively drawn via Compose `Canvas` (`campaign_performance`, `campaign_timeseries`, `campaign_creative_performance`).
- `AND-0441`: Real-time Cart Badge synchronized onto Shop & Drawer icons.
- `AND-0442`: Optimistic out-of-stock guard preventing `add_to_cart` above available stock.
- `AND-0443`: Account-switch clear wiping `my_cart` & `my_orders` local Room/memory caches cleanly.
- `AND-0444`: Integer BDT paisa/taka formatting tests (zero floating-point drift).
- `AND-0445`: Cart quantity, clear, and checkout validation unit tests.
- `AND-0446`: Order cancellation & status timeline mapping tests.
- `AND-0447`: Vendor inventory restock & publish toggle tests.
- `AND-0448`: Payout balance sufficiency check tests.
- `AND-0449`: Ad campaign pause/resume & analytics timeseries parsing tests.
- `AND-0450`: Ad creative ImgBB URL enforcement tests.
- `AND-0451`: Wishlist persistence & optimistic toggle tests.
- `AND-0452`: Review 1–5 star boundary validation tests.
- `AND-0453`: Empty Shop / Empty Cart / Empty Orders CTA tests.
- `AND-0454`: Guest checkout -> sign-in -> resume checkout preservation tests.
- `AND-0455`: Vendor route access guard verifying non-vendors see clean `open_shop` onboarding instead of raw errors.
- `AND-0456`: Shop product slug deep link verification test.

---

## Domain 17 — Settings, Diagnostics & Platform Info (`AND-0457` – `AND-0480`)

- `AND-0457`: `SettingsScreen` structured into clean Material 3 sections: Account & Handle, Appearance & Language, Permissions & Battery, Push & Devices, Offline Auto-Sync & Storage, Security & Biometrics, Support & Diagnostics.
- `AND-0458`: Live Language switcher (`বাংলা` / `English`) updating Compose tree and registering updated FCM locale cleanly.
- `AND-0459`: Theme selector (`System Default`, `Light Emerald`, `Dark Night Emerald`, plus Material You toggle).
- `AND-0460`: Notification Preference controls (channel settings deep-links + in-app muted notification kinds overview).
- `AND-0461`: Registered Push Devices list (`my_fcm_devices`) letting member revoke old phones/browsers (`forget_fcm_device`).
- `AND-0462`: Offline Feed Auto-Download rule picker (`Wi-Fi Only`, `Wi-Fi + Cellular`, `Off`), cache quota slider (`50 MB` – `500 MB`), and `"Sync Now"` button.
- `AND-0463`: Storage Breakdown widget reporting exact Room SQLite size, Coil Disk Cache size, and Temp Upload size with `"Clear Cache"` action.
- `AND-0464`: `PermissionsHealthSection` showing real-time status of Notifications, Location, Camera, Microphone, and OEM Battery optimization with single-tap Fix buttons.
- `AND-0465`: `SystemCheckScreen` (`/system-check`) running live client probes against Firebase Auth, Supabase REST, Supabase Realtime, Edge Upload proxy, `push.api.bsdc.info.bd/health`, and Digital Asset Links status, with `"Copy Diagnostics Report"` (zero secrets/tokens included!).
- `AND-0466`: `AboutScreen` (`/about`) presenting BSDC & RRC Development info, founder credit, PASVL-1.0 open-source license link, and repository link.
- `AND-0467`: `GuidelinesScreen` (`/guidelines`) displaying community code of conduct in readable offline-cached Bangla & English cards.
- `AND-0468`: `ContactScreen` (`/contact`) providing instant verified email (`hello@bsdc.info.bd`, `bsdc.rrc@gmail.com`) mailto intents and bug-report diagnostics helper.
- `AND-0469`: Sign-out confirmation button executing atomic session/cache wipe.
- `AND-0470`: Settings preference persistence tests across cold process restarts (`DataStore`).
- `AND-0471`: Diagnostics probe tests confirming zero tokens/API keys appear in exported system-check clipboard text.
- `AND-0472`: Storage cache eviction tests confirming unsent Drafts & Outbox remain intact after `"Clear Cache"`.
- `AND-0473`: Theme & font-scale visual regression checks.
- `AND-0474`: OEM battery exemption helper unit tests across API 26–35.
- `AND-0475`: Device revocation state sync tests.
- `AND-0476`: Offline guideline fallback content verification tests.
- `AND-0477`: Biometric prompt lock & fallback device PIN tests.
- `AND-0478`: App version & Play Store update notice placeholder readiness check.
- `AND-0479`: Data usage `"Low-Data Mode"` toggle disabling automatic full-res image prefetch while preserving thumbnails.
- `AND-0480`: Final end-to-end release readiness smoke checklist verifying every deep link, push channel, ImgBB upload, QR scan, voice search, and zero-admin isolation gate.

---

## Verified Summary Count

| Domain | Scope | Counted Capabilities (`AND-*`) | Target Phases |
| --- | --- | ---: | --- |
| 1 | Native Gradle Multi-Module Core, CI/CD & Signing | 28 | Phase 1 & 10 |
| 2 | Deep Linking, Security Routing & Smart News WebView | 30 | Phase 1 & 10 |
| 3 | Play-Store-Compliant Persistent Permission Engine | 22 | Phase 2 |
| 4 | BSDC Material 3 Design System, Motion & Bilingual Engine | 34 | Phase 1 |
| 5 | Firebase Auth, Claims Bootstrap & Session Security | 34 | Phase 2 |
| 6 | ImgBB-Only Media Pipeline, Compression & Lightbox | 26 | Phase 3 |
| 7 | Offline Room Storage & Smart Auto-Download Feed Sync | 22 | Phase 3 |
| 8 | Home Feed, Rich Post Detail, Custom Reactions & Comments | 40 | Phase 4 |
| 9 | Multi-Type Rich Composer & Directory Creator Hub | 24 | Phase 5 |
| 10 | Real-Time Messenger, Audio Notes & Offline Outbox | 34 | Phase 6 |
| 11 | FCM HTTP v1 Push Engine & Notifications Inbox | 28 | Phase 7 |
| 12 | Merged Native `vf-site` Hub & CameraX QR Scanner | 34 | Phase 8 |
| 13 | Global Search, Voice Search, Geo Location & Profiles | 30 | Phase 9 |
| 14 | Opportunities, Open-Source Projects & Code Playground | 22 | Phase 9 |
| 15 | Learning Academy, Quizzes & Certificates | 18 | Phase 9 |
| 16 | Marketplace, Cart, Orders, Vendor & Creator Ads | 30 | Phase 10 |
| 17 | Settings, Diagnostics & Platform Info | 24 | Phase 10 |
| **Total** | **Verified Non-Duplicated Native Capabilities** | **480** | **Phases 1 – 10** |
