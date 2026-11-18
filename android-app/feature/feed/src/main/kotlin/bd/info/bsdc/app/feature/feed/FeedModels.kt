package bd.info.bsdc.app.feature.feed

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.ReactionKind

enum class FeedTab(
    val labelEn: String,
    val labelBn: String,
) {
    FOR_YOU("For You", "আপনার জন্য"),
    FOLLOWING("Following", "অনুসরণ করা"),
    LATEST("Latest", "সাম্প্রতিক"),
    QUESTIONS("Questions", "প্রশ্ন"),
    POLLS("Polls", "পোল"),
    SNIPPETS("Snippets", "কোড স্নিপেট"),
}

data class PostInteractionState(
    val reaction: ReactionKind? = null,
    val bookmarked: Boolean = false,
)

/**
 * The picture a comment carries (migration 0120).
 *
 * The intrinsic size travels with it because Compose needs the aspect ratio
 * before the bytes arrive: a `ContentScale`d image with no ratio reserves no
 * height, so every comment below it jumps once it loads.
 */
data class CommentImage(
    val url: String,
    val thumbUrl: String = "",
    val alt: String = "",
    val width: Int? = null,
    val height: Int? = null,
) {
    val ratio: Float?
        get() = if (width != null && height != null && width > 0 && height > 0) {
            width.toFloat() / height.toFloat()
        } else {
            null
        }
}

data class FeedComment(
    val id: String,
    val postId: String,
    val parentId: String? = null,
    val depth: Int = 0,
    val body: String = "",
    /** Present when the member attached a picture; a comment may be only a picture. */
    val image: CommentImage? = null,
    val likes: Int = 0,
    val replies: Int = 0,
    val isAnswer: Boolean = false,
    val liked: Boolean = false,
    val createdAt: String = "",
    val editedAt: String? = null,
    val author: PostAuthorSummary? = null,
)

data class FeedTrashItem(
    val kind: String,
    val id: String,
    val postId: String,
    val title: String,
    val preview: String,
    val deletedAt: String,
    val expiresAt: String,
    val restorable: Boolean,
    val moderated: Boolean,
)

data class FeedLoadBundle(
    val posts: List<FeedPost>,
    val interactions: Map<String, PostInteractionState>,
    val reasonsByPostId: Map<String, List<String>>,
    val isFromOfflineCache: Boolean,
    val emptyReason: FeedRankingEngine.EmptyReason = FeedRankingEngine.EmptyReason.NONE,
)

enum class ReportReason(val wireValue: String, val labelEn: String, val labelBn: String) {
    SPAM("spam", "Spam or promotional abuse", "স্প্যাম বা অযাচিত প্রচারণা"),
    HARASSMENT("harassment", "Harassment or abuse", "হয়রানি বা অপব্যবহার"),
    MISINFORMATION("misinformation", "Harmful misinformation", "ক্ষতিকর ভুল তথ্য"),
    COPYRIGHT("copyright", "Plagiarism or copyright violation", "কপিরাইট বা চুরি করা কন্টেন্ট"),
    OTHER("other", "Other community guideline issue", "অন্যান্য নীতিমালা ভঙ্গ");

    fun label(language: AppLanguage): String = if (language == AppLanguage.BN) labelBn else labelEn
}
