# Listing editing and applying, in the Android app

Branch `arena/bfeecad3-bsdc`. This is the record of what was built and what was decided, so the next
person does not have to re-derive why an editor looks the way it does.

## The complaint

The app had no editing for gigs or roles. The owner card on both listing pages ended in a button
labelled **"Edit on the web"**, which opened a browser where the member finished what they had started
on the phone. The same was true of an event page. Meanwhile the job application and the gig bid were
five raw text fields inside an `AlertDialog`, with one combined sentence of validation for all of them.

The framing that matters: an "edit on the web" button is not a design choice. It is a gap, named.

## What was already there

Both write paths existed and were reachable from the app, and were never called by a screen:

| Routine | Migration | Arguments |
| --- | --- | --- |
| `update_gig` | `0128_a_listing_learns_to_be_edited.sql` | title, description, budget bounds, hourly, days, skills, cover |
| `update_job` | same | title, company, description, type, mode, level, city, salary band + period, skills, apply link, closing date, cover |
| `update_event` | same | title, description, two instants, mode, venue, city, join link, cover, timezone, capacity |
| `apply_to_job` | `0013`/`0088` | every applicant column, including the ones the app never asked for |

So this was a forms-and-rules task, not an RPC-plumbing task.

## The four screens

* `MkGigEditSheet` + `GigEditLogic` — mounted from `GigDetailScreen`.
* `MkJobEditSheet` + `JobEditLogic` — mounted from `JobDetailScreen`.
* `MkEventEditSheet` + `EventEditLogic` — mounted from `EventDetailScreen`, replacing its own signpost.
* `MkJobApplySheet` and `MkGigProposalSheet` — replacing the two `AlertDialog`s, with the application
  carrying the whole field set the routine already accepted.

Each editor seeds from the published row, compares a payload rather than raw text to decide whether
Save means anything, writes through the existing routine, and reloads by bumping a nonce — because each
routine trims, canonicalises and hands back the slug it kept, so what must appear on screen is the row the
database holds rather than the text that happened to be typed.

## Decisions, with the damage each one prevents

1. **An empty budget, salary or capacity box sends `null`, never `0`.** The routines read the two
   differently: null is "not stated", 0 is "this pays nothing" (and for capacity, "no seats").
2. **`update_job` overwrites `expires_at` whatever it is sent**, so clearing the closing-date box
   genuinely re-opens a closed role. The sheet says that beside the field and offers one-tap deadlines,
   instead of hiding the only way to re-open a posting.
3. **A job or gig deadline accepts a bare date (read as 23:59 in `Asia/Dhaka`); an event does not.**
   A deadline can mean "throughout that day"; an event's start is announced to other people, so an
   invented midnight would tell every attendee the wrong hour. `update_event` notifies everyone who had
   not declined when `p_starts_at` moves — which is why the event sheet's subtitle says so.
4. **Skills leave in the canonical form and arrive on screen as typed.** `ListingTags.normalise`
   mirrors `skills.ts` (trim, collapse whitespace, lower-case, deduplicate, sort), which is what
   migration 0103 put in the column and what the skill filters match. The create path had been trimming
   and capping but *not* lower-casing, so a member who typed "Kotlin" wrote a row the app's own filters
   could not find. That was a live bug, fixed by the same commit that gave the tag field its rules.
5. **Two tag rule sets, both read from a call site, never invented:** `ListingTags.LISTINGS` is
   `TagInput.tsx`'s own 20-of-32 kept as typed; `ListingTags.APPLICATIONS` is the apply form's
   `max={30} maxLength={64}` with `normaliseSkills` on every change.
6. **Ownership is never pre-checked.** The routines answer `42501`; the app shows one translated
   sentence. A host who turns out to be a group moderator, or a member whose gig was closed by staff,
   reads the truth instead of a missing button.
7. **Every refusal each routine can raise is mapped to a bilingual sentence**, so no screen pastes
   `err.localizedMessage` any more. `GigEditLogicTest`, `JobEditLogicTest` and `EventEditLogicTest`
   walk the whole list in both languages, which is only possible because the sentences are asserted
   against the migration text they come from.
8. **A cover is a URL, and blank means remove.** `assert_listing_cover('')` returns `''`, so the box is
   sent as typed and clearing it is a real edit. The photo picker is offered when a `BsdcMediaRepository`
   was handed to the screen; without one the box still behaves exactly as the web's does.
9. **`GigDto` gained `coverUrl`.** The detail endpoint has selected it since 0128. An editor that could
   not see a cover could not offer to keep one — and a blank box would otherwise have looked correct
   while quietly deleting the picture.

