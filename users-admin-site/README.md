# BSDC Admin User Management

- **Folder**: `users-admin-site/`
- **Cloudflare Pages project**: `bsdc-uadmin`
- **Domain**: users.admin.main.bsdc.info.bd
- **Access**: Staff only (owner)
- **Delivered in**: Response 16 of the 20-response build plan

Register and manage administrators: invite and credential issuance, roles and departments, full profiles, downloadable CVs, BSDC-branded QR-verified admin ID cards, activity history and security policies.

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
