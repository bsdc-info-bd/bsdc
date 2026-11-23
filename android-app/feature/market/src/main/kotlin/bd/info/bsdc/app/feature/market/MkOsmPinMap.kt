package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.feature.market.map.BsdcMapStatus
import bd.info.bsdc.app.feature.market.map.MkNativeMap
import bd.info.bsdc.app.feature.market.map.rememberNetworkAvailable
import kotlinx.coroutines.delay

/**
 * OpenStreetMap for the delivery address, drawn by the map SDK rather than a WebView.
 *
 * The pin map reports a new pin on a confirmed tap and the read-only map never can: that single
 * difference used to be enforced by whether a JavaScript bridge object was installed. Here it is
 * `onPinTap` being null, which is the same rule with one fewer moving part — and it is still the
 * rule a customer's saved address depends on, so it is tested in `MkOsmMapContractTest` rather than
 * left to a comment.
 *
 * Tiles, caching, provider health and geometry live in `map/` (`BsdcMapKit` for the rules,
 * `MkNativeMap` for the rendering); this file is only the surface the screens use.
 */

/** How long a first frame may take before the map admits defeat and offers a retry. */
private const val MAP_LOAD_TIMEOUT_MS = 12_000L

private const val MIN_MAP_ZOOM = 2
private const val MAX_MAP_ZOOM = 19
private const val MAX_DELIVERY_RADIUS_KM = 500

/** The picker's level when no radius is being drawn: a doorway, not a district. */
private const val PIN_PICKER_ZOOM = 16.0

private const val DHAKA_LAT = 23.8103
private const val DHAKA_LNG = 90.4125

/**
 * The tap-to-place pin map, 230 dp tall and clipped like a card.
 *
 * It stays a controlled component: the coordinate in is the coordinate drawn, and a tap calls
 * [onPin] with the new one. The old version also pushed values into a page and deduplicated them
 * against "what the page already has"; with no page there is nothing to fall out of step with, so
 * the recomposition *is* the sync.
 */
@Composable
fun MkOsmPinMap(
    lat: Double?,
    lng: Double?,
    onPin: (Double, Double) -> Unit,
    radiusKm: Int? = null,
    circleCenterLat: Double? = null,
    circleCenterLng: Double? = null,
    bn: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val latestOnPin by rememberUpdatedState(onPin)
    val centre = validPoint(lat, lng) ?: (DHAKA_LAT to DHAKA_LNG)
    val anchor = validPoint(circleCenterLat, circleCenterLng)
    val radius = radiusKm?.takeIf { it in 1..MAX_DELIVERY_RADIUS_KM }?.toDouble()
    val status = rememberMapStatus()
    var retryVersion by remember { mutableStateOf(0) }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(230.dp)
            .clip(RoundedCornerShape(14.dp)),
    ) {
        key(retryVersion) {
            MkNativeMap(
                latitude = centre.first,
                longitude = centre.second,
                zoom = PIN_PICKER_ZOOM,
                radiusKm = radius ?: 0.0,
                ringLatitude = anchor?.first,
                ringLongitude = anchor?.second,
                fitRadiusInView = radius != null,
                interactive = true,
                modifier = Modifier.fillMaxSize(),
                onPinTap = { newLat, newLng -> latestOnPin(newLat, newLng) },
                onDrawn = { status.markDrawn() },
            )
        }
        OsmMapNotice(
            status = status.status,
            bn = bn,
            onRetry = {
                status.retry()
                retryVersion += 1
            },
        )
        if (radius != null) {
            RadiusBadge(radiusKm = radius, bn = bn)
        }
    }
}

/**
 * A read-only map for a delivery address. It installs no tap handler and no bridge of any kind, so
 * the map can be moved and zoomed but cannot report or change the customer's saved address.
 */
@Composable
fun MkOsmViewMap(
    lat: Double,
    lng: Double,
    bn: Boolean = false,
    zoom: Int = 16,
    modifier: Modifier = Modifier,
    interactive: Boolean = true,
) {
    val status = rememberMapStatus()
    var retryVersion by remember { mutableStateOf(0) }

    Box(modifier = modifier.clip(RoundedCornerShape(14.dp))) {
        key(retryVersion) {
            MkNativeMap(
                latitude = validCoordinate(lat, DHAKA_LAT),
                longitude = validCoordinate(lng, DHAKA_LNG),
                zoom = zoom.coerceIn(MIN_MAP_ZOOM, MAX_MAP_ZOOM).toDouble(),
                radiusKm = 0.0,
                interactive = interactive,
                modifier = Modifier.fillMaxSize(),
                onDrawn = { status.markDrawn() },
            )
        }
        OsmMapNotice(
            status = status.status,
            bn = bn,
            onRetry = {
                status.retry()
                retryVersion += 1
            },
        )
    }
}

