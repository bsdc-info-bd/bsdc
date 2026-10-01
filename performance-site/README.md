# BSDC Performance Suite

- **Folder**: `performance-site/`
- **Cloudflare Pages project**: `bsdc-perf`
- **Domain**: performance.site.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 18 of the 20-response build plan

Deep system analytics beyond the admin panel: Core Web Vitals RUM, Pages Functions latency, database query performance, client error rates, uptime, bundle-size history, push delivery success and capacity forecasting, all exportable as branded PDF reports.

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
