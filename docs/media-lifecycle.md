# A picture's promise

Every picture on BSDC lives on somebody else's disk. Cloudinary holds the
important ones; ImgBB holds the rest. Neither is paid for, and neither is
infinite, so the platform has to be able to say two things about every file it
put there: **how long the host was told to keep it**, and **who deletes it when
nobody is using it any more**.

Before this, it could say neither.

## What was wrong

`functions/_media.ts` computed a lifetime per purpose and then dropped it. The
ImgBB upload call never carried an `expiration`, so every file the platform
uploaded was kept **forever** — including a photograph somebody sent in a direct
message and then deleted. Deleting the row in `public.messages` removes it from
the platform; it cannot remove it from i.ibb.co, and nothing recorded that the
file was still there.

The second half is worse than the first, because it is invisible:

- `media_assets.delete_token` recorded the host's delete URL.
- Nothing ever read it.
- The table therefore grew a column of capabilities that no code used and no
  query swept, which is indistinguishable from a column of dead strings.

## What it does now

### The lifetime is decided once, at the edge

`UPLOAD_LIFETIME_SECONDS` in `functions/_media.ts`:

| Purpose | Kept for | Why |
| --- | --- | --- |
| `avatar`, `cover`, `project-cover`, `project-image`, `post-image`, `comment-image`, `product-image` | forever (`0`) | A published picture is the post. It goes when the post goes, not before. |
| `chat-document` | 180 days | A document handed to one member is not a publication. |
| `voice-note` | 90 days | The most personal thing on the platform, and the shortest-lived. |

The number is passed to ImgBB as `expiration`, in seconds, which is the field the
host documents. `0` means the field is omitted, because "expire now" and "never
expire" must not share a value.

### The promise is stored, and cannot be extended by a browser

`0073` adds three columns and one function:

| Column | Means |
| --- | --- |
| `expires_at` | when the host stops serving the file by itself, or null for never |
| `purge_requested_at` | when the platform asked the host to delete it |
| `purged_at` | when the host confirmed it is gone |

`record_media_asset(...)` is the only route into the table. It validates what a
table policy cannot: https only, a known provider and kind, an expiry in the
future and inside a year, and the member's live-upload ceiling. A client that
tries `update media_assets set expires_at = now() + interval '10 years'` is
refused, and `t46.mjs` proves it.

### Every upload path records its row

A file with no row in `media_assets` is invisible to the sweeper and its expiry
was never stored, so the host keeps it forever. Three paths upload, and all three
now record:

| Path | Records | Note |
| --- | --- | --- |
| Avatar and cover upload | `recordMediaAsset` | already did |
| Post and gallery attachments | `use-attachments` | already did |
| **A chat attachment or voice note** | `recordIfSignedIn` in `MessageComposer` | **did not**, which is exactly the case that matters most: a photograph sent in a direct message is the one file whose lifetime is finite |

The chat path records **before** the message is sent, not after. An asset nobody
has attached yet is an orphan the sweeper can see and will collect in a day; a
file recorded only after a successful send is invisible for the duration of a
failed send, which is the case that leaves something on the host forever.

A recording failure does not stop the message. The bytes are already at the host
and the member's sentence is worth more than the trail, so the send goes through
and the failure is logged as what it is: one file that will need deleting by
hand.

### What gets swept, and what never does

`media_pending_purge(secret, limit)` returns exactly two kinds of row:

- **expired** — the host was told to stop, and has.
- **orphaned** — no post, no message, no avatar, no cover references the file,
  and it is more than a day old.

That one-day grace period is not decoration. The composer writes the asset row
*before* the post, so a picture that is thirty seconds old is a picture somebody
is looking at. Deleting it would be deleting a live upload.

A picture used by anything is never returned. A row without a `delete_token` is
never returned either — asking is not the same as being able to.

> The first draft of this function had a third reason, `replaced`, with no
> condition attached to it. Every asset over a day old qualified, including the
> picture in a published post. `t46.mjs` caught it on its first run, which is why
> every reason in the final function is a condition that a test asserts.

### A delete has three outcomes, not two

`POST /api/media/purge` walks the list and reports honestly:

| Verdict | When | What follows |
| --- | --- | --- |
| **confirmed** | the host said 200, or 404/410 — the file is not there | `media_mark_purged` |
| **refused** | 401/403: the token and the key disagree, and a retry cannot help | claim released, operator sees it |
| **unanswered** | timeout, 5xx, network error | claim released, next run tries again |

Rows are **claimed** before the request is made (`media_claim_purge`), so two
runs in the same minute never ask twice. A claim that is not confirmed is
released, which is the difference between a retried delete and a lost one.

### The address a delete is sent to is not trusted

`delete_token` comes out of a database column. The column is not readable or
writable by any client role (`t43.mjs` proves the grant layer), but the endpoint
does not rely on that: `deletionRequest()` accepts only `https:`, no port, no
credentials, and a host of `i.ibb.co` or `ibb.co`. Cloudinary deletes need an
API signature the unsigned preset cannot produce, so the platform asks for
nothing there rather than guessing and deleting the wrong asset — which is why
`expiresAt` is null for every Cloudinary upload.

## Running it

The sweeper is a scheduler job, exactly like push:

```bash
curl -sX POST 'https://www.bsdc.info.bd/api/media/purge?limit=50' \
  -H "authorization: Bearer $PUSH_FLUSH_SECRET"
```

```json
{ "waiting": 3, "confirmed": 2, "refused": 1, "unanswered": 0, "rows": 3, "milliseconds": 214 }
```

`refused` is the number to look at: it means a stored delete URL no longer works
with this deployment's ImgBB key. `waiting` staying at the same number across
runs means the host is not answering, and the claims are being released each time
rather than marked done.

## Proving it

```bash
cd main-site
node scripts/db-prove/t46.mjs      # 46 checks against 0073, offline
npx vitest run functions/api/media # 6 checks on the address allowlist
node scripts/db-prove/run.mjs      # all of it, 29 harnesses
```

`t46.mjs` covers: a member recording their own upload; the expiry being stored;
a row that cannot be born expired; a lifetime beyond a year being refused; a
downgrade to `http` being refused; a signed-out caller being refused; a direct
table write not extending an expiry; an abandoned upload being offered and a
published one never being offered; a file with no delete capability never being
reported as deletable; a stranger with the wrong secret getting nothing; claim,
release and confirm; a released row coming back; a purged row never coming back;
one member never seeing another's pictures; and each function being granted to
exactly the right role.
