package bd.info.bsdc.app.feature.market

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.model.BsdcHosts
import kotlinx.coroutines.delay
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * OpenStreetMap pin for the delivery address: Leaflet with OSM tiles inside a WebView.
 *
 * The map reports a new pin on tap or drag, and Compose pushes pins set by search or GPS back in.
 * The page can only talk to the app through [PinBridge], which accepts two finite numbers. Every
 * point is checked against Bangladesh's bounds by the caller.
 */
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
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
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val state = remember { PinMapState(initial = validPoint(lat, lng)) }
    var mapStatus by remember { mutableStateOf(OsmMapStatus.LOADING) }
    var retryVersion by remember { mutableStateOf(0) }

    LaunchedEffect(mapStatus, retryVersion) {
        if (mapStatus == OsmMapStatus.LOADING) {
            delay(MAP_LOAD_TIMEOUT_MS)
            if (mapStatus == OsmMapStatus.LOADING) mapStatus = OsmMapStatus.ERROR
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(230.dp)
            .clip(RoundedCornerShape(14.dp)),
    ) {
        key(retryVersion) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    val generation = retryVersion
                    state.loaded = false
                    state.pagePin = validPoint(lat, lng)
                    state.pageCircle = null
                    WebView(context).apply {
                        configureOsmWebView()
                        webChromeClient = mapChromeClient(
                            generation = generation,
                            currentGeneration = { retryVersion },
                            mainHandler = mainHandler,
                            onStatus = { mapStatus = it },
                        )
                        webViewClient = mapWebViewClient(
                            context = context,
                            generation = generation,
                            currentGeneration = { retryVersion },
                            mainHandler = mainHandler,
                            onStatus = { mapStatus = it },
                            onPageLoaded = { view ->
                                state.loaded = true
                                state.desiredPin?.let { point ->
                                    if (point != state.pagePin) {
                                        view.evaluateJavascript("setPin(${point.first},${point.second})", null)
                                        state.pagePin = point
                                    }
                                }
                                if (state.desiredPin == null && state.pagePin != null) {
                                    view.evaluateJavascript("clearPin()", null)
                                    state.pagePin = null
                                }
                                applyRadiusCircle(view, state)
                            },
                        )
                        addOnLayoutChangeListener { view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
                            if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom) {
                                (view as? WebView)?.refreshOsmMapSize()
                            }
                        }
                        addJavascriptInterface(
                            PinBridge { newLat, newLng ->
                                // Bridge calls arrive on a background thread; keep shared state and
                                // the Compose callback on Android's main thread.
                                mainHandler.post {
                                    if (generation != retryVersion) return@post
                                    val point = newLat to newLng
                                    state.desiredPin = point
                                    state.pagePin = point
                                    latestOnPin(newLat, newLng)
                                }
                            },
                            "BsdcPin",
                        )
                        loadDataWithBaseURL(
                            BsdcHosts.SITE_ORIGIN + "/",
                            mapPage(
                                lat = validCoordinate(lat, DHAKA_LAT),
                                lng = validCoordinate(lng, DHAKA_LNG),
                                hasPin = validPoint(lat, lng) != null,
                            ),
                            "text/html",
                            "utf-8",
                            null,
                        )
                    }
                },
                update = { view ->
                    val target = validPoint(lat, lng)
                    state.desiredPin = target
                    if (state.loaded && target != state.pagePin) {
                        if (target == null) {
                            view.evaluateJavascript("clearPin()", null)
                        } else {
                            view.evaluateJavascript("setPin(${target.first},${target.second})", null)
                        }
                        state.pagePin = target
                    }

                    val anchorLat = circleCenterLat ?: lat
                    val anchorLng = circleCenterLng ?: lng
                    val nextCircle = if (
                        radiusKm != null && radiusKm in 1..MAX_DELIVERY_RADIUS_KM &&
                        anchorLat != null && anchorLng != null &&
                        anchorLat.isFinite() && anchorLng.isFinite()
                    ) {
                        Triple(anchorLat, anchorLng, radiusKm * 1000)
                    } else {
                        null
                    }
                    state.desiredCircle = nextCircle
                    if (state.loaded && nextCircle != state.pageCircle) {
                        applyRadiusCircle(view, state)
                    }
                },
                onRelease = { view ->
                    view.stopLoading()
                    view.destroy()
                },
            )
        }
        OsmMapNotice(
            status = mapStatus,
            bn = bn,
            onRetry = {
                mapStatus = OsmMapStatus.LOADING
                retryVersion += 1
            },
        )
    }
}

