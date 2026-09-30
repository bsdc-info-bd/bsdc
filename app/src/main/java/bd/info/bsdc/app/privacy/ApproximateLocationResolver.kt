package bd.info.bsdc.app.privacy

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.concurrent.Executor
import kotlin.coroutines.resume

/**
 * Produces a city-level suggestion only. Latitude/longitude are held in memory for this request
 * and are never returned, persisted, sent to Firestore, or used for feed ranking.
 */
class ApproximateLocationResolver(private val context: Context) {
    suspend fun suggestCityLabel(): String = withContext(Dispatchers.IO) {
        val manager = context.getSystemService(LocationManager::class.java)
            ?: error("Location services are unavailable on this device.")
        val location = currentOrRecentNetworkLocation(manager)
            ?: error("No approximate location is available. Turn on device location or enter a city manually.")
        val address = reverseGeocode(location)
            ?: error("BSDC could not turn the approximate location into a city. You can enter a city manually.")
        listOfNotNull(address.locality, address.subAdminArea, address.adminArea, address.countryName)
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
            .take(2)
            .joinToString(", ")
            .takeIf(String::isNotBlank)
            ?: error("BSDC could not determine a city-level label. You can enter a city manually.")
    }

    @Suppress("MissingPermission") // The UI checks ACCESS_COARSE_LOCATION immediately before this one-shot call.
    private suspend fun currentOrRecentNetworkLocation(manager: LocationManager): Location? {
        if (!manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) return recentNetworkLocation(manager)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return recentNetworkLocation(manager)
        return suspendCancellableCoroutine { continuation ->
            val cancellation = CancellationSignal()
            continuation.invokeOnCancellation { cancellation.cancel() }
            manager.getCurrentLocation(
                LocationManager.NETWORK_PROVIDER,
                cancellation,
                Executor { runnable -> ContextCompat.getMainExecutor(context).execute(runnable) }
            ) { location ->
                if (continuation.isActive) continuation.resume(location)
            }
        } ?: recentNetworkLocation(manager)
    }

    @Suppress("MissingPermission")
    private fun recentNetworkLocation(manager: LocationManager): Location? = runCatching {
        manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
    }.getOrNull()

    @Suppress("DEPRECATION")
    private fun reverseGeocode(location: Location): Address? = runCatching {
        Geocoder(context, Locale.getDefault()).getFromLocation(location.latitude, location.longitude, 1)?.firstOrNull()
    }.getOrNull()
}
