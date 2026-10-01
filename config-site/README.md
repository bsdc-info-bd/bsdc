# BSDC Site Config

- **Folder**: `config-site/`
- **Cloudflare Pages project**: `bsdc-config`
- **Domain**: config.site.main.bsdc.info.bd
- **Access**: Staff only (owner/admin)
- **Delivered in**: Response 16 of the 20-response build plan

Visual editor for every `site_config` key: launch date and launched toggle, theme and language defaults, feed and ranking weights, trending half-lives, marketplace plans, bKash display config, ads rates, legal text, CEO signature upload with auto-crop, maintenance mode and a masked environment inspector.

## Stack

Standalone Vite 5 + React 18 + TypeScript 5 (strict) application with its own
`package.json`, Tailwind config, `functions/` directory for Cloudflare Pages
Functions and its own `.env.example`. No code is shared with other apps — each
app is deployed independently.

## Databases

Supabase Postgres (primary SQL) + Firebase Realtime Database (realtime) +
Firestore (small config/cache). Staff apps authenticate against the
`bsdc-second` Firebase project with role claims, master-passkey gating for
destructive actions and writes to the shared `staff_audit_log`.
