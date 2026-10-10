# The messenger

Every item below is implemented in this repository, and each line names where.
The count is the number of numbered items in this file: **126**. Nothing here
is a stub, a mock or a plan — where a behaviour is enforced by the database,
the migration that enforces it is named, and the proof harnesses that exercise
it are listed at the end.

## Transport: realtime, not polling

1. New messages arrive over the Postgres change feed — no timer waits for them.
   `supabase/migrations/0051_the_messenger_is_live.sql` publishes `messages`;
   `src/lib/messaging/messenger-channel.ts` subscribes per conversation.
2. Edits and deletes are delivered as change events and folded into the open
   thread in place. `messenger-channel.ts` → `onMessage`, `use-messaging.ts`.
3. Optimistic send: the line appears immediately with a clock. `use-messaging.ts`
   (`onMutate`, `clientState: 'pending'`).
4. A failed send stays on screen with “Send again” instead of vanishing.
   `MessageBubble.tsx`, `use-messaging.ts` (`retry`).
5. Delivery tick becomes two ticks when another member reads the line
   (`message_receipts` + `conversation_messages.read_by`).
6. A read-by count is shown under the viewer's own line.
7. Live status chip: Connecting / Live / Reconnecting / Offline.
8. Round-trip latency in milliseconds, measured with a broadcast ping.
9. Polling exists only as a fallback and stops the moment the socket is live
   (12 s thread, 30 s inbox). `use-messaging.ts` (`FALLBACK_THREAD_MS`).
10. The inbox is refreshed by the change feed, coalesced so a burst of messages
    costs one read. `messenger-channel.ts` (`joinInbox`), `use-messaging.ts`.
11. The unread badge follows the same feed.
12. The socket is re-authenticated with a current Firebase ID token on join and
    whenever it is not healthy — an expired token would silently stop RLS from
    delivering events. `src/lib/supabase/client.ts` (`ensureRealtimeAuth`).
13. `replica identity full` on `messages`, `conversations` and
    `conversation_members`, so Realtime can evaluate a policy per event (0051).
14. Eight tables are in the `supabase_realtime` publication: the feed does not
    guess what a client needs. (0051, re-runnable.)
15. Only authenticated members hold grants on the messenger tables; anonymous
    callers are refused outright, proven in t21.

## Presence and typing

16. Typing indicator, published as an ephemeral broadcast (6 s window).
17. Typing names are resolved from the member list, not from raw uids.
18. Who is in the thread right now, over Realtime presence.
19. Member count in the thread header.
20. Presence and typing are cleared when the thread closes — no ghost typers.
21. An unknown sender's line triggers one debounced backfill rather than being
    left authorless.

## The line itself

22. Multi-line text keeps its shape.
23. URLs become links; trailing punctuation is not swallowed.
24. `@handle` becomes a profile link.
25. Fenced code blocks render as code with their language label.
26. Emoji-only messages render large.
27. Image attachments render inside the bubble with a full-size link.
28. Audio attachments get the native player.
29. Every other attachment becomes a download card with a type icon.
30. Attachment kind is derived from the name, falling back to the URL.
31. Deleted lines render as a tombstone, keeping the thread's shape.
32. Empty bodies and snippets render an explicit placeholder.
33. Search hits are marked inside the text.
34. Copy a message's text to the clipboard.
35. Avatar and name appear once per run of consecutive messages from a sender
    (five-minute window, `groupMessages`).
36. Day separators: Today, Yesterday, then an absolute date.
37. “New messages” divider, drawn where the viewer's read marker was.
38. `edited` label on edited lines.

## Replying, reacting, pinning, saving

39. Reply to a specific line, quoting it above the new message.
40. The quote shows the original author and a clipped body.
41. Clicking a quote jumps to the original line.
42. A jump flashes the target line so the eye can find it.
43. Six-emoji reaction picker per line.
44. Toggling a reaction adds or removes it, optimistically.
45. Reaction chips with counts, shown to everybody in the thread.
46. The viewer's own reactions are visually distinct and `aria-pressed`.
47. One row per member per emoji per message — the primary key prevents
    duplicates (0051 `message_reactions`).
48. Reactions are readable only by members of that conversation (RLS policy).
49. A member may write only their own reaction (RLS, plus a membership check in
    `toggle_message_reaction`).
50. Pin a line from the thread.
51. Pinned banner at the top of the thread, with a jump and an unpin.
52. Pinned count, and a list read of all pins (`conversation_pins`).
53. Pins are visible to members only; a stranger reads none (t21).
54. Save (bookmark) a line privately.
55. Saved messages panel, listing saves across every conversation.
56. Saving is private: the saver reads the row, nobody else (t21).
57. Unsave from the same menu.

## The thread

58. In-thread search, from two characters, with author, date and body.
59. Search results jump to the line and highlight the term.
60. Cross-conversation search on the messages page.
61. Drafts are saved per conversation and follow the member across devices
    (`conversation_members.draft_body`, debounced 900 ms).
