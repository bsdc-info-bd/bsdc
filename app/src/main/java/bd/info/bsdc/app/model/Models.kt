package bd.info.bsdc.app.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId

enum class PostVisibility { PUBLIC, FOLLOWERS, ONLY_ME, GROUP }
enum class MediaKind { IMAGE, AUDIO }
enum class ReactionType { LIKE, LOVE, CARE, INSIGHTFUL, CELEBRATE }
enum class NotificationKind { COMMENT, REACTION, FOLLOW, MESSAGE, MENTION, SYSTEM }

data class UserProfile(
    @DocumentId val id: String = "",
    val username: String = "",
    val displayName: String = "",
    val bio: String = "",
    val photoUrl: String? = null,
    val coverUrl: String? = null,
    val locationLabel: String? = null,
    val skills: List<String> = emptyList(),
    val followerCount: Long = 0,
    val followingCount: Long = 0,
    val verified: Boolean = false,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

data class MediaAttachment(
    val url: String = "",
    val publicId: String? = null,
    val kind: String = MediaKind.IMAGE.name,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Long? = null,
    val altText: String? = null
)

data class CommunityPost(
    @DocumentId val id: String = "",
    val authorId: String = "",
    val authorHandle: String = "",
    val authorName: String = "",
    val authorPhotoUrl: String? = null,
    val body: String = "",
    val language: String = "en",
    val tags: List<String> = emptyList(),
    val media: List<MediaAttachment> = emptyList(),
    val visibility: String = PostVisibility.PUBLIC.name,
    val status: String = "published",
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null,
    val reactionCount: Long = 0,
    val commentCount: Long = 0,
    val shareCount: Long = 0,
    val saveCount: Long = 0,
    val ranking: PostRanking = PostRanking()
)

data class PostRanking(
    val authorAffinity: Double = 0.0,
    val topicAffinity: Double = 0.0,
    val quality: Double = 0.0,
    val negativeFeedback: Double = 0.0,
    val reportRate: Double = 0.0,
    val dwellProbability: Double = 0.0,
    val commentProbability: Double = 0.0,
    val shareProbability: Double = 0.0
)

data class PostComment(
    @DocumentId val id: String = "",
    val authorId: String = "",
    val authorName: String = "",
    val authorPhotoUrl: String? = null,
    val body: String = "",
    val parentId: String? = null,
    val createdAt: Timestamp? = null,
    val reactionCount: Long = 0,
    val status: String = "published"
)

data class DirectConversation(
    val id: String = "",
    val kind: String = "direct",
    val title: String = "",
    val description: String = "",
    val createdBy: String? = null,
    val participantIds: List<String> = emptyList(),
    val lastMessage: String = "",
    val lastMessageAt: Long = 0,
    val unreadBy: Map<String, Long> = emptyMap(),
    val memberCount: Long = 0
)

data class ChatMessage(
    val id: String = "",
    val senderId: String = "",
    val kind: String = "text",
    val body: String = "",
    val attachmentUrl: String? = null,
    val sentAt: Long = 0,
    val editedAt: Long? = null,
    val deletedAt: Long? = null,
    val seenBy: Map<String, Long> = emptyMap(),
    val replyToId: String? = null
)

data class AppNotification(
    val id: String = "",
    val recipientId: String = "",
    val actorId: String? = null,
    val kind: String = NotificationKind.SYSTEM.name,
    val title: String = "",
    val body: String = "",
    val targetPath: String? = null,
    val isRead: Boolean = false,
    val createdAt: Timestamp? = null
)

data class UploadResult(
    val secureUrl: String,
    val publicId: String?,
    val resourceType: MediaKind,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Long? = null
)
