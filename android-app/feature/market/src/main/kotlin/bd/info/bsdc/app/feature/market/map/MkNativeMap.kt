package bd.info.bsdc.app.feature.market.map

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Point
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.view.MotionEvent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.Projection
import org.osmdroid.views.overlay.Overlay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean

/**
 * OpenStreetMap rendered natively: osmdroid over a live `MapView`, and no WebView anywhere.
 *
 * The previous system drew the same tiles into a WebView fed by a generated HTML page and an
 * asset-intercepting `WebViewClient`, with a JavaScript bridge to carry the pin back. That pipeline
 * was audited line by line (`docs/android-osm-map-audit.md`): every rule in it held, and the map
 * could still be blank — because correctness was spread across five seams (page, bridge, fetcher,
 * HTTP response, layout) and each one could pass its own test while the whole failed. This file
 * removes four of the five. Tiles are fetched by osmdroid into a bounded on-disk cache; the pin, the
 * delivery radius and the tap are Compose state drawn on the map canvas.
 *
 * ## The callback contract — read this before adding a thread hop
 *
 * [MkNativeMap]'s `onPinTap` and `onDrawn` run on the map's touch and draw paths, which are the
 * **main thread**. The screens assign straight into Compose state from them, and that is correct
 * *because* they are already on the main thread.
 *
 * A `Handler(Looper.getMainLooper()).post { … }` here would be a bug, not a defence. The old map
 * needed one: its coordinates arrived from a `@JavascriptInterface` method, which Android invokes on
 * a background WebView thread, so hopping was the only legal way to touch Compose state. A deferred
 * post would land the write a frame late and the marker, the coordinate text and the Continue button
 * would each render a different instant. Do not "harden" these callbacks by re-adding the hop.
 *
 * ## Lifecycle
 *
 * `MapView` owns an overlay manager, a tile provider and a canvas pool. `setDestroyMode(true)` lets
 * it release the provider when the view leaves the window, and the [LifecycleEventObserver] below
 * pairs `onPause`/`onResume` with STOP/START so a dialog dismissed while the app is backgrounded
 * cannot leave tile loading running. Under `LocalInspectionMode` Compose never attaches a real view,
 * so the factory never runs and there is nothing to release — no special case is needed here.
 */

/** Per-process configuration of the tile engine. Idempotent; cheap to call on every map open. */
private object MkMapEngine {

    private val configured = AtomicBoolean(false)

    /**
     * Provider health, kept across dialogs so one bad minute with a host is not re-paid on every
     * open, and so a Retry can actually change which providers are in play.
     */
    val health = ProviderHealth(failuresBeforeCooldown = 1, cooldownMs = 120_000L)

    /**
     * Prepare osmdroid: base path, tile cache location, and a first prune.
     *
     * `Configuration.load` is what gives the library a writable base path; without it the file cache
     * quietly degrades to nothing and every pan re-requests tiles over the network — the exact
     * behaviour the cache exists to prevent. The cache lives under `cacheDir`, not `filesDir`: tiles
     * are re-derivable by definition, so the system should stay free to reclaim them under storage
     * pressure rather than the app hoarding 50 MB of pixels inside backed-up storage.
     */
    fun ensure(context: Context) {
        if (!configured.compareAndSet(false, true)) return
        val app = context.applicationContext
        val config = Configuration.getInstance()
        config.load(app, app.getSharedPreferences("bsdc_osmdroid", Context.MODE_PRIVATE))
        val cacheDir = BsdcMapKit.tileCacheDir(app.cacheDir)
        if (!cacheDir.isDirectory) cacheDir.mkdirs()
        config.setOsmdroidTileCache(cacheDir)
        // Prune on open rather than on a scheduled alarm: a vendor opens the pin map a handful of
        // times a day, which is more than enough churn to hold the quota.
        BsdcMapKit.pruneCache(cacheDir)
    }

