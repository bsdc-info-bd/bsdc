package bd.info.bsdc.app.core.push

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import bd.info.bsdc.app.core.model.AppLanguage
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import java.util.concurrent.TimeUnit

/**
 * Periodically and reactively keeps the current Android FCM device token synced
 * with Postgres (`register_fcm_token('android')`) even after OS token rotation,
 * app updates, or granting `POST_NOTIFICATIONS` later from Android Settings.
 */
class PushRegistrationSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val deps = applicationContext as? PushRuntimeDependencies ?: return Result.success()
        if (FirebaseApp.getApps(applicationContext).isEmpty()) return Result.success()

        val uid = runCatching { FirebaseAuth.getInstance().currentUser?.uid }.getOrNull()
        if (uid.isNullOrBlank()) return Result.success()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return Result.success()
        }

        val lang = if (applicationContext.resources.configuration.locales[0]?.language == "en") {
            AppLanguage.EN
        } else {
            AppLanguage.BN
        }

        val outcome = deps.providePushRegistrationManager().registerCurrentDevice(uid, lang)
        return if (outcome.isSuccess) {
            Result.success()
        } else if (runAttemptCount < 4) {
            Result.retry()
        } else {
            Result.failure()
        }
    }

    companion object {
        private const val PERIODIC_WORK_NAME = "bsdc_push_registration_periodic_sync"
        private const val IMMEDIATE_WORK_NAME = "bsdc_push_registration_immediate_sync"

        fun enqueuePeriodic(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = PeriodicWorkRequestBuilder<PushRegistrationSyncWorker>(12, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }

        fun enqueueImmediate(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val request = OneTimeWorkRequestBuilder<PushRegistrationSyncWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
