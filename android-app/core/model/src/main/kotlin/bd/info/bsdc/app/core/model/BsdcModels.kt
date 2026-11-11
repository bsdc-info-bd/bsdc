package bd.info.bsdc.app.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Public BSDC hosts that open natively in Compose without any WebView. */
object BsdcHosts {
    const val SITE_ORIGIN = "https://www.bsdc.info.bd"
    const val VF_ORIGIN = "https://vf.main.bsdc.info.bd"
    const val NEWS_ORIGIN = "https://news.bsdc.info.bd"
    const val PUSH_WORKER_ORIGIN = "https://push.api.bsdc.info.bd"
    const val APP_SCHEME = "bsdc"
    const val PACKAGE_ID = "bd.info.bsdc.app"

    @JvmField
    val NATIVE_HOSTS: Set<String> = setOf(
        "www.bsdc.info.bd",
        "bsdc.info.bd",
        "vf.main.bsdc.info.bd",
        "vf.bsdc.info.bd",
    )

    @JvmField
    val NEWS_HOSTS: Set<String> = setOf("news.bsdc.info.bd")

    @JvmField
    val IMGBB_HOSTS: Set<String> = setOf("i.ibb.co", "ibb.co", "i.ibb.co.com")
}

@Serializable
enum class AppLanguage(val tag: String, val speechLocale: String, val nativeLabel: String) {
    @SerialName("bn")
    BN("bn", "bn-BD", "বাংলা"),

    @SerialName("en")
    EN("en", "en-US", "English"),
}

@Serializable
enum class ThemeMode {
    @SerialName("system")
    SYSTEM,

    @SerialName("light")
    LIGHT,

    @SerialName("dark")
    DARK,
}

@Serializable
enum class DocKind(val code: String) {
    @SerialName("CT")
    CT("CT"),

    @SerialName("NT")
    NT("NT"),

    @SerialName("ID")
    ID("ID");

    companion object {
        @JvmStatic
        fun fromCode(raw: String): DocKind? = entries.firstOrNull { it.code.equals(raw, ignoreCase = true) }
    }
}

@Serializable
enum class VerificationState {
    @SerialName("valid")
    VALID,

    @SerialName("revoked")
    REVOKED,

    @SerialName("expired")
    EXPIRED,

    @SerialName("withdrawn")
    WITHDRAWN,

    @SerialName("unknown")
    UNKNOWN,

    @SerialName("malformed")
    MALFORMED,
}

@Serializable
data class VerificationResult(
    val code: String,
    val kind: String,
    val valid: Boolean,
    val state: VerificationState,
    val reason: String,
    val subject: String = "",
    val detail: String = "",
    val issuer: String = "",
    @SerialName("issued_on") val issuedOn: String? = null,
    @SerialName("expires_on") val expiresOn: String? = null,
    val verifications: Int = 0,
)

sealed interface ParsedDocCode {
    data class Valid(
        val code: String,
        val kind: DocKind,
        val body: String,
    ) : ParsedDocCode

    data class Invalid(
        val code: String,
        val reason: String,
    ) : ParsedDocCode
}

sealed interface LinkDestination {
    data class NativeRoute(val path: String) : LinkDestination
    data class NewsReader(val url: String) : LinkDestination
    data class AdminWebOnly(val path: String) : LinkDestination
    data class ExternalBrowser(val url: String) : LinkDestination
    data class Ignored(val reason: String) : LinkDestination
}

@Serializable
enum class PostKind {
    @SerialName("post")
    POST,

    @SerialName("article")
    ARTICLE,

    @SerialName("question")
    QUESTION,

    @SerialName("poll")
    POLL,

    @SerialName("snippet")
    SNIPPET,
}

@Serializable
enum class ReactionKind(val wireName: String) {
    @SerialName("like")
    LIKE("like"),

    @SerialName("insightful")
    INSIGHTFUL("insightful"),

    @SerialName("celebrate")
    CELEBRATE("celebrate"),

    @SerialName("support")
    SUPPORT("support"),

    @SerialName("curious")
    CURIOUS("curious"),
}

