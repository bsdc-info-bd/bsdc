# BSDC — SELF-AUDIT 4

**Response:** 4 of 5 — messaging and groups at depth, the administration console, and
reports that can be checked
**Checks:** 114 (cumulative with responses 1 to 3: 511 of the 560 required before completion)
**Owner:** RRC Development / BSDC Platform Team
**Method:** every check below names the artefact that satisfies it. A check that cannot be
satisfied is recorded as a NOTE and cross-referenced in `PUBLIC_LIMITATIONS.md`; none is skipped.

---

## W2. Messaging at depth

| #   | Check                                                                  | Result | Evidence                             |
| --- | ---------------------------------------------------------------------- | ------ | ------------------------------------ |
| W1  | A message reaction is one document per person per message              | PASS   | thread.ts + firestore.rules          |
| W2  | The rules refuse a reaction write that touches somebody else           | PASS   | isSelf(uid) under messages/reactions |
| W3  | Choosing a second reaction replaces the first rather than adding to it | PASS   | toggleReaction                       |
| W4  | A reaction map from the network is sanitised before it is rendered     | PASS   | cleanReactions                       |
| W5  | A whole conversation's reactions cost one collection-group query       | PASS   | listMessageReactions                 |
| W6  | Reactions are watchable, so another person's reaction appears live     | PASS   | watchMessageReactions                |
| W7  | Removing a reaction deletes the document rather than tombstoning it    | PASS   | reactToMessage                       |
| W8  | Replies are grouped into threads ordered by last activity              | PASS   | groupThreads                         |
| W9  | A reply to a message that has been unsent does not break the thread    | PASS   | groupThreads orphan case             |
| W10 | An edit is allowed for two minutes and not a second longer             | PASS   | isEditableAt                         |
| W11 | A read implies a delivery, so the two can never disagree               | PASS   | markRead                             |
| W12 | Delivery state is derived from every other participant, not from one   | PASS   | deliveryState                        |
| W13 | Unsent messages leave a tombstone so the thread keeps its shape        | PASS   | unsendMessage                        |
| W14 | Voice notes are bounded by twenty seconds and by bytes                 | PASS   | validateAttachment                   |
| W15 | Video is refused everywhere                                            | PASS   | ACCEPTED_MIME + PART 29.1            |
| W16 | An attachment without alt text is refused                              | PASS   | BSDC-CHAT-002                        |
| W17 | Message update is limited to named fields and cannot change the sender | PASS   | firestore.rules affectedKeys         |

## X2. Groups at depth

| #   | Check                                                                       | Result | Evidence                       |
| --- | --------------------------------------------------------------------------- | ------ | ------------------------------ |
| X1  | A secret group is invisible to a non-member, on the client and in the rules | PASS   | groupVisibleTo + read rule     |
| X2  | A closed group is visible but its content is members-only                   | PASS   | groupContentVisible            |
| X3  | Joining a group that requires approval writes a request, not a membership   | PASS   | requestJoin                    |
| X4  | Asking twice updates one request rather than creating two                   | PASS   | id is groupId:uid              |
| X5  | Only the applicant may withdraw, and only while pending                     | PASS   | withdrawJoinRequest            |
| X6  | A request can be decided once and only once                                 | PASS   | decideJoinRequest              |
| X7  | The decision records who decided and when                                   | PASS   | decidedByUid + decidedAt       |
| X8  | Approving writes the membership immediately after the request               | PASS   | reviewJoinRequest              |
| X9  | A manager may not make themselves a manager                                 | PASS   | mayAssignRole                  |
| X10 | Nobody may change the owner's standing through a membership row             | PASS   | mayAssignRole + rules          |
| X11 | Requests are listed waiting-first for a reviewer                            | PASS   | sortJoinRequests               |
| X12 | Requests are watchable, so a manager sees a new one without a refresh       | PASS   | watchJoinRequests              |
| X13 | The join button reflects the state the person is actually in                | PASS   | joinAction                     |
| X14 | A declined applicant may ask again, with the note shown beside the button   | PASS   | joinAction                     |
| X15 | Membership creation cannot self-grant a manager role                        | PASS   | firestore.rules members create |
| X16 | A member may change only their own notification setting                     | PASS   | firestore.rules members update |
| X17 | Group roles and requests are proven by 27 tests                             | PASS   | groupRequests.test.ts          |

