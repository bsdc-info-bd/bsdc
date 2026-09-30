# BSDC native Android product boundary

This document records the active product decisions for the native BSDC Android client. It is deliberately specific so the APK cannot quietly become a website wrapper or an unsafe staff tool.

## Active backend boundary

BSDC Android uses the existing BSDC Firebase schema and protected paths for member-facing data:

- Firebase Authentication for identities
- Cloud Firestore for profiles, posts, organizations, notifications, and durable publishing data
- Realtime Database for live conversations, messages, and typing state
- Firebase Functions for trusted notifications, counters, and scheduled publication

The mobile client does not depend on a website runtime, web UI bundle, browser session, WebView, or web-only API. Existing Firebase paths remain the chosen shared product data contract.

## External links

No website App Link is registered in the Android manifest. FCM notification navigation is delivered through the app-owned `bsdc_target_path` extra rather than a browser URL.

Before enabling a future external link, BSDC must choose an Android-owned link domain and complete all of the following:

1. Obtain domain ownership approval.
2. Publish a reviewed `/.well-known/assetlinks.json` with the production signing certificate SHA-256.
3. Add the exact HTTPS host/path scope to the manifest.
4. Test verified-link behavior with production and non-production signing keys.
5. Document the privacy and account-linking consequences.

## Privileged operations

No email address, passkey, or client-side flag grants administrator powers. In particular, `rrc@bsdc.info.bd` is not embedded as an admin identity in the APK. Any future staff capability must use a trusted custom-claim issuance process plus Firebase Functions or a separately secured staff application.

## Sensitive permissions

Location, address-book contacts, and camera access are high-risk capabilities. They must be requested only after a member starts a clearly named feature and accepts a just-in-time explanation of purpose, data flow, retention, and revocation. They must never be requested at first launch or used to create a hidden profile.

The member profile now exposes three separately disclosed, off-by-default tools. They are not requested at first launch:

- **Camera profile photo:** the member asks to capture a photo, then Android requests `CAMERA`. The photo is buffered in app cache and uploaded as the member’s public profile image only after that requested capture succeeds. The member can remove the public profile reference and disable future camera use.
- **Approximate city suggestion:** the member asks to use `ACCESS_COARSE_LOCATION` once. The app uses the device location and geocoder only in memory to suggest a city label; the member reviews it before saving. Latitude, longitude, accuracy, and timestamps are never written to Firebase or used for feed ranking. Revoking the feature removes the public `locationLabel`; the Android permission itself can additionally be revoked in system settings.
- **One-contact invite:** after an explicit disclosure and `READ_CONTACTS` grant, Android’s contact picker selects one recipient. The app reads that recipient only to prefill an external email or SMS draft. It does not upload, hash, match, cache, or persist any contact fields. This is an invite handoff, not an unsafe claim that BSDC has server-side contact discovery.

Each acknowledgement is stored locally in DataStore and can be turned off independently. These local switches never override Android’s runtime permission system. Raw contacts and precise coordinates have no Firestore schema or Rules path.

### Retention and production operation

Profile image object deletion requires Cloudinary administrative credentials and therefore cannot safely happen in an APK. Removing a photo immediately removes its public Firestore reference. Before a production upload preset is enabled, operations must enforce a Cloudinary lifecycle/cleanup policy (or a trusted backend deletion worker) for unreferenced profile image objects, and document its retention period. The unsigned preset must continue to restrict folder, MIME/resource type, transformations, size, and abuse controls server-side. This remaining operational control is tracked as a production prerequisite rather than being hidden behind a client-side secret.

Any future **contact discovery** must be a separate reviewed backend feature with normalized, salted/peppered server-side matching, no raw address-book upload, private Rules, retention/deletion controls, and a new consent flow. It must not reuse the one-contact invite path.

## Environment progression

The active decision is to retain the shared Firebase schema. Development and staging isolation cannot be safely claimed until separate Firebase project/app configuration, App Check registrations, Cloudinary restrictions, and CI secrets are provisioned. The checked-in CI therefore validates source safely without fabricating environment credentials.
