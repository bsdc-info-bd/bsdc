# Play Store compliance

What Google Play requires of an app that creates accounts, stores personal data
and asks for camera, microphone and location — and where each requirement is met
in this repository, and how it is proved.

The rule for this document is the same as for the privacy policy: every claim
points at something that exists in the code, and a claim that stops being true
should fail a test rather than wait for a reviewer to notice.

| Requirement | Where it lives | Proved by |
| --- | --- | --- |
| Privacy policy, public URL | `/privacy` (`main-site/src/routes/PrivacyPage.tsx`, bilingual) | `src/test/privacy-page.test.tsx` |
| Terms of service, public URL | `/terms` (`main-site/src/routes/TermsPage.tsx`, bilingual) | `src/test/terms-page.test.tsx` |
| In-app account deletion | Settings → Delete account (web) and Settings → Delete your account (Android) | `scripts/db-prove/t78.mjs`, `src/test/delete-account.test.ts` |
| Deletion reachable without support | deletion is an RPC + client call, no staff step | `supabase/migrations/0119_*.sql` |
| Data safety answers | this document, "Data safety" below | `scripts/db-prove/t78.mjs` (the deletion list is the data list) |
| Prominent disclosure for sensitive permissions | privacy policy sections `location`, `camera`, `microphone`; in-app rationale before the first request | `src/test/privacy-page.test.tsx` |
| Target API level 35 | `android-app/app/build.gradle.kts` (`targetSdk = 35`) | CI build |
| No cleartext traffic | `network_security_config.xml` + `android:usesCleartextTraffic="false"` | CI build |
| Backup disabled for sensitive stores | `backup_rules.xml`, `data_extraction_rules.xml`, `allowBackup="false"` | CI build |
| No hidden data collection | no analytics tag, no advertising pixel, no third-party session recorder | checkpoint in `scripts/audit.mjs` |

## Account deletion

Google Play's requirement is that a user who created an account in the app can
ask for the account and its data to be deleted **without reinstalling the app,
without leaving it, and without contacting support**. Both clients now do this.

**What happens, in order**

1. `public.delete_my_account()` runs with the member's own token
   (`supabase/migrations/0119_a_member_can_delete_their_own_account.sql`).
   It refuses anonymous callers and the owner account, deletes the member's
   content, social graph, behavioural traces, private records and device tokens,
   suspends and strips any vendor or shop row, scrubs finished orders, and
   replaces the profile row with a tombstone: no name, no handle, no photo, no
   location, no role, `status = 'deleted'`.
2. The client deletes the Firebase user.
3. The client clears the local session.

The order is forced: the database call is authorised by the Firebase ID token,
so it has to run while the login still exists. If step 2 fails, the data is
already gone and the client signs out anyway, telling the member to sign in once
more and repeat — the RPC is idempotent, so a second run is harmless.

**Why the profile row is not hard-deleted.** `public.orders.uid` references
`profiles` `on delete restrict`, and an order belongs to the vendor as much as to
the buyer. The policy says order and payment records are retained "in a form that
no longer identifies you" — the tombstone is that form.

**The owner account.** Refused, with 42501. Ownership has to be transferred
through the people console first. This is deliberate: a self-service path to
deleting the only owner would be a way to lock the community out of its own
database.

## Data safety

The Play Console form asks what is collected, why, whether it is shared, whether
it is encrypted in transit, and whether the user can request deletion. The
answers below follow the schema, not a template.

**Encrypted in transit.** Yes, all of it. HTTPS only; cleartext is disabled in
the manifest and blocked by the network security config.

**Data types collected**