@Serializable
enum class NotificationKind(val wireName: String) {
    @SerialName("follow")
    FOLLOW("follow"),

    @SerialName("reaction")
    REACTION("reaction"),

    @SerialName("comment")
    COMMENT("comment"),

    @SerialName("reply")
    REPLY("reply"),

    @SerialName("mention")
    MENTION("mention"),

    @SerialName("bookmark")
    BOOKMARK("bookmark"),

    @SerialName("share")
    SHARE("share"),

    @SerialName("post_published")
    POST_PUBLISHED("post_published"),

    @SerialName("moderation")
    MODERATION("moderation"),

    @SerialName("message")
    MESSAGE("message"),

    @SerialName("order")
    ORDER("order"),

    @SerialName("review")
    REVIEW("review"),

    @SerialName("payout")
    PAYOUT("payout"),

    @SerialName("course")
    COURSE("course"),

    @SerialName("job")
    JOB("job"),

    @SerialName("event")
    EVENT("event"),

    @SerialName("certificate")
    CERTIFICATE("certificate"),

    @SerialName("mention_group")
    MENTION_GROUP("mention_group"),

    @SerialName("group_invite")
    GROUP_INVITE("group_invite"),
}

/** Strict ImgBB-only image upload purposes matching main-site/src/lib/storage/media-contract.ts. */
@Serializable
enum class MediaPurpose(val wireValue: String, val maxDimensionPx: Int) {
    @SerialName("avatar")
    AVATAR("avatar", 512),

    @SerialName("cover")
    COVER("cover", 1920),

    @SerialName("project-cover")
    PROJECT_COVER("project-cover", 1920),

    @SerialName("project-image")
    PROJECT_IMAGE("project-image", 1600),

    @SerialName("post-image")
    POST_IMAGE("post-image", 1600),

    @SerialName("comment-image")
    COMMENT_IMAGE("comment-image", 1600),

    @SerialName("product-image")
    PRODUCT_IMAGE("product-image", 1600),
}

enum class DevicePermissionKind {
    NOTIFICATIONS,
    LOCATION,
    CAMERA,
    MICROPHONE,
}

enum class PermissionGrantState {
    GRANTED,
    NEEDS_REQUEST,
    SHOW_RATIONALE,
    PERMANENTLY_DENIED_OPEN_SETTINGS,
}

@Serializable
enum class BsdcRole(val wireValue: String) {
    @SerialName("member")
    MEMBER("member"),

    @SerialName("creator")
    CREATOR("creator"),

    @SerialName("vendor")
    VENDOR("vendor"),

    @SerialName("moderator")
    MODERATOR("moderator"),

    @SerialName("manager")
    MANAGER("manager"),

    @SerialName("admin")
    ADMIN("admin"),

    @SerialName("owner")
    OWNER("owner");

    companion object {
        @JvmStatic
        fun fromWire(value: String?): BsdcRole =
            entries.firstOrNull { it.wireValue.equals(value?.trim(), ignoreCase = true) } ?: MEMBER
    }
}

@Serializable
data class SessionClaims(
    val role: BsdcRole = BsdcRole.MEMBER,
    val vendor: Boolean = false,
    val staff: Boolean = false,
    val postgresAuthenticated: Boolean = false,
)

@Serializable
data class NotificationPrefs(
    val followers: Boolean = true,
    val comments: Boolean = true,
    val mentions: Boolean = true,
    val messages: Boolean = true,
    val digest: Boolean = true,
)

@Serializable
data class PrivacyPrefs(
    val discoverable: Boolean = true,
    val showActivity: Boolean = true,
    val showEmail: Boolean = false,
)

