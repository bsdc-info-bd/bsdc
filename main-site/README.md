# main-site

The member-facing platform: everything a visitor, a member, a vendor, an
advertiser and an administrator does at `www.bsdc.info.bd`. It is the only
application in this repository that is written for the public, and it is the
one the Android shell wraps.

| | |
| --- | --- |
| Stack | Vite 5, React 18, TypeScript 5 (strict), React Router, React Query, Zustand |
| Data | Supabase Postgres through row-level-secured RPCs; Firebase Realtime Database (`bsdc-bd`) for presence, typing and live counts |
| Hosting | Cloudflare Pages, with Pages Functions for the edge work |
| Dev port | 5173 |

## Running it

```bash
npm install
cp .env.example .env     # then fill it in; nothing works without it
npm run dev
```

Every environment variable is read through `src/lib/env.ts`, which reports a
missing one as a readable "not configured" state rather than crashing the
page. A deployment without Firebase, for example, still serves every public
page; it simply cannot sign anybody in, and says so.

## The gates

```bash
npm run typecheck   # tsc for the app and for functions/
npm run lint        # eslint, zero warnings tolerated
npm run test        # vitest
npm run build       # brand assets, tsc, vite build, prerender
```

`npm run build` is four steps on purpose. It regenerates the brand assets
from two SVGs, typechecks, bundles, and then **prerenders every public route
into real HTML** — each file carrying its own head, its own JSON-LD and a
readable summary inside `#root`. A test asserts that the head written at
build time is byte-identical to the head the running application produces,
because a prerender that drifts from the app is worse than no prerender.

## What lives where

| Path | What it holds |
| --- | --- |
| `src/routes/` | One file per address a visitor can be at |
| `src/components/` | Reusable parts, grouped by the thing they serve |
| `src/lib/` | The rules: feed ranking, search, marketplace, ads, SEO, reports, performance |
| `src/i18n/` | Bangla and English, with key parity enforced by a test |
| `src/styles/` | Tokens, base, the fabric helper layer and component styles |
| `functions/` | Cloudflare Pages Functions: middleware, sitemaps, RSS, brand CSS, the vitals beacon, assetlinks |
| `scripts/` | Brand asset generation and the prerenderer |

## Two rules worth knowing before changing anything

**The browser never holds a privileged key.** Everything reaches Postgres
through the anonymous key and a row-level-security policy, including the
Pages Functions. If a thing cannot be expressed as a policy, it belongs in a
`security definer` function with a permission check, not in a client that
"knows" it is allowed.

**Measurement describes pages, not people.** `src/lib/perf/` collects field
performance with no identifier of any kind, reduces the URL to a route
pattern before the beacon leaves the device, and sends once per page view.
Anything that would attach a measurement to a person does not belong here.