/**
 * A read-only map for a delivery address. It deliberately installs no JavaScript bridge: the
 * map can move and zoom, but it cannot report or change the customer's saved address.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MkOsmViewMap(
    lat: Double,
    lng: Double,
    bn: Boolean = false,
    zoom: Int = 16,
    modifier: Modifier = Modifier,
    interactive: Boolean = true,
) {
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val state = remember { ReadOnlyMapState(initial = MapViewTarget(lat, lng, zoom)) }
    var mapStatus by remember { mutableStateOf(OsmMapStatus.LOADING) }
    var retryVersion by remember { mutableStateOf(0) }

    LaunchedEffect(mapStatus, retryVersion) {
        if (mapStatus == OsmMapStatus.LOADING) {
            delay(MAP_LOAD_TIMEOUT_MS)
            if (mapStatus == OsmMapStatus.LOADING) mapStatus = OsmMapStatus.ERROR
        }
    }

    Box(modifier = modifier.clip(RoundedCornerShape(14.dp))) {
        key(retryVersion) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    val generation = retryVersion
                    val target = MapViewTarget(
                        validCoordinate(lat, DHAKA_LAT),
                        validCoordinate(lng, DHAKA_LNG),
                        zoom.coerceIn(MIN_MAP_ZOOM, MAX_MAP_ZOOM),
                    )
                    state.loaded = false
                    state.desired = target
                    state.pageTarget = target
                    WebView(context).apply {
                        configureOsmWebView()
                        webChromeClient = mapChromeClient(
                            generation = generation,
                            currentGeneration = { retryVersion },
                            mainHandler = mainHandler,
                            onStatus = { mapStatus = it },
                        )
                        webViewClient = mapWebViewClient(
                            context = context,
                            generation = generation,
                            currentGeneration = { retryVersion },
                            mainHandler = mainHandler,
                            onStatus = { mapStatus = it },
                            onPageLoaded = { view ->
                                state.loaded = true
                                applyReadOnlyTarget(view, state)
                            },
                        )
                        addOnLayoutChangeListener { view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
                            if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom) {
                                (view as? WebView)?.refreshOsmMapSize()
                            }
                        }
                        loadDataWithBaseURL(
                            BsdcHosts.SITE_ORIGIN + "/",
                            viewMapPage(
                                lat = target.lat,
                                lng = target.lng,
                                zoom = target.zoom,
                                interactive = interactive,
                            ),
                            "text/html",
                            "utf-8",
                            null,
                        )
                    }
                },
                update = { view ->
                    state.desired = MapViewTarget(
                        validCoordinate(lat, DHAKA_LAT),
                        validCoordinate(lng, DHAKA_LNG),
                        zoom.coerceIn(MIN_MAP_ZOOM, MAX_MAP_ZOOM),
                    )
                    if (state.loaded) applyReadOnlyTarget(view, state)
                },
                onRelease = { view ->
                    view.stopLoading()
                    view.destroy()
                },
            )
        }
        OsmMapNotice(
            status = mapStatus,
            bn = bn,
            onRetry = {
                mapStatus = OsmMapStatus.LOADING
                retryVersion += 1
            },
        )
    }
}

/**
 * The delivery pin, full screen.
 *
 * A 160dp card tile tells a vendor roughly where a delivery is; it is not enough to decide
 * whether a courier reaches the address before dark. Expanding to the whole screen is the
 * difference between a decoration and a decision, and it costs one WebView because the content
 * only exists while the dialog is open.
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
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = BsdcThemeTokens.colors.surfaceElevated) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = if (bn) "বন্ধ করুন" else "Close",
                        )
                    }
                }
                MkOsmViewMap(
                    lat = lat,
                    lng = lng,
                    bn = bn,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                ) {
                    // A key-free link the system routes to the Maps app when it is installed,
                    // so the driver gets turn-by-turn instead of a browser tab.
                    BsdcButton(
                        label = if (bn) "গুগল ম্যাপে যান" else "Open in Google Maps",
                        onClick = onOpenGoogleMaps,
                        modifier = Modifier.fillMaxWidth(),
                        leadingIcon = Icons.Rounded.LocationOn,
                    )
                }
            }
        }
    }
}

@Composable
private fun BoxScope.OsmMapNotice(
    status: OsmMapStatus,
    bn: Boolean,
    onRetry: () -> Unit,
) {
    if (status == OsmMapStatus.READY) return

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
            if (status == OsmMapStatus.LOADING) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    imageVector = Icons.Rounded.LocationOn,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
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
                        OsmMapStatus.LOADING -> if (bn) "মানচিত্র লোড হচ্ছে…" else "Loading map tiles…"
                        OsmMapStatus.ERROR -> if (bn) {
                            "টাইল লোড হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।"
                        } else {
                            "Map tiles failed. Check your connection and retry."
                        }
                        OsmMapStatus.READY -> ""
                    },
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (status == OsmMapStatus.ERROR) {
                TextButton(onClick = onRetry) {
                    Text(if (bn) "আবার" else "Retry")
                }
            }
        }
    }
}

/** Keep debug WebView tools on for local builds; the identifying UA also covers WebView fallback. */
@SuppressLint("SetJavaScriptEnabled")
private fun WebView.configureOsmWebView() {
    if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = false
    settings.databaseEnabled = false
    settings.useWideViewPort = true
    settings.loadWithOverviewMode = true
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    settings.allowFileAccessFromFileURLs = false
    settings.allowUniversalAccessFromFileURLs = false
    settings.javaScriptCanOpenWindowsAutomatically = false
    settings.setSupportMultipleWindows(false)
    settings.setSupportZoom(false)
    settings.builtInZoomControls = false
    settings.displayZoomControls = false
    settings.defaultTextEncodingName = "utf-8"
    val existingAgent = settings.userAgentString.orEmpty()
    if (!existingAgent.contains(TILE_USER_AGENT)) {
        settings.userAgentString = "$existingAgent $TILE_USER_AGENT".trim()
    }
    isVerticalScrollBarEnabled = false
    isHorizontalScrollBarEnabled = false
    setBackgroundColor(AndroidColor.rgb(229, 227, 223))
}

