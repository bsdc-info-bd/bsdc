# BSDC Security Policy

## 1. Secret classification

### Public (safe in the client bundle, prefixed `VITE_`)

| Variable | Purpose |
|---|---|
| `VITE_FB_*` | Firebase `bsdc-bd` web config (main site + Android) |
| `VITE_FB2_*` | Firebase `bsdc-second` web config (corporate apps) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key — RLS enforced |
| `VITE_FIREBASE_VAPID_PUBLIC_KEY` | FCM web push public VAPID key |
| `VITE_ONESIGNAL_APP_ID` | OneSignal app id (manual admin broadcasts only) |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UNSIGNED_PRESET` | Cloudinary unsigned upload preset |
| `VITE_IMGBB_API_KEY` | imgbb upload key |

### Server-only (Cloudflare Pages encrypted environment variables ONLY)

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_HOST`,
`SUPABASE_DB_USER`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`ONESIGNAL_REST_API_KEY`, `FCM_SERVICE_ACCOUNT_JSON`, `CRON_SECRET`,
`MASTER_PASSKEY`, `ADS_DASHBOARD_PASSKEY`, `BKASH_NUMBER`,
`VENDOR_ORDER_EMAIL_ENDPOINT`, `ANDROID_KEYSTORE*`.

**Rules**

1. Server-only secrets are never written to source files, never committed, never
   logged, and never returned by an API response.
2. Pages Functions read them through `context.env` at request time.
3. Passkeys are compared server-side with constant-time comparison and are
   rate-limited per IP and per account.
4. `.env`, `.env.local`, `.env.*.local` and service-account JSON files are
   gitignored in every app.
5. CI runs `gitleaks`; a commit containing a secret pattern fails the build.

## 2. Pre-launch rotation checklist (mandatory)

Credentials shared during authoring must be rotated before the commercial
launch, then updated in Cloudflare Pages:

- [ ] Rotate Supabase database password and service-role key
- [ ] Rotate Cloudinary API key + secret, re-create the unsigned preset
- [ ] Rotate the OneSignal REST API key
- [ ] Re-issue the FCM service account JSON, delete the old key
- [ ] Rotate `MASTER_PASSKEY` and `ADS_DASHBOARD_PASSKEY`
- [ ] Review Firebase API key referrer/app restrictions
- [ ] Re-verify Supabase RLS policies with the anonymous role
- [ ] Confirm `gitleaks` history scan is clean

The same checklist is mirrored in the admin panel under **Security → Key
rotation**, with per-item completion tracking.

## 3. Application hardening

- Strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  shipped via each app's `public/_headers`.
- Markdown passes `rehype-sanitize` and a final DOMPurify pass; no `innerHTML`.
- Every input validated with Zod on client and again inside Pages Functions.
- Row Level Security on every Supabase table, default deny.
- All staff actions written to the shared immutable `staff_audit_log`.
- Uploads validated by MIME type, magic bytes and size caps.

## 4. Reporting a vulnerability

Email **hello@bsdc.info.bd** with the subject `SECURITY`. Please include
reproduction steps and affected URLs. Do not open a public issue. We acknowledge
reports within 72 hours.
