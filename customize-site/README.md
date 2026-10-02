# BSDC Site Customizer

- **Folder**: `customize-site/`
- **Cloudflare Pages project**: `bsdc-custom`
- **Domain**: customize.site.main.bsdc.info.bd
- **Access**: Staff only
- **Delivered in**: Response 16 of the 20-response build plan

Visual editing of built-in pages, drag-and-drop section ordering, a custom static page builder published to the main site, hero and banner manager, navigation and footer editors, and a sanitized versioned custom CSS/JS injector.

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
