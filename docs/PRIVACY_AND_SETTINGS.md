# BSDC member settings and analytics consent

BSDC keeps display, writing, feed, motion, and analytics choices in app-scoped DataStore preferences rather than inferring them from browsing behavior. These are product preferences, not a secret vault; credentials and sensitive identity material are never stored here.

## Analytics default and consent

Firebase Analytics is declared in the native dependency catalog, but `firebase_analytics_collection_enabled` is `false` in the Android manifest. It therefore starts disabled. The native Settings screen gives the signed-in member a clear **Allow analytics** / **Keep analytics off** choice.

When Firebase is configured, `BsdcApplication` observes the local consent value for the lifetime of the process and calls `FirebaseAnalytics.setAnalyticsCollectionEnabled(...)` on every grant or revocation. A change applies immediately; no account role, profile field, or staff privilege is involved. If Firebase is not configured, the safe configuration screen remains active and no analytics instance is initialized.

Crash/error diagnostics and operational security logs are deliberately not represented as a promise of anonymous analytics. Production policy must separately state what diagnostics are enabled, retention periods, legal basis, and supported deletion/access workflows before release.

## Versioned legal documents

Before authenticated community access, BSDC requires the current Terms of Use and Privacy Notice to be accepted. Acceptance is stored as immutable, account-bound Firestore records with a document version, Firebase server timestamp, locale, and native-app source. A trusted Firebase Function verifies both current records and issues an Authentication custom claim; Firestore and Realtime Database rules require that claim for community activity. The app does not treat a local checkbox or DataStore value as backend authorization.

See [`LEGAL_CONSENT_ARCHITECTURE.md`](LEGAL_CONSENT_ARCHITECTURE.md) for the exact records, rules boundary, release/version procedure, and the truthful current limitation on self-service export and account erasure. The app now supports recently reauthenticated export/erasure **requests**, but does not claim full export generation or deletion completion; see [`ACCOUNT_LIFECYCLE_REQUESTS.md`](ACCOUNT_LIFECYCLE_REQUESTS.md).

## Local experience controls

The Settings screen includes:

- System, light, and dark theme selection.
- English/Bangla writing-language preference.
- Reduced-motion preference.
- Ranked-feed toggle. Enabled uses the documented transparent local ranking/diversity layer; disabled preserves the backend order returned by the authorized public-feed query.

These controls are available offline. They make no network calls and do not silently change user profile fields.
