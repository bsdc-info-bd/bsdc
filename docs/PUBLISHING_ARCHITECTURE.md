# BSDC publishing architecture

BSDC's Android composer is a real Firestore-backed publishing workflow. It contains no generated articles, placeholder organizations, seeded series, or fake scheduled state.

## Authoring model

Posts keep **Markdown as the portable source of truth** in `posts/{postId}.body`.

- **Rich write / Markdown toggle:** Rich write is a native formatting toolbar plus a safe live Compose preview. Markdown mode exposes the exact source. The client does not run arbitrary HTML or JavaScript.
- **Frontmatter:** The metadata card accepts simple `key: value` lines. On save, BSDC writes a YAML-like block at the top of the Markdown source and also stores a bounded `frontmatter` map for rendering titles and structured metadata.
- **Formatting:** headings, quotes, lists, fenced code, inline code, and bold source are supported by the native renderer. Markdown remains visible rather than being silently transformed into opaque rich text.
- **Embeds and Liquid-style tags:** the editor can insert `{{gist url="…"}}`, `{{codepen url="…"}}`, `{{youtube url="…"}}`, or `{{twitter url="…"}}`. Only the expected public hosts are accepted; the app renders a safe external-link card, never embedded script or a WebView.
- **Video boundary:** BSDC continues to prohibit video uploads and in-app video playback. A YouTube tag is an external link only; image and voice attachments remain the only supported uploaded media.

## Publishing states

Each post has one of these states:

| State | Visibility | Behavior |
|---|---|---|
| `draft` | author-only through Firestore rules | Saved from the composer and returned in the private Drafts list. |
| `scheduled` | author-only until due | Client saves a future Firestore `scheduledAt`; the trusted scheduler publishes it. |
| `published` | follows the selected audience policy | Appears in public queries when the audience is `PUBLIC`. |

`publishScheduledPosts` is a Firebase Functions scheduler in `asia-southeast1`, every five minutes using the `Asia/Dhaka` time zone. It performs the status transition with the Admin SDK. No Android client has a privileged scheduler credential.

## Discoverability and structure

- Tags are normalized and hard-limited to **four** per post in both the client and Firestore rules.
- A member can create real `series/{seriesId}` records, attach a post as the next part, and open a structured series screen. `countSeriesPosts` recomputes its published count safely after writes/retries.
- Every newly required compound Firestore query is declared in `firebase/firestore.indexes.json`; deploy that file with the rules and Functions before using this release.

## Organization posts and co-authors

An organization is durable Firestore data, not a free-text badge:

```text
organizations/{organizationId}
  name, handle, description, ownerId, memberCount
organizations/{organizationId}/members/{uid}
  organization and member snapshot, role: owner | editor
profiles/{uid}/organizationMemberships/{organizationId}
  private member-side index used by the composer
organizationHandles/{handle}
  unique organization handle reservation
```

- A signed-in BSDC member can create an organization profile and becomes its owner.
- Owners can add an existing BSDC handle as an editor from the organization screen.
- Firestore rules require a current organization membership for a post to carry that organization's attribution.
- Co-authors are resolved against real BSDC profiles and stored as a bounded credit line (up to five). Credits do **not** grant draft visibility, editing permission, impersonation ability, or organization membership. A consent/acceptance workflow should be designed before treating co-author credit as a legal publication approval mechanism.

## Deployment checklist

Deploy these together from protected CI:

```text
firebase/firestore.rules
firebase/firestore.indexes.json
functions/src/index.ts
```

Then verify with real accounts: create a private draft, edit it, schedule a future post, create a series, create an organization, add an editor, and publish a post under that organization. Scheduled publishing requires the Firebase Functions scheduler API/billing configuration supported by the target Firebase project.
