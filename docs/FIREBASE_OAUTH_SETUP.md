# Firebase OAuth configuration for BSDC Android

The BSDC Android client uses real Firebase Authentication identities. Provider client secrets remain in the Firebase Authentication console; they are never compiled into the APK, placed in `local.properties`, or added to GitHub Actions.

The Android application package is exactly:

```text
bd.info.bsdc.app
```

## Google

1. Firebase Console → **Authentication → Sign-in method → Google** → enable the provider.
2. Firebase Console → **Project settings → Your apps → BSDC Android app** → register SHA-1 and SHA-256 for every signing key used to test or release the app.
   - The GitHub Actions debug artifact uses a debug signing key.
   - The production AAB/APK uses the configured release signing key.
3. Verify that the Web OAuth client ID in the Firebase configuration is available. The Android workflow reads the `client_type: 3` client ID from `GOOGLE_SERVICES_JSON` and supplies it to Android Credential Manager's Google ID flow.
4. Do not use an Android client ID where a Web client ID is required. A mismatch causes Credential Manager/Firebase token rejection; register the app signing SHA-1 and SHA-256 before testing.

## GitHub

1. Create or select a GitHub OAuth App owned by the BSDC organization.
2. Set an HTTPS homepage URL controlled by BSDC.
3. In the OAuth App, set the callback URL to the Firebase handler shown in Firebase Authentication. For the BSDC Firebase project this is normally:

```text
https://bsdc-bd.firebaseapp.com/__/auth/handler
```

4. Firebase Console → **Authentication → Sign-in method → GitHub** → enable it and enter the GitHub OAuth App client ID and client secret there.
5. Do not copy the GitHub client secret into this repository or the Android app.
6. The app requests `read:user` and `user:email`, then Firebase exchanges the provider result and creates/signs in the BSDC account.

## Yahoo OpenID Connect / OAuth

1. Create a Yahoo developer application with OpenID Connect/OAuth enabled.
2. Add the Firebase redirect handler shown in the Firebase provider setup as the Yahoo callback. For BSDC this is normally:

```text
https://bsdc-bd.firebaseapp.com/__/auth/handler
```

3. Firebase Console → **Authentication → Sign-in method → OpenID Connect** (or the configured generic OAuth provider) → enable/configure provider ID exactly:

```text
yahoo.com
```

4. Enter Yahoo’s client ID and client secret only in Firebase Authentication. Use Yahoo’s current discovery/endpoints from its developer console, not values embedded in the app.
5. Keep the `openid`, `profile`, and `email` permissions approved in the Yahoo application. The BSDC Android client explicitly requests those scopes.

## Firebase authorized domains and verification

- Keep `bsdc-bd.firebaseapp.com` authorized for OAuth redirects.
- Add BSDC production domains in Firebase Authentication authorized domains when required by the provider setup.
- Configure the published release SHA-1/SHA-256 before releasing to real users.
- Test each provider with a genuine provider account and confirm an actual document is created under `profiles/{uid}` and a unique document under `handles/{username}`.

## Android runtime behavior

- **Google** uses Google Play services to obtain an ID token and exchanges it with `GoogleAuthProvider`.
- **GitHub** and **Yahoo** use `OAuthProvider` browser flows handled by Firebase. Firebase restores a pending result after app/process recreation, preserving the actual provider redirect state.
- After a successful provider exchange, BSDC creates a real Firestore profile and atomically reserves its starter handle. It never inserts sample users, demo sessions, or mock account data.
