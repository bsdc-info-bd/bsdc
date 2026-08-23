# BSDC — Bangladesh Software Development Community

**The Pride of Bangladesh — Where Developers Unite**

> **LEGAL NOTICE — PROPRIETARY SOFTWARE**
> Copyright (c) 2026 RRC Development (Rizwan Rahim Chowdhury Development). All rights reserved.
> This source code is PROPRIETARY and CONFIDENTIAL. Unauthorized copying, modification, distribution,
> or deployment of this software is strictly prohibited. The ONLY authorized production deployment is
> **https://www.bsdc.info.bd** operated by RRC Development. See [LICENSE](./LICENSE). Licensing
> requests: **hello@bsdc.info.bd** / **bsdc.rrc@gmail.com**.

| | |
|---|---|
| **Platform** | https://www.bsdc.info.bd (production) · https://bsdc.pages.dev (staging) |
| **Repository** | https://github.com/bsdc-info-bd/bsdc |
| **Founder & CEO / Super Admin** | Rizwan Rahim Chowdhury — rahimchawdhury63@gmail.com |
| **Parent organization** | RRC Development — https://rrc.cloud.bsdc.info.bd |
| **Sister initiative** | DebateSylhetBD — https://debatesylhetbd.onrender.com/ |
| **Emails** | hello@bsdc.info.bd · bsdc.rrc@gmail.com |

---

## What is BSDC?

BSDC is a production-grade developer social platform for Bangladesh — a single home where
developers publish articles, ask questions, share code snippets, showcase projects, find jobs,
buy and sell in a marketplace, chat in real time, join groups, earn BSDC points, register
official software licenses, and grow an audience through the Creator Program — in **Bangla and
English**, from a 250px budget phone to a 4K display.

## Feature map

| System | What works |
|---|---|
| **Auth** | Google, GitHub, Yahoo + Email/Password with verification, password reset, banned-user gate, auto profile creation, unique username reservation, superadmin bootstrap for the founder email |
| **Posting** | 11 post types: text, image (10-image grid), blog, Q&A (accepted answers), code snippets (Monaco, 50+ languages), docs, wiki (revision log), stories (24h), project showcases, job postings, notices + polls (2–10 options, anonymous mode) |
| **Feed** | Personalized ranking — recency 30%, engagement 25%, author authority 15%, relevance 15%, social proximity 10%, location 5% — plus Latest, Trending (velocity), Following. 100% real data; empty platform ⇒ encouraging empty states |
| **Social** | 7 SVG reactions, threaded comments (5 levels), shares, bookmarks/reading list, follow system, @mentions with notifications, #tags, reports |
| **Real-time chat** | Firebase RTDB: direct + group + channel chats, typing indicators, presence, read receipts, image & code messages, replies, edits, delete for me/everyone, reactions, pinned messages, message search, unread badges |
| **Notifications** | Real-time in-app (14 types), unread badge, mark read/all, sound chime, OneSignal web push |
| **Points economy** | Earn (login, posts, reactions, comments, accepted answers, profile, referral), transfer to users live, QR-code transfer payloads, transaction history, levels, leaderboard |
| **Groups** | Public/closed/secret, roles, members, rules, group posts |
| **Marketplace** | Listings with images/price/condition, admin approval queue, contact seller (opens DM), mark sold |
| **Licenses** | Software registration → admin review → BSDC-YYYY-XXXXX license ID, QR verification page, downloadable PDF certificate |
| **Creator Program** | 100K/1M/10M follower milestones, application form (legal name, NID, portfolio), admin review queue, creator badge + 2x feed boost |
| **Events** | Virtual/in-person, RSVP, .ics calendar export |
| **Admin panel** | Live dashboard (recharts), user management (tanstack table, roles, verify, ban, grant points, direct notify), content management (pin/feature/hide/delete), moderation queue, deep analytics, branded PDF reports (jsPDF + QR), ads manager (CRM/CPC/CPA/CPV + 11 models), broadcast, audit logs, database browser, system settings + feature flags, launch-date management with sitemap/RSS export |
| **Moderator panel** | Report queue with priorities, warn/hide/resolve/dismiss, shift clock-in/out, moderation guidelines, personal performance |
| **SEO** | Per-page titles/descriptions/keywords, canonical URLs, OG + Twitter cards, JSON-LD (WebSite, Organization, Person, ProfilePage, BlogPosting, QAPage, JobPosting, Event, SoftwareApplication, Product, ItemList, FAQPage, BreadcrumbList, WebPage), auto SEO fields on posts, sitemap.xml + RSS/Atom/News feeds, robots.txt, breadcrumbs on every page |
| **i18n** | Full English + Bangla UI via i18next, one-tap toggle, Bangla numerals |
| **Theming** | Light/dark with pre-paint bootstrap (no flash), persisted |
| **PWA** | vite-plugin-pwa, offline fallback, cached media, installable manifest |
| **Branding** | 100+ live SVG brand assets (logos, covers, promo banners, ID cards, certificates, badges, T-shirts, splash screens) at `/branding` |

