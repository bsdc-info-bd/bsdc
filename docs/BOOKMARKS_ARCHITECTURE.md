# Saved posts / reading-list architecture

BSDC saved posts are a private member feature, not a public engagement counter.

## Data model

A save is stored at:

```text
profiles/{uid}/bookmarks/{postId}
```

Each document carries only `postId` and server-generated `savedAt`. The document ID is the saved post ID, making a second save idempotent. The Android client listens to the private bookmark index and then observes the referenced post documents. Deleted or no-longer-public posts disappear from the reading list rather than exposing private content.

## Authorization

`firebase/firestore.rules` permits only the owning authenticated user to read or delete their bookmark documents. Creation requires the document ID and payload post ID to agree and requires the referenced post to be publicly readable. The client cannot modify global `saveCount` or any public popularity signal.

## Offline and failure behavior

Firestore’s managed local persistence presents the last known saved list while offline. A save/remove operation is queued by Firestore only under the user’s normal authenticated session; errors are returned to the screen action state. The app does not fabricate a bookmark state when the backend rejects an operation.

## Native UI contract

The feed and post-detail screens expose a functional save control. The reading-list screen is reachable from the feed’s Saved Posts action, lets a member remove a saved item, and uses the existing native post renderer and Android share sheet. Screens where a save operation has not been wired do not display an inert bookmark control.
