# BSDC Site Customizer

- **Folder**: `customize-site/`
- **Cloudflare Pages project**: `bsdc-custom`
- **Domain**: customize.site.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 16 of the 20-response build plan

Visual editing of built-in pages, drag-and-drop section ordering, a custom static page builder published to the main site, hero and banner manager, navigation and footer editors, and a sanitized versioned custom CSS/JS injector.

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
