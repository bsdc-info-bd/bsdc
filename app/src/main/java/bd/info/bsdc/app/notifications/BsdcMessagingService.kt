package bd.info.bsdc.app.notifications

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import bd.info.bsdc.app.BsdcApplication
import bd.info.bsdc.app.MainActivity
import bd.info.bsdc.app.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlin.random.Random

class BsdcMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        serviceScope.launch { (application as BsdcApplication).container.notifications.registerDevice(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Data-only messages preserve a consistent experience in foreground and background.
        val title = message.data["title"]?.take(100) ?: getString(R.string.app_name)
        val body = message.data["body"]?.take(240) ?: return
        val target = message.data["targetPath"]?.takeIf { it.startsWith("/") } ?: "/notifications"
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_TARGET_PATH, target)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            target.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val isMessage = message.data["kind"] == "message"
        val channel = if (isMessage) BsdcApplication.CHANNEL_MESSAGES else BsdcApplication.CHANNEL_COMMUNITY
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(if (isMessage) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_SOCIAL)
            // High-priority channels and a public notification ensure an incoming BSDC message
            // can alert on a locked device, subject to the member's Android lock-screen settings.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        if (NotificationManagerCompat.from(this).areNotificationsEnabled()) {
            NotificationManagerCompat.from(this).notify(Random.nextInt(), notification)
        }
    }
}
