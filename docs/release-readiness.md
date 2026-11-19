# Platform release readiness

Date: 2026-10-27. Branch: `arena/dd8d1419-bsdc`.

**Decision: not approved for production deployment yet.** Local quality checks
pass across the platform, but known security/correctness blockers and unperformed
staging acceptance still prevent a whole-platform readiness claim. A subsequent
public browser smoke batch passed 47 Chromium desktop/mobile-emulation checks;
see [browser acceptance](browser-acceptance.md) for its deliberately limited scope.

## Reproducible local gate

From the repository root:

```sh
node scripts/release-check.mjs --install
```

The runner discovers all package manifests, installs the corporate kit before
consoles that import its source, uses `npm ci` where a lockfile exists, and runs
required typecheck, lint, tests, build and source formatting. Main-site also runs
Functions formatting and all database proofs. A failed command or missing required
script produces a nonzero exit code. Logs and `summary.json` go to ignored
`.release-check/`. No environment values are printed by the runner itself.

For a focused rerun, with dependencies already installed:

```sh
node scripts/release-check.mjs --apps=main-site
```

Optional `--output=/absolute/path` chooses a log directory. Do not place logs or
provider credentials in tracked source. Packages without lockfiles still resolve
ranges: these checks do not establish reproducible production dependency versions.

## Executed evidence

Full installation and quality run: **98/98 gates passed across 16 packages**.
After the final main-site endpoint tests/auth-proxy changes, its seven quality
and database gates were rerun and all passed. Other packages were unchanged.

| Package              | Passing unit tests | Typecheck / lint / build / format |
| -------------------- | -----------------: | --------------------------------- |
| admin-site           |                 38 | Pass                              |
| android-app          |                 30 | Pass                              |
| certificate-site     |                 31 | Pass                              |
| config-site          |                 16 | Pass                              |
| connect-site         |                 14 | Pass                              |
| corporate-kit        |                  6 | Pass                              |
| customize-site       |                 16 | Pass                              |
| ip-site              |                 18 | Pass                              |
| main-site            |              1,080 | Pass                              |
| moderator-site       |                 19 | Pass                              |
| notice-site          |                 25 | Pass                              |
| performance-site     |                 28 | Pass                              |
| status-site          |                 14 | Pass                              |
| users-admin-site     |                 16 | Pass                              |
| users-moderator-site |                 18 | Pass                              |
| vf-site              |                 17 | Pass                              |
| **Total**            |          **1,386** |                                   |

Database: **27/27 harnesses passed**, replaying migrations in local PGlite.
Android build here means the TypeScript shell build, **not** a native APK/AAB,
signed release, emulator or device acceptance.

## This batch's runtime hardening

- Shared bounded body reader limits actual streamed bytes, not a trusted
  Content-Length. It cancels excess streams and does not parse them.
- JSON APIs for claims, telemetry, push content and reverse geocoding require
  objects and bound payload bytes, depth, collection width and traversed nodes.
- Telemetry ignores malformed array entries instead of throwing on null values.
- Multipart uploads are capped at 25 MiB plus 64 KiB envelope before parsing;
  existing per-kind limits remain enforced after parsing.
- Firebase auth proxy POST bodies are capped at 1 MiB.
- New tests cover lying/missing lengths, chunk cancellation, UTF-8 byte counts,
  malformed JSON, excessive structure, invalid telemetry entries and endpoint
  rejection before upstream work. Edge endpoint tests now run in the normal suite.

Bounds prevent unbounded buffering; they are not rate limits, malware scanning,
magic-byte validation, request deadlines or provider quotas.

## Media reliability batch — 2026-11-08

The reported production symptoms were "uploads are not configured for this
deployment" on a deployment whose ImgBB key was set, and pictures that loaded on
a first visit, then stopped loading and loaded again only after clearing site
data. Both were reproduced from the source and fixed; the full account is in
[picture delivery](picture-delivery.md) and [upload pipeline](upload-pipeline.md).

What changed, each with a test that fails without it:

