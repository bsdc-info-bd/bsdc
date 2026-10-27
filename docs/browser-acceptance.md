# Browser/device-emulation acceptance — 2026-10-27

## What actually ran

**47 automated Chromium checks passed** against a local production build, with
normal same-origin and Content Security Policy enforcement enabled. Chromium
153 was obtained through the npm-distributed `@sparticuz/chromium` package; its
required libraries were extracted locally. Playwright drives desktop and Pixel 7
viewport/touch/user-agent emulation. This is **not a physical phone, an Android
OS emulator, a paid/free cloud-device session, or a test of the deployed site**.

The environment cannot access the deployed Firebase/Supabase/Cloudflare hosts.
The build has no Firebase/Supabase credentials. The browser server serves real
build files with the static production CSP, and the actual playground Function
response. Other Pages APIs deliberately return 503 rather than fake successes.
Those 503s and the explicit authentication-not-configured screen are environment
limitations, not reproduced production outages. Service workers are blocked in
the browser suite to keep test runs isolated; offline/PWA acceptance is pending.

## Confirmed errors and fixes

| Finding | Reproduction | Fix / retest |
|---|---|---|
| Overlapping header links | At 768px, Home occupied x183–251 while About occupied x211–282. Later links overlapped action buttons. Similar overlaps occurred at 1024px and 1280px, despite no document overflow. | Compact nonshrinking primary links, an accessible all-sections navigation dialog, and mobile action consolidation. Tested selection, Escape dismissal, focus restoration and nonoverlap at 320, 375, 768, 1024, 1280 and 1440px. |
| Mobile sections and language control not directly reachable in header | Most header navigation was hidden below the desktop breakpoint, with only four bottom tabs; language toggle was hidden on phones. | All public sections available from the navigation dialog, with a mobile language toggle. Actual Bangla/English switching tested at the emulated phone width. |
| Playground Run produces empty output | Click Run on the default JavaScript sketch: the original srcdoc frame stays empty. Generated source had a nonclosing escaped script tag; correcting that alone would still conflict with application CSP. | Retired srcdoc execution from the page. A sandboxed Function document starts an opaque-origin worker, receives a snapshot of code/language and enforces a two-second execution limit. Default and repeated Run now produce `squares [1,4,9,16]`. |
| No execution containment for infinite loops | Inline execution in an iframe has no worker termination boundary. | Browser test runs `while (true) {}` and receives the timeout message while the page remains responsive. |

The runner is a **Pages Function**, not overlapping static `_headers` rules. Its
response enforces `sandbox allow-scripts` without `allow-same-origin`, denies
connections/resources, and grants evaluation only inside that isolated document.
The application CSP remains unchanged and does not allow unsafe inline/eval.
Middleware bypasses SEO/redirect processing for the runner. The PWA app-shell
fallback excludes its URL; the exclusion has a unit regression check but has not
yet been validated through a controlling production service worker.

HTML/CSS previews are deliberately inert, sanitized and sandboxed: scripts,
links, forms and remote resource attributes are removed. JavaScript runs in the
worker, not a DOM. SQL is displayed, not executed. TypeScript execution is
explicitly unsupported rather than silently pretending to compile it. Worker
storage denial, blocked absolute network requests (no request reaches the test
server), and inert HTML are verified in Chromium, not inferred only from source.

## Reproduce

On Linux with Node 22+:

```sh
cd main-site
npm ci --no-audit --no-fund
npm run test:browser
```

The command builds production artifacts, starts an ephemeral local test server,
runs checks, closes browser/server and exits nonzero on failure. It writes
`.browser-evidence/summary.json`, successful desktop/mobile screenshots and a
failure screenshot when possible. Evidence is ignored by Git. A compatible
installed browser can be selected with `CHROMIUM_EXECUTABLE_PATH`.

GitHub workflow `.github/workflows/browser.yml` repeats this gate and retains
browser evidence artifacts. No GitHub Actions run is claimed for this local work.

## Coverage and remaining acceptance

- Guest render/no-crash/no-horizontal-overflow checks on 11 routes, desktop and
  mobile: home, about, login, signup, events, jobs, projects, playground, search,
  shop and an unknown route. Local unknown routes use an SPA fallback, so this
  does not prove deployed edge 404/SEO behavior.
- Navigation at six widths in both contexts, including route change and keyboard
  focus behavior. This does not prove every signed-in layout.
- Default/repeated Run, infinite-loop termination, storage denial, network denial
  and inert HTML in both contexts, plus mobile language switching.
- Main-site strict typecheck, lint, **854 unit tests in 67 files**, source/Functions
  formatting and production build passed after these changes. No SQL changed in
  this batch; the previous 27/27 database proof result remains earlier evidence.

**Production release is still blocked.** Required next checks include configured
signup/OAuth/verification, account switching, permissions/demotion, post/poll
publishing and edits, uploads, private groups/chat, checkout/staff workflows,
real provider failures/reconnect, offline/PWA behavior, Safari/iOS, physical
Android and native APK acceptance. Known implementation blockers remain listed
in [release readiness](release-readiness.md) and the recovery plan. A passing
public, unconfigured browser smoke suite cannot close those blockers or establish
that all production errors have been found.
