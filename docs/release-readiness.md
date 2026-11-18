# Platform release readiness

Date: 2026-10-27. Branch: `arena/dd8d1419-bsdc`.

**Decision: not approved for production deployment yet.** Local quality checks
pass across the platform, but known security/correctness blockers and unperformed
staging acceptance still prevent a whole-platform readiness claim. A subsequent
public browser smoke batch passed 47 Chromium desktop/mobile-emulation checks;
see [browser acceptance](browser-acceptance.md) for its deliberately limited scope.

## Reproducible local gate

From the repository root:

```sh
node scripts/release-check.mjs --install
```

The runner discovers all package manifests, installs the corporate kit before
consoles that import its source, uses `npm ci` where a lockfile exists, and runs
required typecheck, lint, tests, build and source formatting. Main-site also runs
Functions formatting and all database proofs. A failed command or missing required
script produces a nonzero exit code. Logs and `summary.json` go to ignored
`.release-check/`. No environment values are printed by the runner itself.

For a focused rerun, with dependencies already installed:

```sh
node scripts/release-check.mjs --apps=main-site
```

Optional `--output=/absolute/path` chooses a log directory. Do not place logs or
provider credentials in tracked source. Packages without lockfiles still resolve
ranges: these checks do not establish reproducible production dependency versions.

## Executed evidence

Full installation and quality run: **98/98 gates passed across 16 packages**.
After the final main-site endpoint tests/auth-proxy changes, its seven quality
and database gates were rerun and all passed. Other packages were unchanged.

| Package | Passing unit tests | Typecheck / lint / build / format |
|---|---:|---|
| admin-site | 38 | Pass |
| android-app | 30 | Pass |
| certificate-site | 31 | Pass |
| config-site | 16 | Pass |
| connect-site | 14 | Pass |
| corporate-kit | 6 | Pass |
| customize-site | 16 | Pass |
| ip-site | 18 | Pass |
| main-site | 1,080 | Pass |
| moderator-site | 19 | Pass |
| notice-site | 25 | Pass |
| performance-site | 28 | Pass |
| status-site | 14 | Pass |
| users-admin-site | 16 | Pass |
| users-moderator-site | 18 | Pass |
| vf-site | 17 | Pass |
| **Total** | **1,386** | |

Database: **27/27 harnesses passed**, replaying migrations in local PGlite.
Android build here means the TypeScript shell build, **not** a native APK/AAB,
signed release, emulator or device acceptance.

## This batch's runtime hardening

- Shared bounded body reader limits actual streamed bytes, not a trusted
  Content-Length. It cancels excess streams and does not parse them.
- JSON APIs for claims, telemetry, push content and reverse geocoding require
  objects and bound payload bytes, depth, collection width and traversed nodes.
- Telemetry ignores malformed array entries instead of throwing on null values.
- Multipart uploads are capped at 25 MiB plus 64 KiB envelope before parsing;
  existing per-kind limits remain enforced after parsing.
- Firebase auth proxy POST bodies are capped at 1 MiB.
- New tests cover lying/missing lengths, chunk cancellation, UTF-8 byte counts,
  malformed JSON, excessive structure, invalid telemetry entries and endpoint
  rejection before upstream work. Edge endpoint tests now run in the normal suite.

Bounds prevent unbounded buffering; they are not rate limits, malware scanning,
magic-byte validation, request deadlines or provider quotas.

## Media reliability batch — 2026-11-08

The reported production symptoms were "uploads are not configured for this
deployment" on a deployment whose ImgBB key was set, and pictures that loaded on
a first visit, then stopped loading and loaded again only after clearing site
data. Both were reproduced from the source and fixed; the full account is in
[picture delivery](picture-delivery.md) and [upload pipeline](upload-pipeline.md).

What changed, each with a test that fails without it:

