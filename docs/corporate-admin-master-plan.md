# BSDC Corporate Admin Suite — Master Architecture & Overhaul Plan

## 1. Executive Scope

This document defines the unified enterprise architecture, visual design system,
cross-portal federation, interactive CLI engine, live-editing & revision model,
and verification gates for all 14 BSDC web applications (`main-site` plus the
13 federated corporate consoles sharing `@bsdc/corporate-kit`).

Every privileged mutation routes exclusively through security-definer Postgres
RPCs (`bsdc.require_permission(...)` / role checks + explicit `service_role` and
`authenticated` grants), backed by zero-trust `bsdc-second` Firebase identity
verification (`useSession`) and recorded in `public.audit_events`.

---

## 2. 14-Portal Federation Topology

`corporate-kit/src/domain/portals.ts` establishes the single source of truth for
all 14 BSDC applications:

| App ID | Name | Clearance | Shortcut | Dev Port | Production Domain |
|---|---|---|---|---|---|
| `bsdc-admin` | Central Admin & CLI | `admin` | `g a` | `5191` | `admin.corporate.main.bsdc.info.bd` |
| `bsdc-config` | Site Config & History | `admin` | `g g` | `5185` | `config.corporate.main.bsdc.info.bd` |
| `bsdc-custom` | Custom Pages Composer | `admin` | `g p` | `5187` | `customize.corporate.main.bsdc.info.bd` |
| `bsdc-uadmin` | User Governance & Standing | `admin` | `g u` | `5186` | `uadmin.corporate.main.bsdc.info.bd` |
| `bsdc-cert` | Certificate Desk & Studio | `moderator` | `g c` | `5190` | `certificate.corporate.main.bsdc.info.bd` |
| `bsdc-notice` | Official Notice Desk | `moderator` | `g n` | `5193` | `notice.corporate.main.bsdc.info.bd` |
| `bsdc-mod` | Moderation Queue | `moderator` | `g m` | `5182` | `moderator.corporate.main.bsdc.info.bd` |
| `bsdc-umod` | Staff Directory & Shifts | `moderator` | `g d` | `5189` | `umod.corporate.main.bsdc.info.bd` |
| `bsdc-connect` | Staff Connect Channels | `moderator` | `g t` | `5188` | `connect.corporate.main.bsdc.info.bd` |
| `bsdc-ip` | IP Access & Edge Security | `manager` | `g i` | `5184` | `ip.corporate.main.bsdc.info.bd` |
| `bsdc-perf` | Performance & Reports | `admin` | `g e` | `5183` | `performance.corporate.main.bsdc.info.bd` |
| `bsdc-status` | Service Status Board | `public` | `g s` | `5181` | `status.corporate.main.bsdc.info.bd` |
| `bsdc-vf` | Document Verification | `public` | `g v` | `5192` | `vf.corporate.main.bsdc.info.bd` |
| `main-site` | BSDC Community Platform | `public` | `g h` | `5173` | `www.bsdc.info.bd` |

### Dynamic URL Resolution (`resolvePortalHref`)

- `localhost` / `127.0.0.1`: switches to `http://localhost:<devPort>`.
- `<port>-<sandbox>.e2b.app`: switches to `https://<devPort>-<sandbox>.e2b.app`.
- Production / custom hosts: uses canonical `https://...bsdc.info.bd` origin.

### Cross-Portal Navigation Surfaces

1. **`PortalRail` (`corporate-kit/src/ui/PortalRail.tsx`)**: Sticky desktop rail and mobile drawer grouped by domain (`Command & Control`, `Trust & Documents`, `Moderation & People`, `Security & Operations`, `Public Trust`), automatically gated by `canAccessPortal(portal, userRole)`.
2. **`CommandPalette` (`corporate-kit/src/ui/CommandPalette.tsx`)**: Lazy-loaded `Ctrl/Cmd+K` modal supporting fuzzy search across accessible consoles and active console tabs/actions.
3. **Two-Key Chords**: Global `g <key>` listener in `AppShell.tsx` (ignored cleanly when typing inside inputs/textareas/selects).