| #   | Defect                                                                                                                                                                       | Where                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | A pre-flight probe could veto an upload, and its negative answer was cached for the life of the tab                                                                          | `lib/storage/upload.ts`           |
| 2   | The page believed the picture cache was `bsdc-images-v4`, the worker wrote `bsdc-images-v5`, so the page deleted the live cache (every load where `localStorage` is blocked) | `lib/media/cache-names.ts`        |
| 3   | Cross-origin pictures arrive `no-cors` as opaque responses, so the picture cache was never written for a single real image — every paint re-downloaded the file              | `src/sw.ts`                       |
| 4   | A fresh cache hit revalidated in the background with `cache: 'no-store'`, re-downloading every image on the feed on every visit                                              | `src/sw.ts`                       |
| 5   | `_headers` gave `/media/i` a 7-day `immutable` policy that cannot be scoped by status, so a 502/504 could be remembered as the picture                                       | `public/_headers`                 |
| 6   | A refused answer (429, HTML error page) was passed through with its cache headers, so the browser could remember the failure                                                 | `src/sw.ts` → `uncachedHeaders`   |
| 7   | Neither the worker nor the proxy checked the bytes, only the declared content type                                                                                           | `lib/media/image-signature.ts`    |
| 8   | `MediaImage` offered the proxy rung to hosts the edge cannot fetch, spending four guaranteed-failure requests per picture                                                    | `components/media/MediaImage.tsx` |
| 9   | Every `<img>` defaulted to eager loading; a twenty-post feed started twenty downloads                                                                                        | `components/media/MediaImage.tsx` |
| 10  | The home page preloaded a full-size cover at `fetchpriority="high"` that no element ever drew                                                                                | `components/content/PostCard.tsx` |
| 11  | The page healed the picture cache twice concurrently, racing itself                                                                                                          | `src/main.tsx`                    |
| 12  | The upload endpoint trusted a client-declared content type                                                                                                                   | `functions/_media.ts`             |

Deployment verification added: `scripts/verify-media.mjs` (also
`main-site npm run media:verify`) asks a live deployment the four questions that
only a live deployment can answer, and the deploy workflow now fails when
`POST /api/media/upload` does not answer `401` — the one check that distinguishes
"uploads are broken" from "the Pages Functions were never uploaded".

### Executed evidence for this batch

- Whole platform: `node scripts/release-check.mjs --install` → **104/104 gates
  passed across 17 packages** (typecheck, lint, tests, build and formatting for
  each; Functions formatting and the database suite for `main-site`).
- `main-site` re-run on the final tree: **7/7 gates passed**, **88 test files /
  1,080 tests**, production build with 212 precache entries and 13 prerendered
  routes; Prettier clean for `src/` and `functions/`.
- The picture strategy was lifted out of `src/sw.ts` into
  `src/lib/media/image-strategy.ts` so each rule above is asserted directly,
  with 16 tests over a fake `CacheStorage` and a fake network: a fresh entry is
  served without a request, CORS is tried before `no-cors`, an opaque body is
  never stored, an HTML page under `image/*` is never stored, a 206 or a stub is
  never stored, refusals arrive `no-store` and without `expires`/`etag`, an
  offline miss is a `504`, a stale entry is served inside twice the trust window
  and deleted past it, the ceiling evicts the oldest entry, and a browser
  without the Cache API still gets its pictures. A further test reads `sw.ts`
  and fails if the worker stops delegating and grows its own copy again.
- Database: **39/39 PGlite harnesses passed**.
- Pages Functions exercised against a real local edge runtime
  (`wrangler pages dev`, Miniflare, 2026-11-08):
  - `GET /api/health` → `200 {"media":{"upload":true,"host":"imgbb"}}`
  - `GET /api/media/providers` → `200 {"proxy":true,"imgbb":true}`
  - `POST /api/media/upload` anonymously → `401 {"ok":false,"errorKey":"media.errors.signInRequired"}` — the endpoint exists and refuses correctly
  - `GET /media/i?u=<foreign host>` → `400`, `Cache-Control: no-store`
  - `GET /media/i?u=<imgbb>` with the host unreachable → `504`,
    `Cache-Control: no-store` (a failure is never cacheable)