| # | Defect | Where |
| --- | --- | --- |
| 1 | A pre-flight probe could veto an upload, and its negative answer was cached for the life of the tab | `lib/storage/upload.ts` |
| 2 | The page believed the picture cache was `bsdc-images-v4`, the worker wrote `bsdc-images-v5`, so the page deleted the live cache (every load where `localStorage` is blocked) | `lib/media/cache-names.ts` |
| 3 | Cross-origin pictures arrive `no-cors` as opaque responses, so the picture cache was never written for a single real image — every paint re-downloaded the file | `src/sw.ts` |
| 4 | A fresh cache hit revalidated in the background with `cache: 'no-store'`, re-downloading every image on the feed on every visit | `src/sw.ts` |
| 5 | `_headers` gave `/media/i` a 7-day `immutable` policy that cannot be scoped by status, so a 502/504 could be remembered as the picture | `public/_headers` |
| 6 | A refused answer (429, HTML error page) was passed through with its cache headers, so the browser could remember the failure | `src/sw.ts` → `uncachedHeaders` |
| 7 | Neither the worker nor the proxy checked the bytes, only the declared content type | `lib/media/image-signature.ts` |
| 8 | `MediaImage` offered the proxy rung to hosts the edge cannot fetch, spending four guaranteed-failure requests per picture | `components/media/MediaImage.tsx` |
| 9 | Every `<img>` defaulted to eager loading; a twenty-post feed started twenty downloads | `components/media/MediaImage.tsx` |
| 10 | The home page preloaded a full-size cover at `fetchpriority="high"` that no element ever drew | `components/content/PostCard.tsx` |
| 11 | The page healed the picture cache twice concurrently, racing itself | `src/main.tsx` |
| 12 | The upload endpoint trusted a client-declared content type | `functions/_media.ts` |

Deployment verification added: `scripts/verify-media.mjs` (also
`main-site npm run media:verify`) asks a live deployment the four questions that
only a live deployment can answer, and the deploy workflow now fails when
`POST /api/media/upload` does not answer `401` — the one check that distinguishes
"uploads are broken" from "the Pages Functions were never uploaded".

### Executed evidence for this batch

- Whole platform: `node scripts/release-check.mjs --install` → **104/104 gates
  passed across 17 packages** (typecheck, lint, tests, build and formatting for
  each; Functions formatting and the database suite for `main-site`).
- `main-site` re-run on the final tree: **7/7 gates passed**, **88 test files /
  1,080 tests**, production build with 212 precache entries and 13 prerendered
  routes; Prettier clean for `src/` and `functions/`.
- The picture strategy was lifted out of `src/sw.ts` into
  `src/lib/media/image-strategy.ts` so each rule above is asserted directly,
  with 16 tests over a fake `CacheStorage` and a fake network: a fresh entry is
  served without a request, CORS is tried before `no-cors`, an opaque body is
  never stored, an HTML page under `image/*` is never stored, a 206 or a stub is
  never stored, refusals arrive `no-store` and without `expires`/`etag`, an
  offline miss is a `504`, a stale entry is served inside twice the trust window
  and deleted past it, the ceiling evicts the oldest entry, and a browser
  without the Cache API still gets its pictures. A further test reads `sw.ts`
  and fails if the worker stops delegating and grows its own copy again.
- Database: **39/39 PGlite harnesses passed**.
- Pages Functions exercised against a real local edge runtime
  (`wrangler pages dev`, Miniflare, 2026-11-08):
  - `GET /api/health` → `200 {"media":{"upload":true,"host":"imgbb"}}`
  - `GET /api/media/providers` → `200 {"proxy":true,"imgbb":true}`
  - `POST /api/media/upload` anonymously → `401 {"ok":false,"errorKey":"media.errors.signInRequired"}` — the endpoint exists and refuses correctly
  - `GET /media/i?u=<foreign host>` → `400`, `Cache-Control: no-store`
  - `GET /media/i?u=<imgbb>` with the host unreachable → `504`,
    `Cache-Control: no-store` (a failure is never cacheable)

Not claimed: a real upload to ImgBB, a real image fetched through `/media/i`, or
browser acceptance. This environment has no outbound access to Cloudflare,
ImgBB, Firebase or Supabase, and no member credentials were used. Those three
remain the acceptance steps a person must run against staging with
`node scripts/verify-media.mjs`.

## Remaining release blockers

Track implementation details in [the recovery plan](production-recovery-plan.md).
Do not waive these because local builds pass:

