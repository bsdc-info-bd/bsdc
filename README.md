# BSDC Android

Native Android client for **Bangladesh Software Development Community (BSDC)** — a platform of RRC Development. The app id is fixed to `bd.info.bsdc.app` and the client is written in Kotlin with Jetpack Compose plus a small Java safety boundary.

This repository deliberately starts with a secure, deployable social-community core rather than pretending that a list of “1000+ features” is implemented. The checked-in implementation is real code with no seeded users, posts, messages, or fake analytics. Additional products (commerce, ads, licenses, reports, admin portals, deep-learning retrieval) should be delivered as separately designed, access-controlled backend modules, not as unverified UI claims.

## Implemented mobile core

- Email/password account creation, sign-in, password reset, verification email, Google, GitHub, and configurable Yahoo OAuth flows.
- Firebase Auth session handling and a configuration-safe startup state.
- Public real-time Firestore feed, deterministic local ranking, freshness decay, negative-feedback penalty support, 7% stable exploration, and author diversity.
- Responsive native publishing studio: safe Rich-write/Markdown toggle, native Markdown preview, YAML-like frontmatter metadata, headings/quotes/lists/code tooling, validated Gist/CodePen/YouTube/X liquid-style external embeds, Cloudinary image/voice attachments, and no video upload or in-app video playback.
- Firestore-backed private drafts, trusted scheduled publishing, four-tag discovery limit, structured multi-part series, organization profiles/editor membership, and bounded co-author credit lines resolved against real BSDC handles. See [`docs/PUBLISHING_ARCHITECTURE.md`](docs/PUBLISHING_ARCHITECTURE.md).
- Firestore-backed reactions, comments, reports, post metadata, profiles, handles, follower/following records, notifications, device records, and engagement events.
- Realtime Database direct and group conversations, live message stream, unread counts, typing indicators with disconnect cleanup, soft message removal, read state, group creation by BSDC handle, and image/audio attachments only.
- FCM foreground notification service, Android 13 notification permission, device-token registration, and notification center. The APK currently has no website App Link dependency; future native-link ownership is documented separately.
- Firebase Functions for retry-safe engagement/follower counts and server-side comment, reaction, follow, and chat push notifications. No FCM server credential is embedded in the app.
- Light/dark/system theme persistence, English/Bangla post-language selection, material accessibility semantics, responsive Compose layouts, and no emoji-only controls.
- Firestore/Realtime Database rules, Firestore composite indexes, Android lint/tests, and GitHub Actions APK/AAB artifact and optional Play publishing workflows.

See [`docs/BUILD_ARCHITECTURE.md`](docs/BUILD_ARCHITECTURE.md) for the centralized Gradle version catalog, SDK/toolchain, Credential Manager, and environment decisions.

## Architecture

```text
app/                         Native Android client
  auth/                      Firebase Auth and provider flows
  data/                      Firestore profiles, posts, comments, follows
  messaging/                 Realtime Database message transport
  media/                     unsigned Cloudinary image/audio uploader
  notifications/             FCM handling and Firestore inbox
  feed/                      transparent ranking/diversity layer
firebase/                    Firestore / Realtime DB policies and indexes
functions/                   trusted notification and counter backend
.github/workflows/           cloud build, artifacts, optional Play publishing
```

The client uses Firestore for durable community data and Realtime Database for latency-sensitive chat. The official **Cloudinary Android SDK** dispatches uploads with an **unsigned upload preset**; the app never needs or stores a Cloudinary API secret. Firestore counters are owned by trusted Functions rather than writable by arbitrary clients. See [`docs/MESSENGER_ARCHITECTURE.md`](docs/MESSENGER_ARCHITECTURE.md) for the membership-protected direct/group messaging schema and [`docs/NATIVE_PRODUCT_BOUNDARY.md`](docs/NATIVE_PRODUCT_BOUNDARY.md) for the native-only backend, link, staff-access, and sensitive-permission decisions.

## Secure configuration — required before release

The app compiles without Firebase configuration so CI can validate the Android code safely. It intentionally displays an explicit configuration screen at runtime until configuration is injected.