Not claimed: a real upload to ImgBB, a real image fetched through `/media/i`, or
browser acceptance. This environment has no outbound access to Cloudflare,
ImgBB, Firebase or Supabase, and no member credentials were used. Those three
remain the acceptance steps a person must run against staging with
`node scripts/verify-media.mjs`.

## Remaining release blockers

Track implementation details in [the recovery plan](production-recovery-plan.md).
Do not waive these because local builds pass:

1. Complete authorization/privacy review of elevated reads and metadata,
   independent Firebase-project identities, private realtime presence/broadcast,
   and legacy permission paths that do not use current account authority.
2. Make multi-step publishing transactional and preserve existing poll votes on
   edits; test retries and rollback.
3. Upload signature validation is now enforced at the edge (magic bytes, not the
   declared type) and the upload has an upstream deadline and one bounded retry.
   Still outstanding: distributed per-account quotas, and a JWT
   validation/revocation strategy; validate corporate session bootstrap.
4. Validate Firebase profile/cache rules and indexes in emulators. Verify push
   destination safety and per-device delivery behavior.
5. Apply migrations 0068–0071 in order to a backed-up staging environment;
   rehearse restore and verify deployed schema/grants rather than assuming local
   PGlite proves provider configuration.
6. Run public/member/staff/demoted/suspended browser journeys against actual
   staging headers, Functions and providers. Include console/network errors,
   mobile layouts, accessibility, account switching and cache isolation.
7. Verify every application's deployment bindings, domains, OAuth redirect
   allowlists, CSP, secrets, database identity configuration, monitoring and
   operational ownership. Finish pending review/admin workflows.
8. Build/sign/test native Android artifacts separately before mobile release.

No production migration, provider mutation, deployment or real-browser acceptance
was executed in this batch. Logs are local execution evidence, not a penetration
test or guarantee that the deployed platform has no defects.

## Play Store submission — what the repository now settles

Added 2026-11-18. Everything below is a property of this repository, held by a
test or a checkpoint, and recorded against the schema in
[play-store-compliance.md](play-store-compliance.md).

**Done here**

- Privacy policy at `/privacy`, bilingual, public, no sign-in.
- Terms of service at `/terms`, bilingual, public, no sign-in.
- Deletion URL at `/account-deletion`, bilingual, public — the one Play's Data
  safety section asks for, which works for a reviewer with no account and for a
  member without the app.
- Self-service account deletion in both clients:
  `public.delete_my_account()` (0119), Settings → Delete account on the web and
  Android, with a typed `DELETE` confirmation and copy that says what is kept as
  well as what is removed.
- Copyrighted-material and moderation behaviour described in the terms; report
  and appeal paths already existed and are now named there.
- Sensitive permissions reviewed: `RECORD_AUDIO` removed (voice search hands
  the microphone to the system recogniser), camera and location declared
  optional, background location never declared, and the manifest guard in CI
  fails if the microphone permission returns.
- Cleartext traffic refused, backups disabled for the database and preferences,
  R8 shrinking and resource shrinking on, `targetSdk 35`.
- Data safety answers written down against the schema, including the third
  parties that receive data (Firebase, Supabase, Cloudflare, ImgBB).

**Still owner-side, and cannot be done from this repository**

1. Fill the Data safety form in the Play Console from
   [play-store-compliance.md](play-store-compliance.md) — the table there is the
   answer sheet.
2. Declare the deletion URL as `https://www.bsdc.info.bd/account-deletion` and
   the policy as `https://www.bsdc.info.bd/privacy`.
3. Request the `USE_FULL_SCREEN_INTENT` grant for the order alarm, or accept the
   fallback (a heads-up notification) — the app works either way.
4. Upload the signed AAB from the release workflow and complete the content
   rating, ads declaration ("no ads") and target audience questionnaire.
5. Run the pre-launch report and read it: it is the only automated check that
   exercises real devices, and it is free.

## Performance budget — Lighthouse 95+ on every public page

