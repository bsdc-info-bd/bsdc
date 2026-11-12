package bd.info.bsdc.app.core.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import bd.info.bsdc.app.core.model.AppLanguage
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Handles FCM HTTP v1 pure-data HIGH-priority pushes across all 5 Android O+
 * channels with MessagingStyle grouping, RemoteInput inline lock-screen replies,
 * monochrome status bar iconography, public lockscreen visibility, and live
 * in-process PushEventBus broadcasting even across Doze / backgrounded states.
 */
class BsdcFirebaseMessagingService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val deps = applicationContext as? PushRuntimeDependencies
        val uid = runCatching { FirebaseAuth.getInstance().currentUser?.uid }.getOrNull()
        if (deps == null || uid.isNullOrBlank()) {
            PushRegistrationSyncWorker.enqueueImmediate(applicationContext)
            return
        }
        serviceScope.launch {
            val res = runCatching {
                val lang = if (resources.configuration.locales[0]?.language == "en") {
                    AppLanguage.EN
                } else {
                    AppLanguage.BN
                }
                deps.providePushRegistrationManager().registerRawToken(uid, token, lang)
            }
            if (res.isFailure) {
                PushRegistrationSyncWorker.enqueueImmediate(applicationContext)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        PushChannelManager.ensureChannels(applicationContext)

        val data = message.data
        if (data.isEmpty() && message.notification == null) return

        val title = data["title"]?.takeIf { it.isNotBlank() }
            ?: message.notification?.title?.takeIf { it.isNotBlank() }
            ?: "BSDC"
        val body = data["body"]?.takeIf { it.isNotBlank() }
            ?: message.notification?.body?.takeIf { it.isNotBlank() }
            ?: ""
        val relativePath = PushNotificationRouter.sanitizeRelativePath(data)
        val kind = data["kind"] ?: ""
        val explicitChannel = data["channel_id"]
        val channelId = PushNotificationRouter.resolveChannelId(kind, relativePath, explicitChannel)
        val tag = data["tag"] ?: "bsdc-alert"
        val conversationId = PushNotificationRouter.extractConversationId(
            relativePath,
            data[PushNotificationRouter.EXTRA_CONVERSATION_ID],
        )
        val notificationIdPayload = data["notification_id"]?.takeIf { it.isNotBlank() }

        PushEventBus.emit(
            PushArrivalEvent(
                kind = kind,
                path = relativePath,
                channelId = channelId,
                conversationId = conversationId,
                notificationId = notificationIdPayload,
                title = title,
                body = body,
            ),
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        val notifId = PushNotificationRouter.stableNotificationId(tag, channelId, conversationId)

        val launchIntent = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
            action = PushNotificationRouter.ACTION_OPEN_URL
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("url", relativePath)
            putExtra("path", relativePath)
            putExtra("kind", kind)
        }
        val contentIntent = PendingIntent.getActivity(
            this,
            notifId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val category = when (channelId) {
            PushNotificationRouter.CHANNEL_MESSENGER -> NotificationCompat.CATEGORY_MESSAGE
            PushNotificationRouter.CHANNEL_SOCIAL -> NotificationCompat.CATEGORY_SOCIAL
            PushNotificationRouter.CHANNEL_ORDERS,
            PushNotificationRouter.CHANNEL_VERIFY_ALERTS -> NotificationCompat.CATEGORY_STATUS
            else -> NotificationCompat.CATEGORY_RECOMMENDATION
        }

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_bsdc)
            .setColor(ContextCompat.getColor(this, R.color.bsdc_notification_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(false)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setCategory(category)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setPriority(
                if (channelId == PushNotificationRouter.CHANNEL_MESSENGER ||
                    channelId == PushNotificationRouter.CHANNEL_VERIFY_ALERTS ||
                    channelId == PushNotificationRouter.CHANNEL_ORDERS
                ) {
                    NotificationCompat.PRIORITY_HIGH
                } else {
                    NotificationCompat.PRIORITY_DEFAULT
                },
            )

        if (channelId == PushNotificationRouter.CHANNEL_MESSENGER && !conversationId.isNullOrBlank()) {
            val senderPerson = Person.Builder().setName(title).build()
            val style = NotificationCompat.MessagingStyle(senderPerson)
                .setConversationTitle(title)
                .addMessage(body, System.currentTimeMillis(), senderPerson)
            builder.setStyle(style)

            val remoteInput = RemoteInput.Builder(PushNotificationRouter.REMOTE_INPUT_KEY)
                .setLabel("Reply / উত্তর দিন")
                .build()
            val replyIntent = Intent(this, NotificationReplyReceiver::class.java).apply {
                action = PushNotificationRouter.ACTION_INLINE_REPLY
                putExtra(PushNotificationRouter.EXTRA_CONVERSATION_ID, conversationId)
                putExtra(PushNotificationRouter.EXTRA_NOTIFICATION_ID, notifId)
            }
            val replyPending = PendingIntent.getBroadcast(
                this,
                notifId + 7,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            val replyAction = NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Reply",
                replyPending,
            ).addRemoteInput(remoteInput).build()
            builder.addAction(replyAction)
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }

        NotificationManagerCompat.from(this).notify(notifId, builder.build())
    }
}
