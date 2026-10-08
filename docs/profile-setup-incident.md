# Profile setup / production checks — 2026-10-08

## Status

Code fixes are on the session branch. They have **not been deployed**. The reported live account has not been reproduced against production, so these checks do not establish that every production issue is resolved.

## Findings and fixes

- Firebase's initial `onIdTokenChanged` callback could publish an authenticated session before `ensureDataAccess` finished minting the PostgREST `authenticated` claim. This exposed member routes while requests could still carry an unprepared token. The initial token callback now waits for the sign-in bootstrap path.
- Supabase previously sent `user.getIdToken()` without checking database-access readiness. Its token callback now awaits the shared bootstrap/repair operation for every authenticated request, and refuses a token if the account changed while waiting. It does not retry or bypass genuine RLS denials.
- Concurrent requests now share in-flight bootstrap work. Failed requests are not cached, allowing a later attempt to recover.
- Late bootstrap/profile results from a signed-out or replaced account are ignored.
- Token refresh for the same account no longer resets `profileLoaded`, avoiding a false loading state after the profile has already settled.
- Bootstrap service failures now have an actionable English/Bangla error instead of the generic authentication fallback. Actual database permission failures retain their permission message.
- Changes to `scripts/rls-proof.sql` now trigger the database verification workflow.

No database grants or security rules were loosened.

## Historical production deployment blocker

GitHub Actions run **37226111878**, “Deploy Firebase rules”, failed in “Prepare Firebase deployment credential”. Its check annotation says:

> FIREBASE_SERVICE_ACCOUNT_BSDC_BD is required to deploy production Firebase rules.

The owner reports that `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` has now been added. A successful rerun of `.github/workflows/firebase-rules.yml` is still needed; the session cannot dispatch it because the GitHub integration returns HTTP 403. Do not put credentials in source control or chat. This failure means the latest repository rules cannot be assumed to be live; it does not prove the current live rules caused this account's error.

Latest inspected main-branch CI, web deployment, and database workflows reported success. A green web build does not verify account-specific runtime permissions. The current GitHub integration cannot list repository/environment secrets (HTTP 403), and this sandbox cannot contact the production Cloudflare/Firebase/Supabase endpoints.

## Verification

- All **16 packages** passed typechecking, linting, unit tests, and their build scripts. Android's build here is its repository script, not a device/store smoke test.
- **688 unit tests** passed in total, including 12 new regressions (382 main-site tests).
- All **38 SQL migrations** applied twice to fresh local PostgreSQL; `scripts/rls-proof.sql` passed, including member profile insertion/update/username claiming and denial of self-promotion. This used embedded PostgreSQL 18, not the live database.
- Database migration runner self-tests: **9 passed**.
- The separate launch audit script was attempted but did not complete within the tool timeout; it is not counted as a passed gate.

## Production rollout and smoke test

1. Review and deploy this branch through the normal main-branch release process. No new SQL migration is required by this patch.
2. Restore the missing Firebase deployment secret and deploy the rules.
3. Confirm the main site's Pages Function has `FB_PROJECT_ID`, `FB_CLIENT_EMAIL`, and `FB_PRIVATE_KEY` for the member project. Confirm Supabase's Firebase third-party authentication trusts that project. Never expose server credentials through `VITE_*` variables.
4. With a fresh member account, finish profile setup and check that `/api/auth/claims` succeeds, then that profile writes and `claim_username` succeed. If a 42501 remains, capture the failing endpoint and sanitized response code/message, not tokens or personal data.
5. Sign out, sign in again, edit the profile, refresh the page, and verify saved values. Test sign-out while profile loading and switching between two accounts.
6. Confirm another member's profile remains uneditable and member accounts cannot change role, verification, counters, or activity fields.

## Follow-up: OAuth and deployment wiring

See [auth-production-runbook.md](./auth-production-runbook.md) for the additional CSP,
redirect handling, server credential deployment, same-origin auth helper, and external
provider setup checks. The verification counts above describe the first investigation,
not the expanded follow-up test suite. Live account testing remains outstanding.