private fun mapChromeClient(
    generation: Int,
    currentGeneration: () -> Int,
    mainHandler: Handler,
    onStatus: (OsmMapStatus) -> Unit,
): WebChromeClient = object : WebChromeClient() {
    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
        val message = consoleMessage.message()
        if (BuildConfig.DEBUG) {
            Log.d(
                MAP_LOG_TAG,
                "console ${consoleMessage.messageLevel()} ${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} $message",
            )
        }
        val tileState = MkLogic.osmMapStatusFromConsoleMessage(message)
        if (tileState != null) {
            postMapStatus(generation, currentGeneration, mainHandler, onStatus, tileState)
        } else if (consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
            postMapStatus(generation, currentGeneration, mainHandler, onStatus, OsmMapStatus.ERROR)
        }
        return true
    }
}

private fun mapWebViewClient(
    context: Context,
    generation: Int,
    currentGeneration: () -> Int,
    mainHandler: Handler,
    onStatus: (OsmMapStatus) -> Unit,
    onPageLoaded: (WebView) -> Unit,
): WebViewClient = object : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        // The map page has no navigations. This also keeps the visible OSM attribution link from
        // replacing the map in this small, stateful WebView.
        return true
    }

    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?,
    ): WebResourceResponse? {
        val webRequest = request ?: return null
        val uri = webRequest.url
        if (webRequest.isForMainFrame) return null
        val siteHost = URI.create(BsdcHosts.SITE_ORIGIN).host.orEmpty()
        return when (
            MkLogic.classifyOsmMapResource(
                scheme = uri.scheme,
                host = uri.host,
                path = uri.path,
                siteHost = siteHost,
                port = uri.port,
            )
        ) {
            OsmMapResource.LEAFLET_JS -> bundledMapAsset(context, "leaflet/leaflet.js", "text/javascript")
            OsmMapResource.LEAFLET_CSS -> bundledMapAsset(context, "leaflet/leaflet.css", "text/css")
            OsmMapResource.OSM_TILE -> {
                if (BuildConfig.DEBUG) {
                    Log.d(MAP_LOG_TAG, "tile request intercepted: ${uri.host}${uri.path}")
                }
                val response = fetchTile(uri.toString())
                if (response == null && BuildConfig.DEBUG) {
                    Log.w(MAP_LOG_TAG, "tile interceptor fell back to WebView fetch: ${uri.host}${uri.path}")
                }
                // A null response deliberately lets WebView retry the same HTTPS OSM URL with
                // settings.userAgentString, rather than silently dropping a failed intercepted tile.
                response
            }
            OsmMapResource.BLOCKED -> {
                if (BuildConfig.DEBUG) Log.w(MAP_LOG_TAG, "blocked map subresource: $uri")
                blockedResourceResponse()
            }
        }
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
        if (BuildConfig.DEBUG) Log.d(MAP_LOG_TAG, "page started: $url")
        postMapStatus(generation, currentGeneration, mainHandler, onStatus, OsmMapStatus.LOADING)
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        if (BuildConfig.DEBUG) Log.d(MAP_LOG_TAG, "page finished: $url")
        if (generation != currentGeneration() || view == null) return
        view.refreshOsmMapSize()
        onPageLoaded(view)
    }

    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: android.webkit.WebResourceError?,
    ) {
        val url = request?.url?.toString().orEmpty()
        if (BuildConfig.DEBUG) {
            Log.w(
                MAP_LOG_TAG,
                "resource error main=${request?.isForMainFrame} code=${error?.errorCode} description=${error?.description} url=$url",
            )
        }
        if (request?.isForMainFrame == true) {
            postMapStatus(generation, currentGeneration, mainHandler, onStatus, OsmMapStatus.ERROR)
        }
    }

    override fun onReceivedHttpError(
        view: WebView?,
        request: WebResourceRequest?,
        errorResponse: WebResourceResponse?,
    ) {
        if (BuildConfig.DEBUG) {
            Log.w(
                MAP_LOG_TAG,
                "HTTP ${errorResponse?.statusCode} main=${request?.isForMainFrame} url=${request?.url}",
            )
        }
        if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 400) {
            postMapStatus(generation, currentGeneration, mainHandler, onStatus, OsmMapStatus.ERROR)
        }
    }
}