## Shared atoms

`core/designsystem/BsdcFormKit.kt` now holds `BsdcFormSection`, `BsdcFormText`, `BsdcFormNumber`,
`BsdcFormChoiceRow`, `BsdcFormSwitchRow`, `BsdcFormTagField`, `BsdcFormChecklist`, `BsdcFormReviewRow`,
`BsdcChecklistItem`, `BsdcFormChoice` and `BsdcEditSheet`.

They live there because `core:designsystem` is the only module both `feature:discover` and
`feature:compose` already depend on. The modern form helpers inside `feature/compose` are `internal` to
that module and the dependency edge runs `compose → feature:feed`, so they could not be reused and were
not copied. `MkListingCoverField` (in `feature/discover`) is the one composite the three editors share.

Nothing in `BsdcFormKit.kt` decides anything: no limits, no validation, no payloads. Those live in
`GigEditLogic`, `JobEditLogic`, `EventEditLogic`, `JobDetailLogic` and `ListingTags`, where they can be
tested and where the create screens already read them.

## Tests

| File | What it pins |
| --- | --- |
| `core/common/…/ListingTagsTest.java` | the tag rules, both rule sets, canonicalisation, and four assertions read out of `TagInput.tsx`, `skills.ts` and `JobApplicationForm.tsx` themselves |
| `feature/discover/…/GigEditLogicTest.kt` | the gig rules, the payload semantics, every refusal sentence, limits against `ComposerValidationEngine.java` and `CREATE_LIMITS` |
| `feature/discover/…/JobEditLogicTest.kt` | the job rules, the deadline rules at a fixed instant, the four option tables against `create.options` in `en.ts` **and** `bn.ts` |
| `feature/discover/…/EventEditLogicTest.kt` | the event rules, the instant round-trip through the event's own zone, capacity semantics, mode labels against `create.options.mode` in both locales |

The parity tests read the web's own source files from disk. That is deliberate: a limit copied from a
React component and asserted against itself is a number agreeing with nothing, and every one of these
numbers is also enforced by a `RAISE EXCEPTION` that only fires after the member pressed Save.

A regex in those tests asserts on capture groups and fails loudly when it matches nothing
(`assertTrue(matcher.find())`), because a parity test whose pattern stopped matching is worse than no
test: it is a green light.

## Not verified, and how to check it

**Nothing here was compiled.** The sandbox has no JDK and no Android SDK (`java` is absent, `ANDROID_HOME`
is empty), so there is no `gradlew testDebugUnitTest` behind this. The static checks that were run — a
brace/literal balance checker and a symbol resolver that reads each module's local declarations — are not
compile evidence. The gates in `.github/workflows/android.yml` (all-module `testDebugUnitTest`,
`:app:lintDebug`, `:app:assembleDebug`, the WebView/permission/manifest invariants) run on the push, and
the results are recorded below by `headSha`.

```bash
cd android-app
./gradlew :core:common:test :feature:discover:testDebugUnitTest :feature:compose:testDebugUnitTest
./gradlew :app:lintDebug :app:assembleDebug
```

Three things only a run can answer, in the order they are likely to be wrong:

1. `ListingTagsTest` has never been executed — its regexes were verified by hand-emulating `javac`'s
   string decoding, which is not the same as a JUnit pass.
2. The four sheet composables have never been composed. `MkJobApplySheet`'s certification-image block
   keeps its own `remember` state inside an `if`, which is legal in Compose and worth an eye on the
   recomposition cache in a profile run.
3. `feature/compose`'s create tests may notice that `ComposeRepository.parseCommaList` now lower-cases
   skills on the create path. If a test asserts that a member's own capitalisation survives to the wire,
   the test is the thing that is wrong — the database column is canonical — but it will read as a
   regression, so it should be fixed in the same commit that changes the expectation.

## Follow-ups, deliberately left out

* `CreateJobScreen` and `CreateGigScreen` still hand-roll their fields (`OutlinedTextField` plus a local
  `ChecklistRow`) instead of using `BsdcFormKit`. They work; they now look older than the editors.
  Migrating them is a styling-only change with no rule behind it.
* `AdsDashboardScreen` and `MkVendorConsoleScreen` say the market's own editing "stays on the web". That
  is a different question — there is no in-app market editing routine at all — and it needs its own slice.
* A native date-time picker. There is none in the app, and these three editors are the reason one should
  exist; the typed boxes are honest and valid, and a `DatePicker` composed with a time field would be
  better. The payload shape was deliberately kept a string so a picker can be dropped in without moving
  any rule.