    /**
     * The tile source for a new map.
     *
     * osmdroid's `OnlineTileSourceBase` picks one of its base URLs at random per request, so handing
     * it *every* host of *every* usable provider is what makes one host's outage survivable: a dead
     * shard costs a fraction of the tiles instead of the whole map, because there is no state
     * coupling one tile to the next. Providers in cooldown are left out of the list entirely, which
     * is how [ProviderHealth] reaches real behaviour.
     *
     * The allowlist filter is not decorative. [BsdcMapKit.isAllowedTileUrl] is the single rule that
     * keeps this map from becoming an open proxy through a typo in the provider table, so every base
     * is checked against it before it is offered to the library.
     */
    fun tileSource(nowMs: Long = System.currentTimeMillis()): XYTileSource {
        val bases = BsdcMapKit.tileBases(nowMs, health)
        appliedBases = bases
        return XYTileSource(
            "BSDC-OSM",
            BsdcMapKit.MIN_ZOOM,
            BsdcMapKit.MAX_ZOOM,
            BsdcMapKit.TILE_SIZE_PX,
            ".png",
            bases.toTypedArray(),
        )
    }

    /**
     * Ask every provider whether it is serving, off the main thread.
     *
     * One strike sets a host aside here — unlike the three-strike default in [ProviderHealth], which
     * is tuned for per-request signals where one dropped tile is noise. A deliberate probe is not
     * noise: if it could not reach the host at all, the map should stop betting every tile on it for
     * a couple of minutes. Returns true when the verdict changed the host set, so a working map is
     * never re-pointed for nothing.
     */
    suspend fun refreshHosts(): Boolean = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        BsdcMapKit.PROVIDERS.forEach { provider ->
            if (MkTileHostProbe.probe(provider)) health.recordSuccess(provider.id) else health.recordFailure(now, provider.id)
        }
        reresolveHosts(System.currentTimeMillis())
    }

    private var appliedBases: List<String> = emptyList()

    /**
     * Re-probe the tile hosts and rebuild the source only if the verdict changed the host set.
     *
     * Swapping `ITileSource` mid-load is legal but visible, so a probe that finds nothing new must
     * not touch a working map. The returned set is what the map is now using, for the caller to
     * compare against.
     */
    fun reresolveHosts(nowMs: Long): Boolean {
        val bases = BsdcMapKit.tileBases(nowMs, health)
        if (bases == appliedBases) return false
        appliedBases = bases
        return true
    }
}

/**
 * What the map paints on top of the tiles: one point and one ground circle.
 *
 * The ring can sit somewhere other than the pin, because that is how the vendor screens use it: the
 * delivery area belongs to the shop, while the pin being placed belongs to a customer. Folding the
 * two into one point would draw a 3 km circle around the wrong address and still look correct.
 */
private data class MapDecor(
    val latitude: Double,
    val longitude: Double,
    val radiusKm: Double,
    val ringLatitude: Double? = null,
    val ringLongitude: Double? = null,
)

/**
 * The delivery radius, the pin and the tap, drawn straight on the map canvas.
 *
 * The ring is a many-point path rather than `canvas.drawCircle`, because on a Mercator surface a
 * circle of constant *ground* radius is not a circle on the *screen*. [BsdcMapKit.circleRing] owns
 * that maths and is unit-tested; this class only projects the points it returns, so the ring that is
 * drawn and the ring that is tested cannot drift apart.
 *
 * [onSingleTapConfirmed] is osmdroid's *confirmed* tap, which fires only when the gesture was not a
 * pan, a fling or a pinch. That is why this class carries no gesture detector of its own: a map that
 * drops a pin on every drag is worse than a map with no tap at all, and the library already makes
 * that distinction correctly.
 */
private class MapDecorOverlay : Overlay() {

    var decor: MapDecor? = null
    var onPinTap: ((latitude: Double, longitude: Double) -> Unit)? = null

    /** Fired once after the first real frame, so "loading" stops being a guess. */
    var onDrawn: (() -> Unit)? = null