1. Download the correct `google-services.json` for Android package `bd.info.bsdc.app` from Firebase. Put it in `app/google-services.json` only on your device, or save the whole JSON as GitHub secret `GOOGLE_SERVICES_JSON`. The real file is ignored by Git.
2. Set these protected GitHub Action secrets:
   - `GOOGLE_SERVICES_JSON`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_UPLOAD_PRESET`
   - Optional: `GOOGLE_WEB_CLIENT_ID` (the workflow otherwise reads the Firebase Web client from `GOOGLE_SERVICES_JSON`).
3. In Cloudinary create/lock an unsigned preset: restrict its folder, allow only image/audio formats, set size limits, disallow unsigned eager transformations, and review abuse controls. Do **not** place a Cloudinary API secret in Android, GitHub variables, Firebase, or this repository.
4. In Firebase Authentication enable Email/Password, Google, GitHub, and a correctly configured Yahoo OIDC provider (`yahoo.com`). Add the Android SHA-1/SHA-256 signing fingerprints and the authorized OAuth redirect domains. Follow the provider-by-provider production checklist in [`docs/FIREBASE_OAUTH_SETUP.md`](docs/FIREBASE_OAUTH_SETUP.md).
5. Deploy `firebase/firestore.rules`, `firebase/firestore.indexes.json`, `firebase/database.rules.json`, and `functions/` to the intended Firebase project from a protected CI identity. Functions are what send automatic push notifications; clients cannot securely send FCM to other users.
6. Do not publish or claim App Links for an unrelated website. Before enabling future Android links, choose an Android-owned domain and publish its reviewed `assetlinks.json` using the release signing certificate SHA-256.

### Secret incident response

Credentials were included in the original request. Client Firebase identifiers and an unsigned preset are expected to be visible in a mobile application, but a **Cloudinary API secret and a OneSignal REST API key are server secrets**. Rotate/revoke any such values that were shared, remove them from history/logs, and store replacement values only in protected CI/server secret stores. This repository intentionally contains neither secret and does not use a OneSignal REST key from the client.

## Cloud-only builds and releases

`BSDC Android APK and AAB` runs tests, lint, and a Firebase-configured APK build on GitHub Actions. It never uploads an APK when runtime Firebase/Cloudinary configuration is absent, so an artifact cannot silently be a configuration-only shell. See the exact GitHub secret names, Firebase checks, signing flow, and web-only build instructions in [`docs/GITHUB_ACTIONS_SECRETS.md`](docs/GITHUB_ACTIONS_SECRETS.md).

To produce a signed release, configure these repository secrets:

- `RELEASE_KEYSTORE_BASE64`
- `RELEASE_STORE_PASSWORD`
- `RELEASE_KEY_ALIAS`
- `RELEASE_KEY_PASSWORD`

The manual `Publish BSDC to Google Play` workflow only runs when those secrets and `PLAY_SERVICE_ACCOUNT_JSON` exist. It targets `bd.info.bsdc.app` and requires an already-created Play Console app. Nothing is uploaded to production automatically.

## Validation

The Android workflow executes:

```text
./gradlew test lint assembleDebug bundleRelease --stacktrace
```

The custom `gradlew` bootstraps the pinned Gradle 8.9 distribution for cloud CI without committing a binary wrapper JAR. The functions job type-checks `functions/src/index.ts` independently.

## Important production boundaries

- “End-to-end encrypted like WhatsApp” must not be claimed until a reviewed multi-device key-agreement and double-ratchet protocol, recovery model, key transparency, and independent security audit are implemented. The current Firebase chat transport is access-controlled but not E2EE.
- A genuine ANN/two-tower/transformer recommender needs protected data pipelines, consent, feature governance, evaluation, abuse review, and compute budget. `FeedRankingEngine` is explicitly a transparent, on-device re-ranker; it is not marketed as a neural backend.
- Firebase Functions, FCM, Cloudinary, Google Play, and large-scale social data have quotas, terms, and potentially billing requirements. “Unlimited fully free production social network” is not technically or commercially guaranteed by any codebase.
- Admin roles must use Firebase custom claims issued by a trusted backend. A hard-coded “admin passkey” is not a safe authorization mechanism and is intentionally not implemented.

## Brand

BSDC is Bangladesh Software Development Community, an open community for Bangladeshi and worldwide developers. Owner/CEO: Rizwan Rahim Chowdhury / RRC Development. Contact: `hello@bsdc.info.bd`.
