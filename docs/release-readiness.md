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
