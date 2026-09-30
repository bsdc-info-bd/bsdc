package bd.info.bsdc.app

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import bd.info.bsdc.app.auth.AuthRepository
import bd.info.bsdc.app.core.AnalyticsConsent
import bd.info.bsdc.app.core.AppContainer
import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.SettingsRepository
import bd.info.bsdc.app.data.CommunityRepository
import bd.info.bsdc.app.data.LegalConsentRepository
import bd.info.bsdc.app.data.ModerationRepository
import bd.info.bsdc.app.data.OrganizationRepository
import bd.info.bsdc.app.data.ProfileRepository
import bd.info.bsdc.app.media.CloudinaryMediaUploader
import bd.info.bsdc.app.messaging.ChatRepository
import bd.info.bsdc.app.notifications.NotificationRepository
import com.cloudinary.android.MediaManager
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.analytics.FirebaseAnalytics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

class BsdcApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        val firebaseConfigured = FirebaseApp.initializeApp(this) != null
        if (firebaseConfigured && !BuildConfig.DEBUG) {
            FirebaseAppCheck.getInstance()
                .installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance())
        }
        if (BuildConfig.CLOUDINARY_CLOUD_NAME.isNotBlank()) {
            // Official Cloudinary Android SDK configuration. Only cloud_name is client-visible;
            // upload authorization remains the locked unsigned preset supplied per request.
            MediaManager.init(this, mapOf("cloud_name" to BuildConfig.CLOUDINARY_CLOUD_NAME))
        }
        createNotificationChannels()

        val gate = FirebaseGate(firebaseConfigured)
        val settings = SettingsRepository(this)
        if (firebaseConfigured) {
            // Analytics collection is disabled in the manifest until the member chooses it.
            // This process-lifetime observer immediately honors both grant and revocation.
            settings.preferences.onEach { preferences ->
                FirebaseAnalytics.getInstance(this)
                    .setAnalyticsCollectionEnabled(preferences.analyticsConsent == AnalyticsConsent.GRANTED)
            }.launchIn(applicationScope)
        }
        val legalConsents = LegalConsentRepository(gate)
        container = AppContainer(
            settings = settings,
            auth = AuthRepository(gate, legalConsents),
            legalConsents = legalConsents,
            moderation = ModerationRepository(gate),
            community = CommunityRepository(gate),
            organizations = OrganizationRepository(gate),
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
            ).apply {
                description = getString(R.string.notification_channel_description)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(true)
            }
        )
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_COMMUNITY,
                getString(R.string.notification_channel_community),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = getString(R.string.notification_channel_description)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(true)
            }
        )
    }

    companion object {
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_COMMUNITY = "community_updates"
    }
}
