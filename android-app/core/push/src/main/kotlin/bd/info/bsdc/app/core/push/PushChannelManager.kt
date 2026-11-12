package bd.info.bsdc.app.core.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object PushChannelManager {

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return

        val channels = listOf(
            NotificationChannel(
                PushNotificationRouter.CHANNEL_MESSENGER,
                "Messenger",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Direct and group chat messages (রিয়েল-টাইম মেসেঞ্জার বার্তা)"
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_SOCIAL,
                "Community & Replies",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Comments, reactions, mentions, and followers (মন্তব্য, প্রতিক্রিয়া ও মেনশন)"
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_ORDERS,
                "Marketplace Orders & Payouts",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Order updates, seller reviews, and vendor payouts (অর্ডার ও পেমেন্ট)"
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_VERIFY_ALERTS,
                "Verification & Notices",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Document verification, certificates, courses, events, and jobs"
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_GENERAL,
                "General Digests",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Summarized community digests and platform updates"
                setShowBadge(false)
            },
        )
        manager.createNotificationChannels(channels)
    }
}