private fun postMapStatus(
    generation: Int,
    currentGeneration: () -> Int,
    mainHandler: Handler,
    onStatus: (OsmMapStatus) -> Unit,
    status: OsmMapStatus,
) {
    mainHandler.post {
        if (generation == currentGeneration()) onStatus(status)
    }
}

private fun bundledMapAsset(context: Context, assetPath: String, mimeType: String): WebResourceResponse =
    try {
        WebResourceResponse(mimeType, "utf-8", context.assets.open(assetPath))
    } catch (failure: Exception) {
        if (BuildConfig.DEBUG) Log.e(MAP_LOG_TAG, "could not open bundled map asset $assetPath", failure)
        errorResourceResponse(404, "Bundled map asset missing")
    }

private fun blockedResourceResponse(): WebResourceResponse =
    errorResourceResponse(403, "Blocked by BSDC map policy")

private fun errorResourceResponse(statusCode: Int, reason: String): WebResourceResponse = WebResourceResponse(
    "text/plain",
    "utf-8",
    statusCode,
    reason,
    emptyMap(),
    ByteArrayInputStream(ByteArray(0)),
)

/** The map's own document, local Leaflet assets, and OSM tiles are the only allowed subresources. */
private const val MAP_LOG_TAG = "MkOsmMap"
private const val TILE_USER_AGENT = "BSDC-Android/1.0 (+https://www.bsdc.info.bd)"
private const val MAP_LOAD_TIMEOUT_MS = 20_000L
private const val MAP_REDIRECT_LIMIT = 4
private const val MAX_TILE_BYTES = 512 * 1024
private const val MAX_TILE_CACHE_BYTES = 16 * 1024 * 1024
private const val MAX_TILE_CACHE_ENTRIES = 256
private const val MIN_MAP_ZOOM = 2
private const val MAX_MAP_ZOOM = 19
private const val MAX_DELIVERY_RADIUS_KM = 500
private const val DHAKA_LAT = 23.8103
private const val DHAKA_LNG = 90.4125

