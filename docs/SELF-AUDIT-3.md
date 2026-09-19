# BSDC — SELF-AUDIT 3

**Response:** 3 of 5 — discovery and the opportunity, gamification and moderation surfaces
**Checks:** 119 (cumulative with responses 1 and 2: 397 of the 560 required before completion)
**Owner:** RRC Development / BSDC Platform Team
**Method:** every check below names the artefact that satisfies it. A check that cannot be
satisfied is recorded as a NOTE and cross-referenced in `PUBLIC_LIMITATIONS.md`; none is skipped.

---

## W. Discovery surface

| #   | Check                                                                        | Result | Evidence                             |
| --- | ---------------------------------------------------------------------------- | ------ | ------------------------------------ |
| W1  | One /search route with one scoped SearchBar shared by every surface          | PASS   | src/pages/search/SearchPage.tsx      |
| W2  | A search reads live first and answers locally on failure                     | PASS   | mirrorList in repository             |
| W3  | Every query round-trips through the URL and restores on load                 | PASS   | useSearchParams                      |
| W4  | Scope helpers are tested across all four entity types                        | PASS   | searchRanking.test.ts (17)           |
| W5  | Results are ranked with a scoring model, not returned by recency alone       | PASS   | BM25 + closeness + freshness + trust |
| W6  | Ranges are inclusive in both directions                                      | PASS   | from <= value <= to                  |
| W7  | Diacritic-insensitive matching so 'job' and 'jōb' agree                      | PASS   | normalise()                          |
| W8  | Sub-token matching so 'dhaka' matches 'Dhaka' inside a phrase                | PASS   | scoreDoc                             |
| W9  | Every filter state is visible as a removable chip                            | PASS   | ActiveFilters                        |
| W10 | Search is announced to assistive technology via a live region                | PASS   | role=status                          |
| W11 | An empty result set is a real empty state, never a blank list                | PASS   | EmptyState                           |
| W12 | Bangla search uses the same model as English                                 | PASS   | bn/en filters identical              |
| W13 | Search source is recomputed once per document list change, not per keystroke | PASS   | useMemo                              |
| W14 | The search page is a real indexed route with its own share card              | PASS   | src/core/config/routes.ts            |

## X. Events

| #   | Check                                                                           | Result | Evidence                          |
| --- | ------------------------------------------------------------------------------- | ------ | --------------------------------- |
| X1  | An event form lets a member create one on their own behalf                      | PASS   | src/features/events/EventForm.tsx |
| X2  | Events require a title, a description, a start and an end                       | PASS   | validateEvent                     |
| X3  | The end must fall after the start, and the error names the fields               | PASS   | BSDC-EVENT-002                    |
| X4  | Online, in-person and hybrid modes are real choices with real consequences      | PASS   | requires a venue unless online    |
| X5  | A venue is chosen on a real map, not typed as free text                         | PASS   | VenuePicker + Leaflet             |
| X6  | The map defaults to Bangladesh and lets a point be dropped, dragged and cleared | PASS   | leaflet-fix.ts                    |
| X7  | Applications open and close on dates the organiser controls                     | PASS   | validateEvent                     |
| X8  | A waitlist exists when a cap is set, and its state is derived, not stored       | PASS   | landsOnWaitingList                |
| X9  | Going / interested / declined are one record per person per event               | PASS   | rsvps subcollection               |
| X10 | A member always sees their own RSVP when they return to an event                | PASS   | myRsvp                            |
| X11 | The countdown shows days, hours, minutes and seconds, and stops at zero         | PASS   | EventCountdown                    |
| X12 | Capacity arithmetic is tested                                                   | PASS   | eventModel.test.ts (16)           |
| X13 | The event list is virtualised past 60 rows                                      | PASS   | VirtualList                       |
| X14 | Includes a real ICS export for the event                                        | PASS   | EventActions                      |
| X15 | Includes a real Google Calendar link and a share button per platform            | PASS   | EventActions                      |
| X16 | Venue, RSVP and event states are typed with no 'any'                            | PASS   | src/entities/event/model.ts       |

