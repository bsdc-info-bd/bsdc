# Pictures that stop loading

**The report:** every image on BSDC loads, and after a few minutes none of them
do — posts, avatars, static art, all of it — until the member clears cookies and
cache, after which everything works again for a while.

**The cause was in this repository, not in a CDN.** This document records what it
was, what changed, and how to check the fix on a real deployment.

## What was wrong

`main-site/src/sw.ts` — the service worker — handed every image request to
Workbox's `StaleWhileRevalidate` with a 200-entry, **30-day** expiration. Three
properties of that arrangement combine into the reported symptom:

1. **The default `cacheWillUpdate` stores anything with status 200.** An image
   host under load answers `429`/`503` with an HTML page; a signature expires and
   the provider answers `200` with a placeholder. Whatever arrived with a 200 was
   written to the cache *as the picture*.
2. **`StaleWhileRevalidate` always serves from the cache first.** One bad body
   became the picture for every later paint. The background revalidation could
   not heal it, because the entry it replaced was the entry the next paint read.
3. **Thirty days is longer than any signed delivery URL lives.** A URL whose
   signature expired was answered from the cache with the failure, and the
   browser never asked again.

So: one bad minute at a picture host poisoned a browser for a month, and the only
escape a member had was to delete all site data. Clearing the cache "fixing it"
was the tell — a temporary fix pointed straight at a cache that was trusted when
it should not have been.

Two smaller holes made it worse:

- `MediaImage` gave up after **two** failures and stopped trying. A transient
  failure therefore looked permanent.
- Nothing verified that a load event had produced a picture. A `200 text/html`
  body decodes to nothing, and the element reported success.

## What changed

### 1. The worker stores only what it can verify

`main-site/src/lib/media/cache-policy.ts` decides, and `src/sw.ts` obeys:

| Rule | Where |
| --- | --- |
| Only `200`, only `type: basic\|cors`, only `image/*`, only a body ≥ 32 bytes | `isStorableImage` |
| Every entry is stamped with the time it was stored | `stampStored` |
| Served from cache only inside a **7-day** trust window | `isFresh` |
| Outside it, the network is asked **first** | `handleImage` |
| A stale entry is served only while the host is unreachable, and only for twice the window | `isUsableWhenStale` |
| Only a body whose **first bytes are an image signature** is stored | `putVerified` → `looksLikeImageBytes` |
| An answer the worker refuses to store is returned `no-store`, so the browser's HTTP cache cannot remember a failure as the picture | `handleImage` → `uncachedHeaders` |
| The cache name carries a version, so a worker update abandons every poisoned entry | `bsdc-images-v6` (`lib/media/cache-names.ts`) |

The check that would have caught the original bug on its first day is this one:

```ts
const type = (response.headers.get('content-type') ?? '').toLowerCase();
if (!type.startsWith('image/')) return false;
```

### 2. Browsers that are already poisoned heal themselves

A member who has been clearing their cache for months has a cache full of
failures, and the worker that would clean it is waiting behind an "update
available" toast they may never press. So the **page** does it:
`main-site/src/pwa.ts` → `healMediaCachesOnce()` runs on load, deletes every
`bsdc-images-*` cache that is not the current one, and records that it did.
There is also a button — **Settings → Pictures → Repair pictures** — which drops
the picture cache and nothing else: no sign-out, no lost drafts, no lost settings.

### 3. Every picture runs a recovery ladder

`main-site/src/lib/media/resilience.ts` names five ways a picture stops loading
and gives each one its own cure:

| Failure | Detected by | The ladder |
| --- | --- | --- |
| `transient` | no response, 408/425, 5xx | the other size → retry → slower retry → the site's own proxy |
| `rate-limited` | 429 | wait → the other size → proxy |
| `expired` | 403/410 on a signed URL | re-resolve through the edge → the other size |
| `forbidden` | 401/403 on an unsigned URL | fetch through this origin → the other size |
| `poisoned` | a 200 that is not a picture | a cache-busted URL → the other size → proxy |
| `missing` | 404/410 on an unsigned URL | the transform-free original, then the designed empty tile |

