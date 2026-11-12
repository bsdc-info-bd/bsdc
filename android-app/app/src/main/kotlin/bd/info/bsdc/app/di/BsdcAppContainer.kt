package bd.info.bsdc.app.di

import android.content.Context
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.core.auth.AuthRepository
import bd.info.bsdc.app.core.auth.DataAccessBootstrapManager
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.BsdcPlatformApi
import bd.info.bsdc.app.core.network.SupabaseRestClient
import bd.info.bsdc.app.core.push.BsdcPushRegistrationManager
import bd.info.bsdc.app.core.sync.FeedPrefetchService
import bd.info.bsdc.app.core.sync.OfflineSyncPreferencesStore
import bd.info.bsdc.app.feature.compose.ComposeRepository
import bd.info.bsdc.app.feature.feed.FeedRepository
import bd.info.bsdc.app.feature.messenger.MessengerRepository
import bd.info.bsdc.app.feature.messenger.SupabaseRealtimeTransport
import bd.info.bsdc.app.feature.notifications.NotificationsRepository
import coil3.ImageLoader
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import io.ktor.client.HttpClient
import okhttp3.OkHttpClient

/**
 * Application-scoped dependency container wired across :core:* and :feature:* modules.
 */
class BsdcAppContainer(appContext: Context) {

    val backendConfig: BsdcBackendConfig = BsdcBackendConfig(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabasePublishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
        siteUrl = BuildConfig.SITE_ORIGIN,
        vfUrl = BuildConfig.VF_ORIGIN,
        pushWorkerUrl = BuildConfig.PUSH_WORKER_ORIGIN,
        firebaseWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID,
    )

    val okHttpClient: OkHttpClient by lazy {
        BsdcHttpClientFactory.createOkHttpClient(enableDebugLogs = BuildConfig.DEBUG)
    }

    val ktorClient: HttpClient by lazy {
        BsdcHttpClientFactory.createKtorClient(okHttpClient)
    }

    val firebaseAuth: FirebaseAuth by lazy {
        if (FirebaseApp.getApps(appContext).isEmpty()) {
            FirebaseApp.initializeApp(appContext)
        }
        FirebaseAuth.getInstance()
    }

    private lateinit var bootstrapManagerRef: DataAccessBootstrapManager

    val supabaseRestClient: SupabaseRestClient by lazy {
        SupabaseRestClient(
            config = backendConfig,
            httpClient = ktorClient,
            tokenProvider = { bootstrapManagerRef.currentSupabaseToken() },
        )
    }

    val platformApi: BsdcPlatformApi by lazy {
        BsdcPlatformApi(
            config = backendConfig,
            httpClient = ktorClient,
            supabase = supabaseRestClient,
        )
    }

    val dataAccessBootstrapManager: DataAccessBootstrapManager by lazy {
        DataAccessBootstrapManager(
            firebaseAuth = firebaseAuth,
            platformApi = platformApi,
        ).also { bootstrapManagerRef = it }
    }

    val authRepository: AuthRepository by lazy {
        dataAccessBootstrapManager
        AuthRepository(
            appContext = appContext,
            config = backendConfig,
            firebaseAuth = firebaseAuth,
            platformApi = platformApi,
            bootstrapManager = dataAccessBootstrapManager,
        )
    }

    val database: BsdcDatabase by lazy {
        BsdcDatabase.getInstance(appContext)
    }

    val mediaRepository: BsdcMediaRepository by lazy {
        dataAccessBootstrapManager
        BsdcMediaRepository(
            context = appContext,
            config = backendConfig,
            okHttpClient = okHttpClient,
            firebaseAuth = firebaseAuth,
            bootstrapManager = dataAccessBootstrapManager,
            supabase = supabaseRestClient,
        )
    }

    val imageLoader: ImageLoader by lazy {
        mediaRepository.createImageLoader(maxCacheMb = 150)
    }

    val syncPrefsStore: OfflineSyncPreferencesStore by lazy {
        OfflineSyncPreferencesStore(appContext)
    }

    val feedPrefetchService: FeedPrefetchService by lazy {
        FeedPrefetchService(
            context = appContext,
            supabase = supabaseRestClient,
            database = database,
            imageLoader = imageLoader,
            prefsStore = syncPrefsStore,
        )
    }

    val feedRepository: FeedRepository by lazy {
        FeedRepository(
            supabase = supabaseRestClient,
            database = database,
        )
    }

    val composeRepository: ComposeRepository by lazy {
        ComposeRepository(
            supabase = supabaseRestClient,
            database = database,
        )
    }

    val messengerRealtimeTransport: SupabaseRealtimeTransport by lazy {
        SupabaseRealtimeTransport(
            okHttpClient = okHttpClient,
            supabase = supabaseRestClient,
        )
    }

    val messengerRepository: MessengerRepository by lazy {
        MessengerRepository(
            supabase = supabaseRestClient,
            database = database,
        )
    }

    val pushRegistrationManager: BsdcPushRegistrationManager by lazy {
        BsdcPushRegistrationManager(
            appContext = appContext,
            supabase = supabaseRestClient,
        )
    }

    val notificationsRepository: NotificationsRepository by lazy {
        NotificationsRepository(
            supabase = supabaseRestClient,
        )
    }
}
