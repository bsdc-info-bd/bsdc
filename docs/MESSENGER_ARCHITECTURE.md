# BSDC Messenger architecture

BSDC Messenger is a real Firebase Realtime Database feature. It does not generate sample conversations, mock inboxes, or seeded members.

## Stored data

```text
conversations/{conversationId}
  kind: direct | group
  title / description: group metadata
  participants/{uid}: true
  memberCount
  unreadBy/{uid}: number
  lastMessage / lastMessageAt

messages/{conversationId}/{messageId}
  senderId, kind, body, attachmentUrl, sentAt
  editedAt, deletedAt, replyToId

typing/{conversationId}/{uid}: boolean
```

All paths are guarded by `firebase/database.rules.json`: only authenticated members can read a conversation, its messages, and typing status. Members are immutable after conversation creation in the current free-stack model. This avoids unsafe arbitrary member injection from a compromised client.

## Implemented member features

- One-to-one developer conversations from public profiles
- Handle-addressed group creation for 2–50 BSDC members
- Group title, description, membership count, latest-message preview, and unread counts
- Real-time message delivery and ordering
- Text, Cloudinary image, and Cloudinary voice-note messages; video MIME types remain blocked
- Device-safe 20-second voice-note upload policy
- Realtime typing state with RTDB `onDisconnect()` cleanup
- Read/unread state
- Sender-only edit/remove repository operations; removal is a soft deletion visible to members
- Inbox search and group/direct conversation presentation
- High-priority FCM push through trusted Firebase Functions
- Locked-device notifications through Android’s user-controlled message notification channel
- Push notification fan-out with stale FCM token cleanup
- Android image rendering and streamed audio playback

## Required deployment

Deploy the updated Realtime Database rules and Functions after merging the Android code:

```text
firebase/database.rules.json
functions/src/index.ts
```

Run the protected **Deploy Firebase policy and backend** workflow after configuring the deployment service-account secret. Push notification delivery requires the Functions deployment. Android local notification visibility always remains subject to the member’s OS lock-screen and notification settings.

## Privacy boundary

RTDB membership rules protect access, but this is not end-to-end encryption. Do not describe BSDC Messenger as E2EE until a reviewed multi-device key exchange, ratchet protocol, recovery design, key verification, and external security audit are implemented.