---

## 3. Cyber-Corporate Design System

Implemented in `corporate-kit/src/ui/styles.css` (`~4.3 KB` gzipped, well under the `40 KB` CI ceiling):

- **Light & Dark Adaptive Tokens**: High-contrast slate-emerald palette (`--c-brand`, `--c-accent`, `--c-surface`, `--c-term-bg`), honoring `prefers-color-scheme` and persisting explicit `system | dark | light` selection via `localStorage`.
- **Fluid 250px to 4K Responsiveness**: Zero fixed 4-digit widths (`min(1360px, 100%)`), fluid grid columns (`minmax(min(100%, 240px), 1fr)`), horizontal-scroll `.kit-tablewrap`, sticky bottom `.kit-bulkbar`, slide-over `.kit-drawer`, and `.kit-split` side-by-side preview panes.
- **Zero Decorative Emojis**: All chrome and portal icons use dedicated crisp inline SVG components (`corporate-kit/src/ui/icons.tsx`).
- **Tabular Numerics & Strict Typography**: `font-variant-numeric: tabular-nums` and `>= 12px` minimum font sizes throughout.
- **Bundle Budget (`<= 250 KB` gzip initial JS)**: Heavy workspaces (`CommandPalette`, `CliConsole`, PDF generators, template studios) load dynamically via `React.lazy` + `Suspense`.

---

## 4. Database Schema & RPC Foundation (`0086_corporate_admin_suite_and_editing.sql`)

Migration `0086` establishes additive tables, columns, triggers, and security-definer RPCs without weakening existing contracts:

1. **Certificate Revisions & Editing**
   - `public.certificate_revisions` + `amend_count` & `last_edited_at` on `public.certificates`.
   - `update_certificate`: edits fields while capturing pre-change snapshot and requiring a mandatory reason.
   - `reissue_certificate`: issues a replacement credential, logs audit link, and increments revision history.
   - `restore_certificate`: lifts revocation with mandatory audit rationale.
   - `bulk_certificate_action`: batch `revoke`, `restore`, or `mark_amendment` across selected IDs.
   - `get_certificate_revisions`: full chronological audit trail per certificate.
   - `save_certificate_template_preset`: manages branded certificate presets (`settings.write`).

2. **Official Notice Revisions & Lifecycle**
   - `public.official_notice_revisions` + `pinned`, `published_at`, `edit_count` on `public.official_notices`.
   - `update_official_notice` & `revert_official_notice`: live split-pane editing and deterministic rollback to any prior revision.
   - `unpublish_official_notice`, `clone_official_notice`, `bulk_notice_action` (`publish`, `unpublish`, `pin`, `unpin`, `delete`).
   - `get_notice_revisions` & `get_notice_ack_roster`: revision history and detailed member acknowledgement roster.

3. **Admin CLI, Telemetry, Audit & Bulk Governance**
   - `public.admin_saved_macros` + `list_admin_macros`, `save_admin_macro`, `delete_admin_macro`.
   - `admin_telemetry_snapshot`: live cross-portal KPIs (`staff_active`, `issued_certificates`, `revoked_certificates`, `live_notices`, `draft_notices`, `active_ip_rules`, `custom_pages_live`, `seo_overrides_count`, `redirects_count`, `unresolved_errors`, `open_incidents`, `audit_events_24h`).
   - `admin_cli_audit_query`: searchable, action-filtered audit stream (`audit.read` + `bsdc.is_staff()`).
   - `bulk_announcement_action`, `bulk_staff_status`, `bulk_seo_delete`, `bulk_redirect_delete`.

---

## 5. Interactive Admin CLI (`admin-site`)

