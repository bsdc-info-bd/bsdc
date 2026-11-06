# BSDC push worker

The reason a notification arrives on a phone whose browser is closed.

A Cloudflare Worker, on the free plan, that wakes a device with the words already
encrypted into the push. It is the primary delivery path; `main-site/functions/api/push/flush.ts`
is the fallback that sends an empty wake-up.

## What it does

| Trigger | What happens |
| --- | --- |
| **cron, every minute** (`scheduled`) | Reads what the database says is waiting, groups it per device, and sends one RFC 8291-encrypted push per device with the title, body, icon and path to open inside it. |
| **queue** (optional, off by default) | The same engine, for a burst the cron should not have to wait a minute for. |
| **`GET /health`** | Whether the deployment is configured. No secret required, no secret disclosed. |
| **`POST /run`** | An authenticated flush, for an operator or for `main-site/functions/api/push/run.ts` when it wants the words path. |

## What it never does

- It never holds a Supabase service key. Every database call is a `security
  definer` function gated on `PUSH_FLUSH_SECRET`, which the database checks.
- It never logs an endpoint, a payload or a token.
- It never sends to a device the database did not name for that notification.

## Layout

```
src/index.ts          the engine: scheduled, queue, fetch; grouping; marking
src/crypto.ts         RFC 8291: ECDH, HKDF, AES-128-GCM, the aes128gcm frame
src/deliver.ts        the ES256 VAPID token and the POST to the push service
src/notifications.ts  the words: per kind, per language, the summary
src/api.ts            the secret-gated RPC call, with a timeout
src/env.ts            the bindings, read once, validated
src/webcrypto.d.ts    the few Web Crypto types @cloudflare/workers-types omits
```

## Commands

```bash
npm ci
npm run typecheck        # tsc --noEmit
npm run lint             # prettier --check
npm run test             # 55 tests, no account and no network
npm run dev              # wrangler dev, locally
npm run deploy           # wrangler deploy
npm run tail             # follow the live log
```

## Secrets

Six, set once, never in this repository:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY      # anon, never the service key
npx wrangler secret put PUSH_FLUSH_SECRET      # >= 32 chars, same as bsdc.push_settings
npx wrangler secret put PUSH_VAPID_PUBLIC_KEY
npx wrangler secret put PUSH_VAPID_PRIVATE_KEY
npx wrangler secret put PUSH_VAPID_SUBJECT
```

The VAPID pair and the flush secret come from `npm run push:keys` in `main-site/`.
A flush secret shorter than 32 characters is treated as no secret at all and
`/run` answers `503` rather than pretending to be authorised.

## Free tier

One cron a minute is 1,440 invocations a day against 100,000. A run with nothing
waiting exits in milliseconds without contacting a push service. There is no paid
dependency anywhere in this package.

The whole path — the keys, the database half, the scheduler, what to look at when
it does not arrive — is in [`docs/push-runbook.md`](../docs/push-runbook.md).