The measurement that started this work was a mobile Lighthouse run on `/`:
**performance 63**, accessibility 96, best practices 96, SEO 92. The causes were
not vague. Each one is named below with the change that removed it, and every
change has a checkpoint in `scripts/audit.mjs` (checks `F-11` … `F-21`) so the
next commit cannot quietly undo it.

| Symptom (mobile, `/`)                               | Cause                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLS **0.43**                                        | The footer is 773 px tall on a phone and sat directly under the hero while the feed was still loading; when the feed arrived the footer moved by the height of the page.                                                                             | `AppShell` reserves `min-h-[100dvh]` for `<main>` on every page with a footer, so the footer starts below the fold and its arrival cannot move anything on screen. CLS is now 0.                                                                                                                                                                                        |
| LCP **4.1 s**, and 3.2–3.8 s on every text page     | The largest thing on screen was painted by React, not by the HTML: the prerendered shell was a bare `<h1>` and one sentence — smaller than the page that replaced it — so the browser recorded the application's later paint as the largest content. | The shell is now styled with the page's own classes _and_ quotes the page's opening paragraphs (`opening` in `static-routes.json`, held word-for-word against the English bundle by `app-routes.test.ts`). The first paint is the page. LCP 1.8 s everywhere.                                                                                                           |
| Render-blocking **150 ms**                          | One `<link rel="stylesheet">` in front of the first pixel.                                                                                                                                                                                           | `scripts/prerender.mjs` inlines the single design-system stylesheet into every page (`inlineStyles`); the request is gone rather than deferred.                                                                                                                                                                                                                         |
| Unused JavaScript **91 KiB**, 480 kB entry chunk    | Both language bundles (354 kB of copy) and the schema library were in the entry chunk, so every visitor parsed Bangla and English before anything could render.                                                                                      | `src/i18n/index.ts` loads one language as its own chunk; the environment check validates two values by hand instead of shipping a schema library (`src/lib/env.ts`); the router's guard imports a tiny module instead of the profile schema; the app bar's unread badge no longer drags the messaging layer in. Entry chunk: 480 kB → 195 kB raw (161 kB → 61 kB gzip). |
| Second round trip before the first screen           | Routes are `lazy()`; the browser learned the route's chunk only after the entry script ran.                                                                                                                                                          | The build manifest names each route's chunk and the prerender writes `<link rel="modulepreload">` for it (`modulePreloadHrefs`).                                                                                                                                                                                                                                        |
| Long main-thread tasks after paint (TBT 200–300 ms) | The toast library, the service worker registration and a `framer-motion` animation loop all ran during the first screen.                                                                                                                             | Toaster is a lazy chunk; the worker registers on `load` + idle; the marketplace's decorative glow is a compositor CSS animation; the footer is skipped for layout/paint until it is near the viewport (`content-visibility`).                                                                                                                                           |
| Accessibility **96**                                | `#1877f2` as _text_ on our surface is 3.9:1 (needs 4.5:1). A logo link and a language button had accessible names that did not contain their visible text.                                                                                           | New `--bsdc-blue-text` token (6.1:1) for copy, with `--bsdc-blue` kept for fills; the logo's name is its visible lockup; the language button's action is in a visually hidden span. Accessibility is 100 on every route.                                                                                                                                                |
| SEO **92**                                          | One link with the text "Learn more", and legal pages were missing from the prerender manifest.                                                                                                                                                       | The hero button is "About the community"; `/privacy`, `/terms` and `/account-deletion` are prerendered, in the sitemap, and crawlable without JavaScript. SEO is 100 on every route.                                                                                                                                                                                    |

**Measured result** — one full run of `node scripts/lighthouse.mjs` on
2026-11-18, mobile, simulated Slow 4G, 4× CPU (the Lighthouse default), five
samples per route in a fresh browser, median:

| Route                                                 | Performance | Accessibility | Best practices | SEO |
| ----------------------------------------------------- | ----------- | ------------- | -------------- | --- |
| `/`                                                   | **95**      | 100           | 100            | 100 |
| `/marketplace`                                        | **95**      | 100           | 100            | 100 |
| `/groups` `/events` `/playground`                     | 96          | 100           | 100            | 100 |
| `/jobs` `/projects` `/verify`                         | 97          | 100           | 100            | 100 |
| `/guidelines` `/privacy` `/terms` `/account-deletion` | 98          | 100           | 100            | 100 |
| `/about` `/contact` `/freelance` `/learn`             | 99          | 100           | 100            | 100 |