- **Command Grammar & Safety**: Strict verb-noun parser (`cli-engine.ts`) with quoted-argument support, macro expansion (`macro run <name>`), destructive command confirmation (`confirm:` / `--yes` guard), and zero raw SQL execution.
- **Command Families**:
  - `help` / `clear` / `whoami` / `portals` / `open <portal>`
  - `telemetry` / `audit [--action <prefix>] [--limit N]`
  - `approvals list [--status pending]` / `approvals decide <id> <approve|reject>`
  - `cert get <code>` / `cert revoke <code> <reason>` / `cert restore <code> <reason>`
  - `notice list` / `notice publish <slug>` / `notice unpublish <slug>`
  - `ip list` / `config list` / `staff list`
  - `macro list` / `macro save <name> <command>` / `macro run <name>` / `macro rm <name>`
- **UX Features**: Up/Down history navigation, Tab autocomplete with syntax hints, quick macro chips, exportable JSON/CSV output, and every command logged cleanly.

---

## 6. Console-by-Console Capability Matrix

- **`admin-site`**: Live Telemetry Overview + quick cross-portal launcher + slide-over Audit Inspector Drawer; Interactive CLI Console (`CliConsole`); Bulk Governance Workbench (`BulkWorkbench` for announcements, staff, SEO, redirects); Approvals & Campaigns; SEO Pages, Redirects, Sitemap, Branding.
- **`certificate-site`**: Live Edit / Amend modal, Reissue workflow, Restore workflow, Revision History Diff Drawer (highlighting per-field diffs), Multi-Select Bulk Action Bar, CSV export, and Custom Template Studio (guarded by `settings.write` / admin check).
- **`notice-site`**: Live Split-Pane Markdown & Metadata Editor (live preview parity with PDF output), Pin/Unpin/Publish/Unpublish/Clone lifecycle, Revision History & 1-click Revert Drawer, Acknowledgement Roster Drawer + CSV export, and Multi-Select Bulk Bar.
- **`users-admin-site`**: Staff records & ID verification, clearance matrix, standing management, and Bulk Staff Suspend/Reactivate toolbar.
- **`users-moderator-site`**: Instant search across staff directory, department/role filter chips, shift filter, and CSV export.
- **`moderator-site`**: Report queue with severity & SLA aging indicators, repeat-reporter pattern radar, and quick action inspector.
- **`config-site`**: Searchable typed config matrix, live JSON diff against defaults, quick value editor, and revert timeline.
- **`connect-site`**: Channel workspace with unread/activity badges, staff presence indicator, and message search filter.
- **`customize-site`**: Custom page builder with section reordering, live structured preview pane, publish/draft toggles, and JSON export.
- **`ip-site`**: CIDR rule ledger, interactive client-side IP Simulator ("test if `203.0.113.42` matches allow/block/rate rules before saving"), and edge log viewer.
- **`performance-site`**: Core Web Vitals (`LCP/INP/CLS/FCP/TTFB`) telemetry charts/tables, Edge latency, Errors with resolve workflow, Bundle weight monitor, and SHA-256 PDF Snapshot Reports.
- **`status-site` & `vf-site`**: Public cyber-corporate `PublicShell`, 90-day uptime bar strip, live incident timeline, public + signed SHA-256 certificate/notice/report verification, and federated portal discovery.
- **`main-site` (`/admin/*`)**: Cross-console quick-launch hub card linking operators seamlessly to specialized corporate portals with full English (`en.ts`) and Bengali (`bn.ts`) localization parity.

---

## 7. Verification Gates

All changes must satisfy:
1. Database contract proofs (`t20`, `t26`, `t54`, `t55`, `t58`, `rls-proof-run`).
2. `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` across all 17 workspace packages.
3. `node scripts/release-check.mjs` (Prettier formatting, license audit, typecheck/test/build, bundle budget `<= 250 KB` gzip initial JS and `<= 40 KB` gzip CSS).
4. `node scripts/audit.mjs` (`107/107` invariant checks including zero decorative emojis, mobile `250px` responsiveness, CSP/security rules, and test presence across every package).
5. `node scripts/count-registry.mjs` tracking updated feature counts cleanly.
