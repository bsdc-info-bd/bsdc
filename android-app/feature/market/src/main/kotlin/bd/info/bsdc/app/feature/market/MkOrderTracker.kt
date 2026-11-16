package bd.info.bsdc.app.feature.market

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import bd.info.bsdc.app.core.push.PushNotificationRouter

/**
 * One ongoing status notification per open customer order: placed, accepted, packaged, out for
 * delivery. It is removed when the order is delivered or cancelled.
 *
 * Status always comes from mk_my_orders, never from the push text, so the notification matches the
 * server. Sync runs when an order push arrives and when the app starts. The notifications are silent
 * because the push itself already alerts the customer.
 */
object MkOrderTracker {
    private const val PREFS = "bsdc.mk_order_tracker"
    private const val KEY_ACTIVE = "active_order_ids"
    private const val NOTIFICATION_BASE = 0x4D4B0000 // "MK" block, clear of push notification ids
    private const val ORDERS_PATH = "/marketplace/orders"
    private const val TIMELINE_MAX = 4

    /**
     * Brings the device in line with the server. If the fetch fails (signed out, offline), the
     * current notifications are left as they are.
     */
    suspend fun sync(context: Context, repository: MkRepository, smallIcon: Int) {
        val orders = repository.fetchMyOrders().getOrNull() ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = prefs.getStringSet(KEY_ACTIVE, emptySet()).orEmpty().toSet()
        val active = orders.filter { MkLogic.isActiveOrderStatus(it.status) }
        val activeIds = active.map { it.id }.toSet()
        val manager = NotificationManagerCompat.from(context)

        // Orders that have finished (or dropped out of the list) lose their notification.
        (previous - activeIds).forEach { manager.cancel(notificationId(it)) }
        if (manager.areNotificationsEnabled()) {
            active.forEach { post(context, manager, it, smallIcon) }
        }
        prefs.edit().putStringSet(KEY_ACTIVE, activeIds).apply()
    }

    /** Removes every order notification. Call on sign-out so the next person on the device sees none. */
    fun clear(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val manager = NotificationManagerCompat.from(context)
        prefs.getStringSet(KEY_ACTIVE, emptySet()).orEmpty().forEach { manager.cancel(notificationId(it)) }
        prefs.edit().remove(KEY_ACTIVE).apply()
    }

    @SuppressLint("MissingPermission")
    private fun post(context: Context, manager: NotificationManagerCompat, order: MkCustomerOrderDto, smallIcon: Int) {
        val launch = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
            action = PushNotificationRouter.ACTION_OPEN_URL
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("url", ORDERS_PATH)
            putExtra("path", ORDERS_PATH)
            putExtra("kind", "order")
        }
        val id = notificationId(order.id)
        val contentIntent = PendingIntent.getActivity(
            context,
            id,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, PushNotificationRouter.CHANNEL_ORDERS)
            .setSmallIcon(smallIcon)
            .setContentTitle("Order ${order.code}")
            .setContentText(MkLogic.orderStatusLabel(order.status))
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setProgress(TIMELINE_MAX, MkLogic.timelineIndex(order.status).coerceAtLeast(0), false)
            .build()
        // A revoked permission between the check and the post is not fatal; the next sync retries.
        runCatching { manager.notify(id, notification) }
    }

    private fun notificationId(orderId: String): Int = NOTIFICATION_BASE or (orderId.hashCode() and 0xFFFF)
}
