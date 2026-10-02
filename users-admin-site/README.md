# BSDC Admin User Management

- **Folder**: `users-admin-site/`
- **Cloudflare Pages project**: `bsdc-uadmin`
- **Domain**: users.admin.main.bsdc.info.bd
- **Access**: Staff only (owner)
- **Delivered in**: Response 16 of the 20-response build plan

Register and manage administrators: invite and credential issuance, roles and departments, full profiles, downloadable CVs, BSDC-branded QR-verified admin ID cards, activity history and security policies.

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