**Every route clears every floor.** The two lowest medians are `/` and
`/marketplace` at 95: both render the feed, which is the largest React commit in
the product, and on a shared machine `/` ranges 94–98 sample to sample. Desktop
is 100 in every category on `/` and never below 96 elsewhere.

**How to re-measure**

```bash
cd main-site && npm run build          # dist/ with prerendered HTML
npm install --no-save lighthouse chrome-launcher
CHROME_PATH=/path/to/chrome npm run lighthouse            # every public route, median of 5, fresh browser per route
node ../scripts/lighthouse.mjs --routes /,/privacy --verbose   # samples, not just the median
```

The script runs a fresh browser for every route, because one Chrome reused across
sixteen routes and eighty audits measures a browser that is no longer the state a
visitor's is: on a quiet machine the cost was invisible, on a shared one it moved
`/` from 96 to 93 depending on where in the sweep it fell. It asserts the median of
**five** samples — with three, one slow run moves the median; with five it takes
two — and `--verbose` prints every sample, so a low median can be read as the
regression or the shared machine it actually is rather than guessed at.

One reading that is _not_ evidence of a defect, so nobody chases it: **the score
of a single run.** On a shared machine the same commit measures 94–98. The budget
is the median of five samples in a fresh browser, which is what the script asserts.

### Best practices was 96 on data pages, and it was two separate things

The first was the measurement. This server has no Pages Functions, so it answered
`/api/*` with a 404, and Chrome logs a 404 as a console error; Lighthouse then
reported `errors-in-console` against the page for something the page had not done.
`scripts/lighthouse.mjs` now answers `/api/*` with an empty JSON object, as the
deployment does.

The second was real, and the measurement found it. Chrome's console said the
request was `/api/media/providers`, and it was made **on every page view, at idle,
whether or not anybody was going to upload anything**: the upload-capability probe
was warmed at startup "so the first member to attach a picture does not pay for the
question". The answer never gated an upload — the endpoint is the only thing that
can see the key, and `uploadMedia` sends the file and reads the refusal — so the
warm was one request per reader on mobile data for no answer anybody used.

Measured before and after on `/`, `/jobs` and `/marketplace` in Chromium: before,
each route logged one console error and one `/api/media/providers` request; after,
**no console error and no `/api` request at all**. `C-31` holds it, and the browser
smoke now fails on any console error that is not explained by a stubbed `/api`
response — so the next one cannot hide.

## A comment can carry a picture (0120)

The feed has accepted photographs since the composer was written, and the upload
edge has understood a `comment-image` purpose for longer than that. The database
did not, so a member answering "what does the damage look like?" had to describe
it in prose.

| Decision                                                      | Why it is that way                                                                                                                                                                                                                                                                                         | Held by                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| One picture per comment, stored as four columns on `comments` | A thread is the hottest read in the product — 500 rows, one request, shaped into a tree. A join table there is a cost every reader of every thread pays to serve the minority of comments that have a picture.                                                                                             | `0120`, `t79`              |
| The URL must be one this member uploaded                      | A comment is a place a stranger can write. Without this check `image_url` lets them make every reader of the thread fetch an address of their choosing, with their IP, in their browser, on a page the platform vouched for. The trigger compares against `media_assets`, which already records the owner. | `t79`                      |
| The sweeper was taught that a comment is a reference          | `media_pending_purge` looked at `post_media`, `messages` and the profile columns. A picture attached only to a comment looked orphaned, and an orphan older than a day is deleted at ImgBB — leaving a broken picture nobody can repair.                                                                   | `t79`                      |
| A comment with a picture may have no words                    | The old body rule demanded a character. It now demands one _unless_ there is a picture, and `t79` asserts both halves.                                                                                                                                                                                     | `t79`                      |
| Intrinsic width and height travel with the picture            | So the thread reserves the box before the bytes arrive. Without it every comment below the picture jumps down once it loads — the same shift the performance budget refuses.                                                                                                                               | `comment-picture.test.tsx` |
| A picture with no description still has a name                | A thread is read aloud and with a screen reader. The description is optional to write and never optional to render.                                                                                                                                                                                        | `comment-picture.test.tsx` |

