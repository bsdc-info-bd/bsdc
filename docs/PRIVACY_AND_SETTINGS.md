# BSDC member settings and analytics consent

BSDC keeps display, writing, feed, motion, and analytics choices in app-scoped DataStore preferences rather than inferring them from browsing behavior. These are product preferences, not a secret vault; credentials and sensitive identity material are never stored here.

## Analytics default and consent

Firebase Analytics is declared in the native dependency catalog, but `firebase_analytics_collection_enabled` is `false` in the Android manifest. It therefore starts disabled. The native Settings screen gives the signed-in member a clear **Allow analytics** / **Keep analytics off** choice.

When Firebase is configured, `BsdcApplication` observes the local consent value for the lifetime of the process and calls `FirebaseAnalytics.setAnalyticsCollectionEnabled(...)` on every grant or revocation. A change applies immediately; no account role, profile field, or staff privilege is involved. If Firebase is not configured, the safe configuration screen remains active and no analytics instance is initialized.

Crash/error diagnostics and operational security logs are deliberately not represented as a promise of anonymous analytics. Production policy must separately state what diagnostics are enabled, retention periods, legal basis, and supported deletion/access workflows before release.

## Local experience controls

The Settings screen includes:

- System, light, and dark theme selection.
- English/Bangla writing-language preference.
- Reduced-motion preference.
- Ranked-feed toggle. Enabled uses the documented transparent local ranking/diversity layer; disabled preserves the backend order returned by the authorized public-feed query.

These controls are available offline. They make no network calls and do not silently change user profile fields.
