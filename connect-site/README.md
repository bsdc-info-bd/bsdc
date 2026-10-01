# BSDC Corporate Live Chat

- **Folder**: `connect-site/`
- **Cloudflare Pages project**: `bsdc-connect`
- **Domain**: connect.live.chat.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 16 of the 20-response build plan

Realtime staff chat on the bsdc-second Realtime Database: topic channels, DMs, file sharing, presence, typing, unread counts, search, pinned messages, escalation pings and shift handoff notes.

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
