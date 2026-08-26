# BSDC — Deployment Runbook

Copyright (c) RRC Development. Proprietary — see [LICENSE](./LICENSE).

## 1. Cloudflare Pages (primary hosting)

| Setting | Value |
|---|---|
| Framework preset | None (Vite-compatible) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 18+ (set `NODE_VERSION=20`) |

**Environment variables** (Production + Preview):

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=bsdc-bd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=bsdc-bd
VITE_FIREBASE_STORAGE_BUCKET=bsdc-bd.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1041487418449
VITE_FIREBASE_APP_ID=…
VITE_FIREBASE_DATABASE_URL=https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app/
VITE_CLOUDINARY_CLOUD_NAME=dpemuwrpz
VITE_CLOUDINARY_API_KEY=916675189371449
VITE_CLOUDINARY_UPLOAD_PRESET=bsdc_unsigned
VITE_IMGBB_API_KEY=…
VITE_ONESIGNAL_APP_ID=5f367dc9-3fc3-4fd9-b452-e32fa438509b
VITE_APP_URL=https://www.bsdc.info.bd
VITE_APP_NAME=Bangladesh Software Development Community
VITE_SUPERADMIN_EMAIL=rahimchawdhury63@gmail.com
```

`public/_redirects` already contains `/* /index.html 200` for SPA routing.
`public/_headers` sets security headers + long-lived asset caching.

**Custom domain**: Pages project → Custom domains → `bsdc.info.bd` (and `www`). Cloudflare
proxies the domain; no Workers are used.

## 2. Firebase

1. **Auth providers** — enable Google / GitHub / Yahoo / Email-Password; add authorized
   domains: `localhost`, `bsdc.pages.dev`, `www.bsdc.info.bd`.
2. **Firestore rules & indexes**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
3. **Realtime Database** (`asia-southeast1`): deploy the hardened rules —
   presence/typing are owner-scoped, chats/messages are participant-scoped, and
   userChats entries are writable by chat participants:
   ```bash
   firebase deploy --only database
   ```
   Rules live in [`database.rules.json`](./database.rules.json).
4. **Storage rules**: `firebase deploy --only storage`.
5. **Cloud Functions (optional, recommended)**:
   ```bash
   cd functions && npm install && npm run deploy
   ```
   Provides: superadmin custom claims on first sign-in, hourly cleanup (24h stories,
   scheduled-post publishing, job/notice expiry) and a crawler-facing sitemap endpoint.
   Set `SUPERADMIN_EMAIL` in functions config.

## 3. Cloudinary & ImgBB

- Cloudinary: unsigned upload preset `bsdc_unsigned` (already configured for cloud
  `dpemuwrpz`). Avatars/covers/post images route here with ImgBB automatic fallback.
- ImgBB: used for casual media (chat attachments, stories, comments).

## 4. OneSignal

- Web push app `5f367dc9-3fc3-4fd9-b452-e32fa438509b`.
- `public/OneSignalSDKWorker.js` is required at the domain root (already in `public/`).
- Add the site in OneSignal with `https://www.bsdc.info.bd`, allow localhost for testing.

## 5. Launch sequence

1. Deploy to Cloudflare Pages (staging `bsdc.pages.dev`).
2. Sign in once with the founder account → superadmin role is provisioned.
3. Admin Panel → **Launch**: set the launch date (public countdown activates), review the
   pre-launch checklist, download the generated `sitemap.xml` / `rss.xml` and commit them to
   `public/` for static serving (or deploy the Functions sitemap).
4. Verify Search Console / Bing Webmaster with `bsdc.info.bd`, submit `/sitemap.xml`.
5. Flip `preLaunchMode` off on launch day (Admin → Settings) or let the countdown expire.

## 6. Android (Capacitor)

```bash
npm i @capacitor/core @capacitor/cli @capacitor/camera @capacitor/filesystem \
      @capacitor/push-notifications @capacitor/splash-screen @capacitor/status-bar
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug    # or assembleRelease / bundleRelease for AAB
```

`server.androidScheme: https` is already set in `capacitor.config.ts` so Firebase Auth
redirects work in the WebView.
