# BSDC — Bangladesh Software Development Community

The open community platform for Bangladeshi and worldwide software developers.
A platform of **RRC Development** — Rizwan Rahim Chowdhury, CEO.

- Primary site: https://www.bsdc.info.bd
- First deployment: https://bsdc.pages.dev
- Repository: https://github.com/bsdc-info-bd/bsdc
- Contact: hello@bsdc.info.bd · bsdc.rrc@gmail.com

> BSDC is proprietary software. See [LICENSE.md](./LICENSE.md). Unauthorized
> deployment of this project will result in legal action.

## Architecture

One repository, one folder per deployable application. **Every app is a
standalone Vite + React 18 + TypeScript project with its own dependency stack —
no workspaces, no shared packages** — because every app is deployed as its own
Cloudflare Pages project. All apps talk to the same three databases.

| # | Folder | Pages project | Domain | Access |
|---|--------|---------------|--------|--------|
| 1 | `main-site/` | `bsdc` | www.bsdc.info.bd | Public |
| 2 | `admin-site/` | `bsdc-admin` | admin.corporate.main.bsdc.info.bd | Staff |
| 3 | `moderator-site/` | `bsdc-mod` | moderator.corporate.bsdc.info.bd | Staff |
| 4 | `performance-site/` | `bsdc-perf` | performance.site.main.bsdc.info.bd | Staff |
| 5 | `config-site/` | `bsdc-config` | config.site.main.bsdc.info.bd | Staff |
| 6 | `users-admin-site/` | `bsdc-uadmin` | users.admin.main.bsdc.info.bd | Staff |
| 7 | `users-moderator-site/` | `bsdc-umod` | users.moderator.bsdc.info.bd | Staff |
| 8 | `customize-site/` | `bsdc-custom` | customize.site.main.bsdc.info.bd | Staff |
| 9 | `ip-site/` | `bsdc-ip` | ip.corporate.main.bsdc.info.bd | Staff |
| 10 | `status-site/` | `bsdc-status` | status.site.main.bsdc.info.bd | Staff |
| 11 | `connect-site/` | `bsdc-connect` | connect.live.chat.main.bsdc.info.bd | Staff |
| 12 | `certificate-site/` | `bsdc-cert` | generate.certificate.main.bsdc.info.bd | Staff |
| 13 | `vf-site/` | `bsdc-vf` | vf.main.bsdc.info.bd | Public |
| 14 | `notice-site/` | `bsdc-notice` | notice.site.main.bsdc.info.bd | Staff |
| 15 | `android-app/` | — | Capacitor shell, package `bd.info.bsdc.app` | Store |
| 16 | `brand/` | — | Master brand asset library (not deployed) | — |

### Data layer

- **Supabase Postgres** — primary SQL source of truth for every feature.
- **Firebase Realtime Database** — all realtime: chat, presence, typing, counters.
  - `bsdc-bd` powers the main site and Android app.
  - `bsdc-second` powers every corporate/staff app.
- **Firestore** — small runtime config and cache collections only.
- **Cloudinary** — important images, profile pictures, chat PDFs, voice notes.
- **imgbb** — all other user-uploaded images. No video uploads anywhere.
- **OpenStreetMap / Leaflet** — all maps, plus a direct "Open in Google Maps" link.

### Serverless

All serverless logic lives in each app's `functions/` directory as **Cloudflare
Pages Functions** (TypeScript). There are no standalone Cloudflare Workers and no
worker-based SSR. SEO is solved with build-time prerendering plus Pages Functions
endpoints (`/sitemap.xml`, `/rss.xml`, `/robots.txt`).

## Local development

```bash
cd main-site
cp .env.example .env.local   # fill in the public VITE_* values
npm install
npm run brand                # generate favicons, PWA icons and OG images
npm run dev                  # http://localhost:5173
```

Quality gates (must all pass in every app, every time):

```bash
npm run typecheck   # tsc --noEmit, strict
npm run lint        # eslint, zero warnings
npm run test        # vitest
npm run build       # vite build
```

## Environment variables

Every app ships a documented `.env.example`. Public values are prefixed `VITE_`
and are safe to ship in the client bundle. **Server-only secrets are never
committed** — they are entered in Cloudflare Pages → Settings → Environment
Variables (encrypted) and read inside Pages Functions via `context.env`.
See [SECURITY.md](./SECURITY.md) for the secret matrix and rotation runbook.

## Delivery plan

The platform is delivered in 20 build responses (see `docs/delivery-plan.md`).

| Response | Module |
|---|---|
| 1 | Foundation & design system |
| 2 | Authentication & identity |
| 3 | Data core (Supabase / RTDB / Firestore) |
| 4 | Universal composer & content engine |
| 5 | Feed & 4-stage ranking engine |
| 6 | Social graph & interactions |
| 7 | BSDC Messenger |
| 8 | Communities |
| 9 | Jobs, freelance, projects, playground |
| 10 | Search & notifications |
| 11 | Marketplace (customer) |
| 12 | Marketplace (vendor) |
| 13 | Ads system |
| 14 | Admin panel core & plugin system |
| 15 | Admin analytics & PDF reports |
| 16 | Corporate network I |
| 17 | Corporate network II (trust empire) |
| 18 | SEO engine & branding studio |
| 19 | PWA, i18n, Android, performance |
| 20 | Verification, audit & launch |

## Ecosystem link partners (not built here)

rrc.bsdc.info.bd · cloud.bsdc.info.bd · news.bsdc.info.bd · wiki.bsdc.info.bd ·
docs.bsdc.info.bd · rrc.cloud.bsdc.info.bd