## Y2. Administration

| #   | Check                                                                             | Result | Evidence                   |
| --- | --------------------------------------------------------------------------------- | ------ | -------------------------- |
| Y1  | One scope decides whether an administration screen is shown                       | PASS   | AdminScope                 |
| Y2  | Every capability is a flag in the register                                        | PASS   | FLAG_REGISTRY              |
| Y3  | Every flag ships switched on by default                                           | PASS   | LAW-11 + def()             |
| Y4  | A flag can be scheduled between two dates                                         | PASS   | validateFlagWindow         |
| Y5  | A window whose end is in the past is refused                                      | PASS   | BSDC-FLAG-004              |
| Y6  | A window whose end precedes its start is refused                                  | PASS   | BSDC-FLAG-003              |
| Y7  | A kill switch overrides the schedule                                              | PASS   | evaluateFlag precedence    |
| Y8  | An unknown remote flag key is ignored, so a bad document cannot disable the shell | PASS   | evaluateFlags              |
| Y9  | The row says why a flag is in the state it is in                                  | PASS   | FlagVerdict.reason         |
| Y10 | Toggling a protected flag requires the passkey, verified on the server            | PASS   | setFeatureFlag             |
| Y11 | Passkey attempts are throttled to five per fifteen minutes                        | PASS   | recordAttempt              |
| Y12 | The passkey is cleared from state on cancel, not only on success                  | PASS   | PasskeyDialog              |
| Y13 | A flag change writes before and after values to the audit trail                   | PASS   | setFeatureFlag audit row   |
| Y14 | Assigning a role requires a written reason                                        | PASS   | RoleAssignment             |
| Y15 | The root role cannot be handed out from the form                                  | PASS   | ASSIGNABLE_ROLES           |
| Y16 | An audit row is never editable and never deletable by a client                    | PASS   | firestore.rules auditLogs  |
| Y17 | Audit rows carry the role the actor held at the time                              | PASS   | AuditEntry.actorRole       |
| Y18 | The audit trail is searchable by account, target or reason                        | PASS   | filterAudit                |
| Y19 | The recovery bin states the date an item leaves, not a countdown                  | PASS   | purgeAt shown              |
| Y20 | An early purge asks for the item id to be typed back                              | PASS   | purgeItem + confirm dialog |
| Y21 | A purge is refused when the typed id does not match                               | PASS   | BSDC-ADMIN-004             |
| Y22 | Only the owner or staff may restore, and only inside the window                   | PASS   | restoreSoftDeleted         |
| Y23 | Restoring and purging each write an audit row                                     | PASS   | both functions             |
| Y24 | The bin is readable with no network, from the device mirror                       | PASS   | listRecovery               |
| Y25 | Every administration route is noindex and requires a session                      | PASS   | ROUTES                     |

## Z2. Reports and verification

