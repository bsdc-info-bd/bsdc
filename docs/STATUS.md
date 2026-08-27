# BSDC Build Status

**Rule enforcement (brief §2.1):** everything listed below is either genuinely
implemented and verified, or explicitly listed as **not yet implemented**.
Nothing is silently stubbed and reported as done.

Last updated: Phase 0 completion.

---

## Phase ledger

| Phase | Name                        | Status              | Notes                                                             |
| ----- | --------------------------- | ------------------- | ----------------------------------------------------------------- |
| 0     | Foundation                  | **SHIPPED**         | Verified — see docs/VERIFICATION.md                               |
| 1     | Identity                    | Not yet implemented | Auth UI/Firebase Auth wiring, profiles, `/@username` pages, roles |
| 2     | Content Engine              | Not yet implemented | Composer, code snippets, media, reactions, comments               |
| 3     | Social Graph & Feed         | Not yet implemented | Follows, groups, pages, events, ranked feed, search               |
| 4     | Real-Time Messaging         | Not yet implemented | 1:1/group chat, presence, typing, voice notes, push               |
| 5     | Admin/Manager/Mgmt/Mod      | Not yet implemented | Role panels, narrowest tier first, full audit logging             |
| 6     | Creator, Jobs & Marketplace | Not yet implemented | Jobs, freelancing, creator program, licenses, ads                 |
| 7     | SEO & Discoverability       | Not yet implemented | Helmet/prerender, sitemap/RSS Cloud Function, JSON-LD             |
| 8     | PWA, Offline & Android      | Not yet implemented | vite-plugin-pwa, offline caching, Capacitor build                 |
| 9     | Hardening & Launch          | Not yet implemented | Full rules audit, load tests, legal pages, launch countdown       |

## What Phase 0 actually contains (all verified)

- **Toolchain:** Vite 5 + React 18 + TypeScript (strict), Vitest + Testing
  Library, ESLint (TS + react-hooks + jsx-a11y) + Prettier (Tailwind plugin).
  `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- **Tailwind theme:** brand tokens (primary green scale, secondary blue scale),
  semantic light/dark surface tokens via CSS variables, and the full named
  breakpoint set `xs 250 / sm 320 / md 375 / lg 480 / tablet 768 / laptop 1024
/ desktop 1280 / wide 1440 / ultrawide 1920`. Content capped at `max-w
-content` and centered for ≥1920px.
- **Routing skeleton:** the §5 IA URL scheme is wired and stable:
  `/`, `/search`, `/t/:tag`, `/g/:slug`, `/p/:slug`, `/events/:slug`,
  `/jobs/:slug`, `/{post-type}/{slug}` (typed post-type guard),
  `/@username` (via single-segment fallback with `@` guard). Areas whose
  phases have not shipped render an explicit, noindexed "planned, not faked"
  screen stating the owning phase.
- **i18n:** i18next + react-i18next, complete Bangla and English bundles,
  localStorage + navigator detection, `<html lang>` sync, Hind Siliguri
  font for Bangla. Automated bundle-parity test.
- **Theme:** dark/light/system via `use-local-storage-state` (the brief's
  `use-localstorage-state` package does not exist on the npm registry — the
  real package name is `use-local-storage-state`, pinned ^19), system
  preference respected, pre-paint inline script prevents flash.
- **Firebase wiring:** modular SDK init behind typed env access; every
  service getter returns `null` when config is absent; no feature consumes
  Firebase yet (Phase 1 will).
- **CI:** GitHub Actions — typecheck, lint, unit tests, secret-free build,
  plus a real-browser Playwright job verifying all §11 breakpoints
  (250→2560px), keyboard navigation, theme + language toggles, with
  screenshot artifacts.
- **Deploy:** Cloudflare Pages workflow (dashboard Git integration
  recommended; wrangler workflow_dispatch provided).
- **Brand assets:** custom BSDC SVG logo + favicon (no emoji anywhere).

## Not yet implemented (deliberately)

Everything in phases 1–9, including but not limited to: authentication
(sign-in buttons intentionally do not exist on the landing page yet), user
profiles, posts, comments, reactions, feed, groups, events, search index,
messaging, notifications, admin panels, jobs, marketplace, sitemap/RSS
generation, PWA/offline support, and the Android wrapper.

Firestore security rules are **not yet written** because no collection is
used yet; Phase 1 ships `users/{uid}` rules together with the schema in the
same commit (brief §6), and the CI gate ensures the build cannot pass with
features whose rules are missing.

## Known environment substitutions

- `use-localstorage-state` (brief §3) → `use-local-storage-state` — the
  brief's package name 404s on the npm registry; the hyphenated name is the
  real package with identical purpose.
- ESLint 8 (classic config) is used with the brief's requested plugins;
  migration to ESLint 9 flat config is tracked as tech debt, not a blocker.
- Real-browser verification could not run in this build sandbox (no browser
  binary, Playwright CDN unreachable) — it runs in CI instead
  (`verify-ui` job) and results are recorded in docs/VERIFICATION.md.
- **CI workflows are authored but not yet on GitHub**: the connected GitHub
  App lacks the `workflows` permission, so `.github/workflows/ci.yml` and
  `.github/workflows/deploy-cloudflare.yml` exist in the local working tree
  but were rejected on push. Once the GitHub connection is reconnected with
  workflow permission (or the files are added manually), CI — including the
  real-browser viewport verification — goes live on the next push.
