package bd.info.bsdc.app.di

import android.content.Context
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.core.auth.AuthRepository
import bd.info.bsdc.app.core.auth.DataAccessBootstrapManager
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.BsdcPlatformApi
import bd.info.bsdc.app.core.network.SupabaseRestClient
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

    // Break circular reference between SupabaseRestClient tokenProvider and DataAccessBootstrapManager
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
        // Ensure bootstrap manager is initialized so SupabaseRestClient tokenProvider is wired
        dataAccessBootstrapManager
        AuthRepository(
            appContext = appContext,
            config = backendConfig,
            firebaseAuth = firebaseAuth,
            platformApi = platformApi,
            bootstrapManager = dataAccessBootstrapManager,
        )
    }
}