/** Fetches one OSM tile with an identifying UA. Runs on WebView's background resource thread. */
private fun fetchTile(url: String): WebResourceResponse? {
    val source = runCatching { URL(url) }.getOrElse {
        if (BuildConfig.DEBUG) Log.w(MAP_LOG_TAG, "invalid tile URL", it)
        return null
    }
    if (!MkLogic.isOsmTileRequest(source.protocol, source.host, source.port)) return null

    TileCache[url]?.let { bytes ->
        if (BuildConfig.DEBUG) Log.d(MAP_LOG_TAG, "tile cache hit: ${source.host}")
        return WebResourceResponse("image/png", null, bytes.inputStream())
    }

    var connection: HttpURLConnection? = null
    return try {
        val initial = (source.openConnection() as HttpURLConnection).apply {
            connectTimeout = TILE_CONNECT_TIMEOUT_MS
            readTimeout = TILE_READ_TIMEOUT_MS
            instanceFollowRedirects = false
            setTileHeaders()
        }
        connection = followTileRedirect(initial)
        if (connection == null) {
            if (BuildConfig.DEBUG) Log.w(MAP_LOG_TAG, "tile redirect refused or failed: ${source.host}")
            null
        } else {
            val responseCode = connection.responseCode
            if (BuildConfig.DEBUG) Log.d(MAP_LOG_TAG, "tile HTTP $responseCode from ${connection.url.host}")
            if (responseCode != HttpURLConnection.HTTP_OK) {
                null
            } else {
                val bytes = readTileBody(connection)
                if (bytes == null || bytes.isEmpty()) {
                    if (BuildConfig.DEBUG) Log.w(MAP_LOG_TAG, "tile body empty or exceeded $MAX_TILE_BYTES bytes")
                    null
                } else {
                    TileCache.put(url, bytes)
                    WebResourceResponse("image/png", null, bytes.inputStream())
                }
            }
        }
    } catch (failure: Exception) {
        if (BuildConfig.DEBUG) Log.w(MAP_LOG_TAG, "tile fetch failed: ${source.host}", failure)
        null
    } finally {
        runCatching { connection?.disconnect() }
    }
}

private fun HttpURLConnection.setTileHeaders() {
    setRequestProperty("User-Agent", TILE_USER_AGENT)
    setRequestProperty("Referer", BsdcHosts.SITE_ORIGIN + "/")
    setRequestProperty("Accept", "image/png,image/*;q=0.8")
}

/** Read at most MAX_TILE_BYTES + 1, so a hostile or broken body cannot balloon the app heap. */
private fun readTileBody(connection: HttpURLConnection): ByteArray? {
    val output = ByteArrayOutputStream(minOf(MAX_TILE_BYTES, 16 * 1024))
    val chunk = ByteArray(8 * 1024)
    connection.inputStream.use { input ->
        while (true) {
            val count = input.read(chunk)
            if (count < 0) break
            if (count == 0) continue
            if (output.size() + count > MAX_TILE_BYTES) return null
            output.write(chunk, 0, count)
        }
    }
    return output.toByteArray()
}

