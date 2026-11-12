package bd.info.bsdc.app

import android.app.Application
import android.os.StrictMode
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.network.SupabaseRestClient
import bd.info.bsdc.app.core.push.BsdcPushRegistrationManager
import bd.info.bsdc.app.core.push.PushChannelManager
import bd.info.bsdc.app.core.push.PushRuntimeDependencies
import bd.info.bsdc.app.core.sync.BsdcSyncProvider
import bd.info.bsdc.app.core.sync.FeedPrefetchService
import bd.info.bsdc.app.core.sync.SyncScheduler
import bd.info.bsdc.app.di.BsdcAppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class BsdcApplication : Application(), BsdcSyncProvider, PushRuntimeDependencies {

    lateinit var container: BsdcAppContainer
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        container = BsdcAppContainer(applicationContext)
        PushChannelManager.ensureChannels(applicationContext)

        appScope.launch {
            val settings = container.syncPrefsStore.getSettings()
            SyncScheduler.applyPeriodicPolicy(applicationContext, settings.policy)
        }

        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectNetwork()
                    .penaltyLog()
                    .build(),
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectLeakedClosableObjects()
                    .detectActivityLeaks()
                    .penaltyLog()
                    .build(),
            )
        }
    }

    override fun provideFeedPrefetchService(): FeedPrefetchService = container.feedPrefetchService
    override fun provideSupabaseRestClient(): SupabaseRestClient = container.supabaseRestClient
    override fun provideDatabase(): BsdcDatabase = container.database
    override fun providePushRegistrationManager(): BsdcPushRegistrationManager = container.pushRegistrationManager
}
