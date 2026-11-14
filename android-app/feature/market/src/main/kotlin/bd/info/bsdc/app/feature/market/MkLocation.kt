package bd.info.bsdc.app.feature.market

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

/** Device location for the address pin. Permission is requested by the screen, never here. */
object MkLocation {

    val PERMISSIONS: Array<String> = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )

    fun hasPermission(context: Context): Boolean =
        PERMISSIONS.any { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }

    /**
     * Current position, falling back to the last known fix. Returns null without permission or
     * when no fix exists. Callers must still check [MkLogic.isInsideBangladesh].
     */
    @SuppressLint("MissingPermission")
    suspend fun current(context: Context): Pair<Double, Double>? {
        if (!hasPermission(context)) return null
        val client = LocationServices.getFusedLocationProviderClient(context)
        val cancel = CancellationTokenSource()
        val fresh = runCatching {
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancel.token).await()
        }.getOrNull()
        if (fresh != null) return fresh.latitude to fresh.longitude
        val last = runCatching { client.lastLocation.await() }.getOrNull()
        return last?.let { it.latitude to it.longitude }
    }
}