/** Keep the identifying headers on every redirect and refuse any non-HTTPS or non-OSM hop. */
private fun followTileRedirect(start: HttpURLConnection): HttpURLConnection? {
    var current = start
    var hops = 0
    while (hops < MAP_REDIRECT_LIMIT) {
        val responseCode = runCatching { current.responseCode }.getOrElse {
            if (BuildConfig.DEBUG) Log.w(MAP_LOG_TAG, "could not read tile response", it)
            current.disconnect()
            return null
        }
        if (!isTileRedirect(responseCode)) return current

        val baseUrl = current.url
        val location = runCatching { current.getHeaderField("Location") }.getOrNull()
        if (location.isNullOrBlank()) {
            current.disconnect()
            return null
        }
        val nextUrl = runCatching { URL(baseUrl, location) }.getOrElse {
            current.disconnect()
            return null
        }
        val next = runCatching {
            (nextUrl.openConnection() as HttpURLConnection).apply {
                connectTimeout = TILE_CONNECT_TIMEOUT_MS
                readTimeout = TILE_READ_TIMEOUT_MS
                instanceFollowRedirects = false
                setTileHeaders()
            }
        }.getOrElse {
            current.disconnect()
            return null
        }
        current.disconnect()
        if (!MkLogic.isOsmTileRequest(next.url.protocol, next.url.host, next.url.port)) {
            next.disconnect()
            return null
        }
        current = next
        hops++
    }
    current.disconnect()
    return null
}

private fun isTileRedirect(statusCode: Int): Boolean =
    statusCode == HttpURLConnection.HTTP_MOVED_PERM ||
        statusCode == HttpURLConnection.HTTP_MOVED_TEMP ||
        statusCode == HttpURLConnection.HTTP_SEE_OTHER ||
        statusCode == 307 || statusCode == 308

private const val TILE_CONNECT_TIMEOUT_MS = 8_000
private const val TILE_READ_TIMEOUT_MS = 8_000

/** Small access-ordered cache bounded by both entry count and total tile bytes. */
private object TileCache {
    private var totalBytes = 0
    private val entries = object : LinkedHashMap<String, ByteArray>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?): Boolean = false
    }

    operator fun get(key: String): ByteArray? = synchronized(entries) { entries[key] }

    fun put(key: String, value: ByteArray) {
        if (value.size > MAX_TILE_CACHE_BYTES) return
        synchronized(entries) {
            entries.remove(key)?.let { totalBytes -= it.size }
            entries[key] = value
            totalBytes += value.size
            while (entries.size > MAX_TILE_CACHE_ENTRIES || totalBytes > MAX_TILE_CACHE_BYTES) {
                val eldest = entries.entries.iterator()
                if (!eldest.hasNext()) break
                val removed = eldest.next()
                totalBytes -= removed.value.size
                eldest.remove()
            }
        }
    }
}

private class PinMapState(initial: Pair<Double, Double>?) {
    var loaded: Boolean = false
    var desiredPin: Pair<Double, Double>? = initial
    var pagePin: Pair<Double, Double>? = initial
    var desiredCircle: Triple<Double, Double, Int>? = null
    var pageCircle: Triple<Double, Double, Int>? = null
}

private fun applyRadiusCircle(view: WebView, state: PinMapState) {
    val circle = state.desiredCircle
    if (circle == null) {
        view.evaluateJavascript("clearRadiusCircle()", null)
    } else {
        view.evaluateJavascript(
            "setRadiusCircle(${circle.first},${circle.second},${circle.third})",
            null,
        )
    }
    state.pageCircle = circle
}

private data class MapViewTarget(val lat: Double, val lng: Double, val zoom: Int)

private class ReadOnlyMapState(initial: MapViewTarget) {
    var loaded: Boolean = false
    var desired: MapViewTarget = initial
    var pageTarget: MapViewTarget = initial
}

