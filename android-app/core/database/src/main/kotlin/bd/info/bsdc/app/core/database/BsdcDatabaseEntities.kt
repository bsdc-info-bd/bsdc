package bd.info.bsdc.app.core.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "posts_cache",
    indices = [
        Index(value = ["algorithm", "feedOrder"]),
        Index(value = ["cachedAtEpochMs"]),
    ],
)
data class CachedPostEntity(
    @PrimaryKey val postId: String,
    val algorithm: String,
    val feedOrder: Int,
    val slug: String,
    val kind: String,
    val title: String,
    val body: String,
    val excerpt: String,
    val coverUrl: String,
    val code: String,
    val codeLanguage: String,
    val language: String,
    val readingTime: Int,
    val views: Int,
    val likes: Int,
    val comments: Int,
    val isSensitive: Boolean,
    val allowComments: Boolean,
    val publishedAt: String,
    val createdAt: String,
    val authorUid: String,
    val authorUsername: String,
    val authorDisplayName: String,
    val authorAvatarUrl: String,
    val tagsJson: String,
    val mediaJson: String,
    val pollJson: String,
    val cachedAtEpochMs: Long,
)

@Entity(
    tableName = "bookmarks_cache",
    indices = [Index(value = ["savedAtEpochMs"])],
)
data class BookmarkEntity(
    @PrimaryKey val postId: String,
    val slug: String,
    val title: String,
    val excerpt: String,
    val bodyMarkdown: String,
    val coverUrl: String,
    val authorDisplayName: String,
    val authorUsername: String,
    val savedAtEpochMs: Long,
)

@Entity(
    tableName = "pending_drafts",
    indices = [Index(value = ["updatedAtEpochMs"])],
)
data class PendingDraftEntity(
    @PrimaryKey val localId: String,
    val remotePostId: String?,
    val kind: String,
    val title: String,
    val bodyMarkdown: String,
    val code: String,
    val codeLanguage: String,
    val language: String,
    val tagsJson: String,
    val uploadedMediaJson: String,
    val pollOptionsJson: String,
    val updatedAtEpochMs: Long,
)

/**
 * Offline Messenger outbox queue — intentionally carries ONLY text, reply references,
 * code/markdown, and ImgBB image URLs (zero audio note columns).
 */
@Entity(
    tableName = "pending_outbox_messages",
    indices = [
        Index(value = ["conversationId", "createdAtEpochMs"]),
        Index(value = ["status"]),
    ],
)
data class PendingOutboxMessageEntity(
    @PrimaryKey val clientMessageId: String,
    val conversationId: String,
    val replyToMessageId: String?,
    val body: String,
    val kind: String = "text", // text, image, snippet
    val mediaUrl: String = "",
    val mediaName: String = "",
    val codeLanguage: String = "",
    val status: String, // PENDING, SENDING, FAILED
    val retryCount: Int,
    val createdAtEpochMs: Long,
)

@Entity(
    tableName = "threads_cache",
    indices = [Index(value = ["lastMessageAtEpochMs"])],
)
data class CachedThreadEntity(
    @PrimaryKey val conversationId: String,
    val title: String,
    val isGroup: Boolean,
    val avatarUrl: String,
    val peerUid: String?,
    val lastMessagePreview: String,
    val unreadCount: Int,
    val muted: Boolean,
    val isPinned: Boolean = false,
    val isArchived: Boolean = false,
    val lastMessageAtEpochMs: Long,
)

@Entity(
    tableName = "messages_cache",
    indices = [Index(value = ["conversationId", "createdAtEpochMs"])],
)
data class CachedMessageEntity(
    @PrimaryKey val messageId: String,
    val clientMessageId: String?,
    val conversationId: String,
    val senderUid: String,
    val senderName: String,
    val senderAvatarUrl: String,
    val replyToId: String?,
    val body: String,
    val imageUrl: String?,
    val thumbUrl: String?,
    val reactionsJson: String,
    val pinned: Boolean,
    val edited: Boolean,
    val createdAtEpochMs: Long,
)

@Entity(
    tableName = "verification_history",
    indices = [Index(value = ["verifiedAtEpochMs"])],
)
data class VerificationHistoryEntity(
    @PrimaryKey val code: String,
    val kind: String,
    val state: String,
    val subject: String,
    val issuer: String,
    val detail: String,
    val pdfSha256: String?,
    val verifiedAtEpochMs: Long,
)

@Entity(
    tableName = "saved_searches",
    indices = [Index(value = ["searchedAtEpochMs"])],
)
data class SavedSearchEntity(
    @PrimaryKey val query: String,
    val isVoiceQuery: Boolean,
    val searchedAtEpochMs: Long,
)
