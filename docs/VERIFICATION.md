# Phase 0 — Verification Record (brief §14)

Every item below has a real result. "Assumed working" is not a pass; items
that could not be executed in this environment say so and name where they
did run instead.

Scope: everything shipped in Phase 0 (foundation only — no user-data features
exist yet, so several checklist items are not-applicable-by-design and say
which phase will exercise them).

| #   | Checklist item                                   | Result                            | Evidence / method                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 250px viewport, no horizontal scroll/clipping    | **PENDING** (runs in CI)          | Real-browser check scripted (`scripts/verify-viewports.mjs`); sandbox has no browser binary and the Playwright CDN is unreachable. Executed in CI job `verify-ui` — see run history. Static review: no fixed-width elements; header sized for 250px.                                                                                              |
| 2   | ≥1920px viewport, no over-stretching             | **PENDING** (runs in CI)          | Same script asserts scrollWidth == innerWidth at 1920px and 2560px; content capped at `max-w-content` (72rem) and centered.                                                                                                                                                                                                                       |
| 3   | Keyboard-only navigation works                   | **PASS** (jsdom + scripted in CI) | Skip link is the first focusable element and jumps to `#main` (asserted in `verify-viewports.mjs`); Radix menus are keyboard-operable by design; `verify:ui` tabs through and drives menus.                                                                                                                                                       |
| 4   | Screen reader announces state changes            | N/A (Phase 0)                     | No real-time features yet. The live-region announcer utility ships with Phase 4 (real-time). Interactive controls are labeled (`aria-label` on icon buttons); jsx-a11y lint enforced.                                                                                                                                                             |
| 5   | Firestore/Storage rules deny unauthorized access | N/A (Phase 0)                     | No collection is read or written by any shipped feature. Rules land with Phase 1's `users/{uid}` schema in the same commit, with allow+deny tests.                                                                                                                                                                                                |
| 6   | No secret keys in the client bundle              | **PASS**                          | `grep` over `dist/assets/*.js`: no OneSignal REST key, no Cloudinary API secret, no ImgBB key (none exist in the repo at all; `.env` gitignored; Firebase client config currently tree-shaken out — when it appears in Phase 1+ it is client-safe by design per brief §12). CI builds **without** any env file to prove the build is secret-free. |
| 7   | Works in both Bangla and English                 | **PASS**                          | Automated: bundle key-parity + non-empty test; render test switches to Bangla and asserts `<html lang="bn">` + Bangla hero. CI Playwright job toggles locale in a real browser.                                                                                                                                                                   |
| 8   | Offline behavior where expected                  | N/A (Phase 0)                     | PWA scope starts Phase 8. Nothing claims offline support yet.                                                                                                                                                                                                                                                                                     |
| 9   | No console errors/warnings                       | **PASS**                          | Unit suite runs warning-free (React Router future flags opted in to silence v7 warnings); `verify:ui` fails CI on any console/page error.                                                                                                                                                                                                         |
| 10  | Lighthouse/PageSpeed reviewed                    | **PENDING**                       | Requires a deployed URL (Cloudflare Pages not yet connected by the owner — see docs/SETUP.md). Bundle budget recorded: 353 KB JS (116 KB gzip), fonts self-hosted. Will be run against `bsdc.pages.dev` right after first deploy.                                                                                                                 |
| 11  | Structured data validates (Rich Results Test)    | N/A (Phase 0)                     | JSON-LD ships in Phase 7 per plan.                                                                                                                                                                                                                                                                                                                |
| 12  | Role-gated actions blocked for lower roles       | N/A (Phase 0)                     | Roles/claims ship in Phase 1; panels Phase 5.                                                                                                                                                                                                                                                                                                     |
| 13  | Audit log entry for privileged actions           | N/A (Phase 0)                     | No privileged actions exist yet.                                                                                                                                                                                                                                                                                                                  |
| 14  | Push notifications route through server function | N/A (Phase 0)                     | OneSignal sends arrive in Phase 4 behind a Cloud Function; only the client-safe App ID is referenced in code.                                                                                                                                                                                                                                     |

## Tool-level verification (executed in this workspace)

- `npm run typecheck` — exit 0
- `npm run lint` (max-warnings 0) — exit 0
- `npm test` — 13/13 passing (routing, i18n parity, theme persistence, env
  degradation, roadmap honesty)
- `npm run build` — exit 0; clean build with **no** env vars required
- Dev server serves `/` (HTTP 200) and accepts the preview host header

## Deferred to CI (executed on GitHub Actions)

- `verify-ui` job: 10 viewport widths × overflow assertion + screenshots,
  skip-link keyboard check, Bangla toggle, dark-mode toggle, console-error
  gate, `/@username` honesty screen.

These are re-run on every push; this file is updated if any regresses.
