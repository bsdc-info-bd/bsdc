package bd.info.bsdc.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import bd.info.bsdc.app.auth.AuthRepository
import bd.info.bsdc.app.core.AppContainer
import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.SettingsRepository
import bd.info.bsdc.app.data.CommunityRepository
import bd.info.bsdc.app.data.ProfileRepository
import bd.info.bsdc.app.media.CloudinaryMediaUploader
import bd.info.bsdc.app.messaging.ChatRepository
import bd.info.bsdc.app.notifications.NotificationRepository
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

class BsdcApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        val firebaseConfigured = FirebaseApp.initializeApp(this) != null
        if (firebaseConfigured && !BuildConfig.DEBUG) {
            FirebaseAppCheck.getInstance()
                .installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
        }
        createNotificationChannels()

        val gate = FirebaseGate(firebaseConfigured)
        container = AppContainer(
            settings = SettingsRepository(this),
            auth = AuthRepository(gate),
            community = CommunityRepository(gate),
            profiles = ProfileRepository(gate),
            chat = ChatRepository(gate),
            notifications = NotificationRepository(gate),
            media = CloudinaryMediaUploader(this)
        )
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_MESSAGES,
                getString(R.string.notification_channel_messages),
                NotificationManager.IMPORTANCE_HIGH
            ).apply { description = getString(R.string.notification_channel_description) }
        )
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_COMMUNITY,
                getString(R.string.notification_channel_community),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = getString(R.string.notification_channel_description) }
        )
    }

    companion object {
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_COMMUNITY = "community_updates"
    }
}
