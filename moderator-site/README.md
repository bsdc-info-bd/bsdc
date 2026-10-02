# BSDC Moderator Panel

- **Folder**: `moderator-site/`
- **Cloudflare Pages project**: `bsdc-mod`
- **Domain**: moderator.corporate.bsdc.info.bd
- **Access**: Staff only (moderator+)
- **Delivered in**: Response 14 of the 20-response build plan

The 160-feature moderation suite: report triage queues, removals with reasons, warnings, mutes, shadowbans, suspensions, appeals, bot and multi-account detection, revision inspection and moderation analytics.

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
