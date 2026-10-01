# BSDC Moderator User Management

- **Folder**: `users-moderator-site/`
- **Cloudflare Pages project**: `bsdc-umod`
- **Domain**: users.moderator.bsdc.info.bd
- **Access**: Staff only (owner/admin)
- **Delivered in**: Response 16 of the 20-response build plan

Register and manage moderators: profiles, downloadable CVs, QR-verified moderator ID cards, shift assignments, performance metrics and full action history.

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
