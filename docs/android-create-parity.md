# Android creation system, group posting, and parity with the web

Record of the slice that started from one complaint — "the app's design is not modern, and groups have no
posting system on Android unlike the web" — and ended by changing what the app can write, what it can read,
and what it says about both.

Everything below is in the repository and reviewable; nothing here is a mock-up. Where a claim cannot be
proved from this sandbox it is marked **device-only** rather than asserted.

---

## 1. What was actually missing

The complaint was about looks. The diagnosis came out differently, so it is written down first.

| Symptom                                                       | Real cause                                                                                                                                                                | Evidence at the time                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| "Nothing animates"                                            | The motion system exists and is barely adopted. `core/designsystem/BsdcMotion.kt` already had screen/tab transitions, springs, a press-bounce, an entrance and a shimmer. | Reference counts per feature: `compose` 0, `market` 0, `feed` 1, `discover` 1. One `AnimatedVisibility` in `compose`, one in `market`. |
| "Groups have no posting system"                               | Not a missing backend — a missing wire. `save_post` has taken a `channel_id` since migration `0129_a_post_finds_its_channel.sql`, and the web uses it.                    | `ComposeRepository.savePost` never wrote the key; `GroupDetailScreen` listed channels as cards with no composer.                       |
| "Groups have no edit buttons"                                 | The button existed and pointed elsewhere.                                                                                                                                 | `GroupDetailScreen` rendered `label = "Edit on the web"` while `DiscoverRepository.updateGroup(...)` sat unused by any screen.         |
| "Every post type needs its own screen"                        | Five kinds were `private fun …CreateForm` composables inlined in `CreateHubScreen`'s own `LazyColumn`, under a strip of chips.                                            | `CreateHubScreen.kt` was 1047 lines: one picker, five forms.                                                                           |
| "Advanced editor"                                             | A write/preview boolean, not a mode; and an editor that accepted syntax the app's own reader could not render.                                                            | `previewMode: Boolean`, `MarkdownInsert` with six operations, reader grammar of five block types.                                      |
| A channel could be written and not read                       | `channel_feed` existed since 0129 and the web's `/g/{group}/c/{channel}` used it; Android had no caller, no screen and no route.                                          | The repository stopped at `hydratePostsByIds` for bookmarks; nothing asked for a room's ids.                                           |
| Feed posts look the same whether they came from a room or not | The channel columns were dropped before the screen.                                                                                                                       | `CandidateRpcRow` stops at `tags`; `POST_SELECT` had no `channels` embed; the web's `PostCard` links the room.                         |

The order of work followed the diagnosis: **wire the missing capability, give each kind a page, make the
editor honest, then move it** — motion last, because motion on top of a feature that does not work is how a
redesign ends up looking like a shell.

---

## 2. Posting into a channel

`feature/compose/…/Channels.kt` is the whole contract, and it is pure.

- `ChannelBlockReason` — the database's four strings (`channel/read-only`, `channel/not-member`,
  `channel/archived`, `channel/not-found`), and an unrecognised fifth reads as "no reason".
- `ChannelRules` — the `__feed__` sentinel and its round trip, `visibilityAllowedInChannel` (a channel
  cannot carry `private`), `reconcileVisibility` (the audience moves, the destination stays),
  `shouldSendChannelKey`, `sections`, `optionLabel`, `isEnabled`.
- `fetchPostableChannels()` — the web's two round trips: `channels` with the group embedded decides **what
  to show**, `channel_post_block_many` decides **what stays enabled**.

Two rules are worth calling out because they are the ones a client gets wrong:

**`channel_id` has three states.** `save_post` reads an _absent_ key as "leave this post's channel alone"
and an _explicit null_ as "move it out to the feed". A composer that always wrote the key would silently
pull an edited post out of a room it never displayed. Hence `channelTouched` on the draft, and hence
`ChannelRules.shouldSendChannelKey`.

**A blocked room stays in the list, disabled, with its reason in its label.** Hiding it leaves a member
hunting for a channel the group page shows them; a labelled option is the same sentence the database will
answer with if the post is sent anyway.

Copy is the website's own, word for word — `compose.channelFeed`, `channels.reasons.*`,
`compose.visibilityInChannelHint`, `compose.channelHintFeed`, `compose.channelHintGroup`,
`channels.errors.privatePost`, `compose.visibility.*` — so the refusal is one rule in one voice, not two
paraphrases. The `visibility` label "Followers only" / "শুধু অনুসারীরা" replaced the app's shorter
"Followers" for exactly that reason.

