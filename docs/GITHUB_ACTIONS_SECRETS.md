# BSDC GitHub Actions: secrets and real APK builds

This document is the exact configuration checklist for the `BSDC Android APK and AAB` workflow. Add values in **GitHub repository → Settings → Secrets and variables → Actions → New repository secret**. Use **Secrets**, not repository variables, for every value below.

Do not paste any secret into a commit, issue, pull request, APK source file, or public workflow log.

## 1. Required runtime secrets

All four are required together before the workflow uploads an APK. If none are set, the workflow still runs source tests and lint, but intentionally does **not** upload an unusable/configuration-only APK. If only some are set, the workflow fails early with a precise configuration error.

| Secret name | Exact value to paste | Why it is required |
|---|---|---|
| `GOOGLE_SERVICES_JSON` | The **complete raw JSON text** downloaded from Firebase Console for Android package `bd.info.bsdc.app`. Paste JSON directly; do not base64 encode it and do not wrap it in Markdown fences. | Activates the Firebase Android client: Auth, Firestore, Realtime Database, Messaging, and App Check configuration. |
| `GOOGLE_WEB_CLIENT_ID` | The Web OAuth client ID ending in `.apps.googleusercontent.com` from the Firebase/Google Cloud project. | Needed by the native Google sign-in flow to request an ID token. |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name. | Initializes the official Cloudinary Android SDK. |
| `CLOUDINARY_UPLOAD_PRESET` | The name of the BSDC **unsigned** upload preset. | Authorizes constrained client-side image/audio uploads without exposing an API secret. |

### Cloudinary preset requirements

Configure the unsigned preset in Cloudinary before building a production APK:

- Allow only image and audio formats; reject video.
- Set a BSDC-only folder policy and conservative upload size limits.
- Do not allow clients to override moderation, delivery type, or unrestricted transformations.
- Enable Cloudinary abuse protection/moderation appropriate to the account.
- Never add `CLOUDINARY_API_SECRET` or a Cloudinary API key as a mobile/GitHub Actions secret for this app. A mobile app cannot safely keep signing credentials.

## 2. Optional release-signing secrets

Set every value below, then select **Run workflow → Build signed release APK and AAB: true**. The workflow will generate:

- `app-release.apk` — signed installable production APK
- `app-release.aab` — signed Google Play bundle
- `BSDC-ARTIFACTS-SHA256.txt` — SHA-256 checksums for every generated artifact

| Secret name | Exact value to paste |
|---|---|
| `RELEASE_KEYSTORE_BASE64` | Base64 text of the release `.jks`/`.keystore` file, with no surrounding Markdown. |
| `RELEASE_STORE_PASSWORD` | Password for that keystore. |
| `RELEASE_KEY_ALIAS` | Alias of the release key inside the keystore. |
| `RELEASE_KEY_PASSWORD` | Password for that key alias. |

Keep the original keystore offline and backed up securely. Losing the signing key prevents normal updates to the existing Google Play package.

## 3. Optional Google Play publishing secret

The manual **Publish BSDC to Google Play** workflow requires all four signing secrets above plus:

| Secret name | Exact value to paste |
|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | Complete raw JSON for the Google Cloud service account that has been invited in Play Console with release permission. |

The Play Console application must already exist under package `bd.info.bsdc.app`. Use the `internal` track first. Production publication is never automatic.

## 4. Optional Firebase deployment secret

The manual **Deploy Firebase policy and backend** workflow requires:

| Secret name | Exact value to paste |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` | Complete raw JSON for a restricted Google Cloud/Firebase deployment service account. |

Grant only the IAM roles required to deploy Firestore rules/indexes, Realtime Database rules, and Functions. Protect this secret especially carefully.

## 5. Values that must never be added

Do **not** create GitHub secrets or source constants for:

- Cloudinary API secret
- OneSignal REST API key
- Firebase Admin private key outside the restricted deployment-service-account secret
- An “admin passkey” used by the mobile client

Automatic mobile push is sent from trusted Firebase Functions through FCM. It does not need a OneSignal REST key in the Android application.

## 6. Build steps in GitHub’s web UI

1. Push or merge the Android workflow to the target branch.
2. Add the four runtime secrets above.
3. Open **Actions → BSDC Android APK and AAB → Run workflow**.
4. Choose the BSDC branch and leave **Build signed release APK and AAB** off for a test/debug APK, or turn it on only after all signing secrets are configured.
5. When the run succeeds, open the run’s **Artifacts** section and download `bsdc-android-<run number>`.
6. Verify the downloaded APK/AAB checksum against `BSDC-ARTIFACTS-SHA256.txt` before installation or Play upload.

The debug APK is Firebase-configured and uses the real package ID, but Google Sign-In will only work after the matching debug signing SHA-1/SHA-256 fingerprints are registered in Firebase. The signed release APK/AAB uses the release key; register its SHA-1/SHA-256 fingerprints before testing OAuth, App Links, or Play delivery.

## 7. Firebase console requirements before real-user testing

- Enable Email/Password, Google, GitHub, and correctly configured Yahoo OIDC (`yahoo.com`) providers in Firebase Authentication.
- Add the release certificate SHA-1 and SHA-256 to the Firebase Android app.
- Deploy the Firebase rules, indexes, and Functions from this repository before allowing user traffic.
- Configure App Check / Play Integrity for the release app.
- Configure FCM and Android notification permission flow.
- Serve a valid `https://www.bsdc.info.bd/.well-known/assetlinks.json` containing the release certificate SHA-256 for verified Android App Links.

The project treats missing backend configuration as an error rather than generating demo content or pretending an unconfigured APK is production-ready.
