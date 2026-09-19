# BSDC — Cloudflare Pages environment

> How to load the values from `.env.example` into Cloudflare Pages so the production
> build talks to Firebase, media hosts and the OneSignal manual desk.
> Source-available. Re-deployment or rebranding is not permitted.

## 1. Where each class of variable goes

| Class | Prefix / name | Cloudflare location | Bundled in browser? |
| --- | --- | --- | --- |
| App + Firebase web + media public + OneSignal app id | `VITE_*` | Pages → Settings → Environment variables → **Build** and **Runtime** (Production + Preview) | Yes |
| Build switch | `BSDC_REQUIRE_REMOTE_ENV=true` | Pages build environment (Production) | No (script only) |
| Cloudinary API secret | `CLOUDINARY_API_SECRET` | **Encrypted** Pages secret **or** Firebase Functions secret — never `VITE_` | No |
| OneSignal REST key | `ONESIGNAL_REST_API_KEY` | Firebase Functions secret only (sends the manual broadcast) — never `VITE_` | No |
| Passkey peppers / service account | `ADMIN_*`, `FIREBASE_*` | Firebase Functions secret / Secret Manager | No |

## 2. Import steps (Pages)

1. Open the `bsdc` project on Cloudflare Pages.
2. **Settings → Environment variables**.
3. Open `.env.example` (or your private `.env`) and add every `VITE_*` row to **Production** and **Preview**.
4. Add `BSDC_REQUIRE_REMOTE_ENV=true` to **Production** only (so a missing Firebase public config fails the release).
5. Do **not** paste `CLOUDINARY_API_SECRET` or `ONESIGNAL_REST_API_KEY` as `VITE_*`. If Pages must hold them for a build script, mark them **Encrypted** and keep the bare names.
6. Trigger a production deployment. Confirm the build log shows `verify:env` exit 0 and that `public/messaging-config.js` was rewritten with the `bsdc-bd` project id.

## 3. Push policy (do not mix these up)

| Channel | Used for | Automatic? |
| --- | --- | --- |
| Firebase Cloud Messaging + PWA SW + Capacitor native | Member notifications, chat, system, moderation | Yes |
| OneSignal (`VITE_ONESIGNAL_APP_ID` + server REST key) | Admin broadcast desk only | **Never** — human composes and confirms |

The product has no scheduler, trigger or re-engagement job that calls OneSignal.

## 4. Media policy

| Host | Env | What goes there |
| --- | --- | --- |
| Cloudinary | `VITE_CLOUDINARY_*` + server `CLOUDINARY_API_SECRET` | Avatars, covers, products, ads, durable assets (unsigned preset from the browser) |
| ImgBB | `VITE_IMGBB_API_KEY` | Feed, chat, stories — `POST /1/upload?key=…` with base64 `image` body |
| Neither | — | **Video** — no upload path exists |

## 5. Still required from you (not in the paste)

| Variable | Where to get it |
| --- | --- |
| `VITE_FIREBASE_VAPID_KEY` | Firebase Console → Project settings → Cloud Messaging → Web Push certificates → Key pair |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional; Analytics property `G-…` |
| `ADMIN_PASSKEY_PEPPER` + passkey hashes | Generated once, stored only in Functions secrets |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account for Admin SDK / Functions |

## 6. Static workers on Pages (not Cloudflare Workers)

| File | Role |
| --- | --- |
| `public/sw.js` | PWA shell |
| `public/firebase-messaging-sw.js` | FCM automatic push |
| `public/messaging-config.js` | Generated at build from `VITE_FIREBASE_*` |
| `public/OneSignalSDKWorker.js` | OneSignal manual desk SW entry |

No Cloudflare Worker is introduced for sitemap, RSS, SEO or push (ADR-036).
