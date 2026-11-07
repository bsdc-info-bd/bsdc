# BSDC Main Admin Panel

- **Folder**: `admin-site/`
- **Cloudflare Pages project**: `bsdc-admin`
- **Domain**: admin.corporate.main.bsdc.info.bd
- **Access**: Staff only (manager and above; branding is administrators only)
- **Delivered in**: Response 18 of the 20-response build plan

The SEO centre and the branding studio: everything the site tells search engines, and everything a visitor sees of its identity.

## What it contains

- **Pages** — the metadata any path on the site is currently serving, resolved
  by the same `seo_for_path()` the edge calls, with a search-result preview,
  a list of what is wrong with it, and an override stored against the
  canonical path.
- **Redirects** — moving a URL, with chains and loops refused before the
  round trip and again by `set_redirect()`, and hit counts so a redirect that
  earns nothing can be retired.
- **Sitemap** — how many public URLs exist, section by section, counted with
  the same conditions the pages use.
- **Branding** — the palette, checked for WCAG contrast here and again in
  Postgres, with a wordmark drawn from the tokens and a theme that goes live
  only when an administrator says so.
- **Approvals** — the two review queues, shops and campaigns, worked oldest
  first, with a refusal that has to carry a reason the owner will read.
- **Campaigns** — the campaign builder. Staff choose the advertiser, the bid,
  the budget and the dates; the form checks every constraint the table enforces
  and shows what the budget actually buys, computed with the same integer
  truncation the wallet charges with (`bsdc.ad_event_cost`, and `t51` holds the
  three implementations of that arithmetic to each other). The owner is issued
  an account with `scripts/issue-advertiser.mjs` and reads their own
  performance from `main-site/ads`; they can pause and resume, and edit copy,
  but cannot create a campaign, change a bid, change a budget or top up a
  wallet.

The governance centre that the earlier plan sketched for this folder —
command centre, users, content oversight, marketplace, ads and analytics —
ships inside `main-site` under `/admin`, where it shares the session,
permissions and plugin registry with the rest of the platform.

## Stack

Vite 5 + React 18 + TypeScript 5 (strict), compiling `../corporate-kit/src`
through the `@kit` alias like every other corporate console, with its own
`package.json` and `.env.example`. Deployed independently as its own
Cloudflare Pages project.

## Databases

Supabase Postgres (primary SQL) + Firebase Realtime Database (realtime) +
Firestore (small config/cache). Staff apps authenticate against the
`bsdc-second` Firebase project with role claims, master-passkey gating for
destructive actions and writes to the shared `staff_audit_log`.

## Issue an advertiser and book a campaign

Account issuance is a staff-only command, run from the repository root on a
trusted machine with Node 20 or newer. The member site signs in with Firebase
project `bsdc-bd`; the corporate consoles use the separate `bsdc-second`
project. Creating a Supabase Auth user does **not** create a member-site login.

Supply these environment variables through your secret manager or an existing
protected shell environment (do not commit them):

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`):
  the same database endpoint and public key used by the console.
- `VITE_FB2_API_KEY`, `BSDC_STAFF_EMAIL` and `BSDC_STAFF_PASSWORD`: the
  corporate Firebase API key and a staff sign-in. The staff profile must be
  active, able to use the corporate console, and have `ads.manage` in the
  database; the command checks that permission before using the admin account.
- `FIREBASE_SERVICE_ACCOUNT_BSDC_BD`: the complete JSON for a service account
  belonging to `bsdc-bd`, with permission to look up and create Firebase Auth
  users (`firebaseauth.users.get` and `firebaseauth.users.create`). Keep its
  private key out of source control and logs. It is used locally to obtain a
  short-lived Identity Toolkit token; it is never sent to the database or the
  advertiser's browser.

```sh
# Validate configuration and arguments without making any network requests.
node scripts/issue-advertiser.mjs --name "Example business" --email ads@example.test --generate --dry-run

# Create or find the Firebase identity and issue its database profile.
node scripts/issue-advertiser.mjs --name "Example business" --email ads@example.test --generate
```

For a new account, the generated password is printed **once**. Deliver it over
an appropriately secure channel, and direct the advertiser to
`https://www.bsdc.info.bd/auth/login`. The address is not marked verified:
the advertiser should use the site's verification flow after sign-in. If the
address already has a member Firebase account, the command reuses it without
changing its password or verification state and does not print a generated
password. If account creation succeeds but profile creation fails, retry the
command; it will not reset the existing password. If a newly generated password
was lost, use the normal Firebase password-reset flow. Prefer `--generate` to
putting a password in shell history or a process argument.

In **Campaigns**, search for the newly issued advertiser by name, handle or
Firebase UID. Record a received payment with its provider/bank reference; a
retry with the same reference and amount for that wallet is idempotent. Staff
then set the bid, budget, dates, targeting and creative. The builder can create
a draft or, if funded and supplied with a creative, create and approve it
atomically. A draft without a creative can be opened in the campaign book to
add one and send it to **Approvals**. Staff review and approve there.

The advertiser's `/ads` page contains only their reporting, pause/resume and
copy editing. Saving copy sends even a paused campaign back to staff review.
Campaigns share the owner's wallet: charges stop when the wallet or a daily
cap is exhausted, so several approved campaign budgets are not a reservation
of separate funds. Replenishing a wallet is always a staff action backed by a
received payment.