1. Complete authorization/privacy review of elevated reads and metadata,
   independent Firebase-project identities, private realtime presence/broadcast,
   and legacy permission paths that do not use current account authority.
2. Make multi-step publishing transactional and preserve existing poll votes on
   edits; test retries and rollback.
3. Upload signature validation is now enforced at the edge (magic bytes, not the
   declared type) and the upload has an upstream deadline and one bounded retry.
   Still outstanding: distributed per-account quotas, and a JWT
   validation/revocation strategy; validate corporate session bootstrap.
4. Validate Firebase profile/cache rules and indexes in emulators. Verify push
   destination safety and per-device delivery behavior.
5. Apply migrations 0068–0071 in order to a backed-up staging environment;
   rehearse restore and verify deployed schema/grants rather than assuming local
   PGlite proves provider configuration.
6. Run public/member/staff/demoted/suspended browser journeys against actual
   staging headers, Functions and providers. Include console/network errors,
   mobile layouts, accessibility, account switching and cache isolation.
7. Verify every application's deployment bindings, domains, OAuth redirect
   allowlists, CSP, secrets, database identity configuration, monitoring and
   operational ownership. Finish pending review/admin workflows.
8. Build/sign/test native Android artifacts separately before mobile release.

No production migration, provider mutation, deployment or real-browser acceptance
was executed in this batch. Logs are local execution evidence, not a penetration
test or guarantee that the deployed platform has no defects.

## Play Store submission — what the repository now settles

Added 2026-11-18. Everything below is a property of this repository, held by a
test or a checkpoint, and recorded against the schema in
[play-store-compliance.md](play-store-compliance.md).

**Done here**

- Privacy policy at `/privacy`, bilingual, public, no sign-in.
- Terms of service at `/terms`, bilingual, public, no sign-in.
- Deletion URL at `/account-deletion`, bilingual, public — the one Play's Data
  safety section asks for, which works for a reviewer with no account and for a
  member without the app.
- Self-service account deletion in both clients:
  `public.delete_my_account()` (0119), Settings → Delete account on the web and
  Android, with a typed `DELETE` confirmation and copy that says what is kept as
  well as what is removed.
- Copyrighted-material and moderation behaviour described in the terms; report
  and appeal paths already existed and are now named there.
- Sensitive permissions reviewed: `RECORD_AUDIO` removed (voice search hands
  the microphone to the system recogniser), camera and location declared
  optional, background location never declared, and the manifest guard in CI
  fails if the microphone permission returns.
- Cleartext traffic refused, backups disabled for the database and preferences,
  R8 shrinking and resource shrinking on, `targetSdk 35`.
- Data safety answers written down against the schema, including the third
  parties that receive data (Firebase, Supabase, Cloudflare, ImgBB).

**Still owner-side, and cannot be done from this repository**

1. Fill the Data safety form in the Play Console from
   [play-store-compliance.md](play-store-compliance.md) — the table there is the
   answer sheet.
2. Declare the deletion URL as `https://www.bsdc.info.bd/account-deletion` and
   the policy as `https://www.bsdc.info.bd/privacy`.
3. Request the `USE_FULL_SCREEN_INTENT` grant for the order alarm, or accept the
   fallback (a heads-up notification) — the app works either way.
4. Upload the signed AAB from the release workflow and complete the content
   rating, ads declaration ("no ads") and target audience questionnaire.
5. Run the pre-launch report and read it: it is the only automated check that
   exercises real devices, and it is free.

## Performance budget — Lighthouse 95+ on every public page

The measurement that started this work was a mobile Lighthouse run on `/`:
**performance 63**, accessibility 96, best practices 96, SEO 92. The causes were
not vague. Each one is named below with the change that removed it, and every
change has a checkpoint in `scripts/audit.mjs` (checks `F-11` … `F-21`) so the
next commit cannot quietly undo it.

