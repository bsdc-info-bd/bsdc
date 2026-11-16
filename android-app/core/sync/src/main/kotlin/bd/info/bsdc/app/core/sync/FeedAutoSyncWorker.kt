package bd.info.bsdc.app.core.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import bd.info.bsdc.app.core.model.SyncNetworkPolicy
import java.util.concurrent.TimeUnit

interface BsdcSyncProvider {
    fun provideFeedPrefetchService(): FeedPrefetchService
}

class FeedAutoSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val provider = applicationContext as? BsdcSyncProvider ?: return Result.success()
        val forceManual = inputData.getBoolean(KEY_FORCE_MANUAL, false)
        return runCatching {
            provider.provideFeedPrefetchService().runSyncPass(forceManual = forceManual)
            Result.success()
        }.getOrElse {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val KEY_FORCE_MANUAL = "force_manual"
    }
}

object SyncScheduler {
    private const val PERIODIC_SYNC_NAME = "bsdc_feed_auto_sync"
    private const val IMMEDIATE_SYNC_NAME = "bsdc_feed_immediate_sync"

    fun applyPeriodicPolicy(context: Context, policy: SyncNetworkPolicy) {
        val wm = WorkManager.getInstance(context)
        if (policy == SyncNetworkPolicy.OFF) {
            wm.cancelUniqueWork(PERIODIC_SYNC_NAME)
            return
        }

        val networkType = if (policy == SyncNetworkPolicy.WIFI_ONLY) {
            NetworkType.UNMETERED
        } else {
            NetworkType.CONNECTED
        }

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(networkType)
            .setRequiresBatteryNotLow(true)
            .build()

        val request = PeriodicWorkRequestBuilder<FeedAutoSyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()

        wm.enqueueUniquePeriodicWork(
            PERIODIC_SYNC_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun triggerImmediateSync(context: Context, forceManual: Boolean = true) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<FeedAutoSyncWorker>()
            .setConstraints(constraints)
            .setInputData(workDataOf(FeedAutoSyncWorker.KEY_FORCE_MANUAL to forceManual))
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_SYNC_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }
}
