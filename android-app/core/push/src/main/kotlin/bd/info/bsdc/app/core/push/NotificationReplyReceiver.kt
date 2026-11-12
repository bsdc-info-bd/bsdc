package bd.info.bsdc.app.core.push

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import bd.info.bsdc.app.core.database.PendingOutboxMessageEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

/**
 * Handles Android lock-screen RemoteInput replies straight to `send_message_once`
 * with Room outbox persistence fallback when offline.
 */
class NotificationReplyReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != PushNotificationRouter.ACTION_INLINE_REPLY) return
        val results = RemoteInput.getResultsFromIntent(intent) ?: return
        val replyText = results.getCharSequence(PushNotificationRouter.REMOTE_INPUT_KEY)
            ?.toString()?.trim().orEmpty()
        if (replyText.isEmpty()) return

        val conversationId = intent.getStringExtra(PushNotificationRouter.EXTRA_CONVERSATION_ID)
            ?.takeIf { it.isNotBlank() } ?: return
        val notifId = intent.getIntExtra(PushNotificationRouter.EXTRA_NOTIFICATION_ID, 0)
        val deps = context.applicationContext as? PushRuntimeDependencies ?: return

        val pendingResult = goAsync()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope.launch {
            try {
                val clientId = UUID.randomUUID().toString()
                val db = deps.provideDatabase()
                val entity = PendingOutboxMessageEntity(
                    clientMessageId = clientId,
                    conversationId = conversationId,
                    replyToMessageId = null,
                    body = replyText.take(8_000),
                    kind = "text",
                    status = "SENDING",
                    retryCount = 0,
                    createdAtEpochMs = System.currentTimeMillis(),
                )
                db.outboxMessageDao().upsert(entity)

                val sent = runCatching {
                    deps.provideSupabaseRestClient().rpcText(
                        functionName = "send_message_once",
                        params = buildJsonObject {
                            put("p_conversation_id", conversationId)
                            put("p_client_id", clientId)
                            put("p_body", entity.body)
                            put("p_kind", "text")
                            put("p_media_url", "")
                            put("p_media_name", "")
                            put("p_code_language", "")
                            put("p_reply_to", JsonNull)
                        },
                        requireAuth = true,
                    )
                    db.outboxMessageDao().remove(clientId)
                }
                if (sent.isFailure) {
                    db.outboxMessageDao().updateStatus(clientId, "FAILED", 1)
                }

                if (notifId != 0) {
                    val canNotify = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                        ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.POST_NOTIFICATIONS,
                        ) == PackageManager.PERMISSION_GRANTED
                    if (canNotify) {
                        val icon = context.applicationInfo.icon.takeIf { it != 0 }
                            ?: android.R.drawable.ic_dialog_info
                        val ack = NotificationCompat.Builder(
                            context,
                            PushNotificationRouter.CHANNEL_MESSENGER,
                        )
                            .setSmallIcon(icon)
                            .setContentText(
                                if (sent.isSuccess) "Sent: $replyText" else "Queued offline: $replyText",
                            )
                            .setAutoCancel(true)
                            .build()
                        NotificationManagerCompat.from(context).notify(notifId, ack)
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
