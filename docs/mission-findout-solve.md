# Mission find-out-and-solve — the rounds of 8–10 October 2026

This is the record of the work across 8–10 October 2026: what was reported,
what each report turned out to be, what was changed, and what has to be done by
hand before any of it is live. It is written to be read cold, by somebody who was not in the room,
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
6. [The production migration failure](#6-the-round-after-database-apply-to-production-failed-i-have-manually-did-it)
7. [Images and the project system](#7-the-round-after-post-images-are-broken-and-projects-have-no-page)
8. [Post-image upload completes but the post has no image](#8-the-post-image-upload-completes-but-the-published-post-has-no-image)
9. [The same two reports, against a build that already had the fix](#9-the-same-two-reports-against-a-build-that-already-had-the-fix)
10. [What a crawler was told about pages that are not for crawlers](#10-what-a-crawler-was-told-about-pages-that-are-not-for-crawlers)
11. [One cover control, and an author who could not change their own cover](#11-one-cover-control-and-an-author-who-could-not-change-their-own-cover)

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

PR #9 is open from `arena/73abbe9e-bsdc`; the code is not live until the owner
merges and deploys it. This agent has not applied production migrations, deployed
the app, or tested live ImgBB/Cloudinary uploads. Check the production migration
ledger rather than assuming state: earlier files may have been applied manually.
After merge, the normal database workflow must apply any missing migrations,
including the new `0063`.

### Migrations

`0064` and `0065` were added by the rounds recorded in §9 and §10. Check the
production ledger for `0046`–`0063` because some may have been applied manually;
do not infer production state from the branch. In order, the migrations in this
set are:

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
0063_projects_have_a_home_to_be_found.sql
0064_a_project_can_be_corrected.sql
0065_a_private_page_is_not_a_page_for_crawlers.sql
```

They are safe to apply in one go and each is idempotent — `t24` applies
`0046`–`0065` three times over against PGlite, and `t21` builds one **without**
`0051` to prove `0058` survives a deployment that is behind. `0063` and `0065`
replace the project SEO and sitemap functions in place; neither moves or restores
stored image bytes. `0064` adds the `project_media` join and grants update on it
per column, following the shape `0042` exists to be followed — a table-level
`grant update` with a column-level `revoke` afterwards protects nothing, because
the grant already covers every column and the revoke cannot subtract from it.
Two earlier migrations change behaviour worth knowing before applying: `0059`
removes an unused grant, and `0062` makes a second handle change wait thirty days.

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
npm run db:prove     # 19 of 19 PGlite/database harnesses, including 0063 and RLS proof
npm test             # 54 files, 706 tests
npm run lint         # eslint, zero warnings allowed
npm run typecheck    # app and Pages Functions
npx prettier --check 'src/**/*.{ts,tsx,css}' 'functions/**/*.ts' 'scripts/db-prove/*.mjs' '../scripts/audit.mjs'
npm run build        # tsc, Vite, service worker; 200 precache entries and 13 prerendered routes
cd ..
node scripts/audit.mjs         # 107 checkpoints: 103 passed, 0 failed, 4 recorded
node scripts/count-registry.mjs # 1,817 counted surfaces (derived, not a promise of live acceptance)
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
- **Before round 7, none of the event, job, gig or project directories had detail
  pages.** Projects now have `/projects/:slug`; events, jobs and gigs remain list-only
  and still have no page of their own to share. Shops
  (`/shop/:slug`), courses (`/learn/:slug`), groups (`/g/:slug`), posts (`/p/:slug`)
  and tags (`/tag/:slug`) have their own pages.
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
| `57b0b10` | 7 — strict external media routing, linked post images, project publisher/detail pages and `0063` |
| `d87d5c2` | allowlist two confirmed synthetic test fixtures that the whole-history secret scan misidentified; no production secret was added |
| `83fd90d` | snapshot ready attachments at submit time so a completed post image cannot be omitted by a lagging React effect |

Earlier in the same pull request, and already described in their own documents:
`docs/messenger.md` for the messenger's hundred counted features,
`docs/auth-production-runbook.md` for the auth path, `docs/deploying.md` for the
deployment, and `docs/feature-registry.md` for the count. The earlier round ended
at **1,807** counted surfaces; after this project/media round the generated count
is **1,817**, regenerated with `node scripts/count-registry.mjs --markdown`.

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
   applies `0046`–`0063` three times over — so files already applied by hand are
   simply applied again, and the ledger catches up. This only restores legacy
   Supabase object access; new image bytes no longer depend on that bucket.
2. Read the end of the log. If it prints open `deployment_notes`, each line says
   what is missing and `docs/deploying.md` says where to put it. If it prints
   nothing, nothing is owed.
3. If the migrations were applied by hand and there is therefore no note to read,
   run `node scripts/db-push.mjs --check`, or paste the four-row query from
   `docs/deploying.md` into the SQL editor. Four `ok` rows and a `5 of 5` confirm
   the legacy bucket setup; new uploads use ImgBB or Cloudinary instead.

---

## 7. The round after: "Post images are broken and projects have no page"

The two reports arrived together:

1. Post photos were uploaded to Supabase Storage but did not show on the post page. New post, comment, chat and other ordinary images must go to ImgBB; important images must go to Cloudinary; **no new image bytes to Supabase Storage**.
2. The project directory was not a useful publishing system: no separate project page, no real cover upload and no multi-step post flow.

### 1 — Why images went to the wrong host, and why a saved post could lose them

`resolveProvider()` returned `supabase` as soon as `VITE_SUPABASE_URL` and its public key were present — before it even asked what kind of image was being uploaded. Supabase is always configured on the main site, so the old advertised ImgBB/Cloudinary routing was dead code. An ordinary `post-image` went to `storage/v1/object/public/media/<uid>/…`; it was then only as readable as the `media` bucket and its Storage policies. That is precisely the production setup the previous round found the workflow could not create with its applying role.

There was a second silent failure path: if the media row could not be written to `media_assets`, the tray could still mark the image attached with an empty `mediaId`; `savePost()` filtered that row out of `post_media` and published the text anyway. On read, a missing `media_assets` join became `url: ''`, which the browser treated as an image URL instead of telling the reader what failed.

### 2 — Why projects never became shareable pages

The database already stored a description, owner, cover URL, tech stack and star count, and the insert form already wrote those fields. The flow then sent the author straight back to `/projects`; the directory only rendered name/tagline/links/stars, and there was no route to retrieve one project by slug. `cover_url` was a hand-typed URL field, not an upload control. The SEO middleware and live sitemap likewise had no project detail path.

### What changed

- **A strict two-host media router.** The byte-upload code for Supabase Storage is removed from `upload.ts`; `resolveProvider()` now returns exactly the provider the purpose requires, or fails visibly when it is not configured. It never falls back across hosts. Post, comment, chat and other ordinary images go to ImgBB as a base64 `image` form field, with the API key in the URL. Avatars, profile covers, project covers and product images go to Cloudinary. Documents and voice notes also go to Cloudinary. Supabase holds the `media_assets` metadata row and SQL relationships only — no upload bytes.
- **No more "looks attached" without a database reference.** The attachment queue refuses to upload if the metadata database is unavailable, requires a real `media_assets` row, and `savePost()` rejects any draft image missing its durable asset id before it writes the post. `toPost()` drops a missing join rather than creating an empty image source. `MediaImage` tries the provider thumbnail, then the original, then a named accessible failure state, in both the feed and the lightbox.
- **A four-step project publisher** at `/create?kind=project`: basics → repository/technology/contributor settings → local cover preview and file selection → review and publish. Covers accept the supported image formats and limits, go to Cloudinary only on publish, and are recorded in `media_assets`. A successfully uploaded cover is held across a database retry instead of uploaded twice.
- **A public project permalink** at `/projects/:slug`: real database fetch by slug (not a 40-row list lookup), project cover, full description, owner/profile link, technology, licence, live star state, repository/demo links, contributor callout, canonical metadata and `SoftwareSourceCode` JSON-LD. The directory now shows covers and descriptions and supports search, popularity/recent sorting and a contributor filter. Search results and successful creation link to the project page.
- **SEO is present before JavaScript.** Migration `0063_projects_have_a_home_to_be_found.sql` adds project detail metadata to `seo_for_path()` and canonical project URLs to `sitemap_urls()` / `sitemap_sections()`. The Pages middleware injects the metadata for `/projects/:slug`; the sitemap worker accepts the projects section. `t35.mjs` proves all of this as an anonymous visitor. `t24.mjs` now reapplies `0063` as part of the idempotency proof.
- **The storage documentation now tells the truth.** `docs/deploying.md` separates the old `provider='supabase'` objects from the current external-host upload pipeline and names the exact build-time variables. The storage bucket is not a dependency for new uploads.

### Existing broken pictures: what code can and cannot repair

Existing post rows still point at the URLs they were saved with. If an old Supabase object still exists, the previous round's bucket/policy setup can make that legacy URL readable. If the object never made it to Storage, has been deleted, or is inaccessible to the owner, SQL cannot reconstruct the missing bytes; it has to be selected from the original and attached again. The new pipeline prevents the next picture from entering that state. It does **not** claim to magically recover a file whose bytes are gone.

### What the operator does now

1. After this branch is merged, run the normal database workflow so `0063` updates project SEO and sitemap functions; no new Storage bucket or policy is required for new media uploads.
2. Confirm the production **build-time** values in §5.1 of `docs/deploying.md`: `VITE_IMGBB_API_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, and `VITE_CLOUDINARY_UNSIGNED_PRESET`. Changing a Pages variable without rebuilding does not change the shipped JavaScript.
3. Publish a small test project through all four steps, open its `/projects/<slug>` page in a logged-out browser, then publish a post image. Its `media_assets.provider` should read `imgbb`; the project cover should read `cloudinary`; neither new row should say `supabase`.
4. For old broken pictures, restore access only if their bytes still exist in Storage; otherwise reattach the original in the post editor. The reader now sees a clear failure state rather than a browser's broken-image icon.
5. Rotate the high-risk credentials pasted into the conversation (database password, Cloudinary API secret and OneSignal REST key) before production use. They were not added to code or used for live uploads.

### Secret scan and CI follow-up

The first post-push GitHub scan found `generic-api-key` matches in two historical
files: `main-site/src/lib/push/support.test.ts` contains a synthetic public VAPID
value used only by a parser test, and `main-site/scripts/db-prove/t31.mjs`
contains a local-only sentinel used by the in-process database proof. Neither
fixture is used to send a real push or contains production key material. The
scanner examines history, so changing the old commits was unnecessary; commit
`d87d5c2` added exact file-path exceptions for these two fixtures to the existing
Gitleaks config, with the reasons recorded next to the configuration. The
configuration parses as TOML and its patterns match only those paths; GitHub's
whole-history secret scan now passes.

After the fix, all visible PR checks passed: app build, schema-from-nothing,
Cloudflare Pages, discovery, every app-quality job and Secret scan. The
production-apply job was skipped by design. No production migration, provider
upload or deployment was performed.

Final local verification on the code commit: `db:prove` **19/19**, Vitest **54 files / 706 tests**, lint/typecheck/Prettier clean, production build clean (**200** precache entries, **13** prerendered routes), and launch audit **103 passed / 0 failed / 4 recorded**. These are repository-level proofs; live provider credentials and production migration/deployment remain the owner's actions.

The code commit for this round is `57b0b1048afc9452fce8dd2dd17c045f1751d377`. The migration queue's next number is **`0064`**. The three directories still without detail pages are events, jobs and gigs; project pages are no longer on that list.

---

## 8. The post image upload completes but the published post has no image

### What the code review found

A second way for an image to disappear remained in the composer. `useAttachments`
marks the image `attached` and publishes its ready list through a React passive
effect. `ComposePage` copied that list into `draft.media` in another state update,
but the Publish handler saved `draft` directly. On the render where upload state
first became `attached`, a fast Publish click could run before the passive bridge
updated the draft. The text post would save successfully with an empty media list,
so `post_media` got no link even though the hosted upload and `media_assets` row
already existed. This is a code-level race matching the reported symptom; no
production database was inspected.

### What changed

- `withReadyMedia()` builds the submit snapshot from the attachment controller's
  current durable `ready` list. Both publish and save-draft now use that snapshot,
  rather than relying on the trailing effect. The same helper keeps the draft
  bridge consistent; the current queue order, alt text, and removals are reflected
  in the submitted `post_media` rows.
- Regression tests cover a stale draft that has not received a newly uploaded
  image yet, a removed image, and existing Cloudinary-hosted media passing through
  the post mapper/gallery. The uploader's routing contract did not change:
  ordinary new post images still go to ImgBB; important/profile/project/product
  images use Cloudinary. Existing Cloudinary URLs remain renderable when linked.
- An already-published post with no `post_media` link is not backfilled
  automatically. Edit that post and attach the original image again; no production
  data repair or live provider upload was performed here.

Local checks on `83fd90d`: Vitest **55 files / 710 tests**, lint and typecheck
passed, changed files pass Prettier, and the production build passed (**200**
precache entries, **13** prerendered routes). GitHub's build, schema-from-nothing,
Cloudflare Pages, app-quality, and Secret scan checks also passed; production apply
was skipped by design. PR #9 remains open for owner review and merge.

---

## 9. The same two reports, against a build that already had the fix

The two reports arrived again, in the same words: post images going to Supabase
Storage and not showing on the post page; projects with no page of their own, no
cover upload and no multi-step flow. Both had been the subject of §7 and §8, and
both fixes were merged into `main` at `e20f2da`.

### What the review actually found

The first thing checked was whether the merged code did what §7 claimed. It did.
`resolveProvider()` routes an ordinary image to ImgBB and an important one to
Cloudinary and returns null rather than crossing hosts; there is no Supabase
Storage byte-upload path left anywhere in the repository; `POST_SELECT` carries
`post_media` into every read that renders a post, so the feed, the permalink,
bookmarks and a tag archive all receive the same gallery; `toPost()` drops a row
whose join came back empty instead of emitting `src=""`; `PostCard` and
`PostPage` both render it; and `/projects/:slug` was a real route with a real
cover, a real fetch by slug and `SoftwareSourceCode` JSON-LD.

So the code was not the problem, and saying "already fixed" would have been both
true and useless. What the review found instead were three things that were
genuinely still wrong, and that between them explain a production site behaving
as though nothing had been done.

**1. The upload still depended on a build nobody had rebuilt.** Both hosts' keys
were read from `import.meta.env`, so they were compiled into the JavaScript.
§7's own operator list ends with "changing a Pages variable without rebuilding
does not change the shipped JavaScript" — which means that on the deployed site,
where those variables were set in the dashboard and no rebuild followed, every
upload still answered `media.errors.notConfigured`. On a phone that is a toast
you miss, and what is left on screen is a composer that appears not to work.

**2. The ImgBB key was published.** `VITE_IMGBB_API_KEY` is a secret, not a
publishable key like the Cloudinary pair. Shipping it in the bundle hands
anybody the ability to spend that account's quota and fill it with whatever they
like. The repository had documented this as "public by design", which is true of
Cloudinary's unsigned preset and not true of an ImgBB API key.

**3. Projects were write-once.** `public.projects` has carried an owner-update
and an owner-delete policy since migration 0014, with the table grants to match.
Nothing in the application ever offered either. A published project could not be
corrected, could not be taken down, and held exactly one picture: a cover and no
gallery, so a member could show a card and never the product.

### What changed

- **Uploads go through the site's own edge.** `POST /api/media/upload` verifies
  the caller's Firebase ID token with Web Crypto against Google's published
  secure-token certificates, validates the file, and uploads it to the host its
  purpose requires — reading `IMGBB_API_KEY`, `CLOUDINARY_CLOUD_NAME` and
  `CLOUDINARY_UNSIGNED_PRESET` from `context.env` at *request* time. Setting one
  in the dashboard now takes effect on the next upload, with no rebuild. The key
  never reaches a browser. `GET /api/media/providers` answers with three
  booleans and no secret, so the client can plan instead of guess.
- **One routing table, two readers.** `src/lib/storage/media-contract.ts` holds
  the kinds, the limits, the purposes and `chooseProvider()`, and has no imports
  at all, so both the browser and the edge read the same answer. A router
  duplicated across a network boundary is a router that eventually disagrees
  with itself, and that disagreement looks exactly like a picture uploaded
  somewhere the reader cannot see it. `t28` now asserts the edge imports the
  contract rather than restating it.
- **The direct transport survives as a fallback, and only as one.**
  `planUpload()` is pure and decides the route before a byte moves. A refusal
  *from the host* surfaces its own reason and is never retried through the other
  transport, because that would upload the same picture twice; only a missing
  endpoint — 404, or a 200 whose body is the application shell, which is what a
  static host answers — falls back. The capability probe is warmed while the
  browser is idle, so the first attach does not pay for it.
- **Projects became manageable.** `/projects/:slug/edit` opens the same
  five-step flow on what is already published, seeded from the row, with the
  gallery seeded as attached so saving keeps the pictures that are already
  there. The owner gets Edit and Delete on the project page, behind a
  confirmation. `updateProject()` deliberately does not write the slug: it is
  the permalink the sitemap and every shared link point at. `deleteProject()`
  reads the deleted row count, because row level security makes a stranger's
  delete succeed against zero rows — reporting that as a save would have sent
  the author back to a page showing the old values with a "saved" toast.
- **A project has a gallery.** Migration `0064` adds `project_media`, the same
  join onto `media_assets` that `post_media` is, with the same rule that the
  bytes live at the external host and only the reference lives here. Its update
  privilege follows the shape 0042 established and exists to be followed:
  granted per column, `("position", alt_text)`, never at table level. Granting
  the table and revoking the two foreign keys afterwards — the obvious reading,
  and the one this migration was first written with — protects nothing at all,
  because a table-level grant covers every column and a column-level revoke
  cannot subtract from it. `t36` caught that on its first run, which is the
  argument for proving a migration against a real engine before deploying it.
- **The publishing race is closed at the source.** The gallery travels as a
  mutation variable captured in the click handler, not read from a trailing
  effect, and Publish is held while an upload is still in flight. A picture on
  its way up is a picture that save would drop, and on an edit dropping one
  deletes a screenshot the project already had.

### Verification

Local, on this commit: Vitest **56 files / 735 tests**; `db:prove` **20/20**
harnesses, including the new `t36` (14 checks) and `t28` grown from 39 to 43;
typecheck clean for both the app and `functions/`; ESLint clean at
`--max-warnings 0`; Prettier clean; production build clean (**203** precache
entries, **13** prerendered routes); launch audit **103 passed / 0 failed / 4
recorded**; counted features **1851**.

Two of those numbers moved because a check was wrong rather than because code
was. `t28` asserted on the text of `upload.ts` that it contained
`'project-cover'`; the routing table had moved to the contract module, so the
assertion was reading the wrong file, and it now reads both. The launch audit's
`any`-type rule matched the substring inside two of this round's own comments
("as anybody", "if it has any"); the comments were reworded rather than the rule
weakened.

### What the operator does now

1. Apply `0064` with the normal database workflow. It creates one table, its
   index, two policies and four grants, and is idempotent — `t24` applies it
   three times over.
2. Set the three media variables in Cloudflare Pages → Settings → Environment
   variables, as **request-time** secrets this time: `IMGBB_API_KEY`
   (encrypted), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UNSIGNED_PRESET`. Confirm
   `FB_PROJECT_ID` is set, or the endpoint cannot verify who is uploading and
   answers 401. No rebuild is needed for these to take effect.
3. Check what the deployment believes: `curl -s
   https://www.bsdc.info.bd/api/media/providers` should answer
   `{"proxy":true,"imgbb":true,"cloudinary":true}`. An HTML page instead of JSON
   means the Functions are not deployed and only the bundle fallback exists.
4. Deploy this build. Then attach a picture to a post and publish one project
   through all five steps. `media_assets.provider` should read `imgbb` for the
   post image and `cloudinary` for the cover and the screenshots; no new row
   should say `supabase`.
5. Once the proxy is confirmed working, **remove the three `VITE_` media
   variables and rotate the ImgBB key.** That key has been in a public bundle,
   and rotating it is the only thing that un-publishes it.
6. For projects published before this round: they were never editable, so any
   that need correcting can now be corrected from `/projects/<slug>/edit`. None
   are backfilled with a gallery automatically; the owner adds screenshots.

Still the owner's to do, and unchanged from §7: the high-risk credentials pasted
into the conversation (database password, Cloudinary API secret, OneSignal REST
key) should be rotated before production use. None were added to code.

---

## 10. What a crawler was told about pages that are not for crawlers

**Found while** checking whether the editor added in §9 — `/projects/<slug>/edit`
— was safe to leave in an index. It was not, and it was not the only thing that
was not.

**Two lists decided which pages a search index may hold, and they had drifted
apart.** `robots.txt` is built at deploy time from the `disallow` array in
`src/lib/seo/static-routes.json`, and carried fourteen prefixes. The `<meta
name="robots">` a crawler actually reads is decided by the default branch of
`public.seo_for_path`, which `functions/_middleware.ts` calls for every path,
and it noindexed six of them: `messages`, `settings`, `notifications`,
`bookmarks`, `vendor`, `auth`.

Everything in the first list but not the second was served to a crawler as
`index,follow` **and** was `Disallow`ed at the same time. That is the one
combination reliably capable of putting a bare, contentless URL in a search
index: `robots.txt` keeps the crawler away from the only page that could have
told it to go away. Probed against a real engine, `/compose` and `/cart` both
answered `index`.

The new editor answered `index` too. It resolves to no project — its slug
arrives as `<slug>/edit`, which matches no row — so it fell through to the
default branch and was handed the site's generic description, a canonical
pointing at itself, and permission to be indexed. One empty indexable copy of
every permalink on the platform, for each project published.

**Auditing every route behind `RequireAuth` against both lists found three more
pages in neither:** `/trash`, a member's deleted posts; `/ads`, a vendor's ad
console; and `/offline`, the shell a service worker shows with no network, whose
entire text is that there is no network. All three were indexable with the
generic description attached.

`/verify` was left alone deliberately, because it looks like a member route and
is not. `ROUTES.verify` is `/auth/verify`; `/verify` is
`ROUTES.verifyCertificate`, the public page that checks whether a certificate or
a notice is genuine, and the build prerenders it. Disallowing the word would
have removed a real public page from the index while leaving the private one
exactly where it was.

**Two ways this rule goes wrong by accident, both of which the first attempt
did:**

- A prefix that names an area matched every word beginning with those letters.
  The old pattern was `^/(…|auth)` with no boundary, so it also caught
  `/author/…`. A rule that noindexes by accident is as much a defect as one that
  misses. The prefixes are now anchored with `(/|$)`.
- An editor pattern written `/*/edit` cannot tell an editor from a permalink. A
  member is free to publish a project whose slug is `edit`, so `/projects/edit`
  is a real permalink that must stay crawlable, while `/projects/edit/edit` is
  that project's editor and must not. Three segments are needed, not two, and
  `^/[^/]+/[^/]+/edit$` reads the same way in SQL and in TypeScript.

**What changed.** Migration `0065` replaces `seo_for_path` with its signature and
grants unchanged. `static-routes.json` gains `/create`, `/trash`, `/ads`,
`/offline` and the editor pattern, and `isPrivatePath()` in `src/lib/seo/engine.ts`
learned to read a pattern as well as a prefix, so a browser and a crawler are
told the same thing about the same URL.

**How it is proved.** `scripts/db-prove/t37.mjs` does not restate either list. It
reads the JSON that `robots.txt` and the browser-side engine are built from and
asks the database the same question about every entry in it, then checks the two
cases that break by accident: a project slugged `edit` keeps its crawlable
permalink while its own editor does not, and `/author/raha`, `/authentic-tools`,
`/createbridge` and `/cartography` stay indexable because a prefix names an area.
It also asserts the live sitemap lists projects as permalinks and never advertises
an editor. 53 checks. Adding a private area to one list and forgetting the other
now fails here, which is the only reason the two can be allowed to live in two
places at all. `src/lib/seo/engine.test.ts` pins the TypeScript half to the same
wording.

**What the operator does.** Apply `0065`. It replaces one function in place and
is re-runnable — `t24` applies it three times over. Nothing is backfilled and
nothing is deleted; a URL already in an index leaves it on Google's next crawl,
which is why the `noindex` is served rather than only `Disallow`ed.

---

## 11. One cover control, and an author who could not change their own cover

**Found while** giving events a cover. An event asked for a *link* to a picture
rather than a picture: `create.fields.coverUrl`, an `<input type="url">`. On a
phone that means finding an image, hosting it somewhere else, copying the
address and pasting it back into a form — and the address could point at
anything, including a host that later deletes it. Posts and projects had real
uploads. Events were the one listing type never given one.

**The routing for it already existed and nothing used it.** `media-contract.ts`
declares a `'cover'` purpose and lists it among `CLOUDINARY_PURPOSES`, so a cover
is an important image and goes to Cloudinary. Grep for `purpose: '` across the
application returned six call sites and not one of them said `'cover'`. The
decision had been made and never wired up.

**What changed.** Two pieces, extracted rather than copied:

- `src/components/media/CoverPicker.tsx` — the control. It takes its wording as
  a `labels` object from the surface that owns it, so a project's cover step
  keeps its own heading while the markup exists once. A second copy would be a
  second place for the file input to lose its accessible name, or for a preview
  to start trusting a URL the database has not recorded yet.
- `src/components/media/use-cover-upload.ts` — the upload semantics. Validate,
  preview from the local bytes at once, and move the bytes only when the member
  commits: a cover belongs to a form that may never be submitted, and somebody
  who abandons half a project should not leave a picture at a host they were
  never told about. The completed upload is retained across a retry, so a slow
  phone whose database briefly refused a row does not send the same picture
  twice to get the row it was already owed; and it refuses to hand back a URL
  the database has no `media_assets` row for.

Three call sites now use them: the project wizard's cover step, the project
editor, and the event form. Two independent copies of the prepare-once logic —
one in `CreatePage.tsx`, one in `ProjectEditPage.tsx` — became one hook. The
hook decides no routing of its own; it passes its `purpose` to the same contract
the browser and the edge both read.

**The bug that fell out of composing them.** On the editor, the preview falls
back to the cover that is already published, so an author sees their own picture.
But both buttons in that markup required a *chosen file* — the replace button
because it only rendered beside a file, the remove button because it lived in the
same caption. An author correcting a project therefore looked at their own cover
with no button that did anything, and had no way to change it or take it away.
They could add a picture; they could not replace or remove one.

The control now knows the difference between the two states. With a file chosen,
the caption names the file and removing it puts the form back to no picture. With
the published cover showing, the caption says "Current cover", and removing it
drops it from the record — which writes an empty `cover_url`, a column the owner
has been allowed to write since `0042`, and which `seo_for_path` already falls
back from to the site's own open-graph image. Removing the replacement still puts
the published cover back rather than deleting it, which is the distinction a
member cannot be expected to guess at.

**Words.** `create.fields.coverUrl` is gone. The cover's wording moved to
`create.cover.*` and is shared by both surfaces, in Bangla and English, with one
new string for the published state. `src/test/i18n.test.ts` — which walks every
non-test source file and requires every `t()` literal to exist in both bundles —
named all seven references that had to move before any of them were moved.

**How it is proved.** `CoverPicker.test.tsx` (10 tests) covers the accessible
name of the input, the absence of any field to paste an address into, the accept
list matching what the contract routes, the local preview, progress appearing
only while bytes move, and both remove meanings including the one that must not
delete a published cover. `use-cover-upload.test.tsx` (10 tests) covers the
refusal of a document, the purpose that reaches the transport, `null` when
nothing was chosen, uploading once across a retried publish, recording again
without uploading again after a refused row, a fresh upload for a genuinely
different picture, revoking the object URL it made, and `reset` leaving nothing
behind for the next listing.

**Verified.** Vitest 58 files / 757 tests (was 56 / 735). `db:prove` 21 of 21
harnesses, the new `t37` at 53 checks. Typecheck clean for the application and
for `functions/`. ESLint clean at `--max-warnings 0`. Prettier clean. Production
build clean at 203 precache entries and 13 prerendered routes, with the generated
`robots.txt` carrying all nineteen rules including `Disallow: /*/*/edit`. Initial
JavaScript 226 KB gzip against the 250 KB budget — unchanged, because the new
hook imports the transport dynamically and only from pages that are themselves
loaded on demand. Launch audit 103 passed / 0 failed / 4 recorded. Counted
features 1852, translated strings 1671 per language.

The migration queue's next number is **`0066`**. §8's record says `0064` and was
right when it was written; `0064` and `0065` have since been taken.
