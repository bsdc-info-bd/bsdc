# BSDC for Android

A Capacitor shell around `www.bsdc.info.bd`. It exists for three things the
web cannot do well on Android — a launcher icon, delivered push
notifications, and verified app links — and for nothing else. There is no
second implementation of the product in here; every screen the user sees is
the same web application that is served to every other visitor, which is
why there is no second set of bugs to fix.

## What is in this package

| Path                  | What it is                                                                   |
| --------------------- | ---------------------------------------------------------------------------- |
| `capacitor.config.ts` | App id, name, native chrome and plugin configuration.                        |
| `src/links.ts`        | Every routing decision the shell makes, as pure functions with tests.        |
| `src/shell.ts`        | The only file that touches a native plugin; it delegates decisions to above. |
| `.env.example`        | The variables a release build needs. None of them are committed.             |

The native project itself (`android/`) is **generated**, not committed. It
is produced by `npx cap add android` from this configuration, so the
checked-in state is the configuration rather than a hundred Gradle files
nobody reads and everybody merges badly.

## The rule the shell enforces

A link opens inside the app only if it belongs to BSDC — `www.bsdc.info.bd`,
`bsdc.info.bd`, or `vf.main.bsdc.info.bd`. Everything else opens in the
system browser, where the address bar is visible. A shell that renders an
arbitrary origin inside its own chrome, with its own icon in the task
switcher, is a phishing toolkit; `src/links.test.ts` holds that line with
cases for look-alike hosts such as `bsdc.info.bd.attacker.test`.

The same file decides where a notification tap lands. A payload that
carries no destination is reported as having none rather than quietly
opening the home page, because a notification that wastes a tap teaches
people to turn notifications off.

## Building a release

**In CI, which is the normal way.** `.github/workflows/android.yml` builds a
debug APK on every change and a signed APK and AAB on an `android-v*` tag,
attaching both to a GitHub release and printing the signing certificate's
SHA-256 fingerprint into the run summary. The native project is generated
there and configured by `scripts/configure-android.mjs`, whose decisions —
intent filters, version, signing, Firebase file — are pure functions in
`src/android-config.ts` with tests beside them. See `docs/deploying.md`.

**By hand.** The commands below need the Android SDK and a JDK.

```bash
# 1. Build the web application the shell wraps.
cd ../main-site && npm ci && npm run build && cd ../android-app

# 2. Install, generate the native project and copy the build into it.
npm ci
npx cap add android      # first time only
npm run sync
node scripts/configure-android.mjs   # app links, version, signing, Firebase

# 3. Open it in Android Studio, or build from the command line.
npm run open
cd android && ./gradlew bundleRelease
```

Signing credentials come from the environment described in `.env.example`
and are injected by CI from repository secrets. They are never written to
a file in the repository, and `android/` is ignored by Git precisely so a
`keystore.properties` cannot be committed by accident.

## App links

Android only treats `https://www.bsdc.info.bd/...` as belonging to this app
once it has verified `/.well-known/assetlinks.json` on that origin. That
file is served by `main-site/functions/.well-known/assetlinks.json.ts` from
the `ANDROID_CERT_FINGERPRINT` environment variable on the Pages project.
Until a release key exists the endpoint serves an empty statement list,
which is the honest answer: the site vouches for no app yet. After signing,
set the variable to the SHA-256 fingerprint of the release certificate:

```bash
keytool -list -v -keystore release.keystore -alias bsdc | grep 'SHA256:'
```

## Push notifications

Messaging uses the same Firebase project as the web application
(`bsdc-bd`). `google-services.json` is **not** committed; it is written by
CI into `android/app/` from a secret before the Gradle build, and a local
developer places their own copy there. The token returned at startup is
handed to the host application through `ShellHost.onToken`, which stores it
against the signed-in member in Firebase Realtime Database alongside the
web push subscriptions — the shell itself never talks to Supabase, holds no
key, and knows nothing about who is signed in.
