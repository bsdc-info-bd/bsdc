# BSDC Setup Guide

What the coding agent did vs. what requires the project owner's console
access. Nothing here can be faked by code — these are account-side actions.

## Local development (already verified working)

```bash
npm install
cp .env.example .env   # fill values (client-safe identifiers from the brief)
npm run dev            # http://localhost:5173
npm test               # unit tests
npm run verify:ui      # real-browser viewport checks (needs: npx playwright install chromium)
```

Node 20+ (repo pins 22 via `.nvmrc`).

## Firebase console — owner actions required for Phase 1

Project `bsdc-bd` exists. Before Phase 1 (Identity) can be _end-to-end_
verified, the owner must:

1. Enable Authentication providers: Google, GitHub, Yahoo, Email/Password.
2. Add authorized domains: `localhost`, `bsdc.pages.dev`,
   `www.bsdc.info.bd`.
3. Create the Firestore database (production mode — rules ship as code in
   the same commit as the first collection schema).
4. Enable the Realtime Database at the asia-southeast1 instance (already
   provisioned per brief) with locked-down default rules until Phase 4.
5. Register a web app if the given `appId` is not already a web app — the
   config in Appendix F is already wired via `.env`.
6. Enable **App Check** (reCAPTCHA Enterprise / v3) before production.
7. Grant admin: set custom claim `{ role: 'admin' }` on the UID of
   rahimchawdhury63@gmail.com (script ships with Phase 1's claims tooling —
   never a hardcoded password check).

## Cloudflare Pages — owner actions

1. Recommended: Dashboard → Pages → Create project → connect
   `bsdc-info-bd/bsdc`, production branch `main`.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables (production + preview): all `VITE_*` values from
     `.env.example` filled in (client-safe values only).
2. Alternative: the `Deploy to Cloudflare Pages` GitHub workflow
   (workflow_dispatch) using secrets `CLOUDFLARE_API_TOKEN` +
   `CLOUDFLARE_ACCOUNT_ID`.
3. Connect `www.bsdc.info.bd` as custom domain once the project exists.

The repo stays private-first (see docs/SECURITY.md) — flip it before
connecting anything that references real identifiers publicly.

## CI

GitHub Actions runs on every push to `main`/`arena/**` and PRs:

- `verify` job: typecheck, lint, unit tests, secret-free build.
- `verify-ui` job: Playwright — all §11 breakpoints (250→2560px) checked
  for horizontal overflow in a real Chromium, keyboard navigation, Bangla
  toggle, dark mode, zero-console-error gate; screenshots uploaded as
  artifacts.

## OneSignal / Cloudinary (Phases 2 & 4)

- Web setup (OneSignal Web Push, App ID `5f367dc9-…`): Phase 4, with the
  REST key stored via `firebase functions:secrets:set` — never client-side.
- Cloudinary: only cloud name `dpemuwrpz` + preset `bsdc_unsigned` are
  referenced client-side (Phase 2 composer).