On the group page (`feature/discover/…/GroupDetailScreen.kt`): each channel card now carries a live count
from `channel_post_counts`, and a writable room offers **Write here**, which hops to the composer with the
channel already chosen (`BsdcAppShell` holds `createChannelTarget` deliberately _not_ `rememberSaveable`:
the target lives as long as the trip it describes; the draft itself persists in Room).

### Reading the room back

Posting without reading is a megaphone with no ears, so `ChannelFeedScreen` came next: the room's name,
group and topic in a header, the site's own **Post in this channel** door, then the room's posts oldest-last
with a cursor. Each row's body goes through `PostMarkdownRenderer` — the reader's parser, not a second
opinion about the same text — and tapping a row opens the post, where reactions, comments and photos
already work. A row is a summary on purpose: duplicating the feed card's ten callbacks inside a second
screen is how two versions of one card start to disagree.

`FeedRepository.fetchChannelTimeline` resolves the group first, then the channel by slug _and_ group id: a
channel slug is unique inside a group and not across groups, so the one-query version could answer with
another group's `#general`. The ids ride `hydratePostsByIds`, so a room's cards are the feed's cards — same
select, same media allowlist, same attribution line.

`ChannelFeedPage` keeps three answers apart, and collapses two of them: a room that is not there and a room
the member may not read are the same sentence on screen, because RLS hides both identically and a client
that distinguished them would be leaking. Paging is the web's rule (`canLoadMore` on the _query's_ page, not
the hydrated list, and `p_before` strictly-less-than in the SQL) and the list de-duplicates on append,
because a repeated id inside `items(...)` is a crash rather than a blemish.

The group page's channel cards are links now — `slug` on the row, the room's name coloured like a link
where a host wired `onOpenChannel`, plain text where one did not — as they are on the web, and
`/g/{group}/c/{channel}` pasted from chat opens the room _on top of_ the group, so Back returns to the
group rather than to the tab. A trailing chevron was the first attempt and is not in this app's icon set:
`Icons.AutoMirrored.Rounded.ChevronRight` does not exist — the RTL-flipped chevron that
material-icons-extended added is `ChevronLeft`, not a mirrored `ChevronRight` — and CI named it in three
minutes.

### The group editor

`GroupEditSheet.kt` + `GroupEditLogic.kt` replace the "Edit on the web" button with the web dialog's own
fields — name, description, rules, privacy (`bsdc_group_privacy`: public / private / secret), language,
avatar URL, cover URL.

The part that needed a test rather than a look: `update_group` reads a JSON null as "leave this column
alone". So a blank rules box and a blank avatar box must send `null` (not `""`), while the cover box sends
its trimmed value _including_ empty — because that is how the web clears a cover, and the same two taps
must leave the same row. `GroupEditLogicTest` pins all of it, and one of its tests reads
`ComposerValidationEngine.java` to assert that the app's 3/80/2000 limits are still the create form's.

---

## 3. A screen per kind

`CreateEventScreen.kt`, `CreateJobScreen.kt`, `CreateGigScreen.kt`, `CreateProjectScreen.kt`,
`CreateGroupScreen.kt` — each the old form's body **moved verbatim** into a public
`MkCreate{Kind}Screen(...)` (same parameters plus `onBack`), wrapped in `MkCreateScaffold`.

The move was checked mechanically, not by eye: every non-blank line of each original region was compared
against the new file, and the report is `missing-in-new = 0` with only the wrapper lines added. That is the
guarantee worth having on a refactor of 730 lines of Compose that this sandbox cannot compile locally — the
diff is the frame, not the form.

`CreateSupport.kt` holds what they share: the scaffold (back button that leans on press, kicker + kind
title, a per-kind blurb, `BsdcAnimatedEntrance`), `createKindBlurb`, exhaustive over `CreateHubMode` so a
seventh kind cannot borrow someone else's sentence, and `ChecklistRow`, whose tick colour now animates.

The hub kept the tile picker and became a router: one `AnimatedContent` over
`BsdcMotionSpecs.screenTransition`.

`CreateHubMode.fromRoute` reads `?kind=` the way `CreatePage.tsx` does — five kinds, tolerant of case,
padding, other parameters and fragments, unrecognised kind falling back to the event form because that is
what the site would have shown. Before this, `/create?kind=job` opened the **event** form: the shell only
asked whether the path started with `/create`.

---

## 4. The editor, and the reader it writes for

`MarkdownInspector.analyze` reads a body the way the reader does — line by line, same fence tracking — and
reports words, characters, reading minutes, the heading outline, and one note per line the reader will treat
differently. Inside a fence it says nothing: judging someone's SQL sample for an "unbalanced `**`" would be
the inspector lying about code.

