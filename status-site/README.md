# BSDC Live Status

- **Folder**: `status-site/`
- **Cloudflare Pages project**: `bsdc-status`
- **Domain**: status.site.main.bsdc.info.bd
- **Access**: Staff view (public-grade page)
- **Delivered in**: Response 16 of the 20-response build plan

Live status of the main site, all corporate apps and every dependency (Supabase, both Firebase projects, Cloudinary, imgbb, OneSignal, FCM, formsubmit), with incidents, 90-day uptime bars, maintenance notices and update subscriptions.

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