    private val ringFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val ringLine = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = STROKE_DP * DENSITY
        pathEffect = DashPathEffect(floatArrayOf(9f * DENSITY, 7f * DENSITY), 0f)
    }
    private val handleFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val outline = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val pinFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val pinHole = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.WHITE
    }
    private val taper = Path()
    private val ringPath = Path()
    private val centrePoint = Point()
    private val ringCentrePoint = Point()
    private val scratchPoint = Point()

    override fun draw(canvas: Canvas, mapView: MapView, shadow: Boolean) {
        val current = decor
        if (current != null) {
            val centre = mapView.projection.toPixels(GeoPoint(current.latitude, current.longitude), centrePoint)
            if (centre != null) paint(canvas, mapView.projection, current, centre.x, centre.y)
        }
        val drawn = onDrawn
        if (drawn != null) {
            onDrawn = null
            drawn()
        }
    }

    override fun onSingleTapConfirmed(event: MotionEvent, mapView: MapView): Boolean {
        val tap = onPinTap ?: return false
        val point = mapView.projection.fromPixels(event.x.toInt(), event.y.toInt()) ?: return false
        val lat = point.latitude
        val lng = point.longitude
        if (!lat.isFinite() || !lng.isFinite()) return false
        tap(lat, lng)
        return true
    }

    private fun paint(canvas: Canvas, projection: Projection, decor: MapDecor, cx: Int, cy: Int) {
        // cx/cy are the pin; the ring gets its own centre below, because the two can differ.
        ringFill.color = argb(RING_COLOR, RING_FILL_ALPHA)
        ringLine.color = RING_COLOR
        handleFill.color = RING_COLOR
        outline.color = Color.WHITE
        outline.strokeWidth = 2f * DENSITY
        pinFill.color = PIN_COLOR
        val ringLat = decor.ringLatitude ?: decor.latitude
        val ringLng = decor.ringLongitude ?: decor.longitude
        val radiusPx = if (decor.radiusKm > 0.0) {
            drawRadius(canvas, projection, decor, ringLat, ringLng)
        } else {
            0f
        }
        val ringCentre = if (radiusPx > 0f) {
            projection.toPixels(GeoPoint(ringLat, ringLng), ringCentrePoint)
        } else {
            null
        }
        if (radiusPx > 0f && ringCentre != null) {
            canvas.drawCircle(ringCentre.x + radiusPx, ringCentre.y.toFloat(), HANDLE_RADIUS * DENSITY, handleFill)
            canvas.drawCircle(ringCentre.x + radiusPx, ringCentre.y.toFloat(), HANDLE_RADIUS * DENSITY, outline)
        }
        drawPin(canvas, cx.toFloat(), cy.toFloat())
    }

    /** @return the ring's radius in screen pixels, or 0 when there is nothing to draw. */
    private fun drawRadius(
        canvas: Canvas,
        projection: Projection,
        decor: MapDecor,
        ringLatitude: Double,
        ringLongitude: Double,
    ): Float {
        ringPath.rewind()
        val ring = BsdcMapKit.circleRing(ringLatitude, ringLongitude, decor.radiusKm)
        if (ring.isEmpty()) return 0f
        var firstX = 0f
        var firstY = 0f
        var points = 0
        for ((lat, lng) in ring) {
            // `toPixels` returns the reusable Point, so the values are read here and never stored.
            val point = projection.toPixels(GeoPoint(lat, lng), scratchPoint) ?: continue
            val x = point.x.toFloat()
            val y = point.y.toFloat()
            if (points == 0) {
                ringPath.moveTo(x, y)
                firstX = x
                firstY = y
            } else {
                ringPath.lineTo(x, y)
            }
            points += 1
        }
        if (points < 3) return 0f
        ringPath.close()
        canvas.drawPath(ringPath, ringFill)
        canvas.drawPath(ringPath, ringLine)
        val centre = projection.toPixels(GeoPoint(ringLatitude, ringLongitude), scratchPoint)
            ?: return 0f
        return Math.hypot((firstX - centre.x).toDouble(), (firstY - centre.y).toDouble()).toFloat()
    }

    /** A teardrop whose *tip*, not its middle, sits on the coordinate. */
    private fun drawPin(canvas: Canvas, x: Float, y: Float) {
        val radius = PIN_RADIUS * DENSITY
        val bulbY = y - radius * BULB_OFFSET
        outline.color = Color.WHITE
        outline.strokeWidth = 1.6f * DENSITY
        canvas.drawCircle(x, bulbY, radius + 1.2f * DENSITY, outline)
        canvas.drawCircle(x, bulbY, radius, pinFill)
        taper.rewind()
        taper.moveTo(x - radius * 0.6f, bulbY + radius * 0.58f)
        taper.lineTo(x, y)
        taper.lineTo(x + radius * 0.6f, bulbY + radius * 0.58f)
        taper.close()
        canvas.drawPath(taper, pinFill)
        canvas.drawCircle(x, bulbY, radius * 0.34f, pinHole)
    }

    private fun argb(color: Int, alpha: Int): Int =
        Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))

    companion object {
        /**
         * Density is a constant, not a lookup.
         *
         * An `Overlay` is not a `View`, so it has no `Context` to read one from, and everything sized
         * here is cosmetic; reading `mapView.resources` on the draw path would be a real per-frame
         * cost for no visible gain. 3.0 matches the devices this screen runs on, and on a low-density
         * tablet the ring is simply a hair thicker.
         */
        private const val DENSITY = 3f
        private const val STROKE_DP = 1.6f
        private const val HANDLE_RADIUS = 5f
        private const val PIN_RADIUS = 9f
        private const val BULB_OFFSET = 1.55f
        private const val RING_FILL_ALPHA = 40
    }
}