`MkComposerInspector` is the strip under the body field: counts, reading time, outline chips, notes. The
chips move the field's selection to the heading's line — which is only useful because the toolbar acts on
the selection, so "pick a heading, press H2" restructures a long post in two taps. `MarkdownInspector.lineRange`
is what makes that honest, and it clamps: the body can shrink between the tap and the read.

Nothing in the strip blocks a publish. Every note is a sentence about what _this app_ will show, and a
member who wants a table on the website may keep it.

Then the more interesting move: instead of warning about the two syntaxes the toolbar and the web already
offered, the app learned them.

- The parser was **extracted** from the renderer into `PostMarkdownParse.kt` as `internal`, which is what
  made it testable at all — `:feature:feed` had a `testImplementation(libs.junit)` line and not one test
  source. `PostMarkdownParseTest` is now the module's first test file and covers every rule the parser has,
  old and new: indent-tolerant markers, three heading levels and _not_ four, fence contents verbatim, a
  fence left open at end of document, CRLF, paragraph splitting.
- `MarkdownBlock.Ordered` renders `1.` and `1)` with the author's number kept (renumbering "1, 3" into
  "1, 2" changes what the steps were) and `MarkdownBlock.Task` draws a box, with a strike on checked items.
- `MarkdownInspector` then **lost** its `ORDERED_LIST` and `TASK_ITEM` notes and their copy. A note about
  syntax the reader now renders is a false alarm, and a strip that cries wolf is a strip nobody reads.

Pipe tables and `####` headings are still reported, because they are still not supported. The boundary moved;
it did not disappear.

---

## 5. Motion

Adopted rather than invented, so there is one vocabulary:

| Where                        | What                                                                                                     | Reduced motion                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Composer mode switch         | Sliding thumb on a new `BsdcMotionSpecs.SegmentSlideSpring` (added to the shared system, typed for `Dp`) | State changes, no travel           |
| Create hub router            | `BsdcMotionSpecs.screenTransition`                                                                       | 1 ms cross-fade                    |
| Create screens               | `BsdcAnimatedEntrance` header; per-kind scaffold                                                         | Entrance skipped, layout identical |
| Audience row                 | `Crossfade` between the three sentences it can be                                                        | Same text, no fade                 |
| Group edit sheet             | One entrance for the content, `AnimatedVisibility` for what changes after it lands                       | Skipped                            |
| Feed composer preview        | `key(mode) { BsdcAnimatedEntrance { … } }` so each mode change re-enters                                 | Skipped                            |
| Checklist rows               | `animateColorAsState` on the tick                                                                        | Fast spring                        |
| Back button / audience chips | `pressBounceScale` + a `HapticFeedbackType.LongPress`                                                    | Scale disabled                     |

Two deliberate non-choices: the editor pane is _not_ entrance-animated (a text field that fades in under the
cursor reads as broken), and the group sheet does not cascade its fields (a fade replaying while the
keyboard opens is a bug, not a design).

---

## 6. What CI proves, and what it cannot

Proved on this branch: `:feature:compose`, `:feature:discover` and `:feature:feed` compile against the
project's Compose BOM; the new JVM suites run in `testDebugUnitTest`; Android Lint reports no errors;
`assembleDebug` builds; the native-map gate still passes.

Test counts added by this slice: `ChannelRulesTest` 13, `GroupEditLogicTest` 9, `CreateHubRouteTest` 3,
`MarkdownInspectorTest` 11, `PostMarkdownParseTest` 10, `PostAttributionTest` 6, `ChannelFeedTest` 9 —
**61 new executable assertions**, of which six are cross-platform parity gates that read the _other_ side's
source:

- the web's `CHANNEL_BLOCK_REASONS` array must equal `ChannelBlockReason.entries`, in order;
- migration 0129 must still contain the four reason strings, `channel/private-post`, and the
  `p_post ? 'channel_id'` key-presence test that `shouldSendChannelKey` exists to honour;
- the Java `ComposerValidationEngine` must still say "between 3 and 80 characters" and "exceed 2000
  characters" for the group limits `GroupEditLogic` mirrors;
- the app's strings must equal the website's, read out of `main-site/src/i18n/locales/{en,bn}.ts` with a
  section-scoped parser (`posts`, `readOnly` and `notFound` are all reused leaf names, so a first-match
  lookup would compare this app against the wrong section and pass while proving nothing) — 24 literals
  across the picker copy, the audience labels, the room page's twelve sentences and the count template;
- `channel_feed`'s three argument names must still be the ones migration 0129 declares, in order.

Those fail loudly when either side renames something, which is the point: a parity promise that nothing
checks is a comment.

