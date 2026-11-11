# Web push, end to end

A notification that reaches somebody whose browser is closed. This is the whole
path, every piece of it, what each piece refuses to do, and how to prove the
thing works without waiting for somebody to follow you.

**Contents**

1. [Why it is built this way](#1-why-it-is-built-this-way)
2. [The path a notification takes](#2-the-path-a-notification-takes)
3. [Every piece, and where it lives](#3-every-piece-and-where-it-lives)
4. [Setting it up, in order](#4-setting-it-up-in-order)
5. [The scheduler](#5-the-scheduler)
6. [What a member sees](#6-what-a-member-sees)
7. [Proving it works](#7-proving-it-works)
8. [When it does not](#8-when-it-does-not)
9. [What was deliberately not done](#9-what-was-deliberately-not-done)

---

## 1. Why it is built this way

Three decisions shape everything below, and each one was made against an
alternative that looked easier.

**Two delivery paths, one of them carrying the words.** A push with a body has to
be encrypted for that one subscription: RFC 8291 asks for an ECDH key agreement
against the browser's `p256dh`, an HKDF derivation with its `auth` secret,
AES-128-GCM over the bytes, and a `Content-Encoding: aes128gcm` header. That is
what `push-worker/` does, in `src/crypto.ts`, and it is the primary path — a phone
in a pocket shows the notification without waking the app first.

The older path is kept, and it carries **no** payload: `functions/api/push/flush.ts`
sends an empty wake-up and the service worker asks `/api/push/content` what it
missed. An empty body is the one case the specification sends unencrypted, so
there is nothing to get wrong there, and a device that was asleep for a day is
told about nine things in **one** summary rather than nine separate buzzes. It is
the fallback for a deployment whose Worker is not deployed, has been rolled back,
or is having a bad minute — see [§5](#5-the-scheduler).

**No function in `functions/` holds the Supabase service key.** That is a rule
this repository already had, written at the top of `_rpc.ts`: an edge function
that can bypass row level security is a public endpoint that can bypass row level
security. So the two functions that read other members' notifications are
authorised by a **secret the database checks**, not by a role that bypasses it.
The secret is a row in `bsdc.push_settings`, a table with row level security on,
no policies and no grants, so nothing but the definer functions can read it.
Where the secret is not set — or is shorter than 32 characters — every gated
function refuses, push simply does not run, and nothing else about the site
changes.

**The service worker is written, not generated.** `vite-plugin-pwa` can generate
a worker that precaches and falls back, but a generated worker cannot listen for
anything, and a notification that only arrives while the site is open is not a
notification. So `src/sw.ts` is the worker, the plugin runs in `injectManifest`
mode, and the file keeps every rule the generated one had: the precache manifest,
`/index.html` for a navigation that misses, the same denylist, the same image and
font caches with the same limits. The build reports `mode injectManifest` and
`precache 186 entries`, which is the same count as before the change.

## 2. The path a notification takes

```
somebody reacts to a post
        │
        ▼
bsdc.notify() writes a row into public.notifications      (already existed)
        │
        │   …up to five minutes later…
        ▼
push-worker/ cron (every minute)          the primary path
        │   scheduled()
        ▼
rpc push_pending_devices(secret, limit, lookback)
        │   the database checks the secret, then returns
        │   (notification, uid, endpoint, p256dh, auth, language) rows where
        │   pushed_at is null and the device is live
        ▼
one POST per distinct endpoint, with a body this time
        │   RFC 8291: ECDH against p256dh, HKDF with auth, AES-128-GCM,
        │   Content-Encoding: aes128gcm, Authorization: vapid t=…, k=…
        │   grouping: three likes on one post become one notification that
        │   says three
        ▼
the browser shows it                              (browser closed, phone in a
        │                                          pocket — it works, offline)
        ▼
the member taps it ──► the tab on that page is focused, or the tab is navigated,
                       or a window is opened. Never a second copy of the app.
```

The fallback path, when `PUSH_WORKER_URL` is unset or the Worker does not answer:

```
anything with the secret ──POST /api/push/run──► Pages Function
        │   forwards to the Worker's POST /run first, and on any failure
        ▼
rpc push_pending(secret, limit) ──► empty wake-ups, no body
        ▼
the browser wakes the service worker
        │
sw.ts ──POST /api/push/content──► rpc push_content(endpoint, limit)
        │                            returns what this device has not been told,
        ▼                            and moves its watermark
showNotification()
```

The database marks `pushed_at` only for notifications whose device was actually
reached. A push service that was merely unreachable leaves the row waiting, and
the next run tries again — a run that fails halfway repeats rather than drops.

## 3. Every piece, and where it lives

| Piece | File | What it is |
| --- | --- | --- |
| Tables and routines | `supabase/migrations/0060_push_reaches_a_closed_browser.sql` | `public.push_subscriptions`, `bsdc.push_settings`, `notifications.pushed_at`, and the seven routines |
| Proof | `main-site/scripts/db-prove/t31.mjs` | 38 checks: refusals before setup, ownership, the watermark, the kill and the revival |
| **Delivery (primary)** | `push-worker/src/index.ts` | the cron, the queue, and `POST /run` / `GET /health` |
| **Encryption** | `push-worker/src/crypto.ts` | RFC 8291: ECDH, HKDF, AES-128-GCM, `aes128gcm` framing |
| **The words** | `push-worker/src/notifications.ts` | titles and bodies per kind per language, grouping, preview cleaning |
| **Signing (worker)** | `push-worker/src/deliver.ts` | the ES256 VAPID token, per push service origin |
| **Database read (worker)** | `push-worker/src/api.ts` | secret-gated RPC over PostgREST, with a timeout |
| Worker config | `push-worker/wrangler.toml` | cron `* * * * *`, secrets, the optional queue |
| **Scheduler endpoint** | `main-site/functions/api/push/run.ts` | `POST /api/push/run` — forwards to the Worker, falls back to the flush |
| Delivery (fallback) | `main-site/functions/api/push/flush.ts` | the empty wake-up, `POST /api/push/flush` |
| Content | `main-site/functions/api/push/content.ts` | what a woken device is told, `POST /api/push/content` |
| The worker | `main-site/src/sw.ts` | precaching, offline, `push`, `notificationclick`, `pushsubscriptionchange` |
| Worker config | `main-site/vite.config.ts` | `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'` |
| Signing | `main-site/src/lib/push/webpush.ts` | base64url, the VAPID JWT, ES256, dead-status rules. Shared by the edge and the tests |
| Support checks | `main-site/src/lib/push/support.ts` | which of the four prerequisites is missing, and the device list's names |
| The words | `main-site/src/lib/notifications/copy.ts` | titles per kind per language, the body, the tag, the summary |
| Subscription store | `main-site/src/lib/push/push-repository.ts` | register, unregister, list |
| Member control | `main-site/src/hooks/use-push.ts` | permission, subscribe, re-register on load, device list |
| Interface | `main-site/src/components/notifications/PushCard.tsx` | the switch, the prompt, the devices |
| Keys | `main-site/scripts/vapid-keys.mjs` | `npm run push:keys` |

### The routines

| Routine | Who may call it | Authority |
| --- | --- | --- |
| `register_push_subscription(endpoint, p256dh, auth, user_agent, language)` | `authenticated` | the member's own uid |
| `unregister_push_subscription(endpoint)` | `authenticated` | the member's own rows |
| `my_push_subscriptions()` | `authenticated` | the member's own rows |
| `push_pending(secret, limit)` | `anon`, `authenticated` | the secret |
| `push_mark(secret, ids)` | `anon`, `authenticated` | the secret |
| `push_kill(secret, endpoint)` | `anon`, `authenticated` | the secret |
| `push_content(endpoint, limit)` | `anon`, `authenticated` | the endpoint itself |
| `push_pending_devices(secret, limit, lookback)` | `anon`, `authenticated` | the secret. 0072: returns the words and the encryptable keys |
| `push_mark_devices(secret, ids)` | `anon`, `authenticated` | the secret. 0072's marking routine |
| `push_kill_device(secret, endpoint)` | `anon`, `authenticated` | the secret. 0072's retirement routine |
| `push_flag_invalid_device(secret, endpoint)` | `anon`, `authenticated` | the secret. Records keys a push service refused |
| `my_push_devices()` | `authenticated` | the member's own rows, with `live` / `invalid` / `dead` |
| `forget_push_device(endpoint)` | `authenticated` | the member's own rows |
| `push_sweep_dead_devices(secret, days)` | `anon`, `authenticated` | the secret. Housekeeping |

None of them is executable by `public`; every one is `security definer` with a
fixed `search_path`. `push_content` has to answer the anonymous role because a
service worker wakes with no session — a browser that has been closed for a day
does not authenticate itself to a push. What it holds instead is an address that
is long, random and known only to that browser, its push service and this
database. The answer is scoped to that address's owner, asking twice returns
nothing the second time, and an address nobody was given is told nothing at all.

An endpoint that already exists **changes owner** on re-registration. That is not
a hole: it is a shared phone that signs somebody else in, and it should wake for
them and not for the member who signed out.

## 4. Setting it up, in order

```bash
cd main-site
npm run push:keys
```

It prints four strings and the exact SQL for one of them. It writes nothing to
disk. **Run it once per deployment.** Running it again makes a new keypair, and
subscriptions taken with the old one stop being deliverable.

1. **Cloudflare Pages → main-site → Settings → Environment variables.** Add all
   four, each one *Encrypt*:

   | Variable | Where it is used |
   | --- | --- |
   | `VITE_PUSH_VAPID_PUBLIC_KEY` | build time: compiled into the bundle and the worker |
   | `PUSH_VAPID_PUBLIC_KEY` | the `k=` half of the authorization header |
   | `PUSH_VAPID_PRIVATE_KEY` | signing the token, at the edge only |
   | `PUSH_FLUSH_SECRET` | the bearer token a scheduler presents |

   `VITE_` variables are public by design — the public half of a keypair ships to
   every browser that subscribes. The other three never leave Cloudflare.

2. **Supabase → SQL editor.** The same flush secret, where the database can check
   it:

   ```sql
   insert into bsdc.push_settings (name, value)
   values ('flush_secret', '<PUSH_FLUSH_SECRET>')
   on conflict (name) do update set value = excluded.value;
   ```

3. **Redeploy.** The public key is baked in at build time, so the site has to be
   built again before the switch in settings will work. Until it is, the card
   says "this deployment has no push key yet" rather than offering a button that
   fails.

4. **Deploy the Worker and point the site at it** —
   [next section](#5-the-worker-and-the-scheduler).

## 5. The Worker, and the scheduler

There are two schedulers, and the Worker is the one that carries the words.

### 5.1 Deploy the Worker

```bash
cd push-worker
npm ci
npx wrangler login            # or: export CLOUDFLARE_API_TOKEN=…
npx wrangler deploy
```

The first deploy binds the custom domain `https://push.api.bsdc.info.bd`
configured in `push-worker/wrangler.toml` (alongside `*.workers.dev` if enabled).

Required & optional secrets (set automatically by `deploy.yml` when present in
GitHub Actions secrets, or manually via `npx wrangler secret put`):

```bash
npx wrangler secret put SUPABASE_URL                     # https://<ref>.supabase.co
npx wrangler secret put SUPABASE_ANON_KEY                # the anon key, NOT the service key
npx wrangler secret put PUSH_FLUSH_SECRET                # the same string as step 2 above
npx wrangler secret put PUSH_VAPID_PUBLIC_KEY            # the k= half (Web Push)
npx wrangler secret put PUSH_VAPID_PRIVATE_KEY           # Web Push signing key
npx wrangler secret put PUSH_VAPID_SUBJECT               # mailto:admin@bsdc.info.bd
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_BSDC_BD # enables FCM HTTP v1 delivery
```

`SUPABASE_ANON_KEY` is enough because every database call the Worker makes is a
`security definer` function gated on `PUSH_FLUSH_SECRET`, which the database
checks itself. The Worker is never handed a key that could bypass row level
security — the same rule every Pages Function here follows.

Check it:

```bash
curl -s https://push.api.bsdc.info.bd/health
# {"worker":"bsdc-push","status":"ok","vapid":true,"fcm":true,"secret":true,"database":true,…}
```

`"status":"unconfigured"` means both VAPID keys and FCM credentials are missing.
`status` is `ok` when either `vapid` or `fcm` is configured; `secret` and
`database` say whether the other half is.

### 5.2 Point the site at it

Cloudflare Pages → main-site → Settings → Environment variables (production):

| Variable | Value |
| --- | --- |
| `PUSH_WORKER_URL` | `https://push.api.bsdc.info.bd` |
| `PUSH_DISABLE_LOCAL_FALLBACK` | leave unset. Set to `1` only if you want a Worker outage to be visible rather than silently degraded. |

With `PUSH_WORKER_URL` set, `POST /api/push/run` forwards to the Worker and
returns its answer with `"path":"worker"`. If the forward fails — timeout, DNS, a
Worker that 500s — the same request falls back to the in-function flush and
answers `"path":"local","workerUnavailable":true`. Neither path can send to a
device the database did not name for that notification.

### 5.3 The cron

`push-worker/wrangler.toml`:

```toml
[triggers]
crons = ["* * * * *"]
```

Every minute is 1,440 invocations a day against the Workers free allowance of
100,000, and a run with nothing waiting exits in a few milliseconds without
calling a push service. That interval is the difference between "a notification
arrives" and "a notification arrives eventually".

A run that finds more than 200 waiting drains it over several minutes rather than
in one request that exceeds the subrequest limit: the cap is `MAX_PER_RUN = 400`
in `src/index.ts`, and unmarked rows are simply picked up by the next run.

### 5.4 Anything else that can send the secret

The endpoint does not care who is asking, only that they know the secret. A
GitHub Action on a schedule, a cron job on a machine that is always on, an uptime
checker that POSTs, `curl` from a laptop — all of them work:

```bash
curl -sX POST "$SITE/api/push/run" -H "authorization: Bearer $PUSH_FLUSH_SECRET"
```

`POST /api/push/flush` still exists and still works: it is the empty wake-up, and
it is what to use to prove the database half independently of the Worker.

## 6. What a member sees

- **The prompt.** One card, on the notifications page, and only while the
  permission is undecided, the browser supports push, and the deployment has a
  key. It can be put away, and putting it away does not ask the browser for
  anything — a permission refused in the browser is refused for good, so the
  card never calls `requestPermission()` on load or on a timer.
- **The switch.** Settings → Notifications → *Wake this device*. On means this
  browser subscribed and the database has somewhere to send it. Off drops the
  subscription in the browser **and** retires every recorded device, so a member
  who turns it off stops a phone they have lost being woken too.
- **The device list.** Named from the user agent — "Chrome · Android" — with the
  date it registered and a way to stop waking that one device.
- **Where push cannot work**, the card says which of the four prerequisites is
  missing instead of showing a switch that does nothing: an insecure context, no
  service worker, no push manager, no notifications at all, or no key on this
  deployment. Two of those are fixable by the member and the card says so.
- **What arrives.** A reaction, a comment, a follow, a message: the title names
  the kind in the language the device registered with, the body is the line the
  database already wrote, the icon is the actor's when there is one, and tapping
  it opens the post, the person or the thread. More than three waiting becomes one
  summary — "৭টি নতুন নোটিফিকেশন" — that opens the inbox.

## 7. Proving it works

The database half is proved against the real migrations, offline, in CI:

```bash
cd main-site && node scripts/db-prove/t31.mjs     # 38 checks
```

It covers: every gated routine refusing before the secret exists; a secret too
short to be one being treated as no secret; a member registering a device and
seeing only their own; no registering as somebody else; a visitor being refused;
the flush seeing exactly the rows it should for exactly the devices that should
see them; a wrong secret being refused outright; the watermark, so asking twice
tells a device nothing the second time; a guessed endpoint being told nothing;
one member's device being told only what belongs to them; marking; retiring a
dead device; and the same browser asking again coming back to life.

The Worker is proved the same way — offline, no Cloudflare account, no database:

```bash
cd push-worker && npx vitest run      # 4 files, 55 tests
```

It covers the RFC 8291 encryption byte for byte against a known vector, the ES256
token's structure and expiry, the `Authorization` header shape, every push
service status mapped to exactly one outcome (`sent`, `dead`, `invalid`,
`unauthorized`, `retry`, `failed`), the grouping that turns nine notifications
into one, and every answer the HTTP trigger gives — `503` on a secret that is too
short to be one, `403` on a secret that is wrong, `404` on anything else.

The delivery half, on a deployed site:

```bash
# Through the scheduler endpoint: the Worker if there is one, the flush if not.
curl -sX POST 'https://www.bsdc.info.bd/api/push/run' \
  -H "authorization: Bearer $PUSH_FLUSH_SECRET"

# The fallback on its own.
curl -sX POST 'https://www.bsdc.info.bd/api/push/flush' \
  -H "authorization: Bearer $PUSH_FLUSH_SECRET"
```

The first answers with `"path":"worker"` or `"path":"local"`. `path: local` with
`workerUnavailable: true` means the forward was tried and did not answer — look at
the Worker's logs (`npx wrangler tail`) rather than at the site.

`{"waiting":0,"endpoints":0,...,"milliseconds":11}` means it is wired and nobody
is owed anything. `{"error":"push is not configured on this deployment"}` means
the Pages variable is missing. `{"error":"forbidden"}` means the secret does not
match the row in `bsdc.push_settings`.

Then, as a member: turn push on in Settings → Notifications, check the device
appears in the list, close every tab, and have somebody react to a post (or,
alone, `select bsdc.notify('<your uid>', '<another uid>', 'follow');` in the SQL
editor). Within the scheduler's interval the device should wake.

## 8. When it does not

| Symptom | Where to look |
| --- | --- |
| The switch is missing and the card says "no push key" | `VITE_PUSH_VAPID_PUBLIC_KEY` was not set **before the build**. Set it and redeploy. |
| The card says "needs a secure connection" | The site is open over http, or on a LAN address. Push is https-only, everywhere, for everybody. |
| The flush answers `forbidden` | The Pages secret and the `bsdc.push_settings` row disagree. Re-run step 2 with the same string. |
| The flush answers `503 … vapid keypair` | `PUSH_VAPID_PRIVATE_KEY` or `PUSH_VAPID_PUBLIC_KEY` is missing at the edge. |
| `waiting` is a positive number but nothing arrives | Read the response's `sent`, `failed` and `dead`. `failed` means the push service refused or was unreachable: the rows stay unmarked and are retried. `dead` means it answered 404/410 and the subscription was retired — the browser rotated its keys, and the member's next visit re-registers it. |
| Notifications arrive twice on one device | Two rows for one browser, which means two endpoints. The list in Settings shows both; remove one. |
| Nothing arrives on iOS | Safari on iOS delivers web push **only** for a site added to the home screen, and only from iOS 16.4. That is Apple's rule, not this code's. The card still shows the switch, because a home-screen install makes it work. |
| `/api/push/run` answers `"path":"local"` every time | `PUSH_WORKER_URL` is unset, or it points somewhere that does not answer. `curl` the Worker's `/health` directly. |
| The Worker's `/health` says `"status":"unconfigured"` | A VAPID secret is missing from the Worker. `npx wrangler secret list`. |
| The Worker answers `403` to its own cron | It never should. A `403` from `/run` means `PUSH_FLUSH_SECRET` in the Worker and `bsdc.push_settings` disagree — the secret was rotated in one place. |
| The service worker logs nothing at all | The service worker is registered as `prompt`, so a new one waits for the member to accept the update. The old worker keeps serving until they do. |

## 9. What was deliberately not done

- **No payload encryption in the *fallback*.** The Worker encrypts (RFC 8291) and
  is the primary path. The Pages Function sends an empty wake-up, which costs one
  extra request when a device wakes and is the path that keeps working when the
  Worker is not there. Both are shipped; neither is dead code.
- **Firebase Cloud Messaging (FCM HTTP v1) alongside Web Push.**
  `VITE_FIREBASE_VAPID_PUBLIC_KEY` (FCM Web Push) and `public.fcm_tokens`
  (Android app + FCM web fallback when `VITE_PUSH_VAPID_PUBLIC_KEY` is not set)
  are delivered by `push-worker/` using `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` over
  FCM HTTP v1 (`https://fcm.googleapis.com/v1/projects/bsdc-bd/messages:send`),
  while RFC 8291 Web Push remains primary whenever `VITE_PUSH_VAPID_PUBLIC_KEY`
  is present.
- **No OneSignal.** `VITE_ONESIGNAL_APP_ID` predates this and is not used.
- **No per-kind filtering of push.** The switches in Settings → Notifications
  decide which notifications are written at all; push delivers what was written.
  A member who turns off "messages" stops getting message pushes, because the row
  is never created — one decision, made in one place, rather than two that can
  disagree.
- **No re-keying from the worker.** On `pushsubscriptionchange` the worker
  re-subscribes so the device keeps something deliverable, but it does not tell
  the database, because it cannot prove whose device it is. The app re-registers
  whatever `pushManager` holds on every load, which is the only moment it can
  prove it, and the flush retires the old endpoint when the push service answers
  404.