/**
 * The one map both screens share: engine setup, the `MapView`, its lifecycle, tile source, status.
 *
 * [zoom] is applied only when it changes, so a user's own pinch is never snapped back by an
 * unrelated recomposition — the failure mode that makes an embedded map feel possessed. When
 * [fitRadiusInView] is set, the level is instead derived from the radius and the measured height of
 * the box, which is what a vendor drawing a 30 km area needs and no fixed zoom can provide.
 */
@Composable
internal fun MkNativeMap(
    latitude: Double,
    longitude: Double,
    zoom: Double,
    radiusKm: Double,
    ringLatitude: Double? = null,
    ringLongitude: Double? = null,
    fitRadiusInView: Boolean = false,
    interactive: Boolean = true,
    modifier: Modifier = Modifier,
    onPinTap: ((latitude: Double, longitude: Double) -> Unit)? = null,
    onDrawn: () -> Unit = {},
) {
    val context = LocalContext.current
    MkMapEngine.ensure(context)

    val latestTap by rememberUpdatedState(onPinTap)
    val latestDrawn by rememberUpdatedState(onDrawn)
    val latestRadius by rememberUpdatedState(radiusKm)
    val latestCentre by rememberUpdatedState(latitude to longitude)
    val overlay = remember { MapDecorOverlay() }
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var appliedZoom by remember { mutableStateOf(Double.NaN) }
    var appliedCentre by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    val online = rememberNetworkAvailable(context)
    var hostsChanged by remember { mutableStateOf(0) }

    // Provider health is re-read on every open, and the map only swaps its tile source when the
    // verdict actually changed the host set. A Retry therefore has a real chance of reaching a
    // different operator, which is what the old single-host design could not do.
    LaunchedEffect(online) {
        if (online && MkMapEngine.refreshHosts()) hostsChanged += 1
    }
    LaunchedEffect(hostsChanged) {
        if (hostsChanged > 0) mapView?.setTileSource(MkMapEngine.tileSource())
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            val view = mapView ?: return@LifecycleEventObserver
            when (event) {
                Lifecycle.Event.ON_START -> view.onResume()
                Lifecycle.Event.ON_STOP -> view.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView?.onPause()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            MapView(viewContext).apply {
                setTileSource(MkMapEngine.tileSource())
                setUseDataConnection(online)
                // `interactive` is the read-only map's rule, stated once: no pan, no zoom, and no
                // tap below it either. The customer's address cannot be edited by touching a map
                // that was only ever meant to show it.
                setMultiTouchControls(interactive)
                setTilesScaledToDpi(true)
                setDestroyMode(true)
                setMinZoomLevel(BsdcMapKit.MIN_ZOOM.toDouble())
                setMaxZoomLevel(BsdcMapKit.MAX_ZOOM.toDouble())
                // A pale field is not decoration. While tiles are still arriving this is what the
                // user sees, and white-on-white is precisely the "is it broken?" doubt that started
                // this rewrite.
                setBackgroundColor(Color.rgb(226, 233, 230))
                overlays.clear()
                overlays.add(overlay)
                overlay.onPinTap = if (interactive) latestTap?.let { tap -> { lat, lng -> tap(lat, lng) } } else null
                overlay.onDrawn = { latestDrawn() }
                addOnLayoutChangeListener { view, left, top, right, bottom, olt, odt, olb, odb ->
                    if (left != olt || top != odt || right != olb || bottom != odb) {
                        // The native equivalent of the page's `invalidateSize()`: the projection is
                        // rebuilt from the new size on the next draw, so a dialog that opens at a
                        // different height cannot keep the old viewport.
                        view.invalidate()
                        // Framing must come from the measured box, not from a composition-time
                        // guess: ask a Compose size before the first layout pass and you get zero,
                        // which is how the old page ended up centred on a viewport it never had.
                        val side = minOf(right - left, bottom - top)
                        val radius = latestRadius
                        if (fitRadiusInView && side > 0 && radius > 0.0) {
                            val fitted = BsdcMapKit.zoomToFitRadius(
                                radiusKm = radius,
                                latitudeDegrees = latestCentre.first,
                                shorterSidePx = side,
                            )
                            appliedZoom = fitted
                            view.controller.setZoom(fitted)
                        }
                    }
                }
                mapView = this
            }
        },
        update = { view ->
            overlay.decor = MapDecor(
                latitude = latitude,
                longitude = longitude,
                radiusKm = radiusKm,
                ringLatitude = ringLatitude,
                ringLongitude = ringLongitude,
            )
            view.setUseDataConnection(online)

            val shorterSide = minOf(view.width, view.height)
            val targetZoom = if (fitRadiusInView && radiusKm > 0.0 && shorterSide > 0) {
                BsdcMapKit.zoomToFitRadius(radiusKm, latitude, shorterSide)
            } else {
                zoom
            }

            val centre = latitude to longitude
            if (appliedCentre != centre) {
                appliedCentre = centre
                val point = GeoPoint(latestCentre.first, latestCentre.second)
                if (appliedZoom.isNaN()) view.controller.setCenter(point) else view.controller.animateTo(point)
            }
            if (appliedZoom != targetZoom) {
                appliedZoom = targetZoom
                view.controller.setZoom(targetZoom)
            }
            view.invalidate()
        },
        onRelease = { view ->
            overlay.onPinTap = null
            overlay.onDrawn = null
            overlay.decor = null
            view.overlays.remove(overlay)
            view.onPause()
        },
    )

}