62. The draft is restored when the conversation is reopened.
63. Reply context bar with cancel.
64. Edit mode with its own context bar and cancel.
65. Editing stamps `edited_at` in the database.
66. Delete with a confirmation modal — the line is tombstoned, replies keep
    their context.
67. `Escape` cancels a reply or an edit.
68. `Enter` sends; `Shift+Enter` starts a new line.
69. Character counter near the limit.
70. Emoji tray for inserting into the text (24 emoji).
71. Send an image: validated, uploaded, attached and sent as one line.
72. Send a file: the same path, with the original filename kept.
73. Record a voice note (MediaRecorder → upload → send) when the browser allows.
74. Scroll-to-bottom button, and auto-scroll only while the reader is at the
    bottom.
75. Load older messages, one page at a time.
76. Leave a conversation, with confirmation (`leave_conversation`).
77. Mute a conversation (per member, with an expiry).
78. Pin a conversation.
79. Archive a conversation.
80. Read the thread and the badge clears (read marker + per-line receipt).
81. A hidden tab is not marked as read — visibility is checked.
82. Per-member settings are readable and writable only by that member: a
    member's attempt to write another's row changes nothing (t21).
83. Loading, error and empty states for the thread.

## The inbox

84. Conversation list: avatar, name, preview, relative time.
85. Unread badge per conversation.
86. Six filters: All, Unread, Direct, Groups, Pinned, Archived.
87. Pinned conversations sort first, then by recency; conversations with no
    messages sort last (`sortConversations`).
88. Text search across name, username and preview.
89. Mark a conversation read from the row.
90. Mute from the row — a real write, per member.
91. Pin or unpin from the row.
92. Archive or unarchive from the row.
93. Unread total in the header, muted conversations excluded.
94. Live badge on the inbox.
95. Start a direct conversation from a username or a uid — the form resolves a
    username to its member (`resolveMemberUid`).
96. Create a group with a name and a list of usernames.
97. Saved-messages tab.
98. Cross-conversation search panel.
99. Master/detail layout: side by side from the medium breakpoint, one at a
    time below it.
100. Empty, loading and error states for the list.
101. The badge in the app bar counts unread messages, from the same feed.

## Database contract

102. `conversation_messages` returns a page of lines with reactions, the
     viewer's reactions, read-by, star, pin and the quoted parent — one round
     trip for the whole thread.
103. `conversation_state` returns membership, mute, pin, archive, draft and read
     marker in one read.
104. `conversation_pins` returns pins with sender and media context.
105. `saved_messages` returns the viewer's saves with their conversation.
106. `search_messages` searches the member's own conversations only, and skips
     deleted lines.
107. `toggle_message_reaction` returns the new state and the total, and exits
     after removing a reaction instead of inserting it again (a bug the harness
     caught: `return query` appends, it does not return).
108. `mark_message_read` moves the receipt and the conversation's read marker
     together, so a badge can never disagree with a tick.
109. `toggle_message_pin` refuses a line the caller cannot see.
110. `toggle_message_star` refuses the same.
111. Every definer function still authenticates the caller and checks
     membership explicitly — the RLS policies are not the only guard.
112. Non-members read zero rows from every one of these functions (t21).
113. Anonymous callers are refused by grant, not by filter (t21).
114. Members may not mark another member read (RLS refuses the write).
115. A member may not save a line on behalf of somebody else.
116. A reaction is refused on a line in a conversation the caller is not in
     (`P0002`).
117. Message ordering is stable and the page is reversed for rendering.
118. Counters and activity previews are written by the existing trigger; the
     messenger adds nothing to them.
119. The forty-five columns and four tables this round adds are additive and
     re-runnable; the file is safe to apply twice.
120. Nothing in the migration drops or rewrites a deployed function except
     `toggle_message_reaction`'s own new body.

## Proof

121. `t21.mjs` — the publication holds all eight subscribed tables.
122. `t21.mjs` — `replica identity full` on the three subscribed tables.
123. `t21.mjs` — reaction add, second member, take-back, count and refusal.
124. `t21.mjs` — receipts, read-by, and the refusal for a non-member and for
     marking somebody else read.
125. `t21.mjs` — pins and saves: visibility, privacy, unsave, and that a member
     cannot write another member's settings row.
126. Tests: `src/lib/messaging/message-text.test.ts` (10) and
     `src/lib/messaging/message-types.test.ts` (10) cover the parsers, the
     merge, the sort and the filters; the full suite is 448 tests.

## Transport note

Messages, reactions, receipts, pins, member settings and the inbox ride
**Supabase Realtime** (the Postgres change feed), because row level security —
which is what keeps a private conversation private — is evaluated by Postgres
for every event. Firebase Realtime Database remains in the app for presence
(`src/lib/realtime/presence.ts`), but it is not the messenger's transport: the
RTDB security rules are not in this repository and have never been deployed, so
anything load-bearing placed there would be locked out in production. The
messenger's typing and presence signals therefore use Realtime broadcast and
presence on the same authorized socket as the data.