Both clients send it the same way: the web form uploads with
`purpose: 'comment-image'` and posts the columns, and Android builds the identical
row through `CommentPayload` (unit-tested in `CommentPayloadTest`). Android renders
it through `BsdcImgbbImage` with the ratio reserved and the same lightbox the post
photographs use; the web renders it through `MediaImage` with the same
`srcset`-then-lightbox path as the messenger.

## "Your role does not allow this action" was not about the role

A member attached a picture to a comment and was told their role did not allow it.
Their role was fine. The comment box uploaded the bytes to ImgBB and never wrote
the row that says who uploaded them, and `prepare_comment` (0120) accepts a picture
only when `media_assets` already records it against the author. The refusal was
real; the sentence was about the wrong thing.

| Decision                                                       | Why it is that way                                                                                                                                                                                                                                                                                                                                                                                                        | Held by                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Uploading is one operation: `uploadAndRecord`                  | `uploadMedia` returns a URL and says nothing about whether a row exists for it. Two calls, one forgotten silently, is how this shipped. The helper does both or fails, and it is what the comment box, the vendor catalogue and the shop settings now call.                                                                                                                                                               | `upload-and-record.test.ts`                   |
| The sign-in check comes before the upload                      | A signed-out caller would otherwise spend an upload on a row that cannot be written — the member's data allowance for nothing, and an orphan at the host.                                                                                                                                                                                                                                                                 | `upload-and-record.test.ts`                   |
| The record's absence is a failure, not a warning               | A chat message may be sent with an unrecorded picture (the bytes are already there and losing the message is worse), so `MessageComposer` records best-effort. A comment cannot be: the database refuses it. The two surfaces differ on purpose, and each test says why.                                                                                                                                                  | `comment-picture.test.tsx`, `MessageComposer` |
| The two `42501` refusals from `prepare_comment` have sentences | `42501` mapped to "your role does not allow this action", which is true of the code and false of the situation. "That picture did not finish attaching to your account" and "Comments are closed on this post" both say what happened, in both locales.                                                                                                                                                                   | `errors.ts`                                   |
| `C-33` holds every upload surface                              | Seven files upload; seven record. A grep-based checkpoint cannot prove the call succeeded, but it does catch the next surface that forgets — which is exactly how this one was written.                                                                                                                                                                                                                                   | `C-33`                                        |
| Android never had the bug, and that is the reason to check     | Its `BsdcMediaRepository.upload` records inside the same function as the upload, so there was no second step to forget. The web had the two steps separated and paid for it.                                                                                                                                                                                                                                              | `BsdcMediaUploadContractTest`                 |
| Every error key is proved to exist                             | `dataErrorKey` can only return a key from two maps, and a key that is not in the bundle is not a crash — the member reads the key itself. `errors.keys.test.ts` walks both maps and the keys the edge sends through `en` and `bn`. It caught one immediately: this section's own "Comments are closed on this post" was mapped to `post.commentsClosed`, which does not exist (the key is `interactions.commentsClosed`). | `errors.keys.test.ts`                         |

## A poll that has votes keeps its options (0121)

Saving a post rewrote its poll: delete every option, insert the new list. It ran
on every save of a poll post, including the one that only fixed a typo in the
body. `poll_votes.option_id` references `poll_options` with `on delete cascade`,
so that rewrite deleted every ballot — and the options came back with new ids, so
nothing was recoverable. Nobody would have noticed until a poll had answers, and
then the answers were already gone.

