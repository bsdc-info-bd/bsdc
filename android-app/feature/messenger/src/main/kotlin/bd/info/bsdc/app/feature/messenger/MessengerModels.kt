package bd.info.bsdc.app.feature.messenger

import androidx.compose.runtime.Immutable

enum class InboxFilter(val wireKey: String) {
    ALL("all"),
    UNREAD("unread"),
    DIRECT("direct"),
    GROUPS("groups"),
    PINNED("pinned"),
    ARCHIVED("archived"),
}

enum class LiveChannelStatus {
    CONNECTING,
    LIVE,
    RECONNECTING,
    OFFLINE,
}

enum class OutboxDeliveryState {
    CONFIRMED,
    PENDING,
    SENDING,
    FAILED,
}

@Immutable
data class MessengerPeerProfile(
    val uid: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String,
)

@Immutable
data class ConversationSummaryItem(
    val id: String,
    val kind: String, // direct | group
    val title: String,
    val avatarUrl: String,
    val lastMessageAt: String,
    val preview: String,
    val unreadCount: Int,
    val muted: Boolean,
    val pinned: Boolean,
    val archived: Boolean,
    val other: MessengerPeerProfile?,
) {
    fun displayTitle(bn: Boolean): String {
        if (kind == "group") {
            return title.ifBlank { if (bn) "গ্রুপ চ্যাট" else "Group chat" }
        }
        return other?.displayName?.ifBlank { "@${other.username}" }
            ?: title.ifBlank { if (bn) "সদস্য" else "Member" }
    }
}

@Immutable
data class ConversationStateModel(
    val isMember: Boolean = true,
    val muted: Boolean = false,
    val isPinned: Boolean = false,
    val isArchived: Boolean = false,
    val draftBody: String = "",
    val lastReadAt: String = "",
)

@Immutable
data class ConversationPinModel(
    val messageId: String,
    val body: String,
    val senderUid: String?,
    val mediaName: String,
    val kind: String,
    val pinnedAt: String,
    val pinnedBy: String,
)

@Immutable
data class SavedMessageItem(
    val messageId: String,
    val conversationId: String,
    val body: String,
    val mediaName: String,
    val kind: String,
    val createdAt: String,
)

@Immutable
data class MessageSearchHitItem(
    val messageId: String,
    val conversationId: String,
    val senderUid: String?,
    val body: String,
    val createdAt: String,
)

@Immutable
data class ConversationMemberItem(
    val uid: String,
    val role: String,
    val lastReadAt: String,
    val leftAt: String?,
    val profile: MessengerPeerProfile?,
)

@Immutable
data class ChatMessageItem(
    val id: String,
    val conversationId: String,
    val senderUid: String?,
    val kind: String, // text | image | snippet | system
    val body: String,
    val mediaUrl: String,
    val mediaName: String,
    val codeLanguage: String,
    val replyTo: String?,
    val replyBody: String?,
    val replySender: String?,
    val editedAt: String?,
    val deletedAt: String?,
    val createdAt: String,
    val clientId: String? = null,
    val author: MessengerPeerProfile? = null,
    val reactions: Map<String, Int> = emptyMap(),
    val myReactions: List<String> = emptyList(),
    val readBy: List<String> = emptyList(),
    val starred: Boolean = false,
    val pinned: Boolean = false,
    val deliveryState: OutboxDeliveryState = OutboxDeliveryState.CONFIRMED,
) {
    val isDeleted: Boolean get() = !deletedAt.isNullOrBlank()
    val isEdited: Boolean get() = !editedAt.isNullOrBlank() && !isDeleted
}

@Immutable
data class ChatMessageGroup(
    val senderUid: String?,
    val author: MessengerPeerProfile?,
    val startedAt: String,
    val messages: List<ChatMessageItem>,
)