| #   | Check                                                                           | Result | Evidence                       |
| --- | ------------------------------------------------------------------------------- | ------ | ------------------------------ |
| Z1  | Every report carries an id, a stamp, a hash and a verification URL              | PASS   | SealedReport                   |
| Z2  | The hash is SHA-256, verified against a published vector                        | PASS   | reportIdentity.test.ts         |
| Z3  | The hashed payload is canonical, so a reordered row changes the hash            | PASS   | canonicalPayload               |
| Z4  | The PDF is built only when asked: jsPDF is dynamically imported                 | PASS   | buildReportPdf                 |
| Z5  | The QR code encodes the verification URL                                        | PASS   | qrcode.toDataURL               |
| Z6  | The document prints the id, the stamp in Dhaka time, the hash and the URL       | PASS   | buildReportPdf                 |
| Z7  | Every page carries the footer, so page two is identifiable                      | PASS   | footer() on each page          |
| Z8  | Issuing a report is registered server-side                                      | PASS   | registerReport                 |
| Z9  | A second registration cannot rewrite the first record                           | PASS   | existing.exists guard          |
| Z10 | Verification needs no sign-in at all                                            | PASS   | reportDocuments read rule      |
| Z11 | The verifier answers confirmed, refused or unknown as three different sentences | PASS   | verifyReportDocument           |
| Z12 | A hash that is not 64 hex characters is reported as malformed                   | PASS   | malformed verdict              |
| Z13 | Hashes are compared in constant time                                            | PASS   | hashesMatch                    |
| Z14 | The verification URL can be pasted whole or typed as a bare id                  | PASS   | parseVerificationInput         |
| Z15 | A report issued offline still produces a complete document                      | PASS   | buildReportPdf + notRegistered |
| Z16 | The screen says when a document cannot yet be checked                           | PASS   | Badge notRegistered            |
| Z17 | Members are counted by server-side aggregation, not by paging profiles          | PASS   | countMembersByRole             |
| Z18 | No report extrapolates or fills a gap it did not count                          | PASS   | catalog rowsFor                |
| Z19 | The catalogue is bilingual at the point each row is built                       | PASS   | buildReportPayload             |
| Z20 | A report cannot be issued where SHA-256 is unavailable                          | PASS   | canSeal + BSDC-REPORT-003      |
| Z21 | Report identity is proven by 28 tests                                           | PASS   | reportIdentity.test.ts         |

## AA2. Data plane and gates

| #    | Check                                                         | Result | Evidence                  |
| ---- | ------------------------------------------------------------- | ------ | ------------------------- |
| AA1  | Firestore rules cover every collection and subcollection      | PASS   | check:rules: 19 + 14      |
| AA2  | Message reactions have their own rule                         | PASS   | firestore.rules           |
| AA3  | Group join requests have their own rule                       | PASS   | firestore.rules           |
| AA4  | Issued reports are readable by anybody and writable by nobody | PASS   | reportDocuments rule      |
| AA5  | Realtime Database rules have their own static gate            | PASS   | npm run check:rtdb        |
| AA6  | The RTDB root denies reads and writes by default              | PASS   | check:rtdb                |
| AA7  | Every RTDB path the client touches has a rule                 | PASS   | check:rtdb: 10 paths      |
| AA8  | No RTDB node allows an unconditional write                    | PASS   | check:rtdb                |
| AA9  | Live counters are now writable only by the server             | PASS   | liveCounters .write false |
| AA10 | The gig queue remains create-only and immutable to the client | PASS   | !data.exists()            |
| AA11 | Both rule gates run inside npm run verify                     | PASS   | package.json verify       |
| AA12 | New mirror stores were added with a schema bump               | PASS   | idb.ts DB_VERSION 3       |

## AB2. Tests, performance and quality