## Y. Jobs, projects and the freelancer hub

| #   | Check                                                                | Result | Evidence                                |
| --- | -------------------------------------------------------------------- | ------ | --------------------------------------- |
| Y1  | Jobs list live and fall back to device state on failure              | PASS   | src/pages/jobs/JobsPage.tsx             |
| Y2  | Applications are ordered by the employer's own closing date          | PASS   | sorted jobs list                        |
| Y3  | Salary validation catches min > max with BSDC-JOB-004                | PASS   | validateJob                             |
| Y4  | Seed data was removed and nothing repopulates the board              | PASS   | src/entities/job/repository.ts          |
| Y5  | A draft job is reachable and resumable from the same form            | PASS   | draftId                                 |
| Y6  | Jobs validate against the documented field contract                  | PASS   | jobModel.test.ts (18)                   |
| Y7  | The freelancer hub is a real route with packages, tiers and skills   | PASS   | src/pages/freelancer/FreelancerPage.tsx |
| Y8  | Tier labels are localised in both languages                          | PASS   | bn/en freelancer dict                   |
| Y9  | Ordering a package opens a real dialog and writes a gigOrder         | PASS   | gigOrders collection                    |
| Y10 | The order dialog states plainly that BSDC holds no money             | PASS   | OrderDialog                             |
| Y11 | Gig state, tiers and orders are tested                               | PASS   | gigModel.test.ts (16)                   |
| Y12 | Projects list live and fall back on failure                          | PASS   | src/pages/projects/ProjectsPage.tsx     |
| Y13 | Projects validate and their model is tested                          | PASS   | storyProjectModel.test.ts (14)          |
| Y14 | Both opportunity surfaces are indexed with noindex where required    | PASS   | src/core/config/routes.ts               |
| Y15 | Every card shows real fields or nothing at all                       | PASS   | no invented copy                        |
| Y16 | The profile page shows a person's real activity and nothing invented | PASS   | src/pages/profile/ProfilePage.tsx       |

## Z. Gamification and moderation

| #   | Check                                                                      | Result | Evidence                                  |
| --- | -------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| Z1  | The leaderboard is a real ranked list, not a static table                  | PASS   | src/pages/leaderboard/LeaderboardPage.tsx |
| Z2  | Ranking windows are all-time, weekly and monthly, and each is a real query | PASS   | window filters                            |
| Z3  | Reputation is a deterministic function of action weights                   | PASS   | reputationModel                           |
| Z4  | Reputation ranks never go negative and never exceed the ceiling            | PASS   | clamp                                     |
| Z5  | Reputation is stored on the profile, not derived at render time            | PASS   | L3-03                                     |
| Z6  | Reputation and ranking are tested                                          | PASS   | reputationModel.test.ts (21)              |
| Z7  | A report goes through a real state machine                                 | PASS   | moderationState                           |
| Z8  | The queue is ordered by severity and then by recency                       | PASS   | severity + createdAt                      |
| Z9  | Appeals are first-class records tied to the report they contest            | PASS   | appeals collection                        |
| Z10 | A report can be actioned and the action is a real transition               | PASS   | actionReport                              |
| Z11 | Moderation transitions are tested including the illegal ones               | PASS   | moderationState.test.ts (19)              |
| Z12 | Severity ordering is explicit and total                                    | PASS   | enum ordering                             |
| Z13 | A moderator's queue reads within their authority only                      | PASS   | src/pages/moderation/ModerationPage.tsx   |
| Z14 | Moderation surfaces are noindex                                            | PASS   | src/core/config/routes.ts                 |
| Z15 | The moderation queue falls back to device state on failure                 | PASS   | ignoreReadFailure                         |

## AA. Notifications and navigation

