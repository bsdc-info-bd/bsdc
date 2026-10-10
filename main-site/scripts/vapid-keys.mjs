#!/usr/bin/env node
/**
 * `npm run push:keys` — the three strings web push needs, and where each goes.
 *
 * A VAPID keypair is not a credential in the usual sense. The public half is
 * compiled into the site bundle and handed to every browser that subscribes: it
 * is how the browser knows which key to encrypt a future payload for, and how a
 * push service checks that this site is the one that asked. The private half
 * signs a token on every delivery and never leaves Cloudflare.
 *
 * The flush secret is the other thing here, and it is a credential in every
 * sense: it is what makes `/api/push/flush` a delivery run rather than a public
 * endpoint. The same string has to live in two places — the encrypted Pages
 * variable and the row in `bsdc.push_settings` — because the edge holds one and
 * the database checks the other, and no function in `functions/` is given the
 * Supabase service key.
 *
 * Nothing is written to disk. Run it once per deployment; re-running makes a new
 * keypair, and subscriptions taken with the old one stop being deliverable, so
 * do not re-run it on a live site without a reason.
 */
import { randomBytes, webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

function toUrlBase64(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
const point = await subtle.exportKey('raw', pair.publicKey);

const publicKey = toUrlBase64(point);
const privateKey = toUrlBase64(pkcs8);
const flushSecret = randomBytes(32).toString('base64url');

const line = '─'.repeat(72);

console.log(`
${line}
BSDC web push — generated ${new Date().toISOString()}
${line}

1. Cloudflare Pages → main-site → Settings → Environment variables
   (all four are "Encrypt"; the first is also needed at build time, so set it
   for the production branch and redeploy)

   VITE_PUSH_VAPID_PUBLIC_KEY=${publicKey}
   PUSH_VAPID_PUBLIC_KEY=${publicKey}
   PUSH_VAPID_PRIVATE_KEY=${privateKey}
   PUSH_FLUSH_SECRET=${flushSecret}

   Optional, and worth setting: the address a push service complains to.
   PUSH_VAPID_SUBJECT=mailto:rrc@bsdc.info.bd

2. Supabase → SQL editor — the same secret, where the database can check it.
   It is stored in a table with row level security on, no policies and no
   grants, so nothing but the push functions can read it.

   insert into bsdc.push_settings (name, value)
   values ('flush_secret', '${flushSecret}')
   on conflict (name) do update set value = excluded.value;

3. A scheduler. Pages Functions have no cron handler of their own, so anything
   that can make an HTTP request will do; a Cloudflare Worker with a cron
   trigger is the one that lives in the same account:

   [triggers]
   crons = ["*/5 * * * *"]

   and in the Worker:

   export default {
     async scheduled(_event, env) {
       await fetch(env.SITE_URL + '/api/push/flush', {
         method: 'POST',
         headers: { authorization: 'Bearer ' + env.PUSH_FLUSH_SECRET },
       });
     },
   };

4. Prove it. The answer is a count, never a value:

   curl -sX POST 'https://www.bsdc.info.bd/api/push/flush' \\
     -H 'authorization: Bearer ${flushSecret}'

   With nothing waiting it says {"waiting":0,...}. A member who has turned push
   on and then had something happen to them is the real test.

${line}
Keep this page out of any repository, issue or screenshot: two of the four
strings above are private to this deployment.
${line}
`);
