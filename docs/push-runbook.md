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

**The wake-up carries no payload.** A push with a body has to be encrypted for
that one subscription (RFC 8291: an ECDH key agreement against the browser's
`p256dh`, an HKDF derivation with its `auth` secret, AES-128-GCM over the bytes,
and a `Content-Encoding: aes128gcm` header). It is doable at the edge, and it is
the sort of thing that fails silently: a browser that cannot decrypt the payload
fires a push event with nothing in it, and the only symptom is a notification
that never appears. An empty body is the one case the specification sends
unencrypted, so there is nothing to get wrong, and the device asks what it missed
instead — which also means a phone that was asleep for a day gets **one**
summary rather than nine separate buzzes.

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
scheduler ──POST /api/push/flush──► Pages Function
        │        Authorization: Bearer <PUSH_FLUSH_SECRET>
        ▼
rpc push_pending(secret, limit)  ── the database checks the secret, then
        │                           returns (notification, uid, endpoint) rows
        │                           where pushed_at is null and the device is live
        ▼
one POST per distinct endpoint to the push service
        │        Authorization: vapid t=<ES256 JWT>, k=<public key>
        │        TTL: 86400, no body
        ▼
the browser wakes the service worker                      (browser closed, phone
        │                                                  in a pocket — it works)
        ▼
sw.ts ──POST /api/push/content──► Pages Function
        │        { endpoint }        rpc push_content(endpoint, limit)
        ▼                            returns what this device has not been told,
showNotification()                   and moves its watermark
        │
        ▼
the member taps it ──► the tab on that page is focused, or the tab is navigated,
                       or a window is opened. Never a second copy of the app.
```

The database marks `pushed_at` only for notifications whose device was actually
reached. A push service that was merely unreachable leaves the row waiting, and
the next run tries again — a run that fails halfway repeats rather than drops.

## 3. Every piece, and where it lives

| Piece | File | What it is |
| --- | --- | --- |
| Tables and routines | `supabase/migrations/0060_push_reaches_a_closed_browser.sql` | `public.push_subscriptions`, `bsdc.push_settings`, `notifications.pushed_at`, and the seven routines |
| Proof | `main-site/scripts/db-prove/t31.mjs` | 38 checks: refusals before setup, ownership, the watermark, the kill and the revival |
| Delivery | `main-site/functions/api/push/flush.ts` | the flush, `POST /api/push/flush` |
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

4. **Add the scheduler** — [next section](#5-the-scheduler).

## 5. The scheduler

Cloudflare Pages Functions have no cron handler of their own, so the flush is an
ordinary authenticated `POST` that anything can make. Five minutes is a good
interval: often enough that a notification feels immediate, rarely enough that a
member with nothing waiting is never contacted at all.

The scheduler that lives in the same account is a Worker:

```toml
# wrangler.toml
name = "bsdc-push-flush"
main = "src/worker.js"
compatibility_date = "2026-01-01"

[vars]
SITE_URL = "https://www.bsdc.info.bd"

[triggers]
crons = ["*/5 * * * *"]
```

```js
// src/worker.js
export default {
  async scheduled(_event, env, _ctx) {
    const response = await fetch(`${env.SITE_URL}/api/push/flush`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.PUSH_FLUSH_SECRET}` },
    });
    if (!response.ok) {
      // Nothing to retry here: the rows that were not marked are still waiting,
      // and the next run picks them up.
      console.error('push flush', response.status, await response.text());
    }
  },
};
```

`PUSH_FLUSH_SECRET` goes in the Worker's own encrypted secrets
(`wrangler secret put PUSH_FLUSH_SECRET`). Any other scheduler will do — a GitHub
Action on a schedule, a cron job on a machine that is always on, an uptime
checker that POSTs — because the endpoint does not care who is asking, only that
they know the secret.

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

The delivery half, on a deployed site:

```bash
curl -sX POST 'https://www.bsdc.info.bd/api/push/flush' \
  -H "authorization: Bearer $PUSH_FLUSH_SECRET"
```

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
| The worker logs nothing at all | The service worker is registered as `prompt`, so a new one waits for the member to accept the update. The old worker keeps serving until they do. |

## 9. What was deliberately not done

- **No payload encryption.** See [§1](#1-why-it-is-built-this-way). The cost is
  one extra request when a device wakes; the benefit is that nothing in the
  delivery path can fail quietly.
- **No Firebase Cloud Messaging.** `VITE_FIREBASE_VAPID_PUBLIC_KEY` is still in
  `.env.example` because a deployment may already hold one, but it signs only for
  Firebase's service, and this path signs for every push service directly. FCM
  endpoints work with it — they are ordinary Web Push endpoints.
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
