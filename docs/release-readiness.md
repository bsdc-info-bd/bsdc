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
| main-site | 854 | Pass |
| moderator-site | 19 | Pass |
| notice-site | 25 | Pass |
| performance-site | 28 | Pass |
| status-site | 14 | Pass |
| users-admin-site | 16 | Pass |
| users-moderator-site | 18 | Pass |
| vf-site | 17 | Pass |
| **Total** | **1,160** | |

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

## Remaining release blockers

Track implementation details in [the recovery plan](production-recovery-plan.md).
Do not waive these because local builds pass:

1. Complete authorization/privacy review of elevated reads and metadata,
   independent Firebase-project identities, private realtime presence/broadcast,
   and legacy permission paths that do not use current account authority.
2. Make multi-step publishing transactional and preserve existing poll votes on
   edits; test retries and rollback.
3. Complete upload signature validation, distributed quotas, deadlines and JWT
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
