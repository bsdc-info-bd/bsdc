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
