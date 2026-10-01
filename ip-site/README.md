# BSDC IP Management

- **Folder**: `ip-site/`
- **Cloudflare Pages project**: `bsdc-ip`
- **Domain**: ip.corporate.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 16 of the 20-response build plan

IP intelligence: per-IP activity, blacklisting, CIDR range blocks, expiry-based bans, geo lookup, VPN and proxy heuristics, multi-account correlation, velocity alerts, allowlist mode and unban workflow.

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
