# BSDC IP Management

- **Folder**: `ip-site/`
- **Cloudflare Pages project**: `bsdc-ip`
- **Domain**: ip.corporate.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 16 of the 20-response build plan

IP intelligence: per-IP activity, blacklisting, CIDR range blocks, expiry-based bans, geo lookup, VPN and proxy heuristics, multi-account correlation, velocity alerts, allowlist mode and unban workflow.

## Stack

Vite 5 + React 18 + TypeScript 5 (strict) with its own `package.json`,
`.env.example` and Cloudflare Pages project. Shared code lives in
`../corporate-kit`, which is compiled from source through the `@kit` alias
rather than published as a package, so a change to a shared rule is
type-checked by every console that uses it in the same commit. Styling is one
hand-written stylesheet in the kit: a console should not need a CSS toolchain
to change a colour.

## Databases

Supabase Postgres (primary SQL) + Firebase Realtime Database (realtime) +
Firestore (small config/cache). Staff apps authenticate against the
`bsdc-second` Firebase project with role claims, master-passkey gating for
destructive actions and writes to the shared `staff_audit_log`.
