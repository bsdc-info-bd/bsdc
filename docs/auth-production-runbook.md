# Profile setup and OAuth recovery

## What this patch fixes

- Main-site CSP allowed neither the Google API loader nor the Firebase auth iframe. All three OAuth buttons use Firebase's popup/redirect machinery. The policy now permits those specific services, retains object/script restrictions, and uses `same-origin-allow-popups`.
- The configured RTDB is in `asia-southeast1.firebasedatabase.app`; the old CSP permitted only `firebaseio.com`. Regional HTTPS/WebSocket endpoints are now permitted.
- Firebase redirect completion errors were silently ignored. They now reach the login/signup alert, including actionable provider-configuration messages.
- Unsupported browser storage no longer triggers a doomed redirect retry. A blocked popup still uses Firebase's redirect fallback.
- GitHub sign-in requests `user:email`, including for members whose primary email is private.
- Login now waits for the profile read before deciding the destination, honors a safe `next` path, and defaults incomplete/new profiles to onboarding. Redirect normalization rejects external URLs and auth-route loops.
- Database requests await the Firebase `authenticated` claim; concurrent bootstrap work is shared, and stale account tokens/results are rejected. These are the profile-access fixes from the first investigation.
- The deployment now copies the provided service-account credential into the three **server-only** Cloudflare Pages production secrets needed by `/api/auth/claims`. Merely creating the rules-deployment secret never configured those runtime bindings in the old workflow.

No SQL/RLS or Firestore authorization checks are disabled.

## Deploying

1. Review and merge the session branch into `main` through the normal PR process. The session cannot push directly to `main`.
2. Keep `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` in repository Actions secrets or the `production` environment. Its JSON must be for `bsdc-bd` and must match `VITE_FB_PROJECT_ID`.
3. The production main-site deploy validates the credential and uploads `FB_PROJECT_ID`, `FB_CLIENT_EMAIL`, and `FB_PRIVATE_KEY` as encrypted Cloudflare Pages bindings. Preparation fails closed on a wrong project or malformed key. Temporary files are restricted to mode 0600, outside the checkout, removed even if upload fails, and never included in the web bundle. Other existing Pages secrets are not changed. PR/preview deploys do not sync production credentials.
4. That service account must have permission to update Firebase Authentication users/custom claims (for example `roles/firebaseauth.admin`). A credential authorized only to deploy Firestore rules is not necessarily authorized for Authentication. Do not grant browser users or the public Supabase key administrative permissions.
5. After uploading, the deploy checks `GET /api/auth/claims` on its deployment URL for `{ "ready": true }`. This proves the route and runtime bindings are present, **not** that upstream IAM, OAuth configuration, or a real login works.
6. Rerun **Deploy Firebase rules** now that the secret has been added. The agent attempted to dispatch it but GitHub returned `403 Resource not accessible by integration`; no successful rerun has been verified here.
7. Accept the service-worker update/reload before retesting. Old cached application code is not updated just by changing a secret.

## External settings required for Google, Yahoo, and GitHub

These settings cannot be inferred from a green build. The agent cannot inspect or change the live provider consoles from this sandbox.

### Firebase Authentication — project `bsdc-bd`

- Enable **Google**, **GitHub**, and **Yahoo** in Sign-in method.
- Configure the Google support email and each provider's correct client ID/client secret. Yahoo's OAuth client ID is not an unrelated application identifier. Do not paste secrets into chat or source control.
- Authorized domains must include every real login host, including `www.bsdc.info.bd`, `bsdc.info.bd` if used, and `bsdc.pages.dev` if used. A preview domain is not automatically authorized; do not authorize arbitrary wildcard hosts.
- Keep `VITE_FB_API_KEY`, `VITE_FB_PROJECT_ID`, and `VITE_FB_AUTH_DOMAIN` from the same member project. Check API-key application restrictions permit those site origins and the Identity Toolkit/Secure Token APIs.

### Provider callback URLs

For the currently documented auth domain `bsdc-bd.firebaseapp.com`, register this exact callback in the Google OAuth client, GitHub OAuth app, and Yahoo developer app:

```
https://bsdc-bd.firebaseapp.com/__/auth/handler
```

If `VITE_FB_AUTH_DOMAIN` differs, the callback must instead use that exact host. A provider's `redirect_uri_mismatch`, disabled-provider error, or invalid client secret cannot be repaired by JavaScript or by deploying Firestore rules.

### Browsers blocking third-party storage

This patch includes a fixed-upstream Pages proxy at `/__/auth/*` and excludes it from the offline app-shell fallback and database SEO redirects. To use same-origin redirect auth on the main production domain:

1. Deploy the proxy first.
2. Register `https://www.bsdc.info.bd/__/auth/handler` with **all three providers** and ensure the domain is authorized in Firebase.
3. Set `VITE_FB_AUTH_DOMAIN=www.bsdc.info.bd` and redeploy.
4. Test on Safari/a browser blocking third-party cookies. Main-domain same-origin setup does not automatically make a separate `pages.dev` host same-origin.

The patch deliberately does not silently change the auth domain: doing so before updating provider callbacks would break otherwise valid provider registrations. The proxy forwards only to the fixed `bsdc-bd` Firebase project, strips app authorization/cookies, and does not cache responses.

## Supabase profile access

Enable Firebase third-party authentication for `bsdc-bd` in the Supabase project. Firebase tokens must carry `role: authenticated`; the application role is `bsdc_role`. All existing migrations through 0038 must be applied. This patch requires no new migration and must not be “fixed” by granting anonymous profile writes.

## Live acceptance checks

1. Complete Google sign-in, GitHub sign-in (including private email), and Yahoo sign-in with authorized test accounts.
2. Block the popup and test redirect fallback. A redirect failure must show an alert rather than silently returning to an unchanged login form.
3. With a brand-new member, confirm `POST /api/auth/claims` succeeds, then complete profile setup, reload, and edit the profile.
4. Test an existing member and a legacy member token, sign-out during loading, and switching between two accounts. No previous member's profile should appear.
5. Confirm ordinary members still cannot edit another member, grant themselves roles, or write privileged profile fields.
6. If setup still fails, record the failing endpoint, HTTP status, and sanitized error code/message. Never share Authorization headers, tokens, private keys, or full personal records.

Useful distinctions: claims `503` means missing runtime configuration; claims `502` means the service-account exchange/update failed (inspect credentials and IAM); database `401` suggests Firebase/Supabase token integration; database `42501` after a successful claims refresh needs an RLS/grant review of the exact rejected operation.