@Serializable
data class MemberProfile(
    val uid: String,
    val username: String = "",
    @SerialName("display_name") val displayName: String = "Member",
    val bio: String = "",
    @SerialName("avatar_url") val avatarUrl: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    val location: String = "",
    val website: String = "",
    val skills: List<String> = emptyList(),
    val interests: List<String> = emptyList(),
    val language: AppLanguage = AppLanguage.BN,
    @SerialName("onboarding_complete") val onboardingComplete: Boolean = false,
    val notifications: NotificationPrefs = NotificationPrefs(),
    val privacy: PrivacyPrefs = PrivacyPrefs(),
    @SerialName("followers_count") val followersCount: Int = 0,
    @SerialName("following_count") val followingCount: Int = 0,
    @SerialName("posts_count") val postsCount: Int = 0,
    val reputation: Int = 0,
    val verified: Boolean = false,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
) {
    val hasClaimedHandle: Boolean get() = username.trim().isNotEmpty()
}

data class ProfileDraft(
    val username: String,
    val displayName: String,
    val bio: String = "",
    val avatarUrl: String = "",
    val coverUrl: String = "",
    val location: String = "",
    val website: String = "",
    val skills: List<String> = emptyList(),
    val interests: List<String> = emptyList(),
    val language: AppLanguage = AppLanguage.BN,
    val onboardingComplete: Boolean = true,
)

data class ProfileStats(
    val followers: Int = 0,
    val following: Int = 0,
    val posts: Int = 0,
    val reputation: Int = 0,
)

data class BsdcUserSession(
    val uid: String,
    val email: String,
    val emailVerified: Boolean,
    val displayName: String,
    val photoUrl: String,
    val isPasswordProvider: Boolean,
    val claims: SessionClaims,
)

data class BsdcBackendConfig(
    val supabaseUrl: String,
    val supabasePublishableKey: String,
    val siteUrl: String = BsdcHosts.SITE_ORIGIN,
    val vfUrl: String = BsdcHosts.VF_ORIGIN,
    val pushWorkerUrl: String = BsdcHosts.PUSH_WORKER_ORIGIN,
    val firebaseWebClientId: String = "",
) {
    val isSupabaseConfigured: Boolean
        get() = supabaseUrl.isNotBlank() && supabasePublishableKey.isNotBlank()
}

@Serializable
data class ReverseGeoResult(
    val place: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
)

@Serializable
data class MediaUploadResult(
    val provider: String = "imgbb",
    val kind: String = "image",
    val url: String,
    val thumbUrl: String = "",
    val deleteToken: String = "",
    val width: Int? = null,
    val height: Int? = null,
    val bytes: Long = 0L,
    val mimeType: String = "image/webp",
    val expiresAt: String? = null,
    val assetId: String? = null,
)

@Serializable
data class PostAuthorSummary(
    val uid: String,
    val username: String = "",
    val displayName: String = "Member",
    val avatarUrl: String = "",
)

@Serializable
data class PostMediaModel(
    val mediaId: String,
    val url: String,
    val thumbUrl: String = "",
    val altText: String = "",
    val position: Int = 0,
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
data class PollOptionModel(
    val id: String,
    val label: String,
    val votes: Int = 0,
    val position: Int = 0,
)

@Serializable
data class FeedPost(
    val id: String,
    val slug: String = "",
    val kind: PostKind = PostKind.POST,
    val title: String = "",
    val body: String = "",
    val excerpt: String = "",
    val coverUrl: String = "",
    val code: String = "",
    val codeLanguage: String = "",
    val language: AppLanguage = AppLanguage.BN,
    val readingTime: Int = 1,
    val views: Int = 0,
    val likes: Int = 0,
    val comments: Int = 0,
    val isSensitive: Boolean = false,
    val allowComments: Boolean = true,
    val publishedAt: String = "",
    val createdAt: String = "",
    val author: PostAuthorSummary? = null,
    val tags: List<String> = emptyList(),
    val media: List<PostMediaModel> = emptyList(),
    val poll: List<PollOptionModel> = emptyList(),
)

enum class SyncNetworkPolicy(val wireValue: String) {
    WIFI_ONLY("wifi_only"),
    WIFI_AND_CELLULAR("wifi_and_cellular"),
    OFF("off");

    companion object {
        @JvmStatic
        fun fromWire(raw: String?): SyncNetworkPolicy =
            entries.firstOrNull { it.wireValue.equals(raw?.trim(), ignoreCase = true) } ?: WIFI_ONLY
    }
}


