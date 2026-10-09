# Mission find-out-and-solve — the round of 8–9 October 2026

This is the record of one working round: what was reported, what each report
turned out to be, what was changed, and what has to be done by hand before any of
it is live. It is written to be read cold, by somebody who was not in the room,
including by whoever picks this repository up next.

The standing contract for the round was: the owner reports what is broken, the
work is done on a branch and opened as a pull request, the owner checks it and
reports the next thing. Nothing here is a demonstration; every feature below is
counted by the repository's own registry and proved by a test or by a database
harness.

**Contents**

1. [The reports, and what each one actually was](#1-the-reports-and-what-each-one-actually-was)
2. [What has to be applied by hand](#2-what-has-to-be-applied-by-hand)
3. [How to verify all of it](#3-how-to-verify-all-of-it)
4. [What this round deliberately did not do](#4-what-this-round-deliberately-did-not-do)
5. [The commits, in order](#5-the-commits-in-order)

---

## 1. The reports, and what each one actually was

### 1 — "Attaching an image to a post does nothing"

**Reported as** an upload problem. **It was** a missing feature: there was no
attachment system at all. No tray, no preview, no way to edit an image before
posting it, no arrangement for more than one, and no place in storage for a
picture to live.

**What was built.** A storage bucket (`media`, public, 20 MB, sixteen MIME types)
whose row-level policies require the first path segment to be the caller's own
uid, so a member can only ever write inside their own folder; an upload pipeline
with real progress, using a raw `XMLHttpRequest` because the Supabase storage
client has no progress event; a pure arrangement function that decides the layout
of one, two, three, four or more images — hero, pair, trio, quad, gallery — from
their aspect ratios, with a portrait bound and a maximum of four cells on screen;
a canvas-based editor (crop, rotate, flip, resize, quality) with a live preview;
a lightbox; a media tray with per-image alt text; drag-and-drop; and the gallery
component that renders all of it.

**Files.** `supabase/migrations/0056_a_picture_needs_somewhere_to_live.sql`,
`0057_…` (promotion parity), `main-site/src/lib/media/{arrangement,edit,gallery-items}.ts`,
`components/media/{MediaGallery,Lightbox,ImageEditorDialog,MediaTray}.tsx`,
`hooks/{use-attachments,use-file-drop}.ts`, `lib/storage/upload.ts`,
`lib/data/media-repository.ts`, `scripts/db-prove/t28.mjs`.

### 1.5 — "The profile picture appears at first and then disappears"

**It was** two client bugs, not a database one. The profile mapper used a strict
Zod schema, so a row that was merely missing one optional field failed to parse
and became `null`; and `loadOrBootstrapProfile` collapsed "the read failed" into
the same `null` as "this member has no profile", which cleared the picture that
was already on screen.

**What was built.** `ProfileOutcome = { kind: 'profile' | 'none' | 'failed' }`,
so only a real absence (or a sign-out, or a different uid) clears what is on
screen; a tolerant mapper in `lib/profile/coerce.ts`; `coverUrl` end to end. The
tests that had asserted the buggy behaviour were updated, which is the part worth
remembering: a strict-schema test that passes on a bug is a test of the bug.

### 2 — "Signed in on another browser, the feed says nothing is here"

**It was** not a database problem. The feed hid every post the member had already
seen (`hideSeen`) and then explained the empty result with a generic sentence, so
a member who had read everything was told there was nothing.

**What was built.** `lib/feed/ranking.ts` — `explainFiltering`, `emptyReason`,
`rankFeedWithReport`, `FilterReport`, `emptyFilterReport()` — a six-hour
half-life, a seen penalty, diversification and page merging; and a copy for each
distinct reason a feed can be empty, in both languages.

### 2.5 — "Login and signup say 'something went wrong' on a phone but work on a tablet"

**It was** storage. Firebase persistence needs `localStorage`, and a browser that
refuses it — an in-app browser, a private tab, a device set to clear on exit —
threw during initialisation, which surfaced as one generic failure.

**What was built.** `lib/auth/device.ts`: `prefersRedirectFlow` (false inside an
installed PWA, true in an in-app browser or on a narrow touch screen),
`applyPersistence` degrading to in-memory persistence rather than failing, and
four new sentences — `auth.errors.storageBlocked`, `browserUnsupported`,
`verificationNotSent`, `generic` — so a phone is told what is wrong with it
instead of being told that something is.

### 3 — "The messenger: voice recording, archive, images, structure"

**It was** one enum value and one grant, plus a page that behaved like a web page
rather than a conversation. A voice note arrived as a file chip because
`bsdc_message_kind` had no value for sound; archiving was refused with 42501
because the column grant for `conversation_members` had arrived in a migration
that some deployments had not applied; and the whole route wore the site footer
and reloaded.

**What was built.** Migration 0058 (adds `audio` and `video` to the message kind,
repeats the 0051 grants conditionally so a deployment without 0051 still gets
them); `lib/messaging/voice-recorder.ts` — MIME negotiation with Safari's
`audio/mp4`, a five-minute ceiling, `describeSupport()` naming the reason a
recorder is unavailable (insecure context, no recorder, no microphone, no codec),
`isWorthSending()` so a 200 ms accident is not sent; `useVoiceRecorder`;
`lib/layout/chrome.ts` — `chromeFor(pathname)` deciding between immersive,
no-footer and full chrome; and the messenger page rebuilt around them.
`scripts/db-prove/t29.mjs` proves it. See `docs/messenger.md`.

### 3.5 — "No advanced profile settings, no username change"

**It was** true. The privacy switches existed but nothing read `discoverable`;
the city field was a text box and the location permission was never asked for;
and a handle, once taken, could never be changed — `claim_username` was written
for arriving, not for moving.

**What was built.** `0061` makes `discoverable` mean something: a member who
turns it off is never suggested to anybody. `0062` turns `claim_username` into a
handle *change*: the same signature, so no caller had to move, but a change now
waits thirty days, writes a permanent redirect from the old address (which the
edge answers before the application loads), records both halves in the audit log,
and deletes the redirect when the freed handle becomes somebody's live page.
`next_username_change()` tells the settings page the date, so the wait is shown
rather than discovered. Location: a pin on the city field, in onboarding and in
settings, that rounds the coordinate to about a kilometre **before it leaves the
device**, sends it to this site's own edge, and gets back words; the numbers are
never stored. `scripts/db-prove/t33.mjs` proves the handle path end to end through
`follow_redirect`.

**Files.** `0061_the_people_worth_following_next.sql`,
`0062_changing_a_handle_is_not_claiming_one.sql`, `lib/profile/username.ts`,
`components/profile/{HandleCard,LocationField}.tsx`, `lib/geo/reverse.ts`,
`hooks/use-location.ts`, `functions/api/geo/reverse.ts`.

### 4.0 — "Realtime push notification is not working, even when the browser is closed"

**It was** entirely absent: no subscription table, no service-worker push handler,
no permission prompt, no delivery path, and no follow suggestions.

**What was built.** Everything, in `0060` + the delivery half. Read
[`docs/push-runbook.md`](./push-runbook.md) — it is the whole path, with the
diagram, every routine and who may call it, the cron worker to deploy, the curl
that proves it, and what each symptom means. In one paragraph: a push wakes a
device with **no payload** (an encrypted body can fail silently; an empty one
cannot), the worker asks `/api/push/content` what that device missed and writes it
up in the member's language, and delivery runs from `POST /api/push/flush` on a
scheduler, signed with a VAPID token minted at the edge. No function in
`functions/` holds the Supabase service key, so the two routines that read other
members' inboxes are gated by a secret the **database** checks, stored in a table
with no grants and no policies.

Also here: `follow_suggestions()` (0061) ranks four reasons and says which one it
used — mutual follows, a shared skill, the same city, then the members the
community reads — and the card under the home feed shows the reason rather than a
face. `scripts/db-prove/t31.mjs` (38 checks) and `t32.mjs` (30) prove both.

### 4.5 — "`/admin` says I have no permission, with admin credentials"

**It was** a design flaw: authority came from `profiles.role`, which a first owner
has no way to set, because setting it needs the panel, which needs the role.

**What was built.** `bsdc.actor_role()` — the higher of the profile's role and
`bsdc.bootstrap_role()`, which reads the signed token's email against
`bsdc.bootstrap_admins`, seeded with **`rrc@bsdc.info.bd` as owner**; ranks from
member (10) to owner (70); `bsdc.is_staff()`; `my_permissions()` (21 owner
permissions); `my_role()` and `claim_bootstrap_role()` (idempotent, audited as
`people.role.bootstrap`, and 42501 for anybody else); `syncRoleWithDatabase` on
the client, which re-mints custom claims through `/api/auth/claims` and refreshes
the token when they differ; `BOOTSTRAP_OWNER_EMAILS` at the edge, overridable with
`BSDC_BOOTSTRAP_OWNER_EMAILS`. Migrations `0055` and `0057`.
`scripts/db-prove/t27.mjs` proves the door exists for exactly one person.

**To make yourself the owner:** sign in once as `rrc@bsdc.info.bd`. The claim is
made on that sign-in. Nothing else to run.

### 5.0 — "Marketplace, groups, events, jobs, shops are empty; nothing can be created"

**It was** true and it was the largest gap: five tables had row-level policies
comparing an author column against the caller — `host_uid`, `poster_uid`,
`client_uid`, `owner_uid` — and **not one of them had a form**. Every directory
was a wall.

**What was built.** `/create`: one page, five tabs, one way of reporting a
refusal, and a field for every column the table actually checks. The validators
mirror the database constraint by constraint, in the same order, each with its own
sentence — an online event needs a link to join by, an end has to come after a
start, a job that is not remote has to name a city, a salary range cannot go down,
a slug has a pattern. Groups still go through `create_group()`, because that
routine is what writes the owner's membership and the `general` channel a group is
born with.

Doors to it: the app bar on a wide screen, the account menu on every screen, a
member's fourth bottom-nav tab on a phone, and each of the five lists — including
the empty ones, especially the empty ones. The account menu also finally links the
vendor console, which existed and was unreachable.

`0059` takes `INSERT` on `groups` away from the role: the routine is a definer, so
it never needed the grant, and with it a member could write the group row alone —
a group with no owner, no members and no channel, listed in the directory for
everybody and deletable only by staff. Channels keep their grant; there is no
routine for them and a group's moderators write them directly.
`scripts/db-prove/t30.mjs` (32 checks) proves inserts, counters, refusals and the
group path.

**Files.** `lib/create/{create-types,create-repository}.ts`, `routes/CreatePage.tsx`,
`0059_…`, edits to `AppBar`, `AccountMenu`, `BottomNav`, and the five list pages.

---

## 2. What has to be applied by hand

Production is still `origin/main` at `f9066d5` and the pull request is open, so
**none of this is live until it is merged and deployed**. Two things need hands on
a console.

### Migrations

Every migration from `0046` to `0062` is written but unapplied in production
(`0039`–`0045` were applied earlier). In order:

```
0046_maintenance_is_not_a_public_endpoint.sql
0047_message_notification_kind.sql
0048_a_message_is_not_a_comment.sql
0049_internal_helpers_stop_answering.sql
0050_thirty_day_recovery.sql
0051_the_messenger_is_live.sql
0052_a_moderator_is_not_a_stranger.sql
0053_the_new_endpoints_stop_answering_strangers.sql
0054_an_endpoint_that_demands_a_member_is_not_for_visitors.sql
0055_the_first_owner_has_nobody_to_ask.sql
0056_a_picture_needs_somewhere_to_live.sql
0057_a_promotion_in_the_panel_is_a_promotion_everywhere.sql
0058_a_voice_note_is_not_a_document.sql
0059_a_group_created_behind_the_rpc_is_a_group_nobody_owns.sql
0060_push_reaches_a_closed_browser.sql
0061_the_people_worth_following_next.sql
0062_changing_a_handle_is_not_claiming_one.sql
```

They are safe to apply in one go and each is idempotent — `t24` applies
`0046`–`0062` three times over against a real database built from the migrations
directory, and `t21` builds one **without** `0051` to prove `0058` survives a
deployment that is behind. Two of them change behaviour in a way worth knowing
before applying: `0059` removes a grant (nothing in the codebase used it), and
`0062` makes a second handle change wait thirty days.

### Push

```bash
cd main-site && npm run push:keys
```

Four strings: `VITE_PUSH_VAPID_PUBLIC_KEY` (build time, so set it and redeploy),
`PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_FLUSH_SECRET` — all four
encrypted in Cloudflare Pages; the flush secret also goes into `bsdc.push_settings`
with the `INSERT` the script prints. Then a scheduler that posts to
`/api/push/flush` every five minutes with the secret as a bearer token; the Worker
to deploy is written out in [`docs/push-runbook.md`](./push-runbook.md).

Until that is done, push does not run and says so: the settings card reads "this
deployment has no push key yet" rather than offering a switch that fails, and the
flush answers `503`. Nothing else about the site depends on it.

---

## 3. How to verify all of it

```bash
cd main-site
npm install
npm run db:prove     # 17 of 17 harnesses, against pglite and the real migrations
npm test             # 50 files, 698 tests
npm run lint         # eslint, zero warnings allowed
npm run typecheck    # the app and the edge functions, separately
npm run build        # tsc, vite, the written service worker, 13 prerendered routes
```

`npm run db:prove` is the one that matters most, because it is the only place the
database is asked questions rather than assumed to behave. Each harness is a
sentence: `t30` "every directory has a door", `t31` "push reaches a closed
browser, and only the people it should", `t32` "who to follow next, why, and who
is never suggested", `t33` "changing a handle leaves the old address working and
the new one free".

On a deployed site:

```bash
curl -sX POST 'https://www.bsdc.info.bd/api/push/flush' -H "authorization: Bearer $PUSH_FLUSH_SECRET"
curl -s 'https://www.bsdc.info.bd/api/health'
```

The flush answers a count and never a value. `{"waiting":0,…}` means it is wired
and nobody is owed anything.

---

## 4. What this round deliberately did not do

Recorded so that the next round does not mistake an absence for an oversight.

- **No accent colour or per-member theme.** Settings has light, dark and system.
  A member-chosen accent needs a column, a CSS-variable plumbing point and a
  picker, and it was left out of a round that already had ten reports in it.
- **No detail pages for events, jobs, gigs or projects.** Of the five directories,
  only groups have one (`/g/:slug`), and shops (`/shop/:slug`), courses
  (`/learn/:slug`), posts (`/p/:slug`) and tags (`/tag/:slug`) have theirs. So the
  create hub links to the list after creating, and a member's new event is visible
  in the calendar but has no page of its own to share. This is the largest
  remaining gap in the marketplace work and the obvious next step.
- **No payload encryption in push.** Argued in
  [`docs/push-runbook.md`](./push-runbook.md#1-why-it-is-built-this-way): the cost
  is one request when a device wakes, the benefit is that nothing in the delivery
  path can fail quietly.
- **No per-kind push filtering.** The switches in Settings → Notifications decide
  which notifications are written at all; push delivers what was written. One
  decision, in one place, rather than two that can disagree.
- **`public/icons/` is not committed and should not be.** It is generated at build
  time by `npm run brand` (`scripts/generate-brand-assets.mjs`, via `prebuild`)
  and is in `.gitignore` along with `public/og/`. A checkout with no `icons/`
  folder is correct, not broken.

---

## 5. The commits, in order

| Commit | What it is |
| --- | --- |
| `c54dbc8` | 4.5 — the first owner has a door (`0055`) |
| `61461bb` | 2, 1.5 and the first half of 3.5 — feed reports, profile outcome, privacy |
| `b26b88b` | 2.5 — auth on a device that refuses storage |
| `ccd0160` | 1 — the storage half: bucket, policies, upload pipeline (`0056`) |
| `afd8fc8` | 1 — the client half: arrangement, editor, gallery, tray, lightbox |
| `edfb4fe` | 3 — the messenger: voice notes, archive grants, chrome (`0058`) |
| `b545b61` | 5.0 — every directory has a door (`0059`) |
| `121ab3a` | 4.0 — push, the database half (`0060`) |
| `4c60e45` | 4.0 — push, the delivery half: worker, flush, content, keys |
| `7a1c721` | 4.0 — who to follow next (`0061`) |
| `fa4cc82` | 3.5 — where you are, asked for once and kept as words |
| `2e7f123` | 3.5 — changing a handle (`0062`) |
| `ce01960` | the record of the round — this document, the registry, the push variables |
| `9ae98ae` | 6 — a migration that meets a schema it does not own (`0056`, `--check`, `t34`) |

Earlier in the same pull request, and already described in their own documents:
`docs/messenger.md` for the messenger's hundred counted features,
`docs/auth-production-runbook.md` for the auth path, `docs/deploying.md` for the
deployment, and `docs/feature-registry.md` for the count — **1,807 counted
surfaces** at the end of this round, regenerated with
`node scripts/count-registry.mjs --markdown`.

---

## 6. The round after: "Database apply to production failed, I have manually did it."

The report, in full:

```
ERROR:  permission denied for schema storage
LINE 1: create table if not exists storage.buckets (
```

from `scripts/db-push.mjs`, at line 73 of
`supabase/migrations/0056_a_picture_needs_somewhere_to_live.sql`, in the
`database.yml` workflow.

### What it actually was

Not a bug in the SQL, and not a bug in the runner. A wrong assumption about
**who is applying it**.

`storage` is the only schema in this project that this platform does not own. It
belongs to `supabase_storage_admin`; `postgres` — the role the workflow connects
as, over the transaction pooler — has `USAGE` on it and no `CREATE`. Postgres
checks the right to create in a namespace *before* it honours `IF NOT EXISTS`, so
`create table if not exists storage.buckets` fails on a production project even
though the table has been there since the project was created. The same is true
of the grants, of `alter table … enable row level security`, and of all five
`create policy` statements: every one of them wants ownership of a table this
role does not own.

The runner applies one file in one transaction, which is why the failure was at
least honest: `0056` rolled back whole, nothing was left half-built, and the
ledger recorded nothing. The cost was that **every migration after it — `0057`
through `0062`, six of them — never ran**, and the operator had to apply
seventeen files by hand.

### What changed

`9ae98ae`, and it is a change of policy rather than a patch:

* **`0056` attempts its storage work instead of asserting it.** The schema and
  tables are created where the role has the right (pglite under `db:prove`, a
  local `supabase start`) and left alone where Storage already owns them
  (production). The bucket insert and each of the five policies are tried one at
  a time, so a role refused on the first is not refused on all five.
* **What it was refused is written down, twice.** As a `WARNING` in the deploy
  log at the moment it happens, and as a row in `bsdc.deployment_notes` — one row
  per debt, in the database, where it outlives the log. A note resolves itself
  the first run that manages the work, so the table says what is owed *now*.
* **The runner reads it back.** `scripts/db-push.mjs` prints every open note at
  the end of a run, and `--check` answers the harder question — a database that
  was changed by hand writes nothing down, so `--check` reads the catalog
  directly: which migrations are unapplied, whether the bucket named `media`
  exists and is public, whether all five policies are on `storage.objects`,
  whether row level security is on. It changes nothing. The storage questions
  live in `scripts/db-health.mjs`, so production is asked them through `psql` and
  pglite is asked the very same ones by the harness.
* **`t34` proves it against production's shape, not against a friendly one.** It
  builds a database where `storage` is owned by another role, its tables already
  exist, row level security is already on, and the applying role has rights over
  everything this platform created and none over Storage. The file applies. The
  enum value it came to add is added. The five policies and the bucket are
  refused, and both refusals are in `bsdc.deployment_notes`. Nothing is written
  into a schema the role does not own. Then the same file runs again under a role
  that has the rights: all five policies appear, the bucket appears, and every
  note resolves. 20 checks.
* **`docs/deploying.md` §8 carries the remedy** — what each note means, where
  each missing piece goes in the dashboard, the five policies as the SQL editor
  will take them (the editor runs as a role that owns the table, which is why it
  works there and not in the workflow), and a four-row query that reports the
  whole storage setup in one paste.

### The rule this leaves behind

> **Never emit bare DDL against a schema this platform does not own.**
> `public` and `bsdc` are ours. `storage`, `auth`, `extensions`, `realtime`,
> `graphql` are not. Anything aimed at them goes in a `do` block, gated on
> `to_regclass(...)` and `has_schema_privilege(current_user, …, 'CREATE')`, with
> an `exception` arm that records the refusal instead of failing the run.
> `grep -rn "storage\." supabase/migrations/*.sql` should return only `0056`,
> and only inside such a block.

### What the operator does now

1. Re-run the `database.yml` workflow. Every migration is idempotent — `t24`
   applies `0046`–`0062` three times over — so files already applied by hand are
   simply applied again, and the ledger catches up.
2. Read the end of the log. If it prints open `deployment_notes`, each line says
   what is missing and `docs/deploying.md` says where to put it. If it prints
   nothing, nothing is owed.
3. If the migrations were applied by hand and there is therefore no note to read,
   run `node scripts/db-push.mjs --check`, or paste the four-row query from
   `docs/deploying.md` into the SQL editor. Four `ok` rows and a `5 of 5`, and
   uploads have somewhere to live.
