# BSDC — Bangladesh Software Development Community

An open social + professional platform for Bangladeshi and global software
developers: the social graph of a network, the publishing of a developer
blog platform, the communities of a forum, and the Q&A of an expertise
network — in one product, with **Bangla and English as co-equal languages**.

An initiative by **RRC Development** · Founder & CEO: Rizwan Rahim Chowdhury

- Contact: hello@bsdc.info.bd · bsdc.rrc@gmail.com
- Domains: https://www.bsdc.info.bd · https://bsdc.pages.dev
- Repo: github.com/bsdc-info-bd/bsdc (private recommended — see docs/SECURITY.md)

## Status

Read **docs/STATUS.md** — it is the single source of truth for what is
implemented (verified) vs. explicitly not yet implemented. Phase 0
(Foundation) is shipped and verified; the build proceeds phase by phase per
the master brief, with no faked features and no demo data.

## Stack

React 18 + Vite 5 + TypeScript (strict) · Tailwind CSS (250px-first named
breakpoints, dark/light themes) · react-router · i18next (bn/en) · Firebase
(Auth, Firestore, Realtime Database, Storage, Cloud Functions) · Cloudflare
Pages · Cloudinary · OneSignal · Capacitor (Android, Phase 8).

## Scripts

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Dev server (binds 0.0.0.0:5173)                        |
| `npm run build`     | Typecheck + production build → `dist/`                 |
| `npm run preview`   | Serve the production build locally                     |
| `npm test`          | Vitest unit suite                                      |
| `npm run lint`      | ESLint (TS, react-hooks, jsx-a11y), zero warnings      |
| `npm run typecheck` | Strict TS across app + configs                         |
| `npm run verify:ui` | Playwright: 250→2560px overflow, keyboard, i18n, theme |

## Repository layout

```
src/
  components/   UI + layout + brand (SVG logo, no emoji in UI)
  hooks/        theme, document meta
  i18n/         locales/en.json + locales/bn.json (parity-tested)
  lib/          env access, firebase (lazy), utils, roadmap
  pages/        landing, not-found, not-yet-implemented
docs/           STATUS · VERIFICATION · SETUP · SECURITY
firebase/       rules & indexes (added with Phase 1 schema)
scripts/        verify-viewports.mjs (real-browser checks)
```

## License

Boost Software License 1.0 (see `LICENSE`).