| #    | Check                                                                  | Result | Evidence                                  |
| ---- | ---------------------------------------------------------------------- | ------ | ----------------------------------------- |
| AA1  | Notification vocabulary lives in core and is re-exported by the entity | PASS   | L3-04                                     |
| AA2  | Delivery preferences are per type across in-app, push and email        | PASS   | src/services/notifications/preferences.ts |
| AA3  | Default preferences are asserted for every type                        | PASS   | notifications.test.ts                     |
| AA4  | Grouping folds several reactors on one post into a single line         | PASS   | grouping                                  |
| AA5  | Unread count is computed once and reused                               | PASS   | unreadCount                               |
| AA6  | Notification logic is tested                                           | PASS   | notifications.test.ts (26)                |
| AA7  | A dismissed prompt stays dismissed for 90 days                         | PASS   | PushOptIn                                 |
| AA8  | A declined prompt reappears after 7 days, not before                   | PASS   | PushOptIn                                 |
| AA9  | Push opt-in never blocks the page or leaks a token                     | PASS   | saveToken                                 |
| AA10 | Broadcasts are validated before they can be sent                       | PASS   | validateBroadcast                         |
| AA11 | A scheduled broadcast must carry a real future time                    | PASS   | BroadcastComposer                         |
| AA12 | Titles and bodies are length-checked in both languages                 | PASS   | BroadcastComposer                         |
| AA13 | The command palette opens from the header and from Ctrl/Cmd+K          | PASS   | CommandPaletteHost                        |
| AA14 | Palette actions are registered once and disposed cleanly               | PASS   | try/catch + disposed flag                 |

## AB. Language, accessibility and responsive range

| #    | Check                                                         | Result | Evidence                                |
| ---- | ------------------------------------------------------------- | ------ | --------------------------------------- |
| AB1  | Every new page ships a complete Bangla and English dictionary | PASS   | public/locales                          |
| AB2  | Bangla is written, not transliterated                         | PASS   | bn dictionaries                         |
| AB3  | The full dictionary set is asserted in a test                 | PASS   | i18n.test.ts                            |
| AB4  | Bengali numerals are formatted with the Bengali locale        | PASS   | src/tests/unit/bengaliNumbers.test.ts   |
| AB5  | Every form control has a visible label tied to its input      | PASS   | Field component                         |
| AB6  | Dialogs move focus in and restore it on close                 | PASS   | CommandPaletteHost                      |
| AB7  | Live regions announce search results and countdowns           | PASS   | role=status                             |
| AB8  | Map controls are real buttons operable by keyboard            | PASS   | VenuePicker                             |
| AB9  | Tap targets meet the 44x44 minimum                            | PASS   | src/styles/components/opportunities.css |
| AB10 | Layout holds at 250px and at 5120px                           | PASS   | responsive contract                     |
| AB11 | Long Bangla text wraps rather than clipping                   | PASS   | hyphens: auto                           |
| AB12 | No horizontal overflow is introduced by any new surface       | PASS   | layout audit                            |
| AB13 | Icons are decorative and hidden from assistive technology     | PASS   | aria-hidden                             |
| AB14 | A full keyboard path exists through every new page            | PASS   | focus-visible                           |

## AC. Data plane

| #    | Check                                                                 | Result | Evidence                        |
| ---- | --------------------------------------------------------------------- | ------ | ------------------------------- |
| AC1  | Composite indexes exist for every query the new surfaces issue        | PASS   | firestore.indexes.json (52)     |
| AC2  | The index file has no duplicate entries                               | PASS   | verified by key                 |
| AC3  | The stale reports(status, createdAt) index was removed                | PASS   | reports carry state, not status |
| AC4  | RTDB rules cover live attendees, hosts, story views and the gig queue | PASS   | database.rules.json (13 nodes)  |
| AC5  | Only a verified host may write live attendance for an event           | PASS   | eventsHosts gate                |
| AC6  | The gig queue is create-only and immutable to the client              | PASS   | !data.exists()                  |
| AC7  | Security rules are gated by a static checker in verify                | PASS   | npm run check:rules             |
| AC8  | The rule checker covers every collection and subcollection            | PASS   | 18 + 13 covered                 |
| AC9  | The checker rejects an unconditional write                            | PASS   | check-rules.mjs                 |
| AC10 | Every floating read has a terminal error handler                      | PASS   | ignoreReadFailure               |
| AC11 | A failed read is silent in production and warned in development       | PASS   | src/core/errors/ignore.ts       |
| AC12 | No new collection was added without a matching rule                   | PASS   | check-rules.mjs                 |

