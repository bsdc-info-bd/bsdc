# BSDC Main Admin Panel

- **Folder**: `admin-site/`
- **Cloudflare Pages project**: `bsdc-admin`
- **Domain**: admin.corporate.main.bsdc.info.bd
- **Access**: Staff only (manager and above; branding is administrators only)
- **Delivered in**: Response 18 of the 20-response build plan

The SEO centre and the branding studio: everything the site tells search engines, and everything a visitor sees of its identity.

## What it contains

- **Pages** — the metadata any path on the site is currently serving, resolved
  by the same `seo_for_path()` the edge calls, with a search-result preview,
  a list of what is wrong with it, and an override stored against the
  canonical path.
- **Redirects** — moving a URL, with chains and loops refused before the
  round trip and again by `set_redirect()`, and hit counts so a redirect that
  earns nothing can be retired.
- **Sitemap** — how many public URLs exist, section by section, counted with
  the same conditions the pages use.
- **Branding** — the palette, checked for WCAG contrast here and again in
  Postgres, with a wordmark drawn from the tokens and a theme that goes live
  only when an administrator says so.
- **Approvals** — the two review queues, shops and campaigns, worked oldest
  first, with a refusal that has to carry a reason the owner will read.
- **Campaigns** — the campaign builder. Staff choose the advertiser, the bid,
  the budget and the dates; the form checks every constraint the table enforces
  and shows what the budget actually buys, computed with the same integer
  truncation the wallet charges with (`bsdc.ad_event_cost`, and `t51` holds the
  three implementations of that arithmetic to each other). The owner is issued
  an account with `scripts/issue-advertiser.mjs` and reads their own
  performance from `main-site/ads`; they can pause and resume, and edit copy,
  but cannot create a campaign, change a bid, change a budget or top up a
  wallet.

The governance centre that the earlier plan sketched for this folder —
command centre, users, content oversight, marketplace, ads and analytics —
ships inside `main-site` under `/admin`, where it shares the session,
permissions and plugin registry with the rest of the platform.

## Stack

Vite 5 + React 18 + TypeScript 5 (strict), compiling `../corporate-kit/src`
through the `@kit` alias like every other corporate console, with its own
`package.json` and `.env.example`. Deployed independently as its own
Cloudflare Pages project.

## Databases

Supabase Postgres (primary SQL) + Firebase Realtime Database (realtime) +
Firestore (small config/cache). Staff apps authenticate against the
`bsdc-second` Firebase project with role claims, master-passkey gating for
destructive actions and writes to the shared `staff_audit_log`.