private fun applyReadOnlyTarget(view: WebView, state: ReadOnlyMapState) {
    if (state.desired == state.pageTarget) return
    val target = state.desired
    view.evaluateJavascript("setMapView(${target.lat},${target.lng},${target.zoom})", null)
    state.pageTarget = target
}

/** The only object exposed to pin-map JavaScript. It accepts two finite numbers, and nothing else. */
private class PinBridge(private val onChanged: (Double, Double) -> Unit) {
    @JavascriptInterface
    fun pinChanged(lat: Double, lng: Double) {
        if (lat.isFinite() && lng.isFinite()) onChanged(lat, lng)
    }
}

private fun validPoint(lat: Double?, lng: Double?): Pair<Double, Double>? =
    if (lat != null && lng != null && lat.isFinite() && lng.isFinite()) lat to lng else null

private fun validCoordinate(value: Double?, fallback: Double): Double =
    value?.takeIf { it.isFinite() } ?: fallback

/** Re-measure only after a real viewport exists; Compose bounds changes and ResizeObserver cover later resizes. */
private fun WebView.refreshOsmMapSize() {
    post {
        if (width <= 0 || height <= 0) return@post
        evaluateJavascript(
            "if (window.map) { window.map.invalidateSize({ pan: false }); }",
            null,
        )
    }
}

private fun mapAssetUrl(path: String): String = BsdcHosts.SITE_ORIGIN.trimEnd('/') + path

/** Read-only page: no bridge object is referenced or installed. */
private fun viewMapPage(
    lat: Double,
    lng: Double,
    zoom: Int,
    interactive: Boolean,
): String = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${mapAssetUrl(MkLogic.OSM_MAP_CSS_PATH)}">
<style>
  html,body{height:100%;width:100%;margin:0;padding:0;overflow:hidden;background:#e5e3df}
  #map{position:absolute;inset:0;background:#e5e3df;font-family:sans-serif}
  .leaflet-control-attribution{font-size:9px}
</style>
</head>
<body>
<div id="map"></div>
<script src="${mapAssetUrl(MkLogic.OSM_MAP_JS_PATH)}"></script>
<script>
  var map = L.map('map', {
    zoomControl: ${if (interactive) "true" else "false"},
    dragging: ${if (interactive) "true" else "false"},
    touchZoom: ${if (interactive) "true" else "false"},
    scrollWheelZoom: ${if (interactive) "true" else "false"},
    doubleClickZoom: ${if (interactive) "true" else "false"},
    keyboard: ${if (interactive) "true" else "false"},
    tap: true
  }).setView([$lat, $lng], $zoom);
  var readonlyIcon = L.divIcon({
    className: 'bsdc-readonly-pin',
    html: '<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#0f766e"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>',
    iconSize: [30, 40],
    iconAnchor: [15, 40]
  });
  var marker = L.marker([$lat, $lng], { icon: readonlyIcon }).addTo(map);
  var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });
  var tileErrors = 0, tileOk = 0;
  function reportTileEvent(kind) {
    if (window.console && console.log) {
      console.log('${MkLogic.OSM_MAP_CONSOLE_PREFIX} tile' + kind + ' ok=' + tileOk + ' errors=' + tileErrors);
    }
  }
  tiles.on('tileerror', function () { tileErrors++; reportTileEvent('error'); });
  tiles.on('tileload', function () { tileOk++; reportTileEvent('load'); });
  tiles.addTo(map);
  function setMapView(la, ln, nextZoom) {
    marker.setLatLng([la, ln]);
    map.setView([la, ln], nextZoom);
  }
  window.setMapView = setMapView;
  function resizeMap() {
    window.requestAnimationFrame(function () { map.invalidateSize({ pan: false }); });
  }
  if (window.ResizeObserver) new ResizeObserver(resizeMap).observe(document.getElementById('map'));
  window.addEventListener('resize', resizeMap);
  setTimeout(resizeMap, 0);
  if (window.console && console.log) console.log('${MkLogic.OSM_MAP_CONSOLE_PREFIX} initialized readonly=true interactive=' + ${if (interactive) "true" else "false"});
