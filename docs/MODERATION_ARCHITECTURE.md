# BSDC moderation architecture

## Reporting a post

A signed-in member who has accepted the current BSDC legal documents can report a post from its native discussion screen. The report reason is limited to a fixed enum and optional detail is capped at 1,000 characters. The report identifier is deterministic (`{postId}_{reporterUid}`), so one account cannot create an unlimited stream of reports against the same post.

A member report has this immutable client-created shape:

```text
reports/{postId}_{reporterUid}
  targetType: "post"
  targetId: post ID
  reporterId: Firebase UID
  reason: fixed ReportReason enum
  details: bounded text
  state: "OPEN"
  createdAt: Firebase server timestamp
```

Firestore Rules require the target post to exist, reject self-reports, enforce the enum/length/timestamp, and prohibit every client update or delete. Only staff can read reports. The reporting user cannot inspect reporter data, staff notes, or report outcomes.

## Trusted staff decisions

The native moderation workspace is an access-controlled convenience UI. It does not confer authority. Both of these callable Firebase Functions independently require `request.auth.token.role` to be `admin` or `moderator`:

- `moderateReport`: dismisses an open report or hides its target post.
- `restoreModeratedPost`: republishes a currently hidden post.

The Functions use Admin-SDK transactions to update the report/post and append a staff-only `moderationActions` audit document with the reviewer UID, decision, optional bounded internal note, and server timestamp. Clients cannot write report resolution, post visibility changes, or audit actions directly.

A hidden post has `status: "moderated"`, which removes it from public-feed and public-post reads. Its original author can still access their own record; staff can access it through the trusted-role rule and restore it after review.

## Role issuance and deployment

No owner email, password, passkey, or role bypass is in this app. A trusted operator must issue Firebase Auth custom claims using secure backend/staff tooling, for example:

```text
role: "moderator" | "admin"
```

The claim must be refreshed in the staff member’s Firebase token before the app can load the workspace. Deploy the updated Firestore Rules, composite indexes, and Functions together through the protected Firebase deployment workflow. A staff account without the claim sees an access-denied state and cannot call the moderation Functions.

## Operational boundaries

This is a bounded post-reporting and review workflow, not an automated safety classifier or a legal adjudication system. It does not automatically penalize a member from one report. BSDC still needs documented escalation, appeals, evidence preservation, emergency response, staff training, and retention procedures before production operations.
