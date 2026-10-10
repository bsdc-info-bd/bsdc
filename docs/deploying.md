# Deploying BSDC

This is the whole operational story of the platform: what each workflow does,
every value it needs, where that value comes from, what it has to look like,
how to put it in place, and what to do when a run goes red.

It is written for somebody who has never deployed this repository before and
has nothing but an empty Supabase project, an empty Cloudflare account and
push access to this repository.

**Contents**

1. [The four workflows](#1-the-four-workflows)
2. [The database](#2-the-database)
3. [The websites](#3-the-websites)
4. [The Android app](#4-the-android-app)
5. [Every variable, explained](#5-every-variable-explained)
6. [How to add a secret or a variable](#6-how-to-add-a-secret-or-a-variable)
7. [First deployment, in order](#7-first-deployment-in-order)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. The four workflows

Four workflows, each doing one job, in `.github/workflows/`:

| Workflow       | What it does                                                                                                         | When it runs                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `ci.yml`       | Typecheck, lint, format, test, build and the 250 KB budget, per package                                              | Every push and pull request               |
| `database.yml` | Builds the schema from nothing on a throwaway Postgres, proves it, then applies the missing migrations to production | Changes under `supabase/**`               |
| `deploy.yml`   | Builds and ships the fourteen web applications to Cloudflare Pages                                                   | Push to `main`, previews on pull requests |
| `android.yml`  | Debug APK on every change; signed APK and AAB on an `android-v*` tag                                                 | Changes under `android-app/**`, or a tag  |

Three properties hold across all four, and they are the reason the set is
arranged this way:

- **Nothing deploys that has not been built in the same job from the same
  commit.** No artifact is carried between runs, so a green deployment can
  never be a stale one.
- **Nothing deploys on its own from a branch other than `main`.** Pull
  requests get a Cloudflare preview URL and a schema built on a throwaway
  database; neither can touch production.
- **No secret is ever written to a log, an artifact or a build output.**
  `ci.yml` runs gitleaks on every push to keep the repository itself clean,
  and `scripts/db-push.mjs` scrubs the connection string out of every line it
  prints, including the text of errors raised by `psql`.

The distinction that matters most while reading the rest of this document is
between the three places a value can live:

| Where                                | Read by                          | Reaches the browser?                                    |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------- |
| GitHub **repository secret**         | the workflows, at build time     | only if the name starts with `VITE_`                    |
| Cloudflare Pages **environment var** | Pages Functions, at request time | never, unless a function chooses to put it in an answer |
| `.env` on a developer machine        | `vite dev` and the local build   | same `VITE_` rule                                       |

A `VITE_` variable is **compiled into the JavaScript** that every visitor
downloads. That is correct for the Supabase URL and the publishable key,
which are designed to be public and are useless without row level security
being wrong. It would be catastrophic for the service-role key. Nothing in
this repository ever puts a service-role key behind a `VITE_` name, and
nothing should.

---

## 2. The database

### What the workflow actually does

`database.yml` has two jobs, and the order is the point.

**`verify`** starts an empty `postgres:16` service container, creates the
three roles Supabase provides and a bare Postgres does not (`anon`,
`authenticated`, `service_role`), and applies all sixty-three migrations
**from nothing**. Then it applies them a second time, which is how the claim
that they are idempotent stops being a claim. Then it asserts, against the
live schema rather than against the text of the files:

- every table in `public` has row level security enabled;
- every table in `public` has at least one policy — including the search log,
  whose policy denies every direct read, so that a table nobody may read
  looks deliberate rather than forgotten;
- no `security definer` function runs with a mutable `search_path`;
- `anon` holds no table-level `insert`, `update` or `delete`.

Then it calls the functions the applications call — `route_pattern`,
`card_check_digit`, `sitemap_sections`, `vitals_summary`, `capacity_forecast`,
`certificate_registry`, `search_suggestions`, `moderation_queue`,
`service_uptime`, `verify_code`, `record_vital` — so a changed signature
fails here rather than in a browser. It also sends one good measurement and
one nonsense measurement through the anonymous ingest path and asserts that
exactly one row survived.

Only after all of that does **`deploy`** touch the real project, and only
from `main`, one run at a time, with `cancel-in-progress: false` so a
migration is never interrupted half way.

A migration that has not been proved against an empty database has not been
proved at all. The file that works on your machine is working against six
months of accumulated state that production does not have — and against a
Supabase project that pre-installs extensions a bare Postgres does not. That
is not a hypothetical: see the `citext` entry in
[troubleshooting](#type-citext-does-not-exist).

### The one secret it needs

`SUPABASE_DB_URL`, and only in the `deploy` job. The `verify` job uses a
throwaway local database whose connection string is a literal in the
workflow, printed on purpose so a failing run can be reproduced exactly.

### Running the runner by hand

```bash
export SUPABASE_DB_URL='postgresql://postgres.PROJECTREF:…@aws-0-REGION.pooler.supabase.com:6543/postgres'

node scripts/db-push.mjs --plan       # list the files; no database needed
node scripts/db-push.mjs --dry-run    # connect, say what would change, change nothing
node scripts/db-push.mjs              # apply what is missing
node scripts/db-push.mjs --verify     # apply, apply again, then assert the invariants
node scripts/db-push.mjs --check      # change nothing: report what the database still owes
node scripts/db-push.mjs --self-test  # check the runner's own logic, offline
```

Each file is applied inside **one transaction**, so a failure leaves nothing
half-applied. What has been applied is recorded in
`supabase_migrations.schema_migrations` — the same table the Supabase CLI
uses, so `supabase db push` and this runner cannot disagree about the state
of the database. A file whose checksum has changed since it was applied is
applied again, which is safe precisely because every migration is idempotent.

### Adding a migration

1. Create `supabase/migrations/0036_<name>.sql`. The number must be the next
   one: the runner refuses a gap or a duplicate, because an out-of-order file
   is a file that will be applied in a different order on a fresh database
   than it was on yours.
2. Make it idempotent: `create table if not exists`, `create or replace
function`, `drop policy if exists` before `create policy`, `add column if
not exists`.
3. Create every object before the first thing that refers to it, **within the
   file as well as across files**. Postgres resolves table references when a
   function is created, not when it is called.
4. Assume nothing exists that you did not create. Extensions, roles and
   helper functions that Supabase happens to provide must still be created by
   a migration, or the schema cannot be rebuilt from nothing.
5. Open the pull request. `database.yml` builds the whole schema from nothing
   with your file in it, twice.
6. Merge. The `deploy` job applies only your file to production.

---

## 3. The websites

`deploy.yml` builds each application with its own environment and runs
`wrangler pages deploy` against the matching project. Fourteen applications,
fourteen Pages projects:

| Folder                 | Pages project  | Firebase project |
| ---------------------- | -------------- | ---------------- |
| `main-site`            | `bsdc`         | `bsdc-bd`        |
| `admin-site`           | `bsdc-admin`   | `bsdc-second`    |
| `moderator-site`       | `bsdc-mod`     | `bsdc-second`    |
| `performance-site`     | `bsdc-perf`    | `bsdc-second`    |
| `config-site`          | `bsdc-config`  | `bsdc-second`    |
| `users-admin-site`     | `bsdc-uadmin`  | `bsdc-second`    |
| `users-moderator-site` | `bsdc-umod`    | `bsdc-second`    |
| `customize-site`       | `bsdc-custom`  | `bsdc-second`    |
| `ip-site`              | `bsdc-ip`      | `bsdc-second`    |
| `status-site`          | `bsdc-status`  | `bsdc-second`    |
| `connect-site`         | `bsdc-connect` | `bsdc-second`    |
| `certificate-site`     | `bsdc-cert`    | `bsdc-second`    |
| `vf-site`              | `bsdc-vf`      | `bsdc-second`    |
| `notice-site`          | `bsdc-notice`  | `bsdc-second`    |

Pages projects are created once, by hand in the dashboard or with
`wrangler pages project create bsdc-<name>` (what the workflow itself does),
and are listed in the matrix at the top of the workflow next to their
folder. Adding an application means adding one line there.

### One publisher, and it is the workflow

A Cloudflare Pages project can be filled two ways: **connected to Git**,
where Cloudflare builds and deploys itself on every push, or **direct
upload**, where something runs `wrangler pages deploy`. These projects use
direct upload only, and deliberately — never connect them to Git:

- A connected build has none of this repository's GitHub secrets, so it
  compiles with the `VITE_*` variables absent and ships an unconfigured
  application that still looks deployed. Everything about it succeeds; only
  the members notice. (`scripts/check-deploy-env.mjs` makes even the correct
  publisher fail loudly in that state; nothing makes the wrong one do so.)
- Two publishers race the same production deployment. Whichever builds last
  wins, and "last" is not decided by anybody.

If a project was connected by mistake: Pages project → **Settings → Builds →
Disconnect from Git**. The check afterwards is one look at the project's
deployments: every production deployment should be a direct upload credited
to wrangler, and the Builds view should show nothing running on its own.

Every application ships a `public/_headers` file, so the security headers are
part of the build rather than a setting somebody has to remember in a
dashboard. Only `main-site` has Pages **Functions** — the sitemaps, the RSS
feed, the asset-links endpoint, the claims minter and the RPC proxy — so
only the `bsdc` project needs runtime environment variables. The other
thirteen are static builds and need nothing beyond what was compiled in.

To ship a single application: **Actions → Deploy → Run workflow**, and put
its folder name in the box. The job runs for the whole matrix either way, but
every step after the first is skipped for an application that is out of
scope, so one deployment costs one build.

---

## 4. The Android app

### What the workflow does

`android/` is not committed. Every run generates it with `npx cap add
android`, then `android-app/scripts/configure-android.mjs` re-applies the
things Capacitor does not generate:

- the app-link intent filters for `www.bsdc.info.bd`, `bsdc.info.bd` and
  `vf.main.bsdc.info.bd`, with `autoVerify="true"`;
- the `bsdc://` scheme filter, without `autoVerify`, because a custom scheme
  cannot be verified;
- `usesCleartextTraffic="false"`;
- `versionCode` from the run number and `versionName` from the tag;
- a signing configuration that reads every credential from the environment,
  so the Gradle file itself stays safe to print;
- `google-services.json`, from the secret when there is one and from a
  parseable placeholder when there is not.

Those transformations are pure functions in
`android-app/src/android-config.ts` with sixteen tests beside them, because a
CI step that edits XML with `sed` is a step nobody can review.

The workflow then asserts the manifest really says what it should before
Gradle runs, and a release build **refuses to proceed** against the
placeholder Firebase file.

### Creating the keystore, once

```bash
keytool -genkeypair -v -keystore release.keystore \
  -alias bsdc -keyalg RSA -keysize 4096 -validity 10000
```

Keep it somewhere you will still have it in ten years. Play Console will not
accept an update signed with a different key, and there is no recovery from
losing it beyond asking Google to reset the upload key.

### Cutting a release

```bash
git tag android-v1.0.0
git push origin android-v1.0.0
```

The workflow builds a signed APK and AAB, attaches both to a GitHub release,
and prints the signing certificate's SHA-256 fingerprint into the run summary.

### The last step, which is easy to forget

App links only open inside the app once Android has verified them. Take the
fingerprint from the run summary and set it as `ANDROID_CERT_FINGERPRINT` on
the `bsdc` Pages project. `/.well-known/assetlinks.json` is generated from
that variable; until it is set the endpoint serves an empty statement list —
the honest answer, meaning the site vouches for no app — and every link keeps
opening in the browser.

---

## 5. Every variable, explained

### 5.1 GitHub repository secrets

These live in **Settings → Secrets and variables → Actions → Repository
secrets**. The workflows read them as `${{ secrets.NAME }}`.

| Secret                          | What it is                                                                                                            | Where to get it                                                                                                                                                           | Exact format                                                                                                                                                                                                                                                                                                                 | Needed by                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `SUPABASE_DB_URL`               | Postgres connection used to apply migrations. Full superuser-equivalent access to the data.                           | Supabase dashboard → Project Settings → Database → Connection string → **Transaction pooler**, not _Direct connection_, then replace `[YOUR-PASSWORD]` with the real one. | `postgresql://postgres.PROJECTREF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres` — the user is `postgres.PROJECTREF`, not `postgres`. No quotes, no trailing newline; URL-encode `@ : / ?` in the password. The direct `db.PROJECTREF.supabase.co` host resolves to IPv6 only and a GitHub runner cannot reach it. | `database.yml` (deploy job)             |
| `CLOUDFLARE_API_TOKEN`          | Lets `wrangler` publish builds.                                                                                       | Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**, or a custom token with _Account → Cloudflare Pages → Edit_.         | 40-character opaque string, e.g. `v1.0-aBc…`. Account-scoped, not zone-scoped.                                                                                                                                                                                                                                               | `deploy.yml`                            |
| `CLOUDFLARE_ACCOUNT_ID`         | Which Cloudflare account to publish into.                                                                             | Cloudflare dashboard → Workers & Pages → right-hand sidebar, or the hex string in the dashboard URL.                                                                      | 32 lowercase hex characters.                                                                                                                                                                                                                                                                                                 | `deploy.yml`                            |
| `VITE_SUPABASE_URL`             | REST/Realtime endpoint the browser calls. **Public by design.**                                                       | Supabase → Project Settings → API → Project URL.                                                                                                                          | `https://abcdefgh.supabase.co` — no trailing slash, no `/rest/v1`.                                                                                                                                                                                                                                                           | `deploy.yml`, `android.yml`             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anonymous key the browser authenticates with. **Public by design**; row level security is what protects the data.     | Supabase → Project Settings → API → Project API keys → `anon` / publishable.                                                                                              | Either the new `sb_publishable_…` form or a long JWT beginning `eyJ`. One line.                                                                                                                                                                                                                                              | `deploy.yml`, `android.yml`             |
| `SUPABASE_URL`                  | Same URL as above, under a non-`VITE_` name so it is never compiled into a bundle.                                    | As `VITE_SUPABASE_URL`.                                                                                                                                                   | As above.                                                                                                                                                                                                                                                                                                                    | `ci.yml` (bundle-size record)           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Bypasses row level security. The most dangerous value in the system.                                                  | Supabase → Project Settings → API → `service_role`. Reveal, copy once.                                                                                                    | `sb_secret_…` or a long JWT. **Never** give it a `VITE_` name and never paste it into Cloudflare's plaintext variables.                                                                                                                                                                                                      | `ci.yml` (bundle-size record)           |
| `VITE_FB_API_KEY`               | Firebase Web API key for `bsdc-bd`.                                                                                   | Firebase console → Project settings → General → Your apps → Web app → SDK setup and configuration.                                                                        | `AIza…`, 39 characters.                                                                                                                                                                                                                                                                                                      | `deploy.yml` (main-site), `android.yml` |
| `VITE_FB_AUTH_DOMAIN`           | Firebase auth domain for `bsdc-bd`.                                                                                   | Same panel.                                                                                                                                                               | `bsdc-bd.firebaseapp.com`                                                                                                                                                                                                                                                                                                    | same                                    |
| `VITE_FB_PROJECT_ID`            | Firebase project id.                                                                                                  | Same panel.                                                                                                                                                               | `bsdc-bd`                                                                                                                                                                                                                                                                                                                    | same                                    |
| `VITE_FB_APP_ID`                | Firebase web app id.                                                                                                  | Same panel.                                                                                                                                                               | `1:123456789012:web:0123456789abcdef012345`                                                                                                                                                                                                                                                                                  | same                                    |
| `VITE_FB_DATABASE_URL`          | Realtime Database URL for `bsdc-bd`.                                                                                  | Firebase console → Realtime Database → the URL above the data tree.                                                                                                       | `https://bsdc-bd-default-rtdb.asia-southeast1.firebasedatabase.app` — region subdomain included, no trailing slash.                                                                                                                                                                                                          | same                                    |
| `VITE_FB2_API_KEY` …            | The same five values for the **second** Firebase project, `bsdc-second`, which backs the thirteen corporate consoles. | Firebase console, `bsdc-second` project, same panels.                                                                                                                     | Same formats, `bsdc-second` everywhere `bsdc-bd` appears.                                                                                                                                                                                                                                                                    | `deploy.yml` (consoles)                 |
| `VITE_CLOUDINARY_CLOUD_NAME`    | Cloudinary cloud for avatars, profile/project covers, product images, documents and voice notes. Supabase Storage is not on the upload path. | Cloudinary dashboard → Dashboard → **Cloud name**.                                                                                                                        | Lowercase cloud name, e.g. `bsdc`.                                                                                                                                                                                                                                                                                           | `deploy.yml` (main-site)                |
| `VITE_CLOUDINARY_UNSIGNED_PRESET` | Cloudinary **unsigned** upload preset the browser uses.                                                            | Cloudinary dashboard → Settings → Upload → Upload presets → Add preset → Signing mode **Unsigned**.                                                                       | The preset's name, e.g. `bsdc_unsigned`. It is public by design; the preset itself must cap size and formats.                                                                                                                                                                                                                 | `deploy.yml` (main-site)                |
| `VITE_IMGBB_API_KEY`            | ImgBB key for ordinary member images (posts, comments, chat and other non-cover images). **Public by design**: it is sent in the browser request URL, not an authorization secret. | api.imgbb.com → **Get API key**.                                                                                                                                          | 32-character alphanumeric key.                                                                                                                                                                                                                                                                                               | `deploy.yml` (main-site)                |
| `VITE_FIREBASE_VAPID_PUBLIC_KEY` | FCM web push public VAPID key. Optional: without it the browser never offers push.                                    | Firebase console → Project settings → Cloud Messaging → Web configuration → Web Push certificates.                                                                       | The key pair's public key, one line.                                                                                                                                                                                                                                                                                         | `deploy.yml` (main-site)                |
| `VITE_ONESIGNAL_APP_ID`         | OneSignal app id, used only for manual admin broadcasts. Optional.                                                     | OneSignal dashboard → Settings → Keys & IDs.                                                                                                                              | UUID.                                                                                                                                                                                                                                                                                                                        | `deploy.yml` (main-site)                |
| `ANDROID_GOOGLE_SERVICES_JSON`  | Firebase Android config. Required for push notifications and for any release build.                                   | Firebase console → Project settings → Your apps → Android app → download `google-services.json`.                                                                          | Either the file's text verbatim, or `base64 -w0 google-services.json`. The workflow accepts both.                                                                                                                                                                                                                            | `android.yml`                           |
| `ANDROID_KEYSTORE_BASE64`       | The upload keystore.                                                                                                  | `base64 -w0 release.keystore`                                                                                                                                             | One line of base64, no wrapping.                                                                                                                                                                                                                                                                                             | `android.yml` (release)                 |
| `ANDROID_KEYSTORE_PASSWORD`     | Password of the keystore file.                                                                                        | Whatever you typed at `keytool` time.                                                                                                                                     | Plain text, no quotes.                                                                                                                                                                                                                                                                                                       | `android.yml` (release)                 |
| `ANDROID_KEY_ALIAS`             | Which key inside the keystore to sign with.                                                                           | The `-alias` you passed to `keytool`.                                                                                                                                     | `bsdc`                                                                                                                                                                                                                                                                                                                       | `android.yml` (release)                 |
| `ANDROID_KEY_PASSWORD`          | Password of that key.                                                                                                 | From `keytool`. Often the same as the keystore password.                                                                                                                  | Plain text.                                                                                                                                                                                                                                                                                                                  | `android.yml` (release)                 |

`GITHUB_TOKEN` is provided by Actions itself. It is never set by hand.

> The five variables above the Android row are **build-time** values. The
> member site is compiled in `deploy.yml` and uploaded as static files, so a
> value that exists only in Cloudflare's dashboard (or only in a local
> `.env`) never reaches the browser bundle. The three upload ones are in
> `BSDC_REQUIRED_ENV`: if they are missing the deploy fails by name instead of
> publishing a site whose avatar and image uploads answer "Uploads are not
> configured for this deployment".

### 5.2 Cloudflare Pages environment variables — `bsdc` project only

These live in **Cloudflare dashboard → Workers & Pages → `bsdc` → Settings →
Environment variables**, and must be set for **both** Production and Preview
if previews are to work. Anything sensitive goes in as **Encrypted** (click
the padlock before saving); once encrypted, Cloudflare will never show it
again, which is the point.

| Variable                   | What reads it                                      | What it is                                                                                   | Exact format                                                                                                                                                                                                            | Encrypted? |
| -------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `SUPABASE_URL`             | `functions/_rpc.ts`, the sitemap and RSS functions | REST endpoint the Pages Functions call at request time.                                      | `https://abcdefgh.supabase.co`                                                                                                                                                                                          | no         |
| `SUPABASE_ANON_KEY`        | the same functions                                 | Anonymous key for those server-side calls. Still subject to row level security.              | `sb_publishable_…` or a JWT.                                                                                                                                                                                            | yes        |
| `SITE_URL`                 | sitemaps, RSS, canonical URLs                      | Absolute origin the generated XML should advertise.                                          | `https://www.bsdc.info.bd` — no trailing slash. Wrong value here silently produces a sitemap full of wrong links.                                                                                                       | no         |
| `FB_PROJECT_ID`            | `functions/api/auth/claims.ts`, `functions/_member-token.ts` | Firebase project whose tokens are accepted, whose claims are minted, and whose members may upload. | `bsdc-bd`                                                                                                                                                                                                               | no         |
| `IMGBB_API_KEY`            | `functions/api/media/upload.ts`                    | ImgBB key for ordinary member images: posts, comments, chat. Read at request time, so setting it needs no rebuild. **Preferred over the `VITE_` copy**, which publishes the same secret into the bundle. | 32-character alphanumeric key, from api.imgbb.com → **Get API key**.                                                                                                                                                    | yes        |
| `CLOUDINARY_CLOUD_NAME`    | `functions/api/media/upload.ts`                    | Cloudinary cloud for avatars, profile and project covers, project screenshots, product images, PDFs and voice notes. | Lowercase cloud name, e.g. `bsdc`. Required together with the preset below.                                                                                                                                             | no         |
| `CLOUDINARY_UNSIGNED_PRESET` | `functions/api/media/upload.ts`                  | The **unsigned** upload preset that accepts them.                                            | The preset's name, e.g. `bsdc_unsigned`. Public by design; the preset itself must cap size and formats.                                                                                                                 | no         |
| `FB_CLIENT_EMAIL`          | the claims function                                | Service-account address used to call Identity Toolkit.                                       | `firebase-adminsdk-xxxxx@bsdc-bd.iam.gserviceaccount.com`, from the service-account JSON you generate in Firebase console → Project settings → Service accounts → Generate new private key.                             | no         |
| `FB_PRIVATE_KEY`           | the claims function                                | RSA private key of that service account. Mints custom claims; treat it like a root password. | The `private_key` field of that JSON, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`. Literal `\n` escapes are accepted and unescaped by the function, so pasting the JSON string as-is works. | yes        |
| `BSDC_OWNER_UIDS`          | the claims function                                | Allowlist of uids permitted to change anybody's role.                                        | Comma-separated Firebase uids, no spaces: `abc123…,def456…`                                                                                                                                                             | no         |
| `VITE_PUSH_VAPID_PUBLIC_KEY` | the build, and the service worker                | This site's own VAPID public key. Compiled into the bundle at build time, so it must be set **before** a deploy for push to be offered at all. | 87 characters of base64url, from `npm run push:keys`. Public by design: it is handed to every browser that subscribes. | no |
| `PUSH_VAPID_PUBLIC_KEY`    | `functions/api/push/flush.ts`                      | The same key, as the `k=` half of the authorization header.                                  | Identical to the `VITE_` one.                                                                                                                                                                                           | no         |
| `PUSH_VAPID_PRIVATE_KEY`   | the flush function                                 | Signs the VAPID token for every delivery. Never leaves Cloudflare.                           | 184 characters of base64url: a PKCS#8 DER P-256 private key, from `npm run push:keys`.                                                                                                                                  | yes        |
| `PUSH_FLUSH_SECRET`        | the flush function, and whatever schedules it      | The bearer token that makes `/api/push/flush` a delivery run rather than a public endpoint. The database checks the same string. | 43 characters of base64url, from `npm run push:keys`. Also stored with the `INSERT` the script prints, into `bsdc.push_settings`.                                                                                        | yes        |
| `PUSH_VAPID_SUBJECT`       | the flush function                                 | Contact address a push service can complain to.                                              | `mailto:rrc@bsdc.info.bd`. Optional; defaults to `mailto:admin@bsdc.info.bd`.                                                                                                                                            | no         |
| `ANDROID_APP_ID`           | `/.well-known/assetlinks.json`                     | Android application id the site vouches for.                                                 | `bd.info.bsdc.app`                                                                                                                                                                                                      | no         |
| `ANDROID_CERT_FINGERPRINT` | `/.well-known/assetlinks.json`                     | SHA-256 fingerprint of the signing certificate.                                              | Uppercase hex pairs separated by colons: `AB:CD:EF:…` (32 pairs). Copy it out of the Android release run summary.                                                                                                       | no         |

`CF_PAGES_BRANCH` and `CF_PAGES_COMMIT_SHA` are injected by Cloudflare; the
status endpoint reads them to report what is deployed. Do not set them.

The five push variables come from one command — `cd main-site && npm run
push:keys` — which prints them, the SQL that stores the secret where the database
can check it, and the cron worker that has to be deployed for anything to be
delivered. The whole path, and what each symptom means when it is not working, is
in [push-runbook.md](./push-runbook.md). Push is the only feature here that
degrades to nothing at all when its variables are missing: the site works, the
settings card explains why there is no switch, and the flush answers `503`.

### 5.3 Local development

Copy `.env.example` in an application folder to `.env` and fill in the same
`VITE_*` values as above. The non-`VITE_` server-side variables are only
needed when running `wrangler pages dev`, and never belong in a `.env` file
that is in a folder Vite serves.

---

## 6. How to add a secret or a variable

### 6.1 GitHub, through the web interface

1. Open the repository on github.com.
2. **Settings** → in the left sidebar, **Secrets and variables** →
   **Actions**.
3. Stay on the **Secrets** tab and press **New repository secret**.
4. Put the name in exactly as it is spelled in the tables above — names are
   case-sensitive and the workflows will not find `VITE_SUPABASE_Url`.
5. Paste the value. Do **not** wrap it in quotes, and make sure there is no
   trailing newline or space; GitHub preserves both, and a connection string
   with a newline in it fails with a message that does not mention newlines.
6. **Add secret**. The value is write-only from this point: you can replace
   it, never read it back.

For a multi-line value such as `FB_PRIVATE_KEY`, paste the lines as they are.
For a file, base64 it first (`base64 -w0 file`) and paste the single line.

### 6.2 GitHub, from the command line

Faster, and much less error-prone for long values:

```bash
# one value, typed interactively (nothing lands in your shell history)
gh secret set SUPABASE_DB_URL

# one value, from a file, with no trailing newline
printf '%s' "$DB_URL" | gh secret set SUPABASE_DB_URL

# a whole file
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 release.keystore)
gh secret set ANDROID_GOOGLE_SERVICES_JSON < google-services.json

# check what exists (names and dates only — values are never readable)
gh secret list
```

`gh secret set NAME < file` sends the file verbatim, including its final
newline; use `printf '%s'` for anything where a stray newline matters.

### 6.3 Cloudflare Pages, through the dashboard

1. **Workers & Pages** → select the `bsdc` project.
2. **Settings** → **Environment variables** (sometimes shown as
   _Variables and Secrets_).
3. Choose the environment: **Production** and, separately, **Preview**. A
   variable added to only one of them produces a preview deployment that
   behaves differently from production, which is a confusing afternoon.
4. **Add variable**, type the name and the value, and press the padlock to
   **encrypt** anything from the "Encrypted: yes" column above.
5. **Save**. Pages applies environment changes to the **next** deployment,
   not to the one already live: re-run the deploy, or press **Retry
   deployment** on the latest one, before concluding that a variable did not
   work.

### 6.4 Cloudflare Pages, from the command line

```bash
npx wrangler pages secret put SUPABASE_ANON_KEY --project-name bsdc
npx wrangler pages secret list --project-name bsdc
```

Plain (unencrypted) variables are not settable this way; add those in the
dashboard, or keep them in the project's `wrangler.toml` where they are
reviewable in the pull request.

---

## 7. First deployment, in order

1. **Supabase.** Create the project. Add Firebase as a third-party auth
   provider so PostgREST accepts tokens from
   `https://securetoken.google.com/bsdc-bd`.
2. **Migrations.** Set `SUPABASE_DB_URL`, then **Actions → Database → Run
   workflow → production**. Sixty-three migrations, about a minute. Read the
   run summary: it prints the number of tables, policies, functions and
   enumerated types that now exist.
3. **Pages projects.** Create the fourteen projects named in the table in
   section 3, set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the
   `VITE_*` secrets, and push to `main`. `deploy.yml` does the rest.
4. **Runtime variables.** Set section 5.2's variables on the `bsdc` project,
   then redeploy it so they take effect.
5. **Domains.** Point each domain at its Pages project, as listed in the
   table in the root `README.md`.
6. **Android.** Tag `android-v1.0.0`, take the fingerprint from the run
   summary, set `ANDROID_CERT_FINGERPRINT` on the `bsdc` project, redeploy
   it, and upload the AAB to Play Console.

---

## 8. Troubleshooting

### `type "citext" does not exist`

**Where:** `database.yml` → _Apply every migration, twice_, on
`0001_core_schema.sql`.

**Why:** Supabase pre-installs a set of extensions in a fresh project —
`citext`, `pgcrypto`, `pg_trgm`, `unaccent` and others. A bare `postgres:16`
container installs none of them. A migration that declares a `citext` column
before anything has run `create extension "citext"` therefore works on
Supabase and fails in CI, and the failure is the honest one: the schema could
not in fact be rebuilt from nothing.

**Fix:** every extension the schema uses is created at the top of
`0001_core_schema.sql`, before the first object that depends on it. If you
add a column of an extension type, confirm the extension is created there.
`create extension if not exists` is harmless on Supabase, where it is already
installed.

### The production migration step cannot connect

Supabase no longer gives the direct database host
(`db.PROJECTREF.supabase.co`) an IPv4 address, and a GitHub-hosted runner has
no IPv6. The connection fails before any SQL runs, usually with nothing more
helpful than a timeout.

Use the **transaction pooler** URI — `aws-0-REGION.pooler.supabase.com:6543`
with the user `postgres.PROJECTREF` — which is reachable over IPv4. The
workflow checks this before it tries: the step _Check the database can be
reached at all_ resolves the host and says exactly this when there is no A
record. It reports the shape of the target (pooler or direct, port, how many
addresses of each kind) and never the project reference or the password.

### `permission denied for schema storage`

```
ERROR:  permission denied for schema storage
LINE 1: create table if not exists storage.buckets (
```

`storage` is the only schema in this project that this platform does not own: it
belongs to `supabase_storage_admin`, and the role the workflow connects as —
`postgres`, over the transaction pooler — has no `CREATE` on it. Postgres checks
that right **before** it honours `IF NOT EXISTS`, so a bare `create table if not
exists storage.buckets` fails in production even though the table is already
there, and because the runner applies one file in one transaction, the failure
took every migration after it down with it.

This is fixed, not worked around. Migration `0056` now attempts each storage
statement instead of asserting it: it creates the schema and tables where the
role has the right (the proof databases, a local `supabase start`), leaves them
alone where Storage already owns them (production), and writes whatever it was
refused into `bsdc.deployment_notes`. The runner prints those notes at the end of
every run, and `--check` reads the catalog and says what is missing without
changing anything. `main-site/scripts/db-prove/t34.mjs` builds production's exact
privilege shape — the schema owned by another role, its tables present, row level
security already on, and an applying role with no `CREATE` there — and proves the
migration applies, does the work it is allowed, records the work it is not, and
finishes the job on a later run by a role that may.

The production workflow ends by printing them where an operator actually looks:
the run's step summary carries the ledger table and then a **What this database
still owes** section — one bullet per open note, or "Nothing. Every migration did
all of its work."

#### Image uploads no longer use Supabase Storage

The uploader now uses Supabase only for each upload's metadata row
in `public.media_assets`; image and document bytes go to their intended external
hosts. Post, comment, chat and other ordinary images go to ImgBB as base64 in the
`image` form field. Avatars, profile/project covers and product images go to
Cloudinary; documents and voice notes also go there. Routing is strict: if the
required host is not configured, upload fails visibly instead of silently
sending a cover to ImgBB or an ordinary post image to Cloudinary. Video uploads
are intentionally rejected; previously stored video messages can still be read.
Required build-time settings remain in §5.1.

The storage notes and dashboard steps below are for older media rows whose
`provider` is `supabase`. The new uploader never writes bytes there. If an old
object is still present, completing the bucket/policy setup can make its old URL
readable; if the object was never stored or is gone, the original file must be
selected and attached again. SQL cannot recreate bytes that no longer exist.

What a note means in practice:

| Note | What is missing | Where to put it |
| --- | --- | --- |
| `storage.schema`, `storage.tables` | Storage is not enabled on the project | Dashboard → Storage → set up, then re-run the migrations |
| `storage.bucket` | the public bucket named `media` | Dashboard → Storage → New bucket: name `media`, public, 20 MB, or `POST /storage/v1/bucket` with the service key |
| `storage.policies` | the five policies on `storage.objects` | Dashboard → Storage → Policies → New policy → *For full customization*, one at a time |
| `storage.rls` | row level security on `storage.objects` | Dashboard → Storage → Policies (it is on by default; if it is off, the project has been changed by hand) |

The policies, as the dashboard's SQL editor will take them — it runs as a role
that owns the table, which is why this works there and not in the workflow:

```sql
create policy "bsdc media is readable by anybody" on storage.objects
  for select using (bucket_id = 'media');

create policy "bsdc media is written in your own folder" on storage.objects
  for insert with check (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  );

create policy "bsdc media is moved in your own folder" on storage.objects
  for update using (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  ) with check (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  );

create policy "bsdc media is deleted by its owner" on storage.objects
  for delete using (
    bucket_id = 'media'
    and bsdc.current_uid() is not null
    and split_part(coalesce(name, ''), '/', 1) = bsdc.current_uid()
  );

create policy "bsdc media is reachable by staff" on storage.objects
  for all using (bsdc.is_staff()) with check (bsdc.is_staff());
```

Then check the whole of it in one paste, from the same editor:

```sql
select 'bucket exists' as what,
       case when exists (select 1 from storage.buckets where id = 'media')
            then 'ok' else 'MISSING' end as state
union all
select 'bucket is public',
       case when exists (select 1 from storage.buckets where id = 'media' and "public")
            then 'ok' else 'MISSING' end
union all
select 'media policies',
       count(*)::text || ' of 5'
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'bsdc media%'
union all
select 'row level security',
       case when (select c.relrowsecurity from pg_class c
                    join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'storage' and c.relname = 'objects')
            then 'ok' else 'MISSING' end;
```

Four `ok` rows and a `5 of 5`, and uploads have somewhere to live. Anything else,
and the row that is not `ok` is the thing to create.

### `relation "public.<something>" does not exist` on a later migration

Almost always a cascade: an earlier file failed, so its tables are missing,
so every file after it fails too. Scroll the log up to the **first** failure
and fix only that. Re-running `node scripts/db-push.mjs --verify` against a
fresh database after each fix is much faster than reading the rest.

If the first failure is itself this message, the object is being referenced
before it is created **inside one file**. Postgres resolves the tables a
function reads when the function is created, so a `create function` that
queries a table declared two hundred lines further down fails immediately.
Move the table up.

### `syntax error at or near "position"`

`position` is a keyword with its own call syntax (`position('a' in 'abc')`).
As a column name it is legal, but any expression that mentions it bare —
`check (position >= 0)`, `order by position` — is parsed as that function and
fails. Quote it: `"position"`. Do not quote the genuine function call.

### `generation expression is not immutable`

A stored generated column may only use immutable expressions, and several
functions that feel immutable are not: `array_to_string(anyarray, text)` is
`STABLE`, because in general it depends on a type's output function. Wrap the
narrow case you actually need in your own `immutable` function —
`bsdc.join_text(text[])` in `0017_search.sql` is exactly that — rather than
weakening the column to a trigger.

### `function round(double precision, integer) does not exist`

`round(value, digits)` exists only for `numeric`. Aggregates like
`regr_slope`, `corr` and `avg` over floats return `double precision`. Cast
first: `round(f.slope::numeric, 3)`.

### `function pg_catalog.extract(unknown, integer) does not exist`

`date - date` in Postgres is an **integer** number of days, not an interval,
so `extract(epoch from (a - b)) / 86400` has nothing to extract from. Use the
subtraction directly.

### `cannot remove parameter defaults from existing function`

Two migrations define the same function name with the same argument types and
different defaults. `create or replace` cannot change a signature that far.
It is a name collision, not a syntax problem: rename one of them. The trust
console's `revoke_issued_certificate` is named that way because
`0015_learning.sql` already owns `revoke_certificate(text, text)`.

### A table silently has the wrong columns

`create table if not exists` does nothing — quietly — when a table of that
name already exists, even if its shape is completely different. Two
migrations that both define `public.certificates` do not conflict; they
produce one table and a mystifying `column "…" does not exist` on the next
index. Grep for the name before adding a table, and let CI build from nothing
to catch the rest.

### `NOTICE: column "checksum" of relation "schema_migrations" already exists`

Harmless, and now suppressed: the ledger DDL runs with
`client_min_messages = warning` so that an upgrade path for an older Supabase
CLI ledger does not print three lines of noise before every real migration.

### CI: the secret scan fails with `leaks found` and nothing else

The scanner is downloaded and run directly rather than through
`gitleaks/gitleaks-action`, which refuses to run on an organisation-owned
repository without a paid licence. The step prints the rule, file, line and
commit of every finding into an error annotation, so the reason is visible
even when the run log cannot be downloaded.

If a finding is a documented example rather than a credential — this
repository has two places that write down the shape of a PEM key — allow it
in `.gitleaks.toml`, narrowly, with a comment saying why. Never delete the
step, and never allow a whole directory.

### Android: `Cannot find module '…/dist/links'`

TypeScript emits import specifiers verbatim, and Node's ES module loader
requires the file extension. Source imports inside `android-app/src` are
written as `./links.js` for that reason: the specifier resolves to the
TypeScript file during the build and to the emitted JavaScript at run time.

### Android: the SDK step fails before Gradle starts

The workflow no longer depends on the runner image shipping an Android SDK.
It uses one if it is there and installs the command line tools if it is not,
then accepts the licences and installs platform-tools, `android-34` and
`build-tools;34.0.0`. If this step fails, read the error annotation: it
carries the tail of the step's own output.

### `psql: command not found` when running the runner locally

`scripts/db-push.mjs` shells out to `psql`. Install the client only:
`sudo apt-get install -y --no-install-recommends postgresql-client` on Debian
or Ubuntu, `brew install libpq` on macOS.

### Cloudflare: `Project not found`

The Pages project named in the matrix does not exist in the account the token
belongs to. Create it (`wrangler pages project create bsdc-<name>`) and check
`CLOUDFLARE_ACCOUNT_ID` matches the account you created it in.

### Cloudflare: `Authentication error [code: 10000]`

The API token lacks _Account → Cloudflare Pages → Edit_, or it was created as
a zone token. Issue a new one from the **Edit Cloudflare Workers** template.

### The site deploys but every data call returns 401

`VITE_SUPABASE_PUBLISHABLE_KEY` is missing, truncated or belongs to another
project. Vite compiles a missing value in as `undefined` and the first request
fails at runtime, so the member site's build guards the values it cannot run
without: `scripts/check-deploy-env.mjs` runs before `npm run build` and stops
the deployment, naming every variable from `BSDC_REQUIRED_ENV` that is unset.
If the deploy is failing with `refusing to deploy: … required build
variable(s) are missing`, set the named secrets and re-run; if it published and
still fails at runtime, the value is present but wrong (a key for another
project, or a truncated paste). Editing a secret does not rebuild anything by
itself — redeploy.

### Uploads answer "Uploads are not configured for this deployment"

There are two transports, and which one is in use decides what to check. The
site asks its own edge endpoint first — `GET /api/media/providers` — and only
falls back to keys compiled into the bundle when that endpoint is absent or
says it holds no key.

**Set the server-side variables. This is the fix that does not need a rebuild.**
`IMGBB_API_KEY`, `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UNSIGNED_PRESET` in
Cloudflare Pages → Settings → Environment variables are read at *request* time
by `functions/api/media/upload.ts`. Set them, and the next upload works — no
redeploy, no hard reload, because nothing was compiled in. Cloudinary's pair
must both be set: an unsigned upload without its preset is rejected by the API,
so a half-configured host reports "not configured" rather than failing
obscurely. `FB_PROJECT_ID` must also be set, or the endpoint cannot verify who
is uploading and answers 401.

To see what the deployment currently believes:

```bash
curl -s https://www.bsdc.info.bd/api/media/providers
# {"proxy":true,"imgbb":true,"cloudinary":true}
```

`proxy:false`, or an HTML page instead of JSON, means the Functions are not
deployed — the site is being served as static files only, and the bundle
fallback below is the only transport available.

**The bundle fallback** is `VITE_CLOUDINARY_CLOUD_NAME`,
`VITE_CLOUDINARY_UNSIGNED_PRESET` and `VITE_IMGBB_API_KEY`, and it is the one
that used to be the whole story: those are compiled into the JavaScript at
**build** time, so setting them as Pages variables does nothing until the site
is rebuilt, and the browser keeps serving the old build until the new one is
published. Check the three in §5.1, re-run **Deploy**, then hard-reload.

Treat the fallback as a fallback. `VITE_IMGBB_API_KEY` is a *secret* published
into a public bundle: anybody can read it and spend the account's quota. Once
the edge endpoint is configured, leave the three `VITE_` media variables unset
and rotate any ImgBB key that has already shipped this way.

### A Pages Function reads an empty variable

Environment variables apply to the **next** deployment for anything read at
build time, and to the **next request** for anything a Function reads from
`context.env` — the media keys are the second kind, which is why they are the
recommended place for them. Confirm you set the variable for the environment
you are testing: Preview and Production are separate lists.

### A member action answers "You do not have permission to do that"

That string is the client's translation of PostgREST's **42501**, and it is
almost never about the caller's role. It means a statement the browser issued
was refused by a *privilege* somewhere in the transaction — most often an
AFTER trigger that maintains a counters column the caller may not write
(migration 0039 made those triggers run as the table owner) or a row level
security policy that reads a table the caller has no `SELECT` on (0040 granted
`SELECT` on `public.blocks`, which the follow and comment policies consult).
The proof script asserts these paths statement by statement:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f scripts/rls-proof.sql
```

If the failing action is a console read — the SEO editor, the redirect table
or the branding studio — check that the caller is staff and that the migration
that grants `SELECT` on those tables is applied (0041). A missing
column-privilege write grant shows up the same way: 0042 re-issues the column
revokes that earlier migrations wrote *after* a table-wide `GRANT UPDATE`, where
they silently did nothing.

### App links still open in the browser

`ANDROID_CERT_FINGERPRINT` is unset or does not match the certificate that
signed the installed build. Fetch `https://www.bsdc.info.bd/.well-known/assetlinks.json`
and compare it with the fingerprint printed in the Android run summary. An
empty `[]` means the variable is unset. Android caches verification results;
reinstall the app after fixing it.

### The Android release job refuses to build

It found the placeholder `google-services.json`. Set
`ANDROID_GOOGLE_SERVICES_JSON`. A release that cannot receive a push
notification is not a release, so this is deliberate rather than a guard to
work around.
