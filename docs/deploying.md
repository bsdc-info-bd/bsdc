# Deploying BSDC

Four workflows, each doing one job, in `.github/workflows/`:

| Workflow       | What it does                                                                                                         | When it runs                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `ci.yml`       | Typecheck, lint, format, test, build and the 250 KB budget, per package                                              | Every push and pull request               |
| `database.yml` | Builds the schema from nothing on a throwaway Postgres, proves it, then applies the missing migrations to production | Changes under `supabase/**`               |
| `deploy.yml`   | Builds and ships the fourteen applications to Cloudflare Pages                                                       | Push to `main`, previews on pull requests |
| `android.yml`  | Debug APK on every change; signed APK and AAB on an `android-v*` tag                                                 | Changes under `android-app/**`, or a tag  |

Nothing deploys on its own from a branch other than `main`, and nothing
deploys that has not built in the same job from the same commit.

---

## 1. The database

### What the workflow actually does

The `verify` job starts an empty `postgres:16`, creates the three roles
Supabase provides (`anon`, `authenticated`, `service_role`), and applies all
thirty-five migrations **from nothing**. Then it applies them a second time,
which is how the claim that they are idempotent stops being a claim. Then it
asserts, against the live schema rather than against the text of the files:

- every table in `public` has row level security enabled;
- every table in `public` has at least one policy;
- no `security definer` function runs with a mutable `search_path`;
- `anon` holds no table-level `insert`, `update` or `delete`.

Then it calls the functions the applications call — `route_pattern`,
`sitemap_sections`, `vitals_by_route`, `moderation_queue`, `service_uptime`,
`verify_code`, `record_vital` — so a changed signature fails here rather
than in a browser. It also sends one good measurement and one nonsense
measurement through the anonymous ingest path and asserts that exactly one
row survived.

Only after all of that does `deploy` touch the real project, and only from
`main`.

### The one secret it needs

| Secret            | Where to find it                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_DB_URL` | Supabase dashboard → Project Settings → Database → Connection string → **URI**, with the password filled in. Use the pooler host on port `6543` for ordinary runs. |

The connection string is never printed. `scripts/db-push.mjs` scrubs it out
of any error it reports, and logs the target as `host:port/database` only.

### Running it by hand

```bash
export SUPABASE_DB_URL='postgresql://postgres:…@db.…supabase.co:5432/postgres'

node scripts/db-push.mjs --plan       # list the files, no database needed
node scripts/db-push.mjs --dry-run    # connect, say what would change, change nothing
node scripts/db-push.mjs              # apply what is missing
node scripts/db-push.mjs --verify     # apply, apply again, then assert the invariants
node scripts/db-push.mjs --self-test  # check the runner's own logic
```

Each file is applied inside **one transaction**, so a failure leaves nothing
half-applied. What has been applied is recorded in
`supabase_migrations.schema_migrations` — the same table the Supabase CLI
uses, so `supabase db push` and this runner cannot disagree about the state
of the database. A file whose checksum has changed since it was applied is
applied again, which is safe precisely because every migration is
idempotent.

### Adding a migration

1. Create `supabase/migrations/0036_<name>.sql`. The number must be the next
   one; the runner refuses a gap or a duplicate.
2. Make it idempotent: `create table if not exists`, `create or replace
function`, `drop policy if exists` before `create policy`.
3. Open the pull request. `database.yml` builds the whole schema from
   nothing with your file in it, twice.
4. Merge. The `deploy` job applies only your file to production.

---

## 2. The websites

`deploy.yml` builds each application with its own environment and runs
`wrangler pages deploy` against the matching project.

| Secret                                               | Used by                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                               | all fourteen deployments (scope: _Cloudflare Pages — Edit_) |
| `CLOUDFLARE_ACCOUNT_ID`                              | all fourteen deployments                                    |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | every application                                           |
| `VITE_FB_*`                                          | `main-site` only — the `bsdc-bd` Firebase project           |
| `VITE_FB2_*`                                         | the thirteen consoles — the `bsdc-second` Firebase project  |

Pages projects are created once, by hand or with
`wrangler pages project create bsdc-<name>`, and are listed in the matrix at
the top of the workflow next to their folder. Runtime variables that the
**Pages Functions** need — `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`ANDROID_CERT_FINGERPRINT` — are set on the Pages project itself, not in
GitHub, because they are read at request time rather than at build time.

To ship a single application: **Actions → Deploy → Run workflow**, and put
its folder name in the box.

---

## 3. The Android app

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
`android-app/src/android-config.ts` with sixteen tests beside them, because
a CI step that edits XML with `sed` is a step nobody can review.

The workflow then asserts the manifest really says what it should before
Gradle runs, and a release build **refuses to proceed** against the
placeholder Firebase file.

### Secrets

| Secret                                                                   | Needed for                                 | How to produce it                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `ANDROID_GOOGLE_SERVICES_JSON`                                           | push notifications; required for a release | Firebase console → Project settings → Android app → `google-services.json`. Paste the file, or `base64 -w0 google-services.json`. |
| `ANDROID_KEYSTORE_BASE64`                                                | signing a release                          | `base64 -w0 release.keystore`                                                                                                     |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | signing a release                          | from the keystore you created                                                                                                     |

Creating the keystore once:

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
and prints the signing certificate's SHA-256 fingerprint into the run
summary.

### The last step, which is easy to forget

App links only open inside the app once Android has verified them. Take the
fingerprint from the run summary and set it as `ANDROID_CERT_FINGERPRINT` on
the `bsdc` Pages project. `/.well-known/assetlinks.json` is generated from
that variable; until it is set the endpoint serves an empty statement list —
the honest answer, meaning the site vouches for no app — and every link
keeps opening in the browser.

---

## Secret inventory

Everything the four workflows read, in one place. None of it is ever
committed; `ci.yml` runs gitleaks on every push to keep it that way.

| Secret                                                                                              | Database |               Pages                | Android |
| --------------------------------------------------------------------------------------------------- | :------: | :--------------------------------: | :-----: |
| `SUPABASE_DB_URL`                                                                                   |    ●     |                                    |         |
| `CLOUDFLARE_API_TOKEN`                                                                              |          |                 ●                  |         |
| `CLOUDFLARE_ACCOUNT_ID`                                                                             |          |                 ●                  |         |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                                         |          | ● (bundle-size record in `ci.yml`) |         |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`                                                |          |                 ●                  |    ●    |
| `VITE_FB_*` (bsdc-bd)                                                                               |          |                 ●                  |    ●    |
| `VITE_FB2_*` (bsdc-second)                                                                          |          |                 ●                  |         |
| `ANDROID_GOOGLE_SERVICES_JSON`                                                                      |          |                                    |    ●    |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |          |                                    |    ●    |

## First deployment, in order

1. Create the Supabase project and add Firebase as a third-party auth
   provider, so PostgREST accepts tokens from
   `https://securetoken.google.com/bsdc-bd`.
2. Set `SUPABASE_DB_URL` and run **Actions → Database → Run workflow →
   production**. Thirty-five migrations, about a minute.
3. Create the fourteen Pages projects, set the Cloudflare and `VITE_*`
   secrets, and push to `main`. `deploy.yml` does the rest.
4. Set the runtime variables on each Pages project (`SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`).
5. Point the domains at the Pages projects, as listed in the table in the
   root `README.md`.
6. Tag `android-v1.0.0`, take the fingerprint from the run summary, set
   `ANDROID_CERT_FINGERPRINT` on the `bsdc` project, and upload the AAB to
   Play Console.
