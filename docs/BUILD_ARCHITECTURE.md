# BSDC Android build architecture

## Version control of build dependencies

All Android plugins and application dependencies are centrally recorded in [`gradle/libs.versions.toml`](../gradle/libs.versions.toml). The root build uses catalog plugin aliases and the app module uses catalog library aliases.

This gives BSDC one review point for dependency versions and avoids silent version drift between future feature modules. A dependency must have a documented product purpose; the current graph deliberately uses one image loader (Coil), one Firebase SDK family, one Cloudinary client, and Credential Manager for Google identity selection.

## Current platform decision

- Package/application ID: `bd.info.bsdc.app`
- Minimum SDK: 26. This keeps supported Android versions within modern encryption, notification, media, and runtime-permission capabilities while avoiding an unsupported legacy matrix.
- Compile and target SDK: 35 in the currently validated build.
- Language/toolchain: Kotlin with Java 17 toolchain; Java remains only for the narrow safety-policy boundary already in the source tree.
- UI: Jetpack Compose + Material 3 with compact bottom navigation and adaptive navigation rail.

## Authentication

Google sign-in uses Android Credential Manager and Google ID credentials, exchanged with Firebase Authentication. The previous legacy `GoogleSignIn` activity-result integration is not used. GitHub and Yahoo continue to use Firebase's browser-based OAuth flow, which owns state/PKCE verification.

## Environments

The active product decision is shared BSDC Firebase data rather than a fictional second environment. CI can compile without a Firebase configuration and validates a real configured package only when protected secrets are supplied. Separate Firebase projects/flavors must not be claimed until their `google-services.json`, App Check, Cloudinary policy, and deployment service accounts are actually provisioned.

## Quality gates

The Android workflow runs unit tests, Android lint, and debug APK assembly. Functions are independently type-checked. Optional signed APK/AAB builds happen only when all protected signing secrets are configured. The workflow never logs signing passwords, keystore contents, Firebase service account data, or Cloudinary API secrets.