| Symptom (mobile, `/`) | Cause | Fix |
| --- | --- | --- |
| CLS **0.43** | The footer is 773 px tall on a phone and sat directly under the hero while the feed was still loading; when the feed arrived the footer moved by the height of the page. | `AppShell` reserves `min-h-[100dvh]` for `<main>` on every page with a footer, so the footer starts below the fold and its arrival cannot move anything on screen. CLS is now 0. |
| LCP **4.1 s**, and 3.2–3.8 s on every text page | The largest thing on screen was painted by React, not by the HTML: the prerendered shell was a bare `<h1>` and one sentence — smaller than the page that replaced it — so the browser recorded the application's later paint as the largest content. | The shell is now styled with the page's own classes *and* quotes the page's opening paragraphs (`opening` in `static-routes.json`, held word-for-word against the English bundle by `app-routes.test.ts`). The first paint is the page. LCP 1.8 s everywhere. |
| Render-blocking **150 ms** | One `<link rel="stylesheet">` in front of the first pixel. | `scripts/prerender.mjs` inlines the single design-system stylesheet into every page (`inlineStyles`); the request is gone rather than deferred. |
| Unused JavaScript **91 KiB**, 480 kB entry chunk | Both language bundles (354 kB of copy) and the schema library were in the entry chunk, so every visitor parsed Bangla and English before anything could render. | `src/i18n/index.ts` loads one language as its own chunk; the environment check validates two values by hand instead of shipping a schema library (`src/lib/env.ts`); the router's guard imports a tiny module instead of the profile schema; the app bar's unread badge no longer drags the messaging layer in. Entry chunk: 480 kB → 195 kB raw (161 kB → 61 kB gzip). |
| Second round trip before the first screen | Routes are `lazy()`; the browser learned the route's chunk only after the entry script ran. | The build manifest names each route's chunk and the prerender writes `<link rel="modulepreload">` for it (`modulePreloadHrefs`). |
| Long main-thread tasks after paint (TBT 200–300 ms) | The toast library, the service worker registration and a `framer-motion` animation loop all ran during the first screen. | Toaster is a lazy chunk; the worker registers on `load` + idle; the marketplace's decorative glow is a compositor CSS animation; the footer is skipped for layout/paint until it is near the viewport (`content-visibility`). |
| Accessibility **96** | `#1877f2` as *text* on our surface is 3.9:1 (needs 4.5:1). A logo link and a language button had accessible names that did not contain their visible text. | New `--bsdc-blue-text` token (6.1:1) for copy, with `--bsdc-blue` kept for fills; the logo's name is its visible lockup; the language button's action is in a visually hidden span. Accessibility is 100 on every route. |
| SEO **92** | One link with the text "Learn more", and legal pages were missing from the prerender manifest. | The hero button is "About the community"; `/privacy`, `/terms` and `/account-deletion` are prerendered, in the sitemap, and crawlable without JavaScript. SEO is 100 on every route. |

**Measured result** (mobile, simulated Slow 4G, 4× CPU — the Lighthouse default;
`node scripts/lighthouse.mjs`, three runs per route, median):

| Route | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/` | 96–98 | 100 | 96–100 | 100 |
| `/about` `/guidelines` `/privacy` `/terms` `/account-deletion` `/contact` | 97–100 | 100 | 100 | 100 |
| `/jobs` `/freelance` `/projects` `/learn` `/groups` `/events` `/verify` | 97–100 | 100 | 96–100 | 100 |
| `/marketplace` `/playground` | 95–99 | 100 | 96–100 | 100 |

Desktop is 100 in every category on `/` and never below 96 elsewhere.

**How to re-measure**

```bash
cd main-site && npm run build          # dist/ with prerendered HTML
npm install --no-save lighthouse chrome-launcher
CHROME_PATH=/path/to/chrome npm run lighthouse            # every public route, median of 3
node ../scripts/lighthouse.mjs --routes /,/privacy --runs 5 --floor 95
```

The last full run of the script (16 routes × 3 runs) printed *every category
clears the floor on every route*; accessibility and SEO were 100 on all sixteen.

Two readings that are *not* evidence of a defect, so nobody chases them:

- **Best practices 96 on data pages in a local run.** The local server has no
  `/api/*` and no Supabase or Firebase host, so the browser logs network
  failures for requests the deployment answers. Pages that make no such request
  (`/about`, `/privacy`, `/terms`) score 100 in the same run — that is the
  control.
- **The score of a single run.** On a shared machine the same commit measures
  94–98. The budget is the median of three, which is what the script asserts.
