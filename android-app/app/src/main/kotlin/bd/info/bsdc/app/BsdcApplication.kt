package bd.info.bsdc.app

import android.app.Application
import android.os.StrictMode
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.network.SupabaseRestClient
import bd.info.bsdc.app.core.push.BsdcPushRegistrationManager
import bd.info.bsdc.app.core.push.PushChannelManager
import bd.info.bsdc.app.core.push.PushEventBus
import bd.info.bsdc.app.core.push.PushRegistrationSyncWorker
import bd.info.bsdc.app.core.push.PushRuntimeDependencies
import bd.info.bsdc.app.core.sync.BsdcSyncProvider
import bd.info.bsdc.app.core.sync.FeedPrefetchService
import bd.info.bsdc.app.core.sync.SyncScheduler
import bd.info.bsdc.app.di.BsdcAppContainer
import bd.info.bsdc.app.feature.market.MkOrderTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class BsdcApplication : Application(), BsdcSyncProvider, PushRuntimeDependencies {

    private companion object {
        /** Small status-bar icon shared with the push notifications (core:push). */
        val ORDER_STATUS_ICON: Int = bd.info.bsdc.app.core.push.R.drawable.ic_stat_bsdc
    }

    lateinit var container: BsdcAppContainer
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        container = BsdcAppContainer(applicationContext)
        PushChannelManager.ensureChannels(applicationContext)
        PushRegistrationSyncWorker.enqueuePeriodic(applicationContext)

        appScope.launch {
            val settings = container.syncPrefsStore.getSettings()
            SyncScheduler.applyPeriodicPolicy(applicationContext, settings.policy)
        }

        // Customer order status: refresh the ongoing order notifications at start, and again
        // whenever an order push arrives, so each status change shows on the device.
        appScope.launch {
            MkOrderTracker.sync(applicationContext, container.mkRepository, ORDER_STATUS_ICON)
        }
        // Any sign-out (all entry points) removes the order notifications for the account that left.
        appScope.launch {
            container.authRepository.state
                .map { it.session != null }
                .distinctUntilChanged()
                .drop(1)
                .collect { signedIn -> if (!signedIn) MkOrderTracker.clear(applicationContext) }
        }
        appScope.launch {
            PushEventBus.events.collect { event ->
                if (event.kind == "order") {
                    MkOrderTracker.sync(applicationContext, container.mkRepository, ORDER_STATUS_ICON)
                }
            }
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