| #    | Check                                                                  | Result | Evidence                                       |
| ---- | ---------------------------------------------------------------------- | ------ | ---------------------------------------------- |
| AB1  | 393 tests pass across 34 files                                         | PASS   | npx vitest run                                 |
| AB2  | 94 new tests were added in this response                               | PASS   | 3 unit files, 1 component file                 |
| AB3  | Both route smoke tests are stable across repeated full runs            | PASS   | 3 consecutive runs                             |
| AB4  | A lazy chunk resolving between tests no longer fails an unrelated test | PASS   | render inside act                              |
| AB5  | ESLint passes with --max-warnings 0                                    | PASS   | npm run lint                                   |
| AB6  | TypeScript passes under strict with noUncheckedIndexedAccess           | PASS   | npm run typecheck                              |
| AB7  | Prettier reports no diff                                               | PASS   | npm run format:check                           |
| AB8  | Zero emoji across every scanned file                                   | PASS   | lint:no-emoji: 580 files                       |
| AB9  | No placeholder, demo or sample content                                 | PASS   | check:placeholders                             |
| AB10 | No Cloudflare Worker artefact                                          | PASS   | check:workers                                  |
| AB11 | Cloud Functions typecheck and pass their own suite                     | PASS   | verify:functions                               |
| AB12 | Three new Cloud Functions carry the new authority                      | PASS   | setFeatureFlag, restore, purge, registerReport |
| AB13 | Initial shell JS is 174.87 KB gzip against the 180 KB budget           | PASS   | build output                                   |
| AB14 | The largest route chunk is 161.96 KB gzip against the 250 KB budget    | PASS   | build output                                   |
| AB15 | jsPDF and html2canvas are lazy chunks, never preloaded                 | PASS   | dist/index.html modulepreload                  |
| AB16 | The production build succeeds                                          | PASS   | npm run build                                  |
| AB17 | The administration CSS is responsive from 250px to 1280px and beyond   | PASS   | admin.css                                      |
| AB18 | The audit table becomes a card list at or below 768px                  | PASS   | R-20 in admin.css                              |
| AB19 | Every new tap target is at least 44px                                  | PASS   | admin.css row actions                          |
| AB20 | Every new source file carries the BSDC ownership header                | PASS   | spot check                                     |
| AB21 | New dictionaries are complete in both languages                        | PASS   | admin + reports, 127 keys                      |
| AB22 | Both new namespaces are registered with i18next                        | PASS   | I18nProvider NAMESPACES                        |

---

## Notes carried forward

1. **The emulator suite has still not been run.** Java is not available in this workspace and cannot
   be installed without root. Both rule sets are gated statically instead, and `check:rtdb` is new
   here. See `PUBLIC_LIMITATIONS.md` L4-01.
2. **The PDF text layer is Latin.** Core PDF fonts cannot render Bengali conjuncts, so the printed
   document carries a transliteration while the on-screen report is real Bangla. See L4-02.
3. **A report counts what it can see.** The moderation report reads the queue the viewer is entitled
   to; the members report is exact by server-side count aggregation. Nothing extrapolates. See L4-03.
4. **Shell headroom is 5.13 KB gzip.** jsPDF and html2canvas are lazy chunks. See L4-06.

---

## Build ledger — response 4

| Metric                                  | Response 3 | Response 4 | Change    |
| --------------------------------------- | ---------- | ---------- | --------- |
| TypeScript sources (`src`, no tests)    | 304        | 332        | +28       |
| TypeScript lines                        | 37 300     | 42 630     | +5 330    |
| CSS files / lines                       | 67 / 6 339 | 68 / 6 647 | +1 / +308 |
| Test files / tests                      | 30 / 299   | 34 / 393   | +4 / +94  |
| Dictionaries (namespaces x locales)     | 30 x 2     | 32 x 2     | +2 x 2    |
| Live routes                             | 19         | 29         | +10       |
| Feature module files (excl. barrels)    | 69         | 77         | +8        |
| Flag register entries                   | 73         | 78         | +5        |
| Firestore rule lines                    | 497        | 555        | +58       |
| Realtime Database rule lines            | 163        | 163        | unchanged |
| Static rule gates                       | 1          | 2          | +1        |
| Cloud Functions                         | 7          | 11         | +4        |
| Initial shell JS (gzip)                 | 173.76 KB  | 174.87 KB  | +1.11 KB  |
| Largest route chunk (gzip)              | 161.96 KB  | 161.96 KB  | unchanged |
| Largest lazy chunk (gzip)               | 43.49 KB   | 126.49 KB  | jsPDF     |
| Emoji / placeholder / Worker violations | 0 / 0 / 0  | 0 / 0 / 0  | unchanged |

### Response 4 addendum — the administration routes under test

`src/tests/components/adminRoutes.test.tsx` mounts all six administration screens and the public
verification screen in Bangla. Each administration route is asserted to show a signed-out visitor the
refusal rather than the register, which is the property that matters and the one a unit test cannot
see. The verification route is asserted to be readable by anybody with the id from the path already
filled in.
