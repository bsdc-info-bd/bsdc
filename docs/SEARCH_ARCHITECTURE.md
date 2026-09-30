# BSDC native discovery search

BSDC’s native Discover screen provides two real, bounded public searches:

| Search | Firestore source | Match behavior | Bound |
| --- | --- | --- | --- |
| Members | `handles` → public `profiles` | case-normalized username/document-ID prefix | 20 profiles |
| Topics | public `posts` | one exact normalized tag | 30 posts |

## Privacy and correctness boundary

This is deliberately **not** described as arbitrary full-text, semantic, private-profile, or message search. It does not query Realtime Database messages, private drafts, notifications, legal records, lifecycle requests, or staff-only reports.

Member discovery uses a document-ID range query over public handles and resolves only the returned public profile UIDs. Topic discovery requires an exact tag and queries public/published posts with a deployable Firestore composite index. The client validates identifiers before querying:

- Handle prefixes: 2–30 lowercase letters, numbers, or underscores, optional leading `@`.
- Tags: 2–32 lowercase letters, numbers, hyphens, or underscores, optional leading `#`.

No query is sent merely on every keystroke; the member explicitly presses Search. Query limits are fixed in the repository, protecting the device and database from unbounded discovery reads.

## Deployment

Deploy `firebase/firestore.indexes.json` along with Rules and Functions after this phase. The required `tags CONTAINS + visibility + status + publishedAt` composite index is included. Until Firestore marks that index ready, topic search returns Firebase’s index-required error rather than fabricated results.

A future full-text or Bangla linguistic search system needs separate protected indexing infrastructure, consent/data-governance review, abuse controls, deletion propagation, relevance evaluation, and cost planning.
