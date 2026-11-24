# BSDC Admin Suite — Master Upgrade Plan

**Status:** plan of record. Response 1 of 10.
**Scope:** the 13 staff consoles plus the `/admin` area inside `main-site`.
**Measured against:** commit `5967a2e` (`main`, 2026-11-24).

---

## 0. How to read this document

This plan is written to be *executed by somebody who did not write it*. Every
item has an ID that is greppable, a numeric acceptance criterion, and — where
it is a privileged operation — the permission it must demand and the audit row
it must write. Nothing here says "improve the UI". Everything here says what
to build, where it lives, and how a reviewer can tell it was built.

The ten responses are cumulative. Each one ends with a **gate** that must pass
before the next begins.

| Response | Delivers | Roughly |
|---|---|---|
| 1 | This plan: audit of what exists, target architecture, and the full feature inventory | the map |
| 2 | Foundation: the workspace, the kit's new primitives, the design system, the command layer | the ground |
| 3 | Identity, permission, and audit spine — the security core everything else rests on | the spine |
| 4 | `admin-site` — command deck, telemetry, bulk governance, CLI 2.0 | the bridge |
| 5 | `users-admin-site`, `users-moderator-site`, `moderator-site` — people and safety | the people |
| 6 | `certificate-site`, `notice-site` — documents with legal weight | the paper |
| 7 | `config-site`, `customize-site`, `ip-site` — the runtime and the edge | the switches |
| 8 | `performance-site`, `connect-site`, `status-site`, `vf-site` — observability and communication | the signal |
| 9 | Cross-cutting: accessibility, i18n, mobile, offline, performance, test strategy | the finish |
| 10 | Execution: batch order, acceptance matrix, risk register, and the feature ledger | the proof |

---

## 1. The honest starting point

The admin surface is not empty, and that changes what "upgrade" means. It
already has a real permission engine, an audit table, a plugin system, a
working CLI, and fourteen federated consoles. So this is not a greenfield
build; it is the difference between *capable* and *trustworthy*, which is the
only distinction that matters for a console that can suspend a member, revoke
a certificate, or publish an official notice.

### 1.1 What is measured, not assumed

| Surface | Count | Where measured |
|---|---:|---|
| Federated portals | 14 | `corporate-kit/src/domain/portals.ts` |
| Staff consoles with UI (excluding `main-site`) | 13 | one `package.json` each, ports 5181–5193 |
| Admin console screens in the kit | 11 | `docs/feature-registry.md` |
| Screens inside `main-site`'s `/admin` area | 8 | `main-site/src/App.tsx:149-161` |
| Total admin/staff screen source | ~11.6k lines | `admin-site` 5.4k, others 6.2k |
| Database objects (tables + functions) | 481 | `supabase/migrations`, 133 files |
| Privileged RPCs guarded by `require_permission` | 645 functions total, 91 explicit checks | `supabase/migrations/*.sql` |
| Distinct permissions in use | 11 | `require_permission(...)` call sites |
| Roles | 7 | `bsdc_role` enum, `0001_core_schema.sql:74` |
| Feature/plugin flags seeded | 32 | `0024_admin.sql` |
| Audit columns | 7 | `audit_log`, `0001_core_schema.sql:289` |

### 1.2 The eleven gaps that actually matter

These were found by reading the code, not by imagining it. Each becomes work
later in this plan; none is cosmetic.

**G1 — `ip_hash` is a column nothing ever fills.** `audit_log.ip_hash` exists
(`0001_core_schema.sql:295`, `not null default ''`) and no function, no edge
handler, and no trigger ever writes anything but the default. An audit row
therefore cannot answer "was this the same operator on a different network?"
That is a question every real incident review asks first.

**G2 — the permission table has no writer.** `role_permissions` is read by
`bsdc.has_permission()` on every privileged call, seeded twice by migration
(`0024`, `0028`), and its `insert/update/delete` is revoked from `authenticated`
(`0025_admin_rls.sql:35`). There is no RPC to grant a permission, so the only
way to change who can do what is to ship a migration. The capability exists;
the control of it does not. This is the single largest structural gap.

**G3 — audit rows do not record what changed.** `admin_audit` and
`admin_cli_audit_query` return action, subject, and metadata, but the shape is
free-form JSON and there is no before/after convention. A reviewer asking "what
did this suspension change" has to infer it from prose.

**G4 — there is no reason field enforced on destructive acts.** Some RPCs take
a reason (certificate edits do). Others — suspend, hide, delete — do not. Two
privileged paths with different evidentiary standards is worse than one low
standard, because it implies a policy that does not exist.

**G5 — offline and stale-build recovery was just added to `main-site` only.**
The fix in `5967a2e` protects the member site. The thirteen staff consoles
still show a blank screen when a deploy lands under an open tab. In a console
that can revoke a certificate, a blank screen at the wrong moment is a
heartbeat problem, not a cosmetic one.

**G6 — the admin sites have no browser test at all.** `main-site` has three
browser suites and CI runs them. The consoles that perform destructive work
have unit tests over their rules and nothing that proves a screen opens or a
button does what it says.

**G7 — the bundle budget check skips every console.** `scripts/audit.mjs` F-01
only measures an app whose `dist/` exists, and CI builds only `main-site`, so
`bundleReport` never contains a console. F-01 has been "passing" over an empty
set — it even asserts `length > 0`, which is why it currently reports as a
failure rather than a vacuous pass. Either way, no console has ever been
measured against the 250 KB ceiling.

**G8 — five permission checks cover eleven permissions.** `people.read`,
`people.role`, `people.suspend`, `moderation.read`, `moderation.resolve`,
`content.hide`, `audit.read`, `plugins.read`, `plugins.write`, `settings.read`,
`settings.write` — but action-level granularity is missing for the operations
that most need it: issuing a certificate, publishing a notice, changing an IP
rule, transferring ownership. Those are gated by role rank, not permission.

**G9 — no session or device governance.** A staff member's console session
cannot be listed, revoked, or limited. `provision_staff` exists; "who is signed
in right now, from where, and sign them out" does not.

**G10 — the CLI executes without a dry-run primitive.** `cli-engine.ts` has a
confirmation guard for destructive verbs, which is good, but no `--dry-run`
that resolves what a command *would* do and prints it. The one thing an
operator wants before a bulk action is the diff.

**G11 — `main-site`'s `/admin` screens and the federated consoles duplicate
work.** Both `main-site/src/routes/AdminPeoplePage.tsx` and
`users-admin-site/src/People.tsx` manage people; the first is 8 screens of
React inside the member bundle, the second is the console for it. Two UIs over
one domain means two behaviours, and the permission checks are not provably the
same.

---

## 2. Target architecture

### 2.1 One shell, thirteen occupants

The kit already owns the shell (`corporate-kit/src/ui/AppShell.tsx`,
`PortalRail`, `CommandPalette`, `useThemePreference`). The upgrade keeps that
and makes the shell do four things it does not do now: remember where you
were, survive a deploy, hold a live session, and tell you what you are
allowed to do before you try it.

```
consoles/                     the 13 staff apps — thin, one screen each
  ├─ src/App.tsx              tabs, nothing else
  └─ src/model.ts             pure rules, no IO

corporate-kit/                shared by all of them
  ├─ ui/                      shell, primitives, charts, tables, forms
  ├─ data/                    session, rpc, realtime, offline, audit
  └─ domain/                  permissions, portals, staff, brand, ...

supabase/migrations/          the authority; no screen decides anything
```

### 2.2 The rule that governs every decision

**A screen may not be the only thing enforcing a rule.** Every item in this
plan that grants a capability also states the database object that enforces
it. If a feature cannot be enforced in Postgres or in an edge function, it is
a convenience, not a control, and it is labelled as such.

This is already the repo's stated principle (`0024_admin.sql:1-14`); the plan
extends it to the parts that were left out — permissions, reasons, sessions,
and device trust.

### 2.3 The permission model, extended

The current 7 roles × 11 permissions is a good floor and a poor ceiling. The
upgrade keeps roles as *bundles* and makes permissions the unit of authority,
with four additions:

1. **Action-level permissions** for the eleven missing operations
   (`certificate.issue`, `notice.publish`, `ip.rule`, `owner.transfer`,
   `people.session`, `ads.credit`, `market.payout`, `brand.publish`,
   `seo.publish`, `report.export`, `plugin.rollout`).
2. **A writer**: `admin_set_permission(role, permission, granted, reason)` —
   the RPC that closes G2, itself demanding `permissions.write` and auditing
   the before/after.
3. **Scope**: a permission may be granted over a subset (a category, a
   workspace, a region), so "moderator for the jobs board" stops being
   impossible.
4. **Time**: a grant may expire, which is how a temporary escalation gets
   handed to somebody at 02:00 and removed at 06:00 without a deploy.

### 2.4 The audit model, extended

`audit_log` gains four columns and one rule:

| Column | Purpose |
|---|---|
| `request_id` | ties every row written during one operator action together |
| `reason` | the operator's words, mandatory for every destructive verb |
| `diff` | before/after, JSON, written by a shared helper not by each RPC |
| `device` | coarse client class and a hash — the answer to G1 |

The rule: **an action that changes state without writing a row fails.** Not a
convention — a constraint, enforced by a trigger that reads a
transaction-local setting the RPC must have set.

### 2.5 Offline and stale-build parity

The `chunk-recovery.ts` module written for `main-site` in `5967a2e` moves into
`corporate-kit/data/` and every console adopts it, with the same guarantees:
one silent reload per build, never offline, never twice in two seconds, and a
real error screen after that. A duty operator's console must not go blank
because a deploy landed.

---

## 3. Feature inventory

Every feature below is numbered `A-###` and carries a tier:

- **T1 — control.** The platform is unsafe without it.
- **T2 — operation.** The platform is slow, blind, or error-prone without it.
- **T3 — craft.** The platform is unpleasant without it.

Counts by tier are in §3.4; the ledger that proves each one is delivered lives
in Response 10.

### 3.1 The inventory itself

#### Kit primitives and platform services — 92 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-306` | 1 | Audit anomaly detection: unusual volume per actor | A spike above the rolling baseline is flagged |
| `A-307` | 1 | Audit detail shows before, after and the human reason | A reviewer can reconstruct the change without the UI |
| `A-308` | 1 | Audit export for a date range, signed with a hash | Export carries a SHA-256 the desk can re-verify |
| `A-309` | 1 | Audit helper writes request_id, reason, diff and device | One action's rows share one request_id |
| `A-310` | 1 | Audit retention policy with archive beyond 24 months | Rows older than the window move to an archive table |
| `A-311` | 1 | Audit row is mandatory for state change (trigger) | An RPC that changes state without a row fails the transaction |
| `A-312` | 1 | Audit search by actor, action, subject, request_id, time | Each filter narrows and composes with the others |
| `A-313` | 1 | Audit timeline on every record detail screen | The record's own history without leaving the page |
| `A-314` | 1 | Audit verification endpoint for an exported file | Tampering with one row fails verification |
| `A-315` | 1 | CSP per console with no inline script | Audit E-08 stays green for all 13 |
| `A-316` | 1 | Concurrent-session limit per role | A fourth session for a moderator is refused, oldest offered for sign-out |
| `A-317` | 1 | Confirmation phrase is derived, not hardcoded per screen | One registry drives every modal |
| `A-318` | 1 | Deny-by-default test: an unlisted permission is refused | A random permission string returns false, never true |
| `A-319` | 1 | Device trust labelling: known, new, and new-in-last-24h | A first-seen device is labelled without a lookup |
| `A-320` | 1 | Diff is computed, not hand-written, for table-backed edits | Changing 2 of 8 fields records exactly those 2 |
| `A-321` | 1 | Effective-permission preview: "what can this role do now" | Answers for all 7 roles from one query |
| `A-322` | 1 | Escalation approval queue | Pending escalations are one screen, oldest first |
| `A-323` | 1 | Escalation auto-expiry notification | Approver and holder are both told when it lapses |
| `A-324` | 1 | Expiring grant with automatic revocation | A grant with ttl 4h is gone 4h later without a cron |
| `A-325` | 1 | Last-owner guard: the final owner cannot be demoted | Attempt raises, and the count is asserted after |
| `A-326` | 1 | Lockout after repeated permission refusals | Ten refusals in a minute pauses that operator's writes |
| `A-327` | 1 | Permission audit: every check failure is counted | Refusals appear in telemetry grouped by permission |
| `A-328` | 1 | Permission change history with revert | Any prior state can be restored as a new, audited row |
| `A-329` | 1 | Permission change requires permissions.write and a reason | Without either, the RPC raises and nothing is written |
| `A-330` | 1 | Permission matrix screen with role columns and diff-before-save | Saving shows the exact rows that changed |
| `A-331` | 1 | Permission-denied screen that explains the exact missing permission | Names the permission and who can grant it |
| `A-332` | 1 | Re-authentication window for destructive verbs | A verb performed 20 minutes after sign-in asks again |
| `A-333` | 1 | Reason length floor and ceiling enforced | Under 10 or over 500 characters is refused |
| `A-334` | 1 | Revoke all sessions for a staff member (people.session) | Requires the permission and writes an audit row |
| `A-335` | 1 | Revoke one session, revoke all others | Revoked session fails its next request |
| `A-336` | 1 | Role rank guard: nobody may grant above their own rank | A manager granting admin is refused server-side |
| `A-337` | 1 | Scoped grant: permission limited to a scope key | A scoped grant answers has_permission only inside its scope |
| `A-338` | 1 | Security review checklist screen listing open findings | Every known gap has an owner and a date |
| `A-339` | 1 | Self-promotion guard proven by test | An admin cannot change their own role |
| `A-340` | 1 | Separation of duties: grant and approve are different permissions | One operator cannot both request and approve an escalation |
| `A-341` | 1 | Session fixation guard on every privilege change | Privilege change rotates the session |
| `A-342` | 1 | Session list: device, coarse location, last seen, current | Shows every live session for the signed-in operator |
| `A-343` | 1 | Sign-in anomaly notice to the operator | New device signs in, the operator is told once |
| `A-344` | 1 | Step-up confirmation for the 12 most destructive verbs | Each verb names its confirmation phrase and requires it |
| `A-345` | 1 | Temporary escalation with requester, approver and expiry | The grant row names both people and the deadline |
| `A-346` | 1 | Zero-trust token check on every console entry | An invalid token cannot render a screen, even briefly |
| `A-347` | 1 | admin_set_permission(role, permission, granted, reason) | Grant or revoke from the UI, audited with before/after |
| `A-348` | 2 | Announcement banner channel for staff messages | Dismissal is per-staff, not per-browser |
| `A-349` | 2 | Background refresh indicator per panel | Freshness is visible without a spinner blocking the data |
| `A-350` | 2 | Breadcrumb that reflects the real navigation stack | Back through a deep link returns to where you started |
| `A-351` | 2 | Bulk action bar with dry-run preview | Preview lists every affected id before the call |
| `A-352` | 2 | CSV and JSON export of the current view | Export contains exactly the filtered rows, not the page |
| `A-353` | 2 | Chart primitives: line, bar, sparkline, heatmap, each with a table twin | Screen reader reads the twin; no chart without it |
| `A-354` | 2 | Client-side validation mirroring the database check | Same rule text as the constraint it mirrors |
| `A-355` | 2 | Column show/hide with per-screen persistence | Choice survives reload and is per-console |
| `A-356` | 2 | Command palette scoped to the current console's actions | Every screen action is reachable by name |
| `A-357` | 2 | Copy-to-clipboard for every id, code and URL | Copy confirms with a toast and works on http localhost |
| `A-358` | 2 | Cross-tab sync so two tabs cannot disagree | Suspend in tab A reflects in tab B without reload |
| `A-359` | 2 | Currency as integer poisha rendered per locale | No float arithmetic anywhere in the render path |
| `A-360` | 2 | DataTable with sticky header, column pinning, resizable columns, and keyboard row traversal | Tab reaches every cell; arrow keys move focus; pin survives reload |
| `A-361` | 2 | Deep link to any record from any console | Same record opens in the same screen across portals |
| `A-362` | 2 | Diff viewer for two JSON or text blobs | Field-level highlight, not a line diff, for JSON |
| `A-363` | 2 | Drawer and dialog with focus trap and return focus | Esc closes; focus returns to the invoking control |
| `A-364` | 2 | Empty state that names the next action | No empty screen without a primary button |
| `A-365` | 2 | Error state that distinguishes retryable from permanent | 429 shows retry-after; 403 shows no retry |
| `A-366` | 2 | Feature-flag gate component with dependency resolution | A child flag cannot render while its parent is off |
| `A-367` | 2 | Form primitives: field, hint, error, char count, dirty guard | Navigating away dirty prompts once |
| `A-368` | 2 | Global search across records the operator may see | Results never include a record they may not |
| `A-369` | 2 | Inline cell editing with optimistic write and rollback | Failed write reverts the cell and surfaces the reason |
| `A-370` | 2 | JSON tree viewer with search and path copy | Search highlights matches; path is copyable |
| `A-371` | 2 | Keyboard shortcut registry with a discoverable help sheet | ? opens the sheet; every binding listed |
| `A-372` | 2 | Loading state that shows shape, not a spinner | Skeleton matches final layout to <2px |
| `A-373` | 2 | Multi-step wizard with resumable draft in localStorage | Reload mid-wizard keeps every field |
| `A-374` | 2 | Mutation queue replayed on reconnect | Queued action runs once, never twice |
| `A-375` | 2 | Number formatting in en and bn digits | 1200 renders as 1,200 and ১,২০০, never mixed |
| `A-376` | 2 | Offline detection with a persistent banner | Banner appears within 1s of losing the network |
| `A-377` | 2 | Optimistic mutation helper with rollback and toast | Failure restores prior state and names the cause |
| `A-378` | 2 | Pinned items for the operator's own working set | Pin, unpin, reorder; capped at 20 |
| `A-379` | 2 | Print stylesheet for any detail view | Ctrl+P produces a usable page without the chrome |
| `A-380` | 2 | Recent items per operator, capped and ordered by use | The list survives sign-out and is private |
| `A-381` | 2 | Reduced-motion respected across all animation | prefers-reduced-motion disables every transition |
| `A-382` | 2 | Relative time rendering that updates without a reload | '2 minutes ago' becomes '3 minutes ago' on its own |
| `A-383` | 2 | Request deduplication within a screen | One network call for two components asking the same thing |
| `A-384` | 2 | Retry with jittered backoff for idempotent reads | Three attempts, then an error naming the attempt count |
| `A-385` | 2 | Rollout percentage respected client-side and server-side | At 10%, a fixed uid is consistently in or out |
| `A-386` | 2 | Row selection with shift-range and select-all-matching | 500 rows selected across pages; bulk bar states the count |
| `A-387` | 2 | Saved views: name, filter, sort, columns, density | A view restores all five exactly; shareable as a URL |
| `A-388` | 2 | Session-expiry handling that preserves the current form | Re-auth returns to the same screen with fields intact |
| `A-389` | 2 | Skeleton, empty, error and populated story for every screen | Four states, four tests per screen |
| `A-390` | 2 | Stale-build recovery adopted from main-site | A deploy under an open console reloads once and keeps the page |
| `A-391` | 2 | Stale-while-revalidate cache for list screens | Cached list paints immediately, refresh shows a subtle badge |
| `A-392` | 2 | Telemetry for console errors, tagged by screen | Every uncaught error carries the screen id |
| `A-393` | 2 | Time-range picker with presets and custom range | Preset and custom agree on the same window |
| `A-394` | 2 | Toast queue with undo for reversible actions | Undo within 8s restores the prior value |
| `A-395` | 2 | URL-as-state: every filter, sort and page is in the query string | Paste URL in a new tab and land on the same view |
| `A-396` | 2 | Virtualised table body for 10,000 rows | 10k rows paint in <120ms; scroll stays 60fps |
| `A-397` | 2 | Workspace switcher for staff who hold two roles | Switching changes the visible permission set |

#### Operations: queues, handover, reviews — 72 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-723` | 1 | A console directory page listing every screen and its permission | Generated, not written |
| `A-724` | 1 | A generic claim/assign engine used by every queue | One implementation, six queues, one test |
| `A-725` | 1 | A glossary of statuses and outcomes | One page |
| `A-726` | 1 | A monthly permission review task assigned to the owner | Recurring and recorded |
| `A-727` | 1 | A named owner for every console | Shown in its footer |
| `A-728` | 1 | A paging policy per queue with a stated response time | Written down |
| `A-729` | 1 | A rota published to staff with a calendar feed | Subscribable |
| `A-730` | 1 | A weekly digest of unresolved items to the owner | Automatic |
| `A-731` | 1 | A weekly operations review template | Filled from the data, not typed |
| `A-732` | 1 | A written decision record for every architecture choice | Dated and linked |
| `A-733` | 1 | Action receipts that survive the session | A receipt is fetchable by id for 90 days |
| `A-734` | 1 | An incident retro action tracker | Closure requires evidence |
| `A-735` | 1 | Bulk action across consoles with one receipt | Receipt spans consoles without leaking ids |
| `A-736` | 1 | Bulk claim of a filtered set | Bounded and atomic |
| `A-737` | 1 | Cross-console notification centre with read state | Per-operator, survives sign-out |
| `A-738` | 1 | Cross-console search that respects every permission | Never returns a record the operator cannot open |
| `A-739` | 1 | Daily briefing: what changed overnight, generated at 06:00 | Names the top five items with links |
| `A-740` | 1 | Escalation ladder configurable per queue | Data, not code |
| `A-741` | 1 | On-call contact sheet reachable without a network call | Cached for the session |
| `A-742` | 1 | Onboarding path for a new moderator with a checklist | Tracked |
| `A-743` | 1 | Operator activity summary for a manager | Per operator, per day, from the audit log |
| `A-744` | 1 | Queue SLO board with breach history | Every breach has a cause and an owner |
| `A-745` | 1 | Queue priority formula published and testable | Weights are data |
| `A-746` | 1 | Reassign with a reason | Both parties notified |
| `A-747` | 1 | Runbook per destructive action, linked from the modal | The modal names the runbook |
| `A-748` | 1 | Runbook per destructive operation, versioned in the repo | Linked from the modal |
| `A-749` | 1 | Saved searches with a name and a share link | Share respects the recipient's permissions |
| `A-750` | 1 | Shift handover: open items, unclaimed, overdue | Prefilled, editable, recorded |
| `A-751` | 1 | Snooze that re-enters the queue at a stated time | Never silently lost |
| `A-752` | 1 | Two-person rule for the five highest-impact actions | Approver cannot be the requester |
| `A-753` | 1 | Unified inbox claim so two operators do not collide | Atomic, refused on the second |
| `A-754` | 1 | Unified inbox: every pending decision across consoles, ranked | One list, one rank, one owner each |
| `A-755` | 1 | Watch a record without claiming it | Digest on change |
| `A-756` | 1 | Watched records with a change digest | A digest names what changed, not that it did |
| `A-757` | 1 | Workload balance view across operators | Open items per person, visualised with a twin |
| `A-758` | 2 | A demo mode with fixtures for training | No production data |
| `A-759` | 2 | A deprecation path for removing a console screen | Redirect and a notice |
| `A-760` | 2 | A new-console checklist for adding a portal | Twelve items, each with a test |
| `A-761` | 2 | A quarterly review of this plan with a status per feature | The ledger is live |
| `A-762` | 2 | A quarterly test of the break-glass path | Evidence recorded |
| `A-763` | 2 | A staff feedback channel routed to the owner | Acknowledged |
| `A-764` | 2 | A tribute for a resolved incident | Optional and recorded |
| `A-765` | 2 | A yearly test of the lockdown path | Evidence recorded |
| `A-766` | 2 | Action replay in dry-run mode for training | Executes nothing, prints the plan |
| `A-767` | 2 | An operator handbook generated from the runbooks | Always current |
| `A-768` | 2 | Auto-balance suggestion | Suggested, never silent |
| `A-769` | 2 | Bookmarks and recent items in one place | Both are private |
| `A-770` | 2 | Changelog of console changes visible to staff | Dated |
| `A-771` | 2 | Command palette scoped to operator preferences | Recents and pins included |
| `A-772` | 2 | Delegate an approval for a defined window | Delegation is audited and expires |
| `A-773` | 2 | Digest email or push per operator at a chosen hour | One digest, no duplicates |
| `A-774` | 2 | Export a personal operations log | Bounded date range, signed |
| `A-775` | 2 | Inline help on every non-obvious field | No field without a hint |
| `A-776` | 2 | Notification routing: which events reach this operator | Per event class |
| `A-777` | 2 | Out-of-office state with a named deputy | Routing follows the deputy |
| `A-778` | 2 | Per-queue SLA policy editor | Policy is data |
| `A-779` | 2 | Preference centre: theme, density, language, timezone, digest | All five persisted per operator |
| `A-780` | 2 | Queue capacity indicator against staff on shift | Shown as a ratio |
| `A-781` | 2 | Queue export of the current filter | Same rows |
| `A-782` | 2 | Queue routing rules by type and availability | Data, not code |
| `A-783` | 2 | Quiet hours for non-critical notifications | Critical always breaks through |
| `A-784` | 2 | Sandbox mode with seeded fixtures for onboarding | No production data reaches the sandbox |
| `A-785` | 2 | Search across the runbooks | From the palette |
| `A-786` | 2 | Stale-item ageing report | Oldest first |
| `A-787` | 2 | Undo for reversible actions across consoles | One window, one undo |
| `A-788` | 3 | A printed morning briefing for a wall display | One page, readable at two metres |
| `A-789` | 3 | A single status vocabulary across all 14 portals | One enum, one translation table |
| `A-790` | 3 | Consistent empty, loading and error states everywhere | Four states, asserted by test count |
| `A-791` | 3 | Keyboard map cheatsheet per console | Printable |
| `A-792` | 3 | Printable one-page cheat sheet per console | Both languages |
| `A-793` | 3 | Queue as a kanban with keyboard move | Accessible |
| `A-794` | 3 | Queue health sparkline | Text twin |

#### Security: permission and session spine — 6 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-925` | 1 | A permission probe at boot, not at first action | The UI does not offer what it cannot do |
| `A-926` | 1 | Every console states its minimum role on entry | Before rendering data |
| `A-927` | 1 | The shell lists the operator's own permissions | No guessing |
| `A-928` | 2 | A denied-action log visible to the operator | What they tried and why it failed |
| `A-929` | 2 | A permission diff on role change preview | Exact set |
| `A-930` | 2 | A permission simulator for 'what if this role had X' | No writes |

#### Communication craft — 12 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-279` | 1 | Both languages per message | Members receive their own |
| `A-280` | 1 | Compose a member-facing message with a template and a preview | Preview is the real renderer |
| `A-281` | 1 | Delivery report per send | Delivered, opened, failed |
| `A-282` | 1 | Send to a named cohort with a reach count before send | Reach is computed, not estimated |
| `A-283` | 1 | Suppression list honoured | A suppressed address is never sent |
| `A-284` | 2 | A/B copy test with a stated winner rule | Rule is published |
| `A-285` | 2 | Bounce and complaint handling | Automatic suppression with a reason |
| `A-286` | 2 | Export a delivery report | Same rows as the screen |
| `A-287` | 2 | Message archive with search | Bounded retention |
| `A-288` | 2 | Schedule a send with a timezone | Timezone is explicit |
| `A-289` | 3 | Preview on a 250px screen | No overflow |
| `A-290` | 3 | Print a sent message | With its send time |

#### Compliance and privacy — 15 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-291` | 1 | Access review: who has which permission, quarterly | Sign-off recorded |
| `A-292` | 1 | Consent and policy version per member | Which version they accepted, when |
| `A-293` | 1 | Data-subject request intake with a lawful basis and a deadline | Deadline counted and shown |
| `A-294` | 1 | Erasure that runs across every table with a proof | Proof lists each table and row count |
| `A-295` | 1 | Export every record held about a member, in one archive | Archive is complete and hashed |
| `A-296` | 1 | Legal hold that blocks deletion and states its scope | Scope is explicit |
| `A-297` | 1 | Policy change log visible to staff | One place, dated |
| `A-298` | 1 | Retention schedule per data class | A row past retention is a work item |
| `A-299` | 2 | Audit of admin-only reads of member data | Reads are logged, not just writes |
| `A-300` | 2 | Breach workflow with a notification timer | Steps and owners listed |
| `A-301` | 2 | Compliance dashboard with every open item | One screen |
| `A-302` | 2 | Retention job report | What was deleted, when, by which rule |
| `A-303` | 2 | Sub-processor register with a review date | Overdue is flagged |
| `A-304` | 3 | Every compliance action links to its runbook | No dead ends |
| `A-305` | 3 | Print a compliance pack for an auditor | One PDF, indexed |

#### Data: analytics, reporting, explorer — 34 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-533` | 1 | A metric definition registry, one entry per metric | Definition is code-reviewed |
| `A-534` | 1 | A read-only SQL explorer over a curated view set | Curated, not arbitrary |
| `A-535` | 1 | Broken link crawl results with a fix action | A redirect can be created from the row |
| `A-536` | 1 | Cohort retention by sign-up week | Any two cohorts comparable |
| `A-537` | 1 | Comparison against the previous period on every headline | Delta with direction |
| `A-538` | 1 | Content inventory with age, owner and last edit | Stale content is a filter |
| `A-539` | 1 | Duplicate content detection across pages | Similarity is stated, not implied |
| `A-540` | 1 | Every number on every screen names its source table or RPC | No metric without provenance |
| `A-541` | 1 | Every number states its time window and freshness | Shown, not implied |
| `A-542` | 1 | Every saved query names a owner and a purpose | Reviewed |
| `A-543` | 1 | Funnel analysis for member onboarding, step by step | Each step's drop-off is stated with a count |
| `A-544` | 1 | Query timeout and row cap | Enforced server-side |
| `A-545` | 1 | Results never leave the console except as a signed export | Export is audited |
| `A-546` | 1 | Search query log with zero-result queries surfaced | Zero-result queries are a work queue |
| `A-547` | 1 | Small-sample warning below a stated floor | Never presents 3 samples as a trend |
| `A-548` | 2 | A chart's data table is reachable by keyboard | Tab into it |
| `A-549` | 2 | A view catalogue with column descriptions | Searchable |
| `A-550` | 2 | Anomaly annotation on a spike | Names the likely cause if known |
| `A-551` | 2 | Attribution report: where new members come from | Source is a dimension, not a guess |
| `A-552` | 2 | Chart a saved query | Same data |
| `A-553` | 2 | Cohort comparison of two date ranges | Both counts and rates |
| `A-554` | 2 | Drill from a chart to a filtered list | One click preserves the window |
| `A-555` | 2 | Engagement score definition published beside the metric | The formula is visible |
| `A-556` | 2 | Export the underlying rows for any chart | Same filter |
| `A-557` | 2 | Query history per operator | Private |
| `A-558` | 2 | Row-level permission respected by every view | Never bypassed |
| `A-559` | 2 | Sankey of where members go after a page | Rendered as a table twin too |
| `A-560` | 2 | Saved analysis with a share link | Share respects permissions |
| `A-561` | 2 | Scheduled report delivery | Weekly, to named recipients |
| `A-562` | 2 | Segment breakdown by cohort, device and locale | Any two combinable |
| `A-563` | 2 | Sparkline cache so a list of 200 rows does not fire 200 queries | One batched call |
| `A-564` | 3 | Charts degrade to text on print | Readable |
| `A-565` | 3 | Export any analysis to CSV with the filter definition | Filter is in the header |
| `A-566` | 3 | Sparkline of any metric in its list row | Text twin present |

#### Documents: certificates and notices — 30 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-567` | 1 | Amend and reissue preserves the chain to the original | Every prior version is reachable and immutable |
| `A-568` | 1 | Certificate PDF is reproducible byte-for-byte from its record | Same record, same SHA-256, twice |
| `A-569` | 1 | Certificate issuance is idempotent per (member, course, attempt) | A double click issues one certificate |
| `A-570` | 1 | Certificate registry search by code, member, course, date | Each filter is indexed |
| `A-571` | 1 | Issue a certificate with a collision-proof verification code | Codes are unique under a 100k-insert concurrency test |
| `A-572` | 1 | Notice acknowledgement roster with who and when | Roster is exportable and complete |
| `A-573` | 1 | Notice pin and priority ordering with an audit row | Pin changes are recorded with the operator |
| `A-574` | 1 | Notice publish requires notice.publish and a scheduled time | A draft cannot be published by a role without it |
| `A-575` | 1 | Notice revert creates a new revision, never rewrites history | Reverting to v3 makes v4 equal to v3 |
| `A-576` | 1 | Notice revision history with a field-level diff | Each revision shows exactly what changed |
| `A-577` | 1 | Notice unpublish with a grace notice to members | Members see it is withdrawn, not that it vanished |
| `A-578` | 1 | Public verification answers in one query without exposing PII | Response carries status, course, date, and nothing else |
| `A-579` | 1 | Restore a revoked certificate with a mandatory rationale | Restore writes a new row, never edits the old |
| `A-580` | 1 | Revoke with a published reason and an effective time | Revocation states why, in both languages |
| `A-581` | 1 | Verification code is check-digit'd so a typo is detectable | One digit wrong is rejected before a lookup |
| `A-582` | 2 | Batch issue from a CSV with a per-row report | Every rejected row states its reason |
| `A-583` | 2 | Bulk download of PDFs with a manifest | Manifest lists every file with its hash |
| `A-584` | 2 | Certificate ledger reconciliation: issued minus revoked | The count on the dashboard equals the ledger |
| `A-585` | 2 | Certificate template studio with token placeholders | Unknown placeholder fails validation at save |
| `A-586` | 2 | Document numbering with a stated scheme and no gaps | The next number is derived, not guessed |
| `A-587` | 2 | Legal hold flag prevents deletion during an investigation | A held record refuses delete with a clear message |
| `A-588` | 2 | Notice audience targeting by role and cohort | Targeting preview states the reach count |
| `A-589` | 2 | Notice delivery status: delivered, read, acknowledged | Three counts that add up to the audience |
| `A-590` | 2 | Notice public page parity with the console preview | Same bytes at the same time |
| `A-591` | 2 | Notice scheduling calendar with conflicts | Two notices at one time are flagged, not blocked silently |
| `A-592` | 2 | Template preview at true print resolution | Preview matches the PDF within 1pt |
| `A-593` | 3 | Both languages on the certificate body | The language follows the member, the code is stable |
| `A-594` | 3 | Certificate QR encodes only the public verification URL | Scanning never leaks an internal id |
| `A-595` | 3 | Notice typography scale validated against the design tokens | No raw hex; contrast audit stays clean |
| `A-596` | 3 | Print-ready stylesheet with bleed and safe margins | Prints correctly on A4 and Letter |

#### Editor craft — 14 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-597` | 1 | Code block with a language selector and a copy button | Copy works on http |
| `A-598` | 1 | Image upload with alt text required | Missing alt blocks publish |
| `A-599` | 1 | Link checker before publish | Dead links block publish |
| `A-600` | 1 | Live word and read-time count | Both languages |
| `A-601` | 1 | Markdown editor with a toolbar that never loses the caret | Selection is preserved |
| `A-602` | 1 | Table builder that emits valid markdown | Round-trips |
| `A-603` | 2 | Autosave with a conflict warning on a second tab | Second tab is told |
| `A-604` | 2 | Diff against the published version before publishing | Field-level for structured content |
| `A-605` | 2 | Find and replace within a document | Regex with a preview of matches |
| `A-606` | 2 | Footnote and anchor support | Anchors stable across revisions |
| `A-607` | 2 | Paste-as-plain-text | Keeps markdown structure |
| `A-608` | 2 | Slash-command menu for blocks | Keyboard reachable |
| `A-609` | 3 | Focus mode that hides the chrome | Esc returns |
| `A-610` | 3 | Readable line length regardless of window | Max measure enforced |

#### Money: wallets, invoices, payouts — 14 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-709` | 1 | Ad wallet ledger where balance equals the sum of entries | Asserted by a reconciliation test |
| `A-710` | 1 | Currency and rounding rules stated once for the whole console | Integer poisha everywhere |
| `A-711` | 1 | Invoice generation with a stable number per period | No gaps, no reuse |
| `A-712` | 1 | Reconciliation report: charged, credited, refunded | Totals tie to the ledger |
| `A-713` | 1 | Refund with a reason and a ledger entry | Ledger is append-only |
| `A-714` | 1 | Top-up approval with a two-person rule above a threshold | Threshold is data |
| `A-715` | 1 | Vendor payout approval with a second approver | Same rule as top-up |
| `A-716` | 2 | Campaign invoice drill-down | Every line traceable to an event |
| `A-717` | 2 | Credit note with a link to the refund | Both directions navigable |
| `A-718` | 2 | Export a financial period as CSV and PDF | Both reconcile |
| `A-719` | 2 | Outstanding balance aging buckets | 30/60/90 with counts |
| `A-720` | 2 | Spend forecast for the next 30 days | Method stated |
| `A-721` | 3 | Money shown per locale with correct grouping | No float arithmetic |
| `A-722` | 3 | Print a statement | One page, headed |

#### People and safety (cross-console) — 70 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-795` | 1 | A member appeal form with a receipt | Acknowledged immediately |
| `A-796` | 1 | A member's own view of their standing and history | Read-only, from the same rows |
| `A-797` | 1 | A moderation action that states its member-visible effect | Before it is taken |
| `A-798` | 1 | Account deletion request intake with a lawful reason | Deletion is queued, never immediate |
| `A-799` | 1 | Appeal decision notifies the member in their language | Both locales covered by a test |
| `A-800` | 1 | Appeal intake, queue, and decision | An appeal cannot be decided by the original decider |
| `A-801` | 1 | Ban requires people.role and writes an immutable row | A ban cannot be edited, only superseded |
| `A-802` | 1 | Bulk moderation with per-item reason and a receipt | Items with different reasons can be batched |
| `A-803` | 1 | Case export for an appeal | Complete and ordered |
| `A-804` | 1 | Case management: one case per member incident | Multiple reports can join one case |
| `A-805` | 1 | Case outcome taxonomy | Chosen from a list, not typed |
| `A-806` | 1 | Case reopen with a reason | Audited |
| `A-807` | 1 | Case timeline with every action and note | Immutable once closed |
| `A-808` | 1 | Claim a report so two moderators cannot work it twice | Claim is atomic; the second claim is refused |
| `A-809` | 1 | Content hide with a stated scope and a restore path | Hidden content names who can restore it |
| `A-810` | 1 | Deletion completion is logged without retaining personal data | The audit row keeps ids, not content |
| `A-811` | 1 | Deletion has a 30-day grace with a visible countdown | The member and the record both show the date |
| `A-812` | 1 | Member-visible outcome message in their language | Generated from the outcome |
| `A-813` | 1 | Moderation queue ranked by severity and age | Ordering is deterministic and stated |
| `A-814` | 1 | Moderator workload view: open, claimed, and overdue | Overdue is visible to a manager without asking |
| `A-815` | 1 | On-call rotation with escalation contacts | Rotation is editable and visible |
| `A-816` | 1 | Person record: identity, standing, roles, and last activity | One screen answers who, what standing, what role |
| `A-817` | 1 | Person timeline: every moderation action against them | Chronological, filterable by kind and date |
| `A-818` | 1 | Repeat-offender detection across reports and accounts | Links by shared signal, never by name alone |
| `A-819` | 1 | Resolve with outcome, reason, and the action taken | Outcome is an enum, not free text |
| `A-820` | 1 | Role change cannot exceed the actor's rank (server-enforced) | Proven by a test that expects a refusal |
| `A-821` | 1 | Role change preview shows the permissions gained and lost | The diff is permission-level, not role-name-level |
| `A-822` | 1 | SLA policy per severity with a visible clock | Policy is data, not code |
| `A-823` | 1 | Severity escalation when a subject repeats within 7 days | Escalation is automatic and recorded |
| `A-824` | 1 | Shift roster with hand-over notes | The next shift sees what is unresolved |
| `A-825` | 1 | Signal radar: reporter reliability and brigading pattern | A cohort of first-time reporters is flagged, not obeyed |
| `A-826` | 1 | Staff card issue and revoke with a QR payload | The QR verifies against the registry |
| `A-827` | 1 | Staff directory with department, role and card verification | Card verification uses the issued code |
| `A-828` | 1 | Staff onboarding checklist with completion evidence | Each step records who completed it and when |
| `A-829` | 1 | Suspend is reversible and states exactly what it does | Preview lists the capabilities lost |
| `A-830` | 1 | Suspend with reason, scope and expiry | Expiry is mandatory; indefinite requires a second approval |
| `A-831` | 2 | A member message template per outcome | Both languages |
| `A-832` | 2 | A support handover note from moderation | Context carried |
| `A-833` | 2 | Availability and leave requests with approval | Approval updates the roster |
| `A-834` | 2 | Bulk close of spam-classified cases with one reason | Receipt lists ids |
| `A-835` | 2 | Case SLA by severity | Policy is data |
| `A-836` | 2 | Case assignment and transfer | Both parties notified |
| `A-837` | 2 | Case metrics: opened, closed, reopened, aged | Weekly trend |
| `A-838` | 2 | Case search across notes and outcomes | Permission-checked |
| `A-839` | 2 | Directory search across staff, departments and shifts | One query, ranked, with the match shown |
| `A-840` | 2 | Escalation to a manager with context attached | The manager sees the full thread, not a summary |
| `A-841` | 2 | Handover report generated at shift end | Draft is prefilled from open items |
| `A-842` | 2 | Moderator action shortcuts from a note | One note can spawn the action it describes |
| `A-843` | 2 | Moderator notes private to staff | The member never sees a note |
| `A-844` | 2 | Mute with a channel scope and duration | A channel mute does not silence the whole platform |
| `A-845` | 2 | Pattern rules: keyword, link, and cohort signals | Rules are data with a test corpus |
| `A-846` | 2 | Person export for law-enforcement with a legal basis field | Export is audited and the basis is mandatory |
| `A-847` | 2 | Person merge detection for duplicate accounts | Merge is proposed, never automatic |
| `A-848` | 2 | Person search by handle, email hash, id, or card | Each field is indexed and states its match mode |
| `A-849` | 2 | Queue health: inflow, resolution rate, backlog trend | Trend is compared to the prior 7 days |
| `A-850` | 2 | Related-case linking | Shows the pattern |
| `A-851` | 2 | Report evidence attachments with immutable storage | Attachments cannot be replaced, only added |
| `A-852` | 2 | Report triage with duplicate clustering | Near-duplicates collapse with a count |
| `A-853` | 2 | Rule simulation against history before enabling | Simulation states false-positive rate |
| `A-854` | 2 | Shift coverage gaps highlighted before they happen | A gap 48h ahead is flagged |
| `A-855` | 2 | Standing adjustment with a reason and a decay rule | Points decay on a stated schedule |
| `A-856` | 2 | Standing ladder with a points ledger | Standing is derived from rows, not stored twice |
| `A-857` | 2 | Team inbox for escalated items with ownership | No escalation without an owner |
| `A-858` | 2 | Warning ladder with automatic steps and a visible next step | The member sees what comes next |
| `A-859` | 3 | Bulk comment templates with a variable preview | The template shows the filled result before send |
| `A-860` | 3 | Case print view | For a legal file |
| `A-861` | 3 | Consistent status colour semantics across consoles | Same colour means the same thing everywhere |
| `A-862` | 3 | Empty queue celebration state | Says the queue is clear and when it was last |
| `A-863` | 3 | Moderation console keyboard-first triage | j/k move, a acts, r resolves |
| `A-864` | 3 | Person record print view for case files | One page, no chrome, both languages |

#### Reporting — 15 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-865` | 1 | A monthly trust and safety summary | Counts, outcomes, appeals |
| `A-866` | 1 | A report is a saved query with a definition, not a screen | Definition is shown with the result |
| `A-867` | 1 | A weekly staff report with the six numbers that matter | Generated, not assembled |
| `A-868` | 1 | Every report has a SHA-256 receipt | Verifiable later |
| `A-869` | 1 | Every report states its time range and freshness | Both shown |
| `A-870` | 1 | Report output is stable-ordered for diffing | Two runs comparable |
| `A-871` | 1 | Reports can be scheduled and delivered | Named recipients |
| `A-872` | 2 | A quarterly access review report | Signed and archived |
| `A-873` | 2 | A report that fails says which step failed | No silent empty table |
| `A-874` | 2 | An annual compliance pack | Indexed PDF |
| `A-875` | 2 | Compare two report runs | Delta per row |
| `A-876` | 2 | Export PDF and CSV from one definition | Same rows |
| `A-877` | 2 | Report access is permission-checked per report | Never by URL alone |
| `A-878` | 2 | Report templates for the eight recurring needs | Each has a name and a definition |
| `A-879` | 3 | Print layout for every report | Header, footer, page numbers |

#### Runtime: config, custom pages, IP, integrations — 35 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-880` | 1 | Config cache invalidation with a visible propagation state | The UI states when the change is live everywhere |
| `A-881` | 1 | Custom page publish requires settings.write and a preview | An unpublished preview is not reachable publicly |
| `A-882` | 1 | Custom page section reorder with a live preview | Preview is the real component, not a mock |
| `A-883` | 1 | Custom page version history with revert | Reverting creates a new version |
| `A-884` | 1 | Dangerous setting requires a confirmation phrase | The phrase names the consequence |
| `A-885` | 1 | Delivery log with request and response bodies | Redacted of secrets |
| `A-886` | 1 | Edge request tracer for one request id | Shows every rule evaluated and the outcome |
| `A-887` | 1 | IP rule dry-run against the last 7 days of edge logs | Preview shows who would have been blocked |
| `A-888` | 1 | IP rule expiry and review date | Every rule has an owner and a review by date |
| `A-889` | 1 | IP rule simulator answers why an address matched | Names the rule and the field that matched |
| `A-890` | 1 | IP rules: allow, block, rate-limit, with priority | Conflict between two rules is refused at save |
| `A-891` | 1 | Secret settings are write-only and never displayed | The UI shows set / not set, never the value |
| `A-892` | 1 | Setting change shows a diff and a rollback button | Rollback is one click and is itself audited |
| `A-893` | 1 | Settings history with actor, reason and effective time | Any prior value can be restored |
| `A-894` | 1 | Test delivery button | No production side effect |
| `A-895` | 1 | Typed settings registry with a schema per key | A value that violates its schema cannot be saved |
| `A-896` | 1 | Webhook registry with a signing secret and a replay log | Every delivery has an id |
| `A-897` | 1 | Webhook retry with exponential backoff | Bounded |
| `A-898` | 2 | Config diff between two environments | Shows production versus staging for the same key |
| `A-899` | 2 | Config export and import with schema validation | An invalid import is refused wholesale |
| `A-900` | 2 | Config search across keys, labels and descriptions | Match highlights the field it matched |
| `A-901` | 2 | Config usage map: which screens read this key | A key nobody reads is flagged for removal |
| `A-902` | 2 | Custom page JSON export and import | Round-trip is byte-identical |
| `A-903` | 2 | Custom page accessibility check before publish | Headings, alt text and contrast are checked |
| `A-904` | 2 | Disable a failing webhook automatically after N failures | Reason recorded |
| `A-905` | 2 | Export delivery history | Bounded |
| `A-906` | 2 | IP asn and country enrichment for a rule | Enrichment is cached and dated |
| `A-907` | 2 | Rate-limit rule simulation with a burst profile | Shows requests allowed at 10, 100 and 1000 rps |
| `A-908` | 2 | Rule ordering by specificity with a drag handle | Order is saved and audited |
| `A-909` | 2 | Setting dependency graph: changing A needs B | A missing dependency is refused with the reason |
| `A-910` | 2 | Webhook event catalogue | Which events exist |
| `A-911` | 3 | Config matrix with grouping and sticky headers | Readable at 250px without horizontal scroll |
| `A-912` | 3 | Custom page section library with variants | Each variant has a preview thumbnail drawn in CSS |
| `A-913` | 3 | IP ledger with a visual priority ladder | Order is visible without opening each row |
| `A-914` | 3 | Payload diff between two deliveries | Field level |

#### Search and discovery — 10 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-915` | 1 | One search box over every permitted entity type | Type filters are permission-aware |
| `A-916` | 1 | Ranking that shows why a result matched | The matched field is highlighted |
| `A-917` | 1 | Saved searches with alerts on new matches | One digest per alert |
| `A-918` | 1 | Typo tolerance for English and phonetic matching for Bengali | Both tested with fixtures |
| `A-919` | 2 | Empty results suggest a correction and a broadening | Two concrete next steps |
| `A-920` | 2 | Index freshness indicator | States the last index time |
| `A-921` | 2 | Keyboard selection and open in a new tab | Both work |
| `A-922` | 2 | Search history per operator | Private and clearable |
| `A-923` | 3 | Result rows are readable at 250px | No truncation of the identifying field |
| `A-924` | 3 | Search from anywhere with one chord | Works on every console |

#### Security hardening — 17 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-931` | 1 | Admin read-only mode can be entered by an owner | Writes refused with a clear message |
| `A-932` | 1 | Break-glass access with a named approver and a 1-hour window | Automatically reverts |
| `A-933` | 1 | Bulk export of permissions for review | Signed and dated |
| `A-934` | 1 | Device allowlist per role | A new device needs an approval |
| `A-935` | 1 | IP allowlist for the consoles themselves | Reuses the edge rule engine |
| `A-936` | 1 | Impossible-travel detection on staff sign-ins | Flags with the two locations and times |
| `A-937` | 1 | Recovery codes issued once and shown once | Regeneration revokes old codes |
| `A-938` | 1 | Sign-in notification with a revoke link | One click revokes |
| `A-939` | 1 | WebAuthn as a second factor | Fallback to a code if unavailable |
| `A-940` | 2 | CSP report-only mode harness before enforcing | Reports collected and triaged |
| `A-941` | 2 | Dependency vulnerability board with an owner | Per package |
| `A-942` | 2 | Lockdown mode that freezes all privileged writes | One switch, audited, reversible |
| `A-943` | 2 | Secret rotation checklist with a last-rotated date | Overdue is flagged |
| `A-944` | 2 | Suspicious bulk action detector | A burst above baseline is held for review |
| `A-945` | 2 | Two-person rule on permission grants above manager | Approver must differ |
| `A-946` | 3 | Print a security posture one-pager | For a management review |
| `A-947` | 3 | Security posture score with the factors listed | Every factor links to its fix |

#### Signal: vitals, incidents, verification — 54 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-948` | 1 | A revoked document still verifies as revoked, not as invalid | Distinct states |
| `A-949` | 1 | Alert acknowledgement with an owner and a timer | An unacknowledged alert escalates once |
| `A-950` | 1 | Alert routing: which events page a human at 03:00 | Routing is a table, not a comment |
| `A-951` | 1 | Bundle watch: every console measured against its budget | A console over budget fails CI, not a review |
| `A-952` | 1 | Channel membership management with an audit row | Adding and removing are both recorded |
| `A-953` | 1 | Customer-facing update distinct from internal notes | Two boxes, never confused |
| `A-954` | 1 | Edge latency by region with a slowest-first table | Regions below the sample floor are labelled, not hidden |
| `A-955` | 1 | Error board with first-seen, last-seen and count | Grouped by fingerprint, not by message |
| `A-956` | 1 | Every verification attempt is counted, not stored with PII | Aggregate only |
| `A-957` | 1 | Incident channel auto-created with the incident | The channel links back to the incident |
| `A-958` | 1 | Incident declaration publishes to the status board | Status board updates within one refresh |
| `A-959` | 1 | Incident lifecycle: declare, update, resolve, post-mortem | Every state change has a timestamp and an author |
| `A-960` | 1 | Incident roles: commander, comms, scribe | Named per incident |
| `A-961` | 1 | Incident severity matrix with examples | Published |
| `A-962` | 1 | Incident subscriber notification in both languages | Subscribers choose a language |
| `A-963` | 1 | Message search across channels the operator may read | Search never returns a channel they may not |
| `A-964` | 1 | Post-incident actions with owners and dates | Tracked to closure |
| `A-965` | 1 | Rate limit on verification to stop enumeration | Bounded and reported |
| `A-966` | 1 | Regression alert when a route crosses a budget for 3 runs | Alert names the route, metric and delta |
| `A-967` | 1 | Resolve an error with a note, audited | Resolving states who and why |
| `A-968` | 1 | Staff channel with presence and typing state | Presence is accurate to 10 seconds |
| `A-969` | 1 | Status board 90-day uptime with a stated calculation | The formula is published beside the bars |
| `A-970` | 1 | Status board update generated from the incident | No copy-paste |
| `A-971` | 1 | Timeline entries that are append-only | Corrections are new entries |
| `A-972` | 1 | Verification answers are deterministic and cached for 60s | Same input, same answer |
| `A-973` | 1 | Verification desk: one query answers code, id, or hash | Three input shapes, one screen |
| `A-974` | 1 | Verification never reveals more than the document already does | Proven by a test asserting the response fields |
| `A-975` | 1 | Verification result states what is verified and by what | Names the signature and the registry row |
| `A-976` | 1 | Vitals dashboard per route with p75 and a trend | Each metric carries its sample count |
| `A-977` | 2 | Batch results downloadable and signed | Verifiable |
| `A-978` | 2 | Capacity forecast from the last 90 days | Forecast states its confidence interval |
| `A-979` | 2 | Cross-console link: an incident opens its error and its vitals | One click, preserving the time window |
| `A-980` | 2 | Drill mode: rehearse an incident without notifying | Nothing is sent |
| `A-981` | 2 | Error impact estimate: sessions affected | Estimate states its method |
| `A-982` | 2 | Error triage: assign, snooze, and link to a fix | Snooze requires a date and a reason |
| `A-983` | 2 | Incident duration computed and shown | From declare to resolve |
| `A-984` | 2 | Incident metrics: count, MTTR, MTTA | Trend |
| `A-985` | 2 | Incident template per class | Prefilled steps |
| `A-986` | 2 | Incident timeline export for a post-mortem | Export includes every update and timestamp |
| `A-987` | 2 | Maintenance window scheduling with a countdown | The window is announced before it starts |
| `A-988` | 2 | Performance report PDF with a SHA-256 receipt | The receipt verifies against the stored report |
| `A-989` | 2 | Related incidents and duplicates | Linked |
| `A-990` | 2 | Status page component health derived from probes | A component's state is not hand-typed |
| `A-991` | 2 | Subscriber management with export | Subscribers can be exported and removed |
| `A-992` | 2 | Subscriber notification preview before send | Both languages |
| `A-993` | 2 | Verification batch: a CSV of codes to a result file | Batch is bounded and reports progress |
| `A-994` | 2 | Verification health: success rate and latency | Two numbers |
| `A-995` | 2 | Verification widget embeddable for a third party | No PII |
| `A-996` | 2 | Vitals by device class and connection type | Slow-3G is separable from desktop |
| `A-997` | 2 | Waterfall for a slow route from field data | Shows the phase that dominates |
| `A-998` | 3 | Channel unread badges that survive a refresh | Badges are derived, not client-only |
| `A-999` | 3 | Incident timeline export to markdown | For a post-mortem doc |
| `A-1000` | 3 | Sparkline in every list row that has a trend | The sparkline has a text twin |
| `A-1001` | 3 | Status board print view | A printable single page of current health |

#### admin-site — command deck — 43 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-001` | 1 | Ad credit top-up with a ledger entry per grant | Wallet balance equals the sum of its ledger |
| `A-002` | 1 | Approval decision requires a reason, audited | Rejecting without a reason is impossible |
| `A-003` | 1 | Approvals queue with SLA countdown and breach flag | A row past SLA turns critical and sorts first |
| `A-004` | 1 | Bulk action is all-or-nothing per batch with a receipt | Partial failure names the failed ids and rolls back |
| `A-005` | 1 | Bulk governance with dry-run listing every affected id | Dry-run output is diffable and exportable |
| `A-006` | 1 | Campaign approval with creative preview before decision | The creative is visible in the decision drawer |
| `A-007` | 1 | Live KPI strip with freshness age per number | Each KPI shows when it was measured and its source |
| `A-008` | 1 | Marketplace payout approval with a two-person rule | One operator cannot approve a payout alone |
| `A-009` | 1 | Telemetry snapshot diff against the previous hour | The delta is shown, not just the value |
| `A-010` | 2 | Branding: publish requires brand.publish and an audit row | A draft theme cannot go live without it |
| `A-011` | 2 | Branding: theme preview side by side with the live theme | Difference is visible without applying |
| `A-012` | 2 | Branding: token editor with contrast check per pair | WCAG ratio is shown live for every foreground/background |
| `A-013` | 2 | Bulk action receipt with a downloadable record | Receipt includes ids, before, after, operator |
| `A-014` | 2 | CLI --dry-run resolving every command to its effects | No mutation is performed in dry-run, proven by test |
| `A-015` | 2 | CLI destructive verb requires typing the subject id | Typing 'confirm' is not enough |
| `A-016` | 2 | CLI fuzzy completion for verbs, flags and record ids | Tab completes an id from the live index |
| `A-017` | 2 | CLI history with search across sessions | Ctrl+R finds a command from last week |
| `A-018` | 2 | CLI inline help per verb with examples | help <verb> prints usage, flags and one example |
| `A-019` | 2 | CLI macro with parameters and a prompt for each | A macro can be run with two named arguments |
| `A-020` | 2 | CLI output pane with JSON, table and log modes | Mode switch re-renders the same result |
| `A-021` | 2 | CLI refuses unknown verbs with a suggestion | Typo gets the three nearest verbs |
| `A-022` | 2 | CLI session transcript export | Transcript includes every command and result |
| `A-023` | 2 | Campaign pause/resume with a reason and an effect preview | Preview states the delivery impact |
| `A-024` | 2 | Campaign performance table with spend, delivery and CTR | Every column has a definition in a tooltip |
| `A-025` | 2 | Overview: audit inspector drawer filtered to today | Drawer opens without losing the page state |
| `A-026` | 2 | Overview: open incidents and failing checks in one panel | Both are visible above the fold |
| `A-027` | 2 | Overview: quick launcher to any accessible console | Every portal with the operator's clearance is one click |
| `A-028` | 2 | Redirect editor with loop and chain detection | A -> B -> A is refused with the cycle shown |
| `A-029` | 2 | Redirect hit analytics with 404 sources feeding suggestions | Top 404s each offer a one-click redirect |
| `A-030` | 2 | Redirect import and export with a dry-run | Import preview shows created, updated, unchanged |
| `A-031` | 2 | SEO bulk import from CSV with a validation report | Every rejected row states its column and rule |
| `A-032` | 2 | SEO coverage: which routes have no title or description | The gaps are a list, not a guess |
| `A-033` | 2 | SEO override validation: length, uniqueness, canonical sanity | Two pages cannot share a canonical |
| `A-034` | 2 | SEO override with a live SERP and social preview | Title truncation matches Google's ~60 character cut |
| `A-035` | 2 | Sitemap view with last-modified and inclusion toggles | A toggle states its effect on the generated file |
| `A-036` | 3 | Advertising inventory view with fill rate and floor price | Inventory rows reconcile with the ad ledger |
| `A-037` | 3 | Approvals: saved filter for the operator's own queue | Filter persists per operator |
| `A-038` | 3 | Campaign creative lightbox with zoom and metadata | Creative opens without leaving the decision |
| `A-039` | 3 | Console-wide density switch: comfortable and compact | Both densities pass the touch-target audit |
| `A-040` | 3 | Every screen states its data source and permission | A footer line on each panel |
| `A-041` | 3 | Marketplace shop card with catalogue completeness score | Score names what is missing |
| `A-042` | 3 | Overview: keyboard-first layout with a command bar | Every number is reachable by Tab in a sane order |
| `A-043` | 3 | Print-friendly approval decision record | Printing produces the decision, not the chrome |

#### bsdc-cert — 22 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-044` | 1 | Amend with a field diff and a mandatory reason | The diff is stored, not inferred |
| `A-045` | 1 | Idempotent issuance per member and course | A double submit issues one |
| `A-046` | 1 | Issue with a unique, check-digit code | Concurrency test proves uniqueness |
| `A-047` | 1 | PDF reproducible byte-for-byte | Same record, same hash |
| `A-048` | 1 | Public verification in one query without PII | Only status, course and date |
| `A-049` | 1 | Registry search by code, member, course, date | Each filter indexed |
| `A-050` | 1 | Reissue preserving the chain | Original remains reachable |
| `A-051` | 1 | Restore with a rationale | Creates a new row |
| `A-052` | 1 | Revoke with a public reason and effective time | Both languages |
| `A-053` | 2 | Batch issue from CSV with a per-row report | Every rejection explained |
| `A-054` | 2 | Bulk revoke and restore with a receipt | Receipt lists every id |
| `A-055` | 2 | Certificate ledger reconciliation | Dashboard equals ledger |
| `A-056` | 2 | Export a manifest of a bulk download | Every file with its hash |
| `A-057` | 2 | Legal hold prevents deletion | Refuses with a clear message |
| `A-058` | 2 | Numbering scheme with no gaps | Next number derived |
| `A-059` | 2 | QR payload contains only the verification URL | No internal ids |
| `A-060` | 2 | Revision history drawer | Every revision with its diff |
| `A-061` | 2 | Template preview at print resolution | Within 1pt of the PDF |
| `A-062` | 2 | Template studio with validated placeholders | Unknown token fails at save |
| `A-063` | 3 | Both languages on the body | Language follows the member |
| `A-064` | 3 | Certificate count by course with a sparkline | Text twin present |
| `A-065` | 3 | Print stylesheet with safe margins | A4 and Letter |

#### bsdc-config — 24 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-066` | 1 | A setting's effective source is shown: override, env or default | Each row states where its value came from |
| `A-067` | 1 | Changing a setting previews its blast radius | The preview lists the screens and jobs that read it |
| `A-068` | 1 | Environment banner: production settings cannot be edited from staging | The console refuses with an explanation |
| `A-069` | 1 | Every setting has a type, a default, an owner and a description | A setting without all four cannot be seeded |
| `A-070` | 1 | Rollback restores the previous value and is itself revertible | Two rollbacks return to the original |
| `A-071` | 1 | Secret settings never leave the server | The read RPC returns a boolean, never a value |
| `A-072` | 1 | Setting validation runs the same rule as the database | The UI refuses before the RPC does |
| `A-073` | 1 | Settings history is immutable and reason-bearing | Every row names an operator and a reason |
| `A-074` | 2 | Bulk revert of a group to defaults with a confirmation | Group revert lists each key it changes |
| `A-075` | 2 | Cache invalidation state per key with a retry | A failed invalidation can be retried |
| `A-076` | 2 | Change request mode: stage a change for a second approval | A staged change is visible to the approver |
| `A-077` | 2 | Dependency warnings: A is set while its consumer B is off | The warning names the flag to enable |
| `A-078` | 2 | Diff two points in history | Two timestamps, one view |
| `A-079` | 2 | Export the current settings for a backup | Export is stable-ordered and diffable |
| `A-080` | 2 | Grouped navigation for core, content, market, ads, trust, perf | Every key belongs to exactly one group |
| `A-081` | 2 | Import settings from a JSON file with a dry-run | Dry-run shows added, changed and unchanged |
| `A-082` | 2 | Inline edit with the schema beside the field | The schema is visible while editing |
| `A-083` | 2 | Scheduled setting changes with an effective time | A change at midnight is not applied at noon |
| `A-084` | 2 | Search across key, label and description with highlighting | Match is shown in context |
| `A-085` | 2 | Setting usage map with last-read timestamp | An unused key is flagged |
| `A-086` | 3 | A 'what changed since my last visit' summary | Shown once, dismissible |
| `A-087` | 3 | Copy a key or its value with one click | Both copy actions confirm |
| `A-088` | 3 | Dense matrix view with sticky headers and column groups | Readable at 250px |
| `A-089` | 3 | Keyboard navigation between keys | Arrow keys move, Enter edits |

#### bsdc-connect — 18 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-090` | 1 | Channels with membership enforced server-side | Search and read both gated |
| `A-091` | 1 | Incident channel auto-created with an incident | Links back to the incident |
| `A-092` | 1 | Membership changes audited | Add and remove both recorded |
| `A-093` | 1 | Message search scoped to readable channels | Never returns another channel |
| `A-094` | 1 | Presence accurate to ten seconds | Away state derived |
| `A-095` | 2 | Alert acknowledgement with an owner and a timer | Escalates once on silence |
| `A-096` | 2 | Alert routing table: which event pages whom | Routing is editable |
| `A-097` | 2 | Channel archive with a stated restore path | Archived is read-only |
| `A-098` | 2 | File sharing with a type guard | Rejected types named |
| `A-099` | 2 | Mentions with a badge and a jump | Jump lands on the message |
| `A-100` | 2 | Message edit and delete with a marker | History shows it was edited |
| `A-101` | 2 | Pinned messages per channel | Pin requires membership |
| `A-102` | 2 | Threads with a reply count | Thread opens without losing the channel |
| `A-103` | 2 | Typing indicators with a debounce | No flicker under load |
| `A-104` | 2 | Unread counts derived from a read cursor | Survives a refresh |
| `A-105` | 3 | Compact and comfortable density | Both pass the touch audit |
| `A-106` | 3 | Keyboard shortcut to jump to the newest message | End key works |
| `A-107` | 3 | Print or export a channel transcript | Bounded to a date range |

#### bsdc-custom — 21 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-108` | 1 | Live preview using the real renderer | Preview and published output are the same component |
| `A-109` | 1 | Page builder with typed sections and validated content | A section without required content cannot publish |
| `A-110` | 1 | Publish requires settings.write and passes an accessibility check | Headings and alt text are checked at publish |
| `A-111` | 1 | Slug uniqueness and reserved-path protection | A slug colliding with a route is refused |
| `A-112` | 1 | Unpublish with a visible redirect to a stated destination | A removed page never 404s silently |
| `A-113` | 1 | Version history with diff and revert | Revert creates a new version |
| `A-114` | 2 | Draft autosave every 10 seconds with a visible state | Reload restores the draft |
| `A-115` | 2 | Drag reorder with keyboard alternative | Move up/down works without a pointer |
| `A-116` | 2 | Duplicate a page as a starting point | Duplicate copies sections but not the slug |
| `A-117` | 2 | Image section with alt text required and dimension hints | Missing alt text blocks publish |
| `A-118` | 2 | Import and export a page as JSON | Round-trip is byte-identical |
| `A-119` | 2 | Language tabs with per-locale content and a completeness meter | A missing locale is visible |
| `A-120` | 2 | Markdown section with live formatting and a link checker | A dead link is flagged before publish |
| `A-121` | 2 | Page listing with status, last edit and author | Filter by all three |
| `A-122` | 2 | Preview at 375, 768 and 1440 inside the console | Three widths, one control |
| `A-123` | 2 | SEO fields per page with a SERP preview | Title and description truncation are shown |
| `A-124` | 2 | Scheduling with a publish window | A window with an end unpublishes automatically |
| `A-125` | 2 | Section library with variants and CSS-drawn thumbnails | Every variant renders a thumbnail |
| `A-126` | 3 | Blueprint grid overlay while arranging sections | Overlay is togglable and does not shift content |
| `A-127` | 3 | Undo and redo within an editing session | Twenty steps of history |
| `A-128` | 3 | Unsaved-change guard on navigation | Leaving prompts once |

#### bsdc-ip — 22 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-129` | 1 | Conflict detection at save | A rule shadowing another is refused |
| `A-130` | 1 | Dry-run against the last 7 days of logs | Shows the requests that would have been blocked |
| `A-131` | 1 | Every rule has an owner and a review date | An overdue review is flagged |
| `A-132` | 1 | Priority ordering with specificity shown | The effective order is visible |
| `A-133` | 1 | Request tracer by request id | Every rule evaluated is listed in order |
| `A-134` | 1 | Rule changes require ip.rule and a reason | Both are enforced server-side |
| `A-135` | 1 | Rule simulator: address in, decision and reason out | Names the exact rule that matched |
| `A-136` | 1 | Rule types: allow, block, rate-limit, challenge | Each type states its effect in one sentence |
| `A-137` | 2 | Allowlist protection: the operator's own address cannot be blocked by accident | The console warns before it locks itself out |
| `A-138` | 2 | Bulk import of rules with a validation report | Each rejected line states its reason |
| `A-139` | 2 | CIDR validation with a corrected suggestion | A /33 is offered /32 |
| `A-140` | 2 | Country and ASN enrichment with a dated cache | The date is shown beside the value |
| `A-141` | 2 | Edge log viewer with filters and a request drill-down | A row opens its full evaluation |
| `A-142` | 2 | Emergency unblock shortcut with a reason and an escalation note | One click, fully audited |
| `A-143` | 2 | Expiring blocks with an automatic lift | A 24h block is gone after 24h |
| `A-144` | 2 | Import from a threat feed with a review step | Nothing imports unseen |
| `A-145` | 2 | Rate-limit editor with a burst profile preview | Shows allowed requests at three rates |
| `A-146` | 2 | Rule impact estimate: requests per day affected | Estimate shown before saving |
| `A-147` | 2 | Shadow mode: log what would be blocked without blocking | Shadow results appear in the impact panel |
| `A-148` | 3 | Copy a rule as a template | Template excludes the address value |
| `A-149` | 3 | Diff between two rule sets | Added, removed and changed |
| `A-150` | 3 | Visual priority ladder | Order is visible without opening rows |

#### bsdc-mod — 22 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-151` | 1 | Appeal intake and decision by somebody else | Original decider is excluded |
| `A-152` | 1 | Atomic claim so two moderators cannot work one report | Second claim refused |
| `A-153` | 1 | Automatic severity escalation on repeat within 7 days | Recorded and visible |
| `A-154` | 1 | Content hide with scope and a restore path | Names who can restore |
| `A-155` | 1 | Queue ranked by severity and age | Ordering is deterministic |
| `A-156` | 1 | Repeat-offender detection across accounts | Links by signal, not by name |
| `A-157` | 1 | Reporter reliability scoring | A brigading cohort is flagged, not obeyed |
| `A-158` | 1 | Resolve with an outcome enum, reason and action | Outcome is not free text |
| `A-159` | 2 | Action shortcut from a note | One note spawns the action |
| `A-160` | 2 | Bulk resolve with per-item reason | Mixed reasons in one batch |
| `A-161` | 2 | Duplicate clustering of near-identical reports | Collapses with a count |
| `A-162` | 2 | Escalate to a manager with full context | No summary-only escalation |
| `A-163` | 2 | Evidence attachments, immutable | Added, never replaced |
| `A-164` | 2 | Moderator workload view | Open, claimed and overdue |
| `A-165` | 2 | Pattern rules with a test corpus | Rule is data, not code |
| `A-166` | 2 | Private moderator notes | Never shown to a member |
| `A-167` | 2 | Queue health: inflow, resolution and backlog trend | Compared to the prior week |
| `A-168` | 2 | Rule simulation against history | False-positive rate stated |
| `A-169` | 2 | SLA clock per severity from a policy table | Policy is data |
| `A-170` | 3 | Consistent severity colours with a text label | Colour is never alone |
| `A-171` | 3 | Empty queue state with the last-cleared time | Celebratory, not blank |
| `A-172` | 3 | Keyboard triage: j/k, a, r | No pointer needed |

#### bsdc-notice — 21 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-173` | 1 | Acknowledgement roster with export | Complete and ordered |
| `A-174` | 1 | Compose with a split-pane markdown preview | Preview matches the published page |
| `A-175` | 1 | Pin and priority with an audit row | Every change recorded |
| `A-176` | 1 | Publish requires notice.publish and an audience | Both enforced server-side |
| `A-177` | 1 | Revert creates a new revision | History is never rewritten |
| `A-178` | 1 | Revision history with a field-level diff | Each revision shows its change |
| `A-179` | 1 | Unpublish with a withdrawal notice | Members see it was withdrawn |
| `A-180` | 2 | Acknowledgement reminder to non-readers | One reminder, recorded |
| `A-181` | 2 | Attachment upload with a type and size guard | Rejected types are named |
| `A-182` | 2 | Audience targeting with a reach preview | Reach count before publish |
| `A-183` | 2 | Bulk publish and unpublish with a receipt | Every id listed |
| `A-184` | 2 | Clone a notice as a template | Copies content, not the schedule |
| `A-185` | 2 | Delivery funnel: delivered, read, acknowledged | Counts reconcile with the audience |
| `A-186` | 2 | Legal hold during an investigation | Delete is refused |
| `A-187` | 2 | Notice registry with status filters | Draft, scheduled, live, withdrawn |
| `A-188` | 2 | Per-locale completeness meter | Missing translation is visible |
| `A-189` | 2 | Print and PDF export of a notice | Matches the published page |
| `A-190` | 2 | Scheduling with a calendar and conflict detection | Two notices at one time are flagged |
| `A-191` | 3 | Empty state for a clear roster | Says when it was last checked |
| `A-192` | 3 | Reading time estimate | Shown to the author |
| `A-193` | 3 | Typography scale bound to design tokens | Contrast audit stays clean |

#### bsdc-perf — 21 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-194` | 1 | Budget per route with a pass or fail verdict | The budget is editable and audited |
| `A-195` | 1 | Bundle watch per app against the 250 KB ceiling | An app over budget is red |
| `A-196` | 1 | Edge latency by region with a sample floor | Below the floor is labelled, not hidden |
| `A-197` | 1 | Error board grouped by fingerprint | First seen, last seen and count |
| `A-198` | 1 | Per-route vitals with p75, p95, sample count and trend | No metric without its sample count |
| `A-199` | 1 | Regression alert after three consecutive breaches | Names route, metric and delta |
| `A-200` | 1 | Report generation with a SHA-256 receipt | The receipt verifies the stored report |
| `A-201` | 1 | Resolve an error with a note, audited | Resolution records who and why |
| `A-202` | 2 | Capacity forecast with a confidence interval | Interval is stated |
| `A-203` | 2 | Device class and connection-type segmentation | Slow-3G separable from desktop |
| `A-204` | 2 | Error assignment, snooze and link to a fix | Snooze requires a date |
| `A-205` | 2 | Error impact in sessions affected | Method stated |
| `A-206` | 2 | Export a report as CSV and PDF | Both contain the same rows |
| `A-207` | 2 | Historical report list with comparison | Two reports can be compared |
| `A-208` | 2 | Long-task and interaction breakdown | Slow interactions ranked |
| `A-209` | 2 | Release comparison: this build versus the last | Delta per metric |
| `A-210` | 2 | Trend line with a rolling seven-day mean | The mean is labelled |
| `A-211` | 2 | Waterfall estimate from field phases | Dominant phase named |
| `A-212` | 3 | Heatmap of slow routes by hour | Empty cells are labelled |
| `A-213` | 3 | Print view of a performance report | Usable A4 output |
| `A-214` | 3 | Sparkline per route row with a text twin | Accessible alternative exists |

#### bsdc-status — 15 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-215` | 1 | 90-day uptime bars with a published calculation | The formula is visible |
| `A-216` | 1 | Component health derived from probes, not typed | A component cannot be set green by hand |
| `A-217` | 1 | Incident lifecycle with timestamps and authors | Every state change recorded |
| `A-218` | 1 | Maintenance windows announced before they start | Countdown shown |
| `A-219` | 1 | Subscriber notification in both languages | Language preference stored |
| `A-220` | 2 | Degraded state distinct from down | Three states, not two |
| `A-221` | 2 | Incident severity definitions published | One page, linked |
| `A-222` | 2 | Incident updates with a customer-facing template | Template prompts for impact and next update |
| `A-223` | 2 | Per-component history drill-down | A bar opens its incidents |
| `A-224` | 2 | Post-incident report with a timeline export | Export includes every update |
| `A-225` | 2 | Status page embeddable summary for other sites | No PII, no staff names |
| `A-226` | 2 | Subscriber list with export and removal | Audited |
| `A-227` | 3 | Accessible bars with a text alternative | Screen reader reads the range |
| `A-228` | 3 | Auto-refresh without a full reload | Preserves scroll |
| `A-229` | 3 | Print the status board | One page of current health |

#### bsdc-uadmin — 21 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-230` | 1 | Ban writes an immutable row | Editable only by superseding |
| `A-231` | 1 | Deletion grace countdown visible to staff | 30 days, stated |
| `A-232` | 1 | Deletion intake with a lawful reason | Queued, never immediate |
| `A-233` | 1 | Person record: identity, standing, roles, activity | One screen answers the escalation question |
| `A-234` | 1 | Rank guard refuses a grant above the actor | Proven by a refusal test |
| `A-235` | 1 | Role change preview at permission level | Gained and lost are both listed |
| `A-236` | 1 | Suspend with reason, scope and expiry | Indefinite requires a second approval |
| `A-237` | 1 | Timeline of every action against the person | Filter by kind and date |
| `A-238` | 2 | Bulk suspend and reactivate with a receipt | Every id listed |
| `A-239` | 2 | Duplicate account detection | Merge is proposed |
| `A-240` | 2 | Law-enforcement export with a legal basis | Basis is mandatory and audited |
| `A-241` | 2 | Mute with channel scope | Does not silence the platform |
| `A-242` | 2 | Search by handle, id, or card code | Match mode is stated |
| `A-243` | 2 | Session revoke for a member | Requires people.session |
| `A-244` | 2 | Staff card issue and revoke | QR verifies against the registry |
| `A-245` | 2 | Standing adjustment with reason and decay | Decay schedule stated |
| `A-246` | 2 | Standing ladder with a points ledger | Derived from rows |
| `A-247` | 2 | Warning ladder with the next step shown | Member sees what comes next |
| `A-248` | 3 | Consistent standing colours across consoles | One vocabulary |
| `A-249` | 3 | Copy any id or handle | Confirms with a toast |
| `A-250` | 3 | Person print view for a case file | One page, no chrome |

#### bsdc-umod — 16 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-251` | 1 | Hand-over notes carried to the next shift | Next shift sees open items |
| `A-252` | 1 | On-call rotation with escalation contacts | Editable and audited |
| `A-253` | 1 | Onboarding checklist with completion evidence | Each step records who and when |
| `A-254` | 1 | Shift roster with coverage per hour | Gaps are visible |
| `A-255` | 1 | Staff directory with department, role and card state | Card state comes from the registry |
| `A-256` | 2 | Card verification by code | Answers valid, revoked or unknown |
| `A-257` | 2 | Coverage gap forecast 48 hours ahead | Gap is flagged before it happens |
| `A-258` | 2 | Department headcount with a chart and twin | Chart has an accessible table |
| `A-259` | 2 | Directory export as CSV | Contains only permitted fields |
| `A-260` | 2 | Leave and availability requests with approval | Approval updates the roster |
| `A-261` | 2 | New-starter queue with a completion percentage | Incomplete steps are listed |
| `A-262` | 2 | Search across staff, departments and shifts | One query, ranked |
| `A-263` | 2 | Shift swap request with both approvals | Both parties and a manager |
| `A-264` | 3 | Empty state that names the next shift | No blank grid |
| `A-265` | 3 | Print the roster for a wall | One page per week |
| `A-266` | 3 | Roster as a week grid at 250px | No horizontal scroll |

#### bsdc-vf — 12 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-267` | 1 | One input answers a certificate code, a notice id, or a file hash | Three shapes, one screen |
| `A-268` | 1 | Response exposes no more than the document itself | Asserted by a field-level test |
| `A-269` | 1 | Result states what is verified and by what | Names the registry row and the signature |
| `A-270` | 1 | Revoked and unknown are different answers | Never conflated |
| `A-271` | 2 | Batch verification from a CSV | Bounded and progress-reported |
| `A-272` | 2 | Print a verification receipt | Includes the time and the hash |
| `A-273` | 2 | QR scan via the device camera | Falls back to typing |
| `A-274` | 2 | Result permalink that is stable | Same link, same answer |
| `A-275` | 2 | Verification history for the operator | Recent checks, private |
| `A-276` | 3 | Both languages | Detected, not forced |
| `A-277` | 3 | Keyboard-first single input | Focus lands on the field |
| `A-278` | 3 | Works on a 250px screen | No horizontal scroll |

#### main-site /admin hub — 6 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-703` | 1 | Every /admin screen states the permission it needs | And links to the federated console for the full tool |
| `A-704` | 1 | No destructive action in /admin that is not also in a console with the same guard | Asserted by test |
| `A-705` | 1 | The /admin area links to the console that owns each task | No task duplicated between the two |
| `A-706` | 2 | Consistent navigation back to the member site | One link, always present |
| `A-707` | 2 | Redirect to the owning console when the task is too big for a card | Preserves the selected record |
| `A-708` | 3 | The hub is useful on a phone in one screen | No scroll to reach the top actions |

#### Craft: interface, accessibility, language, mobile — 135 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-398` | 1 | 250px to 4K with no horizontal scroll | Nine widths tested in a browser |
| `A-399` | 1 | 44px targets everywhere | Measured |
| `A-400` | 1 | 44px touch targets on every control | Measured in a touch-emulated context |
| `A-401` | 1 | A browser suite for the consoles exists and runs in CI | A console regression fails a PR |
| `A-402` | 1 | A chord system with a visible pending indicator | Esc cancels |
| `A-403` | 1 | A command palette that can run, not just navigate | Every palette action is executable |
| `A-404` | 1 | A copy affordance on every code, id, hash and URL | One click, confirmed |
| `A-405` | 1 | A destructive button that is never the primary colour | Distinct |
| `A-406` | 1 | A landmark structure: banner, nav, main, complementary | Asserted |
| `A-407` | 1 | A screen that states which environment it is showing | Production is unmistakable |
| `A-408` | 1 | A share link that reproduces the exact view | Paste in a new tab, same screen |
| `A-409` | 1 | A single shortcut registry shared by all consoles | One list, one help sheet |
| `A-410` | 1 | A skip link on every console | First tab stop |
| `A-411` | 1 | A tooltip on every icon-only control | Name plus shortcut |
| `A-412` | 1 | A tooltip that is reachable by keyboard focus | Not hover-only |
| `A-413` | 1 | Bengali numerals in every formatted number | Digits are never mixed within one string |
| `A-414` | 1 | Bengali typography rules respected (line height, measure) | Measured, not assumed |
| `A-415` | 1 | Bundle budget enforced per console in CI | Every console has a measured gzip number |
| `A-416` | 1 | Colour is never the only signal | Every status has a shape or a word |
| `A-417` | 1 | Disabled states that say why | Tooltip or inline reason |
| `A-418` | 1 | Empty states that state what will appear and when | Two lines, one action |
| `A-419` | 1 | Error states with a request id to quote | Copyable |
| `A-420` | 1 | Every chart has a table twin | Asserted by test |
| `A-421` | 1 | Every console has both locales | Key parity test |
| `A-422` | 1 | Every console usable at 250px with no horizontal scroll | Nine widths tested |
| `A-423` | 1 | Every filter is clearable in one click | Clear-all is present |
| `A-424` | 1 | Every form has a cancel that is not a browser back | Explicit |
| `A-425` | 1 | Every list has a stable sort with a visible direction | Clicking a header toggles it |
| `A-426` | 1 | Every modal has a title, a body and one primary action | No modal without a name |
| `A-427` | 1 | Every screen has an owner-visible title, subtitle and last-updated | Three lines, always |
| `A-428` | 1 | Focus visible on every interactive element | A focus-visible test asserts outline width > 0 |
| `A-429` | 1 | Full en and bn parity with a test that fails on a missing key | Key-set equality asserted for both locales |
| `A-430` | 1 | Icon set from one module | No inline paths |
| `A-431` | 1 | Keyboard-only traversal of every screen, proven by test | Tab order is tested per screen, not spot-checked |
| `A-432` | 1 | Live region announcements for async results | A resolving queue is announced once, not per row |
| `A-433` | 1 | Loading states that never shift layout | Reserved space |
| `A-434` | 1 | No uncaught exception on any screen, proven by browser test | pageerror collector asserts empty |
| `A-435` | 1 | No untranslated fallback in production | A missing key fails CI |
| `A-436` | 1 | Numbers, dates and durations localised consistently | One formatter |
| `A-437` | 1 | Offline banner and queued writes in every console | A queued action replays exactly once |
| `A-438` | 1 | One spacing and type scale across all consoles | Tokens only |
| `A-439` | 1 | Palette ranks by recency and permission | Never offers what cannot run |
| `A-440` | 1 | Primary action reachable with a thumb | Bottom placement on mobile |
| `A-441` | 1 | RTL-safe layout rules for future locales | Logical properties only, no left/right |
| `A-442` | 1 | Screen-reader labels for every control | No icon-only button without an accessible name |
| `A-443` | 1 | Shortcuts never fire inside a text field | Proven by test |
| `A-444` | 1 | Stale-build recovery in all 13 consoles | A deploy under an open console keeps the page |
| `A-445` | 1 | Status colour semantics documented and consistent | One table |
| `A-446` | 1 | Success states that say what changed | Not just 'saved' |
| `A-447` | 1 | Tables become cards below 640px | Same data, stated labels |
| `A-448` | 2 | A 'new items' affordance that does not steal focus | Banner, not modal |
| `A-449` | 2 | A 'reset everything' that is distinguishable from 'clear filters' | Two different buttons |
| `A-450` | 2 | A 'view as' preview for a lower role | Read-only, clearly labelled |
| `A-451` | 2 | A bulk bar that states the count and the action | Before and after the action |
| `A-452` | 2 | A changelog badge on a screen that changed recently | Dismissible |
| `A-453` | 2 | A clear-all that asks before discarding typed filters | One confirm |
| `A-454` | 2 | A column that can be pinned while scrolling | Prints without the pin |
| `A-455` | 2 | A compact mode that hides secondary columns | Remembered |
| `A-456` | 2 | A confirm modal that names the record by its human name | Not by id alone |
| `A-457` | 2 | A date input that accepts typed input | No calendar-only |
| `A-458` | 2 | A dismissible banner channel for incidents | One active banner at a time |
| `A-459` | 2 | A filter chip row that shows every active filter | Each removable |
| `A-460` | 2 | A form error summary that links to each field | Focus moves to the first |
| `A-461` | 2 | A hold-to-peek shortcut overlay | Released closes |
| `A-462` | 2 | A number input that accepts Bengali digits | Parsed and normalised |
| `A-463` | 2 | A query-string diff when a filter changes | Back restores the prior view |
| `A-464` | 2 | A resizable split pane that remembers its size | Both screens |
| `A-465` | 2 | A result count that updates as filters change | No stale number |
| `A-466` | 2 | A row action menu that is keyboard operable | Enter, arrows, escape |
| `A-467` | 2 | A row can be opened in a new tab | Deep links are real URLs |
| `A-468` | 2 | A row that can be excluded from a bulk action | Excluded rows are listed |
| `A-469` | 2 | A sticky filter bar that stays usable while scrolling | No overlap |
| `A-470` | 2 | A sticky header that survives a long table | No lost context |
| `A-471` | 2 | A table that remembers its page size | Per screen |
| `A-472` | 2 | A time input with an explicit zone label | Shown beside |
| `A-473` | 2 | A visual hierarchy pass on every screen's primary action | One primary per screen |
| `A-474` | 2 | A wide mode that uses the full viewport | Remembered |
| `A-475` | 2 | An aria-live region for queue counts | Announced on change once |
| `A-476` | 2 | An outline that matches the visual order | Tested |
| `A-477` | 2 | Bengali search and sort ordering | Tested with fixtures |
| `A-478` | 2 | Command palette reachability audit | Every screen action appears in the palette |
| `A-479` | 2 | Consistent back affordance on every detail screen | One pattern |
| `A-480` | 2 | Consistent status vocabulary across all consoles | One enum, one set of words |
| `A-481` | 2 | Copy deck for every error message | Reviewed against a style sheet |
| `A-482` | 2 | Copy deck: every error message names the next action | Reviewed against a style sheet |
| `A-483` | 2 | Dark and light theme screenshot baseline comparison | A visual diff fails on an unintended change |
| `A-484` | 2 | Date, time and timezone shown with an explicit zone | Every timestamp names its zone |
| `A-485` | 2 | Density and zoom preferences persisted per operator | Both survive sign-out |
| `A-486` | 2 | Density modes at comfortable and compact | Both audited |
| `A-487` | 2 | Drawers become full-screen sheets | Esc and back both close |
| `A-488` | 2 | Duration and relative time in the reader's language | No untranslated unit |
| `A-489` | 2 | Empty, loading, error and populated state tests | Four tests per screen, asserted by count |
| `A-490` | 2 | Every table has a row-count summary | Above and below |
| `A-491` | 2 | Focus ring visible on every surface including dark | Measured |
| `A-492` | 2 | Long ids are truncated with a copy affordance | No id ever wraps the layout |
| `A-493` | 2 | Motion budget: nothing above 200ms | Audited |
| `A-494` | 2 | Offline banner does not cover the action bar | Measured overlap zero |
| `A-495` | 2 | Pagination with a stable cursor under live inserts | No row is skipped or duplicated |
| `A-496` | 2 | Palette shows the resulting URL before navigating | Preview on hover |
| `A-497` | 2 | Palette supports arguments with a prompt | Two-step commands work |
| `A-498` | 2 | Per-operator interface language independent of the member site | Stored |
| `A-499` | 2 | Print stylesheet per console | Printing hides navigation and keeps the data |
| `A-500` | 2 | Print stylesheet per console | No chrome |
| `A-501` | 2 | Printable shortcut sheet per console | Both languages |
| `A-502` | 2 | Pull to refresh with a visible state | Does not double-fetch |
| `A-503` | 2 | Reduced motion, high contrast, and zoom to 200% | All three tested per console |
| `A-504` | 2 | Relative and absolute time side by side on detail views | Never ambiguous |
| `A-505` | 2 | Scroll position restored on back | Per screen |
| `A-506` | 2 | Search that tolerates Bengali and English input equally | Both scripts match the same record |
| `A-507` | 2 | Shortcut customisation per operator | Stored and respected |
| `A-508` | 2 | Sticky bulk bar on mobile | Does not cover content |
| `A-509` | 2 | Timestamps in the operator's zone with a hover for UTC | Both available |
| `A-510` | 2 | Toasts queue in order and never stack over the bulk bar | Measured |
| `A-511` | 2 | Translation review status per console | Who reviewed, when |
| `A-512` | 3 | A consistent empty-search state | Suggests the filter to relax |
| `A-513` | 3 | A consistent page transition that respects reduced motion | No jarring swap |
| `A-514` | 3 | A first-run tour that can be skipped | Three steps maximum |
| `A-515` | 3 | A focus ring that works on both themes | Measured |
| `A-516` | 3 | A high-contrast mode test | Passes at 200% zoom |
| `A-517` | 3 | A keyboard-visible shortcut hint on every action menu item | Shown, not hidden |
| `A-518` | 3 | A right-to-left ready layout | Logical properties only |
| `A-519` | 3 | A scrollbar that is always visible on a long list | No hidden overflow |
| `A-520` | 3 | A tab that restores after a reload | Last tab restored |
| `A-521` | 3 | Consistent iconography from one module | No inline path data outside icons.tsx |
| `A-522` | 3 | Dark mode screenshots reviewed for contrast | Both themes |
| `A-523` | 3 | Empty states illustrated in CSS, not images | No new assets |
| `A-524` | 3 | Landscape phone layout | No clipped controls |
| `A-525` | 3 | Micro-interaction budget: none over 200ms | No transition blocks input |
| `A-526` | 3 | No layout shift from any async panel | CLS contribution asserted at 0 |
| `A-527` | 3 | Palette keeps focus on close | Returns to the invoking control |
| `A-528` | 3 | Palette search tolerates Bengali input | Tested with fixtures |
| `A-529` | 3 | Print in both locales | No clipped glyphs |
| `A-530` | 3 | Skeleton shapes that match the final layout | Measured offset under 2px |
| `A-531` | 3 | Tablet split view | List and detail together |
| `A-532` | 3 | The console shell shows the current timezone and language | Two small labels |

#### Hardening: tests, budgets, proof — 92 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-611` | 1 | A console that fails to load shows the build id and a copy button | No blank screen |
| `A-612` | 1 | A frozen console is detectable: heartbeat every 30s | Stale heartbeat is a banner |
| `A-613` | 1 | A test asserting every RPC name exists in the migrations | No typo reaches production |
| `A-614` | 1 | A test asserting every console App.tsx mounts without a provider | No missing context |
| `A-615` | 1 | A test asserting every locale key used exists in both files | No raw key on screen |
| `A-616` | 1 | A test asserting every permission string used exists in role_permissions | No dead check |
| `A-617` | 1 | A test asserting every tab renders a non-empty region | No dead tab |
| `A-618` | 1 | A test that every console builds in CI | Thirteen builds |
| `A-619` | 1 | A test that every console has a manifest and icons | Installable |
| `A-620` | 1 | A test that every console sets a CSP without inline script | Audited |
| `A-621` | 1 | A test that every console's dist fits the budget | Measured number recorded |
| `A-622` | 1 | A test that no console ships a source map | Audited |
| `A-623` | 1 | Audit shape snapshot test | A new column or a changed field fails until reviewed |
| `A-624` | 1 | Concurrency test for every claim and counter | 100 parallel calls, one winner |
| `A-625` | 1 | Console browser suite covering every console's primary screen | pageerror collector empty on all 13 |
| `A-626` | 1 | Console stale-build recovery test, the same one main-site has | Fails without the fix, proven |
| `A-627` | 1 | Contract test: existing client RPC signatures unchanged | Old arguments still work |
| `A-628` | 1 | Contrast audit covers every console, both themes | Zero off-token pairs |
| `A-629` | 1 | Database proof harness for every new RPC | One proof per RPC, in db:prove |
| `A-630` | 1 | Deploy marker in the UI footer | A duty operator can state the build |
| `A-631` | 1 | Error boundaries per panel, not per app | One panel failing keeps the rest |
| `A-632` | 1 | Every RPC call has a timeout and a stated failure mode | No infinite spinner |
| `A-633` | 1 | Every destructive RPC writes an audit row, asserted by test | The row exists after the call |
| `A-634` | 1 | Every new RPC has a permission check asserted by test | A call without permission raises |
| `A-635` | 1 | Every new RPC has an EXPLAIN baseline stored | Slow queries are caught in review |
| `A-636` | 1 | Every new index is justified in the migration comment | No unexplained index |
| `A-637` | 1 | Every new table has an explicit grant list | No table readable by default |
| `A-638` | 1 | Every table has a stated growth estimate | Capacity is planned, not discovered |
| `A-639` | 1 | Health endpoint per console checked every minute | Degraded is visible |
| `A-640` | 1 | Idempotency test for every issue and create | Double submit yields one row |
| `A-641` | 1 | Idle warning with a 60-second extend | One click |
| `A-642` | 1 | Migration reversibility check for additive changes | Rollback script present and proven |
| `A-643` | 1 | No raw hex, no inline colour, no emoji in any console | Audit gates extended to all 13 |
| `A-644` | 1 | Partial failure in a batch reports which items failed | Receipt lists them |
| `A-645` | 1 | Per-console bundle budget in CI with a measured number | Every console measured, none over 250 KB |
| `A-646` | 1 | Per-console typecheck, lint and test in CI | Zero warnings, enforced |
| `A-647` | 1 | Permission matrix snapshot test | Any change to grants fails until reviewed |
| `A-648` | 1 | RLS proof for every new table | Deny-by-default proven by a negative test |
| `A-649` | 1 | Rate-limit test per privileged RPC | Burst is bounded and reported |
| `A-650` | 1 | Retry only idempotent operations | Proven by test |
| `A-651` | 1 | Session length and idle timeout stated in the UI | Warned before expiry |
| `A-652` | 2 | A backup verified by restore, quarterly | Dated evidence |
| `A-653` | 2 | A canary release flag per console | New UI to 10% of staff first |
| `A-654` | 2 | A health endpoint per console | Deployment verification is automated |
| `A-655` | 2 | A kill-switch flag per console | A broken console can be disabled without a deploy |
| `A-656` | 2 | A lint rule banning direct fetch in a console screen | All IO through the kit |
| `A-657` | 2 | A lint rule banning new Date() in render paths | Time is injected |
| `A-658` | 2 | A lint rule that requires a reason parameter on destructive RPCs | Enforced at the type level |
| `A-659` | 2 | A migration dry-run against a production snapshot | Runs before merge |
| `A-660` | 2 | A query budget per screen | No screen above 6 calls |
| `A-661` | 2 | A rollback script for every migration | Present and tested |
| `A-662` | 2 | A test asserting every console has a kill-switch flag | Every flag seeded |
| `A-663` | 2 | A test asserting every destructive verb has a runbook file | No verb without instructions |
| `A-664` | 2 | A test asserting every queue has an SLA policy | No unowned queue |
| `A-665` | 2 | A test that every console handles a 401 by returning to sign-in | No loop |
| `A-666` | 2 | A test that every console handles a 403 without a crash | Explains the permission |
| `A-667` | 2 | A test that every console handles a 500 with a retry | Retry succeeds on the next call |
| `A-668` | 2 | A test that every console survives a missing translation | Fails the parity gate instead |
| `A-669` | 2 | A test that every console survives a very long string | No layout break |
| `A-670` | 2 | A test that every console survives an empty database | Empty states, not crashes |
| `A-671` | 2 | Accessibility automated pass on every console | Zero critical axe findings |
| `A-672` | 2 | Bengali numeral rendering test | No mixed digits |
| `A-673` | 2 | Bundle regression test: growth above 5% fails | Budget is a ratchet |
| `A-674` | 2 | Chaos test: the database is slow, the UI stays usable | Timeouts surface as retryable errors |
| `A-675` | 2 | Circuit breaker on a failing endpoint | Opens after five failures, resets |
| `A-676` | 2 | Clock skew detection | Warns when the device clock is wrong |
| `A-677` | 2 | Console-specific error fingerprints | Grouped across deploys |
| `A-678` | 2 | Cross-tab consistency test | Two tabs cannot disagree |
| `A-679` | 2 | Degraded mode: read-only when the write path is down | Banner explains |
| `A-680` | 2 | Deploy smoke: sign in, open each console, close | Runs on every production deploy |
| `A-681` | 2 | Every console has a README with its permission list | Each action mapped to a permission |
| `A-682` | 2 | Every console has an owner and a review date | Stale owner is flagged |
| `A-683` | 2 | Feature flag audit: who toggled what and when | Every flip recorded |
| `A-684` | 2 | Keyboard-only traversal recorded per console | Tab order asserted |
| `A-685` | 2 | Kill-switch drill documented | Under two minutes |
| `A-686` | 2 | Load test of the queue screen at 5,000 rows | First paint under 1.5s |
| `A-687` | 2 | Offline test: queue a write, reconnect, exactly one applied | Asserted by row count |
| `A-688` | 2 | Queue drain on reconnect with a cap | Bounded, reported |
| `A-689` | 2 | Rollback rehearsal documented and timed | Under 10 minutes to a known-good build |
| `A-690` | 2 | Screenshot baseline per console, both themes | Diff fails on unintended change |
| `A-691` | 2 | Session-expiry mid-action test | The action resumes after re-auth |
| `A-692` | 2 | Storage quota handling | Clear message, no silent loss |
| `A-693` | 2 | i18n key parity test per console | Missing key fails |
| `A-694` | 3 | A bundle composition report committed per console | Reviewed on change |
| `A-695` | 3 | A slow-query report per console | Ranked |
| `A-696` | 3 | A status widget in the shell showing the operator's own permissions | No guessing |
| `A-697` | 3 | A test that every audit action string is namespaced | verb.noun, always |
| `A-698` | 3 | Bundle composition report per console | Largest modules listed |
| `A-699` | 3 | Dead code and unused export report | Clean at release |
| `A-700` | 3 | Offline-capable last-read cache | Read-only, labelled |
| `A-701` | 3 | Performance budget for interaction latency | 70ms to visible feedback |
| `A-702` | 3 | Visual regression for the design tokens | Token change is intentional |

#### Tools and generators — 12 features

| ID | T | Feature | Acceptance |
|---|---|---|---|
| `A-1002` | 1 | A console scaffolding command | Creates a console with tests and a flag |
| `A-1003` | 1 | A feature-flag seeding script for a new console | No hand-edited SQL |
| `A-1004` | 1 | A permission seeding script for a new action | Idempotent |
| `A-1005` | 1 | A screen generator that adds the four state tests | Never a screen without them |
| `A-1006` | 1 | An RPC generator that adds the permission, audit and proof | Never an RPC without them |
| `A-1007` | 2 | A docs generator for the console directory | From the code |
| `A-1008` | 2 | A fixture builder for every entity | Consistent test data |
| `A-1009` | 2 | A migration linter for the three rules (grant, permission, audit) | Fails on violation |
| `A-1010` | 2 | A permission constant module shared by code and migrations | One source of truth |
| `A-1011` | 2 | A runbook linter: every destructive verb has one | Fails CI |
| `A-1012` | 2 | A storybook-free component gallery page | Every primitive visible in both themes |
| `A-1013` | 3 | A design-token export consumed by every console | No duplicated values |

### 3.2 How a feature is declared done

A feature is done when all six are true. The ledger in Response 10 has one row
per feature with these six columns, because "implemented" has to mean
something specific:

1. **Rule** — the pure function in `model.ts` or `domain/*.ts`, unit tested.
2. **Authority** — the RPC or policy that enforces it, with its permission.
3. **Screen** — the control that reaches it, in both themes, both languages.
4. **Proof** — a test that fails if the rule or the authority regresses.
5. **Audit** — the row it writes, with reason and diff.
6. **Copy** — `en` and `bn` strings, no untranslated fallback.

### 3.3 What is explicitly *not* being built

Saying no is part of a plan. These were considered and rejected:

- **A generic SQL console.** `CliConsole` already refuses arbitrary SQL, and
  that refusal is a feature. A SQL box would put the whole schema one typo
  from a support ticket.
- **Client-side-only role checks.** Every gate stays server-side.
- **A second design system.** The consoles share `styles.css`; adding a
  component library would double the review surface for no user benefit.
- **Emoji icons.** `audit.mjs` C-01 forbids them and the icons module is the
  contract.
- **Charts that are not accessible.** Any visualization without a table twin
  and keyboard traversal is rejected at review.

### 3.4 Counts

**Total features: 1013**

| Tier | Meaning | Count |
|---|---|---:|
| T1 | Control — the platform is unsafe without it | 428 |
| T2 | Operation — the platform is slow, blind or error-prone without it | 467 |
| T3 | Craft — the platform is unpleasant without it | 118 |

| Area | Features |
|---|---:|
| Kit primitives and platform services | 92 |
| Operations: queues, handover, reviews | 72 |
| Security: permission and session spine | 6 |
| Communication craft | 12 |
| Compliance and privacy | 15 |
| Data: analytics, reporting, explorer | 34 |
| Documents: certificates and notices | 30 |
| Editor craft | 14 |
| Money: wallets, invoices, payouts | 14 |
| People and safety (cross-console) | 70 |
| Reporting | 15 |
| Runtime: config, custom pages, IP, integrations | 35 |
| Search and discovery | 10 |
| Security hardening | 17 |
| Signal: vitals, incidents, verification | 54 |
| admin-site — command deck | 43 |
| bsdc-cert | 22 |
| bsdc-config | 24 |
| bsdc-connect | 18 |
| bsdc-custom | 21 |
| bsdc-ip | 22 |
| bsdc-mod | 22 |
| bsdc-notice | 21 |
| bsdc-perf | 21 |
| bsdc-status | 15 |
| bsdc-uadmin | 21 |
| bsdc-umod | 16 |
| bsdc-vf | 12 |
| main-site /admin hub | 6 |
| Craft: interface, accessibility, language, mobile | 135 |
| Hardening: tests, budgets, proof | 92 |
| Tools and generators | 12 |
| **Total** | **1013** |

---

## 4. The ten responses in detail

Each response below lists its work items by feature ID, the gates it must
clear, and what it explicitly does not cover. The gates are the same suite
that exists today, extended: `typecheck`, `lint`, `prettier`, `vitest`,
`vite build`, `audit.mjs`, `release-check.mjs`, `count-registry.mjs`, and the
browser suites.

### Response 2 — Foundation

The workspace scaffolding, the kit's new primitives (table, form, drawer,
chart, toast, timeline), the design tokens for a console that is used at 03:00
on a phone, and the command layer that every screen will call. Nothing
user-facing ships here; every later response depends on it.

### Response 3 — Identity, permission, audit

The security spine: the permission writer, scopes, expiring grants, session
and device governance, the audit helper with `request_id`/`reason`/`diff`, and
the trigger that makes an unaudited state change fail. This is the response
that closes G1, G2, G3, G4 and G8, and it is deliberately early because five
later features are unsafe without it.

### Response 4 — `admin-site`

The command deck: telemetry that is honest about its own freshness, bulk
governance with a preview of exactly what will change, CLI 2.0 with
`--dry-run`, fuzzy completion and a real help system, approvals with SLA
countdowns, campaign performance, SEO with a live SERP preview, redirects with
loop detection, and branding with side-by-side theme comparison.

### Response 5 — People and safety

`users-admin-site`, `users-moderator-site`, `moderator-site`: a person record
that answers the question actually asked in an escalation (what did they do,
what was done to them, what is open), moderation with severity, SLA, repeat
offenders, and an appeals path that did not exist.

### Response 6 — Documents with legal weight

`certificate-site` and `notice-site`: issuance with verification codes that
cannot collide, amendment chains a reader can follow, revocation that explains
itself, notices with acknowledgement rosters and a publication clock.

### Response 7 — Runtime and edge

`config-site`, `customize-site`, `ip-site`: typed settings with validation and
rollback, custom pages with a real preview, and IP rules with a simulator and
a "why did this request get in" tracer.

### Response 8 — Signal and communication

`performance-site`, `connect-site`, `status-site`, `vf-site`: vitals with
regression alerts, an incident lifecycle that posts to status, staff channels
with presence and search, and a verification desk that answers in one query.

### Response 9 — Cross-cutting craft

Accessibility to WCAG 2.2 AA proven by keyboard-only traversal of every
screen, full `en`/`bn` parity proven by a test that fails on a missing key,
touch targets measured at 250px, offline and stale-build recovery everywhere,
performance budgets enforced per console, and a browser suite for the consoles.

### Response 10 — Execution and proof

The batch order (what merges when), the acceptance matrix (feature ID × gate),
the risk register with owners, the runbook for each destructive operation, and
the ledger that counts delivered features and states the total.

---

## 5. Non-negotiables for the implementation

These are constraints on every response, stated once so they are not repeated
or forgotten:

1. **No screen is the only guard.** Every capability names the database object
   that enforces it.
2. **Every destructive action takes a reason** and writes a diff.
3. **No raw hex, no raw `text-[11px]`.** Tokens only; the contrast audit must
   stay clean.
4. **Both languages, both themes** for every new string and surface.
5. **250px to 4K**, no horizontal scroll, 44px touch targets.
6. **No `console.log`, no `TODO`, no placeholder copy** in shipped code.
7. **The bundle budget applies to the consoles**, not just `main-site`.
8. **A test that cannot fail is not a test** — every new guard is proven by
   disabling the fix and watching the test go red, exactly as `5967a2e` did.
9. **Web only.** `android-app/**`, `supabase` contracts that member clients
   depend on, and the version pin stay untouched unless a migration is
   additive.
10. **Backwards compatible.** Existing RPC signatures do not change; new
    behaviour arrives as new parameters with defaults.

---

## 6. What success looks like

A duty operator, at 03:00, on a phone, in Bangla, with one bar of signal,
opens a console, sees what needs attention, understands why it matters, does
the smallest correct thing, and can prove afterwards exactly what they did and
why — including to themselves, six months later, from the audit row alone.

That is the whole plan. Everything that follows is the work.

---

## 7. The foundation in detail

This section specifies Response 2 completely enough to build without asking
questions. Everything here lives in `corporate-kit`, because a per-console copy
of a table or a form is how thirteen consoles drift into thirteen behaviours.

### 7.1 Why the kit and not a component library

There is a tempting shortcut here: pull in a data-grid package, a form library,
and a chart library, and get 80% of this for free. It is the wrong trade for
this codebase, for four reasons that are specific rather than philosophical.

**The bundle ceiling is 250 KB gzip per console** (`scripts/audit.mjs` F-01).
A mature grid package is 40–90 KB on its own; a charting package is another
60–120 KB. Two dependencies would consume most of the budget before a single
screen rendered, and every console shares the same ceiling.

**The accessibility contract is stricter than most libraries ship.** Every
chart needs a table twin, every icon-only control needs an accessible name and
a shortcut hint, focus must be visible on both themes and return correctly from
every drawer. Retrofitting that onto a third-party grid costs more than writing
the grid.

**Bengali is a first-class locale, not a translation.** Number formatting,
sort collation, input parsing of Bengali digits, and line-height rules for the
Bangla script all have to be handled deliberately. A library that formats dates
with `Intl` defaults will render Bengali numerals in one place and Latin in
another, and the parity test will catch it — after the library is already
everywhere.

**Every table in this plan is an interface to a privileged action.** A row is
not decoration; it is a report to claim, a certificate to revoke, a person to
suspend. The selection model, the bulk bar, the confirmation, and the audit
reason are one cohesive flow. That flow is the product here, and it is cheaper
to own it than to bend a grid to it.

So the kit grows. It stays under the budget by loading heavy surfaces lazily —
the same technique `main-site` already uses per route — and by keeping the
primitives free of dependencies.

### 7.2 The primitive set

Twelve components cover every screen in the fourteen surfaces. Each has four
required states (empty, loading, error, populated) and two themes, which is
what the four-state test count per screen enforces.

**`DataTable`** — the workhorse. Column definition carries a key, a header, a
cell renderer, a sort comparator, an alignment, a numeric flag (which switches
to tabular figures and right alignment), and a permission expression for
whether the column is even visible. The table owns sticky headers, keyboard
cell traversal, shift-click range selection, a selection count that survives
pagination, and a row action menu that is operable by keyboard. It virtualises
above 200 rows. Sorting is stable by design and always has a visible direction;
a header click toggles ascending, descending, then back to the default order,
because "unsorted" is a real state an operator returns to.

**`FilterBar`** — a row of chips, each showing one active filter with a remove
affordance, a clear-all that asks before discarding typed input, and a count
that updates as filters change. It serialises to the query string, which is what
makes a view shareable and a browser back button work.

**`Field`** — label, hint, error, character count, required marker, and a
control slot. It renders the same validation message the database constraint
would produce, phrased identically, because two different phrasings for one rule
is how people learn to distrust both.

**`Drawer` and `Modal`** — focus trap, return focus to the invoking control,
Escape to close, a title that is not optional, and exactly one primary action.
On mobile the drawer becomes a full-height sheet; both remain reachable by
keyboard and neither scrolls the page behind it.

**`Confirm`** — the destructive path. It names the record by its human name and
its id, states the effect in one sentence, lists what will stop working, and
requires a typed confirmation for the twelve verbs that can lose data or access.
The phrase is derived from a registry rather than typed into each screen.

**`Toast`** — a queue, not a stack. Toasts never overlap the bulk bar; they
render above it with a measured offset. Every reversible action gets an undo
inside the toast for eight seconds.

**`Chart`** — line, bar, sparkline, and heatmap, each accepting a `twin` prop
that renders the same data as an accessible table. A chart without a twin does
not compile: the prop is required, and the review rule is that no chart ships
without it.

**`Diff`** — two JSON blobs or two strings, rendered field by field for JSON
rather than line by line, because a line diff of pretty-printed JSON highlights
punctuation instead of meaning.

**`Timeline`** — chronological entries with an actor, a verb, a subject, a
timestamp, and an optional reason. It is the same component used for a person's
history, a certificate's revisions, an incident's updates, and an audit trail,
so the visual grammar of "what happened" is identical everywhere.

**`CommandPalette`** — already exists in the kit; it grows the ability to *run*
an action, not only navigate to a screen, with arguments prompted in a second
step and a preview of the effect before it commits.

**`Empty`, `Skeleton`, `ErrorState`** — the three states nobody test-writes and
everybody sees. `Empty` names what will appear and when. `Skeleton` reserves the
final layout to within 2px so nothing shifts when data lands. `ErrorState`
distinguishes retryable from permanent and carries a copyable request id.

**`Breadcrumb`** — reflects the real navigation stack, so backing out of a deep
link returns where the operator actually came from.

### 7.3 The platform services

Six modules, each with one responsibility, all in `corporate-kit/data`.

**`session.tsx`** grows three things. First, a permission probe at boot: the
shell asks what this operator may do once, before rendering any data, so a
console never offers a button it cannot honour. Second, an idle timer that
warns sixty seconds before expiry and offers one click to extend. Third, a
session list: device, coarse location, last seen, and a revoke action per
session, backed by the table described in §9.4.

**`rpc.ts`** grows a typed call wrapper that carries a request id, a timeout,
and a classification of the failure — permission, validation, conflict,
transient, or unknown. Every screen reacts differently to those five, and today
they all arrive as one shape.

**`mutations.ts`** is new. It owns the optimistic apply, the rollback on
failure, the toast, and the cross-tab notification so a second tab re-renders.
It also owns the offline queue: a write made without a network is held, shown
as pending on the row it affects, and replayed once on reconnect with a
deduplication key so a double replay cannot produce two rows.

**`freshness.ts`** is new and small. Every panel that shows data reports when it
was measured. The module exposes a `useFreshness` hook that returns an age and
a state — fresh, ageing, stale — and a panel renders a badge, not a blocking
spinner. This is the difference between a dashboard an operator trusts and one
they refresh by habit.

**`realtime.ts`** already exists; it grows presence for the staff channels and a
subscription registry so a screen that unmounts cannot leak a channel.

**`chunk-recovery.ts`** moves here from `main-site` unchanged in behaviour, with
its tests. All thirteen consoles adopt it in the shell. This closes G5.

### 7.4 The design tokens

The kit's `styles.css` carries the tokens. The upgrade adds what a console needs
that a public site does not:

- **A status scale** — neutral, info, success, warning, danger, and a distinct
  `critical` that is used only for an action that is irreversible or an
  incident that is active. Six states, each with a shape and a word so colour is
  never the only signal.
- **Density tokens** — row height, cell padding, and control height at
  comfortable and compact, so a density switch is a class on the root rather
  than a per-component prop.
- **A focus ring** measured against both themes for a 3:1 contrast ratio and a
  2px visible outline, which the audit asserts rather than assumes.
- **A chart palette** of six categorical colours that remain distinguishable
  under deuteranopia; the palette is validated in the contrast script.
- **Print tokens** — a print stylesheet with no chrome, page numbers, and a
  header carrying the console name and the build.

No raw hex, anywhere. The contrast audit runs over the built CSS of every
console, not just `main-site`, and the gate fails on a single off-token pair.

---

## 8. The command deck in detail

Response 4 upgrades `admin-site`, which is the console an owner opens first. It
is where the numbers are, where the bulk actions happen, and where the CLI
lives. Its current shape — nine tabs, 5.4k lines — is sound; the upgrade is
depth, not replacement.

### 8.1 Telemetry that is honest

The current `admin_telemetry_snapshot` returns a flat set of counts. That is
useful and insufficient, because a count with no age and no comparison cannot
answer the question an operator is actually asking: *is this normal?*

The upgrade keeps the RPC's signature and adds three things.

**Age.** Every number carries the timestamp of the query that produced it. The
panel shows the age; the telemetry is considered stale after five minutes and
the badge says so. A number from yesterday that looks like a number from now is
the most dangerous object in an operations console.

**Delta.** The snapshot is computed twice — current window and the preceding
window of the same length — and returns both. The UI shows the delta with its
direction. This is done in one RPC rather than two round trips, and the window
is a parameter so a test can pin it.

**Provenance.** Every KPI names the table or RPC it came from, printed in a
tooltip and available to a copy action. When a number looks wrong, the first
question is "where does this come from", and the answer should be one click.

### 8.2 Approvals with an SLA clock

`Approvals.tsx` currently lists pending shops and campaigns. The upgrade adds:

- **A policy table**, `sla_policies`, keyed by queue and severity, with a
  response target. The clock starts at the item's `created_at`, and a row past
  target sorts first and turns critical.
- **A decision reason**, mandatory, stored in `audit_log.reason` and echoed in
  the member-facing message.
- **A two-person rule** for payouts above a threshold and for ad credit above a
  threshold. The second person cannot be the first, asserted in the RPC, not in
  the UI.
- **A creative preview** inside the decision drawer, so an approval is made
  looking at the thing being approved rather than at its title.
- **A receipt** for every decision, fetchable by id for ninety days.

### 8.3 Bulk governance with a preview that is the action

The `BulkWorkbench` currently collects ids and calls a bulk RPC. The upgrade
makes the preview authoritative: the same resolver that the RPC will use runs
first in dry-run mode and returns, per id, what will change from what to what.
That output is diffable and exportable. Then the apply runs the same resolver
and returns a receipt; if any item fails, the receipt names it and the batch
reports which items committed, because "all-or-nothing" and "partial" are both
legitimate and the operator must be told which one happened.

The dry-run is not a reimplementation. It is the same function with a flag, and
a test asserts that the preview's prediction equals the apply's receipt for a
fixture set of one hundred rows. A preview that can drift from the action is
worse than no preview.

### 8.4 CLI 2.0

The CLI is the fastest interface an experienced operator has, and it is where
G10 lives: there is no dry-run.

**`--dry-run` prints what would happen.** It resolves record ids, validates
arguments, checks permissions, and prints the resulting plan — including the
audit action string it would write — without performing anything. A test
asserts the database is unchanged after a dry-run of every destructive verb.

**Fuzzy completion with a live index.** Verbs and flags complete from a static
grammar; record ids complete from a small, permission-filtered index fetched at
session start and refreshed on demand. Tab completes the unambiguous prefix and
shows the options when it is ambiguous.

**Inline help per verb.** `help cert revoke` prints the usage line, every flag,
one example, the permission required, and whether the verb is destructive and
therefore needs a confirmation.

**Destructive verbs require the subject id, typed.** Not the word "confirm" —
the id. This is deliberately annoying and deliberately specific: it forces the
operator to look at which record they are about to change.

**Macros with parameters.** A macro is a command with named slots; running it
prompts for each slot, shows the resolved command, and requires one confirmation
before executing. Macros are stored per operator, audited on save and on run.

**Transcript export.** A session transcript in markdown with every command and
its result, which is what a person attaches to an incident review.

**Structured output modes.** JSON for piping, table for reading, log for a
sequence of operations. The mode changes rendering, never the result.

### 8.5 SEO without guessing

The `Pages` tab currently edits overrides. The upgrade adds the thing that makes
an override correct: a **live SERP preview** that truncates the title at the
character count Google uses and the description at its count, so an operator
sees the cut before saving rather than after indexing. A social preview renders
the same override through the Open Graph shape, because two consumers of one
field should both be visible.

Validation grows: canonical paths cannot repeat across two overrides; a title
that is empty but a description that is not is allowed and explained; a
`noindex` override on a page that is in the sitemap is flagged as a
contradiction. **Coverage** becomes a list — which routes have no title or no
description — generated from the prerender manifest rather than typed.

### 8.6 Redirects that explain themselves

The current editor sets a from, a to, a status, and a note. The upgrade adds
**loop and chain detection** at save: A→B→A is refused with the cycle shown,
and A→B where B is itself a redirect suggests collapsing to the final target.
The hit counter already exists; it becomes a **404 source list**, because the
best redirect is the one suggested by evidence. Each top 404 offers a one-click
create with the path prefilled.

**Import and export** become round-trippable with a dry-run that reports
created, updated, and unchanged before it writes anything.

### 8.7 Branding that shows the difference

The theme editor already validates tokens. The upgrade adds a **side-by-side
preview**: the draft theme and the live theme render the same sample screen at
the same size, so the difference is visible instead of imagined. Every
foreground/background pair shows its contrast ratio live, and a pair below AA
blocks publish. Publishing requires `brand.publish` and writes an audit row with
the diff of changed tokens.

---

## 9. The security spine in detail

Response 3 is the most consequential. Five later features are unsafe without it,
and three of the eleven gaps live here. This section specifies the schema, the
RPCs, the invariants, and the tests.

### 9.1 The permission writer (closes G2)

The gap is precise: `role_permissions` is read by every privileged function and
written only by a migration. The fix is a table of grants with provenance, plus
an RPC that writes it under its own permission.

```sql
-- 0134_the_permission_table_can_be_written.sql  (additive)

create table if not exists public.permission_grants (
  id          bigserial primary key,
  role        bsdc_role not null,
  permission  text      not null,
  scope_key   text      not null default '',      -- '' means every scope
  granted     boolean   not null,
  reason      text      not null,
  granted_by  text      not null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  request_id  text      not null default '',
  constraint permission_grants_reason_len
    check (char_length(reason) between 10 and 500)
);
```

`role_permissions` stays as the base grant table — the seeded floor — and
`bsdc.has_permission(p_permission, p_scope text default '')` becomes:

1. refuse if the base table has no row for the role and permission, unless a
   non-expired grant adds it;
2. refuse if a non-expired grant of `granted = false` exists for that role,
   permission and scope;
3. otherwise allow.

That ordering matters: a deny always beats an allow, and a base grant can never
be widened by a stale row. The function stays `stable` and `security definer`
with a pinned `search_path`, like its neighbours.

`admin_set_permission(p_role, p_permission, p_granted, p_reason, p_scope,
p_expires_at)` requires `permissions.write`, refuses to act on a role at or
above the actor's own rank unless the actor is an owner, refuses
`permissions.write` on itself, and writes an audit row with the before and
after. Eleven tests pin it, including the two that matter most: a manager
cannot grant admin, and a role that has just been denied a permission is denied.

### 9.2 Scoped grants

A scope is a short string that the calling context supplies: a category for
content, a workspace for the marketplace, a region for anything regional. The
function signature is backwards compatible — `has_permission(text)` keeps
working and means the empty scope — and existing call sites are untouched.

The test that makes this safe is a **matrix snapshot**: every (role,
permission, scope) triple that currently resolves to true is captured, and any
change to that set fails the test until the diff is reviewed and the snapshot
updated. Permissions are exactly the sort of thing that should never change
without somebody looking at the change.

### 9.3 Expiring grants and the escalation flow

An escalation is a grant with `expires_at` set, a requester, and an approver.
The flow is four RPCs and two screens:

| Step | RPC | Permission |
|---|---|---|
| Request | `admin_request_escalation(permission, scope, minutes, reason)` | any staff |
| Approve | `admin_approve_escalation(id, reason)` | `people.role` |
| Revoke early | `admin_revoke_escalation(id, reason)` | `people.role` or the holder |
| List | `admin_escalations(open_only)` | `people.role` or own |

Expiry is enforced two ways, because one is not enough: the read path excludes
expired rows by comparing `expires_at` to `now()`, and a scheduled job flips
`granted` to a recorded revocation so the history shows it lapsed rather than
vanishing. A test sets a one-second expiry, waits, and asserts the permission is
gone — the same shape as the test that proves stale-build recovery works.

Separation of duties is a constraint, not a convention: the approver of an
escalation cannot be its requester, asserted in the RPC and covered by a
negative test.

### 9.4 Session and device governance (closes G9)

Today a staff session cannot be listed or revoked. The fix is a server-side
session record written when a token is issued:

```sql
create table if not exists public.staff_sessions (
  id           uuid primary key default gen_random_uuid(),
  uid          text not null references public.profiles (uid) on delete cascade,
  device_label text not null default '',
  device_hash  text not null default '',
  ip_hash      text not null default '',
  user_agent   text not null default '',
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  revoked_at   timestamptz,
  revoked_by   text,
  revoke_reason text not null default ''
);
```

`ip_hash` is written here, which is also the fix for G1: a shared edge helper
computes a salted SHA-256 of the client address once per request and every audit
row and session row uses it. No raw address is ever stored; the salt lives in an
environment secret and is documented in the security matrix.

Three RPCs follow: `staff_sessions_list()`, `staff_session_revoke(id, reason)`,
`staff_sessions_revoke_others(reason)`. The last two require `people.session`
when acting on somebody else. A revoked session fails its next privileged call
because the guard checks `revoked_at` — a negative test asserts the failure
rather than trusting it.

Concurrency limits are per role: a moderator may hold three sessions, an owner
two. The fourth sign-in is refused with a list of the existing sessions and a
one-click sign-out of the oldest.

### 9.5 The audit helper (closes G3 and G4)

The audit table gains four columns, all additive and all with defaults so
existing rows and existing inserts keep working:

```sql
alter table public.audit_log
  add column if not exists request_id text not null default '',
  add column if not exists reason     text not null default '',
  add column if not exists diff       jsonb not null default '{}'::jsonb,
  add column if not exists device     text not null default '';
```

A single helper writes rows, and it is the only place that knows the shape:

```sql
create or replace function bsdc.audit(
  p_action text, p_subject text, p_metadata jsonb default '{}'::jsonb,
  p_reason text default '', p_diff jsonb default '{}'::jsonb
) returns void
```

It fills `actor_uid` from the claim, `request_id` from the transaction-local
setting the RPC must have set, `device` from the request, and `ip_hash` from the
same edge helper as sessions. A trigger on every audited table checks that the
transaction wrote at least one row when it changed state; if it did not, the
transaction fails. That is the difference between a policy and a habit.

### 9.6 Full auditability and search

`admin_audit` grows filters: actor, action prefix, subject, request id, date
range, and a full-text search over the reason. It returns the diff and a
human-readable before/after summary. Each record's detail screen embeds the
same query scoped to that subject, which is the single most requested view in
any operations console: *what has happened to this thing*.

**Export and verification.** An export carries the rows, the range, and a
SHA-256 over the canonical serialisation. The verification desk accepts the file
and re-computes the hash, so an exported audit cannot be altered quietly.
Retention is 24 months online, with an archive table beyond that; a scheduled
job moves rows and records the move itself.

**Anomaly detection.** A rolling baseline of rows per actor per hour; a spike
above three times the baseline is surfaced on the overview as a flag, not
blocked. Blocking on a heuristic would be worse than the anomaly.

### 9.7 The twelve destructive verbs

The registry that drives the confirmation UI, the reason field, the runbook
link, and the two-person rule for the highest-impact ones:

| Verb | Permission | Confirmation | Runbook | Two-person |
|---|---|---|---|---|
| `people.suspend` | `people.suspend` | record id | yes | no |
| `people.ban` | `people.role` | record id | yes | no |
| `people.role` | `people.role` | typed phrase | yes | above manager |
| `people.delete` | `people.role` | typed phrase | yes | yes |
| `people.session` | `people.session` | none | yes | no |
| `permissions.write` | `permissions.write` | typed phrase | yes | yes |
| `plugins.write` | `plugins.write` | typed phrase | yes | above manager |
| `certificate.revoke` | `certificate.issue` | code | yes | no |
| `notice.publish` | `notice.publish` | slug | yes | no |
| `ip.rule` | `ip.rule` | address | yes | emergency only |
| `owner.transfer` | `owner.transfer` | typed phrase | yes | yes |
| `lockdown` | `owner.transfer` | typed phrase | yes | yes |

A test asserts every entry in this table has a runbook file and a permission
string that exists in `role_permissions`, which is how the table stays true.

---

## 10. People and safety in detail

Response 5 covers `users-admin-site`, `users-moderator-site`, and
`moderator-site`. These three consoles share one domain — a person and what has
happened to them — and the upgrade makes that sharing explicit in the kit rather
than implicit in three codebases.

### 10.1 The person record

The question an escalation actually asks is never "who is this person". It is
"what did they do, what was done about it, and what is open right now". So the
record leads with that: an open-items strip, then a timeline, then identity.

The **timeline** merges five sources — reports filed, moderation actions taken,
role changes, certificates, and notes — into one chronological list with a kind
filter and a date range. It is the `Timeline` primitive from §7.2, which means a
person's history and an incident's history read the same way.

**Standing** is derived, not stored twice. A points ledger records each
adjustment with a reason, a rule reference, and an expiry. The standing shown is
the sum of unexpired rows. Decay is a scheduled job that writes decay entries,
so the ledger remains the single source of truth and the history shows *why* a
score fell. A test asserts the displayed total equals the ledger sum for a
fixture with expiries.

**Warning ladder.** A policy row per severity names the step: nudge, warning,
restriction, suspension review. Taking a step records which rung was used, and
the member-facing message names the next rung. A member who can see the next
step argues with a decision; a member who cannot argues with the system.

### 10.2 Moderation with an honest clock

The queue currently ranks by severity. It gains:

- **A claim that is atomic.** `claim_report` already exists; the upgrade asserts
  the second claim loses through a concurrency test with one hundred parallel
  callers, because a double-worked report wastes two moderators and confuses a
  member.
- **An SLA clock from a policy table**, so a severity's target is data.
- **A workload view** — open, claimed, overdue per moderator — visible to a
  manager without asking, which is the only version of this that gets used.
- **Duplicate clustering** for near-identical reports on one subject, collapsing
  them with a visible count rather than hiding them.
- **Repeat-offender detection** that links cases by a shared signal (an account,
  a device hash, a payment instrument) and never by a display name alone,
  because names are not identity.
- **Reporter reliability**: a score derived from how often a reporter's reports
  are upheld. A cohort of first-time reporters all reporting the same subject
  within an hour is flagged as a pattern and is *not* treated as evidence of
  wrongdoing by the subject.
- **Appeals.** An appeal cannot be decided by the person who decided the
  original action, asserted in the RPC. The decision notifies the member in
  their own language.

### 10.3 Staff operations

`users-moderator-site` becomes the shift console. The roster gains coverage per
hour and a gap forecast; leave requests update the roster on approval; a shift
swap needs both parties and a manager; the handover note is prefilled from open
items at shift end and is carried to the next shift, because the single most
expensive failure in a 24-hour operation is context lost at the changeover.

---

## 11. Documents in detail

Response 6 covers `certificate-site` and `notice-site`. Both produce artifacts
that outlive the platform's memory of producing them, so both get the same
treatment: reproducible output, an immutable chain, and a public verification
that reveals nothing the document does not already show.

### 11.1 Certificate identity

A certificate's identity is its verification code, and that code has to be
unique under concurrency, resistant to a transposition typo, and stable forever.
The scheme is a random body plus a check character:

```
BSDC-CERT-<8 random base32>-<2 check characters>
```

The check characters are computed from the body with a published algorithm, so a
single-digit typo is rejected before it reaches a lookup. Uniqueness is a unique
index, and the insert retries on conflict up to three times; the concurrency
test fires one hundred parallel issues for one member and course and asserts
exactly one certificate exists (idempotency) and that a hundred parallel issues
across a hundred members produce a hundred distinct codes.

**Reproducibility.** The PDF is generated from a stored record and a stored
template version, with no clock and no randomness in the render path, so the
same record produces the same bytes and therefore the same SHA-256. A test
generates twice and compares hashes. That hash is what the verification desk
checks, which is what makes the receipt meaningful.

**Amendment chains.** `amend_and_reissue_certificate` already keeps history. The
upgrade makes the chain navigable in the UI: an amendment shows the fields that
changed with their before and after, links to the certificate it supersedes, and
states the reason. Restoring a revoked certificate writes a new row rather than
editing the old, so a reader can always see that it was once revoked — the thing
a revoked-then-restored certificate most needs to keep.

### 11.2 Notices with a paper trail

A notice is a published claim with an audience and an obligation to be seen.
The upgrade adds **acknowledgement**: the roster is complete, exportable, and
carries a reminder action for non-readers that is recorded so a second reminder
is a decision rather than an accident.

**Revision history** uses the same `Diff` primitive as everything else, field by
field. Reverting creates a new revision; history is never rewritten. Publishing
requires `notice.publish` and an audience, and a scheduled publication is a row
with a time, so a notice can go live at midnight without anybody being awake.

**Unpublishing** sends a withdrawal rather than deleting, so a member who saw it
learns it was withdrawn instead of finding a dead link.

**Legal hold** is a flag that blocks deletion and names its scope, which is the
only thing that makes a hold real rather than aspirational.

---

## 12. Runtime and edge in detail

Response 7 covers `config-site`, `customize-site`, and `ip-site`.

### 12.1 Settings that cannot be wrong

Every setting gets a schema: a type, a default, an owner, a description, and a
validator. The validator is one function used by the UI, the RPC, and a test, so
there is one definition of valid. A setting whose value fails its schema cannot
be stored, and the RPC that stores it calls the same validator.

**Provenance.** Every row shows where its value came from — an override, an
environment variable, or the default — because "why is this on" is answered by
the source, not the value.

**Blast radius.** Before a save, the console lists the screens and jobs that
read the key, generated from a usage map built at build time. A setting nobody
reads is flagged for removal.

**Secrets are write-only.** The read RPC returns a boolean, never a value.
Setting a secret shows *set* or *not set*, a last-rotated date, and a rotation
checklist. A secret displayed once is a secret in a screenshot.

**Rollback** restores the previous value and is itself revertible, which makes
two rollbacks a return to the original. **Staged changes** allow a second
approver for a change on a production setting, and **scheduling** applies a
value at a time instead of at a click.

### 12.2 Custom pages that are real

The builder's preview is the production renderer, not a mock — the same
component that renders the public page renders the preview, which is the only
way "it looked fine in the editor" stops being a sentence. Sections are typed,
each with required content, and a section that fails its own validation cannot
be published.

**Accessibility is checked at publish**: heading order, alt text on every image
section, and a contrast check on any custom colour, with the failure naming the
section rather than the page.

**Scheduling with an end** unpublishes automatically, and a **reserved-path
guard** refuses a slug that collides with a route. **Version history** reverts
by creating a new version, and **JSON import/export** round-trips byte for byte.

### 12.3 IP rules with a reason

The rule engine gains three things an operator actually needs.

**A simulator** answers "why did this address match" by evaluating the rule list
in order and naming the rule that decided, with the field that matched. This is
the difference between a blocked customer and a five-minute investigation.

**A dry-run against the last seven days** of edge logs, showing the requests
that would have been blocked. A block that would have taken out a payment
callback is visible before it is saved.

**A request tracer** by request id, listing every rule evaluated and the
outcome, which is what an incident review asks for.

**Shadow mode** logs what would have been blocked without blocking, so a new
rule can prove itself for a day before it is armed. **Expiry and a review date**
are mandatory, because a permanent block added during an incident is how a
platform loses a customer six months later.

---

## 13. Signal in detail

Response 8 covers `performance-site`, `connect-site`, `status-site`, and
`vf-site`.

### 13.1 Vitals that lead to an action

A dashboard that shows p75 LCP per route is a report. A dashboard that says
*this route crossed its budget on three consecutive runs, here is the delta,
here is the release that introduced it, here is the error that correlates with
it* is a tool. The upgrade builds the second one:

- **Budgets are data**, per route per metric, editable and audited.
- **A regression alert** fires on three consecutive breaches and names the
  route, metric, delta, and the release.
- **Release comparison** shows this build against the last, per metric.
- **Error correlation** links a vitals regression to the error fingerprint that
  appeared in the same window, without claiming causation.
- **Small-sample honesty**: below a stated floor, a metric is shown as
  insufficient rather than as a trend.

**Bundle watch** becomes real: every console is built in CI and measured against
250 KB, closing G7, and a console over budget fails the pull request rather than
a review.

### 13.2 Incidents that survive their own resolution

The lifecycle is declare, update, resolve, post-mortem, and each transition
writes a timestamp and an author. Two boxes exist for every update — an internal
note and a customer-facing message — and they are never the same field, because
the failure mode is a customer reading "we think it was the cache" as an
official statement.

Declaring an incident **publishes to the status board** and **creates a staff
channel**, linking both back to the incident, so the conversation and the public
record do not diverge. Resolving requires a customer-facing summary and opens a
post-incident action list with owners and dates, tracked to closure. **Drill
mode** rehearses the whole flow without notifying anyone.

### 13.3 Verification that answers in one query

The desk accepts a certificate code, a notice id, or a file hash and answers in
one query with what is verified and by what. Revoked and unknown are different
answers and are never conflated. The response carries no field the document does
not already carry, asserted by a test that compares the response keys to an
allow-list.

**Rate limited** to stop enumeration, **batch** for a CSV of codes, and
**embeddable** for a third party with no PII. Every attempt is counted in
aggregate only.

---

## 14. Cross-cutting craft

Response 9 is where this stops being a collection of screens and becomes a
product. Every item here applies to all fourteen surfaces and is asserted, not
aspired to.

### 14.1 Accessibility as a gate

WCAG 2.2 AA is the floor. The specifics that matter in a console:

- **Keyboard only.** Every screen is traversed by keyboard in a test, asserting
  the tab order reaches every control and that focus is visible at each stop.
- **Live regions.** A resolving queue is announced once, not once per row.
- **Names.** No icon-only control without an accessible name and a shortcut
  hint in its tooltip.
- **Colour is never alone.** Six status states, each with a shape and a word.
- **Zoom to 200%** and a high-contrast mode are tested per console.
- **Charts have twins.** The `twin` prop is required, so this cannot be skipped.
- **Reduced motion** disables every transition.

### 14.2 Language as a first-class citizen

Every console ships both locales, and a test asserts key-set equality so a
missing translation fails CI rather than rendering a raw key. Beyond parity:

- **Bengali digits** wherever a number is formatted, never mixed with Latin
  digits within one string.
- **Bengali sort collation** and **Bengali input parsing**, so a date typed in
  Bengali digits is understood.
- **Script-appropriate line height** for Bangla, measured rather than assumed.
- **Logical CSS properties only**, so a future RTL locale is a translation job
  rather than a layout project.

### 14.3 Mobile is the primary case at 03:00

The operator at night is holding a phone. So:

- Tables become cards below 640px, with the same data and stated labels.
- The primary action sits within thumb reach.
- Drawers become sheets; Escape and back both close them.
- The offline banner never covers the action bar — measured, not eyeballed.
- 250px to 4K with no horizontal scroll, tested at nine widths.

### 14.4 Resilience

A console that hangs is worse than a console that fails, because it does not
tell you. Every call has a timeout and a stated failure mode; every panel has an
error boundary so one failure does not take the screen; retries apply only to
idempotent operations, proven by test; a heartbeat every thirty seconds makes a
frozen console detectable; and a circuit breaker opens after five consecutive
failures on an endpoint rather than hammering it.

### 14.5 Performance budgets, enforced

- **Initial JS ≤ 250 KB gzip per console**, measured in CI.
- **Interaction to visible feedback ≤ 70ms** for a local action.
- **First paint of a 5,000-row queue ≤ 1.5s.**
- **No layout shift** from an async panel: contribution asserted at zero.
- **No transition above 200ms.**
- **A query budget of six calls per screen**, enforced by a test that counts.

---

## 15. Execution

Response 10 turns this into a schedule. The shape of it:

### 15.1 Batch order

Work proceeds in nine batches, each ending in a mergeable, green state. The
order is chosen so that nothing is built on a foundation that is not there yet:

1. **Kit primitives and platform services** (`corporate-kit`) — everything else
   consumes these.
2. **Security spine** — permission writer, sessions, audit helper, destructive
   verb registry.
3. **admin-site command deck**, including CLI 2.0.
4. **People and safety** — the three consoles that share the person domain.
5. **Documents** — certificates and notices.
6. **Runtime and edge** — config, custom pages, IP.
7. **Signal** — performance, incidents, status, verification.
8. **Cross-cutting craft** — accessibility, language, mobile, resilience.
9. **Hardening and proof** — browser suites, budgets, ledger, runbooks.

Within a batch, the order is: schema and RPCs, then pure rules with tests, then
the screen, then the copy in both locales, then the browser test.

### 15.2 The acceptance matrix

Every feature gets a row with six columns — rule, authority, screen, proof,
audit, copy — and a state. The matrix *is* the definition of done, and a feature
is not "done" until all six are. Response 10 carries the matrix.

### 15.3 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A permission regression locks out staff | low | severe | matrix snapshot test; break-glass path tested quarterly |
| A migration blocks writes under load | medium | severe | additive only; dry-run on a production snapshot; rollback script per migration |
| Scope creep from "1,000 features" into unbounded work | high | high | the ledger is the scope; a new idea is a new row with a tier, never an addition to a batch |
| Bundle budget breached by charts | medium | medium | charts are lazy, palette is hand-rolled, budget is a ratchet |
| Translation lag | medium | medium | key parity fails CI; Bengali is written with the screen, not after |
| Console diverges from the kit over time | medium | high | lint rule bans direct fetch and local table copies |

### 15.4 The ledger

The final response carries the count: features by tier, by console, and by
state, generated from the matrix rather than typed. It also carries the honest
number of what was *not* delivered, because a plan that claims 100% is a plan
nobody checked.

---

## 16. The data model

This section specifies every new table, column, function and policy the plan
adds. It is written as a specification rather than as SQL, so it can be reviewed
before it is written, and so a single migration file can be generated from it.

### 16.1 Additive-only rule

Every change here is additive. No existing column is dropped, no existing
function changes its signature, no existing policy is removed. A member client
that ships today speaks to the schema as it will be after all nine batches. The
rule has one consequence that is worth stating: a rename is a new column, a
backfill, and a deprecation, never an `alter table ... rename`. That is slower
and it is the only way a thirteen-console rollout does not break the app in a
member's hand.

### 16.2 New tables

#### `public.permission_grants`

The writer for the permission system (closes G2). Columns: `id` bigserial,
`role` bsdc_role, `permission` text matching the same pattern as
`role_permissions.permission`, `scope_key` text defaulting to the empty string,
`granted` boolean, `reason` text constrained to 10–500 characters, `granted_by`
text, `granted_at`, `expires_at` nullable, `request_id` text.

Indexes: `(role, permission, scope_key)` for the hot read, `(expires_at)` for
the expiry sweep. Policies: select requires `people.read`; insert, update and
delete are revoked from `authenticated` entirely, because writes go through the
RPC and nowhere else.

The read path is a function, `bsdc.has_permission(p_permission, p_scope)`, kept
`stable` and `security definer` with a pinned `search_path`. Deny beats allow;
base grants stay the floor.

#### `public.staff_sessions`

Session and device governance (closes G9). Columns: `id` uuid, `uid` text
referencing profiles, `device_label`, `device_hash`, `ip_hash`, `user_agent`,
`first_seen`, `last_seen`, `revoked_at`, `revoked_by`, `revoke_reason`.

Written by the edge handler that issues a token, not by a screen. Policy: an
operator may select their own rows; `people.read` may select any; revoke is
RPC-only.

#### `public.escalations`

Temporary privilege with two people on it. Columns: `id`, `requester_uid`,
`approver_uid`, `permission`, `scope_key`, `reason`, `requested_at`,
`approved_at`, `expires_at`, `revoked_at`, `revoke_reason`, `grant_id`
referencing the grant it created.

A constraint asserts `approver_uid <> requester_uid`. A partial index on
`expires_at where revoked_at is null` drives the sweep.

#### `public.sla_policies`

Queue policy as data. Columns: `id`, `queue` text, `severity` text,
`respond_within_minutes` int, `resolve_within_minutes` int, `owner_uid`,
`updated_at`, `updated_by`. Seeded for the four queues that exist —
moderation, approvals, appeals, escalations — with a stated default per
severity.

#### `public.cases`

One case per member incident, joining reports that belong together. Columns:
`id`, `subject_uid`, `opened_by`, `opened_at`, `closed_at`, `outcome` text
constrained to an enum, `outcome_message_key` text, `reopened_count`,
`legal_hold` boolean. Policies: `moderation.read` to select,
`moderation.resolve` to write, RPC-only writes.

#### `public.case_reports`

Join table: `case_id`, `report_id`, `added_at`, `added_by`. A unique constraint
on `(case_id, report_id)` makes joining idempotent.

#### `public.case_events`

Append-only timeline: `id`, `case_id`, `kind`, `actor_uid`, `body`, `metadata`
jsonb, `created_at`. No update or delete policy for anyone.

#### `public.retention_policies`

Compliance as data. Columns: `data_class` text, `retain_days` int,
`action` text (`delete` or `anonymise`), `last_run_at`, `last_run_deleted` int.
A scheduled job reads this table; changing a retention window is a row change,
not a deploy.

#### `public.webhook_endpoints`

Integrations. Columns: `id`, `label`, `url` constrained to https, `secret_hash`,
`events` text[], `enabled`, `failure_count`, `disabled_reason`, `created_by`.
Writes require `settings.write`.

#### `public.webhook_deliveries`

`id`, `endpoint_id`, `event`, `request_id`, `status_code`, `attempt`,
`latency_ms`, `request_body` jsonb redacted of secrets, `response_snippet`,
`created_at`. Retention 30 days, then archived.

#### `public.saved_queries`

The read-only explorer's saved set. Columns: `id`, `name`, `owner_uid`,
`purpose`, `view_name` constrained to a curated allow-list, `filters` jsonb,
`shared` boolean. The allow-list is a table, `public.explorer_views`, seeded
with views that already respect row-level security.

#### `public.metric_definitions`

The provenance registry. Columns: `key`, `label`, `definition`, `source_rpc`,
`source_table`, `unit`, `owner_uid`, `updated_at`. Every headline number in the
consoles references a key here, and a test asserts no key is used that is not
defined.

#### `public.audit_archive`

A structural copy of `audit_log` plus an `archived_at`. The retention job moves
rather than deletes, and records the move in `audit_log` itself, so the archive
is discoverable from the live log.

### 16.3 New columns

| Table | Column | Type | Default | Why |
|---|---|---|---|---|
| `audit_log` | `request_id` | text | `''` | ties rows from one operator action |
| `audit_log` | `reason` | text | `''` | the operator's own words |
| `audit_log` | `diff` | jsonb | `{}` | before and after, computed |
| `audit_log` | `device` | text | `''` | coarse client class |
| `audit_log` | `scope_key` | text | `''` | which scope the action applied to |
| `profiles` | `standing_points` | int | `0` | the derived cache, reconciled |
| `profiles` | `warning_rung` | smallint | `0` | the ladder position |
| `feature_flags` | `owner_uid` | text | `''` | who owns this plugin |
| `feature_flags` | `kill_switch` | boolean | `false` | disables a console without a deploy |
| `certificates` | `legal_hold` | boolean | `false` | blocks deletion |
| `official_notices` | `legal_hold` | boolean | `false` | blocks deletion |

Every column is nullable or defaulted, so an existing insert keeps working
without a change to any client.

### 16.4 New functions

The RPCs, grouped by the batch that introduces them. Each line names its
permission and whether it writes an audit row.

**Batch 2 — security spine**

| Function | Permission | Audit | Notes |
|---|---|---|---|
| `admin_set_permission` | `permissions.write` | yes | refuses above own rank |
| `admin_permission_matrix` | `people.read` | no | all roles × permissions |
| `admin_effective_permissions(role)` | `people.read` | no | resolved set |
| `admin_request_escalation` | staff | yes | creates a pending row |
| `admin_approve_escalation` | `people.role` | yes | approver ≠ requester |
| `admin_revoke_escalation` | `people.role` / holder | yes | |
| `admin_escalations(open_only)` | `people.role` | no | |
| `staff_sessions_list` | self / `people.read` | no | own rows by default |
| `staff_session_revoke` | `people.session` | yes | |
| `staff_sessions_revoke_others` | `people.session` | yes | |
| `admin_set_own_password_step` | self | yes | re-auth challenge |
| `admin_audit_search` | `audit.read` | no | replaces `admin_audit` |
| `admin_audit_export` | `audit.read` | yes | returns rows plus a hash |
| `admin_audit_verify` | public | no | checks an exported hash |
| `admin_destructive_verbs` | staff | no | the registry, served |

**Batch 3 — command deck**

| Function | Permission | Audit | Notes |
|---|---|---|---|
| `admin_telemetry_delta(window)` | `audit.read` | no | current vs previous |
| `admin_approval_decide` | `people.suspend` | yes | reason required |
| `admin_bulk_preview` | action-specific | no | the dry-run resolver |
| `admin_bulk_apply` | action-specific | yes | returns a receipt |
| `admin_receipt(id)` | `audit.read` | no | fetchable for 90 days |
| `admin_cli_resolve(command)` | action-specific | no | dry-run for the CLI |
| `seo_coverage` | `seo.manage` | no | routes with no metadata |
| `redirect_cycle_check(from, to)` | `seo.manage` | no | returns the cycle |
| `redirect_404_sources(days)` | `seo.manage` | no | feeds suggestions |

**Batch 4 — people and safety**

| Function | Permission | Audit | Notes |
|---|---|---|---|
| `case_open` | `moderation.resolve` | yes | |
| `case_attach_report` | `moderation.resolve` | yes | idempotent |
| `case_event_add` | `moderation.resolve` | yes | append-only |
| `case_close` | `moderation.resolve` | yes | outcome required |
| `case_reopen` | `moderation.resolve` | yes | reason required |
| `person_timeline(uid, range)` | `people.read` | no | five sources merged |
| `person_standing_adjust` | `people.suspend` | yes | ledger entry |
| `person_warning_step` | `people.suspend` | yes | ladder |
| `appeal_intake` | member | yes | receipt |
| `appeal_decide` | `moderation.resolve` | yes | not the original decider |
| `queue_workload` | `moderation.read` | no | per moderator |
| `pattern_simulate` | `moderation.read` | no | false-positive rate |

**Batch 5 — documents**

| Function | Permission | Audit | Notes |
|---|---|---|---|
| `certificate_issue_v2` | `certificate.issue` | yes | idempotent, check digit |
| `certificate_verify` | public | no | allow-listed fields only |
| `certificate_ledger` | `certificate.issue` | no | issued minus revoked |
| `notice_publish` | `notice.publish` | yes | audience required |
| `notice_withdraw` | `notice.publish` | yes | sends a withdrawal |
| `notice_ack_remind` | `notice.publish` | yes | once per notice |
| `notice_delivery_funnel` | `notice.publish` | no | three counts |

**Batch 6 — runtime and edge**

| Function | Permission | Audit | Notes |
|---|---|---|---|
| `admin_setting_validate` | `settings.read` | no | the shared validator |
| `admin_setting_history` | `settings.read` | no | |
| `admin_setting_revert` | `settings.write` | yes | |
| `ip_rule_simulate` | `ip.rule` | no | names the matched rule |
| `ip_rule_dry_run(days)` | `ip.rule` | no | against edge logs |
| `ip_request_trace(request_id)` | `ip.rule` | no | every rule evaluated |
| `custom_page_publish` | `settings.write` | yes | a11y check first |

**Batch 7 — signal**

| Function | Permission | Audit | Notes |
|---|---|---|---|
| `vitals_budget_set` | `performance.read` | yes | |
| `vitals_regressions` | `performance.read` | no | three-run rule |
| `incident_declare` | `notices.publish` | yes | publishes to status |
| `incident_update` | `notices.publish` | yes | internal vs public |
| `incident_resolve` | `notices.publish` | yes | requires a summary |
| `status_components` | public | no | derived from probes |
| `alert_route` | `settings.write` | yes | routing table |

### 16.5 Policy and grant patterns

Every new table gets the same four lines, written once and copied:

1. `alter table ... enable row level security;`
2. A select policy naming the exact permission.
3. A write policy, or no write policy at all when writes are RPC-only.
4. An explicit `grant select on ... to authenticated;` and a revoke of
   `insert, update, delete` unless the table is written by a policy.

The `db:prove` harness already has 76 checks; each new table adds one that
attempts a read as a member with no permission and asserts zero rows, and one
that attempts a write and asserts a refusal. A table without both is not
merged.

### 16.6 Indexes and their justification

Every index in the plan is listed here with the query it serves, because an
index without a query is a write cost with no benefit:

| Index | Serves |
|---|---|
| `permission_grants(role, permission, scope_key)` | every `has_permission` call |
| `permission_grants(expires_at)` | the expiry sweep |
| `staff_sessions(uid, last_seen desc)` | the session list |
| `escalations(expires_at) where revoked_at is null` | the sweep |
| `audit_log(request_id)` | one action's rows |
| `audit_log(action, created_at desc)` | the audit search |
| `audit_log(subject, created_at desc)` | a record's own history |
| `cases(subject_uid, closed_at)` | a person's open cases |
| `case_events(case_id, created_at)` | the case timeline |
| `reports(status, severity, created_at)` | the moderation queue |
| `webhook_deliveries(endpoint_id, created_at desc)` | the delivery log |
| `saved_queries(owner_uid)` | the explorer's saved list |

A migration linter, described in §19.3, refuses a new index without a comment
naming the query it serves. That is a small rule that prevents a large habit.

### 16.7 The eight views the explorer may read

`explorer_views` is a curated allow-list, not a schema browser. Each view:

- names a purpose and an owner;
- selects only columns that are safe to show a manager;
- inherits row-level security from its base tables rather than bypassing it;
- is capped at 5,000 rows and 5 seconds by the calling RPC.

The eight: `v_moderation_backlog`, `v_approval_aging`, `v_person_standing`,
`v_certificate_ledger`, `v_notice_readership`, `v_ad_spend_by_day`,
`v_marketplace_orders_by_status`, `v_staff_activity_by_day`.

The point of a curated list is that "read-only" is not a safety property. A view
that joins three tables can leak a column nobody intended. Three tables in, the
reviewer can no longer tell, so the list stays short and each entry is reviewed
once with the columns written out.

---

## 17. Console specifications

Each console below gets a specification: what it is for, what its screens are,
what each screen does at the level of interaction, what it reads and writes,
what it does when the network is slow or absent, and what it must never do. This
is the section a developer works from.

### 17.1 `admin-site` — Operations & CLI Admin

**Purpose.** The console an owner opens first. It answers "is anything on fire",
"what needs a decision", and "what can I do in bulk", and it hosts the CLI.

**Who.** `manager` and above. The CLI requires `audit.read` for its audit verbs
and the action's own permission for everything else, so a manager can use the
CLI for the things a manager may do and no more.

**Screens.**

*Overview.* Above the fold: an incident strip (open incidents, failing checks),
a decision strip (pending approvals with the oldest age), and a KPI grid of six
numbers, each with age, delta and provenance. Below: a quick launcher to every
portal the operator can reach, and an audit inspector drawer scoped to today.
The screen refreshes every sixty seconds while visible and stops when the tab
is hidden, because a console left open overnight should not be an accidental
load test.

*CLI.* A terminal that behaves like a terminal: history, completion, a
scrollback, output modes, and a visible permission badge for the resolved
command. It never executes raw SQL. Every destructive verb requires the subject
id typed. `--dry-run` prints the plan.

*Bulk workbench.* Pick a verb, pick a filter, see the preview, apply, receive a
receipt. The preview is authoritative because it runs the same resolver.

*Approvals.* Shops and campaigns, ranked by SLA. A decision opens a drawer with
the subject's evidence, the SLA clock, a reason field and one primary action.

*Marketplace.* Payout requests, credit purchases, package settings. Payouts
above the threshold need a second approver, and the screen says so before the
operator clicks.

*Campaigns.* Performance, creative preview, pause and resume with an effect
preview.

*Pages (SEO).* Overrides with a live SERP and social preview, plus a coverage
list of routes with no metadata.

*Redirects.* Rules with cycle detection, hit counts, and the 404 sources that
feed suggestions.

*Sitemap.* Inclusion toggles with a stated effect on the generated file.

*Branding.* Token editor with live contrast per pair, side-by-side draft and
live preview, publish behind `brand.publish`.

**Reads.** `admin_overview`, `admin_telemetry_delta`,
`admin_pending_campaigns`, `admin_pending_shops`, `ad_credit_queue`,
`mk_admin_list_*`, `seo_for_path`, `redirect_404_sources`,
`admin_audit_search`, `admin_receipt`.

**Never.** Never shows a member's private message content. Never performs a bulk
action without a preview. Never allows a payout approval by the requester.

**Slow or offline.** Every panel has its own boundary and its own freshness
badge. The CLI queues nothing — a command either runs or reports why it did not,
because a queued destructive command that fires an hour later is a hazard.

### 17.2 `users-admin-site` — People governance

**Purpose.** The single place to answer a question about a person.

**Screens.**

*People.* A searchable, filterable list with standing, role and last activity.
Filters are chips, the view is in the URL, and a row opens the person record.

*Person.* The open-items strip, the timeline, the identity block, the standing
ledger, the role panel with a permission-level diff before saving, the session
list with revoke, and the actions menu — warn, mute, suspend, ban, delete
request — each opening a `Confirm` that names what will stop working.

*Directory.* Staff only. Department, role, card state, shift, and the card
verification field.

*Verify a card.* One input, one answer: valid, revoked, or unknown, with the
issue date and the issuing officer.

**Reads.** `admin_people`, `staff_directory`, `person_timeline`,
`issue_staff_card`, `staff_sessions_list`.

**Never.** Never lets an operator change their own role. Never allows a single
operator to both request and approve a deletion. Never displays a password,
token or full email address where a hash answers the question.

**Slow or offline.** The person record caches its last-read view for the
session and labels it as cached. Destructive actions are disabled while offline
with an explanation, because a held suspension that fires on reconnect is worse
than a delay.

### 17.3 `users-moderator-site` — Staff directory and shifts

**Purpose.** Who is on shift, what they are covering, and what the next shift
needs to know.

**Screens.**

*Directory.* Search across staff, departments and shifts in one query with the
matched field highlighted.

*Roster.* A week grid, readable at 250px, with coverage per hour and gaps
flagged. Leave requests sit beside the grid with an approve action that updates
it.

*Handover.* Prefilled from open items at the end of a shift: unclaimed reports,
overdue approvals, and any incident still open. Editable, then recorded so the
next shift sees what was handed over rather than what was merely pending.

**Reads.** `staff_directory`, `claim_bootstrap_role` (for verification only),
and the queue counts the roster shows.

**Never.** Never reveals a staff member's personal contact details to another
staff member without a permission; the directory shows role contact channels.

### 17.4 `moderator-site` — Moderation & safety

**Purpose.** Work the queue correctly, with a clock, and leave a trail.

**Screens.**

*Queue.* Ranked by severity then age, with an SLA clock per row. Claim is
atomic. Selection supports range and all-matching. The bulk bar shows the count
and the verb.

*Report detail.* The subject with context, the reporter, the evidence, the
history of prior reports on this subject, and the action menu. A note can spawn
its action.

*Reports (analytics).* Inflow, resolution rate, backlog trend against the prior
week, and per-moderator workload.

*Patterns.* Rules with a test corpus and a simulation that reports the
false-positive rate against history before a rule is enabled.

*Appeals.* Intake, queue, and decision, with the original decider excluded.

**Reads.** `moderation_queue`, `claim_report`, `resolve_report`,
`bulk_moderation_resolve`, `queue_workload`, `pattern_simulate`.

**Never.** Never shows a moderator a reporter's identity where a pseudonymous
report is the policy. Never lets a resolution be free text where an outcome enum
is required. Never auto-resolves on a heuristic.

**Slow or offline.** The queue is read-only offline with a banner. A claim made
offline is not honoured, because two moderators claiming the same report is the
failure this console exists to prevent.

### 17.5 `certificate-site` — Certificate desk and studio

**Purpose.** Issue, amend, revoke and verify credentials that outlive the
platform's memory of issuing them.

**Screens.**

*Registry.* Search by code, member, course, or date. Each row shows status,
issue date, amendment count and a link to the chain.

*Issue.* A form with member and course lookup, a preview of the generated code,
and an idempotency guard so a double click is one certificate.

*Detail.* The record, the revision chain with field diffs, the PDF with its
hash, and the actions: amend, reissue, revoke, restore.

*Template studio.* Placeholders validated at save, a preview at print
resolution, and a publish that requires `settings.write`.

*Batch.* A CSV in, a per-row report out.

**Reads.** `certificate_registry`, `certificate_history`,
`certificate_for_print`, `certificate_ledger`, `evidence_verify`.

**Never.** Never reuses a verification code. Never edits a revoked certificate
in place. Never renders a PDF with a clock or randomness in the path, because
reproducibility is the property the entire verification scheme rests on.

### 17.6 `notice-site` — Official notice desk

**Purpose.** Publish claims that carry an obligation to be seen, and prove who
saw them.

**Screens.**

*Registry.* Draft, scheduled, live and withdrawn, with a publication clock.

*Compose.* Split-pane markdown and metadata with a live preview that is the
production renderer, per-locale tabs with a completeness meter, and an audience
picker with a reach count before publish.

*Detail.* The notice, its revisions with field diffs, the acknowledgement
roster with export, and the delivery funnel.

*Schedule.* A calendar with conflict detection.

**Reads.** `notice_registry`, `notice_history`, `notice_ack_roster`,
`notice_delivery_funnel`, `notice_publish`.

**Never.** Never publishes without an audience. Never deletes a notice a member
may have read — it withdraws. Never sends a reminder twice without recording
the decision.

### 17.7 `config-site` — Settings

**Purpose.** Change the runtime safely, with a diff and a way back.

**Screens.**

*Settings.* Grouped, searchable, with inline edit and the schema beside the
field. Each row shows its provenance and its last change.

*History.* Every change with actor, reason and time, with a revert action.

*Diff.* Two points in history side by side, or production against staging.

*Staged.* Change requests awaiting a second approver.

**Reads.** `site_config_list`, `site_config_history_for`,
`admin_setting_validate`, `admin_setting_history`.

**Never.** Never returns a secret value. Never saves a value that fails its
schema. Never applies a scheduled change early.

### 17.8 `customize-site` — Custom pages

**Purpose.** Compose pages without shipping code, and without the editor lying
about the result.

**Screens.**

*Pages.* Status, author, last edit, language completeness.

*Editor.* Sections with drag and keyboard reorder, a live preview using the real
renderer, three width presets, autosave with a conflict warning, and a publish
that runs the accessibility check first.

*History.* Versions with a diff and a revert that creates a new version.

**Never.** Never publishes a slug that collides with a route. Never publishes a
section missing required content or alt text. Never shows a preview that is not
the production component.

### 17.9 `ip-site` — IP access and edge security

**Purpose.** Decide who reaches the platform, with evidence, and never lock
yourself out.

**Screens.**

*Rules.* The ladder in priority order, each with type, owner, review date and
hit count. Conflict detection at save.

*Simulator.* An address in, a decision and the matching rule out.

*Dry run.* Against the last seven days, showing who would have been blocked.

*Tracer.* A request id in, every rule evaluated in order out.

*Log.* The edge log with filters and a drill-down.

**Never.** Never saves a rule that would block the operator's own current
address without an explicit override and a warning. Never leaves a block without
an expiry and a review date.

### 17.10 `performance-site` — Performance and reports

**Purpose.** Turn field data into a decision about what to fix next.

**Screens.**

*Vitals.* Per route, p75 and p95 with sample counts, budgets and verdicts, a
release comparison and a trend with a rolling mean.

*Errors.* Grouped by fingerprint, with first seen, last seen, count, and an
impact estimate stating its method.

*Edge.* Latency by region, slowest first, with a labelled sample floor.

*Bundle.* Every app against its ceiling, measured in CI.

*Reports.* Generate, compare and export with a SHA-256 receipt.

**Never.** Never presents a trend below the sample floor as a trend. Never
resolves an error without a note. Never hides a region because its sample is
small — it labels it.

### 17.11 `connect-site` — Staff channels

**Purpose.** Coordinate during an incident without leaving the consoles.

**Screens.**

*Channels.* Membership-gated, with presence, unread derived from a read cursor,
pinned messages and search scoped to readable channels.

*Message.* Threads, mentions with a jump, edit and delete with a marker, and
file sharing with a type guard.

*Alerts.* The routing table: which event pages which role, with an
acknowledgement that escalates once on silence.

**Never.** Never returns a message from a channel the operator cannot read.
Never stores a file type it cannot serve back safely.

### 17.12 `status-site` — Public status

**Purpose.** Tell the truth about availability, on time, in the reader's
language.

**Screens.**

*Board.* 90-day bars with the calculation published beside them, component
health derived from probes, and an incident timeline.

*Incident.* Public updates only, with the internal notes kept in the console.

*Maintenance.* Scheduled windows with a countdown.

*Subscribers.* Language preference, export and removal.

**Never.** Never lets a component be set green by hand. Never publishes an
internal note as a customer message.

### 17.13 `vf-site` — Verification desk

**Purpose.** Answer "is this document real" in one query, revealing nothing
more than the document already shows.

**Screens.**

*Verify.* One input for a code, an id or a hash. The result names what is
verified and by what, and distinguishes revoked from unknown.

*Batch.* A CSV in, a signed result file out.

**Never.** Never returns a field the document does not carry, asserted by an
allow-list test. Never allows unthrottled enumeration.

### 17.14 `main-site` `/admin` hub

**Purpose.** For a staff member already in the member site, point them to the
console that owns the task, without duplicating the console's power.

**Screens.** A hub listing each task with the console that owns it, and eight
screens that are deliberately shallow: they summarise and link, and where an
action is destructive they hand off rather than implement.

**Never.** Never performs a destructive action that is not also available in a
console with the same guard. This is asserted by a test that walks every
`/admin` route and fails on a new destructive control without a console twin.

---

## 18. Test strategy

The repository's existing philosophy is the right one and the plan extends it
rather than inventing a parallel system: pure rules in `model.ts` tested with
`vitest`, database contracts proven by `db:prove`, and real behaviour proved in
Chromium against a production build. What is missing is coverage of the
consoles themselves, and the discipline of proving that a test can fail.

### 18.1 The four kinds of test, and what each is for

**Rule tests (`vitest`, jsdom).** A pure function in `model.ts` or
`domain/*.ts` — what counts as a valid transition, what a status means, how a
number is formatted. These are fast, they run on every save, and they are where
80% of the logic lives. A screen with business logic inside JSX is a screen with
untestable logic, so the review rule is that a component may not branch on a
domain rule it did not import.

**Contract tests (`db:prove`).** The database's actual behaviour: that a
function refuses without a permission, that a policy returns zero rows for an
unauthorised reader, that an insert writes its audit row, that a constraint
holds under concurrency. These are the tests that matter most, because the
database is the only thing that enforces anything (§2.2). The harness has 76
checks today; this plan roughly doubles it.

**Browser tests (Chromium, production build).** That a screen opens, that a
button does what it says, that no uncaught exception fires, that nothing
overflows at 250px, that a deploy under an open tab does not blank the console.
These are slow, so they cover the primary path of each screen rather than every
branch.

**Snapshot tests (permissions, audit shape, i18n keys).** That a set of things
nobody wants to change by accident has not changed. Cheap, broad, and the only
defence against a well-intentioned refactor quietly widening who can suspend a
member.

### 18.2 Proving a test can fail

Every new guard in this plan is introduced the way `5967a2e` introduced stale
build recovery: the test is written, the fix is disabled, the test is watched
going red, and only then is the fix enabled again. The commit message records
the red run.

This sounds fastidious and it is the single highest-value discipline in the
list, because the alternative was demonstrated in this very repository: a stale
build harness once passed three out of three *without* the fix, because the
harness rebuilt its own fixture. A green test that cannot go red is a
documentation artefact, not a test.

The convention: for any change whose failure mode is "silently does nothing",
the pull request body carries the red run's output.

### 18.3 The test matrix

| Kind | Where | What it covers | Runs |
|---|---|---|---|
| Rule | `*.test.ts` beside the rule | one case per branch, plus the boundary | every save |
| Contract | `scripts/db-prove/` | permission, policy, audit, constraint, concurrency | every PR |
| Browser | `scripts/browser/` | primary path, no exceptions, no overflow | every PR |
| Snapshot | `*.snapshot.test.ts` | permission matrix, audit shape, i18n keys | every PR |
| Visual | `scripts/browser/visual.mjs` | a screenshot per console per theme | nightly |
| Load | `scripts/load/` | queue at 5,000 rows, bulk at 1,000 ids | weekly |
| Chaos | `scripts/chaos/` | slow database, dropped network, expired session | weekly |

### 18.4 The contract test for a new RPC, written out

Because this template is used dozens of times, it is worth writing once. A new
privileged RPC adds exactly these assertions, and a generator emits the file:

```
t-<n>.mjs  admin_set_permission
  1  a moderator cannot call it                     -> raises 42501
  2  a manager cannot grant the admin role          -> raises, no row written
  3  an admin can grant people.session to manager   -> row exists, granted
  4  the grant is audited                           -> one audit row, reason set
  5  the audit row carries a request_id             -> non-empty
  6  a denied permission denies, even if base-granted -> has_permission false
  7  an expired grant does not grant                -> has_permission false
  8  the matrix snapshot is unchanged               -> diff empty
  9  a self-grant of permissions.write is refused   -> raises
 10  the function is not executable by anon         -> raises
```

Ten assertions per RPC sounds heavy until the alternative arrives: a permission
system where nobody can state what a function guarantees without reading it.

### 18.5 What is deliberately not tested

Unit-testing React component internals, mocking the database to test a screen's
happy path, and snapshotting rendered markup. Each produces a test that fails
when the code is refactored correctly and passes when it is wrong, which is the
opposite of useful. The console is tested through its rules and its contracts,
and its behaviour is tested in a real browser.

---

## 19. Quality gates and the CI shape

### 19.1 The gate list

Every batch ends with the same suite, and a batch that fails any gate does not
merge:

1. `npm run typecheck` in the affected packages — zero errors.
2. `npm run lint` — zero warnings, not "zero errors".
3. `prettier --check` — formatting is not a discussion.
4. `npm test` — the whole suite, including the consoles.
5. `npm run build` per console — thirteen builds, each measured.
6. `node scripts/audit.mjs` — every invariant, including the new ones.
7. `npm run db:prove` — every contract, including the new ones.
8. `node scripts/release-check.mjs` — bundle budgets per console.
9. `node scripts/count-registry.mjs` — the feature count is regenerated and
   committed, so it describes the commit it was run on.
10. The browser suites — console smoke, stale build, accessibility, overflow.

### 19.2 New audit invariants

`scripts/audit.mjs` gains checks that make the plan self-enforcing, because a
rule that is only in a document gets forgotten:

| Code | Invariant |
|---|---|
| `A-01` | Every console builds and its initial JS is inside 250 KB gzip |
| `A-02` | Every console has a locale file pair with equal key sets |
| `A-03` | Every destructive verb in the registry has a runbook file |
| `A-04` | Every RPC named in any console source exists in the migrations |
| `A-05` | Every permission string used in code exists in `role_permissions` |
| `A-06` | Every console screen has four state tests |
| `A-07` | No console source constructs a `fetch` call directly |
| `A-08` | No console ships a source map |
| `A-09` | Every console's `dist` sets a CSP without inline script |
| `A-10` | Every table added by a migration has an explicit grant |
| `A-11` | Every new index has a comment naming its query |
| `A-12` | Every new RPC has a `db:prove` entry |
| `A-13` | The permission matrix snapshot is present and current |
| `A-14` | Every metric key used in a console exists in `metric_definitions` |
| `A-15` | No raw hex colour in any console source |

Fifteen new invariants, each one a thing that would otherwise be caught by a
reviewer on a good day.

### 19.3 The migration linter

A small script, run in CI, that reads a new migration and refuses it when:

- it creates a table without `enable row level security`;
- it creates a table without an explicit `grant select`;
- it creates an index without a comment naming the query it serves;
- it creates a function whose body writes to an audited table without calling
  `bsdc.audit`;
- it creates a function with `security definer` without a pinned `search_path`;
- it drops or renames anything, unless the migration filename ends
  `_deprecation.sql` and the body is documented;
- it creates a function with a `p_permission` parameter that never passes it to
  `require_permission`.

Seven rules, each of which is a real mistake that has happened at least once in
a system like this one.

### 19.4 Branch and merge discipline

One batch per pull request. Each pull request states its batch number, lists the
feature IDs it delivers, and carries the ledger delta. A pull request that
touches two batches is split, because the review question for batch 2 (is the
security model sound) is different in kind from the review question for batch 7
(is the chart readable).

Every destructive RPC change requires a review from somebody who did not write
it, and the reviewer's job is specifically to attempt the escalation paths in
§9.1 rather than to read the diff.

---

## 20. Performance budget, per console

The budget is a ratchet: a console may get smaller and may not get bigger
without a decision recorded in the pull request.

| Console | Initial JS (gzip) ceiling | Why that number |
|---|---:|---|
| `admin-site` | 240 KB | the CLI and charts are lazy, so the shell is small |
| `moderator-site` | 180 KB | a queue and a drawer, no charts |
| `users-admin-site` | 190 KB | the person record is the heaviest screen |
| `users-moderator-site` | 160 KB | a directory and a grid |
| `certificate-site` | 200 KB | PDF generation is lazy and loaded on demand |
| `notice-site` | 210 KB | the editor and the preview |
| `config-site` | 170 KB | a matrix and a diff |
| `customize-site` | 220 KB | the renderer is shared with the public page |
| `ip-site` | 165 KB | rules and a simulator |
| `performance-site` | 215 KB | charts, lazy-loaded per panel |
| `connect-site` | 175 KB | messages and presence |
| `status-site` | 150 KB | public and fast by definition |
| `vf-site` | 140 KB | one input and one answer |

Nine techniques get each console under its ceiling, in the order they are tried:
route-level lazy loading; lazy charts behind an intersection observer; the kit's
dependency-free primitives instead of a grid or chart package; no date library,
only `Intl`; icons from the one module rather than a per-icon import; a single
shared vendor chunk across consoles so the browser caches it once; server-side
computation for anything that would otherwise ship a large dataset; and, only
if all else fails, deferring a panel's data behind an explicit "load" control.

---

## 21. Rollout plan

A thirteen-console upgrade cannot land at once, and it must not require a
flag day. Each batch ships behind a per-console flag, defaulting off, then
on for staff, then on for everyone with access.

### 21.1 The five stages

**Stage 0 — shadow.** The new screen renders beside the old one for the
engineer who built it, reading real data and writing nothing. This is where
layout bugs and permission mistakes are found, because the operator is the
engineer and the blast radius is one person.

**Stage 1 — canary.** On for the console's named owner, who is also the person
reviewing the pull request. The flag is per *operator*, not per percentage,
because three operators is not a percentage.

**Stage 2 — staff.** On for everyone with access. The old screen is still
reachable by a URL parameter for two weeks, and its use is counted so the
decision to remove it is based on evidence.

**Stage 3 — default.** The flag defaults on, and the old screen's parameter logs
a deprecation warning.

**Stage 4 — removal.** The old screen is deleted in a pull request whose entire
description is the count of people who used it in the last thirty days, which
should be zero.

### 21.2 The kill switch

Every console gets a `kill_switch` column on its feature flag (§16.3). Flipping
it replaces the console's screens with a single panel naming the incident and
the channel to join, and performs no writes. The path is drilled once a quarter
and timed; the target is under two minutes from the decision to a staff member
seeing the panel.

### 21.3 Migration safety

Every migration is additive, applied before the code that uses it, and safe to
run twice. The order within a release is: migration, then database functions,
then the console that calls them, then the flag. A rollback reverses the last
two steps and leaves the schema alone, which means a rollback is a flag flip
rather than a database operation — the only kind of rollback that happens fast
enough to be useful at 03:00.

---

## 22. Governance

A plan of this size needs an owner and a rhythm, or it becomes a document that
was true once.

### 22.1 The weekly review

One hour, standing, with the owner. The input is not a status report but the
ledger (§15.4): features delivered, features slipped, gates red, incidents. The
output is a decision about the next batch and, when something slipped, a reason
recorded in the ledger rather than a sentence in a chat.

### 22.2 The monthly permission review

Who can do what, reviewed once a month against who needs to. The console for it
is the matrix from §9.1 with an export. The review is recorded, and an unchanged
review is a legitimate outcome — the point is that it was looked at.

### 22.3 The quarterly drill

Three paths are rehearsed, each with a written record: break-glass access
(§9.3), lockdown (§20 kill switch), and restore from backup. A drill that has
never been run is a paragraph, not a capability.

### 22.4 Definition of done, restated

A feature is done when the rule, the authority, the screen, the proof, the audit
row and both translations exist (§3.2). A batch is done when every feature in it
is done and every gate is green. The plan is done when the ledger's delivered
count equals its total, and not before — a document that says "mostly done" is a
document that will be abandoned.

---

## 23. Open questions

Things this plan deliberately does not decide, with the person who should:

1. **Does the platform need per-region staff roles?** The scope mechanism (§9.2)
   supports it; whether the product wants it is a product question. Default:
   no scope beyond category until a second region exists.
2. **How long is a certificate's verification code valid after revocation?**
   Technically forever; legally it may depend on jurisdiction. Default: the
   code resolves forever and reports revocation, which is the truthful answer.
3. **Does an acknowledgement of a notice carry legal weight?** If it does, the
   roster needs a signature rather than a click. Default: a click with a
   timestamp and a device hash, and a note in the notice that says so.
4. **Should the audit log be exportable to a third party in real time?** It is
   possible with the webhook system (§16.2). Default: no, until there is a
   requirement.
5. **Is the market's payout threshold a constant or per-vendor?** Default: a
   setting, per vendor, with a global floor.
6. **How many staff sessions before the limit becomes hostile?** Default: three
   for a moderator, two for an owner, reviewed after a month of data.

Each has a default, so the work is never blocked waiting for an answer, and each
is recorded here so the decision is a decision rather than an accident.

---

## 24. Appendix A — the eleven gaps and where they close

| Gap | Closes in | The change that closes it |
|---|---|---|
| G1 `ip_hash` never written | Batch 2 | the edge helper writes it for audit and session rows |
| G2 no permission writer | Batch 2 | `permission_grants` + `admin_set_permission` |
| G3 audit has no diff | Batch 2 | `diff` column, `bsdc.audit()` helper, computed diffs |
| G4 reasons not enforced | Batch 2 | the destructive verb registry + constraint |
| G5 no stale-build recovery in consoles | Batch 1 | `chunk-recovery` moves to the kit, all thirteen adopt it |
| G6 consoles have no browser test | Batch 9 | console smoke suite, wired into CI |
| G7 bundle budget skips consoles | Batch 9 | per-console build and measurement in CI |
| G8 eleven permissions for 645 functions | Batch 2 | action-level permissions for the eleven missing operations |
| G9 no session governance | Batch 2 | `staff_sessions` + three RPCs |
| G10 CLI has no dry-run | Batch 3 | `admin_cli_resolve`, `--dry-run` for every verb |
| G11 `/admin` duplicates consoles | Batch 9 | `/admin` becomes a hub; a test enforces the hand-off rule |

---

## 25. Appendix B — the feature ID scheme

`A-NNN` is a permanent identifier. It is assigned when a feature enters the
ledger and it never changes, never gets reused, and never gets renumbered when
the plan is edited. The number is not a priority and not an order; the tier is
the priority and the batch is the order.

A feature that is dropped keeps its row and gains a state of `dropped` with a
reason. A feature that is split keeps its row for the first half and gains a
sibling with the next free number. The ledger therefore reads as a history of
decisions rather than as a list of intentions, which is the only version of it
worth keeping.

The next free number after this plan is `A-1014`.

---

## 26. Appendix C — glossary

**Authority** — the database object that enforces a rule. A screen is a
convenience; the authority is the truth.

**Batch** — a mergeable unit of work, one pull request, ending in a green gate
run.

**Canary** — a flag turned on for named operators, not for a percentage.

**Claim** — an atomic assignment of a queue item to one operator, so two do not
work the same thing.

**Diff** — the computed before and after of a state change, stored with the
audit row rather than inferred later.

**Dry run** — resolving what an action would do, in the same code that performs
it, without performing it.

**Ledger** — the table of every feature with its six done-columns and its state.
The scope of the plan.

**Provenance** — where a number came from, shown beside the number.

**Receipt** — a fetchable record of what a bulk action did, id by id, for ninety
days.

**Scope** — a string that narrows a permission to a subset of the platform.

**Snapshot test** — a test whose job is to fail when a set of things changes,
so the change is reviewed.

**Stale build** — an open tab whose document names chunks a deploy has replaced.

**Twin** — the accessible table that renders the same data as a chart. Required
by the type system.

**Verb** — a destructive operation, one of the twelve in §9.7, each with a
permission, a confirmation, a runbook and possibly a second approver.

## 27. Threat model

A console that can suspend a member, revoke a certificate, or change who may do
what is an attack surface with a login form on it. This section enumerates what
can go wrong, who would do it, and what stops it. It is written before the code
because a threat model written afterwards describes the mitigations somebody
happened to build.

### 27.1 Assets, ranked by what losing them costs

**A1 — The ability to act as another staff member.** If an attacker holds a
manager's session they can suspend accounts, approve payouts and revoke
certificates with a valid audit trail pointing at somebody else. This is worse
than a data breach because it is also a false record of who did it.

**A2 — The permission table.** Whoever can write `role_permissions` decides
what everyone else may do, including granting themselves the ability to grant.

**A3 — The audit log's integrity.** An audit log that an admin can edit is a
liar with good handwriting. Every investigation afterwards is unreliable.

**A4 — Certificate issuance.** A certificate is a claim about a person's
competence, verified publicly. A forged one is a forged credential in the world,
not just in the database.

**A5 — Published notices.** An attacker who can publish can make the platform
say anything, in the platform's voice, to every member.

**A6 — Member personal data.** Names, contact details, and the behavioural
record behind a ban. Disclosure is a legal event, not just an embarrassment.

**A7 — Advertiser and vendor money.** Wallets, credits, payouts. Small amounts,
many accounts, and a ledger that has to reconcile.

**A8 — The edge rule list.** Whoever sets the IP rules decides who can reach the
platform at all. A hostile or careless rule is an outage with a config diff.

**A9 — Availability of the consoles themselves.** Not usually an attacker's
goal, but the effect of an outage at 03:00 is the same whether it was a bug or
a hammer.

### 27.2 Who would attack, and with what

**The curious member.** Holds a valid token, finds a console URL in a
screenshot, and tries it. Stops at the first 403. The defence is that a 403 is
one line of database policy and not one line of React — the console never even
ships to them, because the route is checked before the bundle loads.

**The demoted staff member.** Was a manager last month, still has a browser
session and a bookmark. This is the most common real case and the one most often
missed. The defence is that `bsdc.actor_role()` reads the role from the profile
row rather than from the token claim (`0024_admin.sql:112-121`), so a demotion
takes effect on the next request rather than on the next sign-in. The plan adds
session revocation on role change on top of that, because the claim is still
stale for the rest of the token's life and some screens read claims.

**The compromised staff account.** Phishing, a reused password, a laptop left
open. The defence is layered: session listing and revocation, a step-up
re-authentication for the twelve destructive verbs, device labelling so an
unfamiliar device is visible, and a two-person rule on the five actions that
cannot be undone.

**The malicious insider.** Holds a legitimate role and uses it for something it
was not meant for. No permission system stops this, and pretending otherwise is
the mistake. The realistic defence is that every action is recorded with a
reason and a diff so it is *visible*, that bulk actions are receipted so a mass
action is conspicuous, that an anomaly detector flags unusual volume, and that
the separation-of-duties constraints mean no single person can both grant and
use certain privileges.

**The automated scanner.** Enumerates hosts, paths, and tokens. The defence is
that consoles are on separate origins with their own CSP, that every route
checks a session before rendering, that verification endpoints are rate limited
so they cannot be used to enumerate codes, and that a 403 is cheap and quiet.

**The supply chain.** A compromised npm package inside the kit or a console. The
defence is the existing dependency-licence gate, a lockfile, the bundle budget
(which makes an unexpected addition visible), and the rule that the kit's
primitives have no runtime dependencies at all.

**The careless operator.** Not an attacker, and the most likely cause of an
incident. Wrong record selected in a bulk action, a block rule applied to the
office IP, a notice published to everyone instead of a cohort. The defence is
the preview, the confirmation that names the record, the dry run, and the
self-block guard — all of which exist because carelessness is the dominant
failure mode in every operations console ever built.

### 27.3 STRIDE, per surface

**Spoofing.** The consoles trust a Firebase identity token and read the role
from Postgres. A forged token fails signature verification at the edge; a valid
token for the wrong person is what session governance is for. The residual risk
is a stolen token, addressed by short lifetimes, revocation, and device
labelling. What the plan adds: nothing structural, because the model is sound;
it adds the *visibility* that lets a person notice a session they do not
recognise.

**Tampering.** Every write goes through a security-definer function with an
explicit permission check. The tables that hold the truth — `role_permissions`,
`audit_log`, `permission_grants` — have no insert, update or delete grant for
`authenticated` at all. The plan adds a trigger that fails a transaction which
changed an audited table without writing an audit row, which turns tampering
*silence* into an error.

**Repudiation.** This is the gap the plan closes most directly. Before it, an
operator could perform a suspend with no reason recorded and the row would not
say what changed. After it, every destructive verb requires a reason of at least
ten characters, writes a computed diff, carries a request id that ties the rows
of one action together, and records the device. An operator can still deny an
action; the record makes the denial unpersuasive.

**Information disclosure.** The consoles return less than they could. The plan's
rule is that a read RPC returns the columns the screen needs and no more, and
that a verification response is compared against an allow-list in a test.
Secrets are write-only. `ip_hash` is salted and hashed, never stored raw. Member
email addresses are shown as a hash plus a domain where the question is "is this
a real account" rather than "what is this person's address".

**Denial of service.** The consoles are internal and small, so the risk is not
volumetric but accidental: a screen that fetches five thousand rows into the
browser, a bulk action that iterates one RPC per row, a chart that queries per
row. The plan's answers are a query budget per screen, a batched sparkline call,
server-side aggregation, and a row cap on every list. The edge rule engine
already provides rate limiting; the plan adds a rule that no console endpoint is
reachable without a session, so a scanner cannot even begin.

**Elevation of privilege.** This is the heart of it and it gets its own section
(§27.4), because it has more failure modes than the rest combined.

### 27.4 Elevation of privilege, enumerated

Privilege escalation in a system like this never looks like `isAdmin = true`. It
looks like one of these seventeen things, and each has a named defence and a
test:

| # | The escalation | Defence | Test |
|---|---|---|---|
| 1 | An admin edits their own role row directly | no write grant on `profiles.role`; role changes are RPC-only | `t-role-self` |
| 2 | An admin grants a role equal to their own | rank guard in `admin_set_permission` and the role RPC | `t-role-rank` |
| 3 | A manager grants admin | rank guard, negative test | `t-role-escalate` |
| 4 | An owner demotes the last owner, locking everyone out | last-owner guard | `t-role-last-owner` |
| 5 | A stale token carries a role that was revoked | role read from the profile, not the claim | `t-role-stale-token` |
| 6 | A demoted operator keeps a session | session revoke on role change | `t-session-demote` |
| 7 | A revoked session still works because the guard trusts a cache | guard reads `revoked_at` per request | `t-session-revoke` |
| 8 | A grant is widened by editing its scope after approval | grants immutable; change is a new row with a new approval | `t-grant-immutable` |
| 9 | An expired escalation still grants | read path excludes expired; sweep records the lapse | `t-escalation-expiry` |
| 10 | The requester approves their own escalation | `approver_uid <> requester_uid` constraint | `t-escalation-self` |
| 11 | A scoped grant answers outside its scope | `has_permission` requires a matching scope | `t-grant-scope` |
| 12 | A deny is overridden by a base grant | deny evaluated first | `t-grant-deny` |
| 13 | An RPC checks a role name instead of a permission | permission strings only; a lint rule bans `role ===` in functions | `t-lint-role-check` |
| 14 | A screen hides a button and the RPC does not check | every RPC has a `require_permission`; audited by `A-12` | `t-rpc-permission` |
| 15 | An anonymous caller reaches a privileged function | `revoke execute ... from public` on every privileged function | `t-anon-execute` |
| 16 | A `security definer` function is reached through a different `search_path` | every such function pins `search_path` | `t-search-path` |
| 17 | A function is executable by `authenticated` but never checks permission | `db:prove` enumerates executables and asserts each one checks | `t-execute-audit` |

Seventeen rows, seventeen tests. The seventeenth is the important one, because
it is the only defence against the mistake nobody notices: a new function added
in a hurry that is simply reachable.

### 27.5 What happens when the defence fails

A threat model that stops at prevention is incomplete. Three failure paths are
planned for:

**A compromised staff account is suspected.** The owner revokes every session
for that uid (one RPC), flips the account to `suspended` (one RPC), and reads
the audit log for that actor over the window (one query). The plan's contribution
is that all three exist and that the audit log can be filtered by actor and
request id, so the review is a query rather than an archaeology project.

**A certificate is discovered to be fraudulent.** Revoke it with a public
reason. The verification desk then reports it as revoked, which is a truthful
answer to a checker. The chain shows who issued it and under what reason, which
is the information an investigation needs.

**A notice was published in error.** Withdraw it. Members who saw it receive a
withdrawal rather than a 404, the revision history shows the withdrawal, and the
audit row names the operator and the reason.

None of these is a rollback of history. History is append-only by design, and
the correct answer to "undo this" is always "record that it was undone".

### 27.6 The privacy boundary

Staff can see more than members, and the boundary is explicit rather than
implied by good manners:

- **Reads of member data are logged**, not only writes. The plan adds an
  audited read to the three screens where a staff member opens a person's
  record, because the question "who looked at this member" is asked in every
  serious privacy review and cannot be answered retroactively.
- **Export is a distinct permission.** `report.export` and the
  law-enforcement export are separate from reading, carry a mandatory legal
  basis, and are audited with the reason.
- **Erasure is a workflow, not a delete.** A deletion request is queued, has a
  grace period visible to both sides, and completes with a proof that lists each
  table and the row count it removed.
- **Retention is data.** A data class and a window, in a table, applied by a
  job. A retention policy that lives in a paragraph is a policy nobody can
  prove was applied.
- **The sandbox holds no production data.** A training mode with fixtures,
  because the alternative is a trainer projecting a real person's record.

---

## 28. Interaction specifications

§17 says what each console is for. This section says what happens when a person
uses it — the interaction, state by state, including the states that are easy to
forget. It is written as a set of conventions rather than a screen-by-screen
inventory, because the value is in the conventions being identical everywhere.

### 28.1 The list convention

Every list in the fourteen surfaces follows one pattern. A list that does not is
a bug report waiting to be filed.

**Above the list.** Title, a one-line purpose, and the count. A `FilterBar` with
chips for each active filter. A search field when the list has more than fifty
rows. On the right, the primary action, and a "views" control for saved views.

**While loading.** A skeleton with the real column widths and eight rows,
fading. Never a centred spinner: a spinner moves the eye to the middle of the
screen and then the content grows from the top, which is a double jump. If the
list has a cached view it renders immediately with a freshness badge instead of
a skeleton, and a subtle indicator shows the refresh.

**When empty, and no filter is applied.** One sentence about what will appear
here, one about when, and one primary action. An empty state without an action
is an apology.

**When empty, and a filter is applied.** The same, plus a "clear filters"
button and a count of what the filters excluded. The most common support
question about a list is "where did my record go", and the answer is almost
always "a filter you forgot".

**When the request failed.** The reason in the operator's words (permission,
validation, conflict, transient, unknown — §7.3), a retry if it is retryable, a
copyable request id, and no retry if it is not. A 403 that offers "try again" is
a lie that wastes a minute.

**Row.** A checkbox, the identifying field (always the same field for that
entity, always first), the fields the screen is about, a status with a shape and
a word, a relative timestamp with a hover for the absolute one, and a row action
menu. A row is focusable and Enter opens it. A row that can be opened in a new
tab is a real link.

**Selection.** Shift-click selects a range. The header checkbox selects the page
and offers "select all N matching this filter" in a second step, because the
difference between 25 and 4,000 is the difference between a decision and an
accident. The bulk bar states the count before and after the action.

**Below the list.** The total count, a page-size control that remembers, and the
pagination cursors. The count is repeated because on a long page the top of the
screen is a scroll away.

### 28.2 The detail convention

**Header.** The human name, the id in a monospace chip with a copy action, the
status with its shape and word, and the primary action. Back navigation that
returns where the operator actually came from, not always to the list.

**Body.** Three columns on a wide screen, one on a phone: the record's own
fields, its relationships, and its history. The history is always the `Timeline`
primitive, always the same visual grammar, and always present — a detail screen
without history forces a second screen.

**Actions.** The menu is ordered by destructiveness ascending, with the
destructive ones separated by a rule and rendered in the danger style. Each
opens a `Confirm` that names the record by its human name *and* its id, states
the effect in one sentence, lists what stops working, and — for the twelve verbs
in §9.7 — requires the typed confirmation and a reason.

**Unsaved changes.** Navigating away with unsaved changes prompts once. The
prompt names what will be lost. It does not appear for a change that was
autosaved, because a prompt for a change that is already saved trains people to
dismiss prompts.

### 28.3 The form convention

A form in a console is a privileged write with a label on it, so:

- **Every field has a label** that is visible, not a placeholder. A placeholder
  is a hint that disappears at the moment it is needed.
- **A hint** in one line, when the field is not obvious. If it is obvious, no
  hint — a form where every field has a paragraph is a form nobody reads.
- **Validation on blur and on submit**, never on every keystroke for a field
  that can be empty mid-typing. The message names the rule, in the same words as
  the database constraint.
- **An error summary** at the top after a failed submit, with each error a link
  that focuses its field.
- **A character count** where a limit exists, and the limit is the same number
  the constraint enforces.
- **A dirty guard**, a cancel that is a button rather than a browser back, and
  one primary action.
- **The primary action is disabled only with a stated reason**, never silently.
  A disabled button with no explanation is the most common accessibility failure
  in an admin console.

### 28.4 The destructive convention

Twelve verbs. One flow. In order:

1. **Name it.** "Suspend Rimi Akter (`8f3a…`)". Both the name and the id,
   because the name is what a human recognises and the id is what the database
   acts on.
2. **Say what happens.** One sentence in the active voice, in the operator's
   language.
3. **Say what stops working.** A short list. "They can sign in but cannot post,
   comment or message. Their existing content stays visible."
4. **Ask why.** A text field, minimum ten characters, with the placeholder
   giving the reason a good answer looks like.
5. **Ask for the confirmation.** For the twelve verbs, the typed phrase; for the
   five highest-impact, a second approver's name appears and the action is
   queued rather than performed.
6. **Link the runbook.**
7. **Perform, then receipt.** The toast says what changed, the record updates
   optimistically, and the receipt id is copyable.

The same flow, in the same order, with the same words, in all thirteen consoles.
Consistency here is not aesthetic: an operator who has to re-read a confirmation
in a hurry is an operator who mis-clicks.

### 28.5 The bulk convention

1. **Selection** with the count visible at all times.
2. **Preview.** The resolver runs in dry-run and returns, per id, what will
   change from what to what. The preview is a table the operator can scan, with
   a summary line: "24 will be suspended, 3 are already suspended and will be
   skipped, 1 cannot be changed because they are an owner."
3. **The three numbers.** Will change, will skip, will fail. An operator who
   cannot see the third number is being asked to gamble.
4. **Confirm** with the reason, applied to all — or per item when the verb
   requires it, which the bulk bar states before the preview.
5. **Apply**, with a progress that is honest about partial failure.
6. **Receipt.** Ids, before and after, operator, reason, request id. Fetchable
   for ninety days.

### 28.6 The notification convention

Toasts are for an action the operator just took. Banners are for a condition
that persists. Neither is for a message from another person, which is what the
notification centre is for. Three channels, three purposes, and a screen that
uses the wrong one is confusing even when it is technically working.

- **Toast**: 8 seconds, dismissible, queues rather than stacks, never overlaps
  the bulk bar, carries an undo for reversible actions.
- **Banner**: persistent until the condition clears, one at a time, ordered by
  severity, never blocks the primary action on a phone.
- **Centre**: everything that happened while the operator was not looking, with
  read state per operator, and a digest option instead of a stream.

### 28.7 The keyboard convention

One registry (`shortcuts.ts` in the kit) declares every binding with an id, a
description, a scope and a default key. From that one file come the handler, the
help sheet, the tooltip hints and the cheat sheet. A binding added anywhere else
does not exist.

The rules: no binding fires inside a text field or a contenteditable; a chord
shows a pending indicator and Escape cancels it; the palette is `⌘K`/`Ctrl-K`
everywhere; `?` opens the sheet; and every shortcut is also reachable by mouse,
because a shortcut-only action is an inaccessible action.

### 28.8 The offline convention

Three states, three behaviours, and no ambiguity about which one is showing:

- **Online.** Normal. A freshness badge on data older than the poll interval.
- **Degraded** (requests failing but the network is up). A banner; retries with
  backoff; writes still attempted with an idempotency key so a retry cannot
  duplicate.
- **Offline.** A banner that does not cover the action bar; reads served from
  the last-read cache and labelled as such; writes disabled with a stated reason
  *except* for the queueable ones (notes, drafts, preference changes), which are
  queued and shown as pending on the row they affect.

The one thing never queued is a destructive write. A suspension that fires forty
minutes later, when nobody is looking, is not a convenience.

### 28.9 The freshness convention

Every panel that shows data answers three questions without being asked: when
was this measured, from where, and is it still relevant. The `useFreshness`
hook returns an age; the panel renders it as "just now", "4 min", "2 h" with the
absolute time on hover and the source in a tooltip. Data past its stated window
is dimmed with a "stale" label rather than hidden, because a stale number the
operator knows is stale is more useful than a blank panel.

### 28.10 The error convention for the operator's own mistakes

An operator will try to do something they may not. The console answers in a way
that is useful rather than merely correct:

> Suspending a member needs the `people.suspend` permission. You have
> `moderation.resolve`. A manager or an admin can grant it, or you can escalate
> it for the rest of your shift.

Three parts: what was tried, what is missing, what to do next. A "403
Forbidden" tells the operator that they are stuck, which is a worse outcome than
telling them who to ask.

---

## 29. Copy standards

The consoles are read by people under time pressure, in two languages, at any
hour. The copy is part of the interface, not decoration on it, so it has rules.

**Say what happened, then what to do.** "Saved. The theme is live for everybody
who is not signed in." not "Success".

**Name the thing.** "Suspend Rimi Akter", not "Submit". A button whose label
could apply to any record on the screen is a button that gets clicked on the
wrong one.

**Numbers with units.** "4 min", "2 days", "৳1,200", never a bare "4".

**No jargon in member-facing copy.** A member does not have a "standing score";
they have an account that is "restricted until 12 March".

**Both languages written, not translated.** A Bangla string that is an English
sentence with Bangla words is worse than an English one. The rule for the
Bangle copy is that it is written by somebody who writes Bangla, and the parity
test proves presence rather than quality — quality is a review.

**No exclamation marks in a console.** Nothing in an operations console is
exciting, and a cheerful tone in an error message reads as mockery.

**Errors say the next action.** Every error message ends with something the
reader can do: retry, ask for a permission, correct a field, wait.

---

## 30. The eight recurring workflows

Twenty-four screens in this plan exist because these eight things happen. Each
is specified end to end here, because the value of a console is a workflow that
finishes rather than a screen that renders.

### 30.1 A report arrives and is resolved

1. `moderation_queue` returns the report ranked by severity, then age.
2. A moderator claims it. The claim is atomic; a second moderator sees it as
   taken within a poll interval and immediately on the realtime channel.
3. The detail shows the subject, the reporter's standing, prior reports on the
   subject, and the evidence.
4. The moderator writes a private note, then chooses an outcome from the enum.
5. The action is previewed: "Hide this comment. The author is not notified
   automatically; you can send the outcome message."
6. Confirm with a reason. The action writes, the audit row carries the diff, the
   case event is appended, and the member-facing message is generated in the
   member's language.
7. The queue advances to the next item without returning to the list, because a
   moderator works in a rhythm and a round trip to the list breaks it.
8. If the member appeals, the appeal lands in a queue where the original
   moderator cannot decide it.

Time from arrival to decision is recorded, and it is the number on the SLA
board. Nothing in the flow requires a page load.

### 30.2 A shop applies and is approved

1. `admin_pending_shops` returns applications with their age.
2. The reviewer opens the application: identity, catalogue completeness, the
   delivery areas offered, and the photos.
3. A completeness score names what is missing rather than giving a percentage.
4. Approve or reject, with a reason that becomes the member-facing message.
5. Approval creates the vendor row, seeds the default package, and grants
   `market.vendor`.
6. The receipt is fetchable, and the applicant's message names what happens next.

### 30.3 A certificate is issued for a cohort

1. The operator selects a course and an attempt date.
2. The console lists eligible members with a reason per exclusion — not
   completed, already holds one, no verified email.
3. Preview: N will be issued, M skipped, K failed. Each row is inspectable.
4. Issue. Each certificate gets its code, its check characters, its idempotency
   key and its PDF hash.
5. On any failure the receipt names the member and the reason, and the batch
   reports what committed.
6. A manifest of hashes is offered for download.

### 30.4 A notice is published with acknowledgement

1. Compose in the split pane; per-locale tabs show completeness.
2. Pick an audience; the reach count appears before publish.
3. Preview the member-facing page, the PDF, and the acknowledgement prompt.
4. Publish (or schedule). The notice goes live at the stated time in both
   languages.
5. The roster fills as members acknowledge; the funnel shows delivered, read,
   acknowledged.
6. A reminder can be sent to non-readers once, and that decision is recorded.
7. Withdrawal, if needed, sends a withdrawal message rather than a 404.

### 30.5 A setting changes safely

1. Search the key; open it. The schema, the current value, the provenance and
   the last change are on one screen.
2. Edit. Validation runs the shared validator before the RPC does.
3. The blast-radius panel lists the screens and jobs that read the key.
4. Save with a reason. The diff is written and the audit row is created.
5. The propagation state shows when every reader is on the new value.
6. Revert is one click and is itself audited.

### 30.6 An IP rule is added during an incident

1. The operator pastes the offending address or CIDR.
2. The simulator answers the decision and the matching rule.
3. The dry-run against seven days of logs shows how many legitimate requests
   would have been affected.
4. Shadow mode is offered as the default for the first hour.
5. The rule is saved with an expiry (24 hours by default) and a review date.
6. The self-block guard refuses if the operator's own current address matches.
7. The tracer can confirm the next request is handled as intended.

### 30.7 A performance regression is investigated

1. The vitals dashboard flags a route: "LCP p75 crossed 2.5s on three runs."
2. Open the route: the trend, the release comparison, the device breakdown.
3. The error board in the same window is filtered by that route, showing a new
   fingerprint.
4. The bundle watch shows whether the route's chunk grew in the same release.
5. An incident is declared if the regression is user-visible; if not, an action
   is recorded against the release.
6. The report is generated with a receipt so the fix can be proven later.

### 30.8 A person is suspended and it is reviewed

1. From the person record, choose suspend.
2. The confirm names the person and the id, states the effect, lists what stops
   working, requires a reason, and requires an expiry (indefinite needs a second
   approver).
3. Perform. The timeline gains an entry; the audit row carries the diff, the
   request id and the device.
4. The member sees their own standing and the date the restriction ends.
5. An appeal, if any, goes to somebody else.
6. Six months later, an auditor reads one screen: the audit row, the reason, the
   diff, the operator, and the device. The question "who did this and why" is
   answered without a meeting.

---

## 31. Batch specifications

Each batch below states its migrations, its functions, its screens, its tests
and its exit gate. A batch is a pull request; two batches in one pull request is
a review problem.

### 31.1 Batch 1 — Foundation

**Migrations.** None. This batch changes no schema, which is deliberate: the
foundation is proved before anything depends on it.

**Kit work.**
`ui/DataTable.tsx`, `ui/FilterBar.tsx`, `ui/Field.tsx`, `ui/Drawer.tsx`,
`ui/Confirm.tsx`, `ui/Toast.tsx`, `ui/Chart.tsx` (+ `twin` required),
`ui/Diff.tsx`, `ui/Timeline.tsx`, `ui/Empty.tsx`, `ui/Skeleton.tsx`,
`ui/ErrorState.tsx`, `ui/Breadcrumb.tsx`, plus `ui/shortcuts.ts` and
`ui/screen-states.ts` (the four-state harness).

`data/mutations.ts`, `data/freshness.ts`, `data/chunk-recovery.ts` (moved from
`main-site`, tests included), `data/retry.ts`, `data/cross-tab.ts`,
`data/offline-queue.ts`, `data/timeouts.ts`.

**Adoption.**
Every console's `AppShell` calls `useStaleBuildRecovery()`. Every console's root
wraps panels in `PanelBoundary`. Every console adopts `Toast` and `Confirm`.

**Tests.**
Rule tests for the retry policy, the offline queue's deduplication, and the
freshness states. A component test per primitive in both themes. The stale-build
recovery test copied per console (thirteen browser runs, each proving the
console does not blank on a deploy).

**Gate.** All thirteen consoles build; every console uses the new shell; the
stale-build browser test is green in all thirteen; bundle budgets are measured
for the first time and recorded.

**Why first.** Every later batch consumes these; a console that adopts the shell
afterwards pays the cost twice.

### 31.2 Batch 2 — Security spine

**Migration.** `0134_permission_grants.sql`, `0135_staff_sessions.sql`,
`0136_audit_shape.sql`, `0137_escalations.sql`, `0138_destructive_registry.sql`.

Functions: the fifteen in §16.4 batch 2, plus `bsdc.audit()` and the edge helper
that fills `ip_hash` and `device`.

**Screens.** The permission matrix with a diff-before-save; the escalation
request and approval queue; the session list in the shell's account menu; the
"what can I do" panel; the permission-denied screen that names the missing
permission.

**Tests.** Ten contract assertions per RPC (§18.4). The permission matrix
snapshot. The seventeen escalation tests from §27.4. A browser test that a
revoked session is signed out at the next navigation.

**Gate.** `db:prove` green with the new checks; the matrix snapshot reviewed and
committed; no console has a hardcoded role check (lint); F-01 and the new A-01
green.

**Risk.** This is the batch where a mistake locks staff out. Mitigation: the
owner's own permissions are never grantable through the UI, the last-owner guard
is tested first, and the break-glass path is written and drilled before the
batch merges.

### 31.3 Batch 3 — Command deck

**Migration.** `0139_telemetry_delta.sql`, `0140_receipts.sql`,
`0141_seo_and_redirects.sql`.

**Screens.** Overview with freshness, delta and provenance; approvals with SLA;
bulk with an authoritative preview and a receipt; CLI 2.0; marketplace payouts
with a two-person rule; campaigns; SEO with SERP preview and coverage;
redirects with cycle detection and 404 sources; sitemap with inclusion toggles;
branding with a side-by-side preview.

**Tests.** The preview-equals-apply test over 100 fixture rows; the
dry-run-writes-nothing test for every verb; the cycle-detection cases; the
two-person refusal; the CLI parser and completion.

**Gate.** `admin-site` at or under 240 KB; the CLI refuses every destructive verb
without the typed id; a bulk action's receipt matches its preview exactly.

### 31.4 Batch 4 — People and safety

**Migration.** `0142_cases.sql`, `0143_standing_ledger.sql`,
`0144_appeals.sql`, `0145_ladder.sql`, `0146_sla_policies.sql`.

**Screens.** Person record with the open-items strip and the merged timeline;
standing ledger; warning ladder; session revoke; moderation queue with claim and
SLA; report detail with case attach; appeals; workload; staff directory; roster
with coverage; handover.

**Tests.** Claim concurrency (100 parallel); appeal separation of duties; the
timeline merge for a fixture person; standing totals equal the ledger; ladder
transitions; the SLA clock's arithmetic across a timezone boundary.

**Gate.** Every destructive verb on a person goes through `Confirm` with a
reason; the queue's claim is atomic under test; no screen shows a member's
private content to a moderator without `moderation.read` on the specific
subject.

### 31.5 Batch 5 — Documents

**Migration.** `0147_certificate_identity.sql`, `0148_notice_lifecycle.sql`,
`0149_legal_hold.sql`, `0150_numbering.sql`.

**Screens.** Certificate registry, issue, detail with chain, template studio,
batch; notice registry, compose, detail with roster and funnel, schedule.

**Tests.** Code collision under 100 parallel issues; check-digit rejection of
every single-character substitution; PDF byte equality across two generations;
revision immutability (an update attempt fails); roster completeness against a
fixture audience; the delivery funnel's three counts summing to the audience.

**Gate.** A revoked-then-restored certificate shows both facts in its chain; a
notice cannot publish without an audience; the verification response matches its
allow-list.

### 31.6 Batch 6 — Runtime and edge

**Migration.** `0151_setting_schema.sql`, `0152_ip_rules.sql`,
`0153_custom_page_versions.sql`.

**Screens.** Settings with provenance, schema, diff and history; staged changes;
config diff; IP rules with simulator, dry-run, tracer, shadow mode and expiry;
custom pages with the real-renderer preview, three widths and the publish check.

**Tests.** The shared validator is called by UI and RPC (one definition); secret
settings never return a value; the self-block guard; rule conflict detection;
CIDR validation; preview equals published bytes.

**Gate.** No secret is readable; no setting saves outside its schema; an IP rule
cannot be saved without an expiry.

### 31.7 Batch 7 — Signal

**Migration.** `0154_vitals_budgets.sql`, `0155_incidents.sql`,
`0156_status_components.sql`, `0157_alerts.sql`, `0158_webhooks.sql`.

**Screens.** Vitals with budgets and regressions; errors with fingerprints and
impact; edge latency; bundle watch across all thirteen; reports with receipts;
incidents with the two-box update; status board with derived health;
maintenance; subscribers; alerts with routing; staff channels with presence and
search; verification desk with batch.

**Tests.** The three-run regression rule; incident state transitions; status
health derived from a probe stub (never typed); alert routing; webhook retry and
circuit breaking; verification allow-list.

**Gate.** An incident cannot resolve without a customer-facing summary; a
component cannot be set green by hand; a subscriber receives one notification
per update, not two.

### 31.8 Batch 8 — Cross-cutting craft

**Migrations.** None.

**Work.** Keyboard traversal tests per console; focus-visible assertions; live
regions; the four-state test harness applied to every screen; full `en`/`bn`
parity with the key-set test; Bengali digits through the formatting layer;
logical properties; nine-width overflow tests; 44px targets; reduced motion;
high contrast; zoom to 200%; print stylesheets; the density switch.

**Gate.** The accessibility suite green on all thirteen; the parity test green;
overflow green at nine widths; zero uncaught exceptions.

### 31.9 Batch 9 — Hardening and proof

**Migrations.** `0159_metric_definitions.sql`, `0160_retention.sql`,
`0161_explorer_views.sql`, `0162_audit_archive.sql`.

**Work.** The console browser suite wired into CI; the per-console budget gate;
the fifteen new audit invariants; the migration linter; the seven rules from
§19.3; the ledger generator; the runbook files for the twelve verbs; the
kill-switch drill; the eight recurring workflows documented as runbooks; the
final count.

**Gate.** Every gate in §19.1 green; the ledger's delivered count equals its
total; the drill records exist and are dated.

---

## 32. The nightly and weekly jobs

Five scheduled jobs, each with a stated failure mode:

**The escalation sweep**, every minute. Flips expired escalations to revoked,
records the lapse, and notifies the holder and the approver. Failure mode: an
expired escalation grants longer than it should, which is why the read path also
excludes expired rows — the sweep is a record-keeping job, not the enforcement.

**The retention job**, nightly at 02:00. Reads `retention_policies`, deletes or
anonymises per data class, writes its own audit row with counts. Failure mode:
data lives longer than the policy, which is a compliance finding rather than an
outage; it alerts after two consecutive failures.

**The audit archive**, monthly. Moves rows older than 24 months to
`audit_archive` and records the move in the live log so the archive is
discoverable. Failure mode: the live table grows; it alerts at a size
threshold.

**The digest**, daily at 06:00 in the operator's timezone. Sends each staff
member the top five things that changed or need them, once, and only if there is
something to say. Failure mode: a missed digest, which the in-app centre covers.

**The regression check**, after every deploy. Compares the vitals window before
and after the release and flags a crossing of any budget. Failure mode: a
regression is noticed a day later by a person instead of in an hour by the job.

None of these jobs is allowed to be the only enforcement of a rule. Each is a
bookkeeping convenience layered over a policy that holds without it — which is
the same principle as §2.2, applied to time.

---

## 33. The read path and why it matters more than the write path

Most of a console's life is spent reading. An operator reads a queue a hundred
times for every decision they make, so a read that costs 800ms costs more
attention than a write that costs two seconds.

Four rules govern every read:

**One call per panel.** A screen that fires six queries renders in six steps and
shifts while it does. Each panel gets one RPC that returns everything it shows,
including the counts beside the rows, computed in the database where the rows
already are.

**Server-side aggregation.** Never ship five thousand rows to count them. If a
panel shows "23 open, 4 overdue", the database counts, because the browser is
the most expensive place to do arithmetic.

**Batched lists.** A list with a sparkline per row gets its sparklines from one
call keyed by the row ids, not one call per row. The data module provides
`batch()` for exactly this, and the audit asserts no screen exceeds six calls
(§14.5).

**Cursor pagination, never offset.** An offset page under live inserts skips or
repeats rows, which in a moderation queue means a report is never seen. Every
list pages by a stable cursor — a compound of the sort key and the id — and a
test inserts rows between two page fetches and asserts no row is skipped.

The performance consequence is measurable: a queue of five thousand reports
opens in under 1.5 seconds, which is the number in §14.5, and the technique is
that the first page is twenty rows plus three counts.

---

## 34. Failure modes, one screen at a time

For each of the eight recurring workflows (§30), the question "what happens when
it breaks halfway" has a specific answer. This is the section that decides
whether the console is trusted after its first bad day.

**A report is claimed and the moderator's network drops.** The claim succeeded
server-side. On reconnect the queue shows it claimed by them, with the claim
time and a "you claimed this 4 minutes ago" line. Nothing is lost, because the
claim is a row, not client state.

**A suspension is submitted and the response is lost.** The RPC is idempotent on
the request id: the retry returns the same receipt rather than suspending twice.
The UI shows the receipt after the retry, so the operator knows it happened once.

**A shop approval is submitted and the database is slow.** The button shows a
pending state with a cancel that cancels the *waiting*, not the action, and says
so. The receipt appears when the response arrives. An operator who clicks four
times because nothing seemed to happen is the failure this prevents.

**A bulk action fails on item 47 of 300.** The receipt names items 1–46 as
committed, 47 as failed with its reason, and 48–300 as not attempted. The
operator can retry from 47 with one click, and the retry is idempotent so the
first 46 are not re-applied.

**A certificate PDF fails to render.** The certificate row exists with its code
and its hash; the PDF is regenerated on demand from the record and the template
version, so a failed render is a retry, not a lost document. The registry shows
the certificate with a "PDF not yet generated" state rather than hiding it.

**A notice is scheduled and the job does not run.** The notice stays in
`scheduled` past its time, and the admin overview flags "1 notice overdue" with
the time it should have gone live. A schedule that silently does nothing is
worse than no schedule.

**A setting is saved and one reader keeps the old value.** The propagation panel
shows the readers and their last-seen version; the cache invalidation has a
retry; and the audit row records the invalidation result so a stuck reader is
visible rather than mysterious.

**An IP rule is applied and a legitimate user is blocked.** The rule has an
expiry and a review date, the dry-run estimated the impact before it was saved,
and the emergency unblock is one click with a reason. The failure is bounded by
design rather than discovered by a complaint.

**The console itself fails to load after a deploy.** `chunk-recovery` reloads
once into the new build and the page opens. If it cannot, the error screen names
the build and offers a copy button, so the operator can state what they were
running when they report it.

---

## 35. What "ultra advanced" means here, concretely

The brief asks for advanced. Advanced in an operations console is not
three-dimensional charts or animated transitions; those are decoration, and
decoration in a tool used under pressure is a cost. Advanced is that the console
remembers, anticipates, explains and proves.

**It remembers.** The view, the filters, the columns, the density, the tab, the
scroll position, the last record opened, the saved search, the recent items. An
operator who has to reconstruct their context after every navigation is doing
bookkeeping instead of work.

**It anticipates.** The preview before the action, the reach count before the
publish, the dry-run before the rule, the impact estimate before the save, the
SLA clock before the breach, the coverage gap before the shift, the regression
before the complaint. Every one of those is a number computed *before* a
commitment rather than a report after it.

**It explains.** Every number has provenance, every state has a word, every
permission refusal names the missing permission and who can grant it, every
error names the next action, every record has a history, and every audit row
carries a reason in the operator's own words.

**It proves.** Receipts for bulk actions, hashes for exports, receipts for
documents issued, request ids for errors, a snapshot test for the permission
matrix, and a browser test for every primary path. The console does not ask to
be trusted; it shows its work.

That is the standard every feature in the inventory is measured against, and it
is why 428 of the 1,013 features are tier 1: they are the ones without which one
of those four verbs fails.

---

## 36. Feature rationale

An inventory of a thousand rows is a promise; this section is the
argument for it. Each group below explains why its features exist, what happens
without them, and which of the four verbs from §35 they serve. A feature whose
group cannot state that is a feature that should be cut, and the reader is
invited to cut it.

### admin-site — command deck — 43 features

The command deck is the console an owner opens first, so its 43
features are about the first thirty seconds: is anything on fire, what needs a
decision, what can I do in bulk. Freshness and provenance exist because a count
with no age is the most dangerous object on a dashboard. The SLA clock exists
because a queue with no clock is a queue that grows. The authoritative preview
exists because a bulk action without one is a gamble with other people's
accounts. The two-person rule exists on exactly the two actions where one person
should not be able to decide alone. CLI 2.0 exists because the fastest interface
an experienced operator has is a command line, and a command line without a
dry-run is a hazard.

### bsdc-cert — 22 features

### bsdc-config — 24 features

### bsdc-connect — 18 features

### bsdc-custom — 21 features

### bsdc-ip — 22 features

### bsdc-mod — 22 features

### bsdc-notice — 21 features

### bsdc-perf — 21 features

### bsdc-status — 15 features

### bsdc-uadmin — 21 features

### bsdc-umod — 16 features

### bsdc-vf — 12 features

### Communication craft — 12 features

Communication exists because a member-facing message is a
privileged write with a blast radius measured in people. Templates, a reach
count before send, both languages per message, a suppression list that is
honoured, a delivery report with three counts, scheduled send with an explicit
timezone, and bounce handling that suppresses automatically with a reason. A
message sent to the wrong cohort cannot be recalled, which is why every one of
these twelve is a control.

### Compliance and privacy — 15 features

Compliance is the group that turns obligations into workflows.
A data-subject request with a lawful basis and a counted deadline. An export that
is complete and hashed. An erasure with a proof that lists each table and the
row count it removed. A retention schedule as data. A legal hold with a scope. A
quarterly access review with a signature. And reads logged, not only writes,
because "who looked at this member" is asked in every serious privacy review and
cannot be answered retrospectively.

### Kit primitives and platform services — 92 features

The kit is where a console stops being a screen and becomes a
reliable instrument. The 30 primitives and 20 platform services exist because the
alternative was tried and failed: thirteen consoles each implementing their own
table, their own retry, their own toast, drifting until "suspend" means one thing
in `moderator-site` and another in `users-admin-site`. Every primitive carries the
four states a screen actually has — empty, loading, error, populated — because
those are the states an operator meets at 03:00 when something is wrong, and a
component that only works when the data is present is a component that fails at
the moment it matters. The platform services are the difference between a console
that is fast and one that is merely not slow: the mutation helper with rollback,
the freshness hook that ages visibly, the offline queue that replays exactly once,
and `chunk-recovery` moved here from `main-site` so a deploy no longer blanks a
console mid-action. These features serve *remembers* and *anticipates*; without
them, everything built on top is a demo.

### Craft: interface, accessibility, language, mobile — 135 features

Craft is the group most often cut and most often regretted. These 120
features are the difference between an operator who trusts the console and one
who keeps a spreadsheet beside it. The accessibility items are not compliance
theatre; a keyboard-first triage mode is how a moderator clears forty reports in
twenty minutes, and a screen reader label is how the same operator works when
their monitor fails at 2am. The language items exist because half the staff read
Bangla faster than English and a console that is English-only is a console half
the team avoids. The mobile items exist because the person who answers a page is
usually not at a desk. The state-copy items — empty, loading, error, success,
disabled — are the states that produce support tickets, because a blank screen
says nothing and a "Saved" toast says nothing useful. These serve all four verbs
at once, and they are the cheapest features in the plan per unit of trust
gained.

### Data: analytics, reporting, explorer — 34 features

Data is how a thousand decisions become a trend somebody can act on.
Provenance on every number, a definition registry, a comparison against the prior
period, a small-sample warning, and a drill-down that keeps its window. The
read-only explorer is curated rather than general on purpose: a view that joins
three tables can leak a column nobody intended, so eight views with written-out
columns are reviewable and a schema browser is not. Reporting exists because the
same six numbers are assembled by hand every week in most organisations, and a
saved query with a definition is the end of that.

### Documents: certificates and notices — 30 features

Documents are the group whose artifacts outlive the platform's
memory of producing them. Thirty features, and they are controls: a code that
cannot collide, a check character so a typo is caught before a lookup, an
idempotency key so a double click is one certificate, a chain so a reader can
follow an amendment, a revocation that explains itself, a PDF reproducible
byte-for-byte so its hash means something, and a verification response that
carries nothing the document does not. On the notice side: revision history that
is never rewritten, an acknowledgement roster that is complete, a withdrawal
rather than a deletion, and a legal hold that makes a hold real.

### Editor craft — 14 features

The editor group is craft applied to a privileged write. A toolbar
that never loses the caret, a link checker before publish, alt text required,
tables that emit valid markdown, find and replace with a preview, autosave with a
conflict warning, and a diff against the published version before publishing. A
publishing console's entire output is text somebody wrote, so the editor is the
product.

### Hardening: tests, budgets, proof — 92 features

Hardening is the group that makes every claim in this document
checkable. A console that performs a destructive action and has no browser test
is a console whose next refactor is a gamble. The 84 items here are the gates:
thirteen builds measured, per-console budgets, a contract proof per RPC, RLS
proofs, concurrency and idempotency tests, and the discipline of proving a test
can fail — which the stale-build work in `5967a2e` demonstrated was necessary
when a harness passed without the fix it was meant to prove. These serve
*proves*. They are last in the schedule only because they need something to
check; they are first in importance in the sense that without them, "production
grade" is an adjective rather than a fact.

### main-site /admin hub — 6 features

### Money: wallets, invoices, payouts — 14 features

Money is small amounts, many accounts and a ledger that must
reconcile. Balance equals the sum of entries, asserted by test. Two-person
approval above a threshold, where the threshold is data. Invoice numbers with no
gaps. Refunds as append-only ledger entries. Aging buckets for outstanding
balance. No float arithmetic anywhere. These are fourteen features and every one
of them is a control, because a financial console whose numbers do not reconcile
is a console nobody uses twice.

### Operations: queues, handover, reviews — 72 features

Operations is the group that makes thirteen consoles behave as
one suite rather than thirteen tools with different habits. The unified inbox
exists because an operator with four consoles open spends their first ten
minutes deciding what to look at. The claim engine exists because two moderators
on one report is wasted work and a confused member. The handover exists because
context lost at a shift change is the most expensive recurring failure in any
24-hour operation. Delegation, out-of-office and quiet hours exist because staff
are people with shifts, leave and sleep. The runbooks and the weekly review
exist because a plan without a rhythm becomes a document that was true in
November.

### People and safety (cross-console) — 70 features

The people group is the one where a mistake is felt by a
person rather than seen in a chart. Seventy features orbit a single question an
escalation actually asks: what did they do, what was done about it, and what is
open right now. Without the merged timeline, answering that question takes four
screens and a meeting. Without the standing ledger, a points total becomes an
unarguable number with no history, which is how moderation decisions stop being
reviewable. Without the warning ladder, a member cannot see the next step and
argues with the system instead of the decision. Without the appeal-by-someone-else
rule, an appeal is a formality. Without the SLA policy as data, a severity's
target lives in somebody's head. Each of these is a control or an operation, and
each one converts an argument into a record.

### Reporting — 15 features

Reporting makes the console's own record board-readable. Every
report is a saved query with a definition, states its range and freshness, is
stable-ordered so two runs diff, carries a hash, and can be scheduled to named
recipients. Eight templates cover the recurring needs: weekly staff, monthly
trust and safety, quarterly access review, annual compliance pack. These exist
because the alternative in most organisations is a person assembling the same six
numbers by hand every Monday.

### Runtime: config, custom pages, IP, integrations — 35 features

Runtime is the group of settings, pages, rules and integrations —
the switches that decide what the product is, rather than what it looks like.
Provenance exists because "why is this on" is answered by the source, not the
value. Blast radius exists because changing a setting is easy and knowing what
it touches is not. Write-only secrets exist because a secret displayed once is a
secret in a screenshot. The IP simulator exists because the difference between a
blocked customer and a five-minute investigation is naming the rule that
matched. Shadow mode exists because a rule added during an incident should prove
itself for an hour before it is armed. Dry-run against real logs exists because a
block that takes out a payment callback is invisible until it is saved.

### Search and discovery — 10 features

Search is ten features and they are all about the difference
between a box that queries and a tool that finds. Ranking that shows *why* a
result matched, typo tolerance for English and phonetic matching for Bengali,
saved searches with alerts, permission-aware type filters, and result rows that
are readable at 250px. A console with thirteen surfaces and no search is thirteen
places to look.

### Security: permission and session spine — 6 features

The security spine is six features in the inventory and it is the
largest single body of work in the plan, because the inventory counts capabilities
while this group is the permission writer, the session governance, the audit
shape and the destructive registry — each one an enabling condition for dozens
of others. Deny beats allow. Expiry is enforced twice. Approver is never
requester. Rank is never exceeded. The last owner cannot be demoted. And every
state change writes an audit row or fails, which is the difference between a
policy and a habit.

### Security hardening — 17 features

Security hardening is the second layer: break-glass with a named
approver and a one-hour window, a lockdown mode that freezes privileged writes,
WebAuthn, recovery codes shown once, impossible-travel detection, and a posture
score whose every factor links to its fix. These exist because prevention
eventually fails somewhere, and what determines the cost of that failure is how
fast somebody can see it, revoke it and record it.

### Signal: vitals, incidents, verification — 54 features

Signal is how the platform tells the truth about itself. Fifty-four
features cover vitals, incidents, alerts and verification. The vitals work is
about turning a number into a decision: a budget, a three-run rule, a release
comparison, and a correlation with the error fingerprint that appeared in the
same window. The incident work is about a record that survives its own
resolution — two boxes, one internal and one public, so a customer never reads
"we think it was the cache" as an official statement. The alert work is about
routing: which event pages a human at 03:00, in a table rather than a comment.
The verification work is about answering "is this document real" in one query
while revealing nothing the document does not already show. These serve
*explains* and *proves*.

### Tools and generators — 12 features

Tools are the group that keeps the plan's own rules enforceable after
everybody who wrote them has moved on. A console scaffolding command, a screen
generator that adds the four state tests, an RPC generator that adds the
permission, the audit and the proof, a permission constant module shared by code
and migrations, a migration linter for the three rules, a fixture builder, and a
component gallery. Eight features that make the correct thing the easy thing,
which is the only mechanism that survives a busy quarter.

### The remaining console-specific groups

`bsdc-config` (24), `bsdc-custom` (21), `bsdc-ip` (22), `bsdc-perf` (21),
`bsdc-cert` (22), `bsdc-notice` (21), `bsdc-uadmin` (21), `bsdc-umod` (16),
`bsdc-mod` (22), `bsdc-connect` (18), `bsdc-status` (15), `bsdc-vf` (12) and
`main-site-admin` (6) are specified feature by feature in §3.1 and screen by
screen in §17. Their rationale is shared and simple: each console exists because
a domain needs a place where its decisions are made, and each of its features is
either the authority that makes a decision safe, the view that makes it
informed, or the record that makes it reviewable. A feature in one of these
groups that is none of those three was cut at review.


## 37. Sequencing and effort

The plan is nine batches. Each is sized in *reviewable units* rather than in
days, because a day estimate for work nobody has started is a fiction that
becomes a deadline. A unit here is a screen with its rule, its authority, its
four-state tests and its copy — the smallest thing that can be reviewed and
merged on its own.

| Batch | Migrations | RPCs | Screens | Units | Depends on |
|---|---:|---:|---:|---:|---|
| 1 Foundation | 0 | 0 | 0 | 14 primitives + 7 services | — |
| 2 Security spine | 5 | 15 | 5 | 12 | 1 |
| 3 Command deck | 3 | 9 | 10 | 22 | 1, 2 |
| 4 People and safety | 5 | 12 | 11 | 26 | 1, 2 |
| 5 Documents | 4 | 7 | 9 | 20 | 1, 2 |
| 6 Runtime and edge | 3 | 7 | 9 | 18 | 1, 2 |
| 7 Signal | 5 | 7 | 12 | 24 | 1, 2 |
| 8 Craft | 0 | 0 | 13 (pass) | 16 | 3–7 |
| 9 Hardening | 4 | 0 | 0 | 20 | all |

Batches 3 through 7 are independent of each other and may proceed in parallel
with separate reviewers, which is the only reason this schedule is plausible:
the critical path is batch 1, then batch 2, then the longest of batches 3–7, then
8, then 9.

Batch 2 is the constraint. It is also the batch where a mistake is most
expensive, so it should be the batch with the most review time per line rather
than the least — which is the opposite of what usually happens to work that
"ships nothing visible".

---

## 38. Review protocol for privileged work

A pull request that changes who can do what, or adds a way to do something
destructive, gets a review that is not a diff read. The reviewer works the
adversarial cases:

1. **Try to escalate.** With a fresh manager token, attempt to grant admin, to
   grant `permissions.write` to themselves, to approve their own escalation, and
   to demote the last owner. Each must fail, and the failure must be in the
   database.
2. **Try to reach it anonymously.** Call every new function with an anon token.
   Each must raise. If any returns, the pull request stops here.
3. **Try to act without a reason.** Call every destructive path with an empty
   reason. Each must raise.
4. **Try to act twice.** Call every create path twice with one idempotency key.
   There must be one row.
5. **Try to act concurrently.** Run the claim, the code issue and the counter
   increment under a hundred parallel callers. There must be one winner and no
   duplicates.
6. **Read the audit row.** After each action, the row must carry a reason, a
   diff, a request id and a device. A row with an empty diff on an action that
   changed a field is a failed review.
7. **Disable the fix.** For any new guard, comment it out, watch the test fail,
   restore it. A test that stays green is a test that is not testing the guard.

Seven steps, and the pull request body records the result of each. This is not
bureaucracy; it is that the alternative is reading SQL and hoping.

---

## 39. The ledger

The ledger is the plan's own accounting. It is generated from the acceptance
matrix rather than typed, so it cannot drift, and it carries a state per feature:

| State | Meaning |
|---|---|
| `planned` | in this document, no work started |
| `building` | a pull request is open |
| `built` | all six done-columns true, gate green |
| `verified` | built, and its browser or contract test has been seen to fail once |
| `dropped` | cut, with a reason recorded |
| `blocked` | waiting on a decision in §23 |

At the time of writing, every one of the 1,013 features is `planned`. That is
the honest state, and stating it is the point of having a ledger at all: a plan
that begins by claiming progress is a plan that cannot be used to measure any.

The generator does three things the document cannot:

- it fails when a feature is `built` without its six columns being true;
- it fails when a `verified` feature's test is deleted or skipped;
- it prints the count by tier, by area and by state, so the next response can
  begin with a number rather than an adjective.

---

## 40. The acceptance matrix, and how to read it

Response 10 carries the full matrix: 1,013 rows × 6 columns of evidence. The
columns are the six from §3.2 — rule, authority, screen, proof, audit, copy —
and each holds a path rather than a tick, so a reviewer can open the evidence:

| Column | Holds |
|---|---|
| Rule | `path/to/model.ts#functionName` |
| Authority | `migration.sql#function_name` or `policy_name` |
| Screen | `console/src/Component.tsx#control` |
| Proof | `path/to/x.test.ts > test name` |
| Audit | the `action` string written to `audit_log` |
| Copy | the `en` and `bn` keys |

A feature whose authority column says `screen-only` is a feature that does not
have an authority, and it is not a control — it is marked as such and reviewed
as a convenience. This is the single most useful thing the matrix does: it makes
the difference visible rather than assumed.

---

## 41. Closing the loop with the existing work

This plan does not start from nothing, and it should not pretend to. The
following already exist and are extended rather than replaced:

| Exists today | Extended by |
|---|---|
| `bsdc.has_permission` reading `role_permissions` | scopes, denies, expiring grants (§9.1–9.3) |
| `audit_log` with actor, action, subject, metadata | reason, diff, request id, device, archive (§9.5) |
| `bsdc_role` enum with seven roles | unchanged; permissions become the unit (§2.3) |
| `feature_flags` with 32 seeded plugins | owner, kill switch, rollout percentage (§16.3) |
| `CliConsole` with a verb grammar | dry-run, fuzzy completion, help, macros (§8.4) |
| `BulkWorkbench` | authoritative preview and receipts (§8.3) |
| `admin_telemetry_snapshot` | age, delta and provenance (§8.1) |
| `chunk-recovery` in `main-site` | moved to the kit, adopted by thirteen consoles (§7.3) |
| `corporate-kit` shell, rail, palette | keyboard registry, session panel, freshness (§7.2) |
| `db:prove` with 76 checks | roughly doubled, ten assertions per new RPC (§18.4) |
| `audit.mjs` with its invariant set | 15 new console invariants (§19.2) |
| certificate revision chains | navigable in the UI, legal hold (§11.1) |
| notice revisions and rosters | acknowledgement funnel and reminders (§11.2) |
| moderation queue and claims | SLA as data, workload, appeals, cases (§10.2) |
| performance vitals and reports | budgets, regression rule, release comparison (§13.1) |

Nothing in this table is thrown away, which is the test of whether an upgrade is
an upgrade or a rewrite wearing one.

---

## 42. The first three pull requests, concretely

A plan whose first step is unclear is not executable. So:

**Pull request 1 — the kit primitives, no adoption.**
Adds `DataTable`, `Field`, `Empty`, `Skeleton`, `ErrorState`, `Confirm`,
`Toast`, `Timeline`, `Diff` and `shortcuts.ts`, each with rule tests and a
component test in both themes. Nothing consumes them yet, so the risk is zero
and the review is a component review. Gate: typecheck, lint, tests, and the
component gallery page renders every primitive.

**Pull request 2 — the platform services, and adoption in one console.**
Adds `mutations.ts`, `freshness.ts`, `timeouts.ts`, `offline-queue.ts`, moves
`chunk-recovery.ts` from `main-site` with its tests, and adopts everything in
`admin-site` only. This is where the pattern is proved on a real screen with a
real reviewer, and where the stale-build browser test is copied to a second
application for the first time. Gate: `admin-site` builds, its browser smoke
passes, and the stale-build test goes red when the recovery is disabled.

**Pull request 3 — the audit shape, before the permission writer.**
Adds the four `audit_log` columns, `bsdc.audit()`, the edge helper that fills
`ip_hash` and `device`, and the trigger that fails a state change with no audit
row. No new capability, no new screen. This goes before the permission writer
because the permission writer's own audit rows depend on it, and because a
trigger that fails a transaction is exactly the kind of change that should be
merged and watched for a day before anything else relies on it.

Three pull requests, each independently reviewable, each leaving the system in a
state where everything that worked before still works. That is how the remaining
nine batches land.

---

## 43. Summary

The admin surface is capable and not yet trustworthy, and the difference is
specific: eleven measured gaps, a permission table with no writer, an audit log
that records that something happened but not what, and thirteen consoles that
have never been opened in a browser test.

This plan closes all eleven, extends the permission model to action-level
scopes with expiry and separation of duties, gives every state change a reason
and a computed diff, and specifies 1,013 features across nine batches — 428 of
which are controls without which one of the four verbs *remembers*,
*anticipates*, *explains* or *proves* fails.

It costs, it is ordered so nothing is built on a foundation that is not there,
and it is measured by a ledger that starts at zero and will not claim otherwise.

The next response builds the foundation.

## 44. Per-console implementation specifications

§17 describes each console in terms of purpose and screens. This section
describes it in terms of code: the files, the state, the functions and the
wiring. It is the section an engineer opens on their first morning on the
batch.

### 44.1 The file convention inside a console

Every console follows the same shape, because a console you have never opened
should not require a tour:

```
<console>/src/
  main.tsx            mount, providers, nothing else
  App.tsx             tabs and command actions; no logic
  model.ts            every pure rule this console owns
  model.test.ts       one test per branch
  components/         screens and panels, one file per screen
  components/<Screen>.test.tsx    four states, both themes
  copy.ts             the keys this console adds, if any
```

The rule is that `App.tsx` contains no `if` that decides anything, and
`model.ts` contains no JSX. A screen that branches on a domain rule imports the
rule; a rule that needs to know about a screen is a rule in the wrong place.

### 44.2 `admin-site`

**`App.tsx`.** Nine tabs, two lazy screens (`CliConsole`, `BulkWorkbench`), two
command-palette actions, and one `usePaneRestore('admin-site')` call so a reload
returns to the tab you were on. Nothing else.

**`model.ts`** grows five pure functions:

```ts
export function decidePreview(
  verb: BulkVerb, rows: readonly BulkRow[], actorRank: number,
): { change: readonly BulkRow[]; skip: readonly BulkRow[]; fail: readonly BulkRow[] }
export function slaState(dueAt: string, now: Date): 'ok' | 'soon' | 'breached'
export function serpTruncate(title: string, description: string): { title: string; description: string; cut: boolean }
export function redirectCycle(from: string, to: string, rules: readonly RedirectRule[]): string[] | null
export function telemetryDelta(current: Kpi, previous: Kpi): { value: number; direction: 'up' | 'down' | 'flat' }
```

`decidePreview` is the one that matters. It is the resolver the RPC uses, so the
preview and the apply cannot disagree, and its test asserts that for a hundred
generated fixture rows the three buckets partition the input exactly.

**Screens and their wiring.**

| Screen | Reads | Writes | States |
|---|---|---|---|
| `Overview.tsx` | `admin_telemetry_delta` | — | fresh, stale, partly-failed |
| `Approvals.tsx` | `admin_pending_shops`, `admin_pending_campaigns` | `admin_approval_decide` | empty, breaching, loading |
| `BulkWorkbench.tsx` | `admin_bulk_preview` | `admin_bulk_apply` | selecting, preview, applying, receipt |
| `CliConsole.tsx` | `admin_cli_resolve` | verb-specific | idle, running, failed |
| `Marketplace.tsx` | `ad_credit_queue`, `mk_admin_list_*` | `topup_ad_wallet` | awaiting-second-approver |
| `Campaigns.tsx` | `admin_pending_campaigns`, `campaign_performance` | pause/resume | pending on booking |
| `Pages.tsx` | `seo_for_path`, `seo_coverage` | `set_seo_override` | coverage-gap |
| `Redirects.tsx` | redirect list, `redirect_404_sources` | `set_redirect` | cycle-warning |
| `Sitemap.tsx` | `sitemap_sections` | toggle | — |
| `Branding.tsx` | `site_config_list` (brand keys) | `save_brand_theme`, `activate_brand_theme` | contrast-blocked |

**The CLI's grammar.** `cli-engine.ts` already parses verb-noun with quoted
arguments. It grows three things and keeps its shape: a `--dry-run` flag on
every verb that reaches `admin_cli_resolve` instead of the verb's RPC, a
`completion(source)` function that returns candidates for the cursor position
from the static grammar plus the live index, and a `describe(verb)` function
that returns the usage line, flags, one example, the permission and the
destructive flag. All three are pure and tested without a terminal.

### 44.3 `users-admin-site`

**`model.ts`** owns the two rules that govern everything a person screen can do:

```ts
export function roleChange(
  from: Role, to: Role, actorRole: Role,
): { allowed: boolean; gained: readonly string[]; lost: readonly string[]; reason?: string }
export function standingTotal(entries: readonly StandingEntry[], now: Date): number
```

`roleChange` returns the permission diff, which the UI shows *before* the save,
and a refusal with a reason, which the UI shows instead of a disabled button.
`standingTotal` sums unexpired entries; a test asserts it equals the value the
RPC computes for the same fixture, because two implementations of one total is
how a score becomes arguable.

**Screens and their wiring.**

| Screen | Reads | Writes |
|---|---|---|
| `People.tsx` | `admin_people` | — |
| `Person.tsx` | `person_timeline`, `admin_people`, `staff_sessions_list` | `people_suspend`, `people_standing_adjust`, `people_role`, `staff_session_revoke` |
| `Directory.tsx` | `staff_directory` | — |
| `Verify.tsx` | `issue_staff_card` (lookup) | — |

**The suspend confirm**, written out, because it is the flow every other
destructive confirm copies:

```
Title    Suspend Rimi Akter (8f3a2c1d)
Body     Rimi will not be able to sign in. Their posts, comments and messages
         stay visible. Existing sessions are ended immediately.
Reason   [min 10 characters]  "Repeated harassment after a warning on 12 Nov"
Expiry   [ 1 day | 7 days | 30 days | indefinite (needs a second approver) ]
Runbook  How to suspend and how to reverse it  ↗
[Cancel]                                   [Suspend account]
```

The typed confirmation is not required for a suspend — it is required for a ban
and a deletion — because a confirmation that appears on every action stops being
read. That judgement is deliberate and is recorded in the destructive registry
(§9.7) rather than left to the screen.

### 44.4 `moderator-site`

**`model.ts`** owns queue order and severity escalation:

```ts
export function rankQueue(rows: readonly QueueRow[], now: Date): readonly QueueRow[]
export function severityFor(reports: readonly Report[]): Severity
export function slaState(dueAt: string, now: Date): 'ok' | 'soon' | 'breached'
```

`rankQueue` is the sort the RPC uses, returned in the same order, so the screen
never re-sorts and the two cannot disagree. Its test pins the tie-break: equal
severity, then oldest first, then id, so the order is total and stable.

**Screens and their wiring.**

| Screen | Reads | Writes |
|---|---|---|
| `Queue.tsx` | `moderation_queue` | `claim_report` |
| `Report.tsx` | report detail, `person_timeline` | `resolve_report`, `content_hide` |
| `Reports.tsx` | `queue_workload`, backlog | — |
| `Patterns.tsx` | pattern rules | `pattern_simulate`, save rule |
| `Appeals.tsx` | appeals | `appeal_decide` |

**Keyboard triage**, specified: `j`/`k` move the selection, `Enter` opens, `a`
opens the action menu, `r` opens resolve, `x` selects for bulk, `/` focuses
search, `?` opens the sheet, `Esc` closes. Every one is registered in the kit's
registry so it appears in the cheat sheet and the palette, and none fires inside
a text field.

### 44.5 `certificate-site`

**`model.ts`** owns identity and the chain:

```ts
export function codeFor(seed: string): string            // body + check characters
export function checkDigits(body: string): string
export function verifyCode(code: string): { valid: boolean; body?: string; reason?: 'length' | 'charset' | 'check' }
export function chainOf(id: string, revisions: readonly Revision[]): readonly Revision[]
export function amendmentDiff(a: CertRecord, b: CertRecord): readonly FieldDiff[]
```

`checkDigits` is a published algorithm over the body — the same function is
implemented in the verification desk's SQL, and a test asserts the two agree over
ten thousand generated bodies, because a code the issuer accepts and the verifier
rejects is worse than no code.

**Screens and their wiring.**

| Screen | Reads | Writes |
|---|---|---|
| `Registry.tsx` | `certificate_registry` | — |
| `Issue.tsx` | member and course lookup | `certificate_issue_v2` |
| `Detail.tsx` | `certificate_history`, `certificate_for_print` | `edit_issued_certificate`, `amend_and_reissue_certificate`, revoke, restore |
| `TemplateStudio.tsx` | `save_certificate_template` | same |
| `Batch.tsx` | — | `certificate_issue_v2` per row, with a report |

**Reproducibility** is enforced in `certificate-pdf.ts` by injecting the clock
and any random source as parameters, so the render path is pure. The test
generates the same record twice with two different injected clocks and asserts
identical bytes, which is what proves the hash on a printed certificate means
something.

### 44.6 `notice-site`

**`model.ts`** owns the publication clock and the funnel:

```ts
export function publishState(notice: Notice, now: Date): 'draft' | 'scheduled' | 'live' | 'withdrawn'
export function audienceReach(audience: Audience, counts: AudienceCounts): number
export function funnel(delivered: number, read: number, acknowledged: number): Funnel
export function revisionDiff(a: Revision, b: Revision): readonly FieldDiff[]
```

`funnel` asserts the ordering — acknowledged ≤ read ≤ delivered ≤ audience — and
returns a `broken` flag when a count violates it rather than rendering an
impossible number. That flag exists because a delivery pipeline that double
counts is a real failure and a funnel that hides it is a lie.

### 44.7 `config-site`

**`model.ts`** owns validation and provenance:

```ts
export function validate(key: SettingKey, value: unknown): readonly string[]
export function provenance(row: SettingRow): 'override' | 'env' | 'default'
export function settingDiff(a: readonly SettingRow[], b: readonly SettingRow[]): readonly SettingChange[]
```

`validate` is imported by the RPC's TypeScript caller *and* mirrored by the
database constraint; a test asserts the two produce the same verdict for a
fixture set of forty values, including the boundary cases that always differ
(number as string, boolean as `"false"`, empty string versus null).

### 44.8 `customize-site`

**`model.ts`** owns section validity and the publish check:

```ts
export function sectionProblems(section: Section): readonly string[]
export function publishProblems(page: PageDraft): readonly string[]
export function headingOrder(sections: readonly Section[]): readonly string[]
```

`publishProblems` is what makes the accessibility check real: it returns the
heading order, missing alt text and contrast failures with the section that
caused each, and publish refuses while the list is non-empty. The preview imports
the production renderer, not a copy, and a test asserts the rendered markup from
the preview and the published page are identical strings.

### 44.9 `ip-site`

**`model.ts`** owns matching and ordering:

```ts
export function orderRules(rules: readonly IpRule[]): readonly IpRule[]
export function match(addr: string, rules: readonly IpRule[]): { matched: IpRule | null; evaluated: readonly IpRule[] }
export function cidrParts(value: string): { address: string; bits: number } | null
export function wouldBlock(addr: string, rules: readonly IpRule[]): boolean
```

`match` returns the rules it evaluated *as well as* the one that matched, which
is what the tracer renders and what makes "why did this request get in" a
screen rather than an investigation. The same function is implemented in the
edge worker; a test runs both against a shared fixture of a thousand address and
rule pairs and asserts identical decisions, because two implementations of a
block rule that disagree is a security hole with a friendly name.

### 44.10 `performance-site`

**`model.ts`** owns the verdict and the regression rule:

```ts
export function verdict(metric: Metric, budget: Budget, samples: number): 'pass' | 'fail' | 'insufficient'
export function regression(history: readonly Run[], budget: Budget): { regressed: boolean; since?: string; delta?: number }
export function correlation(vitals: Run[], errors: ErrorBucket[]): readonly Correlated[]
```

`verdict` returns `insufficient` below the sample floor rather than a pass, which
is the difference between an honest dashboard and a green one. `regression`
implements the three-consecutive-breach rule from §13.1 and is tested with a
history that breaches twice (no alert), three times (alert), and three times
non-consecutively (no alert).

### 44.11 `connect-site`

**`model.ts`** owns presence and unread:

```ts
export function presence(lastSeenAt: string, now: Date): 'online' | 'away' | 'offline'
export function unread(lastReadAt: string, messages: readonly Message[]): number
export function readableChannels(channels: readonly Channel[], role: Role): readonly Channel[]
```

`unread` is derived from a read cursor rather than a counter, so it survives a
refresh and cannot drift from the messages it counts. `readableChannels` is the
client-side mirror of the policy, used only to avoid rendering a channel that
would 403; the authority is still the policy, and a test asserts a channel the
policy denies never appears in the mirror either.

### 44.12 `status-site`

**`model.ts`** owns uptime and derivation:

```ts
export function uptime(days: readonly DayStatus[]): { uptime: number; formula: string }
export function componentState(probes: readonly Probe[]): 'up' | 'degraded' | 'down'
export function dailyBars(incidents: readonly Incident[], days: number, now: Date): readonly DayStatus[]
```

`componentState` is derivation, not inspection: a component with all probes
failing is `down`, a majority failing is `down`, any failing is `degraded`, none
is `up`. There is no code path that sets `up` directly, which is the only way to
keep a status board honest; the test asserts that a component with a hand-written
`up` and a failing probe renders `degraded`.

### 44.13 `vf-site`

**`model.ts`** owns the answer's shape:

```ts
export function classify(input: string): 'certificate' | 'notice' | 'hash' | 'unknown'
export function answerFields(kind: Kind): readonly string[]
export function allowedKeys(): readonly string[]
```

`allowedKeys` is the allow-list the response is filtered through, and the test
compares it to a written-out expectation so adding a field to the response
requires changing the test, which is exactly the review this needs.

---

## 45. The RPC catalogue

Every function this plan adds, with its parameters and its return shape. This is
the contract the console code is written against and the thing `db:prove`
asserts.

### 45.1 Security

```
admin_set_permission(
  p_role bsdc_role, p_permission text, p_granted boolean,
  p_reason text, p_scope text default '', p_expires_at timestamptz default null
) returns public.permission_grants
   permission: permissions.write
   refuses: own role or above (unless owner), self-grant of permissions.write,
            reason under 10 characters
   audits:  'permission.set' with diff {granted: before → after}

admin_permission_matrix() returns table(role bsdc_role, permission text,
  scope_key text, granted boolean, source text, expires_at timestamptz)
   permission: people.read

admin_effective_permissions(p_role bsdc_role) returns table(permission text,
  scope_key text, granted boolean, why text)
   permission: people.read

admin_request_escalation(p_permission text, p_scope text, p_minutes int,
  p_reason text) returns uuid
   permission: any staff
   audits: 'escalation.request'

admin_approve_escalation(p_id uuid, p_reason text) returns public.escalations
   permission: people.role
   refuses: requester = approver
   audits: 'escalation.approve' and 'permission.set'

admin_revoke_escalation(p_id uuid, p_reason text) returns void
   permission: people.role or the holder
   audits: 'escalation.revoke'

staff_sessions_list(p_uid text default null) returns table(id uuid,
  device_label text, device_hash text, first_seen timestamptz,
  last_seen timestamptz, is_current boolean, revoked_at timestamptz)
   permission: self, or people.read for another uid

staff_session_revoke(p_id uuid, p_reason text) returns void
   permission: self, or people.session for another uid
   audits: 'session.revoke'

staff_sessions_revoke_others(p_reason text) returns int
   permission: self
   audits: 'session.revoke_all'

admin_audit_search(p_actor text, p_action text, p_subject text,
  p_request_id text, p_from timestamptz, p_to timestamptz,
  p_query text, p_limit int, p_before bigint) returns table(
  id bigint, actor_uid text, action text, subject text, reason text,
  diff jsonb, device text, request_id text, created_at timestamptz)
   permission: audit.read

admin_audit_export(p_from timestamptz, p_to timestamptz) returns table(
  rows jsonb, sha256 text, count int)
   permission: audit.read
   audits: 'audit.export'

admin_audit_verify(p_sha256 text, p_rows jsonb) returns boolean
   permission: public
```

### 45.2 Command deck

```
admin_telemetry_delta(p_window interval default '1 hour') returns table(
  key text, label text, current numeric, previous numeric,
  measured_at timestamptz, source text)
   permission: audit.read

admin_approval_decide(p_kind text, p_id uuid, p_decision text,
  p_reason text) returns uuid            -- the receipt id
   permission: people.suspend (shops, ads) or ads.manage (campaigns)
   audits: 'approval.decide' with diff

admin_bulk_preview(p_verb text, p_ids uuid[], p_args jsonb) returns table(
  id uuid, action text, before jsonb, after jsonb, outcome text, reason text)
   permission: the verb's own
   writes: nothing

admin_bulk_apply(p_verb text, p_ids uuid[], p_args jsonb, p_reason text,
  p_request_id text) returns table(id uuid, outcome text, reason text)
   permission: the verb's own
   audits: one row per id, sharing p_request_id

admin_receipt(p_id uuid) returns table(id uuid, verb text, rows jsonb,
  actor_uid text, reason text, created_at timestamptz)
   permission: audit.read

admin_cli_resolve(p_command text) returns table(verb text, args jsonb,
  permission text, destructive boolean, plan jsonb, problems text[])
   permission: resolved per verb
   writes: nothing

seo_coverage() returns table(path text, has_title boolean,
  has_description boolean, robots text, in_sitemap boolean)
   permission: seo.manage

redirect_cycle_check(p_from text, p_to text) returns text[]
   permission: seo.manage

redirect_404_sources(p_days int default 7) returns table(path text,
  hits int, last_seen timestamptz, suggested_target text)
   permission: seo.manage
```

### 45.3 People and safety

```
case_open(p_subject_uid text, p_reason text) returns uuid
   permission: moderation.resolve
case_attach_report(p_case_id uuid, p_report_id uuid) returns void
   permission: moderation.resolve
case_event_add(p_case_id uuid, p_kind text, p_body text) returns uuid
   permission: moderation.resolve
case_close(p_case_id uuid, p_outcome text, p_message_key text,
  p_reason text) returns void
   permission: moderation.resolve
case_reopen(p_case_id uuid, p_reason text) returns void
   permission: moderation.resolve

person_timeline(p_uid text, p_from timestamptz, p_to timestamptz,
  p_kinds text[]) returns table(kind text, at timestamptz, actor text,
  summary text, subject text, ref uuid)
   permission: people.read

person_standing_adjust(p_uid text, p_points int, p_reason text,
  p_expires_at timestamptz) returns int          -- the new total
   permission: people.suspend

person_warning_step(p_uid text, p_step smallint, p_reason text) returns void
   permission: people.suspend

appeal_intake(p_case_id uuid, p_body text) returns uuid
   permission: the subject, or public with the appeal code
appeal_decide(p_id uuid, p_outcome text, p_reason text) returns void
   permission: moderation.resolve
   refuses: the decider of the original action

queue_workload() returns table(uid text, display_name text, open int,
  claimed int, overdue int, closed_today int)
   permission: moderation.read

pattern_simulate(p_rule jsonb, p_days int) returns table(matched int,
  upheld int, false_positive_rate numeric)
   permission: moderation.read
```

### 45.4 Documents, runtime, signal

The remaining twenty-two signatures follow the same shape and are listed in
§16.4 with their permissions. Three are worth spelling out because their
contracts are unusual:

```
certificate_verify(p_code text) returns table(
  status text,            -- 'valid' | 'revoked' | 'unknown'
  course text, issued_at timestamptz, revoked_at timestamptz,
  reason text, holder_display_name text, check_digits_ok boolean)
   permission: public
   guarantee: the response keys are exactly this list, asserted by test

ip_rule_dry_run(p_rule jsonb, p_days int) returns table(
  would_block int, would_challenge int, sample_paths text[],
  busiest_hour timestamptz)
   permission: ip.rule
   guarantee: reads edge logs, writes nothing, and is rate limited

incident_declare(p_severity text, p_title text, p_public_summary text,
  p_components text[]) returns uuid
   permission: notices.publish
   side effects: publishes to the status board, creates a staff channel,
                 both linked by incident id, in one transaction
```

---

## 46. Runbooks for the twelve verbs

Every destructive verb gets a runbook file at
`docs/runbooks/<verb>.md`, linked from its confirm and asserted to exist by
audit invariant `A-03`. Each runbook has the same five sections, because an
operator reading one at 03:00 should not have to learn a new format.

**1. What this does.** Two sentences. What changes, and what a member
experiences.

**2. When to use it.** The conditions. Including the condition where it is *not*
the right action, because the most common mistake is reaching for the biggest
hammer.

**3. How to reverse it.** The exact steps, or an honest "this cannot be
reversed" with what to do instead. Five of the twelve are reversible and the
plan says which five.

**4. What it writes.** The audit action string, the fields in the diff, and
where the record's timeline gains an entry. An operator who knows what the
record will say makes a better decision.

**5. Who to tell.** The team, the member, or nobody, and in what language.

The five that are reversible: `people.suspend`, `people.role`,
`certificate.revoke`, `notice.publish`, `ip.rule`. The five that are not —
`people.delete`, `owner.transfer`, `permissions.write`, `plugins.write`,
`lockdown` — are the five that require a typed phrase and, for three of them, a
second approver. That alignment is not a coincidence; it is the reason the
registry exists in one place.

---

## 47. The translation work

Both languages for every string is a requirement that is easy to state and easy
to quietly skip. Three mechanisms make it real:

**The parity test.** Every console's locale pair is compared key by key, and a
missing key fails CI. This is the mechanism that exists today in `main-site` and
it extends to the consoles.

**The write-together rule.** A screen's Bangla copy is written when the screen
is built, not afterwards, because copy written afterwards is translated and a
translated console reads like a translated console. The review question for a
new screen includes "is the Bangla right", asked of somebody who reads it.

**The formatter.** Numbers, dates, durations and currency all go through one
module per language, and that module has tests for Bengali digits, Bengali month
names, and the ১২:০০ AM/PM convention. No screen formats a date itself, and a
lint rule bans `toLocaleString` outside the formatter.

The scale of it: roughly 1,900 new strings across the fourteen surfaces, which
at the repository's current 1,702 per language is a doubling. That number is in
the plan because a translation budget that is not written down is a budget that
is discovered at launch.

---

## 48. Accessibility: the per-screen obligation

Every one of the roughly 120 screens in this plan carries the same eleven
obligations. They are listed once here rather than per screen, and the audit
invariant asserts their presence rather than their quality, because quality is a
review.

1. A single `h1` naming the screen.
2. A landmark structure: banner, navigation, main, and complementary where used.
3. Every control reachable by Tab, in visual order.
4. A visible focus ring on both themes.
5. An accessible name on every control, including icon-only buttons.
6. Every async result announced once through a live region.
7. Colour never the only carrier of meaning.
8. Errors summarised at the top and linked to their fields.
9. A skip link as the first tab stop.
10. No content lost at 200% zoom or at 250px width.
11. No motion above 200ms, and none at all under reduced motion.

Eleven obligations, 120 screens, one test file per console that walks them. The
number is large and the work is mechanical, which is the best kind of
accessibility work: it is only expensive when it is deferred.

---

## 49. Migration catalogue

Twenty-nine migration files, in order, each additive and each safe to run twice.
This section states what each one does, why it is separate, and what would go
wrong if it were merged into its neighbour.

The numbering continues from `0133_vendor_details_and_reviews.sql`. The rule is
one concern per file: a reviewer reading `0136` should be able to hold the whole
change in their head.

### 49.1 `0134_permission_grants.sql`

**Creates** `public.permission_grants`, its two indexes, RLS, and one policy.
**Replaces** `bsdc.has_permission(text)` with `bsdc.has_permission(text, text)`
and keeps the one-argument form as a wrapper so no existing call site changes.
**Adds** `bsdc.permission_source(role, permission, scope)` returning
`'base' | 'grant' | 'deny' | 'none'`, which the matrix screen uses to explain
*why* a permission resolves.

**Why alone.** This is the one migration in the plan that changes the semantics
of a function every other function calls. It must be reviewable on its own and
deployable on its own, and it must be watched for a day before anything depends
on the new behaviour.

**Failure mode.** If the deny-before-allow ordering is wrong, a revoke silently
does nothing. The test that catches it is `t-grant-deny`, and it is written
before the migration.

### 49.2 `0135_staff_sessions.sql`

**Creates** `public.staff_sessions` with its index and policies. **Adds** three
RPCs (`staff_sessions_list`, `staff_session_revoke`,
`staff_sessions_revoke_others`) and a guard function
`bsdc.session_active(session_id)` that the edge handler calls on every
privileged request.

**Why alone.** Sessions are written by the edge handler and read by the console;
the migration, the handler change and the screen ship together but the migration
is the part that must be right first, because a session table that does not
record correctly makes revocation a decoration.

**Failure mode.** A session row written per token refresh instead of per session
produces thousands of rows and a revoke that misses the live one. The dedupe key
is `(uid, device_hash, date_trunc('day', first_seen))`, and the test asserts a
hundred refreshes produce one row.

### 49.3 `0136_audit_shape.sql`

**Adds** four columns to `audit_log` with defaults, three indexes, the
`bsdc.audit()` helper, and the trigger `bsdc.require_audit()` attached to the
eight tables whose writes are audited.

**Why alone.** The trigger makes a transaction fail. That is the most dangerous
single object in the plan, because a trigger with a bug turns every write in the
platform into an error. It ships alone, with a kill switch in
`admin_settings` (`audit.require_row`, default true) that the owner can flip
without a deploy.

**Failure mode.** A function that writes to an audited table through a
`security definer` boundary sets a different transaction-local marker than the
trigger reads, and a legitimate write fails. The mitigation is that the marker
is set by `bsdc.audit()` itself rather than by the caller, so any function that
calls the helper satisfies the trigger, and a test calls each of the eight
audited writes without the helper and asserts each fails.

### 49.4 `0137_escalations.sql`

**Creates** `public.escalations` and three RPCs. **Adds** the
`approver_uid <> requester_uid` constraint and the partial index that the sweep
uses.

**Why alone.** Escalation is the only feature in the plan that creates a
permission out of nothing, so it is reviewed as a security change rather than a
feature.

**Failure mode.** An escalation that creates a grant but does not link to it
(`grant_id`) cannot be revoked cleanly, and an expired escalation leaves an
orphan. The foreign key is `on delete set null` and the sweep revokes by
`grant_id`, so the link is the mechanism.

### 49.5 `0138_destructive_registry.sql`

**Creates** `public.destructive_verbs` — a table, seeded with the twelve rows
from §9.7 — and the RPC `admin_destructive_verbs()` that serves it.

**Why alone.** It is data, and putting data in its own migration makes the
registry greppable and diffable when a verb is added, which is the point: adding
a destructive verb should be a visible line in a diff.

### 49.6 `0139_telemetry_delta.sql`

**Replaces** `admin_telemetry_snapshot` with `admin_telemetry_delta(p_window)`,
keeping the old name as a wrapper over a one-hour window so the existing
overview keeps working during the canary.

**Why alone.** A metrics function that returns a different shape breaks the
console that calls it, and the wrapper is what makes the change invisible to a
console that has not been upgraded yet.

### 49.7 `0140_receipts.sql`

**Creates** `public.action_receipts` and two RPCs (`admin_receipt`,
`admin_bulk_apply` writes to it). **Adds** a ninety-day retention row to
`retention_policies` for the table.

**Why alone.** A receipt is evidence, so its retention is part of its
definition, and a receipt table with no retention is a table that grows without
bound in exactly the way that surprises somebody at year-end.

### 49.8 `0141_seo_and_redirects.sql`

**Adds** `seo_coverage`, `redirect_cycle_check` and `redirect_404_sources`. **Adds**
a unique constraint on `seo_overrides.canonical` filtered to non-empty values,
which is the constraint that makes "two pages cannot share a canonical" true
rather than intended.

**Why alone.** The unique constraint can fail on existing data. The migration
includes a pre-flight `do` block that raises with the offending rows listed,
so the failure is a readable message rather than a constraint violation at
3am.

### 49.9 `0142_cases.sql`

**Creates** `public.cases`, `public.case_reports`, `public.case_events` and
five RPCs. **Adds** an append-only trigger on `case_events` that raises on
update or delete.

**Why alone.** The append-only trigger is the mechanism that keeps a case
reviewable, and a case that can be edited is a case that proves nothing.

### 49.10 `0143_standing_ledger.sql`

**Creates** `public.standing_entries` (uid, points, reason, rule_key,
expires_at, created_by, created_at) and `person_standing_adjust`. **Adds**
`profiles.standing_points` as a derived cache with a trigger that recomputes on
insert, so the ledger remains the truth and the column is an optimisation that
a test asserts equals the sum.

**Why alone.** A cached total and a ledger will diverge; the question is whether
the divergence is caught. The trigger and the reconciliation test ship with the
column, in one file, so they cannot be separated.

### 49.11 `0144_appeals.sql`

**Creates** `public.appeals` with the "decider cannot be the original decider"
constraint, and two RPCs.

### 49.12 `0145_ladder.sql`

**Creates** `public.warning_steps` (policy rows) and `person_warning_step`,
plus `profiles.warning_rung`.

### 49.13 `0146_sla_policies.sql`

**Creates** `public.sla_policies` and seeds it for four queues across three
severities. **Adds** `bsdc.sla_due(queue, severity, created_at)` so the due time
is computed in one place by the RPC and the screen.

### 49.14 `0147_certificate_identity.sql`

**Adds** `certificates.check_digits`, a unique index on the full code, the
`certificate_issue_v2` RPC with an idempotency key, `certificate_verify` with
its allow-list, and `certificate_ledger`.

**Why alone.** The check-digit algorithm has to exist in SQL and in TypeScript
and the two have to agree; a migration that bundles it with three other concerns
makes that agreement hard to review.

### 49.15 `0148_notice_lifecycle.sql`

**Adds** `notice_publish`, `notice_withdraw`, `notice_ack_remind` and
`notice_delivery_funnel`, plus `official_notices.audience` and
`official_notices.publish_at`.

### 49.16 `0149_legal_hold.sql`

**Adds** `legal_hold` to `certificates` and `official_notices` and a trigger
that raises on delete while held.

### 49.17 `0150_numbering.sql`

**Creates** `public.document_sequences` and `bsdc.next_number(kind)` with a
`for update` lock, so a number is never reused and never skipped by a
concurrent reader.

### 49.18 `0151_setting_schema.sql`

**Adds** `schema` jsonb to `admin_settings` and `bsdc.validate_setting(key,
value)` mirroring the TypeScript validator. **Adds** `admin_setting_history`,
`admin_setting_revert` and the staged-change table.

### 49.19 `0152_ip_rules.sql`

**Creates** `public.ip_rules` (kind, value, priority, expires_at, review_at,
owner_uid, created_by, shadow), its indexes and four RPCs. **Adds** a
constraint that `expires_at` is not null for kind `block`.

### 49.20 `0153_custom_page_versions.sql`

**Creates** `public.custom_page_versions` and the revert RPC.

### 49.21 `0154_vitals_budgets.sql`

**Creates** `public.vitals_budgets` and `vitals_regressions`.

### 49.22 `0155_incidents.sql`

**Creates** `public.incidents`, `public.incident_updates` (append-only) and four
RPCs, with the transaction that publishes to status and creates a channel.

### 49.23 `0156_status_components.sql`

**Creates** `public.status_components` and `public.probes`, and the derivation
function `status_components()` that computes state from probes. **Adds** a
constraint that `status_components.state` has no default, so it cannot be
inserted without a probe-derived value.

### 49.24 `0157_alerts.sql`

**Creates** `public.alert_routes` and `alert_acknowledge`.

### 49.25 `0158_webhooks.sql`

**Creates** `webhook_endpoints`, `webhook_deliveries` and the dispatch helper.

### 49.26 `0159_metric_definitions.sql`

**Creates** `metric_definitions` and seeds every metric the consoles display.

### 49.27 `0160_retention.sql`

**Creates** `retention_policies` and seeds the data classes.

### 49.28 `0161_explorer_views.sql`

**Creates** the eight views and `explorer_views`, with the row caps in the
calling RPC rather than in the views.

### 49.29 `0162_audit_archive.sql`

**Creates** `audit_archive` and the monthly move.

Each file carries, in its header comment, three lines that the linter checks:
what it creates, what query each new index serves, and how to reverse it. Those
three lines are the difference between a migration directory that is readable a
year later and one that is archaeology.

---

## 50. Data dictionary

The columns that matter, with type, nullability, default, and the reason. Only
the new and changed objects appear; the rest are in the migrations.

### 50.1 `permission_grants`

| Column | Type | Null | Default | Why |
|---|---|---|---|---|
| `id` | bigserial | no | — | stable identity for an audit reference |
| `role` | bsdc_role | no | — | the role the grant applies to |
| `permission` | text | no | — | same pattern as `role_permissions` |
| `scope_key` | text | no | `''` | `''` means every scope |
| `granted` | boolean | no | — | a deny is a row with `false` |
| `reason` | text | no | — | 10–500 chars, the operator's words |
| `granted_by` | text | no | — | the actor, denormalised for the matrix |
| `granted_at` | timestamptz | no | `now()` | |
| `expires_at` | timestamptz | yes | null | null means no expiry |
| `request_id` | text | no | `''` | ties the grant to its audit rows |

The one non-obvious choice is storing denies as rows rather than as a separate
table. A deny that lives in the same table as an allow is resolved by one
ordered read, which is a `stable` SQL function rather than a `plpgsql` loop, and
that matters because `has_permission` is called by every policy on every row.

### 50.2 `staff_sessions`

| Column | Type | Null | Default | Why |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | the id the guard checks |
| `uid` | text | no | — | cascade with the profile |
| `device_label` | text | no | `''` | "Chrome on macOS", coarse |
| `device_hash` | text | no | `''` | dedupe key, not a fingerprint |
| `ip_hash` | text | no | `''` | salted SHA-256, never the address |
| `user_agent` | text | no | `''` | for the label, truncated |
| `first_seen` | timestamptz | no | `now()` | |
| `last_seen` | timestamptz | no | `now()` | updated on refresh |
| `revoked_at` | timestamptz | yes | null | the guard reads this |
| `revoked_by` | text | yes | null | |
| `revoke_reason` | text | no | `''` | required by the RPC, not the column |

`device_hash` is deliberately not a fingerprint library. It is a hash of the
`user-agent` and the platform string, because a real fingerprint would make this
table a tracking mechanism for staff and that is not its job.

### 50.3 `audit_log` additions

| Column | Type | Null | Default | Why |
|---|---|---|---|---|
| `request_id` | text | no | `''` | one action, many rows |
| `reason` | text | no | `''` | the operator's words |
| `diff` | jsonb | no | `'{}'` | computed, not inferred |
| `device` | text | no | `''` | coarse class |
| `scope_key` | text | no | `''` | which scope the action applied to |

The diff shape is fixed, because an ad-hoc shape is not queryable:

```json
{ "field": { "from": "member", "to": "moderator" },
  "expires_at": { "from": null, "to": "2026-12-01T00:00:00Z" } }
```

That shape is what the audit detail screen renders as a two-column table, which
is the reason a reviewer can reconstruct an action without the console.

### 50.4 `cases` and its children

`cases`: `id` uuid, `subject_uid` text, `opened_by` text, `opened_at`,
`closed_at` nullable, `outcome` text constrained to
`('no_action','warning','content_hidden','suspended','banned','referral')`,
`outcome_message_key` text, `reopened_count` int default 0, `legal_hold`
boolean default false.

`case_reports`: `case_id`, `report_id`, `added_at`, `added_by`, unique on
`(case_id, report_id)`.

`case_events`: `id` bigserial, `case_id`, `kind` text, `actor_uid`, `body`
text, `metadata` jsonb, `created_at`. Append-only by trigger.

The `outcome` enum is the reason a statistical view of moderation is possible at
all. Free-text outcomes are unaggregatable, and the plan's monthly trust and
safety report has to count them.

### 50.5 `standing_entries`

`id` bigserial, `uid` text, `points` int (signed), `reason` text,
`rule_key` text, `expires_at` nullable, `created_by`, `created_at`, plus
`revoked_at` and `revoke_reason` for a correction.

`profiles.standing_points` is the cache. A trigger on insert/update recomputes
`sum(points) where revoked_at is null and (expires_at is null or expires_at >
now())`. The reconciliation test reads both and asserts equality for a fixture
with expiries and revocations.

### 50.6 `ip_rules`

| Column | Type | Why |
|---|---|---|
| `kind` | text | `allow`, `block`, `rate_limit`, `challenge` |
| `value` | cidr or text | CIDR validated in the RPC |
| `priority` | int | lower number wins; ties refused at save |
| `expires_at` | timestamptz | mandatory for `block` |
| `review_at` | date | mandatory for every rule |
| `owner_uid` | text | who is accountable for it |
| `shadow` | boolean | log without blocking |
| `rate_limit` | jsonb | requests and window, for `rate_limit` |

The `priority` uniqueness is enforced per overlapping CIDR in the RPC rather
than by a constraint, because "overlapping" is a CIDR relationship Postgres
cannot express as a unique index. That decision is recorded here so nobody
tries to add the index later and wonders why.

### 50.7 `action_receipts`

`id` uuid, `verb` text, `request_id` text, `actor_uid` text, `reason` text,
`rows` jsonb (an array of `{id, outcome, reason, before, after}`),
`created_at`. Retention ninety days via `retention_policies`.

The `rows` array is deliberately one column rather than a child table: a receipt
is read as a whole or not at all, and a child table would invite per-row queries
that nobody makes.

### 50.8 `metric_definitions`

`key` text primary key, `label` text, `definition` text, `source_rpc` text,
`source_table` text, `unit` text, `owner_uid` text, `updated_at`.

Every headline number in every console references a key here, and audit
invariant `A-14` fails when a console uses a key that is not defined. This is the
mechanism behind §35's "every number explains itself": a definition that is a row
can be required, and a definition that is a convention cannot.

### 50.9 The changed tables, and what changed

| Table | Change | Compatibility |
|---|---|---|
| `audit_log` | five columns, all defaulted | existing inserts untouched |
| `profiles` | `standing_points`, `warning_rung` | defaulted |
| `feature_flags` | `owner_uid`, `kill_switch` | defaulted |
| `certificates` | `check_digits`, `legal_hold` | defaulted; `check_digits` backfilled |
| `official_notices` | `audience`, `publish_at`, `legal_hold` | defaulted |
| `reports` | `case_id` nullable | additive |
| `admin_settings` | `schema` jsonb | defaulted to `{}` |

The `check_digits` backfill is the only one that touches existing rows, and it
runs in its own statement inside `0147` with a guard: if any existing certificate
code does not already carry check characters, the migration raises with the
count rather than silently accepting a code that will not verify. That is a
deliberate stop — a certificate in the world that cannot be verified is worse
than a migration that refuses to run.

---

## 51. Interfaces between batches

Batches 3 through 7 run in parallel, so their boundaries have to be contracts
rather than conversations. Five interfaces:

**Batch 2 → everything.** `has_permission(permission, scope)`, `bsdc.audit()`,
`require_permission()`, the destructive registry, and the session guard. Frozen
when batch 2 merges; a change is a new parameter with a default.

**Batch 1 → everything.** The eleven primitives' props and the five data
modules' functions. Frozen when batch 1 merges. A primitive that needs a new
prop gets it as optional, so no call site breaks.

**Batch 3 ⇄ 4.** The unified inbox (batch 8 work, but its queue rows come from
both) reads `queue_workload` from batch 4. Until it exists, batch 3's overview
shows its own queues only.

**Batch 4 ⇄ 5.** A person's timeline includes certificates and notices, so
`person_timeline` is defined in batch 4 and extended by union in batch 5 rather
than being redefined. The union is a `create or replace` with the same return
type, which is safe and is the reason the return type is fixed at
`(kind, at, actor, summary, subject, ref)`.

**Batch 6 ⇄ 7.** The IP tracer and the incident timeline both want edge logs.
Batch 6 owns `ip_request_trace`; batch 7 links to it rather than re-reading the
log, so there is one reader of that table.

Each interface is written in a comment at the top of the file that implements
it, and the batch's pull request states which interfaces it consumes. That is the
whole coordination mechanism, and it is deliberately smaller than a weekly sync.

---

## 52. A day in the life: four operators

Specifications describe screens. This describes what the screens are for, from
the point of view of the four people who will use them most. Each is a
composite of behaviour this plan is designed around.

### 52.1 The moderator on the night shift

It is 02:40. A report arrives about a comment on a jobs post. She opens the
console on a phone, in Bangla, on a 3G connection.

The queue opens in 1.1 seconds because only twenty rows and three counts
crossed the network. The report is ranked first because its severity is high and
it is four minutes old, not because it is newest. She claims it; the claim is a
row, so when her connection drops for six seconds the claim is still hers.

The subject's timeline shows two prior reports this month, both upheld, and a
warning on the 12th. The warning ladder says the next step is a restriction. She
writes a private note, chooses `content_hidden` from a list rather than typing a
reason in prose, and the member-facing message is generated in Bangla because
the member's language is stored and hers is irrelevant to it.

The confirm names the comment by its author and its id, lists what happens —
the comment disappears, the author is told, the post stays — and asks for a
reason. She types eight words. The action writes: one audit row with a diff, one
case event, one message queued.

She resolves nine more before the shift ends and the handover is prefilled with
the three she left open, each with the note she wrote. The next shift opens it in
Dhaka at 08:00 and knows exactly what happened, because the record is the
handover.

What the plan contributed: the claim as a row, the merged timeline, the outcome
enum, the ladder, the generated message in the member's language, the reason,
the diff, and the handover. What it prevented: a second moderator working the
same report, a decision with no recorded reason, and a context loss at 08:00.

### 52.2 The operations manager on a Monday morning

He has forty minutes. The unified inbox ranks everything that needs a decision
across five consoles, so he does not open five consoles.

Three shop applications are past their SLA and sort first; each turns critical
because the policy table says so, not because somebody remembered. The first is
complete except for delivery areas, and the completeness score names that rather
than showing 82%. He approves two and rejects one with a reason, and each
applicant receives a message that names what happens next.

There is a payout request above the threshold. The two-person rule means he
cannot approve it alone, and the screen says so before he clicks. He requests a
second approval, and the person who requested the payout cannot be the approver,
which the RPC enforces.

The telemetry strip shows four numbers with their age and their delta against
the previous hour. One of them is stale by eleven minutes and says so, and he
refreshes that panel rather than trusting a number that looked current.

What the plan contributed: the ranked inbox, the SLA as data, the completeness
score, the two-person rule, freshness and delta. What it prevented: an approval
made without the applicant's evidence on screen, and a decision made on a stale
number.

### 52.3 The owner during an incident

At 21:15 the error rate triples. The performance console flags a regression on
one route: three consecutive breaches of the budget, with the release that
introduced it.

He declares an incident with a severity and a public summary. One transaction
publishes it to the status board and creates a staff channel, both linked by the
incident id. The public update and the internal note are separate fields, so what
he tells customers is not what he thinks.

The edge console shows a new block rule would have stopped the abusive traffic;
the dry-run says it would also have stopped 200 legitimate callbacks an hour. He
enables it in shadow mode instead and watches for twenty minutes, then arms it
with a four-hour expiry and a review date.

He resolves the incident at 22:04 with a customer-facing summary. The action list
that opens has three items with owners and dates. The incident's timeline exports
to markdown for the post-mortem.

What the plan contributed: the regression rule, the two-box incident, the linked
channel, the dry-run, shadow mode, the expiry, the post-mortem export. What it
prevented: an outage recorded in one place and discussed in another, and a block
rule that fixed the traffic and broke the payments.

### 52.4 The new moderator on day one

She has read access and nothing else. The console tells her so on entry rather
than at her first click, and the permission panel shows the eleven permissions
she does not have with the role that grants each.

She follows the onboarding checklist, which has a demo mode: fixtures, no
production data, and a queue she can work end to end. She resolves a fixture
report and the action is a real action against a fixture record, so the audit
shape she sees is the audit shape she will produce.

On day three a suspension confirms she cannot perform does not offer a disabled
button with no explanation. It says which permission is missing, who can grant
it, and offers to escalate it for the rest of her shift. Her manager approves in
one click, the grant expires at 22:00 on its own, and the record shows it lapsed
rather than vanished.

What the plan contributed: the permission panel, the denial screen that names
the missing permission, the demo mode with no production data, the escalation
with expiry. What it prevented: a new starter learning the console from
production data, and a temporary permission that outlives its reason.

---

## 53. Key implementations, written out

The plan is not a substitute for the code, but four pieces are unusual enough
that prose alone would leave them ambiguous. They are written here in full so
the reviewer can disagree with the design before it exists.

### 53.1 `bsdc.has_permission` with scopes and denies

This single function is called by every policy on every row, so it has to be
`stable`, free of `plpgsql` loops, and index-friendly. The obvious
implementation — a `plpgsql` function that queries three times — is a hundred
times slower on a policy that runs per row.

```sql
create or replace function bsdc.has_permission(
  p_permission text,
  p_scope text default ''
) returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  -- Deny beats allow, and the base grant is the floor.
  --
  -- Three reads collapse into one: the base table says whether the role holds
  -- the permission at all; the grants table can add it (granted = true) or
  -- remove it (granted = false) for a scope. The ordering is deliberate —
  -- a denial for this scope, or for every scope, wins over any base grant.
  with base as (
    select exists (
      select 1 from public.role_permissions r
      where r.role = bsdc.actor_role() and r.permission = p_permission
    ) as holds
  ),
  live as (
    select g.granted, g.scope_key
    from public.permission_grants g
    where g.role = bsdc.actor_role()
      and g.permission = p_permission
      and (g.scope_key = p_scope or g.scope_key = '')
      and (g.expires_at is null or g.expires_at > now())
  )
  select case
    when exists (select 1 from live where granted = false) then false
    when exists (select 1 from live where granted = true)  then true
    else (select holds from base)
  end
$$;
```

Three things are worth noticing. `now()` makes the function only `stable`
rather than `immutable`, which is correct: a permission can expire mid-session
and should. `security definer` with a pinned `search_path` is required because
the function reads tables the caller cannot; the pinned path is what stops a
caller shadowing `public.role_permissions` with their own. And the one-argument
form is kept as a wrapper:

```sql
create or replace function bsdc.has_permission(p_permission text)
returns boolean language sql stable
as $$ select bsdc.has_permission(p_permission, '') $$;
```

That wrapper is why 645 existing functions need no change. It is the entire
compatibility story of the permission upgrade, and it is four lines.

### 53.2 The audit helper and the trigger that enforces it

```sql
create or replace function bsdc.audit(
  p_action   text,
  p_subject  text,
  p_metadata jsonb default '{}'::jsonb,
  p_reason   text  default '',
  p_diff     jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_request text := coalesce(nullif(current_setting('bsdc.request_id', true), ''), '');
begin
  insert into public.audit_log
    (actor_uid, action, subject, metadata, reason, diff, device, request_id, ip_hash)
  values (
    bsdc.current_uid(),
    p_action,
    coalesce(p_subject, ''),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_reason, ''),
    coalesce(p_diff, '{}'::jsonb),
    coalesce(current_setting('bsdc.device', true), ''),
    v_request,
    coalesce(current_setting('bsdc.ip_hash', true), '')
  );
  -- Marks this transaction as having audited, which is what the trigger reads.
  perform set_config('bsdc.audited', '1', true);
end;
$$;
```

The trigger is deliberately small, because a trigger with a bug turns every
write into an error:

```sql
create or replace function bsdc.require_audit()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('bsdc.audited', true), '') <> '1'
     and coalesce((select value::boolean from public.admin_settings
                   where key = 'audit.require_row'), true) then
    raise exception 'This change did not write an audit row'
      using errcode = '42501',
            hint = 'Call bsdc.audit(...) in the same transaction.';
  end if;
  return null;  -- AFTER trigger; the return value is ignored.
end;
$$;
```

`current_setting(..., true)` returns null rather than raising when unset, which
is what makes the trigger safe outside a request context — a migration that
backfills a table does not have to pretend to be an operator. The kill switch
is read from `admin_settings` so it can be turned off in one row without a
deploy, and the exception carries a hint, because the first person to see it
will be somebody who did not write the calling function.

### 53.3 The bulk resolver, shared by preview and apply

The reason the preview can be trusted is that there is only one resolver:

```ts
export type BulkVerb =
  | 'people.suspend' | 'people.role' | 'people.status'
  | 'shop.approve'   | 'shop.reject'
  | 'campaign.pause' | 'campaign.resume'
  | 'seo.delete'     | 'redirect.delete'
  | 'certificate.revoke' | 'notice.publish' | 'notice.unpublish';

export interface BulkOutcome {
  readonly id: string;
  readonly outcome: 'change' | 'skip' | 'fail';
  readonly before: Readonly<Record<string, unknown>>;
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly reason: string;
}

/**
 * Decides, for one row, what a bulk verb would do to it.
 *
 * Both the preview and the apply call this. The preview renders its output and
 * throws it away; the apply renders it into a receipt and performs the write.
 * There is no second implementation to drift.
 */
export function decideOne(
  verb: BulkVerb,
  row: BulkRow,
  actor: { rank: number; permissions: ReadonlySet<string> },
): BulkOutcome {
  const permission = VERB_PERMISSION[verb];
  if (!actor.permissions.has(permission)) {
    return fail(row, `needs ${permission}`);
  }
  switch (verb) {
    case 'people.suspend':
      if (row.status === 'suspended') return skip(row, 'already suspended');
      if (row.is_owner) return fail(row, 'an owner cannot be suspended');
      if (roleRank(row.role) >= actor.rank) return fail(row, 'rank too high');
      return change(row, { status: 'suspended' });
    case 'people.role':
      if (row.role === row.next_role) return skip(row, 'already has that role');
      if (roleRank(row.next_role) >= actor.rank) return fail(row, 'above your rank');
      return change(row, { role: row.next_role });
    // … one branch per verb, each with its own refusal reasons
  }
}
```

`fail` and `skip` are distinct because they mean different things to the
operator: a skip is fine and can be ignored, a fail is something to look at. The
bulk bar shows three numbers and the receipt preserves the distinction. A
version that collapsed them into "errors" would be shorter and would make an
operator read three hundred rows to find the one that mattered.

### 53.4 Stale-build recovery, as adopted by the consoles

Already written and merged for `main-site` in `5967a2e`; the consoles adopt the
same module. The contract, restated because it is the pattern for every guard in
this plan:

```ts
export function isChunkLoadFailure(error: unknown): boolean;
export function recoverFromStaleBuild(build: string): boolean;
```

It reloads once per build, never twice inside two seconds, never while offline,
and never for an error thrown by code that is already running. Every one of
those four conditions has a test, and the tests were proved by disabling the fix
and watching them fail.

The adoption work is not the module — it is the thirteen `AppShell` calls, the
thirteen browser tests, and the knowledge that a console which reloads itself
during a destructive confirm would be a catastrophe. That last point is why the
recovery is suppressed while a modal with unsaved operator input is open: a
reload that discards a half-written suspension reason is worse than an error
screen. The suppression is one boolean in a store, and it has a test.

---

## 54. The client data layer

Five modules, and the boundaries between them are the reason a screen is short.

### 54.1 `rpc.ts`

```ts
export type Failure =
  | { kind: 'permission'; missing: string }
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'conflict'; current: unknown }
  | { kind: 'transient'; retryAfterMs?: number }
  | { kind: 'unknown'; message: string; requestId: string };

export async function call<T>(
  fn: string,
  args: Record<string, unknown>,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<{ ok: true; data: T; requestId: string } | { ok: false; failure: Failure }>;
```

Five failure kinds rather than one message, because each screen reacts
differently and a string cannot be branched on safely. `permission` renders the
"who can grant this" panel (§28.10). `validation` maps to fields. `conflict`
offers a reload. `transient` offers a retry with the server's timing.
`unknown` offers a request id to quote.

The classification happens on the response's HTTP status and error code, not on
the message text, because message text is not a contract.

### 54.2 `mutations.ts`

```ts
export function useMutation<TArgs, TResult>(config: {
  run: (args: TArgs) => Promise<TResult>;
  optimistic?: (args: TArgs) => void;      // apply locally
  rollback?: () => void;                    // undo local apply
  success?: (result: TResult) => void;      // toast, navigate
  idempotencyKey?: (args: TArgs) => string; // dedupe across retries
}): { mutate: (args: TArgs) => void; pending: boolean; error: Failure | null };
```

Three guarantees. A failed write rolls back the optimistic change before the
error is shown, so the screen never lies about state. A retry reuses the
idempotency key, so the server sees one action. And a successful write notifies
other tabs, so two tabs cannot disagree.

### 54.3 `freshness.ts`

```ts
export type Freshness = 'fresh' | 'ageing' | 'stale';
export function useFreshness(measuredAt: string | null, windowMs: number):
  { ageMs: number; state: Freshness; label: string };
```

The label is localised by the formatter, not by the caller, so "4 min ago" and
"৪ মিনিট আগে" come from one place.

### 54.4 `offline-queue.ts`

```ts
export interface QueuedWrite {
  readonly key: string;        // the idempotency key
  readonly fn: string;
  readonly args: Record<string, unknown>;
  readonly queuedAt: number;
  readonly label: string;      // shown on the row it affects
}
export function useOfflineQueue(): {
  queued: readonly QueuedWrite[];
  enqueue: (write: QueuedWrite) => void;
  drain: () => Promise<{ applied: number; failed: number }>;
};
```

Only three kinds of write are queueable: a note, a draft, and a preference. The
module refuses any function whose name is in the destructive registry, which is
a runtime check with a test — the registry is the same table the confirm modal
reads, so the two cannot disagree.

### 54.5 `timeouts.ts`

Every call has a default timeout of 15 seconds, a list refresh of 10, and a
write of 30. The values are constants in one file with a comment explaining
each, because a timeout scattered across call sites is a timeout nobody can
reason about. Exceeding it produces a `transient` failure with a retry, never a
silent hang.

---

## 55. Error catalogue

Every error an operator can see, with its cause and its next action. This is the
document the copy comes from, and the reason there is no generic "Something went
wrong" anywhere in the consoles.

| Code | Shown as | Cause | Next action |
|---|---|---|---|
| `perm.missing` | "Suspending a member needs `people.suspend`. You have `moderation.resolve`." | RPC refused | escalate or ask |
| `perm.expired` | "Your temporary `people.suspend` ended at 22:00." | grant lapsed | request again |
| `session.revoked` | "This session was signed out from another device." | revoke | sign in |
| `session.expired` | "You were signed out after 30 minutes idle." | idle timeout | sign in, form preserved |
| `conflict.stale` | "Rimi was changed by another operator 2 minutes ago." | version mismatch | reload the record |
| `conflict.claimed` | "This report was claimed by Karim at 02:41." | claim lost | open the next |
| `validation.field` | inline, per field | constraint | correct the field |
| `rate.limited` | "Too many actions. Try again in 30 seconds." | throttle | wait |
| `bulk.partial` | "46 of 300 changed. 47 failed: an owner cannot be suspended." | mixed batch | retry from 47 |
| `net.offline` | "You are offline. This action is queued." | network | automatic |
| `net.timeout` | "The server did not answer in 15 seconds." | timeout | retry |
| `build.stale` | (reloads automatically; if it cannot) "This page needs a fresh copy." | deploy | reload |
| `secret.read` | not shown — secrets never return a value | design | — |
| `audit.missing` | "This change was not recorded, so it was not applied." | trigger | report |

Fourteen errors, and every one of them names an action. The test that keeps this
true compares the set of error codes emitted anywhere in the consoles against
this table, so a new code without a row fails CI.

---

## 56. String catalogue, and how 1,900 strings are managed

Every console's strings live in two files with identical key trees. The keys are
namespaced by screen, not by widget, so a translator can read a screen's copy in
one block:

```
admin.overview.title
admin.overview.subtitle
admin.overview.kpi.stale      "measured {{age}} ago"
admin.overview.kpi.source     "from {{source}}"
admin.approvals.empty.title
admin.approvals.empty.body
admin.approvals.confirm.reason.label
admin.approvals.confirm.reason.hint
```

Five rules for the copy, beyond §29:

**One key per sentence.** A key that concatenates two sentences cannot be
translated into a language with a different clause order.

**Interpolation, never concatenation.** `{{count}} reports` as a key, not
`count + " reports"`, so the plural rule lives in the locale.

**No string built from a fragment.** If two screens share a sentence, they share
a key under `common.`; if they share only a word, they do not share.

**A key is never renamed to save a word.** Renaming breaks the translation
memory and the reviewer's diff; a deprecated key is deleted in a separate
commit with the count of uses at zero.

**Screens do not own copy that is policy.** A member-facing message generated by
an outcome is a key stored on the outcome (§16.2 `outcome_message_key`), not a
string in a screen, because the message must be sendable by a scheduled job that
has no screen.

The migration from "some strings in a screen" to this shape is itself work: 340
of the existing console strings are inline today. They move in batch 8, and the
parity test is what proves they all arrived.

---

## 57. Keyboard catalogue

One table, generated from `ui/shortcuts.ts`, and it is the whole keyboard
surface of the suite. Anything not here does not exist.

| Context | Keys | Action |
|---|---|---|
| Global | `⌘K` / `Ctrl-K` | command palette |
| Global | `?` | shortcut sheet |
| Global | `g` then `a`…`v` | jump to a console (from the rail) |
| Global | `Esc` | close the topmost layer |
| Global | `⌘\` / `Ctrl-\` | cycle density |
| Lists | `j` / `k` | move selection |
| Lists | `Enter` | open the selected row |
| Lists | `x` | toggle selection |
| Lists | `Shift-x` | select range |
| Lists | `/` | focus search |
| Lists | `⌘Enter` | run the bulk bar's primary |
| Detail | `e` | edit |
| Detail | `⌘Enter` | save |
| Detail | `Esc` | cancel editing |
| Moderation | `a` | action menu |
| Moderation | `r` | resolve |
| Moderation | `c` | claim |
| CLI | `↑` / `↓` | history |
| CLI | `Tab` | complete |
| CLI | `⌘L` | clear |
| Forms | `Tab` / `Shift-Tab` | move |
| Forms | `⌘Enter` | submit |

Twenty-two bindings. None fires inside a text field, a textarea, a select or a
contenteditable — asserted by a test that focuses each and fires every global
binding. `?` and `Esc` are the two that must always work, and they are the two
that are tested on every screen.

---

## 58. Component API reference

The props of every primitive, because a component whose API is a paragraph of
prose is a component people use wrong.

### `DataTable`

```ts
interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: (a: T, b: T) => number;
  align?: 'start' | 'end';
  numeric?: boolean;               // tabular figures, right aligned
  width?: string;
  minWidth?: string;
  pinned?: boolean;                 // survives horizontal scroll
  permission?: string;              // column hidden without it
  hiddenByDefault?: boolean;
}
interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  getId: (row: T) => string;
  onOpen?: (row: T) => void;
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void };
  sort?: { key: string; direction: 'asc' | 'desc' | null };
  onSortChange?: (sort: DataTableProps<T>['sort']) => void;
  density?: 'comfortable' | 'compact';
  empty?: ReactNode;
  loading?: boolean;
  error?: Failure | null;
  onRetry?: () => void;
  virtualize?: boolean;             // default: rows.length > 200
  caption: string;                  // required: the accessible name
}
```

`caption` is required and there is no default, because a table without an
accessible name is a table a screen-reader user cannot identify. Making it
required is the cheapest accessibility enforcement available.

### `Confirm`

```ts
interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  title: string;                    // the verb, not "Are you sure"
  record: { name: string; id: string };
  effect: string;                   // one sentence, active voice
  stops: readonly string[];         // what stops working
  reason: { value: string; onChange: (v: string) => void; min: number };
  confirmation?: { phrase: string; typed: string; onType: (v: string) => void };
  secondApprover?: string;          // renders the two-person notice
  runbookHref: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: Failure | null;
  destructive?: boolean;            // default true
}
```

`title` is the verb rather than a question, because "Are you sure?" is the
sentence people learn to dismiss. `stops` is required for a destructive verb; an
empty array must be written explicitly, which makes "nothing stops working" a
decision rather than an omission.

### `Chart`

```ts
interface ChartProps {
  kind: 'line' | 'bar' | 'sparkline' | 'heatmap';
  series: readonly { label: string; points: readonly { x: string | number; y: number }[] }[];
  twin: { columns: readonly string[]; rows: readonly (string | number)[][] };  // required
  yLabel: string;
  xLabel?: string;
  format?: (n: number) => string;
  height?: number;
}
```

`twin` is required by the type, so a chart without an accessible alternative does
not compile. That is the strongest enforcement available short of not having
charts.

### `Field`

```ts
interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  children: (id: string) => ReactNode;
  invalid?: boolean;
}
```

The render-prop form is unusual and deliberate: it guarantees the control gets
the same id the label points at, which is the accessibility bug that every
hand-wiring of `htmlFor` eventually has.

---

## 59. Screen-by-screen field specifications

For each screen, the fields, their types and their validation. This is what a
developer builds from and what a tester asserts.

### 59.1 Person record (`users-admin-site`)

| Field | Type | Editable | Validation |
|---|---|---|---|
| Display name | text | no (member-owned) | — |
| Handle | text | no | — |
| UID | text | no | monospace, copyable |
| Role | enum 7 | yes, `people.role` | rank guard, last-owner guard |
| Status | enum 4 | yes, `people.suspend` | reason, expiry |
| Standing | derived int | yes via ledger | reason, expiry optional |
| Warning rung | smallint | yes | next step must be adjacent |
| Sessions | list | revoke only | reason |
| Cases open | list | no | — |
| Timeline | derived | no | filter by kind and date |

The two fields that are *not* editable are deliberate. A display name is a
member's own; a staff member editing it is an impersonation vector. A handle is
an identity. Both are shown and neither has an edit affordance, which is a
design decision that removes a class of abuse rather than guarding it.

### 59.2 Shop approval (`admin-site`)

| Field | Type | Required | Validation |
|---|---|---|---|
| Decision | enum approve/reject | yes | — |
| Reason | text | yes | 10–500 |
| Member message | text, prefilled | yes | 1–1000, both locales |
| Package | enum | on approve | must be an active package |
| Category | enum 12 | on approve | required by the vendor contract |

The prefilled message is the difference between an approval that takes fifteen
seconds and one that takes three minutes, and it is prefilled from a keyed
template rather than from a blank box.

### 59.3 Certificate issue

| Field | Type | Required | Validation |
|---|---|---|---|
| Member | lookup | yes | must exist, must be active |
| Course | lookup | yes | must be published |
| Attempt date | date | yes | not in the future |
| Template | lookup | yes | must be a published version |
| Evidence URL | url | no | absolute, https |
| Note | text | no | 0–500 |

Idempotency is on `(member, course, attempt_date)` and the screen tells the
operator when an attempt already holds a certificate rather than letting the
issue fail at the database.

### 59.4 Notice compose

| Field | Type | Required | Validation |
|---|---|---|---|
| Title (per locale) | text | both | 3–200 |
| Slug | text | yes | unique, reserved guard |
| Body (per locale) | markdown | both | min 40 chars |
| Audience | selector | yes | reach > 0 |
| Publish at | datetime | no | future or now |
| Priority | enum | yes | — |
| Pinned | boolean | no | — |
| Attachments | files | no | type guard, size guard |

### 59.5 Setting edit

| Field | Type | Validation |
|---|---|---|
| Value | per schema | the shared validator |
| Reason | text | 10–500 |
| Stage for approval | boolean | requires a second approver |
| Effective at | datetime | future allowed |

### 59.6 IP rule

| Field | Type | Required | Validation |
|---|---|---|---|
| Kind | enum 4 | yes | — |
| Value | CIDR | yes | parses, bits valid |
| Priority | int | yes | no overlap conflict |
| Expires at | datetime | for block | future |
| Review at | date | yes | within 180 days |
| Owner | staff | yes | must hold `ip.rule` |
| Shadow | boolean | no | — |
| Rate limit | jsonb | for rate_limit | requests > 0 |

### 59.7 Incident declare

| Field | Type | Required | Validation |
|---|---|---|---|
| Severity | enum 4 | yes | — |
| Title | text | yes | 3–120 |
| Public summary | text | yes | 10–500, both locales |
| Affected components | multi | yes | at least one |
| Commander | staff | yes | must be on shift |
| Started at | datetime | yes | not in the future |

The public summary is required at declaration rather than at resolution,
because the most common incident-communication failure is a status page that
says "investigating" for six hours.

---

## 60. Query plans and what they cost

A console's feel is decided in the query planner. Each of the five heaviest
reads has its plan stated here so a slow one is a regression rather than a
mystery.

**Moderation queue (first page).** One index scan on
`reports(status, severity, created_at)` with a limit of 20, plus three
`count(*)` over the same index for the header, plus a join to profiles by
primary key. Thirty milliseconds at 50,000 reports. The trap is an `order by`
that is not in the index, which turns it into a sort of the whole set; the
composite index exists for exactly that reason.

**Person timeline.** Five `union all` branches, each an index scan bounded by
uid and a date range, merged and sorted on a limit of 50. The cost is five
index scans and one sort. The trap is a branch without a uid predicate, which
scans a table per person — the test asserts the plan contains no `Seq Scan` for
any branch.

**Audit search.** `audit_log(action, created_at desc)` for the action filter,
`(subject, created_at desc)` for the subject, `(request_id)` for the exact tie.
A search combining actor and date uses the actor index and filters. The full
text search on reason uses a `pg_trgm` index and is capped at 200 rows.

**Telemetry delta.** One call per KPI, but each is a `count(*)` over a covering
index or a materialised count maintained by a trigger. The window comparison
reads a small `metric_snapshots` table rather than re-aggregating. Total under
40ms.

**Certificate registry.** Search by code is a unique index; by member is
`(member_uid, issued_at desc)`; by course is `(course_id, issued_at desc)`. The
ledger is a single `group by` over the status column with an index-only scan.

Six calls per screen is the budget (§14.5), and each of these five is one call
that returns everything its panel shows, including the counts.

---

## 61. Testing per batch, named

Not "add tests" but the actual test names, so the work is countable and a
missing one is visible.

### Batch 1

```
retry.test.ts > gives up after three attempts with the stated reason
retry.test.ts > jitters so ten clients do not retry in lockstep
offline-queue.test.ts > replays once and dedupes by key
offline-queue.test.ts > refuses a destructive function by name
freshness.test.ts > fresh under the window, ageing at it, stale past it
chunk-recovery.test.ts > (moved, 23 tests unchanged)
DataTable.test.tsx > reaches every cell by keyboard
DataTable.test.tsx > shift-click selects a range
DataTable.test.tsx > selection survives pagination
DataTable.test.tsx > renders all four states
Chart.test.tsx > refuses to compile without a twin  (type test)
Confirm.test.tsx > names the record by name and id
Confirm.test.tsx > requires the typed phrase when given one
Toast.test.tsx > queues rather than stacks
Toast.test.tsx > never overlaps the bulk bar  (geometry assertion)
```

### Batch 2

```
permission.test.ts > deny beats a base grant
permission.test.ts > a scope does not answer for another scope
permission.test.ts > an expired grant does not grant
permission.test.ts > the matrix snapshot is unchanged
audit.test.ts > a state change without an audit row fails
audit.test.ts > the diff names exactly the changed fields
escalation.test.ts > the requester cannot approve
escalation.test.ts > a 1-second expiry is gone after a second
session.test.ts > a hundred refreshes produce one session row
session.test.ts > a revoked session fails its next privileged call
rpc-permission.test.ts > every RPC with a permission argument calls require_permission
execute-audit.test.ts > every executable function checks a permission or is public by design
```

### Batch 3

```
bulk.test.ts > the preview and the apply agree on 100 fixture rows
bulk.test.ts > a dry run writes nothing  (row counts asserted before and after)
redirect.test.ts > a -> b -> a is refused with the cycle
redirect.test.ts > a -> b -> c suggests collapsing to c
cli-engine.test.ts > --dry-run resolves every destructive verb
cli-engine.test.ts > a destructive verb without the subject id is refused
sla.test.ts > the clock is correct across a timezone boundary
serp.test.ts > truncation matches the stated character counts
```

### Batches 4–7

The pattern continues: one test per rule branch, one per refusal, one per
concurrency claim, and one per audit assertion. The full list is generated with
the acceptance matrix in Response 10, and audit invariant `A-12` fails when a
new RPC has no entry.

### The browser suites

```
console-smoke.mjs    every console's primary screen opens; no pageerror; no overflow
console-a11y.mjs     keyboard traversal, focus rings, live regions, names
console-stale.mjs    a deploy under an open console keeps the page (13 runs)
console-visual.mjs   a screenshot per console per theme, diffed nightly
workflows.mjs        the eight recurring workflows end to end on fixtures
```

Five suites, run on every pull request, with the visual one nightly because it
is the slowest and the least likely to change in a day.

---

## 62. Cost: infrastructure, attention and maintenance

A plan that does not say what it costs is a wish. This one has three costs, and
only one of them is money.

### 62.1 Infrastructure

The platform runs on free tiers, deliberately — it is stated in the member
site's own copy ("infrastructure that stays within free tiers"). The plan does
not break that, and the numbers are worth stating because "free tier" is a
constraint that shapes design decisions rather than an accident.

**New tables and their growth.** Nine tables, of which five grow:

| Table | Rows per month (est.) | Retention | Steady state |
|---|---:|---|---|
| `staff_sessions` | ~200 | 90 days after last seen | ~600 |
| `audit_log` | ~4,000 | 24 months, then archived | ~96,000 |
| `action_receipts` | ~300 | 90 days | ~900 |
| `case_events` | ~1,500 | none (a case is permanent) | grows slowly |
| `webhook_deliveries` | ~2,000 | 30 days | ~2,000 |

At roughly 400 bytes per audit row, 96,000 rows is about 38 MB, which is inside
every free tier's database allowance by a wide margin. The archive table exists
because 24 months is a policy decision, not because the size demands it — and
stating that honestly is better than pretending the archive is a scaling
necessity.

**Queries.** The console reads are bounded by their indexes and capped by their
row limits. The heaviest is the moderation queue at 30ms. Even with six
operators polling every sixty seconds, that is under 10,000 queries a day, which
is noise against any tier.

**The one cost that is real.** Browser tests. Five suites across thirteen
consoles is roughly forty browser runs per pull request, and Chromium runs are
the expensive part of CI in minutes rather than dollars. The mitigation is that
the workflows suite runs on batch-3-through-7 pull requests only, the visual
suite runs nightly rather than per pull request, and the stale-build suite runs
once per console rather than once per screen.

### 62.2 Attention

The real cost of this plan is review attention, and it is worth naming the two
places where it is concentrated.

**Batch 2.** Fifteen security-definer functions that change who can do what.
Roughly 1,200 lines of SQL, and every line is a potential lockout. This batch
deserves more review per line than the other eight combined, and the review is
the seven-step protocol from §38, not a diff read.

**Batch 9.** The hardening batch is where the plan proves itself, and it is
also the batch most likely to be cut when a deadline appears, because it ships
nothing an operator can see. Cutting it means shipping nine batches of features
with no browser test on thirteen consoles, which is the exact state that
produced gap G6 in the first place.

Everything else is ordinary: a screen, its rules, its tests, its copy.

### 62.3 Maintenance, and the honest number

Every feature in the inventory is maintained forever, and the plan's own tools
exist to keep that affordable:

- the scaffolding command (a new console is a command, not a project);
- the screen generator (the four state tests are never forgotten);
- the RPC generator (permission, audit and proof are never forgotten);
- the migration linter (the seven rules from §19.3);
- fifteen audit invariants (the conventions are enforced, not remembered).

The maintenance estimate that follows from those: roughly 10% of build effort
per year for drift, which is the number that makes a suite of thirteen consoles
sustainable rather than a liability. Without the tools it is more like 30%, and
the difference is entirely in whether the conventions are automated.

### 62.4 What is explicitly not bought

No new SaaS: no error tracker, no feature-flag service, no log aggregator, no
observability vendor. Every one of those has a free tier that would end, and the
platform already has the storage and the screens to do the job itself. The plan
builds the ten percent it needs rather than adopting the hundred percent it
would have to integrate, monitor, and eventually pay for.

No component library, no chart library, no data-grid library — the reasoning is
in §7.1 and it is as much about the 250 KB ceiling as about control.

No mobile app for the consoles. The consoles are responsive to 250px, which is
the phone case that matters. A native console app is a second client to keep in
step with a permission model that changes, and it buys nothing the phone browser
does not already do.

---

## 63. Risk register, expanded

§15.3 listed six risks in a table. Each deserves the reasoning, because a risk
register that is a table is a risk register nobody reads.

### R1 — A permission regression locks out staff

**Likelihood** low, **impact** severe. The permission writer is the one feature
whose bug is immediately and universally felt: a wrong deny and nobody can work.

Three mitigations, in order of when they act. *Before*: the matrix snapshot
test, which fails on any change to the resolved permission set until it is
reviewed. *During*: the owner role is never granted through the UI, and the last
owner cannot be demoted, so there is always one account that can fix the table.
*After*: break-glass access, a documented path that restores the seeded grants
from a migration, drilled quarterly and timed — the target is under ten minutes.

The residual is that the snapshot test itself could be updated without review.
That is why the snapshot is a file that appears in the diff: a reviewer sees a
permission change as a diff in a test file, which is the most visible place it
could possibly appear.

### R2 — A migration blocks writes under load

**Likelihood** medium, **impact** severe. The audit trigger raises inside a
transaction; a bad interaction with a `security definer` boundary turns a
legitimate write into an error.

Mitigations: the trigger ships alone (0136), behind a settings kill switch that
needs no deploy; the migration's own test calls each of the eight audited writes
without the helper and asserts each fails, which proves the trigger is attached
where intended and nowhere else; and the migration runs against a production
snapshot before merge, with the write path exercised rather than just the DDL.

The residual is a write path nobody thought to test. The mitigation for that is
the kill switch, which is why it exists rather than being a nicety.

### R3 — Scope creep from a thousand features

**Likelihood** high, **impact** high. This is the most likely way the plan
fails, and it fails quietly: the inventory grows, the batches grow, and the
ledger's delivered count falls further behind its total each week.

Mitigation: the ledger is the scope. A new idea is a new row with a tier and a
state of `planned`, never an addition to a batch in flight. A batch that grows
mid-flight is split, and the split is recorded. The weekly review's input is the
ledger delta rather than a narrative, so slippage is a number rather than a
feeling.

The residual is that a good idea appearing mid-batch will still tempt somebody.
The answer is that it gets a row, which costs a minute and preserves the
schedule.

### R4 — The bundle budget is breached by charts

**Likelihood** medium, **impact** medium. Charts are the classic way a console
budget dies, and the performance console needs four kinds.

Mitigations: charts are hand-rolled SVG with no dependency (§7.1); the palette is
six colours and the geometry is a polyline, a rect list and a grid, which is
about 4 KB; each chart loads behind an intersection observer so a panel below the
fold costs nothing until it is seen; and the budget is a ratchet, so growth
appears as a number in a pull request rather than as a surprise in a monthly
report.

### R5 — Translation lag

**Likelihood** medium, **impact** medium. Roughly 1,900 new strings across two
languages, written by people who also have other work.

Mitigations: the parity test fails CI on a missing key, so a screen cannot ship
with an English-only string by accident; the write-together rule (§47) means the
Bangla is written with the screen; and the copy deck (§29) is agreed before
either language is written, so the translation is a translation of an agreed
sentence rather than a discovery of one.

The residual is quality, not presence. The parity test proves a Bangla string
exists; only a reader proves it is good, which is why the review question for a
new screen includes it.

### R6 — A console drifts from the kit

**Likelihood** medium, **impact** high. The natural entropy of twenty screens is
that one of them grows its own table because it needed "just one more thing".

Mitigations: the lint rule that bans a direct `fetch` in a console screen; audit
invariant `A-07` for the same; the component gallery so the primitive is easier
to find than the alternative; and the review question "why is this not in the
kit" for any new component over forty lines.

The residual is a genuinely console-specific control, which is fine — the rule
is not that everything lives in the kit, it is that a copy does not.

### R7 — The console is slow because the database is

**Likelihood** medium, **impact** medium. A console that hangs is worse than one
that fails.

Mitigations: timeouts on every call (15s read, 30s write) with a stated failure;
a circuit breaker after five consecutive failures; server-side aggregation so no
screen ships five thousand rows; a query budget of six calls per screen; and a
load test at five thousand rows on the queue as a gate on batch 4.

### R8 — A feature ships without its audit row

**Likelihood** medium, **impact** high, because it is silent. The console works,
the action happens, and the record is missing — which is the exact failure the
whole plan is built to prevent.

Mitigations: the trigger (§53.2) makes it an error rather than a silence; audit
invariant `A-12` requires a `db:prove` entry per RPC; and the ten-assertion
template (§18.4) includes the audit assertion, so a generated RPC has it by
default.

### R9 — The plan outlives its own accuracy

**Likelihood** high over twelve months, **impact** medium. A plan written in
November 2026 describes a repository that will not exist in November 2027.

Mitigation: the ledger is generated, the counts are derived, and §41 states what
is extended rather than replaced — so a future reader can tell which parts are
still true. The quarterly review (§22.3) re-reads this document against the
repository and records what changed.

---

## 64. What we will know when this is done

Success criteria, stated so they can be checked rather than felt.

**On the first day.** Every console opens on a phone at 250px, in both
languages, in both themes, with no uncaught exception, and a deploy does not
blank any of them. That is the floor a user actually notices.

**In the first week.** An operator can answer "what did this person do, what was
done about it, and what is open" from one screen in under thirty seconds. A bulk
action can be previewed exactly and reversed if it was wrong.

**In the first month.** Every privileged action has an audit row with a reason
and a diff. The permission matrix has been reviewed once and signed. A regression
in vitals has been caught by the three-run rule before a member reported it.

**In the first quarter.** Break-glass has been drilled and timed. The retention
job has run and its report has been read. The quarterly access review exists as a
signed document. The ledger's `verified` count is a real number.

**At the end.** The eleven gaps are closed with tests that were proved to fail
without their fixes. 1,013 features are either delivered with their six
evidences or `dropped` with a reason. And the number that matters most — how many
times in the last quarter an operator was blocked by the console rather than by
the problem — is zero.

---

## 65. The ten responses, restated

For the reader who reads only one section.

**1 — This plan.** What exists, measured. What is missing, named and numbered.
1,013 features, 428 of them controls. Nine batches, ordered so nothing rests on a
foundation that is not there.

**2 — Foundation.** Twelve primitives, seven services, one shell, in the kit.
No screen changes; every later screen is shorter because of it. Adopts stale-build
recovery in all thirteen consoles and closes G5.

**3 — The spine.** The permission writer, scopes, expiry, sessions, the audit
helper, the destructive registry. Closes G1, G2, G3, G4, G8, G9. The most
dangerous batch and the one with the tightest review.

**4 — Command deck.** `admin-site`: telemetry with age and delta, approvals with
an SLA clock, bulk with an authoritative preview and receipts, CLI 2.0 with a
dry run. Closes G10.

**5 — People.** `users-admin-site`, `users-moderator-site`, `moderator-site`: the
person record that answers the real question, the queue with a clock, cases and
appeals, shifts and handover.

**6 — Documents.** `certificate-site`, `notice-site`: identity that cannot
collide, chains that cannot be rewritten, acknowledgements that can be counted.

**7 — Runtime.** `config-site`, `customize-site`, `ip-site`: settings with
provenance and rollback, pages that preview truthfully, rules with a simulator
and a dry run.

**8 — Signal.** `performance-site`, `connect-site`, `status-site`, `vf-site`:
vitals that lead to an action, incidents that survive their resolution, health
that is derived rather than typed.

**9 — Craft.** Accessibility, language, mobile, resilience, performance — proven
by tests rather than asserted, across all fourteen surfaces.

**10 — Proof.** The ledger, the acceptance matrix, the runbooks, the drills, and
the honest count of what was and was not delivered.

---

## 66. Status of this document

This is Response 1 of 10. It is the plan, not the work, and it says so
throughout: 1,013 features are `planned`, none are `built`, and the ledger
starts at zero because a plan that begins by claiming progress cannot be used to
measure any.

Nothing in the repository has been changed by this response except this
document. The next response begins the foundation, and its first line will be the
number of features delivered rather than an adjective.

---

## 67. Feature-by-feature implementation notes

Every feature from §3.1 with the three things a builder needs: where it lands, what makes it done, and what proves it. The argument for each group is in §36, the specifications are in §53–61, and this section is the index between them — deliberately one entry per feature rather than one paragraph per feature, because a thousand essays is a thousand essays nobody reads.


### Kit primitives and platform services — 92 features (42 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-306` | `corporate-kit/src/ui and corporate-kit/src/data` | A spike above the rolling baseline is flagged | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-307` | `corporate-kit/src/ui and corporate-kit/src/data` | A reviewer can reconstruct the change without the UI | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-308` | `corporate-kit/src/ui and corporate-kit/src/data` | Export carries a SHA-256 the desk can re-verify | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-309` | `corporate-kit/src/ui and corporate-kit/src/data` | One action's rows share one request_id | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-310` | `corporate-kit/src/ui and corporate-kit/src/data` | Rows older than the window move to an archive table | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-311` | `corporate-kit/src/ui and corporate-kit/src/data` | An RPC that changes state without a row fails the transaction | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-312` | `corporate-kit/src/ui and corporate-kit/src/data` | Each filter narrows and composes with the others | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-313` | `corporate-kit/src/ui and corporate-kit/src/data` | The record's own history without leaving the page | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-314` | `corporate-kit/src/ui and corporate-kit/src/data` | Tampering with one row fails verification | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-315` | `corporate-kit/src/ui and corporate-kit/src/data` | Audit E-08 stays green for all 13 | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-316` | `corporate-kit/src/ui and corporate-kit/src/data` | A fourth session for a moderator is refused, oldest offered for sign-out | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-317` | `corporate-kit/src/ui and corporate-kit/src/data` | One registry drives every modal | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-318` | `corporate-kit/src/ui and corporate-kit/src/data` | A random permission string returns false, never true | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-319` | `corporate-kit/src/ui and corporate-kit/src/data` | A first-seen device is labelled without a lookup | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-320` | `corporate-kit/src/ui and corporate-kit/src/data` | Changing 2 of 8 fields records exactly those 2 | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-321` | `corporate-kit/src/ui and corporate-kit/src/data` | Answers for all 7 roles from one query | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-322` | `corporate-kit/src/ui and corporate-kit/src/data` | Pending escalations are one screen, oldest first | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-323` | `corporate-kit/src/ui and corporate-kit/src/data` | Approver and holder are both told when it lapses | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-324` | `corporate-kit/src/ui and corporate-kit/src/data` | A grant with ttl 4h is gone 4h later without a cron | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-325` | `corporate-kit/src/ui and corporate-kit/src/data` | Attempt raises, and the count is asserted after | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-326` | `corporate-kit/src/ui and corporate-kit/src/data` | Ten refusals in a minute pauses that operator's writes | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-327` | `corporate-kit/src/ui and corporate-kit/src/data` | Refusals appear in telemetry grouped by permission | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-328` | `corporate-kit/src/ui and corporate-kit/src/data` | Any prior state can be restored as a new, audited row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-329` | `corporate-kit/src/ui and corporate-kit/src/data` | Without either, the RPC raises and nothing is written | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-330` | `corporate-kit/src/ui and corporate-kit/src/data` | Saving shows the exact rows that changed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-331` | `corporate-kit/src/ui and corporate-kit/src/data` | Names the permission and who can grant it | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-332` | `corporate-kit/src/ui and corporate-kit/src/data` | A verb performed 20 minutes after sign-in asks again | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-333` | `corporate-kit/src/ui and corporate-kit/src/data` | Under 10 or over 500 characters is refused | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-334` | `corporate-kit/src/ui and corporate-kit/src/data` | Requires the permission and writes an audit row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-335` | `corporate-kit/src/ui and corporate-kit/src/data` | Revoked session fails its next request | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-336` | `corporate-kit/src/ui and corporate-kit/src/data` | A manager granting admin is refused server-side | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-337` | `corporate-kit/src/ui and corporate-kit/src/data` | A scoped grant answers has_permission only inside its scope | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-338` | `corporate-kit/src/ui and corporate-kit/src/data` | Every known gap has an owner and a date | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-339` | `corporate-kit/src/ui and corporate-kit/src/data` | An admin cannot change their own role | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-340` | `corporate-kit/src/ui and corporate-kit/src/data` | One operator cannot both request and approve an escalation | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-341` | `corporate-kit/src/ui and corporate-kit/src/data` | Privilege change rotates the session | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-342` | `corporate-kit/src/ui and corporate-kit/src/data` | Shows every live session for the signed-in operator | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-343` | `corporate-kit/src/ui and corporate-kit/src/data` | New device signs in, the operator is told once | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-344` | `corporate-kit/src/ui and corporate-kit/src/data` | Each verb names its confirmation phrase and requires it | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-345` | `corporate-kit/src/ui and corporate-kit/src/data` | The grant row names both people and the deadline | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-346` | `corporate-kit/src/ui and corporate-kit/src/data` | An invalid token cannot render a screen, even briefly | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-347` | `corporate-kit/src/ui and corporate-kit/src/data` | Grant or revoke from the UI, audited with before/after | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-348` | `corporate-kit/src/ui` | Dismissal is per-staff, not per-browser | a rule test per branch and a four-state component test |
| `A-349` | `corporate-kit/src/ui` | Freshness is visible without a spinner blocking the data | a rule test per branch and a four-state component test |
| `A-350` | `corporate-kit/src/ui` | Back through a deep link returns to where you started | a rule test per branch and a four-state component test |
| `A-351` | `corporate-kit/src/ui` | Preview lists every affected id before the call | a rule test per branch and a four-state component test |
| `A-352` | `corporate-kit/src/ui` | Export contains exactly the filtered rows, not the page | a rule test per branch and a four-state component test |
| `A-353` | `corporate-kit/src/ui` | Screen reader reads the twin; no chart without it | a rule test per branch and a four-state component test |
| `A-354` | `corporate-kit/src/ui` | Same rule text as the constraint it mirrors | a rule test per branch and a four-state component test |
| `A-355` | `corporate-kit/src/ui` | Choice survives reload and is per-console | a rule test per branch and a four-state component test |
| `A-356` | `corporate-kit/src/ui` | Every screen action is reachable by name | a rule test per branch and a four-state component test |
| `A-357` | `corporate-kit/src/ui` | Copy confirms with a toast and works on http localhost | a rule test per branch and a four-state component test |
| `A-358` | `corporate-kit/src/ui` | Suspend in tab A reflects in tab B without reload | a rule test per branch and a four-state component test |
| `A-359` | `corporate-kit/src/ui` | No float arithmetic anywhere in the render path | a rule test per branch and a four-state component test |
| `A-360` | `corporate-kit/src/ui` | Tab reaches every cell; arrow keys move focus; pin survives reload | a rule test per branch and a four-state component test |
| `A-361` | `corporate-kit/src/ui` | Same record opens in the same screen across portals | a rule test per branch and a four-state component test |
| `A-362` | `corporate-kit/src/ui` | Field-level highlight, not a line diff, for JSON | a rule test per branch and a four-state component test |
| `A-363` | `corporate-kit/src/ui` | Esc closes; focus returns to the invoking control | a rule test per branch and a four-state component test |
| `A-364` | `corporate-kit/src/ui` | No empty screen without a primary button | a rule test per branch and a four-state component test |
| `A-365` | `corporate-kit/src/ui` | 429 shows retry-after; 403 shows no retry | a rule test per branch and a four-state component test |
| `A-366` | `corporate-kit/src/ui` | A child flag cannot render while its parent is off | a rule test per branch and a four-state component test |
| `A-367` | `corporate-kit/src/ui` | Navigating away dirty prompts once | a rule test per branch and a four-state component test |
| `A-368` | `corporate-kit/src/ui` | Results never include a record they may not | a rule test per branch and a four-state component test |
| `A-369` | `corporate-kit/src/ui` | Failed write reverts the cell and surfaces the reason | a rule test per branch and a four-state component test |
| `A-370` | `corporate-kit/src/ui` | Search highlights matches; path is copyable | a rule test per branch and a four-state component test |
| `A-371` | `corporate-kit/src/ui` | ? opens the sheet; every binding listed | a rule test per branch and a four-state component test |
| `A-372` | `corporate-kit/src/ui` | Skeleton matches final layout to <2px | a rule test per branch and a four-state component test |
| `A-373` | `corporate-kit/src/ui` | Reload mid-wizard keeps every field | a rule test per branch and a four-state component test |
| `A-374` | `corporate-kit/src/ui` | Queued action runs once, never twice | a rule test per branch and a four-state component test |
| `A-375` | `corporate-kit/src/ui` | 1200 renders as 1,200 and ১,২০০, never mixed | a rule test per branch and a four-state component test |
| `A-376` | `corporate-kit/src/ui` | Banner appears within 1s of losing the network | a rule test per branch and a four-state component test |
| `A-377` | `corporate-kit/src/ui` | Failure restores prior state and names the cause | a rule test per branch and a four-state component test |
| `A-378` | `corporate-kit/src/ui` | Pin, unpin, reorder; capped at 20 | a rule test per branch and a four-state component test |
| `A-379` | `corporate-kit/src/ui` | Ctrl+P produces a usable page without the chrome | a rule test per branch and a four-state component test |
| `A-380` | `corporate-kit/src/ui` | The list survives sign-out and is private | a rule test per branch and a four-state component test |
| `A-381` | `corporate-kit/src/ui` | prefers-reduced-motion disables every transition | a rule test per branch and a four-state component test |
| `A-382` | `corporate-kit/src/ui` | '2 minutes ago' becomes '3 minutes ago' on its own | a rule test per branch and a four-state component test |
| `A-383` | `corporate-kit/src/ui` | One network call for two components asking the same thing | a rule test per branch and a four-state component test |
| `A-384` | `corporate-kit/src/ui` | Three attempts, then an error naming the attempt count | a rule test per branch and a four-state component test |
| `A-385` | `corporate-kit/src/ui` | At 10%, a fixed uid is consistently in or out | a rule test per branch and a four-state component test |
| `A-386` | `corporate-kit/src/ui` | 500 rows selected across pages; bulk bar states the count | a rule test per branch and a four-state component test |
| `A-387` | `corporate-kit/src/ui` | A view restores all five exactly; shareable as a URL | a rule test per branch and a four-state component test |
| `A-388` | `corporate-kit/src/ui` | Re-auth returns to the same screen with fields intact | a rule test per branch and a four-state component test |
| `A-389` | `corporate-kit/src/ui` | Four states, four tests per screen | a rule test per branch and a four-state component test |
| `A-390` | `corporate-kit/src/ui` | A deploy under an open console reloads once and keeps the page | a rule test per branch and a four-state component test |
| `A-391` | `corporate-kit/src/ui` | Cached list paints immediately, refresh shows a subtle badge | a rule test per branch and a four-state component test |
| `A-392` | `corporate-kit/src/ui` | Every uncaught error carries the screen id | a rule test per branch and a four-state component test |
| `A-393` | `corporate-kit/src/ui` | Preset and custom agree on the same window | a rule test per branch and a four-state component test |
| `A-394` | `corporate-kit/src/ui` | Undo within 8s restores the prior value | a rule test per branch and a four-state component test |
| `A-395` | `corporate-kit/src/ui` | Paste URL in a new tab and land on the same view | a rule test per branch and a four-state component test |
| `A-396` | `corporate-kit/src/ui` | 10k rows paint in <120ms; scroll stays 60fps | a rule test per branch and a four-state component test |
| `A-397` | `corporate-kit/src/ui` | Switching changes the visible permission set | a rule test per branch and a four-state component test |


### Operations: queues, handover, reviews — 72 features (35 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-723` | `the kit queue engine and the operations screens` | Generated, not written | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-724` | `the kit queue engine and the operations screens` | One implementation, six queues, one test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-725` | `the kit queue engine and the operations screens` | One page | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-726` | `the kit queue engine and the operations screens` | Recurring and recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-727` | `the kit queue engine and the operations screens` | Shown in its footer | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-728` | `the kit queue engine and the operations screens` | Written down | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-729` | `the kit queue engine and the operations screens` | Subscribable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-730` | `the kit queue engine and the operations screens` | Automatic | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-731` | `the kit queue engine and the operations screens` | Filled from the data, not typed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-732` | `the kit queue engine and the operations screens` | Dated and linked | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-733` | `the kit queue engine and the operations screens` | A receipt is fetchable by id for 90 days | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-734` | `the kit queue engine and the operations screens` | Closure requires evidence | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-735` | `the kit queue engine and the operations screens` | Receipt spans consoles without leaking ids | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-736` | `the kit queue engine and the operations screens` | Bounded and atomic | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-737` | `the kit queue engine and the operations screens` | Per-operator, survives sign-out | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-738` | `the kit queue engine and the operations screens` | Never returns a record the operator cannot open | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-739` | `the kit queue engine and the operations screens` | Names the top five items with links | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-740` | `the kit queue engine and the operations screens` | Data, not code | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-741` | `the kit queue engine and the operations screens` | Cached for the session | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-742` | `the kit queue engine and the operations screens` | Tracked | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-743` | `the kit queue engine and the operations screens` | Per operator, per day, from the audit log | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-744` | `the kit queue engine and the operations screens` | Every breach has a cause and an owner | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-745` | `the kit queue engine and the operations screens` | Weights are data | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-746` | `the kit queue engine and the operations screens` | Both parties notified | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-747` | `the kit queue engine and the operations screens` | The modal names the runbook | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-748` | `the kit queue engine and the operations screens` | Linked from the modal | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-749` | `the kit queue engine and the operations screens` | Share respects the recipient's permissions | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-750` | `the kit queue engine and the operations screens` | Prefilled, editable, recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-751` | `the kit queue engine and the operations screens` | Never silently lost | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-752` | `the kit queue engine and the operations screens` | Approver cannot be the requester | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-753` | `the kit queue engine and the operations screens` | Atomic, refused on the second | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-754` | `the kit queue engine and the operations screens` | One list, one rank, one owner each | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-755` | `the kit queue engine and the operations screens` | Digest on change | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-756` | `the kit queue engine and the operations screens` | A digest names what changed, not that it did | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-757` | `the kit queue engine and the operations screens` | Open items per person, visualised with a twin | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-758` | `the kit queue engine` | No production data | a rule test per branch and a four-state component test |
| `A-759` | `the kit queue engine` | Redirect and a notice | a rule test per branch and a four-state component test |
| `A-760` | `the kit queue engine` | Twelve items, each with a test | a rule test per branch and a four-state component test |
| `A-761` | `the kit queue engine` | The ledger is live | a rule test per branch and a four-state component test |
| `A-762` | `the kit queue engine` | Evidence recorded | a rule test per branch and a four-state component test |
| `A-763` | `the kit queue engine` | Acknowledged | a rule test per branch and a four-state component test |
| `A-764` | `the kit queue engine` | Optional and recorded | a rule test per branch and a four-state component test |
| `A-765` | `the kit queue engine` | Evidence recorded | a rule test per branch and a four-state component test |
| `A-766` | `the kit queue engine` | Executes nothing, prints the plan | a rule test per branch and a four-state component test |
| `A-767` | `the kit queue engine` | Always current | a rule test per branch and a four-state component test |
| `A-768` | `the kit queue engine` | Suggested, never silent | a rule test per branch and a four-state component test |
| `A-769` | `the kit queue engine` | Both are private | a rule test per branch and a four-state component test |
| `A-770` | `the kit queue engine` | Dated | a rule test per branch and a four-state component test |
| `A-771` | `the kit queue engine` | Recents and pins included | a rule test per branch and a four-state component test |
| `A-772` | `the kit queue engine` | Delegation is audited and expires | a rule test per branch and a four-state component test |
| `A-773` | `the kit queue engine` | One digest, no duplicates | a rule test per branch and a four-state component test |
| `A-774` | `the kit queue engine` | Bounded date range, signed | a rule test per branch and a four-state component test |
| `A-775` | `the kit queue engine` | No field without a hint | a rule test per branch and a four-state component test |
| `A-776` | `the kit queue engine` | Per event class | a rule test per branch and a four-state component test |
| `A-777` | `the kit queue engine` | Routing follows the deputy | a rule test per branch and a four-state component test |
| `A-778` | `the kit queue engine` | Policy is data | a rule test per branch and a four-state component test |
| `A-779` | `the kit queue engine` | All five persisted per operator | a rule test per branch and a four-state component test |
| `A-780` | `the kit queue engine` | Shown as a ratio | a rule test per branch and a four-state component test |
| `A-781` | `the kit queue engine` | Same rows | a rule test per branch and a four-state component test |
| `A-782` | `the kit queue engine` | Data, not code | a rule test per branch and a four-state component test |
| `A-783` | `the kit queue engine` | Critical always breaks through | a rule test per branch and a four-state component test |
| `A-784` | `the kit queue engine` | No production data reaches the sandbox | a rule test per branch and a four-state component test |
| `A-785` | `the kit queue engine` | From the palette | a rule test per branch and a four-state component test |
| `A-786` | `the kit queue engine` | Oldest first | a rule test per branch and a four-state component test |
| `A-787` | `the kit queue engine` | One window, one undo | a rule test per branch and a four-state component test |
| `A-788` | `the kit queue engine` | One page, readable at two metres | a component test and a visual baseline in both themes |
| `A-789` | `the kit queue engine` | One enum, one translation table | a component test and a visual baseline in both themes |
| `A-790` | `the kit queue engine` | Four states, asserted by test count | a component test and a visual baseline in both themes |
| `A-791` | `the kit queue engine` | Printable | a component test and a visual baseline in both themes |
| `A-792` | `the kit queue engine` | Both languages | a component test and a visual baseline in both themes |
| `A-793` | `the kit queue engine` | Accessible | a component test and a visual baseline in both themes |
| `A-794` | `the kit queue engine` | Text twin | a component test and a visual baseline in both themes |


### Security: permission and session spine — 6 features (3 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-925` | `the security-definer function and the policy` | The UI does not offer what it cannot do | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-926` | `the security-definer function and the policy` | Before rendering data | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-927` | `the security-definer function and the policy` | No guessing | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-928` | `the security-definer function` | What they tried and why it failed | a rule test per branch and a four-state component test |
| `A-929` | `the security-definer function` | Exact set | a rule test per branch and a four-state component test |
| `A-930` | `the security-definer function` | No writes | a rule test per branch and a four-state component test |


### Communication craft — 12 features (5 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-279` | `the send pipeline and the template store` | Members receive their own | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-280` | `the send pipeline and the template store` | Preview is the real renderer | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-281` | `the send pipeline and the template store` | Delivered, opened, failed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-282` | `the send pipeline and the template store` | Reach is computed, not estimated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-283` | `the send pipeline and the template store` | A suppressed address is never sent | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-284` | `the send pipeline` | Rule is published | a rule test per branch and a four-state component test |
| `A-285` | `the send pipeline` | Automatic suppression with a reason | a rule test per branch and a four-state component test |
| `A-286` | `the send pipeline` | Same rows as the screen | a rule test per branch and a four-state component test |
| `A-287` | `the send pipeline` | Bounded retention | a rule test per branch and a four-state component test |
| `A-288` | `the send pipeline` | Timezone is explicit | a rule test per branch and a four-state component test |
| `A-289` | `the send pipeline` | No overflow | a component test and a visual baseline in both themes |
| `A-290` | `the send pipeline` | With its send time | a component test and a visual baseline in both themes |


### Compliance and privacy — 15 features (8 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-291` | `the workflow and the retention job` | Sign-off recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-292` | `the workflow and the retention job` | Which version they accepted, when | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-293` | `the workflow and the retention job` | Deadline counted and shown | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-294` | `the workflow and the retention job` | Proof lists each table and row count | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-295` | `the workflow and the retention job` | Archive is complete and hashed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-296` | `the workflow and the retention job` | Scope is explicit | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-297` | `the workflow and the retention job` | One place, dated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-298` | `the workflow and the retention job` | A row past retention is a work item | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-299` | `the workflow` | Reads are logged, not just writes | a rule test per branch and a four-state component test |
| `A-300` | `the workflow` | Steps and owners listed | a rule test per branch and a four-state component test |
| `A-301` | `the workflow` | One screen | a rule test per branch and a four-state component test |
| `A-302` | `the workflow` | What was deleted, when, by which rule | a rule test per branch and a four-state component test |
| `A-303` | `the workflow` | Overdue is flagged | a rule test per branch and a four-state component test |
| `A-304` | `the workflow` | No dead ends | a component test and a visual baseline in both themes |
| `A-305` | `the workflow` | One PDF, indexed | a component test and a visual baseline in both themes |


### Data: analytics, reporting, explorer — 34 features (15 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-533` | `the saved-query layer and the curated view` | Definition is code-reviewed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-534` | `the saved-query layer and the curated view` | Curated, not arbitrary | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-535` | `the saved-query layer and the curated view` | A redirect can be created from the row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-536` | `the saved-query layer and the curated view` | Any two cohorts comparable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-537` | `the saved-query layer and the curated view` | Delta with direction | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-538` | `the saved-query layer and the curated view` | Stale content is a filter | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-539` | `the saved-query layer and the curated view` | Similarity is stated, not implied | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-540` | `the saved-query layer and the curated view` | No metric without provenance | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-541` | `the saved-query layer and the curated view` | Shown, not implied | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-542` | `the saved-query layer and the curated view` | Reviewed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-543` | `the saved-query layer and the curated view` | Each step's drop-off is stated with a count | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-544` | `the saved-query layer and the curated view` | Enforced server-side | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-545` | `the saved-query layer and the curated view` | Export is audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-546` | `the saved-query layer and the curated view` | Zero-result queries are a work queue | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-547` | `the saved-query layer and the curated view` | Never presents 3 samples as a trend | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-548` | `the saved-query layer` | Tab into it | a rule test per branch and a four-state component test |
| `A-549` | `the saved-query layer` | Searchable | a rule test per branch and a four-state component test |
| `A-550` | `the saved-query layer` | Names the likely cause if known | a rule test per branch and a four-state component test |
| `A-551` | `the saved-query layer` | Source is a dimension, not a guess | a rule test per branch and a four-state component test |
| `A-552` | `the saved-query layer` | Same data | a rule test per branch and a four-state component test |
| `A-553` | `the saved-query layer` | Both counts and rates | a rule test per branch and a four-state component test |
| `A-554` | `the saved-query layer` | One click preserves the window | a rule test per branch and a four-state component test |
| `A-555` | `the saved-query layer` | The formula is visible | a rule test per branch and a four-state component test |
| `A-556` | `the saved-query layer` | Same filter | a rule test per branch and a four-state component test |
| `A-557` | `the saved-query layer` | Private | a rule test per branch and a four-state component test |
| `A-558` | `the saved-query layer` | Never bypassed | a rule test per branch and a four-state component test |
| `A-559` | `the saved-query layer` | Rendered as a table twin too | a rule test per branch and a four-state component test |
| `A-560` | `the saved-query layer` | Share respects permissions | a rule test per branch and a four-state component test |
| `A-561` | `the saved-query layer` | Weekly, to named recipients | a rule test per branch and a four-state component test |
| `A-562` | `the saved-query layer` | Any two combinable | a rule test per branch and a four-state component test |
| `A-563` | `the saved-query layer` | One batched call | a rule test per branch and a four-state component test |
| `A-564` | `the saved-query layer` | Readable | a component test and a visual baseline in both themes |
| `A-565` | `the saved-query layer` | Filter is in the header | a component test and a visual baseline in both themes |
| `A-566` | `the saved-query layer` | Text twin present | a component test and a visual baseline in both themes |


### Documents: certificates and notices — 30 features (15 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-567` | `the document record and the render path` | Every prior version is reachable and immutable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-568` | `the document record and the render path` | Same record, same SHA-256, twice | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-569` | `the document record and the render path` | A double click issues one certificate | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-570` | `the document record and the render path` | Each filter is indexed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-571` | `the document record and the render path` | Codes are unique under a 100k-insert concurrency test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-572` | `the document record and the render path` | Roster is exportable and complete | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-573` | `the document record and the render path` | Pin changes are recorded with the operator | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-574` | `the document record and the render path` | A draft cannot be published by a role without it | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-575` | `the document record and the render path` | Reverting to v3 makes v4 equal to v3 | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-576` | `the document record and the render path` | Each revision shows exactly what changed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-577` | `the document record and the render path` | Members see it is withdrawn, not that it vanished | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-578` | `the document record and the render path` | Response carries status, course, date, and nothing else | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-579` | `the document record and the render path` | Restore writes a new row, never edits the old | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-580` | `the document record and the render path` | Revocation states why, in both languages | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-581` | `the document record and the render path` | One digit wrong is rejected before a lookup | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-582` | `the document record` | Every rejected row states its reason | a rule test per branch and a four-state component test |
| `A-583` | `the document record` | Manifest lists every file with its hash | a rule test per branch and a four-state component test |
| `A-584` | `the document record` | The count on the dashboard equals the ledger | a rule test per branch and a four-state component test |
| `A-585` | `the document record` | Unknown placeholder fails validation at save | a rule test per branch and a four-state component test |
| `A-586` | `the document record` | The next number is derived, not guessed | a rule test per branch and a four-state component test |
| `A-587` | `the document record` | A held record refuses delete with a clear message | a rule test per branch and a four-state component test |
| `A-588` | `the document record` | Targeting preview states the reach count | a rule test per branch and a four-state component test |
| `A-589` | `the document record` | Three counts that add up to the audience | a rule test per branch and a four-state component test |
| `A-590` | `the document record` | Same bytes at the same time | a rule test per branch and a four-state component test |
| `A-591` | `the document record` | Two notices at one time are flagged, not blocked silently | a rule test per branch and a four-state component test |
| `A-592` | `the document record` | Preview matches the PDF within 1pt | a rule test per branch and a four-state component test |
| `A-593` | `the document record` | The language follows the member, the code is stable | a component test and a visual baseline in both themes |
| `A-594` | `the document record` | Scanning never leaks an internal id | a component test and a visual baseline in both themes |
| `A-595` | `the document record` | No raw hex; contrast audit stays clean | a component test and a visual baseline in both themes |
| `A-596` | `the document record` | Prints correctly on A4 and Letter | a component test and a visual baseline in both themes |


### Editor craft — 14 features (6 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-597` | `the editor surface and the publish gate` | Copy works on http | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-598` | `the editor surface and the publish gate` | Missing alt blocks publish | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-599` | `the editor surface and the publish gate` | Dead links block publish | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-600` | `the editor surface and the publish gate` | Both languages | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-601` | `the editor surface and the publish gate` | Selection is preserved | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-602` | `the editor surface and the publish gate` | Round-trips | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-603` | `the editor surface` | Second tab is told | a rule test per branch and a four-state component test |
| `A-604` | `the editor surface` | Field-level for structured content | a rule test per branch and a four-state component test |
| `A-605` | `the editor surface` | Regex with a preview of matches | a rule test per branch and a four-state component test |
| `A-606` | `the editor surface` | Anchors stable across revisions | a rule test per branch and a four-state component test |
| `A-607` | `the editor surface` | Keeps markdown structure | a rule test per branch and a four-state component test |
| `A-608` | `the editor surface` | Keyboard reachable | a rule test per branch and a four-state component test |
| `A-609` | `the editor surface` | Esc returns | a component test and a visual baseline in both themes |
| `A-610` | `the editor surface` | Max measure enforced | a component test and a visual baseline in both themes |


### Money: wallets, invoices, payouts — 14 features (7 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-709` | `the ledger and the approval RPC` | Asserted by a reconciliation test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-710` | `the ledger and the approval RPC` | Integer poisha everywhere | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-711` | `the ledger and the approval RPC` | No gaps, no reuse | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-712` | `the ledger and the approval RPC` | Totals tie to the ledger | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-713` | `the ledger and the approval RPC` | Ledger is append-only | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-714` | `the ledger and the approval RPC` | Threshold is data | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-715` | `the ledger and the approval RPC` | Same rule as top-up | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-716` | `the ledger` | Every line traceable to an event | a rule test per branch and a four-state component test |
| `A-717` | `the ledger` | Both directions navigable | a rule test per branch and a four-state component test |
| `A-718` | `the ledger` | Both reconcile | a rule test per branch and a four-state component test |
| `A-719` | `the ledger` | 30/60/90 with counts | a rule test per branch and a four-state component test |
| `A-720` | `the ledger` | Method stated | a rule test per branch and a four-state component test |
| `A-721` | `the ledger` | No float arithmetic | a component test and a visual baseline in both themes |
| `A-722` | `the ledger` | One page, headed | a component test and a visual baseline in both themes |


### People and safety (cross-console) — 70 features (36 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-795` | `the owning console screen and the case RPC` | Acknowledged immediately | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-796` | `the owning console screen and the case RPC` | Read-only, from the same rows | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-797` | `the owning console screen and the case RPC` | Before it is taken | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-798` | `the owning console screen and the case RPC` | Deletion is queued, never immediate | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-799` | `the owning console screen and the case RPC` | Both locales covered by a test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-800` | `the owning console screen and the case RPC` | An appeal cannot be decided by the original decider | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-801` | `the owning console screen and the case RPC` | A ban cannot be edited, only superseded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-802` | `the owning console screen and the case RPC` | Items with different reasons can be batched | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-803` | `the owning console screen and the case RPC` | Complete and ordered | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-804` | `the owning console screen and the case RPC` | Multiple reports can join one case | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-805` | `the owning console screen and the case RPC` | Chosen from a list, not typed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-806` | `the owning console screen and the case RPC` | Audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-807` | `the owning console screen and the case RPC` | Immutable once closed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-808` | `the owning console screen and the case RPC` | Claim is atomic; the second claim is refused | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-809` | `the owning console screen and the case RPC` | Hidden content names who can restore it | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-810` | `the owning console screen and the case RPC` | The audit row keeps ids, not content | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-811` | `the owning console screen and the case RPC` | The member and the record both show the date | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-812` | `the owning console screen and the case RPC` | Generated from the outcome | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-813` | `the owning console screen and the case RPC` | Ordering is deterministic and stated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-814` | `the owning console screen and the case RPC` | Overdue is visible to a manager without asking | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-815` | `the owning console screen and the case RPC` | Rotation is editable and visible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-816` | `the owning console screen and the case RPC` | One screen answers who, what standing, what role | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-817` | `the owning console screen and the case RPC` | Chronological, filterable by kind and date | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-818` | `the owning console screen and the case RPC` | Links by shared signal, never by name alone | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-819` | `the owning console screen and the case RPC` | Outcome is an enum, not free text | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-820` | `the owning console screen and the case RPC` | Proven by a test that expects a refusal | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-821` | `the owning console screen and the case RPC` | The diff is permission-level, not role-name-level | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-822` | `the owning console screen and the case RPC` | Policy is data, not code | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-823` | `the owning console screen and the case RPC` | Escalation is automatic and recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-824` | `the owning console screen and the case RPC` | The next shift sees what is unresolved | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-825` | `the owning console screen and the case RPC` | A cohort of first-time reporters is flagged, not obeyed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-826` | `the owning console screen and the case RPC` | The QR verifies against the registry | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-827` | `the owning console screen and the case RPC` | Card verification uses the issued code | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-828` | `the owning console screen and the case RPC` | Each step records who completed it and when | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-829` | `the owning console screen and the case RPC` | Preview lists the capabilities lost | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-830` | `the owning console screen and the case RPC` | Expiry is mandatory; indefinite requires a second approval | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-831` | `the owning console screen` | Both languages | a rule test per branch and a four-state component test |
| `A-832` | `the owning console screen` | Context carried | a rule test per branch and a four-state component test |
| `A-833` | `the owning console screen` | Approval updates the roster | a rule test per branch and a four-state component test |
| `A-834` | `the owning console screen` | Receipt lists ids | a rule test per branch and a four-state component test |
| `A-835` | `the owning console screen` | Policy is data | a rule test per branch and a four-state component test |
| `A-836` | `the owning console screen` | Both parties notified | a rule test per branch and a four-state component test |
| `A-837` | `the owning console screen` | Weekly trend | a rule test per branch and a four-state component test |
| `A-838` | `the owning console screen` | Permission-checked | a rule test per branch and a four-state component test |
| `A-839` | `the owning console screen` | One query, ranked, with the match shown | a rule test per branch and a four-state component test |
| `A-840` | `the owning console screen` | The manager sees the full thread, not a summary | a rule test per branch and a four-state component test |
| `A-841` | `the owning console screen` | Draft is prefilled from open items | a rule test per branch and a four-state component test |
| `A-842` | `the owning console screen` | One note can spawn the action it describes | a rule test per branch and a four-state component test |
| `A-843` | `the owning console screen` | The member never sees a note | a rule test per branch and a four-state component test |
| `A-844` | `the owning console screen` | A channel mute does not silence the whole platform | a rule test per branch and a four-state component test |
| `A-845` | `the owning console screen` | Rules are data with a test corpus | a rule test per branch and a four-state component test |
| `A-846` | `the owning console screen` | Export is audited and the basis is mandatory | a rule test per branch and a four-state component test |
| `A-847` | `the owning console screen` | Merge is proposed, never automatic | a rule test per branch and a four-state component test |
| `A-848` | `the owning console screen` | Each field is indexed and states its match mode | a rule test per branch and a four-state component test |
| `A-849` | `the owning console screen` | Trend is compared to the prior 7 days | a rule test per branch and a four-state component test |
| `A-850` | `the owning console screen` | Shows the pattern | a rule test per branch and a four-state component test |
| `A-851` | `the owning console screen` | Attachments cannot be replaced, only added | a rule test per branch and a four-state component test |
| `A-852` | `the owning console screen` | Near-duplicates collapse with a count | a rule test per branch and a four-state component test |
| `A-853` | `the owning console screen` | Simulation states false-positive rate | a rule test per branch and a four-state component test |
| `A-854` | `the owning console screen` | A gap 48h ahead is flagged | a rule test per branch and a four-state component test |
| `A-855` | `the owning console screen` | Points decay on a stated schedule | a rule test per branch and a four-state component test |
| `A-856` | `the owning console screen` | Standing is derived from rows, not stored twice | a rule test per branch and a four-state component test |
| `A-857` | `the owning console screen` | No escalation without an owner | a rule test per branch and a four-state component test |
| `A-858` | `the owning console screen` | The member sees what comes next | a rule test per branch and a four-state component test |
| `A-859` | `the owning console screen` | The template shows the filled result before send | a component test and a visual baseline in both themes |
| `A-860` | `the owning console screen` | For a legal file | a component test and a visual baseline in both themes |
| `A-861` | `the owning console screen` | Same colour means the same thing everywhere | a component test and a visual baseline in both themes |
| `A-862` | `the owning console screen` | Says the queue is clear and when it was last | a component test and a visual baseline in both themes |
| `A-863` | `the owning console screen` | j/k move, a acts, r resolves | a component test and a visual baseline in both themes |
| `A-864` | `the owning console screen` | One page, no chrome, both languages | a component test and a visual baseline in both themes |


### Reporting — 15 features (7 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-865` | `the report definition and the export function` | Counts, outcomes, appeals | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-866` | `the report definition and the export function` | Definition is shown with the result | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-867` | `the report definition and the export function` | Generated, not assembled | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-868` | `the report definition and the export function` | Verifiable later | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-869` | `the report definition and the export function` | Both shown | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-870` | `the report definition and the export function` | Two runs comparable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-871` | `the report definition and the export function` | Named recipients | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-872` | `the report definition` | Signed and archived | a rule test per branch and a four-state component test |
| `A-873` | `the report definition` | No silent empty table | a rule test per branch and a four-state component test |
| `A-874` | `the report definition` | Indexed PDF | a rule test per branch and a four-state component test |
| `A-875` | `the report definition` | Delta per row | a rule test per branch and a four-state component test |
| `A-876` | `the report definition` | Same rows | a rule test per branch and a four-state component test |
| `A-877` | `the report definition` | Never by URL alone | a rule test per branch and a four-state component test |
| `A-878` | `the report definition` | Each has a name and a definition | a rule test per branch and a four-state component test |
| `A-879` | `the report definition` | Header, footer, page numbers | a component test and a visual baseline in both themes |


### Runtime: config, custom pages, IP, integrations — 35 features (18 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-880` | `the registry and its validator and the runtime RPC` | The UI states when the change is live everywhere | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-881` | `the registry and its validator and the runtime RPC` | An unpublished preview is not reachable publicly | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-882` | `the registry and its validator and the runtime RPC` | Preview is the real component, not a mock | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-883` | `the registry and its validator and the runtime RPC` | Reverting creates a new version | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-884` | `the registry and its validator and the runtime RPC` | The phrase names the consequence | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-885` | `the registry and its validator and the runtime RPC` | Redacted of secrets | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-886` | `the registry and its validator and the runtime RPC` | Shows every rule evaluated and the outcome | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-887` | `the registry and its validator and the runtime RPC` | Preview shows who would have been blocked | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-888` | `the registry and its validator and the runtime RPC` | Every rule has an owner and a review by date | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-889` | `the registry and its validator and the runtime RPC` | Names the rule and the field that matched | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-890` | `the registry and its validator and the runtime RPC` | Conflict between two rules is refused at save | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-891` | `the registry and its validator and the runtime RPC` | The UI shows set / not set, never the value | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-892` | `the registry and its validator and the runtime RPC` | Rollback is one click and is itself audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-893` | `the registry and its validator and the runtime RPC` | Any prior value can be restored | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-894` | `the registry and its validator and the runtime RPC` | No production side effect | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-895` | `the registry and its validator and the runtime RPC` | A value that violates its schema cannot be saved | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-896` | `the registry and its validator and the runtime RPC` | Every delivery has an id | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-897` | `the registry and its validator and the runtime RPC` | Bounded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-898` | `the registry and its validator` | Shows production versus staging for the same key | a rule test per branch and a four-state component test |
| `A-899` | `the registry and its validator` | An invalid import is refused wholesale | a rule test per branch and a four-state component test |
| `A-900` | `the registry and its validator` | Match highlights the field it matched | a rule test per branch and a four-state component test |
| `A-901` | `the registry and its validator` | A key nobody reads is flagged for removal | a rule test per branch and a four-state component test |
| `A-902` | `the registry and its validator` | Round-trip is byte-identical | a rule test per branch and a four-state component test |
| `A-903` | `the registry and its validator` | Headings, alt text and contrast are checked | a rule test per branch and a four-state component test |
| `A-904` | `the registry and its validator` | Reason recorded | a rule test per branch and a four-state component test |
| `A-905` | `the registry and its validator` | Bounded | a rule test per branch and a four-state component test |
| `A-906` | `the registry and its validator` | Enrichment is cached and dated | a rule test per branch and a four-state component test |
| `A-907` | `the registry and its validator` | Shows requests allowed at 10, 100 and 1000 rps | a rule test per branch and a four-state component test |
| `A-908` | `the registry and its validator` | Order is saved and audited | a rule test per branch and a four-state component test |
| `A-909` | `the registry and its validator` | A missing dependency is refused with the reason | a rule test per branch and a four-state component test |
| `A-910` | `the registry and its validator` | Which events exist | a rule test per branch and a four-state component test |
| `A-911` | `the registry and its validator` | Readable at 250px without horizontal scroll | a component test and a visual baseline in both themes |
| `A-912` | `the registry and its validator` | Each variant has a preview thumbnail drawn in CSS | a component test and a visual baseline in both themes |
| `A-913` | `the registry and its validator` | Order is visible without opening each row | a component test and a visual baseline in both themes |
| `A-914` | `the registry and its validator` | Field level | a component test and a visual baseline in both themes |


### Search and discovery — 10 features (4 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-915` | `the search index query and the normaliser` | Type filters are permission-aware | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-916` | `the search index query and the normaliser` | The matched field is highlighted | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-917` | `the search index query and the normaliser` | One digest per alert | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-918` | `the search index query and the normaliser` | Both tested with fixtures | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-919` | `the search index query` | Two concrete next steps | a rule test per branch and a four-state component test |
| `A-920` | `the search index query` | States the last index time | a rule test per branch and a four-state component test |
| `A-921` | `the search index query` | Both work | a rule test per branch and a four-state component test |
| `A-922` | `the search index query` | Private and clearable | a rule test per branch and a four-state component test |
| `A-923` | `the search index query` | No truncation of the identifying field | a component test and a visual baseline in both themes |
| `A-924` | `the search index query` | Works on every console | a component test and a visual baseline in both themes |


### Security hardening — 17 features (9 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-931` | `the owner-only control and the guard it adds` | Writes refused with a clear message | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-932` | `the owner-only control and the guard it adds` | Automatically reverts | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-933` | `the owner-only control and the guard it adds` | Signed and dated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-934` | `the owner-only control and the guard it adds` | A new device needs an approval | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-935` | `the owner-only control and the guard it adds` | Reuses the edge rule engine | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-936` | `the owner-only control and the guard it adds` | Flags with the two locations and times | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-937` | `the owner-only control and the guard it adds` | Regeneration revokes old codes | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-938` | `the owner-only control and the guard it adds` | One click revokes | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-939` | `the owner-only control and the guard it adds` | Fallback to a code if unavailable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-940` | `the owner-only control` | Reports collected and triaged | a rule test per branch and a four-state component test |
| `A-941` | `the owner-only control` | Per package | a rule test per branch and a four-state component test |
| `A-942` | `the owner-only control` | One switch, audited, reversible | a rule test per branch and a four-state component test |
| `A-943` | `the owner-only control` | Overdue is flagged | a rule test per branch and a four-state component test |
| `A-944` | `the owner-only control` | A burst above baseline is held for review | a rule test per branch and a four-state component test |
| `A-945` | `the owner-only control` | Approver must differ | a rule test per branch and a four-state component test |
| `A-946` | `the owner-only control` | For a management review | a component test and a visual baseline in both themes |
| `A-947` | `the owner-only control` | Every factor links to its fix | a component test and a visual baseline in both themes |


### Signal: vitals, incidents, verification — 54 features (29 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-948` | `the panel that reads it and the aggregation RPC` | Distinct states | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-949` | `the panel that reads it and the aggregation RPC` | An unacknowledged alert escalates once | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-950` | `the panel that reads it and the aggregation RPC` | Routing is a table, not a comment | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-951` | `the panel that reads it and the aggregation RPC` | A console over budget fails CI, not a review | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-952` | `the panel that reads it and the aggregation RPC` | Adding and removing are both recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-953` | `the panel that reads it and the aggregation RPC` | Two boxes, never confused | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-954` | `the panel that reads it and the aggregation RPC` | Regions below the sample floor are labelled, not hidden | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-955` | `the panel that reads it and the aggregation RPC` | Grouped by fingerprint, not by message | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-956` | `the panel that reads it and the aggregation RPC` | Aggregate only | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-957` | `the panel that reads it and the aggregation RPC` | The channel links back to the incident | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-958` | `the panel that reads it and the aggregation RPC` | Status board updates within one refresh | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-959` | `the panel that reads it and the aggregation RPC` | Every state change has a timestamp and an author | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-960` | `the panel that reads it and the aggregation RPC` | Named per incident | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-961` | `the panel that reads it and the aggregation RPC` | Published | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-962` | `the panel that reads it and the aggregation RPC` | Subscribers choose a language | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-963` | `the panel that reads it and the aggregation RPC` | Search never returns a channel they may not | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-964` | `the panel that reads it and the aggregation RPC` | Tracked to closure | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-965` | `the panel that reads it and the aggregation RPC` | Bounded and reported | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-966` | `the panel that reads it and the aggregation RPC` | Alert names the route, metric and delta | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-967` | `the panel that reads it and the aggregation RPC` | Resolving states who and why | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-968` | `the panel that reads it and the aggregation RPC` | Presence is accurate to 10 seconds | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-969` | `the panel that reads it and the aggregation RPC` | The formula is published beside the bars | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-970` | `the panel that reads it and the aggregation RPC` | No copy-paste | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-971` | `the panel that reads it and the aggregation RPC` | Corrections are new entries | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-972` | `the panel that reads it and the aggregation RPC` | Same input, same answer | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-973` | `the panel that reads it and the aggregation RPC` | Three input shapes, one screen | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-974` | `the panel that reads it and the aggregation RPC` | Proven by a test asserting the response fields | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-975` | `the panel that reads it and the aggregation RPC` | Names the signature and the registry row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-976` | `the panel that reads it and the aggregation RPC` | Each metric carries its sample count | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-977` | `the panel that reads it` | Verifiable | a rule test per branch and a four-state component test |
| `A-978` | `the panel that reads it` | Forecast states its confidence interval | a rule test per branch and a four-state component test |
| `A-979` | `the panel that reads it` | One click, preserving the time window | a rule test per branch and a four-state component test |
| `A-980` | `the panel that reads it` | Nothing is sent | a rule test per branch and a four-state component test |
| `A-981` | `the panel that reads it` | Estimate states its method | a rule test per branch and a four-state component test |
| `A-982` | `the panel that reads it` | Snooze requires a date and a reason | a rule test per branch and a four-state component test |
| `A-983` | `the panel that reads it` | From declare to resolve | a rule test per branch and a four-state component test |
| `A-984` | `the panel that reads it` | Trend | a rule test per branch and a four-state component test |
| `A-985` | `the panel that reads it` | Prefilled steps | a rule test per branch and a four-state component test |
| `A-986` | `the panel that reads it` | Export includes every update and timestamp | a rule test per branch and a four-state component test |
| `A-987` | `the panel that reads it` | The window is announced before it starts | a rule test per branch and a four-state component test |
| `A-988` | `the panel that reads it` | The receipt verifies against the stored report | a rule test per branch and a four-state component test |
| `A-989` | `the panel that reads it` | Linked | a rule test per branch and a four-state component test |
| `A-990` | `the panel that reads it` | A component's state is not hand-typed | a rule test per branch and a four-state component test |
| `A-991` | `the panel that reads it` | Subscribers can be exported and removed | a rule test per branch and a four-state component test |
| `A-992` | `the panel that reads it` | Both languages | a rule test per branch and a four-state component test |
| `A-993` | `the panel that reads it` | Batch is bounded and reports progress | a rule test per branch and a four-state component test |
| `A-994` | `the panel that reads it` | Two numbers | a rule test per branch and a four-state component test |
| `A-995` | `the panel that reads it` | No PII | a rule test per branch and a four-state component test |
| `A-996` | `the panel that reads it` | Slow-3G is separable from desktop | a rule test per branch and a four-state component test |
| `A-997` | `the panel that reads it` | Shows the phase that dominates | a rule test per branch and a four-state component test |
| `A-998` | `the panel that reads it` | Badges are derived, not client-only | a component test and a visual baseline in both themes |
| `A-999` | `the panel that reads it` | For a post-mortem doc | a component test and a visual baseline in both themes |
| `A-1000` | `the panel that reads it` | The sparkline has a text twin | a component test and a visual baseline in both themes |
| `A-1001` | `the panel that reads it` | A printable single page of current health | a component test and a visual baseline in both themes |


### admin-site — command deck — 43 features (9 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-001` | `admin-site/src and the admin RPC` | Wallet balance equals the sum of its ledger | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-002` | `admin-site/src and the admin RPC` | Rejecting without a reason is impossible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-003` | `admin-site/src and the admin RPC` | A row past SLA turns critical and sorts first | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-004` | `admin-site/src and the admin RPC` | Partial failure names the failed ids and rolls back | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-005` | `admin-site/src and the admin RPC` | Dry-run output is diffable and exportable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-006` | `admin-site/src and the admin RPC` | The creative is visible in the decision drawer | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-007` | `admin-site/src and the admin RPC` | Each KPI shows when it was measured and its source | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-008` | `admin-site/src and the admin RPC` | One operator cannot approve a payout alone | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-009` | `admin-site/src and the admin RPC` | The delta is shown, not just the value | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-010` | `admin-site/src` | A draft theme cannot go live without it | a rule test per branch and a four-state component test |
| `A-011` | `admin-site/src` | Difference is visible without applying | a rule test per branch and a four-state component test |
| `A-012` | `admin-site/src` | WCAG ratio is shown live for every foreground/background | a rule test per branch and a four-state component test |
| `A-013` | `admin-site/src` | Receipt includes ids, before, after, operator | a rule test per branch and a four-state component test |
| `A-014` | `admin-site/src` | No mutation is performed in dry-run, proven by test | a rule test per branch and a four-state component test |
| `A-015` | `admin-site/src` | Typing 'confirm' is not enough | a rule test per branch and a four-state component test |
| `A-016` | `admin-site/src` | Tab completes an id from the live index | a rule test per branch and a four-state component test |
| `A-017` | `admin-site/src` | Ctrl+R finds a command from last week | a rule test per branch and a four-state component test |
| `A-018` | `admin-site/src` | help <verb> prints usage, flags and one example | a rule test per branch and a four-state component test |
| `A-019` | `admin-site/src` | A macro can be run with two named arguments | a rule test per branch and a four-state component test |
| `A-020` | `admin-site/src` | Mode switch re-renders the same result | a rule test per branch and a four-state component test |
| `A-021` | `admin-site/src` | Typo gets the three nearest verbs | a rule test per branch and a four-state component test |
| `A-022` | `admin-site/src` | Transcript includes every command and result | a rule test per branch and a four-state component test |
| `A-023` | `admin-site/src` | Preview states the delivery impact | a rule test per branch and a four-state component test |
| `A-024` | `admin-site/src` | Every column has a definition in a tooltip | a rule test per branch and a four-state component test |
| `A-025` | `admin-site/src` | Drawer opens without losing the page state | a rule test per branch and a four-state component test |
| `A-026` | `admin-site/src` | Both are visible above the fold | a rule test per branch and a four-state component test |
| `A-027` | `admin-site/src` | Every portal with the operator's clearance is one click | a rule test per branch and a four-state component test |
| `A-028` | `admin-site/src` | A -> B -> A is refused with the cycle shown | a rule test per branch and a four-state component test |
| `A-029` | `admin-site/src` | Top 404s each offer a one-click redirect | a rule test per branch and a four-state component test |
| `A-030` | `admin-site/src` | Import preview shows created, updated, unchanged | a rule test per branch and a four-state component test |
| `A-031` | `admin-site/src` | Every rejected row states its column and rule | a rule test per branch and a four-state component test |
| `A-032` | `admin-site/src` | The gaps are a list, not a guess | a rule test per branch and a four-state component test |
| `A-033` | `admin-site/src` | Two pages cannot share a canonical | a rule test per branch and a four-state component test |
| `A-034` | `admin-site/src` | Title truncation matches Google's ~60 character cut | a rule test per branch and a four-state component test |
| `A-035` | `admin-site/src` | A toggle states its effect on the generated file | a rule test per branch and a four-state component test |
| `A-036` | `admin-site/src` | Inventory rows reconcile with the ad ledger | a component test and a visual baseline in both themes |
| `A-037` | `admin-site/src` | Filter persists per operator | a component test and a visual baseline in both themes |
| `A-038` | `admin-site/src` | Creative opens without leaving the decision | a component test and a visual baseline in both themes |
| `A-039` | `admin-site/src` | Both densities pass the touch-target audit | a component test and a visual baseline in both themes |
| `A-040` | `admin-site/src` | A footer line on each panel | a component test and a visual baseline in both themes |
| `A-041` | `admin-site/src` | Score names what is missing | a component test and a visual baseline in both themes |
| `A-042` | `admin-site/src` | Every number is reachable by Tab in a sane order | a component test and a visual baseline in both themes |
| `A-043` | `admin-site/src` | Printing produces the decision, not the chrome | a component test and a visual baseline in both themes |


### bsdc-cert — 22 features (9 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-044` | `certificate-site/src and the certificate RPC` | The diff is stored, not inferred | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-045` | `certificate-site/src and the certificate RPC` | A double submit issues one | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-046` | `certificate-site/src and the certificate RPC` | Concurrency test proves uniqueness | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-047` | `certificate-site/src and the certificate RPC` | Same record, same hash | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-048` | `certificate-site/src and the certificate RPC` | Only status, course and date | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-049` | `certificate-site/src and the certificate RPC` | Each filter indexed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-050` | `certificate-site/src and the certificate RPC` | Original remains reachable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-051` | `certificate-site/src and the certificate RPC` | Creates a new row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-052` | `certificate-site/src and the certificate RPC` | Both languages | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-053` | `certificate-site/src` | Every rejection explained | a rule test per branch and a four-state component test |
| `A-054` | `certificate-site/src` | Receipt lists every id | a rule test per branch and a four-state component test |
| `A-055` | `certificate-site/src` | Dashboard equals ledger | a rule test per branch and a four-state component test |
| `A-056` | `certificate-site/src` | Every file with its hash | a rule test per branch and a four-state component test |
| `A-057` | `certificate-site/src` | Refuses with a clear message | a rule test per branch and a four-state component test |
| `A-058` | `certificate-site/src` | Next number derived | a rule test per branch and a four-state component test |
| `A-059` | `certificate-site/src` | No internal ids | a rule test per branch and a four-state component test |
| `A-060` | `certificate-site/src` | Every revision with its diff | a rule test per branch and a four-state component test |
| `A-061` | `certificate-site/src` | Within 1pt of the PDF | a rule test per branch and a four-state component test |
| `A-062` | `certificate-site/src` | Unknown token fails at save | a rule test per branch and a four-state component test |
| `A-063` | `certificate-site/src` | Language follows the member | a component test and a visual baseline in both themes |
| `A-064` | `certificate-site/src` | Text twin present | a component test and a visual baseline in both themes |
| `A-065` | `certificate-site/src` | A4 and Letter | a component test and a visual baseline in both themes |


### bsdc-config — 24 features (8 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-066` | `config-site/src and the setting RPC` | Each row states where its value came from | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-067` | `config-site/src and the setting RPC` | The preview lists the screens and jobs that read it | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-068` | `config-site/src and the setting RPC` | The console refuses with an explanation | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-069` | `config-site/src and the setting RPC` | A setting without all four cannot be seeded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-070` | `config-site/src and the setting RPC` | Two rollbacks return to the original | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-071` | `config-site/src and the setting RPC` | The read RPC returns a boolean, never a value | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-072` | `config-site/src and the setting RPC` | The UI refuses before the RPC does | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-073` | `config-site/src and the setting RPC` | Every row names an operator and a reason | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-074` | `config-site/src` | Group revert lists each key it changes | a rule test per branch and a four-state component test |
| `A-075` | `config-site/src` | A failed invalidation can be retried | a rule test per branch and a four-state component test |
| `A-076` | `config-site/src` | A staged change is visible to the approver | a rule test per branch and a four-state component test |
| `A-077` | `config-site/src` | The warning names the flag to enable | a rule test per branch and a four-state component test |
| `A-078` | `config-site/src` | Two timestamps, one view | a rule test per branch and a four-state component test |
| `A-079` | `config-site/src` | Export is stable-ordered and diffable | a rule test per branch and a four-state component test |
| `A-080` | `config-site/src` | Every key belongs to exactly one group | a rule test per branch and a four-state component test |
| `A-081` | `config-site/src` | Dry-run shows added, changed and unchanged | a rule test per branch and a four-state component test |
| `A-082` | `config-site/src` | The schema is visible while editing | a rule test per branch and a four-state component test |
| `A-083` | `config-site/src` | A change at midnight is not applied at noon | a rule test per branch and a four-state component test |
| `A-084` | `config-site/src` | Match is shown in context | a rule test per branch and a four-state component test |
| `A-085` | `config-site/src` | An unused key is flagged | a rule test per branch and a four-state component test |
| `A-086` | `config-site/src` | Shown once, dismissible | a component test and a visual baseline in both themes |
| `A-087` | `config-site/src` | Both copy actions confirm | a component test and a visual baseline in both themes |
| `A-088` | `config-site/src` | Readable at 250px | a component test and a visual baseline in both themes |
| `A-089` | `config-site/src` | Arrow keys move, Enter edits | a component test and a visual baseline in both themes |


### bsdc-connect — 18 features (5 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-090` | `connect-site/src and the channel policy` | Search and read both gated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-091` | `connect-site/src and the channel policy` | Links back to the incident | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-092` | `connect-site/src and the channel policy` | Add and remove both recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-093` | `connect-site/src and the channel policy` | Never returns another channel | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-094` | `connect-site/src and the channel policy` | Away state derived | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-095` | `connect-site/src` | Escalates once on silence | a rule test per branch and a four-state component test |
| `A-096` | `connect-site/src` | Routing is editable | a rule test per branch and a four-state component test |
| `A-097` | `connect-site/src` | Archived is read-only | a rule test per branch and a four-state component test |
| `A-098` | `connect-site/src` | Rejected types named | a rule test per branch and a four-state component test |
| `A-099` | `connect-site/src` | Jump lands on the message | a rule test per branch and a four-state component test |
| `A-100` | `connect-site/src` | History shows it was edited | a rule test per branch and a four-state component test |
| `A-101` | `connect-site/src` | Pin requires membership | a rule test per branch and a four-state component test |
| `A-102` | `connect-site/src` | Thread opens without losing the channel | a rule test per branch and a four-state component test |
| `A-103` | `connect-site/src` | No flicker under load | a rule test per branch and a four-state component test |
| `A-104` | `connect-site/src` | Survives a refresh | a rule test per branch and a four-state component test |
| `A-105` | `connect-site/src` | Both pass the touch audit | a component test and a visual baseline in both themes |
| `A-106` | `connect-site/src` | End key works | a component test and a visual baseline in both themes |
| `A-107` | `connect-site/src` | Bounded to a date range | a component test and a visual baseline in both themes |


### bsdc-custom — 21 features (6 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-108` | `customize-site/src and the publish RPC` | Preview and published output are the same component | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-109` | `customize-site/src and the publish RPC` | A section without required content cannot publish | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-110` | `customize-site/src and the publish RPC` | Headings and alt text are checked at publish | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-111` | `customize-site/src and the publish RPC` | A slug colliding with a route is refused | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-112` | `customize-site/src and the publish RPC` | A removed page never 404s silently | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-113` | `customize-site/src and the publish RPC` | Revert creates a new version | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-114` | `customize-site/src` | Reload restores the draft | a rule test per branch and a four-state component test |
| `A-115` | `customize-site/src` | Move up/down works without a pointer | a rule test per branch and a four-state component test |
| `A-116` | `customize-site/src` | Duplicate copies sections but not the slug | a rule test per branch and a four-state component test |
| `A-117` | `customize-site/src` | Missing alt text blocks publish | a rule test per branch and a four-state component test |
| `A-118` | `customize-site/src` | Round-trip is byte-identical | a rule test per branch and a four-state component test |
| `A-119` | `customize-site/src` | A missing locale is visible | a rule test per branch and a four-state component test |
| `A-120` | `customize-site/src` | A dead link is flagged before publish | a rule test per branch and a four-state component test |
| `A-121` | `customize-site/src` | Filter by all three | a rule test per branch and a four-state component test |
| `A-122` | `customize-site/src` | Three widths, one control | a rule test per branch and a four-state component test |
| `A-123` | `customize-site/src` | Title and description truncation are shown | a rule test per branch and a four-state component test |
| `A-124` | `customize-site/src` | A window with an end unpublishes automatically | a rule test per branch and a four-state component test |
| `A-125` | `customize-site/src` | Every variant renders a thumbnail | a rule test per branch and a four-state component test |
| `A-126` | `customize-site/src` | Overlay is togglable and does not shift content | a component test and a visual baseline in both themes |
| `A-127` | `customize-site/src` | Twenty steps of history | a component test and a visual baseline in both themes |
| `A-128` | `customize-site/src` | Leaving prompts once | a component test and a visual baseline in both themes |


### bsdc-ip — 22 features (8 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-129` | `ip-site/src and the rule matcher` | A rule shadowing another is refused | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-130` | `ip-site/src and the rule matcher` | Shows the requests that would have been blocked | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-131` | `ip-site/src and the rule matcher` | An overdue review is flagged | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-132` | `ip-site/src and the rule matcher` | The effective order is visible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-133` | `ip-site/src and the rule matcher` | Every rule evaluated is listed in order | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-134` | `ip-site/src and the rule matcher` | Both are enforced server-side | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-135` | `ip-site/src and the rule matcher` | Names the exact rule that matched | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-136` | `ip-site/src and the rule matcher` | Each type states its effect in one sentence | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-137` | `ip-site/src` | The console warns before it locks itself out | a rule test per branch and a four-state component test |
| `A-138` | `ip-site/src` | Each rejected line states its reason | a rule test per branch and a four-state component test |
| `A-139` | `ip-site/src` | A /33 is offered /32 | a rule test per branch and a four-state component test |
| `A-140` | `ip-site/src` | The date is shown beside the value | a rule test per branch and a four-state component test |
| `A-141` | `ip-site/src` | A row opens its full evaluation | a rule test per branch and a four-state component test |
| `A-142` | `ip-site/src` | One click, fully audited | a rule test per branch and a four-state component test |
| `A-143` | `ip-site/src` | A 24h block is gone after 24h | a rule test per branch and a four-state component test |
| `A-144` | `ip-site/src` | Nothing imports unseen | a rule test per branch and a four-state component test |
| `A-145` | `ip-site/src` | Shows allowed requests at three rates | a rule test per branch and a four-state component test |
| `A-146` | `ip-site/src` | Estimate shown before saving | a rule test per branch and a four-state component test |
| `A-147` | `ip-site/src` | Shadow results appear in the impact panel | a rule test per branch and a four-state component test |
| `A-148` | `ip-site/src` | Template excludes the address value | a component test and a visual baseline in both themes |
| `A-149` | `ip-site/src` | Added, removed and changed | a component test and a visual baseline in both themes |
| `A-150` | `ip-site/src` | Order is visible without opening rows | a component test and a visual baseline in both themes |


### bsdc-mod — 22 features (8 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-151` | `moderator-site/src and the moderation RPC` | Original decider is excluded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-152` | `moderator-site/src and the moderation RPC` | Second claim refused | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-153` | `moderator-site/src and the moderation RPC` | Recorded and visible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-154` | `moderator-site/src and the moderation RPC` | Names who can restore | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-155` | `moderator-site/src and the moderation RPC` | Ordering is deterministic | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-156` | `moderator-site/src and the moderation RPC` | Links by signal, not by name | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-157` | `moderator-site/src and the moderation RPC` | A brigading cohort is flagged, not obeyed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-158` | `moderator-site/src and the moderation RPC` | Outcome is not free text | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-159` | `moderator-site/src` | One note spawns the action | a rule test per branch and a four-state component test |
| `A-160` | `moderator-site/src` | Mixed reasons in one batch | a rule test per branch and a four-state component test |
| `A-161` | `moderator-site/src` | Collapses with a count | a rule test per branch and a four-state component test |
| `A-162` | `moderator-site/src` | No summary-only escalation | a rule test per branch and a four-state component test |
| `A-163` | `moderator-site/src` | Added, never replaced | a rule test per branch and a four-state component test |
| `A-164` | `moderator-site/src` | Open, claimed and overdue | a rule test per branch and a four-state component test |
| `A-165` | `moderator-site/src` | Rule is data, not code | a rule test per branch and a four-state component test |
| `A-166` | `moderator-site/src` | Never shown to a member | a rule test per branch and a four-state component test |
| `A-167` | `moderator-site/src` | Compared to the prior week | a rule test per branch and a four-state component test |
| `A-168` | `moderator-site/src` | False-positive rate stated | a rule test per branch and a four-state component test |
| `A-169` | `moderator-site/src` | Policy is data | a rule test per branch and a four-state component test |
| `A-170` | `moderator-site/src` | Colour is never alone | a component test and a visual baseline in both themes |
| `A-171` | `moderator-site/src` | Celebratory, not blank | a component test and a visual baseline in both themes |
| `A-172` | `moderator-site/src` | No pointer needed | a component test and a visual baseline in both themes |


### bsdc-notice — 21 features (7 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-173` | `notice-site/src and the notice RPC` | Complete and ordered | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-174` | `notice-site/src and the notice RPC` | Preview matches the published page | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-175` | `notice-site/src and the notice RPC` | Every change recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-176` | `notice-site/src and the notice RPC` | Both enforced server-side | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-177` | `notice-site/src and the notice RPC` | History is never rewritten | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-178` | `notice-site/src and the notice RPC` | Each revision shows its change | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-179` | `notice-site/src and the notice RPC` | Members see it was withdrawn | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-180` | `notice-site/src` | One reminder, recorded | a rule test per branch and a four-state component test |
| `A-181` | `notice-site/src` | Rejected types are named | a rule test per branch and a four-state component test |
| `A-182` | `notice-site/src` | Reach count before publish | a rule test per branch and a four-state component test |
| `A-183` | `notice-site/src` | Every id listed | a rule test per branch and a four-state component test |
| `A-184` | `notice-site/src` | Copies content, not the schedule | a rule test per branch and a four-state component test |
| `A-185` | `notice-site/src` | Counts reconcile with the audience | a rule test per branch and a four-state component test |
| `A-186` | `notice-site/src` | Delete is refused | a rule test per branch and a four-state component test |
| `A-187` | `notice-site/src` | Draft, scheduled, live, withdrawn | a rule test per branch and a four-state component test |
| `A-188` | `notice-site/src` | Missing translation is visible | a rule test per branch and a four-state component test |
| `A-189` | `notice-site/src` | Matches the published page | a rule test per branch and a four-state component test |
| `A-190` | `notice-site/src` | Two notices at one time are flagged | a rule test per branch and a four-state component test |
| `A-191` | `notice-site/src` | Says when it was last checked | a component test and a visual baseline in both themes |
| `A-192` | `notice-site/src` | Shown to the author | a component test and a visual baseline in both themes |
| `A-193` | `notice-site/src` | Contrast audit stays clean | a component test and a visual baseline in both themes |


### bsdc-perf — 21 features (8 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-194` | `performance-site/src and the vitals RPC` | The budget is editable and audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-195` | `performance-site/src and the vitals RPC` | An app over budget is red | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-196` | `performance-site/src and the vitals RPC` | Below the floor is labelled, not hidden | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-197` | `performance-site/src and the vitals RPC` | First seen, last seen and count | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-198` | `performance-site/src and the vitals RPC` | No metric without its sample count | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-199` | `performance-site/src and the vitals RPC` | Names route, metric and delta | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-200` | `performance-site/src and the vitals RPC` | The receipt verifies the stored report | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-201` | `performance-site/src and the vitals RPC` | Resolution records who and why | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-202` | `performance-site/src` | Interval is stated | a rule test per branch and a four-state component test |
| `A-203` | `performance-site/src` | Slow-3G separable from desktop | a rule test per branch and a four-state component test |
| `A-204` | `performance-site/src` | Snooze requires a date | a rule test per branch and a four-state component test |
| `A-205` | `performance-site/src` | Method stated | a rule test per branch and a four-state component test |
| `A-206` | `performance-site/src` | Both contain the same rows | a rule test per branch and a four-state component test |
| `A-207` | `performance-site/src` | Two reports can be compared | a rule test per branch and a four-state component test |
| `A-208` | `performance-site/src` | Slow interactions ranked | a rule test per branch and a four-state component test |
| `A-209` | `performance-site/src` | Delta per metric | a rule test per branch and a four-state component test |
| `A-210` | `performance-site/src` | The mean is labelled | a rule test per branch and a four-state component test |
| `A-211` | `performance-site/src` | Dominant phase named | a rule test per branch and a four-state component test |
| `A-212` | `performance-site/src` | Empty cells are labelled | a component test and a visual baseline in both themes |
| `A-213` | `performance-site/src` | Usable A4 output | a component test and a visual baseline in both themes |
| `A-214` | `performance-site/src` | Accessible alternative exists | a component test and a visual baseline in both themes |


### bsdc-status — 15 features (5 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-215` | `status-site/src and the derivation function` | The formula is visible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-216` | `status-site/src and the derivation function` | A component cannot be set green by hand | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-217` | `status-site/src and the derivation function` | Every state change recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-218` | `status-site/src and the derivation function` | Countdown shown | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-219` | `status-site/src and the derivation function` | Language preference stored | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-220` | `status-site/src` | Three states, not two | a rule test per branch and a four-state component test |
| `A-221` | `status-site/src` | One page, linked | a rule test per branch and a four-state component test |
| `A-222` | `status-site/src` | Template prompts for impact and next update | a rule test per branch and a four-state component test |
| `A-223` | `status-site/src` | A bar opens its incidents | a rule test per branch and a four-state component test |
| `A-224` | `status-site/src` | Export includes every update | a rule test per branch and a four-state component test |
| `A-225` | `status-site/src` | No PII, no staff names | a rule test per branch and a four-state component test |
| `A-226` | `status-site/src` | Audited | a rule test per branch and a four-state component test |
| `A-227` | `status-site/src` | Screen reader reads the range | a component test and a visual baseline in both themes |
| `A-228` | `status-site/src` | Preserves scroll | a component test and a visual baseline in both themes |
| `A-229` | `status-site/src` | One page of current health | a component test and a visual baseline in both themes |


### bsdc-uadmin — 21 features (8 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-230` | `users-admin-site/src and the people RPC` | Editable only by superseding | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-231` | `users-admin-site/src and the people RPC` | 30 days, stated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-232` | `users-admin-site/src and the people RPC` | Queued, never immediate | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-233` | `users-admin-site/src and the people RPC` | One screen answers the escalation question | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-234` | `users-admin-site/src and the people RPC` | Proven by a refusal test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-235` | `users-admin-site/src and the people RPC` | Gained and lost are both listed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-236` | `users-admin-site/src and the people RPC` | Indefinite requires a second approval | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-237` | `users-admin-site/src and the people RPC` | Filter by kind and date | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-238` | `users-admin-site/src` | Every id listed | a rule test per branch and a four-state component test |
| `A-239` | `users-admin-site/src` | Merge is proposed | a rule test per branch and a four-state component test |
| `A-240` | `users-admin-site/src` | Basis is mandatory and audited | a rule test per branch and a four-state component test |
| `A-241` | `users-admin-site/src` | Does not silence the platform | a rule test per branch and a four-state component test |
| `A-242` | `users-admin-site/src` | Match mode is stated | a rule test per branch and a four-state component test |
| `A-243` | `users-admin-site/src` | Requires people.session | a rule test per branch and a four-state component test |
| `A-244` | `users-admin-site/src` | QR verifies against the registry | a rule test per branch and a four-state component test |
| `A-245` | `users-admin-site/src` | Decay schedule stated | a rule test per branch and a four-state component test |
| `A-246` | `users-admin-site/src` | Derived from rows | a rule test per branch and a four-state component test |
| `A-247` | `users-admin-site/src` | Member sees what comes next | a rule test per branch and a four-state component test |
| `A-248` | `users-admin-site/src` | One vocabulary | a component test and a visual baseline in both themes |
| `A-249` | `users-admin-site/src` | Confirms with a toast | a component test and a visual baseline in both themes |
| `A-250` | `users-admin-site/src` | One page, no chrome | a component test and a visual baseline in both themes |


### bsdc-umod — 16 features (5 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-251` | `users-moderator-site/src and the roster query` | Next shift sees open items | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-252` | `users-moderator-site/src and the roster query` | Editable and audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-253` | `users-moderator-site/src and the roster query` | Each step records who and when | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-254` | `users-moderator-site/src and the roster query` | Gaps are visible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-255` | `users-moderator-site/src and the roster query` | Card state comes from the registry | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-256` | `users-moderator-site/src` | Answers valid, revoked or unknown | a rule test per branch and a four-state component test |
| `A-257` | `users-moderator-site/src` | Gap is flagged before it happens | a rule test per branch and a four-state component test |
| `A-258` | `users-moderator-site/src` | Chart has an accessible table | a rule test per branch and a four-state component test |
| `A-259` | `users-moderator-site/src` | Contains only permitted fields | a rule test per branch and a four-state component test |
| `A-260` | `users-moderator-site/src` | Approval updates the roster | a rule test per branch and a four-state component test |
| `A-261` | `users-moderator-site/src` | Incomplete steps are listed | a rule test per branch and a four-state component test |
| `A-262` | `users-moderator-site/src` | One query, ranked | a rule test per branch and a four-state component test |
| `A-263` | `users-moderator-site/src` | Both parties and a manager | a rule test per branch and a four-state component test |
| `A-264` | `users-moderator-site/src` | No blank grid | a component test and a visual baseline in both themes |
| `A-265` | `users-moderator-site/src` | One page per week | a component test and a visual baseline in both themes |
| `A-266` | `users-moderator-site/src` | No horizontal scroll | a component test and a visual baseline in both themes |


### bsdc-vf — 12 features (4 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-267` | `vf-site/src and the verification query` | Three shapes, one screen | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-268` | `vf-site/src and the verification query` | Asserted by a field-level test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-269` | `vf-site/src and the verification query` | Names the registry row and the signature | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-270` | `vf-site/src and the verification query` | Never conflated | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-271` | `vf-site/src` | Bounded and progress-reported | a rule test per branch and a four-state component test |
| `A-272` | `vf-site/src` | Includes the time and the hash | a rule test per branch and a four-state component test |
| `A-273` | `vf-site/src` | Falls back to typing | a rule test per branch and a four-state component test |
| `A-274` | `vf-site/src` | Same link, same answer | a rule test per branch and a four-state component test |
| `A-275` | `vf-site/src` | Recent checks, private | a rule test per branch and a four-state component test |
| `A-276` | `vf-site/src` | Detected, not forced | a component test and a visual baseline in both themes |
| `A-277` | `vf-site/src` | Focus lands on the field | a component test and a visual baseline in both themes |
| `A-278` | `vf-site/src` | No horizontal scroll | a component test and a visual baseline in both themes |


### main-site /admin hub — 6 features (3 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-703` | `main-site/src/routes/Admin*.tsx and the console it hands off to` | And links to the federated console for the full tool | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-704` | `main-site/src/routes/Admin*.tsx and the console it hands off to` | Asserted by test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-705` | `main-site/src/routes/Admin*.tsx and the console it hands off to` | No task duplicated between the two | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-706` | `main-site/src/routes/Admin*.tsx` | One link, always present | a rule test per branch and a four-state component test |
| `A-707` | `main-site/src/routes/Admin*.tsx` | Preserves the selected record | a rule test per branch and a four-state component test |
| `A-708` | `main-site/src/routes/Admin*.tsx` | No scroll to reach the top actions | a component test and a visual baseline in both themes |


### Craft: interface, accessibility, language, mobile — 135 features (50 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-398` | `the shared shell and the console test harness` | Nine widths tested in a browser | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-399` | `the shared shell and the console test harness` | Measured | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-400` | `the shared shell and the console test harness` | Measured in a touch-emulated context | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-401` | `the shared shell and the console test harness` | A console regression fails a PR | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-402` | `the shared shell and the console test harness` | Esc cancels | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-403` | `the shared shell and the console test harness` | Every palette action is executable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-404` | `the shared shell and the console test harness` | One click, confirmed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-405` | `the shared shell and the console test harness` | Distinct | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-406` | `the shared shell and the console test harness` | Asserted | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-407` | `the shared shell and the console test harness` | Production is unmistakable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-408` | `the shared shell and the console test harness` | Paste in a new tab, same screen | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-409` | `the shared shell and the console test harness` | One list, one help sheet | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-410` | `the shared shell and the console test harness` | First tab stop | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-411` | `the shared shell and the console test harness` | Name plus shortcut | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-412` | `the shared shell and the console test harness` | Not hover-only | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-413` | `the shared shell and the console test harness` | Digits are never mixed within one string | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-414` | `the shared shell and the console test harness` | Measured, not assumed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-415` | `the shared shell and the console test harness` | Every console has a measured gzip number | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-416` | `the shared shell and the console test harness` | Every status has a shape or a word | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-417` | `the shared shell and the console test harness` | Tooltip or inline reason | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-418` | `the shared shell and the console test harness` | Two lines, one action | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-419` | `the shared shell and the console test harness` | Copyable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-420` | `the shared shell and the console test harness` | Asserted by test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-421` | `the shared shell and the console test harness` | Key parity test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-422` | `the shared shell and the console test harness` | Nine widths tested | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-423` | `the shared shell and the console test harness` | Clear-all is present | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-424` | `the shared shell and the console test harness` | Explicit | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-425` | `the shared shell and the console test harness` | Clicking a header toggles it | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-426` | `the shared shell and the console test harness` | No modal without a name | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-427` | `the shared shell and the console test harness` | Three lines, always | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-428` | `the shared shell and the console test harness` | A focus-visible test asserts outline width > 0 | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-429` | `the shared shell and the console test harness` | Key-set equality asserted for both locales | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-430` | `the shared shell and the console test harness` | No inline paths | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-431` | `the shared shell and the console test harness` | Tab order is tested per screen, not spot-checked | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-432` | `the shared shell and the console test harness` | A resolving queue is announced once, not per row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-433` | `the shared shell and the console test harness` | Reserved space | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-434` | `the shared shell and the console test harness` | pageerror collector asserts empty | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-435` | `the shared shell and the console test harness` | A missing key fails CI | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-436` | `the shared shell and the console test harness` | One formatter | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-437` | `the shared shell and the console test harness` | A queued action replays exactly once | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-438` | `the shared shell and the console test harness` | Tokens only | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-439` | `the shared shell and the console test harness` | Never offers what cannot run | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-440` | `the shared shell and the console test harness` | Bottom placement on mobile | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-441` | `the shared shell and the console test harness` | Logical properties only, no left/right | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-442` | `the shared shell and the console test harness` | No icon-only button without an accessible name | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-443` | `the shared shell and the console test harness` | Proven by test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-444` | `the shared shell and the console test harness` | A deploy under an open console keeps the page | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-445` | `the shared shell and the console test harness` | One table | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-446` | `the shared shell and the console test harness` | Not just 'saved' | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-447` | `the shared shell and the console test harness` | Same data, stated labels | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-448` | `the shared shell` | Banner, not modal | a rule test per branch and a four-state component test |
| `A-449` | `the shared shell` | Two different buttons | a rule test per branch and a four-state component test |
| `A-450` | `the shared shell` | Read-only, clearly labelled | a rule test per branch and a four-state component test |
| `A-451` | `the shared shell` | Before and after the action | a rule test per branch and a four-state component test |
| `A-452` | `the shared shell` | Dismissible | a rule test per branch and a four-state component test |
| `A-453` | `the shared shell` | One confirm | a rule test per branch and a four-state component test |
| `A-454` | `the shared shell` | Prints without the pin | a rule test per branch and a four-state component test |
| `A-455` | `the shared shell` | Remembered | a rule test per branch and a four-state component test |
| `A-456` | `the shared shell` | Not by id alone | a rule test per branch and a four-state component test |
| `A-457` | `the shared shell` | No calendar-only | a rule test per branch and a four-state component test |
| `A-458` | `the shared shell` | One active banner at a time | a rule test per branch and a four-state component test |
| `A-459` | `the shared shell` | Each removable | a rule test per branch and a four-state component test |
| `A-460` | `the shared shell` | Focus moves to the first | a rule test per branch and a four-state component test |
| `A-461` | `the shared shell` | Released closes | a rule test per branch and a four-state component test |
| `A-462` | `the shared shell` | Parsed and normalised | a rule test per branch and a four-state component test |
| `A-463` | `the shared shell` | Back restores the prior view | a rule test per branch and a four-state component test |
| `A-464` | `the shared shell` | Both screens | a rule test per branch and a four-state component test |
| `A-465` | `the shared shell` | No stale number | a rule test per branch and a four-state component test |
| `A-466` | `the shared shell` | Enter, arrows, escape | a rule test per branch and a four-state component test |
| `A-467` | `the shared shell` | Deep links are real URLs | a rule test per branch and a four-state component test |
| `A-468` | `the shared shell` | Excluded rows are listed | a rule test per branch and a four-state component test |
| `A-469` | `the shared shell` | No overlap | a rule test per branch and a four-state component test |
| `A-470` | `the shared shell` | No lost context | a rule test per branch and a four-state component test |
| `A-471` | `the shared shell` | Per screen | a rule test per branch and a four-state component test |
| `A-472` | `the shared shell` | Shown beside | a rule test per branch and a four-state component test |
| `A-473` | `the shared shell` | One primary per screen | a rule test per branch and a four-state component test |
| `A-474` | `the shared shell` | Remembered | a rule test per branch and a four-state component test |
| `A-475` | `the shared shell` | Announced on change once | a rule test per branch and a four-state component test |
| `A-476` | `the shared shell` | Tested | a rule test per branch and a four-state component test |
| `A-477` | `the shared shell` | Tested with fixtures | a rule test per branch and a four-state component test |
| `A-478` | `the shared shell` | Every screen action appears in the palette | a rule test per branch and a four-state component test |
| `A-479` | `the shared shell` | One pattern | a rule test per branch and a four-state component test |
| `A-480` | `the shared shell` | One enum, one set of words | a rule test per branch and a four-state component test |
| `A-481` | `the shared shell` | Reviewed against a style sheet | a rule test per branch and a four-state component test |
| `A-482` | `the shared shell` | Reviewed against a style sheet | a rule test per branch and a four-state component test |
| `A-483` | `the shared shell` | A visual diff fails on an unintended change | a rule test per branch and a four-state component test |
| `A-484` | `the shared shell` | Every timestamp names its zone | a rule test per branch and a four-state component test |
| `A-485` | `the shared shell` | Both survive sign-out | a rule test per branch and a four-state component test |
| `A-486` | `the shared shell` | Both audited | a rule test per branch and a four-state component test |
| `A-487` | `the shared shell` | Esc and back both close | a rule test per branch and a four-state component test |
| `A-488` | `the shared shell` | No untranslated unit | a rule test per branch and a four-state component test |
| `A-489` | `the shared shell` | Four tests per screen, asserted by count | a rule test per branch and a four-state component test |
| `A-490` | `the shared shell` | Above and below | a rule test per branch and a four-state component test |
| `A-491` | `the shared shell` | Measured | a rule test per branch and a four-state component test |
| `A-492` | `the shared shell` | No id ever wraps the layout | a rule test per branch and a four-state component test |
| `A-493` | `the shared shell` | Audited | a rule test per branch and a four-state component test |
| `A-494` | `the shared shell` | Measured overlap zero | a rule test per branch and a four-state component test |
| `A-495` | `the shared shell` | No row is skipped or duplicated | a rule test per branch and a four-state component test |
| `A-496` | `the shared shell` | Preview on hover | a rule test per branch and a four-state component test |
| `A-497` | `the shared shell` | Two-step commands work | a rule test per branch and a four-state component test |
| `A-498` | `the shared shell` | Stored | a rule test per branch and a four-state component test |
| `A-499` | `the shared shell` | Printing hides navigation and keeps the data | a rule test per branch and a four-state component test |
| `A-500` | `the shared shell` | No chrome | a rule test per branch and a four-state component test |
| `A-501` | `the shared shell` | Both languages | a rule test per branch and a four-state component test |
| `A-502` | `the shared shell` | Does not double-fetch | a rule test per branch and a four-state component test |
| `A-503` | `the shared shell` | All three tested per console | a rule test per branch and a four-state component test |
| `A-504` | `the shared shell` | Never ambiguous | a rule test per branch and a four-state component test |
| `A-505` | `the shared shell` | Per screen | a rule test per branch and a four-state component test |
| `A-506` | `the shared shell` | Both scripts match the same record | a rule test per branch and a four-state component test |
| `A-507` | `the shared shell` | Stored and respected | a rule test per branch and a four-state component test |
| `A-508` | `the shared shell` | Does not cover content | a rule test per branch and a four-state component test |
| `A-509` | `the shared shell` | Both available | a rule test per branch and a four-state component test |
| `A-510` | `the shared shell` | Measured | a rule test per branch and a four-state component test |
| `A-511` | `the shared shell` | Who reviewed, when | a rule test per branch and a four-state component test |
| `A-512` | `the shared shell` | Suggests the filter to relax | a component test and a visual baseline in both themes |
| `A-513` | `the shared shell` | No jarring swap | a component test and a visual baseline in both themes |
| `A-514` | `the shared shell` | Three steps maximum | a component test and a visual baseline in both themes |
| `A-515` | `the shared shell` | Measured | a component test and a visual baseline in both themes |
| `A-516` | `the shared shell` | Passes at 200% zoom | a component test and a visual baseline in both themes |
| `A-517` | `the shared shell` | Shown, not hidden | a component test and a visual baseline in both themes |
| `A-518` | `the shared shell` | Logical properties only | a component test and a visual baseline in both themes |
| `A-519` | `the shared shell` | No hidden overflow | a component test and a visual baseline in both themes |
| `A-520` | `the shared shell` | Last tab restored | a component test and a visual baseline in both themes |
| `A-521` | `the shared shell` | No inline path data outside icons.tsx | a component test and a visual baseline in both themes |
| `A-522` | `the shared shell` | Both themes | a component test and a visual baseline in both themes |
| `A-523` | `the shared shell` | No new assets | a component test and a visual baseline in both themes |
| `A-524` | `the shared shell` | No clipped controls | a component test and a visual baseline in both themes |
| `A-525` | `the shared shell` | No transition blocks input | a component test and a visual baseline in both themes |
| `A-526` | `the shared shell` | CLS contribution asserted at 0 | a component test and a visual baseline in both themes |
| `A-527` | `the shared shell` | Returns to the invoking control | a component test and a visual baseline in both themes |
| `A-528` | `the shared shell` | Tested with fixtures | a component test and a visual baseline in both themes |
| `A-529` | `the shared shell` | No clipped glyphs | a component test and a visual baseline in both themes |
| `A-530` | `the shared shell` | Measured offset under 2px | a component test and a visual baseline in both themes |
| `A-531` | `the shared shell` | List and detail together | a component test and a visual baseline in both themes |
| `A-532` | `the shared shell` | Two small labels | a component test and a visual baseline in both themes |


### Hardening: tests, budgets, proof — 92 features (41 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-611` | `scripts/audit.mjs and scripts/db-prove` | No blank screen | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-612` | `scripts/audit.mjs and scripts/db-prove` | Stale heartbeat is a banner | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-613` | `scripts/audit.mjs and scripts/db-prove` | No typo reaches production | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-614` | `scripts/audit.mjs and scripts/db-prove` | No missing context | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-615` | `scripts/audit.mjs and scripts/db-prove` | No raw key on screen | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-616` | `scripts/audit.mjs and scripts/db-prove` | No dead check | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-617` | `scripts/audit.mjs and scripts/db-prove` | No dead tab | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-618` | `scripts/audit.mjs and scripts/db-prove` | Thirteen builds | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-619` | `scripts/audit.mjs and scripts/db-prove` | Installable | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-620` | `scripts/audit.mjs and scripts/db-prove` | Audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-621` | `scripts/audit.mjs and scripts/db-prove` | Measured number recorded | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-622` | `scripts/audit.mjs and scripts/db-prove` | Audited | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-623` | `scripts/audit.mjs and scripts/db-prove` | A new column or a changed field fails until reviewed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-624` | `scripts/audit.mjs and scripts/db-prove` | 100 parallel calls, one winner | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-625` | `scripts/audit.mjs and scripts/db-prove` | pageerror collector empty on all 13 | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-626` | `scripts/audit.mjs and scripts/db-prove` | Fails without the fix, proven | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-627` | `scripts/audit.mjs and scripts/db-prove` | Old arguments still work | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-628` | `scripts/audit.mjs and scripts/db-prove` | Zero off-token pairs | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-629` | `scripts/audit.mjs and scripts/db-prove` | One proof per RPC, in db:prove | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-630` | `scripts/audit.mjs and scripts/db-prove` | A duty operator can state the build | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-631` | `scripts/audit.mjs and scripts/db-prove` | One panel failing keeps the rest | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-632` | `scripts/audit.mjs and scripts/db-prove` | No infinite spinner | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-633` | `scripts/audit.mjs and scripts/db-prove` | The row exists after the call | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-634` | `scripts/audit.mjs and scripts/db-prove` | A call without permission raises | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-635` | `scripts/audit.mjs and scripts/db-prove` | Slow queries are caught in review | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-636` | `scripts/audit.mjs and scripts/db-prove` | No unexplained index | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-637` | `scripts/audit.mjs and scripts/db-prove` | No table readable by default | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-638` | `scripts/audit.mjs and scripts/db-prove` | Capacity is planned, not discovered | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-639` | `scripts/audit.mjs and scripts/db-prove` | Degraded is visible | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-640` | `scripts/audit.mjs and scripts/db-prove` | Double submit yields one row | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-641` | `scripts/audit.mjs and scripts/db-prove` | One click | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-642` | `scripts/audit.mjs and scripts/db-prove` | Rollback script present and proven | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-643` | `scripts/audit.mjs and scripts/db-prove` | Audit gates extended to all 13 | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-644` | `scripts/audit.mjs and scripts/db-prove` | Receipt lists them | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-645` | `scripts/audit.mjs and scripts/db-prove` | Every console measured, none over 250 KB | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-646` | `scripts/audit.mjs and scripts/db-prove` | Zero warnings, enforced | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-647` | `scripts/audit.mjs and scripts/db-prove` | Any change to grants fails until reviewed | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-648` | `scripts/audit.mjs and scripts/db-prove` | Deny-by-default proven by a negative test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-649` | `scripts/audit.mjs and scripts/db-prove` | Burst is bounded and reported | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-650` | `scripts/audit.mjs and scripts/db-prove` | Proven by test | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-651` | `scripts/audit.mjs and scripts/db-prove` | Warned before expiry | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-652` | `scripts/audit.mjs` | Dated evidence | a rule test per branch and a four-state component test |
| `A-653` | `scripts/audit.mjs` | New UI to 10% of staff first | a rule test per branch and a four-state component test |
| `A-654` | `scripts/audit.mjs` | Deployment verification is automated | a rule test per branch and a four-state component test |
| `A-655` | `scripts/audit.mjs` | A broken console can be disabled without a deploy | a rule test per branch and a four-state component test |
| `A-656` | `scripts/audit.mjs` | All IO through the kit | a rule test per branch and a four-state component test |
| `A-657` | `scripts/audit.mjs` | Time is injected | a rule test per branch and a four-state component test |
| `A-658` | `scripts/audit.mjs` | Enforced at the type level | a rule test per branch and a four-state component test |
| `A-659` | `scripts/audit.mjs` | Runs before merge | a rule test per branch and a four-state component test |
| `A-660` | `scripts/audit.mjs` | No screen above 6 calls | a rule test per branch and a four-state component test |
| `A-661` | `scripts/audit.mjs` | Present and tested | a rule test per branch and a four-state component test |
| `A-662` | `scripts/audit.mjs` | Every flag seeded | a rule test per branch and a four-state component test |
| `A-663` | `scripts/audit.mjs` | No verb without instructions | a rule test per branch and a four-state component test |
| `A-664` | `scripts/audit.mjs` | No unowned queue | a rule test per branch and a four-state component test |
| `A-665` | `scripts/audit.mjs` | No loop | a rule test per branch and a four-state component test |
| `A-666` | `scripts/audit.mjs` | Explains the permission | a rule test per branch and a four-state component test |
| `A-667` | `scripts/audit.mjs` | Retry succeeds on the next call | a rule test per branch and a four-state component test |
| `A-668` | `scripts/audit.mjs` | Fails the parity gate instead | a rule test per branch and a four-state component test |
| `A-669` | `scripts/audit.mjs` | No layout break | a rule test per branch and a four-state component test |
| `A-670` | `scripts/audit.mjs` | Empty states, not crashes | a rule test per branch and a four-state component test |
| `A-671` | `scripts/audit.mjs` | Zero critical axe findings | a rule test per branch and a four-state component test |
| `A-672` | `scripts/audit.mjs` | No mixed digits | a rule test per branch and a four-state component test |
| `A-673` | `scripts/audit.mjs` | Budget is a ratchet | a rule test per branch and a four-state component test |
| `A-674` | `scripts/audit.mjs` | Timeouts surface as retryable errors | a rule test per branch and a four-state component test |
| `A-675` | `scripts/audit.mjs` | Opens after five failures, resets | a rule test per branch and a four-state component test |
| `A-676` | `scripts/audit.mjs` | Warns when the device clock is wrong | a rule test per branch and a four-state component test |
| `A-677` | `scripts/audit.mjs` | Grouped across deploys | a rule test per branch and a four-state component test |
| `A-678` | `scripts/audit.mjs` | Two tabs cannot disagree | a rule test per branch and a four-state component test |
| `A-679` | `scripts/audit.mjs` | Banner explains | a rule test per branch and a four-state component test |
| `A-680` | `scripts/audit.mjs` | Runs on every production deploy | a rule test per branch and a four-state component test |
| `A-681` | `scripts/audit.mjs` | Each action mapped to a permission | a rule test per branch and a four-state component test |
| `A-682` | `scripts/audit.mjs` | Stale owner is flagged | a rule test per branch and a four-state component test |
| `A-683` | `scripts/audit.mjs` | Every flip recorded | a rule test per branch and a four-state component test |
| `A-684` | `scripts/audit.mjs` | Tab order asserted | a rule test per branch and a four-state component test |
| `A-685` | `scripts/audit.mjs` | Under two minutes | a rule test per branch and a four-state component test |
| `A-686` | `scripts/audit.mjs` | First paint under 1.5s | a rule test per branch and a four-state component test |
| `A-687` | `scripts/audit.mjs` | Asserted by row count | a rule test per branch and a four-state component test |
| `A-688` | `scripts/audit.mjs` | Bounded, reported | a rule test per branch and a four-state component test |
| `A-689` | `scripts/audit.mjs` | Under 10 minutes to a known-good build | a rule test per branch and a four-state component test |
| `A-690` | `scripts/audit.mjs` | Diff fails on unintended change | a rule test per branch and a four-state component test |
| `A-691` | `scripts/audit.mjs` | The action resumes after re-auth | a rule test per branch and a four-state component test |
| `A-692` | `scripts/audit.mjs` | Clear message, no silent loss | a rule test per branch and a four-state component test |
| `A-693` | `scripts/audit.mjs` | Missing key fails | a rule test per branch and a four-state component test |
| `A-694` | `scripts/audit.mjs` | Reviewed on change | a component test and a visual baseline in both themes |
| `A-695` | `scripts/audit.mjs` | Ranked | a component test and a visual baseline in both themes |
| `A-696` | `scripts/audit.mjs` | No guessing | a component test and a visual baseline in both themes |
| `A-697` | `scripts/audit.mjs` | verb.noun, always | a component test and a visual baseline in both themes |
| `A-698` | `scripts/audit.mjs` | Largest modules listed | a component test and a visual baseline in both themes |
| `A-699` | `scripts/audit.mjs` | Clean at release | a component test and a visual baseline in both themes |
| `A-700` | `scripts/audit.mjs` | Read-only, labelled | a component test and a visual baseline in both themes |
| `A-701` | `scripts/audit.mjs` | 70ms to visible feedback | a component test and a visual baseline in both themes |
| `A-702` | `scripts/audit.mjs` | Token change is intentional | a component test and a visual baseline in both themes |


### Tools and generators — 12 features (5 control)

| ID | Where | Done when | Proved by |
|---|---|---|---|
| `A-1002` | `scripts/ and the generator it adds` | Creates a console with tests and a flag | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-1003` | `scripts/ and the generator it adds` | No hand-edited SQL | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-1004` | `scripts/ and the generator it adds` | Idempotent | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-1005` | `scripts/ and the generator it adds` | Never a screen without them | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-1006` | `scripts/ and the generator it adds` | Never an RPC without them | a contract test that raises without the permission or reason, plus a browser test on the path |
| `A-1007` | `scripts/` | From the code | a rule test per branch and a four-state component test |
| `A-1008` | `scripts/` | Consistent test data | a rule test per branch and a four-state component test |
| `A-1009` | `scripts/` | Fails on violation | a rule test per branch and a four-state component test |
| `A-1010` | `scripts/` | One source of truth | a rule test per branch and a four-state component test |
| `A-1011` | `scripts/` | Fails CI | a rule test per branch and a four-state component test |
| `A-1012` | `scripts/` | Every primitive visible in both themes | a rule test per branch and a four-state component test |
| `A-1013` | `scripts/` | No duplicated values | a component test and a visual baseline in both themes |

---

## 68. Answers to the questions this plan will be asked

A plan is read by people who did not commission it, and they ask the same nine
questions. The answers belong in the document rather than in a meeting.

**"Why not just extend `admin-site` and drop the thirteen consoles?"**
Because the consoles are not tabs, they are audiences. A moderator working a
queue at 02:00 needs a different default, a different minimum role and a
different loading budget than an owner approving payouts at 10:00. One console
with fourteen tabs means the moderator downloads the payout code. The split is
already there and it is correct; the plan fixes what was missing behind it —
shared primitives, a shared shell, and a shared security spine — rather than
undoing it.

**"Is the feature count real, or is it padding?"**
It is a count of capabilities, each with an acceptance criterion a reviewer can
check. Some are small: a copy affordance on an id is one function and one toast.
Others are weeks: a permission writer with scopes and expiry. Both are counted
once, both have an ID, and the ledger tracks them identically. What is *not*
counted is a variant of something else — a second table density is one feature
with two settings, not two features. That rule is why the number is 1,013 rather
than 2,000, and it is the number to hold the plan to.

**"Why is the security batch second and not first?"**
Because the permission writer's audit rows need the audit shape, and the audit
shape's helper needs the request context the foundation provides. Batch 1 is
where the request id, the retry policy and the shell boundaries appear. Doing
security before the foundation means building the audit helper twice.

**"What happens if the owner is unavailable for two weeks?"**
Batches 3 through 7 do not block on the owner: they need the *permission*, not
the person. The two things that do need a decision are the six open questions
in §23, and all six have defaults recorded there so work continues on the
default and the decision can reverse it later. That is the point of writing
defaults down.

**"How is this not a rewrite?"**
§41 is the answer: thirteen things that exist are extended, none is replaced.
The shell, the kit, the CLI, the queue, the audit table, the permission table and
the plugin system all keep their names and their shapes. The upgrade is additive
columns, new functions with new names, and new screens beside old ones behind a
flag. A member client that ships today keeps working through every batch.

**"What does 'production grade' mean if nothing has shipped yet?"**
It means the definition is written before the work: six evidences per feature
(§3.2), a gate suite per batch (§19.1), a review protocol that tries to escalate
(§38), and a test that is proved to fail (‎§18.2). Production grade is a property
of the process, not a claim about the code, and that is why the ledger starts at
zero rather than asserting progress.

**"Where does the money come from for all this?"**
§62: nothing. No new SaaS, no library, and the database stays inside the free
tier by a wide margin. The cost is attention and it is concentrated in two
batches.

**"What if a batch slips?"**
The weekly review's input is the ledger delta. A slip is a number of features
moving from `planned` to `blocked` with a reason, and the response is either to
split the batch or to move the features to a later one — recorded, not narrated.
The plan does not have a schedule that a slip breaks, because a schedule is the
first thing to become fiction.

**"How do I know this document is still true in six months?"**
§66 states that the plan is the state at 2026-11-24 and that the ledger is
regenerated. The quarterly review reads this document against the repository and
records what changed. A section that is no longer true is marked, not silently
left. That is a smaller promise than "this will all be built", and it is one
that can be kept.

---

## 69. What this plan does not do

Stated plainly, because a plan's boundaries are as much a design decision as its
contents.

**It does not redesign the member site.** Every feature here is staff-facing
except where a member receives a message, a notification or a verification
answer. The member experience changes only where a staff action produces
something a member reads.

**It does not add a mobile app.** §62.4. The consoles are responsive to 250px.

**It does not replace Postgres, Firebase or Cloudflare.** The stack is sound and
the problems are not in it.

**It does not promise sub-second on a 2G connection.** The budgets are stated
per screen and per device class in §14.5 and §20, and they are achievable
numbers rather than aspirations.

**It does not make every decision.** Six open questions in §23 have defaults and
owners. A plan that decides everything is a plan written by somebody who was not
going to build it.

**It does not include the work of writing the Bangla copy well.** §47 covers
presence, which is testable; quality is a review, and the review question is
listed there rather than automated.

**It does not fix the five pre-existing audit findings.** `scripts/audit.mjs`
reports 140 passed, 5 failed, 4 recorded against the commit this plan is measured
from. The five: C-01, an emoji in
`main-site/src/components/mk/vendor/VendorReviews.tsx`; F-01, the bundle budget,
which cannot pass in a checkout with no `dist/`; C-18, an `http://` URL inside a
doc comment in `main-site/src/lib/media/gallery.ts`; and E-11 and E-12, both
prerender checks reporting "no build present". Only C-01 and C-18 are real
findings rather than build artefacts, and both are one-line fixes. They stay
listed here rather than being quietly fixed in the same commit as this document,
because a plan that arrives with unrelated edits has already taught you to stop
reading its diffs.

---

## 70. The four sentences this plan is built on

If the reader remembers nothing else:

**A screen may not be the only thing enforcing a rule.** Everything privileged
lives in Postgres or in an edge function, and the console is a convenience over
it.

**Every state change carries a reason and a diff.** Not a log line that something
happened — a record of what changed, in the operator's own words, that a person
can read six months later.

**A test that cannot fail is not a test.** Every guard is introduced by watching
its test go red, because this repository has already demonstrated what a green
test that cannot fail is worth.

**Nothing is built on a foundation that is not there.** Nine batches, ordered,
each ending green, and the ledger says which are real.

---

## 71. Response 2 delivered: the foundation

This section is the record of what exists now, written the way §3.2 requires —
each line is checkable in the repository, and every number below was produced by
running the suite rather than by counting intentions.

### 71.1 What was built

**Twelve primitives, five services, one boundary.** All in `corporate-kit`, so
all thirteen consoles inherit them from one place.

| Module | What it settles |
|---|---|
| `domain/freshness.ts` | How old is this reading, and is it old enough to matter? Includes clock-skew detection: a timestamp from the future is reported as `unknown`, never as `live`. |
| `domain/reason.ts` | What makes a reason usable. Placeholders (`test`, `n/a`) are rejected as placeholders rather than as "too short", so the form teaches the right thing. |
| `data/resilience.ts` | Deadlines, a retry policy that never retries a refusal, and a closed/open/half-open breaker with exactly one probe. |
| `data/chunk-recovery.ts` | Stale-build recovery, namespaced per console, with a per-deploy reload budget. |
| `data/outbox.ts` | Writes recorded before they are sent, scoped to the actor who queued them, never replayed after 24 hours. |
| `data/mutations.ts` | The one place a console reads or writes — deadline, breaker and "may not have been saved" in one funnel. |
| `ui/toast.tsx` | Every action announces itself. Errors have a zero lifetime; successes replace each other. |
| `ui/ConfirmDialog.tsx` | Three levels of friction — click, reason, typed phrase — and a diff of what will change. |
| `ui/DataTable.tsx` | The four states built in, so a screen cannot ship without them. |
| `ui/FreshnessBadge.tsx` | The age of what you are looking at, always visible. |
| `ui/RecoveryBoundary.tsx` | Recovery installed above the shell. |
| `ui/useStaleBuildRecovery.ts` | The hook that makes `vite:preloadError` recoverable. |

### 71.2 The gap that closed, and the bug found closing it

G5 said stale-build recovery existed in `main-site` and in no console. The first
attempt put the hook in `AppShell` — the shell twelve consoles use. The browser
suite then passed 11 of 13 and failed on `status-site` and `vf-site`, because
both render `PublicShell` for an audience that includes signed-out visitors.

That is the difference between "fixed" and "mostly fixed", and the suite is what
found it. The recovery moved into `RecoveryBoundary`, mounted by `mountConsole`
above whichever shell a console picked. A console can no longer be written
without it: the only way to skip it is to stop using the entry point every
console uses. Audit `L-01` now enforces that, and refuses to pass if the hook
reappears in a shell.

### 71.3 Proof

Every number below was produced by running the thing.

| Evidence | Result |
|---|---|
| Kit unit tests | **226 passed** |
| Console unit tests | **421 passed** across 13 consoles |
| Browser suite, `console-stale.mjs` | **13 of 13 consoles** recover from a deploy |
| …and it is a real test | Removing the hook makes it **fail** (verified: `no unhandled chunk failure escaped`) |
| Audit | **153 passed, 0 failed, 4 recorded** — all eight new `L-` invariants green |
| Bundle budget | **14 of 14 web apps measured**, 159–214 KB gzip, all inside 250 KB |
| Typecheck | 13 consoles + kit clean |

The audit is green for the first time in this repository's recorded history. Two
of the five pre-existing findings were fixed properly rather than papered over:

- **C-01** — a literal `★` in `VendorReviews.tsx` became the `Star` icon that
  file already imported. A glyph renders differently on every platform and some
  screen readers announce its codepoint.
- **C-18** — a `http://` URL inside a doc comment became prose. The audit was
  right to flag it: a literal that can be copied is a literal that can be used.

The remaining three (F-01 on a cold checkout, E-11, E-12) were build artefacts
and pass once the builds exist. F-01 was also strengthened while here: it used to
skip an unbuilt console silently, which is how a budget goes unmeasured. It now
names what it did not measure.

### 71.4 What this does not yet do

Honest scope, so Response 3 starts from a true place.

- **No screen has been migrated to the new primitives yet.** They are built,
  tested and mounted, but `admin-site`'s screens still call `callRpc` directly
  and still use the old `Table`. That migration is batch 4, per §44, and audit
  `L-05` records it as in progress rather than pretending otherwise.
- **The outbox is not wired to a screen.** The policy is tested; the UI that
  shows "3 changes waiting" is batch 5.
- **No migration has been written.** Response 3 is the security spine and
  `0134`–`0143`; nothing in the database has changed yet.
- **Two of the twelve planned primitives are deferred**: the chart primitives
  (batch 8, when the performance console needs them) and the section builder
  (batch 7).

So: 1,013 features remain `planned`. Twelve primitives are `built`. The ledger
for this response is thirteen browser proofs and 647 unit tests, not a feature
count — because the foundation's job was to make the thousand cheaper, and that
is only measurable at the end.
