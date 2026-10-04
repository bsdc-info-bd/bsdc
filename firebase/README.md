# Firebase configuration

Two projects are in use:

| Project       | Used by                         | Purpose                                                                         |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `bsdc-bd`     | main-site, android-app, vf-site | Authentication, Realtime Database presence, the Firestore profile cache and FCM |
| `bsdc-second` | the thirteen corporate apps     | Staff authentication and corporate realtime channels                            |

## Files

- `firestore.rules` — deny by default. Public read for the profile cache and the
  username index, writes restricted to the owning member, role and moderation
  fields rejected outright.
- `database.rules.json` — presence, typing indicators and public counters only.
  Every other path is closed.

## Deploy

Merging a change to `firebase/**` or `firebase.json` into `main` runs the
**Deploy Firebase rules** workflow. It deploys both policy files to `bsdc-bd`
with the protected `FIREBASE_SERVICE_ACCOUNT_BSDC_BD` Actions secret, so a
profile-rule change reaches production with the app code that depends on it.
The workflow fails rather than silently skipping a deploy when that credential
is absent.

For a deliberate local recovery, authenticate the Firebase CLI with a service
account for `bsdc-bd`, then run:

```bash
firebase deploy --only firestore:rules,database --project bsdc-bd
```

Realtime Database is deliberately kept small: Supabase Postgres is the source
of truth for durable data, Firestore holds the fast profile cache, and the
Realtime Database carries only ephemeral signals.