| Decision                                              | Why it is that way                                                                                                                                                                                                                                   | Held by                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| An unchanged poll is not written at all               | The common save changes the body and not the poll. Writing nothing is the only version of this that cannot lose a vote, and it also removes the moment where a reader saw a poll with no options while the list was being rewritten.                 | `decidePollWrite`, `post-repository.test.ts` |
| A poll somebody voted on is frozen                    | A poll with answers is a record of what people answered. Rewording it is allowed while nobody has voted; after that the save stops with a sentence the member can act on, before the post row is touched, so there is no half-saved edit to explain. | `C-32`, `post-repository.test.ts`            |
| The composer shows the reason before the member types | The options render read-only with "This poll already has votes, so its options stay as they are" in both locales, rather than accepting an edit and refusing it at the end.                                                                          | `ComposePage`, `draftFromPost`               |
| The database refuses the delete as well               | The web client is not the only client: Android had the same rewrite, and a future admin tool or a console would have the same one. `poll_options_keep_votes` refuses to delete an option that carries a ballot.                                      | `0121`, `t80`                                |
| Deleting the post still deletes its poll              | A guard that only blocked deletes would have made a voted poll impossible to remove. The cascade from `posts` arrives one trigger deeper than a client delete (`pg_trigger_depth()`), and both directions are asserted rather than assumed.          | `t80`                                        |
| Android decides the same way, in Kotlin               | `PollOptionsLogic.decide` is the same three answers as the web, unit-tested on the JVM, and the composer shows the reason in the member's language instead of a database key.                                                                        | `PollOptionsLogicTest`                       |

## Settings is eight addresses, not one

`/settings` was one URL and a `useState`. The back button did nothing, a support
reply could not say "open your privacy settings", a member who reloaded lost the
panel they were on, and every link into settings landed on Account.

Each panel now has a path — `/settings/account`, `/settings/appearance`,
`/settings/language`, `/settings/notifications`, `/settings/feed`,
`/settings/privacy`, `/settings/security`, `/settings/danger` — the tab strip is a
navigation rather than local state, `/settings` redirects to the first panel so
every older link keeps working, and an address that is not a panel redirects
instead of rendering nothing. `C-30` holds the eight paths and the redirect in
place; `settings-panels.test.tsx` holds the behaviour: a panel is reachable by
URL, choosing one changes the URL, and `/settings/nonsense` lands on Account.

## The marketplace page is the nearest page (0122)

`mk_list_vendors` is the only read the marketplace home makes, and it is
anonymous and public. It applied `limit` inside its subquery and sorted what came
back by distance afterwards, so "nearest shops first" ordered an arbitrary forty
of the shops, not the nearest forty. At four shops nothing is visible; on a real
marketplace it means the shop across the road is routinely missing from the page.

| Decision                                                                       | Why it is that way                                                                                                                                                                                                                                                                                                                                          | Held by                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| The page is ordered by distance and then capped                                 | The distance *is* the order, so it has to be decided for every candidate before the cap. Measured on sixty shops with a page of forty: the old body left out a shop 0.56 km away in favour of one 4.89 km away. `t81` fails against the old body with exactly that sentence, and passes against this one.                                                     | `0122`, `t81`, `B-16`       |
| The membership rule is unchanged, and asserted                                | Active and funded, the same aggregates, the same type and search filters, the same tie-break on name. `t81` lists a funded active shop, hides an unfunded one and a suspended one, counts only active products, honours `limit`, and drops a shop the moment its balance reaches zero.                                                                        | `t81`                       |
| The funding question is asked once, not per shop                                | It was `bsdc.mk_vendor_credits(v.id)` in the `where` — a `sum` over that shop's whole ledger, evaluated for every candidate shop. The rewrite answers it with one grouped pass over the ledger. `bsdc.mk_vendor_credits` stays, because the shop page, the product page and the order page each read one shop's balance and that function is that answer. | `t81`                       |
| What this batch did **not** measure is claimed nowhere                         | The first draft of this migration claimed a large saving from the per-shop aggregates. That claim was wrong: they sat in the select list, and PostgreSQL does not evaluate a select-list subquery for rows the `limit` discards. Seeded with 800 shops in PGlite the new body measures 14–16 ms against the old body's 4.6–6.4 ms, because the new body pays for the distance sort it needs to be correct. PGlite is WASM and single-threaded, so that ratio is not a production figure — but it is enough to say the change is justified by correctness, not by speed. | this table                  |
| The index the ledger needed covers the question                                | `mk_credit_ledger` had only `(vendor_id)`, so a `sum(orders_delta)` per shop read the heap. `mk_credit_ledger_sum_idx (vendor_id, orders_delta)` lets the funding pass be answered from the index.                                                                                                                                                          | `0122`, `t81`               |
| The comment-with-a-picture check is one lookup, not a walk                      | `bsdc.prepare_comment` (0120) asks whether this member uploaded this URL. `media_assets_owner_idx` led on `owner_uid`, so the answer was found by walking up to the 2,000 rows an account's quota allows. The predicate is the pair, so `media_assets_owner_url_idx (owner_uid, url)` is the pair. `t81` asserts the plan names it.                       | `0122`, `t81`               |
| A thread's "which did I like" is one index read                                 | The primary key on `comment_reactions` starts at `comment_id`, so `where uid = $1` had nothing to use. `comment_reactions_uid_idx (uid, comment_id)` is the predicate order the thread actually asks in.                                                                                                                                                   | `0122`, `t81`               |
| The media sweeper no longer scans every message                                 | `media_pending_purge` asks whether any message points at a URL, per candidate upload, once a day. `messages_media_url_idx (media_url) where media_url <> ''` answers it directly.                                                                                                                                                                          | `0122`, `t81`               |
| An anonymous caller still cannot read the ledger                                | The funding rule lives behind a `security definer` function; the ledger itself stays unreadable. `t81` asserts the `42501` rather than trusting the grant.                                                                                                                                                                                                   | `t81`                       |