| Play category | What it is here | Purpose | Optional? |
| --- | --- | --- | --- |
| Personal info — name | `profiles.display_name`, `profiles.username` | account management, public profile | required to have an account |
| Personal info — email | Firebase Auth, `profiles` mirror | sign-in, verification, security notices | required |
| Personal info — phone | `addresses.phone`, `orders.phone`, `mk_orders.customer_phone`, vendor application `mobile` | delivery of a marketplace order | only when ordering |
| Personal info — address | `addresses.*`, order delivery snapshots | delivery | only when ordering |
| Personal info — government ID | `mk_vendor_applications.nid_number` | vendor identity check, required by the payment process | only for vendors |
| Photos | `media_assets`, avatars, covers, product images | the member's own content | optional |
| Messages | `messages`, `conversations` | the messenger | optional |
| Audio / video / camera | captured only when the member records a clip or takes a photo in the composer | content creation | optional, permission asked at use |
| Location — approximate and precise | `LocationField`, order `lat`/`lng`, `place_label` | delivery area, "near me" marketplace discovery | optional; the app works without it |
| Financial info | `mk_credit_ledger`, `ad_credit_ledger`, bKash transaction references | payments for credit, accounting | only when buying credit |
| App activity — content | posts, comments, reactions, bookmarks, search terms (`search_log`) | the product itself | optional |
| Device or other IDs | `fcm_tokens`, `push_subscriptions` | push notifications | optional; the app works without push |
| Diagnostics / crash | none collected by the app | — | — |

**Not collected.** No advertising ID, no contacts, no calendar, no SMS, no call
log, no health data, no web browsing history, no third-party analytics SDK. The
absence is not a promise: `scripts/audit.mjs` fails if an analytics or
advertising tag appears in the web app, and the Android build has no analytics
dependency (`android-app/gradle/libs.versions.toml`).

**Shared with third parties.** Data is processed by Firebase (authentication,
push delivery), Supabase (database), Cloudflare (hosting) and **ImgBB** — the
image host that stores uploaded pictures, which receives the file from our own
upload endpoint and returns the address the app displays. Nothing is sold, and no
data goes to an advertising network. The privacy policy names all four in both
languages, and checkpoint K-08 fails if the image host stops being disclosed.

**Deletion.** Self-service, in-app, immediate, as described above. Users can also
request deletion by writing to the support address, and both paths lead to the
same RPC.

## Sensitive permissions and prominent disclosure

| Permission | Why it is declared | Disclosure |
| --- | --- | --- |
| `CAMERA` | QR scanning, taking a photo in the composer, avatar upload | declared optional in the manifest, requested at the moment of use, explained in the privacy policy `camera` section |
| `ACCESS_FINE_LOCATION` | delivery address picker, "near me" discovery | requested when the member opens the picker, never at launch, never in the background |
| `ACCESS_COARSE_LOCATION` | same, with lower precision | same |
| `POST_NOTIFICATIONS` | order and message notifications | explained in the notifications panel; the app is usable if refused |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | the order alarm player | declared with its type, as API 34+ requires |

**Microphone is not declared at all.** Voice search issues
`Intent.ACTION_RECOGNIZE_SPEECH`, which hands the recording to the device's own
speech service — that app holds `RECORD_AUDIO`, not this one. Nothing in the
Android sources opens an `AudioRecord` or a `MediaRecorder`. Declaring the
permission would have asked for a sensitive capability the app does not use,
which Play's permissions policy treats as a defect; it was removed, together with
the rationale copy that described it, and the privacy policy now says so in both
languages. Checkpoint K-07 keeps it out.

Location is never requested in the background, and no `ACCESS_BACKGROUND_LOCATION`
permission is declared. Coordinates sent to the database are rounded to two
decimal places (`GeoCoordinatePrivacy.roundTwoDecimals`) before they leave the
handset.

## Decisions recorded rather than hidden

**No microphone permission.** See above: the system recogniser owns it.

**"Full screen intent" for the order alarm.** `USE_FULL_SCREEN_INTENT` is a
restricted permission Play grants for alarms, calls and similar interruptions.
It is used for one thing — a new marketplace order ringing on a locked handset —
and the request states that. If Play refuses the grant the alarm still posts as a
heads-up notification; nothing else depends on it.

**Media-playback foreground service for an alarm sound.** Android has no
"alarm" foreground-service type; `mediaPlayback` is the type that matches keeping
an audio loop alive with the screen off, and the service is declared with it.

## What a reviewer should click

1. Open `/privacy` and `/terms` — both render in English and Bangla, no sign-in.
2. In the app: Settings (gear) → **Legal** → privacy policy and terms open in a
   custom tab.
3. In the web app: Settings → **Delete account** → the panel states what is
   deleted and what is kept, and the confirm button stays disabled until
   `DELETE` is typed.
4. In the app: Settings → **Delete your account** → same wording, same typed
   confirmation.
