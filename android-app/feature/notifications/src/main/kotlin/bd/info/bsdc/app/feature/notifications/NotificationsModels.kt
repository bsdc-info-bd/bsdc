package bd.info.bsdc.app.feature.notifications

import androidx.compose.runtime.Immutable
import bd.info.bsdc.app.core.model.NotificationPrefs

@Immutable
data class NotificationActorSummary(
    val uid: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String,
)

@Immutable
data class NotificationInboxItem(
    val id: String,
    val kind: String,
    val body: String,
    val postId: String?,
    val commentId: String?,
    val conversationId: String?,
    val targetUrl: String,
    val readAt: String?,
    val lastAt: String,
    val createdAt: String,
    val occurrences: Int,
    val unreadCount: Int,
    val isUnread: Boolean,
    val actor: NotificationActorSummary?,
)

@Immutable
data class NotificationSettingsSnapshot(
    val prefs: NotificationPrefs = NotificationPrefs(),
)