## A post is saved once, or not at all (0123)

Saving a post was up to nine requests: the row, then tags, media, mentions and
the poll, each its own statement. A save that failed at the fourth one left the
post published without the picture, without the tags and without the mention
notification — and the member was shown an error for a post that existed.

`public.save_post` is that save in one transaction.

| Decision                                                             | Why it is that way                                                                                                                                                                                                                                                                          | Held by                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| The function is `security invoker`, not `security definer`           | It must be the member's own write, not a way around the policies. Every row level security policy and every column grant that applied to the nine requests applies inside it; the proof asserts that another member cannot edit the post through it and that an anonymous caller cannot execute it at all. | `0123`, `t82`                               |
| A failure anywhere leaves nothing behind                              | `t82` fails the save on a picture that was never uploaded and asserts no post row exists afterwards, then fails it on a poll whose ballot is locked and asserts the post still has the title and the options it had.                                                                       | `t82`                                       |
| The whole post is sent, not a patch                                   | The arrays are the post's complete set, exactly as the four syncs treated them, so there is no "some of these tags" state to reason about.                                                                                                                                                  | `0123`, `save-post.test.ts`                 |
| The poll rule did not move, it got a second guard                     | `decidePollWrite` still refuses a voted poll before anything is sent, so the member reads a sentence; the function additionally compares the labels before deleting them, and `poll_options_keep_votes` (0121) still refuses the delete for every other client.                          | `C-32`, `t82`, `save-post.test.ts`          |
| `published_at` is decided where the row is written                    | The client read the existing timestamp in an extra round trip and then sent it back. The update now keeps `coalesce(published_at, now())` for a published post and clears it for a draft, in the same statement that writes the rest.                                                      | `t82`                                       |
| Two members saving the same title get two posts                        | The slug is still generated by the client; if another save took it in between, the insert retries with a numbered suffix inside the transaction instead of failing the member's save. `t82` saves the same title twice and asserts `same-title` and `same-title-2`.                        | `t82`                                       |
| The author comes from the session, not from a parameter                | The old signature took `authorUid` from the caller. The function uses `bsdc.current_uid()`, so a client cannot save as somebody else even if it tries.                                                                                                                                      | `0123`, `post-repository.ts`                |
| Both clients save the same way                                         | The Kotlin composer had the identical nine-request save and the identical half-saved post, so it calls the same function (`supabase.rpcText("save_post", …)`) and keeps its own poll decision before the call. `B-17` reads both clients, because fixing only the browser would have left the defect on the phone. | `B-17`, `ComposeRepository.kt`               |
