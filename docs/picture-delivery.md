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
| The cache name carries a version, so a worker update abandons every poisoned entry | `bsdc-images-v4` |

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
- forwards only `image/*`, passes a provider's status through so the browser's own
  ladder classifies it;
- cached a day at the edge, an hour in the browser.

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
   `bsdc-images-v4`, and no older `bsdc-images-*`. If there are older ones, the
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
