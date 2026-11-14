package bd.info.bsdc.app.core.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object PushChannelManager {

    private const val BSDC_ACCENT_COLOR = 0xFF15803D.toInt()

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
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableLights(true)
                lightColor = BSDC_ACCENT_COLOR
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_SOCIAL,
                "Community & Replies",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Comments, reactions, mentions, polls, and followers (মন্তব্য, প্রতিক্রিয়া ও মেনশন)"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableLights(true)
                lightColor = BSDC_ACCENT_COLOR
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_ORDERS,
                "Marketplace Orders",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Order status updates and seller reviews (অর্ডারের আপডেট ও রিভিউ)"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableLights(true)
                lightColor = BSDC_ACCENT_COLOR
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_VERIFY_ALERTS,
                "Verification & Notices",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Document verification, certificates, courses, events, proposals, and jobs"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableLights(true)
                lightColor = BSDC_ACCENT_COLOR
                enableVibration(true)
                setShowBadge(true)
            },
            NotificationChannel(
                PushNotificationRouter.CHANNEL_GENERAL,
                "General Digests",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Summarized community digests and platform updates"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(false)
            },
        )
        manager.createNotificationChannels(channels)
    }
}