`MediaImage` verifies every paint (`naturalWidth > 0`), and it is the ladder, not
a counter, that decides what happens next — the first version of this code had
two branches that pointed at each other and oscillated forever. A test that walks
the ladder twelve times found it
(`src/lib/media/resilience.test.ts` → "walks a whole ladder without ever
repeating an address").

### 4. The edge can repair a picture the browser cannot fetch

`main-site/functions/media/i.ts` — `GET /media/i?u=<encoded url>`:

- allowlist: `i.ibb.co`, `ibb.co`, `i.ibb.co.com` only;
- `https:` only, no port, no credentials, no document types;
- 12 MB cap enforced on the bytes that actually arrive, not on `content-length`;
- forwards only what is `image/*` **and** whose first bytes are an image
  signature, passes a provider's status through so the browser's own ladder
  classifies it;
- 7 days at the edge and in the browser for verified bytes, `no-store` for every
  refusal — there is deliberately no `_headers` rule for `/media/i`, because a
  rule cannot be scoped by status: the 7-day `immutable` meant for the bytes also
  covers the 502s and 504s, and a week-long `immutable` on a 502 is a week of a
  broken picture.

It is the last rung before the empty tile, and the reason a hotlink or CORS change
at a picture host can no longer break the site.

### 5. A member can see whether it is working

`/system-check` runs the checks that separate a broken deployment from a broken
device — configuration, `/api/health`, both picture hosts (status **and** content
type), the repair endpoint, the database functions, the realtime socket, the
browser's own limits — and prints a report the member can copy into a support
message. It contains no token, no address and nothing about the account.

## How to verify it on a deployment

1. **Open `/system-check`.** Every line should be `pass`. A `fail` on
   `image.imgbb` with `text/html` is the original bug, still live at that host.
2. **Open DevTools → Application → Cache Storage.** There should be
   `bsdc-images-v6`, and no older `bsdc-images-*`. If there are older ones, the
   page's heal has not run — check that the deployment serves this build.
3. **Open DevTools → Network, filter to Img, and reload twice.** The second load
   should be served from the service worker (`(ServiceWorker)` in the Size
   column), and the entries should still be `image/*`.
4. **Press Settings → Pictures → Repair pictures.** Pictures on the page reload
   immediately; the session survives.
5. **Throttle to Offline, then back.** Pictures that failed while offline retry
   by themselves when the connection returns, with a cache-busted URL.

## The regression tests

| File | What it pins |
| --- | --- |
| `src/lib/media/cache-policy.test.ts` | A `200 text/html` is never stored; a 30-day entry is not; an old entry is stale. |
| `src/lib/media/resilience.test.ts` | Every rung of the ladder, every failure kind, and that the ladder is finite. |
| `src/components/media/MediaGallery.test.tsx` | The component walks the whole ladder before it draws the empty tile. |
| `functions/media/proxy.test.ts` | The repair endpoint refuses plaintext, ports, credentials, lookalike hosts and documents. |
| `src/pwa.test.ts` | A stale cache is deleted, once per build, and nobody else's cache is touched. |
| `src/lib/diagnostics/checks.test.ts` | An HTML body under an image URL is reported as a **failure**, not a success. |

`node scripts/db-prove/run.mjs` is unrelated to pictures and must still pass; the
whole gate is `cd main-site && npm run typecheck && npm run lint && npm run test
&& npm run build`.

## Second pass — 2026-11-08

The first pass fixed the worker. This pass fixes the four things around it that
kept the reported symptoms alive, all of them found by reading the deployed path
end to end rather than the module that was suspected.

### 1. The page was deleting the worker's live cache

`src/sw.ts` named the picture cache `bsdc-images-v5`; `src/pwa.ts` believed the
current name was `bsdc-images-v4` and deleted every picture cache that did not
match. So on every fresh browser — and on **every** load wherever `localStorage`
was blocked, which includes private windows — the page deleted the cache the
running worker was writing to. Pictures were fetched twice, the cache never
stayed warm, and the repair routine was itself part of the slowness.

Two constants that must be equal are one constant. Both files now import
`src/lib/media/cache-names.ts`, and `cache-names.test.ts` reads both sources to
prove neither has gone back to writing a literal.

### 2. The worker never actually cached a single ImgBB image

A `<img src="https://i.ibb.co/…">` produces a `no-cors` request. A `no-cors`
fetch can only deliver an **opaque** response: status 0, no readable headers, no
readable body. `isStorableImage` refuses opaque responses — correctly — so the
picture cache was never written for any real uploaded image, and every paint paid
for a full download through the worker.

The worker now asks for a readable answer first (`mode: 'cors'`; ImgBB serves its
images with `access-control-allow-origin: *`), verifies the bytes, and stores
them. If a host does not allow the read, it falls back to the plain opaque fetch
the element would have made anyway: the picture still paints, it simply is not
cached. **A cache miss is never worth a broken image.**

### 3. A temporary failure could be remembered as the picture, for a week

Two paths did this at once:

- `_headers` declared `Cache-Control: public, max-age=604800, immutable` for
  `/media/i`. A `_headers` rule applies to *every* status from that path, so the
  endpoint's 502s and 504s were cached for a week in the member's browser. The
  rule is gone; the endpoint sets its own headers.
- The worker passed a non-storable answer straight through, headers included. A
  `429` from a picture host is an ordinary cacheable response. The worker now
  returns it with `no-store`, no `expires` and no `etag`.

Also gone: the fresh-hit background revalidation. It used `cache: 'no-store'`, so
every visit to the feed re-downloaded every image on it while the visible images
waited on the same connection.

### 4. `MediaImage` proxies only what the edge can actually fetch

`/media/i` answers 400 for any host that is not ImgBB. Every Google avatar and
every legacy row spent four ladder rungs on four guaranteed failures. The proxy
rung is now only offered when `isRepairableMediaHost` agrees, and images are
`loading="lazy"` by default, so a twenty-post feed no longer starts twenty
downloads on a phone connection to draw the first one.

### Regression tests added

| File | What it pins |
| --- | --- |
| `src/lib/media/cache-names.test.ts` | One cache name, versioned, and neither file hard-codes a literal. |
| `src/lib/media/cache-policy.test.ts` | A JPEG/PNG/GIF/WebP/AVIF/SVG signature is accepted; an HTML error page is not; a refused answer loses every header that could make it cacheable. |
| `functions/media/proxy.test.ts` | (unchanged allowlist rules) — the endpoint now also refuses bytes that are not a picture. |
