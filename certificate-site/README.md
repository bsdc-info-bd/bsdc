# BSDC Certificate Generator

- **Folder**: `certificate-site/`
- **Cloudflare Pages project**: `bsdc-cert`
- **Domain**: generate.certificate.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 17 of the 20-response build plan

Editable online certificates: template picker, theme editor, CEO signature embedding, security code and ID number, live preview, verification QR, public link, PDF download, CSV batch generation and a certificate registry.

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
