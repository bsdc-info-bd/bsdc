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

The current member-facing release uses the system document/photo picker for media and manual profile location labels. It does not request location, contacts, or camera permissions yet because no complete, access-controlled personalization or contact-discovery service has been deployed. This is intentional least privilege, not a missing fake feature.

Before enabling any of these capabilities, BSDC must provide:

- per-feature consent and revocation controls;
- a private Firebase schema and Rules path, never public profile fields for raw contacts or precise coordinates;
- trusted backend validation and retention/deletion policy;
- a data-minimizing location strategy (coarse or on-device personalization by default);
- opt-in contact discovery with normalized, salted/peppered server-side matching design and no raw address-book upload;
- a real in-app camera workflow if `CAMERA` is requested. System camera/photo-picker handoff should be preferred when it meets the use case.

## Environment progression

The active decision is to retain the shared Firebase schema. Development and staging isolation cannot be safely claimed until separate Firebase project/app configuration, App Check registrations, Cloudinary restrictions, and CI secrets are provisioned. The checked-in CI therefore validates source safely without fabricating environment credentials.
