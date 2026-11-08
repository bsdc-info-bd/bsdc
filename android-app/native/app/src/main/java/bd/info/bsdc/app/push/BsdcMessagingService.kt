package bd.info.bsdc.app.push

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.MainActivity
import bd.info.bsdc.app.R
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BsdcMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val app = FirebaseApp.getApps(applicationContext).firstOrNull() ?: return
        val user = FirebaseAuth.getInstance(app).currentUser ?: return
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { FcmDeviceRepository(applicationContext, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY).register(user, token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = (message.notification?.title ?: message.data["title"] ?: "BSDC").take(120)
        val body = (message.notification?.body ?: message.data["body"] ?: "You have a new activity.").take(240)
        val path = message.data["path"]?.takeIf { it.startsWith("/") && !it.startsWith("//") } ?: "/"
        val intent = Intent(this, MainActivity::class.java).apply {
            action = "bd.info.bsdc.app.OPEN_NOTIFICATION"
            putExtra("path", path)
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(this, message.data["eventId"]?.hashCode() ?: 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, MainActivity.NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setAutoCancel(true).setContentIntent(pendingIntent).build()
        runCatching { getSystemService(NotificationManager::class.java).notify(message.data["eventId"]?.hashCode() ?: 1, notification) }
    }
}