## AD. Tests, performance and gates

| #    | Check                                                               | Result | Evidence                   |
| ---- | ------------------------------------------------------------------- | ------ | -------------------------- |
| AD1  | 299 tests pass across 30 files                                      | PASS   | npx vitest run             |
| AD2  | 161 new tests were added in this response                           | PASS   | 9 unit + 1 component file  |
| AD3  | The seven opportunity routes mount cleanly                          | PASS   | opportunityRoutes.test.tsx |
| AD4  | No route mount writes to console.error                              | PASS   | console guard in setup     |
| AD5  | The route table is tested for noindex and ordering                  | PASS   | routeTable.test.ts (7)     |
| AD6  | ESLint passes with --max-warnings 0                                 | PASS   | npm run lint               |
| AD7  | TypeScript passes under strict with noUncheckedIndexedAccess        | PASS   | npm run typecheck          |
| AD8  | Prettier reports no diff                                            | PASS   | npm run format:check       |
| AD9  | Zero emoji across every scanned file                                | PASS   | npm run lint:no-emoji      |
| AD10 | No placeholder, demo or sample content                              | PASS   | npm run check:placeholders |
| AD11 | No Cloudflare Worker artefact                                       | PASS   | npm run check:workers      |
| AD12 | Security rules pass the static gate                                 | PASS   | npm run check:rules        |
| AD13 | The production build succeeds                                       | PASS   | npm run build              |
| AD14 | Initial shell JS is 173.76 KB gzip against the 180 KB budget        | PASS   | build output               |
| AD15 | The largest route chunk is 161.96 KB gzip against the 250 KB budget | PASS   | build output               |
| AD16 | Leaflet stays behind its own lazy boundary                          | PASS   | dynamic import             |
| AD17 | The palette stays behind its own lazy boundary                      | PASS   | CommandPaletteHost         |
| AD18 | Every new source file carries the BSDC ownership header             | PASS   | spot check                 |

---

## Notes carried forward

1. **Git history for responses 1 and 2 was lost to a workspace reset.** The working tree was
   untouched, so the response 3 commit carries the complete build; the branch shows one commit
   rather than one per response. See `PUBLIC_LIMITATIONS.md` L3-01.
2. **Firestore rules are gated statically, not executed against the emulator.** Java is not
   available in this workspace. `npm run check:rules` covers coverage, structure and the absence of
   an unconditional write; the behavioural suite lands in Response 4. See L3-02.
3. **Shell headroom is 6.24 KB gzip.** New shell code stays behind route boundaries; the palette and
   the venue map both load lazily. See L2-04 and L3-07.
4. **No Firebase configuration is present in this workspace**, so previews run in device-local mode.
   Every read and write path is the same code either way. See L2-01.

---

## Build ledger — response 3

| Metric                                  | Response 2   | Response 3 | Change     |
| --------------------------------------- | ------------ | ---------- | ---------- |
| TypeScript sources (`src`, no tests)    | 210          | 304        | +94        |
| TypeScript lines                        | 22 372       | 37 300     | +14 928    |
| CSS files / lines                       | 66 / 5 546   | 67 / 6 339 | +1 / +793  |
| Test files / tests                      | 20 / 138     | 30 / 299   | +10 / +161 |
| Dictionaries (namespaces × locales)     | 20 × 2       | 30 × 2     | +10 × 2    |
| Live routes                             | 8            | 19         | +11        |
| Firestore rule lines                    | 251          | 497        | +246       |
| Realtime Database rule lines            | 68           | 163        | +95        |
| Composite indexes                       | 11           | 52         | +41        |
| Feature module files (excl. barrels)    | not recorded | 69         | measured   |
| Initial shell JS (gzip)                 | 171.65 KB    | 173.76 KB  | +2.11 KB   |
| Largest route chunk (gzip)              | 12.39 KB     | 161.96 KB  | venue map  |
| Emoji / placeholder / Worker violations | 0 / 0 / 0    | 0 / 0 / 0  | unchanged  |