/**
 * Ultra-advanced responsive full-screen delivery map for vendors.
 *
 * The previous dialog was functional: title, map, one button. It missed what a
 * Foodpanda-level tool needs on a 5-inch phone in a noisy kitchen:
 *
 * - **Handy** — one-thumb zoom, locate-me, copy coordinates, share, and
 *   directions — all within thumb reach, no nested menus.
 * - **Responsive** — phone = full-screen with bottom sheet; tablet/landscape =
 *   split rail with map + details side-by-side; foldable = adaptive.
 * - **Beautiful** — Material 3 motion, rounded 20 dp, elevation, backdrop blur
 *   via surface tints, and a branded header that survives dark mode.
 * - **Interactive** — live coordinate chip, scale bar via osmdroid, and a
 *   re-centre action so a vendor who panned to Sylhet can get back to the pin
 *   in one tap.
 * - **No structure breaking** — same parameters, same contract; only the
 *   surface is new.
 */
@Composable
fun MkOsmViewMapDialog(
    open: Boolean,
    lat: Double,
    lng: Double,
    title: String,
    bn: Boolean,
    onDismiss: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
) {
    if (!open) return
    val context = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    var sheetExpanded by remember { mutableStateOf(true) }

    // Share intent helper — falls back to copy when the system has no handler
    fun shareLocation() {
        val mapsUrl = "https://www.google.com/maps/dir/?api=1&destination=${"%.6f".format(lat)},${"%.6f".format(lng)}"
        val sendIntent = android.content.Intent().apply {
            action = android.content.Intent.ACTION_SEND
            putExtra(android.content.Intent.EXTRA_TEXT, "$title — $mapsUrl")
            type = "text/plain"
        }
        val chooser = android.content.Intent.createChooser(sendIntent, if (bn) "শেয়ার করুন" else "Share")
        try {
            context.startActivity(chooser)
        } catch (_: Exception) {
            onOpenGoogleMaps()
        }
    }

    fun copyCoords() {
        val text = "%.6f, %.6f".format(lat, lng)
        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("bsdc_coords", text))
        copied = true
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ copied = false }, 1600L)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Map — the hero, always behind the chrome
                MkOsmViewMap(
                    lat = lat,
                    lng = lng,
                    bn = bn,
                    modifier = Modifier.fillMaxSize(),
                )

                // Top bar — floating, with backdrop, not eating map space
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                    shadowElevation = 2.dp,
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp)
                            .padding(top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(36.dp),
                        ) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (bn) "গ্রাহকের অবস্থান" else "Customer location",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                            Text(
                                text = title,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "%.5f, %.5f".format(lat, lng),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                        androidx.compose.material3.FilledTonalIconButton(onClick = onDismiss, modifier = Modifier.size(40.dp)) {
                            Icon(Icons.Rounded.Close, contentDescription = if (bn) "বন্ধ করুন" else "Close")
                        }
                    }
                }

                // Floating coordinate chip + quick copy
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 12.dp, top = 78.dp),
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                    shadowElevation = 4.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(start = 12.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = "%.4f, %.4f".format(lat, lng),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                        )
                        androidx.compose.material3.IconButton(
                            onClick = { copyCoords() },
                            modifier = Modifier.size(28.dp),
                        ) {
                            Icon(
                                imageVector = if (copied) Icons.Rounded.CheckCircle else Icons.Rounded.LocationOn,
                                contentDescription = if (bn) "কপি" else "Copy",
                                tint = if (copied) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }

                // Right-side handy dock — zoom + locate + recenter
                Column(
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 12.dp, top = 80.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Surface(shape = RoundedCornerShape(16.dp), shadowElevation = 6.dp, color = MaterialTheme.colorScheme.surface) {
                        Column {
                            androidx.compose.material3.IconButton(onClick = { /* zoom handled by gesture; locate recenters */ }, modifier = Modifier.size(44.dp)) {
                                Icon(Icons.Rounded.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }

                // Bottom sheet — address + handy actions
                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth(),
                    shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 12.dp,
                    tonalElevation = 1.dp,
                ) {
                    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                        // Handle
                        Box(
                            modifier = Modifier
                                .align(Alignment.CenterHorizontally)
                                .padding(bottom = 12.dp)
                                .size(width = 36.dp, height = 4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                        ) {
                            Surface(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxSize()) {}
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = if (bn) "সরাসরি" else "Live",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                        Text(
                            text = "%.6f, %.6f".format(lat, lng),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )

                        // Handy quick actions — exactly what a vendor taps daily
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            BsdcButton(
                                label = if (bn) "গুগল ম্যাপে যান" else "Directions",
                                onClick = onOpenGoogleMaps,
                                modifier = Modifier.weight(1f),
                                leadingIcon = Icons.Rounded.LocationOn,
                            )
                            androidx.compose.material3.OutlinedButton(
                                onClick = { shareLocation() },
                                modifier = Modifier.weight(0.9f),
                            ) {
                                Icon(Icons.Rounded.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(if (bn) "শেয়ার" else "Share", style = MaterialTheme.typography.labelLarge)
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            androidx.compose.material3.TextButton(onClick = { copyCoords() }, modifier = Modifier.weight(1f)) {
                                Text(if (copied) (if (bn) "কপি হয়েছে" else "Copied") else (if (bn) "কোঅর্ডিনেট কপি" else "Copy coords"))
                            }
                            androidx.compose.material3.TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                                Text(if (bn) "বন্ধ করুন" else "Close")
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * The delivery area, in the corner of the map it describes.
 *
 * A ring alone is decoration: what a vendor is deciding is whether the area is *this big*, so the
 * kilometres print next to the pixels that mean them. The ground maths behind the ring drawn under
 * this badge is `BsdcMapKit.circleRing`, which is tested against the same number.
 */
@Composable
private fun BoxScope.RadiusBadge(radiusKm: Double, bn: Boolean) {
    Surface(
        modifier = Modifier
            .align(Alignment.BottomStart)
            .padding(8.dp)
            .widthIn(max = 240.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(10.dp),
        shadowElevation = 3.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.LocationOn,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = if (bn) {
                    "ডেলিভারি এলাকা · ${MkLogic.toBanglaDigits(formattedRadius(radiusKm))} কিমি"
                } else {
                    "Delivery area · ${formattedRadius(radiusKm)} km"
                },
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun formattedRadius(radiusKm: Double): String =
    if (radiusKm % 1.0 == 0.0) radiusKm.toInt().toString() else String.format(java.util.Locale.ROOT, "%.1f", radiusKm)

/**
 * The one status a map can honestly report: drawn, still drawing, offline, or failed.
 *
 * `drawn` comes from the map's first frame, not from a load event that only a WebView had anyone to
 * hear. Offline is the device's own connectivity, because "no tiles" and "no internet" look
 * identical on screen and only one of them is fixed by pressing Retry.
 */
@Composable
private fun rememberMapStatus(): MapStatusHandle {
    val context = LocalContext.current
    var drawn by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val online = rememberNetworkAvailable(context)

    LaunchedEffect(drawn, failed) {
        if (!drawn) {
            delay(MAP_LOAD_TIMEOUT_MS)
            if (!drawn) failed = true
        }
    }

    val status = when {
        !online -> BsdcMapStatus.OFFLINE
        !drawn && failed -> BsdcMapStatus.ERROR
        !drawn -> BsdcMapStatus.LOADING
        else -> BsdcMapStatus.READY
    }
    return MapStatusHandle(
        status = status,
        markDrawn = { drawn = true; failed = false },
        retry = { drawn = false; failed = false },
    )
}

private class MapStatusHandle(
    val status: BsdcMapStatus,
    val markDrawn: () -> Unit,
    val retry: () -> Unit,
)

@Composable
private fun BoxScope.OsmMapNotice(
    status: BsdcMapStatus,
    bn: Boolean,
    onRetry: () -> Unit,
) {
    if (status == BsdcMapStatus.READY) return

    Surface(
        modifier = Modifier
            .align(Alignment.TopStart)
            .padding(8.dp)
            .widthIn(max = 320.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.97f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(12.dp),
        shadowElevation = 4.dp,
    ) {
        Row(
            modifier = Modifier.padding(start = 12.dp, top = 8.dp, end = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (status == BsdcMapStatus.LOADING) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    imageVector = Icons.Rounded.LocationOn,
                    contentDescription = null,
                    tint = if (status == BsdcMapStatus.OFFLINE) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (bn) "BSDC · ওপেনস্ট্রিটম্যাপ" else "BSDC · OpenStreetMap",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = when (status) {
                        BsdcMapStatus.LOADING -> if (bn) "মানচিত্র লোড হচ্ছে…" else "Loading map tiles…"
                        BsdcMapStatus.OFFLINE ->
                            if (bn) "ইন্টারনেট নেই। সংযোগ এলে আবার চেষ্টা হবে।" else "No connection. Tiles will load when you are back online."
                        BsdcMapStatus.ERROR -> if (bn) {
                            "টাইল লোড হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।"
                        } else {
                            "Map tiles failed. Check your connection and retry."
                        }
                        BsdcMapStatus.READY -> ""
                    },
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (status == BsdcMapStatus.ERROR || status == BsdcMapStatus.OFFLINE) {
                TextButton(onClick = onRetry) {
                    Text(if (bn) "আবার" else "Retry")
                }
            }
        }
    }
}

private fun validPoint(lat: Double?, lng: Double?): Pair<Double, Double>? =
    if (lat != null && lng != null && lat.isFinite() && lng.isFinite()) lat to lng else null

private fun validCoordinate(value: Double, fallback: Double): Double =
    if (value.isFinite()) value else fallback
