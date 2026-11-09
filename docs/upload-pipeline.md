# Uploading a picture

Every image on BSDC — avatars, profile and project covers, post and comment
images, chat images, project screenshots, marketplace products — is compressed in
the browser and uploaded **to ImgBB and nowhere else**, through this platform's
own edge endpoint. No Cloudinary, no Supabase Storage, no direct call from a
browser to a picture host.

```
browser                         Cloudflare Pages Function              ImgBB
───────                         ─────────────────────────              ─────
File (up to 10 MB)
  │  validate type/size
  │  scale to purpose max edge, encode WebP  (≈40–160 KB)
  │  POST /api/media/upload  (multipart + Firebase ID token)
  │──────────────────────────────►  verify ID token
                                    validate type/size/emptiness
                                    read IMGBB_API_KEY from env
                                    POST api.imgbb.com/1/upload  (base64)
                                                         ◄──────────────
                                    { url, medium, delete_url, w, h }
  ◄──────────────────────────────  200 { ok: true, … }
  │  record media_assets row (the member's own token, under RLS)
```

## Why the upload goes through the edge

- **The key is a secret.** Compiled into a public bundle it is readable by
  anybody, who can then spend this deployment's upload quota.
- **A key read at request time takes effect on the next request**, not on the
  next rebuild. Changing `IMGBB_API_KEY` in Cloudflare does not require a deploy.
- **The caller is identified.** A Firebase ID token is verified before a byte
  goes anywhere, so every upload is attributable and the `media_assets` row the
  browser writes afterwards belongs to a real member.

## "Uploads are not configured for this deployment"

This sentence was shown to members on a deployment whose `IMGBB_API_KEY` was set
correctly. It was not a configuration problem; it was a **pre-flight** problem.

`uploadMedia` used to ask `GET /api/media/providers` whether uploads were
possible and refuse before sending anything if the answer was not a clear yes.
Every one of these made that pre-flight answer no while the deployment was
perfectly configured:

1. The probe request failed once and the **negative answer was cached in memory
   for the life of the tab** — so fixing the deployment could not fix the tab.
2. The probe timed out on a cold edge (8-second deadline).
3. A service worker, an extension, an in-app browser or a captive portal
   answered `/api/media/providers` with something that is not JSON.
4. The key was added to Cloudflare *after* the tab was opened.
5. The Pages Functions were not uploaded with the site, so the real endpoint did
   not exist either — the one case where the message was true.

**The fix:** the probe is now advisory. It warms the connection, it is recorded
for `/system-check`, it expires after 60 seconds — and it can never veto an
upload. `uploadMedia` validates locally (type, size, emptiness, which are free),
sends the bytes, and lets **the endpoint** answer, because the endpoint is the
only thing that can see the key. Its refusal is already in the member's language.

The reverse case also matters: when ImgBB rejects the credential, the edge now
answers `media.errors.notConfigured` instead of a generic failure, because
"an administrator must fix the key" and "retry in a moment" are different
instructions and only one of them is true.

## What an operator should see

| Check | Correct answer |
| --- | --- |
| `GET /api/health` | `{ "media": { "upload": true, "host": "imgbb" } }` |
| `GET /api/media/providers` | `{ "proxy": true, "imgbb": true }` |
| `POST /api/media/upload` (no token) | `401 { "ok": false, "errorKey": "media.errors.signInRequired" }` |
| `GET /media/i?u=<imgbb url>` | `200 image/*` with `cache-control: public, max-age=604800 … immutable` |
| Signed-in upload from the composer | progress to 100 %, picture appears, row in `media_assets` |

Run all of them at once:

```bash
node scripts/verify-media.mjs                          # production
node scripts/verify-media.mjs https://bsdc.pages.dev   # a preview
node scripts/verify-media.mjs http://localhost:8788    # wrangler pages dev
# or, from main-site: npm run media:verify
```

It exits non-zero and names the failure. The `POST /api/media/upload → 401` line
is the important one: `404`, `200 text/html` or the app shell there means the
Pages Functions were not deployed with the site, which is the only version of
"uploads are not configured" that is literally true.

## Configuration

| Where | Name | Value |
| --- | --- | --- |
| Cloudflare Pages → project `bsdc` → Settings → Environment Variables → **Production and Preview** | `IMGBB_API_KEY` | the ImgBB API key. Encrypted secret; never a `VITE_` variable, never committed. |
| Same place | `FB_PROJECT_ID` | `bsdc-bd`. Without it no ID token can be verified and every upload answers `401`. |

`IMGBB_API_KEY` is read inside `functions/api/media/upload.ts` via
`context.env` on every request, so a change takes effect immediately. There is no
build step and no redeploy.

## Limits, and what is refused where

| Rule | Client | Edge |
| --- | --- | --- |
| Accepted types | `image/jpeg,png,webp,gif,avif` | same list, re-checked |
| Maximum size | 10 MB per image (`MAX_BYTES`) | same, re-checked |
| Empty file | refused | refused |
| Anonymous caller | refused before any bytes | `401` |
| Anything that is not an image | refused | refused |
| Purpose | one of seven, from `media-contract.ts` | `isMediaPurpose` |

The client-side compression is a courtesy, not a control: the edge re-checks
type and size on the bytes that actually arrive.

## After the upload

The browser writes the `media_assets` row itself, under the row-level policy
that requires `owner_uid` to be the member. The edge function deliberately has no
write path into that table and is never given the service key — a public endpoint
that could insert a row on behalf of a member who never asked for one is not a
trade worth making for one round trip. See
[`docs/media-lifecycle.md`](./media-lifecycle.md) for what may later be deleted
and what never is.
