# BSDC Verification Portal

- **Folder**: `vf-site/`
- **Cloudflare Pages project**: `bsdc-vf`
- **Domain**: vf.main.bsdc.info.bd
- **Access**: PUBLIC
- **Delivered in**: Response 17 of the 20-response build plan

The trust hub. Verifies every QR code in the ecosystem: licenses, certificates, notices, public reports, ads invoices, vendor orders and staff ID cards, with issuer, date, status, verification counts and shareable result links.

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
