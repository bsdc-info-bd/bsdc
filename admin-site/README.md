# BSDC Main Admin Panel

- **Folder**: `admin-site/`
- **Cloudflare Pages project**: `bsdc-admin`
- **Domain**: admin.corporate.main.bsdc.info.bd
- **Access**: Staff only (owner/admin)
- **Delivered in**: Response 14-15 of the 20-response build plan

The 500-feature governance centre: command centre, users, content oversight, marketplace, ads network, plugin system, 110 analytics, PDF reports, SEO centre, security, config, branding studio, broadcast and corporate staff management.

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