The Android workflow also gained a reporter: the debug step's `::error::` annotation is built by grepping
the Gradle log for `e:` lines, which is precise for a compile error and useless for a failing test, so it
now appends up to eight `class.method: message` entries read from the JUnit XML. On a branch where CI is the
only compiler, an annotation that says only "a test task failed" costs a whole round trip per guess.

The create side above was compiled by CI at `4780788`; the room page was not, and its first run
failed on two symbols invented in a sandbox with no front end — `BsdcAvatar` imported from `core:designsystem` where it lives in `core:media`,
and the chevron above — which is the honest error rate of hand-written Compose here, and why each slice is
pushed and read back rather than declared finished. Brace-and-quote balance checks, a grep for each symbol's
definition, and the locale parity tests all passed over both — the grep printed `BsdcImageComponents.kt` as
the answer, and what I checked was that the name existed somewhere, not that it existed in the package I
was importing it from.

**Device-only, therefore not claimed:** that a bottom sheet behaves with the IME open; that the segmented
thumb, crossfade and entrance feel right at 120 Hz; that `channels(slug,name,groups(slug,name))` is
_accepted by the running PostgREST_ (the foreign keys are in the schema, the query is built from
`POST_SELECT`, and no local run exercised it); that the feed card's attribution line fits one line on a
narrow phone; that haptics fire on the back button. The first of those is a one-request check; the rest
need a phone. Whether the running PostgREST accepts `channels(slug,name,groups(slug,name))`, and whether
`channel_feed` answers for a reader the way the site's server does, are one curl each — and neither is a
claim this repository can make from a sandbox with no database.

---

## 7. Known gaps, not hidden

| Gap                                     | State                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading a channel's timeline on Android | Built here: `ChannelFeedScreen`, `channel_feed`, the cursor, the deep link. What it does _not_ have is the web's inline interactivity on the row — no reaction dock, no media strip — because a tap opens the post, where both work.                                                                                              |
| Tapping the attribution line            | Still text, not a link. The room page exists now, so this is a wiring job on the feed card rather than a missing feature; it is deliberately not guessed at here, because a tap that goes nowhere is worse than no tap.                                                                                                           |
| Tables, `####` and deeper headings      | Not supported by this app's reader; reported before publish rather than after.                                                                                                                                                                                                                                                    |
| Group avatar/cover upload               | URL fields, as the web's dialog has them; `update_group` takes URLs. No image picker here.                                                                                                                                                                                                                                        |
| Clearing an avatar                      | Not possible from either client: the web sends `null` for a blank box, which means "leave alone" in the routine. Cover clearing works, on both. A deliberate asymmetry inherited from the API, noted here rather than "fixed" in the app alone.                                                                                   |
| Motion outside creation                 | Lists settle now — `feed`, `market`, the group page's rooms, the messenger inbox (whose row also tweens out of emphasis as it is read) and the notification list. `news` and the chat transcript are still bare, and the transcript stays that way on purpose: messages that animate in while a member is typing read as a fault. |
| A room's timeline is read-only          | No pinning, no mute, no "mark read" — the web has none of those either. Writing is the composer's `initialChannelId`, reached from the room header or the group page.                                                                                                                                                             |

---

## 8. Rollback

Each commit is self-contained; revert newest first.

| Commit                                 | Revert restores                                                        |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `038db5e`/`a717613` the room page      | no channel timeline on Android, no `/g/…/c/…` deep link                |
| `0903407`/`aa15cc7` CI test reporter   | an annotation that names only the failing task                         |
| `5f7b8ac` generated copy + parity test | the app's paraphrases, and no gate on the locale files                 |
| `ec409ae` list settling                | snap-in-place lists, and the `$Name.CONST` interpolation bug           |
| `d73772e` a lost import                | (broken build only)                                                    |
| `0db04f5` feed attribution             | no `channels` embed, no line on the card                               |
| `f1dfc5f` test repair                  | (broken test file only)                                                |
| `7a28ec1` web-verbatim copy            | the app's own paraphrases                                              |
| `0811235` import tidy                  | unused imports back in the split files                                 |
| `ee02d13` ordered/task blocks          | the private untested parser, plus the two false notes                  |
| `8a30c36` markdown inspector           | no counts, no outline, no notes                                        |
| `a9a2058` a screen per kind            | the five inline forms in the hub, and every `/create` link as an event |
| `9e94726` CI compile fixes             | (broken build only)                                                    |
| `4d1ddfb` channel posting + group edit | no `channel_id` on Android, and "Edit on the web"                      |

Nothing in this slice changed the web app, the database, or a migration — so no rollback on either side can
strand the other. `android-app` was the only tree touched, and the website remains the reference the app is
measured against.
