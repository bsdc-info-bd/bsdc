package bd.info.bsdc.app.model

import bd.info.bsdc.app.content.PostEmbed
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId

enum class PostVisibility { PUBLIC, FOLLOWERS, ONLY_ME, GROUP }
enum class MediaKind { IMAGE, AUDIO }
enum class ReactionType { LIKE, LOVE, CARE, INSIGHTFUL, CELEBRATE }
enum class NotificationKind { COMMENT, REACTION, FOLLOW, MESSAGE, MENTION, SYSTEM }
enum class ReportReason { SPAM, HARASSMENT, HATE, SEXUAL_CONTENT, VIOLENCE, SELF_HARM, MISINFORMATION, INTELLECTUAL_PROPERTY, OTHER }
enum class ReportState { OPEN, DISMISSED, ACTIONED }
enum class ModerationAction { DISMISS, HIDE_POST, RESTORE_POST }

data class ContentReport(
    @DocumentId val id: String = "",
    val targetType: String = "post",
    val targetId: String = "",
    val reporterId: String = "",
    val reason: String = ReportReason.OTHER.name,
    val details: String = "",
    val state: String = ReportState.OPEN.name,
    val createdAt: Timestamp? = null,
    val reviewedAt: Timestamp? = null,
    val reviewerId: String? = null,
    val resolution: String? = null,
    val moderationNote: String? = null
)

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
    /** Canonical Markdown source. When present, frontmatter is always its first block. */
    val body: String = "",
    val format: String = "markdown",
    val frontmatter: Map<String, String> = emptyMap(),
    val embeds: List<PostEmbed> = emptyList(),
    val language: String = "en",
    val tags: List<String> = emptyList(),
    val media: List<MediaAttachment> = emptyList(),
    val visibility: String = PostVisibility.PUBLIC.name,
    /** draft, scheduled, or published. Drafts are private to contributors. */
    val status: String = "published",
    val scheduledAt: Timestamp? = null,
    val publishedAt: Timestamp? = null,
    val seriesId: String? = null,
    val seriesTitle: String? = null,
    val seriesOrder: Long? = null,
    val organizationId: String? = null,
    val organizationName: String? = null,
    val organizationHandle: String? = null,
    val coAuthorIds: List<String> = emptyList(),
    val coAuthorNames: List<String> = emptyList(),
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null,
    val reactionCount: Long = 0,
    val commentCount: Long = 0,
    val shareCount: Long = 0,
    val saveCount: Long = 0,
    val ranking: PostRanking = PostRanking()
)

data class ContentSeries(
    @DocumentId val id: String = "",
    val ownerId: String = "",
    val title: String = "",
    val description: String = "",
    val postCount: Long = 0,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

data class CommunityOrganization(
    @DocumentId val id: String = "",
    val handle: String = "",
    val name: String = "",
    val description: String = "",
    val photoUrl: String? = null,
    val ownerId: String = "",
    val memberCount: Long = 0,
    val createdAt: Timestamp? = null,
    val updatedAt: Timestamp? = null
)

data class OrganizationMembership(
    @DocumentId val id: String = "",
    val organizationId: String = "",
    val organizationName: String = "",
    val organizationHandle: String = "",
    val memberId: String = "",
    val memberName: String = "",
    val memberHandle: String = "",
    val role: String = "editor",
    val joinedAt: Timestamp? = null
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