</script>
</body>
</html>
""".trimIndent()

/**
 * Interactive picker page. Only finite numeric coordinates are embedded; names, labels,
 * addresses, and any other user text never enter this generated document.
 */
private fun mapPage(
    lat: Double,
    lng: Double,
    hasPin: Boolean,
): String = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${mapAssetUrl(MkLogic.OSM_MAP_CSS_PATH)}">
<style>
  html,body{height:100%;width:100%;margin:0;padding:0;overflow:hidden;background:#e5e3df}
  #map{position:absolute;inset:0;background:#e5e3df;font-family:sans-serif}
  .leaflet-control-attribution{font-size:9px}
</style>
</head>
<body>
<div id="map"></div>
<script src="${mapAssetUrl(MkLogic.OSM_MAP_JS_PATH)}"></script>
<script>
  var map = L.map('map', { zoomControl: true, tap: true }).setView([$lat, $lng], ${if (hasPin) 16 else 13});
  var tileErrors = 0, tileOk = 0;
  var tiles = null;
  function reportTileEvent(kind) {
    if (window.console && console.log) {
      console.log('${MkLogic.OSM_MAP_CONSOLE_PREFIX} tile' + kind + ' ok=' + tileOk + ' errors=' + tileErrors);
    }
  }
  function attachTiles() {
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });
    tiles.on('tileerror', function () { tileErrors++; reportTileEvent('error'); });
    tiles.on('tileload', function () { tileOk++; reportTileEvent('load'); });
    tiles.addTo(map);
  }
  attachTiles();
  var radiusCircle = null;
  function setRadiusCircle(la, ln, metres) {
    if (!radiusCircle) {
      radiusCircle = L.circle([la, ln], {
        radius: metres,
        color: '#2563eb',
        weight: 2,
        fillOpacity: 0.12
      }).addTo(map);
    } else {
      radiusCircle.setLatLng([la, ln]);
      radiusCircle.setRadius(metres);
    }
  }
  function clearRadiusCircle() {
    if (radiusCircle) {
      radiusCircle.remove();
      radiusCircle = null;
    }
  }
  var PIN_ICON = L.divIcon({
    className: 'bsdc-pin',
    html: '<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#0f766e"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>',
    iconSize: [30, 40],
    iconAnchor: [15, 40]
  });
  var marker = null;
  function place(la, ln) {
    if (!marker) {
      marker = L.marker([la, ln], { draggable: true, icon: PIN_ICON }).addTo(map);
      marker.on('dragend', function () {
        var p = marker.getLatLng();
        BsdcPin.pinChanged(p.lat, p.lng);
      });
    } else {
      marker.setLatLng([la, ln]);
    }
  }
  function setPin(la, ln) {
    place(la, ln);
    map.setView([la, ln], Math.max(map.getZoom(), 15));
  }
  function clearPin() {
    if (marker) {
      marker.remove();
      marker = null;
    }
  }
  window.setPin = setPin;
  window.clearPin = clearPin;
  window.setRadiusCircle = setRadiusCircle;
  window.clearRadiusCircle = clearRadiusCircle;
  map.on('click', function (e) {
    place(e.latlng.lat, e.latlng.lng);
    BsdcPin.pinChanged(e.latlng.lat, e.latlng.lng);
  });
  if (${if (hasPin) "true" else "false"}) place($lat, $lng);
  function resizeMap() {
    window.requestAnimationFrame(function () { map.invalidateSize({ pan: false }); });
  }
  if (window.ResizeObserver) new ResizeObserver(resizeMap).observe(document.getElementById('map'));
  window.addEventListener('resize', resizeMap);
  setTimeout(resizeMap, 0);
  if (window.console && console.log) console.log('${MkLogic.OSM_MAP_CONSOLE_PREFIX} initialized pin-picker');
</script>
</body>
</html>
""".trimIndent()
