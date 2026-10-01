# BSDC Firebase production setup

This is an operator runbook for the native package **`bd.info.bsdc.app`**. Complete it in a controlled owner/operations environment. Do not paste service-account JSON, keystores, Cloudinary secrets, OAuth client secrets, or Play credentials into source code, chat, issues, or Firebase Remote Config.

> This repository can compile without production configuration. A working production backend additionally requires a Firebase project, enabled products, protected CI secrets, and a controlled custom-claim process.

## 1. Create and secure the project

1. In the Firebase Console, create or select the intended production Google Cloud project. The current deployment workflow targets `bsdc-bd`; change the protected workflow/project configuration only after an intentional migration plan.
2. Add an Android app with exact package name `bd.info.bsdc.app`.
3. Register the SHA-1 and SHA-256 fingerprints for every signing key that will authenticate Google Sign-In, Play Integrity, and production releases. Include the upload/release key and any CI test signing key used with Firebase.
4. Download `google-services.json`. Verify it contains the exact Android package and the intended project ID. It is a client configuration file, but it still belongs only in local secure storage or GitHub Actions secrets—not Git.
5. Restrict Google Cloud IAM to named operators and enable audit logging. Require MFA for project owners and service-account administrators.

## 2. Enable Firebase products deliberately

| Product | Required setup |
| --- | --- |
| Authentication | Enable Email/Password, Google, GitHub, and Yahoo OIDC only after each provider redirect/client configuration is complete. Configure authorized domains and Android SHA fingerprints. |
| Cloud Firestore | Create a **Native mode** database in the deliberate production location. Location is effectively permanent. |
| Realtime Database | Create the database in the intended region. BSDC uses it only for low-latency chat/typing/conversation state. |
| Cloud Functions (2nd gen) | Enable billing/required Google APIs. BSDC Functions deploy to `asia-southeast1`; use a production project/region review before first deploy. |
| Cloud Messaging | Enable FCM. Android needs the downloaded Firebase configuration and Android 13 notification permission at runtime. |
| App Check | Register the Android app with Play Integrity. Test first, then enforce for Auth, Firestore, Realtime Database, Functions, and any product supported by your risk review. |
| Analytics | Optional. The native app keeps collection disabled unless a member explicitly enables it. |

The project must generally be on a billing-enabled plan for Cloud Functions and related Google Cloud services. Quotas, retention, and regional transfer requirements need an operational review; code cannot make a large social network permanently free.

## 3. Configure local development safely

Create `local.properties` from `local.properties.example` outside Git tracking. Keep the actual `app/google-services.json` out of Git.

```properties
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_UPLOAD_PRESET=your_locked_unsigned_preset
GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Put the Firebase Android JSON at `app/google-services.json` only on the developer machine. Run the normal checks with `./gradlew test lint assembleDebug` after Android SDK/Gradle access is available.

## 4. Configure GitHub Actions secrets

In **GitHub repository → Settings → Secrets and variables → Actions**, add these exact repository secrets:

| Secret | Purpose |
| --- | --- |
| `GOOGLE_SERVICES_JSON` | Raw, unencoded `google-services.json` for `bd.info.bsdc.app`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name. |
| `CLOUDINARY_UPLOAD_PRESET` | Locked unsigned preset name; never an API secret. |
| `GOOGLE_WEB_CLIENT_ID` | Optional override; otherwise CI reads the Web OAuth client from Firebase JSON. |
| `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` | Service-account JSON for protected Firebase deployment only. |
| `RELEASE_KEYSTORE_BASE64`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` | Required only for signed release builds. |
| `PLAY_SERVICE_ACCOUNT_JSON` | Required only for the manual Play publish workflow. |

The deployment service account should use least privilege. It needs only the roles required to deploy Firestore Rules/indexes, Realtime Database Rules, and Functions for the intended project. Keep it separate from owner accounts, rotate it, and remove it immediately on suspected compromise.

## 5. Deploy policy and Functions

After committing reviewed code to the Arena branch, run **Deploy Firebase policy and backend** manually from GitHub Actions with the protected service-account secret configured. It builds Functions and deploys:

```text
firestore:rules
firestore:indexes
database
functions
```

Deploy Rules, indexes, and Functions together. The current app depends on Functions to issue `legalAcceptanceVersion` after document acceptance and to perform trusted moderation/lifecycle request operations. Do not deploy only the Android APK and expect those controls to work.

After deployment, use a non-owner test account to verify:

1. The legal consent gate creates current immutable records and then receives the `legalAcceptanceVersion` claim. `refreshCurrentLegalAccess` repairs users who accepted before Functions was deployed.
2. A normal member can report a post but cannot read reports or alter moderation state.
3. A no-role account sees no staff data and callable moderation fails.
4. A deliberately provisioned moderator can review reports; an admin can use only the administrative operations permitted by your secure workflow.
5. A lifecycle request requires a sign-out/sign-in within ten minutes and cannot be written directly with the client SDK.

## 6. Issue staff roles through controlled backend tooling

There is deliberately no owner email bypass in Android. Use a controlled Admin SDK environment to look up a verified operator UID and set the role claim. Preserve existing claims, especially `legalAcceptanceVersion`:

```js
// Run only in a controlled administrative environment with Firebase Admin credentials.
const user = await admin.auth().getUserByEmail("verified-operator@example.com");
await admin.auth().setCustomUserClaims(user.uid, {
  ...(user.customClaims || {}),
  role: "moderator" // or "admin"
});
```

Record the authorization decision outside the app, require the operator to sign out/in or refresh their token, and remove the claim when access ends. Do not assign `admin` because an email string appears in a mobile client or repository.

## 7. Configure Cloudinary and media controls

1. Create an unsigned mobile upload preset restricted to the BSDC folder policy, image/audio formats, bytes, transformations, and abuse controls.
2. Never put `CLOUDINARY_API_SECRET` or a Cloudinary API key with privileged destruction/administration capability in the Android app.
3. Keep any server-side media lifecycle credential in an audited secret manager and add it only when the account-erasure design can delete or retain Cloudinary objects lawfully.
4. Test that video MIME types and voice notes longer than 20 seconds are rejected by both the app and preset policy.

## 8. Release and App Check rollout

1. First distribute a signed build on an internal Play track.
2. Confirm Firebase Auth, FCM, provider redirect flows, and Play Integrity App Check telemetry work with that signing certificate.
3. Enable App Check enforcement product by product only after monitoring valid traffic and establishing support/recovery procedures.
4. Build the signed AAB through the manual GitHub workflow after release secrets are configured. Publishing is never automatic.

## Incident response

Rotate any credential that has appeared in a chat, commit, build log, issue, screenshot, or untrusted device. Treat the Cloudinary API secret, service-account JSON, OAuth client secrets, signing keys, and Play service-account JSON as high-impact credentials. Firebase Android identifiers and unsigned upload-preset names are not equivalent to server secrets, but their project/preset restrictions still need review.