## Tech stack

React 18 · TypeScript (strict) · Vite 6 · TailwindCSS 3 · Zustand · TanStack Query + Table ·
React Router 6 (lazy routes) · react-hook-form + zod · Radix UI · cmdk · sonner · recharts ·
Monaco Editor · react-markdown (+GFM, KaTeX, highlight.js, sanitize) · lucide-react (SVG only —
zero emojis) · Firebase (Auth, Firestore, Realtime DB, Storage) · Cloudinary (important images) ·
ImgBB (casual images) · OneSignal (push) · jsPDF + qrcode · FlexSearch · dayjs · i18next ·
Capacitor (Android) · Cloudflare Pages hosting (no Workers).

## Project structure

```
src/
  config/        firebase, cloudinary, imgbb, onesignal, seo, constants
  lib/           firestore, realtime, data, auth, upload, points, feed-algorithm,
                 notifications, search, qr/pdf/sitemap/rss generators, utils
  hooks/         useAuth, useFeed, useChat, useNotifications, useSearch, useAdminData, ...
  stores/        authStore, uiStore (zustand)
  components/    ui/ layout/ feed/ post/ profile/ chat/ search/ seo/ admin/ branding/ common/
  pages/         all public pages + admin/ + mod/
  i18n/          en.json, bn.json, i18n.ts
  types/         user, post, chat, domain, common
  styles/        globals, animations, fabric, responsive CSS
functions/       Firebase Cloud Functions (superadmin claims, hourly cleanup, sitemap)
public/          icons, robots.txt, sitemap.xml, _redirects, _headers, OneSignalSDKWorker.js
scripts/         generate-icons.mjs (dependency-free brand icon rasterizer)
```

## Getting started

```bash
npm install
cp .env.example .env      # fill in keys (Firebase, Cloudinary, ImgBB, OneSignal)
npm run dev               # http://localhost:5173
```

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build + PWA |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint (zero warnings policy) |
| `npm run typecheck` | TypeScript strict check only |
| `npm test` | Vitest unit suite |

## Firebase console setup (one-time)

1. **Authentication → Sign-in method**: enable Google, GitHub, Yahoo and Email/Password.
   Add `localhost` and `bsdc.pages.dev`, `www.bsdc.info.bd` to authorized domains.
2. **Firestore → Rules**: paste [`firestore.rules`](./firestore.rules); deploy indexes from
   [`firestore.indexes.json`](./firestore.indexes.json).
3. **Realtime Database**: create it in `asia-southeast1`; rules should require auth for writes.
4. **Storage**: paste [`storage.rules`](./storage.rules) (overflow only — media goes to
   Cloudinary/ImgBB).
5. **Superadmin**: sign in once with **rahimchawdhury63@gmail.com** — the account is
   automatically granted the `superadmin` role (client bootstrap + optional Cloud Function
   `onUserCreate` in [`functions/`](./functions) for server-side custom claims).
6. Optional: deploy Cloud Functions (`cd functions && npm i && npm run deploy`) for hourly
   story cleanup, scheduled-post publishing and crawler-facing `/sitemap` XML.

## Deployment (Cloudflare Pages)

- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Environment**: all `VITE_*` variables from `.env.example`
- `public/_redirects` handles SPA routing (`/* /index.html 200`)
- Connect custom domain `bsdc.info.bd` in the Pages dashboard
- No Cloudflare Workers are used anywhere

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full runbook and
[VERIFICATION.md](./VERIFICATION.md) for the QA checklist and results.

## Android (Capacitor)

```bash
npm i @capacitor/core @capacitor/cli @capacitor/camera @capacitor/filesystem \
      @capacitor/push-notifications @capacitor/splash-screen @capacitor/status-bar
npm run build && npx cap add android && npx cap sync android
cd android && ./gradlew assembleRelease
```

Configuration lives in [`capacitor.config.ts`](./capacitor.config.ts).

## Security & privacy

- Strict, role-based Firestore rules (`superadmin > admin > manager > moderator > verified > user > restricted > banned`)
- XSS-safe rendering (rehype-sanitize + DOMPurify-grade schema), Markdown is sanitized everywhere
- Client env contains only public web keys; the Cloudinary **API secret is never** shipped
- GDPR data export (JSON/CSV) and account deletion in Settings
- All admin/mod actions are audit-logged

---

Built with pride by **RRC Development** — Founder & CEO **Rizwan Rahim Chowdhury**.
*BSDC — The Pride of Bangladesh. Zero errors. Zero shortcuts. Zero compromises.*