/** The two colours the map owns, so the picker and the read-only view cannot diverge. */
private val RING_COLOR: Int = Color.rgb(0, 118, 88)
private val PIN_COLOR: Int = Color.rgb(198, 40, 40)

/**
 * Whether the device has an internet connection, so the map can say "offline" instead of "broken"
 * and osmdroid can be told to stop requesting tiles it cannot receive.
 *
 * This is the only failure signal the native map can read without replacing the library's
 * downloader, and it is the one that matters to the person looking at it: an outage and a dead tile
 * host look identical on screen, and only one of them is fixed by pressing Retry.
 */
@Composable
internal fun rememberNetworkAvailable(context: Context): Boolean {
    val manager = remember(context) {
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    }
    var available by remember(manager) { mutableStateOf(manager?.let { hasInternet(it) } ?: true) }
    DisposableEffect(manager) {
        val connectivity = manager ?: return@DisposableEffect onDispose { }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                available = hasInternet(connectivity)
            }

            override fun onLost(network: Network) {
                available = hasInternet(connectivity)
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                available = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            }
        }
        val registered = runCatching { connectivity.registerNetworkCallback(request, callback) }.isSuccess
        onDispose {
            if (registered) runCatching { connectivity.unregisterNetworkCallback(callback) }
        }
    }
    return available
}

private fun hasInternet(manager: ConnectivityManager): Boolean {
    val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}
