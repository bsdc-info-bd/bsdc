package bd.info.bsdc.app.core.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Plays the vendor's new-order alarm: the bundled sound on a loop, on the alarm
 * stream at full volume, until the order is accepted or the vendor stops it.
 *
 * It runs as a media-playback foreground service so it keeps playing with the
 * screen off, the device locked, or the app closed. The service is started by
 * the high-priority FCM data message (see BsdcFirebaseMessagingService), which
 * Android allows to start a foreground service from the background.
 */
class OrderAlarmService : Service() {

    private var player: MediaPlayer? = null
    private var savedAlarmVolume: Int? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopAlarm()
            return START_NOT_STICKY
        }
        startAlarm()
        // Never restart on its own: a restart without a new order would ring for nothing.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        releaseAlarm()
        super.onDestroy()
    }

    private fun startAlarm() {
        ensureChannel(this)
        val notification = buildNotification()
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        )
        if (player != null) return

        val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        savedAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
        audio.setStreamVolume(
            AudioManager.STREAM_ALARM,
            audio.getStreamMaxVolume(AudioManager.STREAM_ALARM),
            0,
        )

        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            mp.setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
            mp.setDataSource(
                this,
                Uri.parse("android.resource://$packageName/${R.raw.bsdc_order_alert_loop}"),
            )
            mp.isLooping = true
            mp.setOnErrorListener { _, _, _ ->
                stopAlarm()
                true
            }
            mp.prepare()
            mp.start()
            player = mp
        } catch (error: Exception) {
            mp.release()
            restoreAlarmVolume()
            stopAlarm()
        }
    }

    private fun stopAlarm() {
        releaseAlarm()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun releaseAlarm() {
        player?.let { mp ->
            runCatching { if (mp.isPlaying) mp.stop() }
            mp.release()
        }
        player = null
        restoreAlarmVolume()
    }

    private fun restoreAlarmVolume() {
        val previous = savedAlarmVolume ?: return
        savedAlarmVolume = null
        val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        runCatching { audio.setStreamVolume(AudioManager.STREAM_ALARM, previous, 0) }
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_bsdc)
        .setColor(ContextCompat.getColor(this, R.color.bsdc_notification_accent))
        .setContentTitle("New order · নতুন অর্ডার")
        .setContentText("Open the shop console to accept · অর্ডার গ্রহণ করতে খুলুন")
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setContentIntent(openConsoleIntent())
        .setFullScreenIntent(openConsoleIntent(), true)
        .addAction(0, "Stop · বন্ধ করুন", stopIntent())
        .build()

    private fun openConsoleIntent(): PendingIntent {
        val launch = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
            action = PushNotificationRouter.ACTION_OPEN_URL
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("url", CONSOLE_PATH)
            putExtra("path", CONSOLE_PATH)
            putExtra("kind", "order")
        }
        return PendingIntent.getActivity(
            this,
            REQUEST_OPEN,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun stopIntent(): PendingIntent {
        val intent = Intent(this, OrderAlarmService::class.java).setAction(ACTION_STOP)
        return PendingIntent.getService(
            this,
            REQUEST_STOP,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        /** Value of the FCM data key `alarm` that starts the loop. */
        const val ALARM_ORDER_LOOP = "order_loop"

        /** Value of the FCM data key `alarm` that stops the loop. */
        const val ALARM_STOP = "order_stop"

        const val ACTION_STOP = "bd.info.bsdc.app.core.push.ORDER_ALARM_STOP"
        const val CHANNEL_ID = "bsdc_order_alarm"
        const val CONSOLE_PATH = "/vendor/console"

        private const val NOTIFICATION_ID = 0x0B5D
        private const val REQUEST_OPEN = 0x0B5E
        private const val REQUEST_STOP = 0x0B5F

        /** Starts the looping alarm. Safe to call while it is already ringing. */
        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, OrderAlarmService::class.java),
            )
        }

        /** Stops the alarm, for example once the order has been accepted in the app. */
        fun stop(context: Context) {
            runCatching {
                context.startService(
                    Intent(context, OrderAlarmService::class.java).setAction(ACTION_STOP),
                )
            }
        }

        /** The alarm channel is silent: the sound comes from the player, not the channel. */
        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "New order alarm · নতুন অর্ডারের অ্যালার্ম",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Rings until a new order is accepted"
                setSound(null, null)
                enableVibration(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(channel)
        }
    }
}
