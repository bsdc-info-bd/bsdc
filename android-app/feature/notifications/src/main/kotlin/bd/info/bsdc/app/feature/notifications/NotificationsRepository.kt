package bd.info.bsdc.app.feature.notifications

import bd.info.bsdc.app.core.model.NotificationPrefs
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

@Serializable
private data class MyInboxRowDto(
    @SerialName("notification_id") val notificationId: String = "",
    val kind: String = "comment",
    @SerialName("actor_uid") val actorUid: String? = null,
    @SerialName("actor_username") val actorUsername: String? = null,
    @SerialName("actor_name") val actorName: String? = null,
    @SerialName("actor_avatar") val actorAvatar: String? = null,
    val body: String = "",
    @SerialName("post_id") val postId: String? = null,
    @SerialName("comment_id") val commentId: String? = null,
    @SerialName("conversation_id") val conversationId: String? = null,
    @SerialName("target_url") val targetUrl: String = "/notifications",
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("last_at") val lastAt: String = "",
    @SerialName("created_at") val createdAt: String = "",
    val occurrences: Int = 1,
    @SerialName("unread_count") val unreadCount: Int = 0,
    @SerialName("is_unread") val isUnread: Boolean = false,
)

class NotificationsRepository(
    private val supabase: SupabaseRestClient,
) {
    private val json = BsdcHttpClientFactory.sharedJson

    suspend fun fetchInbox(limit: Int = 50): List<NotificationInboxItem> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "my_inbox",
            params = buildJsonObject { put("p_limit", limit) },
            requireAuth = true,
        )
        json.decodeFromString<List<MyInboxRowDto>>(raw).map { r ->
            NotificationInboxItem(
                id = r.notificationId,
                kind = r.kind,
                body = r.body,
                postId = r.postId,
                commentId = r.commentId,
                conversationId = r.conversationId,
                targetUrl = r.targetUrl,
                readAt = r.readAt,
                lastAt = r.lastAt,
                createdAt = r.createdAt,
                occurrences = r.occurrences.coerceAtLeast(1),
                unreadCount = r.unreadCount.coerceAtLeast(0),
                isUnread = r.isUnread,
                actor = r.actorUid?.takeIf { it.isNotBlank() }?.let { uid ->
                    NotificationActorSummary(
                        uid = uid,
                        username = r.actorUsername.orEmpty(),
                        displayName = r.actorName.orEmpty(),
                        avatarUrl = r.actorAvatar.orEmpty(),
                    )
                },
            )
        }
    }

    suspend fun fetchUnreadCount(): Int = withContext(Dispatchers.IO) {
        val raw = runCatching {
            supabase.rpcText("inbox_unread_count", requireAuth = true)
        }.getOrNull() ?: return@withContext 0
        raw.trim().toIntOrNull() ?: 0
    }

    suspend fun markInboxRead(ids: List<String>? = null): Int = withContext(Dispatchers.IO) {
        val params = buildJsonObject {
            if (ids == null) {
                put("p_ids", JsonNull)
            } else {
                put("p_ids", buildJsonArray { ids.forEach { add(JsonPrimitive(it)) } })
            }
        }
        val raw = supabase.rpcText("mark_inbox_read", params, requireAuth = true)
        raw.trim().toIntOrNull() ?: 0
    }

    suspend fun clearInbox(keepDays: Int = 0): Int = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "clear_inbox",
            params = buildJsonObject { put("p_keep_days", keepDays) },
            requireAuth = true,
        )
        raw.trim().toIntOrNull() ?: 0
    }

    suspend fun updateNotificationPrefs(
        uid: String,
        prefs: NotificationPrefs,
    ): Unit = withContext(Dispatchers.IO) {
        supabase.patchJson(
            table = "profiles",
            body = buildJsonObject {
                putJsonObject("notifications") {
                    put("followers", prefs.followers)
                    put("comments", prefs.comments)
                    put("mentions", prefs.mentions)
                    put("messages", prefs.messages)
                    put("digest", prefs.digest)
                }
            },
            queryPairs = listOf("uid" to "eq.$uid"),
        )
    }
}
