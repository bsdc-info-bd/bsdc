package bd.info.bsdc.app.feature.market

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.model.BsdcHosts
import java.net.HttpURLConnection
import java.net.URL

/**
 * OpenStreetMap pin for the delivery address: Leaflet with OSM tiles inside a WebView.
 *
 * The map reports a new pin on tap or drag, and Compose pushes pins set by search or GPS back in.
 * The page can only talk to the app through [PinBridge], which accepts two numbers and nothing else.
 * Every point is checked against Bangladesh's bounds by the caller.
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
    val mapErrorText = if (bn) {
        "মানচিত্রের টাইল লোড হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"
    } else {
        "Map tiles could not load. Check your internet connection and try again."
    }
    val latestOnPin by rememberUpdatedState(onPin)
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val state = remember { PinMapState(initial = if (lat != null && lng != null) lat to lng else null) }

    AndroidView(
        modifier = modifier
            .fillMaxWidth()
            .height(230.dp)
            .clip(RoundedCornerShape(14.dp)),
        factory = { context ->
            val leafletJs = context.assets.open("leaflet/leaflet.js").bufferedReader().use { it.readText() }
            val leafletCss = context.assets.open("leaflet/leaflet.css").bufferedReader().use { it.readText() }
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                // The map is one bundled page loaded from the site origin. Nothing in it navigates,
                // so the WebView must not hand any URL off to a browser.
                webViewClient = object : WebViewClient() {
                    // Only the map's own document may load. The attribution link would otherwise
                    // navigate the WebView off the map and leave the member on a web page.
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val uri = request?.url ?: return true
                        val base = BsdcHosts.SITE_ORIGIN.trimEnd('/')
                        return !uri.toString().startsWith(base)
                    }

                    // OpenStreetMap refuses tile requests without an identifying User-Agent and Referer, which a
                    // WebView does not reliably send. Tiles are fetched here instead, and only from tile hosts.
                    //
                    // The page asks for a plain `tile.openstreetmap.org` URL, but OSM answers by redirecting to
                    // one of its `a.`/`b.`/`c.` shards, so every shard host has to be accepted too. A strict
                    // `host ==` test dropped those requests and left the canvas blank white.
                    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                        val uri = request?.url ?: return null
                        if (!MkLogic.isOsmTileRequest(uri.scheme, uri.host)) return null
                        return fetchTile(uri.toString())
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        state.loaded = true
                        val pin = state.applied
                        if (view != null && pin != null) {
                            view.evaluateJavascript("setPin(${pin.first},${pin.second})", null)
                        }
                        val circle = state.appliedCircle
                        if (view != null && circle != null) {
                            view.evaluateJavascript(
                                "setRadiusCircle(${circle.first},${circle.second},${circle.third})",
                                null,
                            )
                        }
                    }
                }
                addJavascriptInterface(
                    PinBridge { newLat, newLng ->
                        // Bridge calls arrive on a background thread; the state change belongs on the main one.
                        mainHandler.post {
                            state.applied = newLat to newLng
                            latestOnPin(newLat, newLng)
                        }
                    },
                    "BsdcPin",
                )
                loadDataWithBaseURL(
                    BsdcHosts.SITE_ORIGIN + "/",
                    mapPage(
                        lat = lat ?: DHAKA_LAT,
                        lng = lng ?: DHAKA_LNG,
                        hasPin = lat != null && lng != null,
                        leafletJs = leafletJs,
                        leafletCss = leafletCss,
                        mapErrorText = mapErrorText,
                    ),
                    "text/html",
                    "utf-8",
                    null,
                )
            }
        },
        update = { view ->
            // Compose moved the pin (search, GPS or a previous tap): move the marker to match.
            val target = if (lat != null && lng != null) lat to lng else null
            if (state.loaded && target != null && target != state.applied) {
                state.applied = target
                view.evaluateJavascript("setPin(${target.first},${target.second})", null)
            }
            val anchorLat = circleCenterLat ?: lat
            val anchorLng = circleCenterLng ?: lng
            val nextCircle = if (radiusKm != null && radiusKm > 0 && anchorLat != null && anchorLng != null) {
                Triple(anchorLat, anchorLng, radiusKm * 1000)
            } else {
                null
            }
            if (state.loaded && nextCircle != state.appliedCircle) {
                state.appliedCircle = nextCircle
                if (nextCircle == null) {
                    view.evaluateJavascript("clearRadiusCircle()", null)
                } else {
                    view.evaluateJavascript(
                        "setRadiusCircle(${nextCircle.first},${nextCircle.second},${nextCircle.third})",
                        null,
                    )
                }
            }
        },
        onRelease = { view ->
            view.stopLoading()
            view.destroy()
        },
    )
}

/**
 * A read-only map for a delivery address.
 *
 * The counterpart to [MkOsmPinMap]: same tiles, same cached fetch, same User-Agent workaround,
 * but the pin cannot be moved. A customer's address is not something a vendor should be able to
 * drag somewhere else, so this installs no [PinBridge] at all — the page is given the
 * coordinates once and has nothing to report back.
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
    val context = LocalContext.current
    val mapErrorText = if (bn) {
        "মানচিত্রের টাইল লোড হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"
    } else {
        "Map tiles could not load. Check your internet connection and try again."
    }
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val leafletJs = context.assets.open("leaflet/leaflet.js").bufferedReader().use { it.readText() }
            val leafletCss = context.assets.open("leaflet/leaflet.css").bufferedReader().use { it.readText() }
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                // Nothing in this page navigates: it draws one pin and stops.
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean = true

                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): WebResourceResponse? {
                        val uri = request?.url ?: return null
                        if (!MkLogic.isOsmTileRequest(uri.scheme, uri.host)) return null
                        return fetchTile(uri.toString())
                    }
                }
                loadDataWithBaseURL(
                    BsdcHosts.SITE_ORIGIN + "/",
                    viewMapPage(
                        lat = lat,
                        lng = lng,
                        zoom = zoom,
                        interactive = interactive,
                        leafletJs = leafletJs,
                        leafletCss = leafletCss,
                        mapErrorText = mapErrorText,
                    ),
                    "text/html",
                    "utf-8",
                    null,
                )
            }
        },
        onRelease = { view ->
            view.stopLoading()
            view.destroy()
        },
    )
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

/** Remembers the last pin and optional radius circle known to both sides. */
private class PinMapState(initial: Pair<Double, Double>?) {
    var loaded: Boolean = false
    var applied: Pair<Double, Double>? = initial
    var appliedCircle: Triple<Double, Double, Int>? = null
}

/** The only object the map page can reach. It accepts coordinates and does nothing else. */
private class PinBridge(private val onChanged: (Double, Double) -> Unit) {
    @JavascriptInterface
    fun pinChanged(lat: Double, lng: Double) {
        if (lat.isFinite() && lng.isFinite()) onChanged(lat, lng)
    }
}

private const val TILE_USER_AGENT = "BSDC-Android/1.0 (+https://www.bsdc.info.bd)"

/** Fetches one OSM tile with the app's identity. Runs on the WebView's background thread. Null means the tile is skipped. */
private fun fetchTile(url: String): WebResourceResponse? = runCatching {
    // A tile is ~10 KB. Without a cache the map re-downloads every visible tile on every scroll,
    // which is what made the blank canvas slow to fill and expensive on mobile data.
    val cached = tileCache[url]
    if (cached != null) {
        return@runCatching WebResourceResponse("image/png", null, cached.inputStream())
    }
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 8_000
        readTimeout = 8_000
        setRequestProperty("User-Agent", TILE_USER_AGENT)
        setRequestProperty("Referer", BsdcHosts.SITE_ORIGIN + "/")
        setRequestProperty("Accept", "image/png,image/*;q=0.8")
    }
    if (connection.responseCode != HttpURLConnection.HTTP_OK) {
        connection.disconnect()
        null
    } else {
        val bytes = runCatching { connection.inputStream.use { it.readBytes() } }.getOrNull()
        connection.disconnect()
        // A zero-byte or oversized body is a broken tile, not a picture: let Leaflet retry it.
        if (bytes == null || bytes.isEmpty() || bytes.size > MAX_TILE_BYTES) {
            null
        } else {
            tileCache.put(url, bytes)
            WebResourceResponse("image/png", null, bytes.inputStream())
        }
    }
}.getOrNull()

/** Small lock-free LRU of decoded tile bytes, capped so a long pan cannot grow the heap. */
private object tileCache {
    private const val MAX_ENTRIES = 256
    private val entries = object : LinkedHashMap<String, ByteArray>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?): Boolean =
            size > MAX_ENTRIES
    }

    operator fun get(key: String): ByteArray? = synchronized(entries) { entries[key] }

    fun put(key: String, value: ByteArray) {
        synchronized(entries) { entries[key] = value }
    }
}

private const val MAX_TILE_BYTES = 512 * 1024

private const val DHAKA_LAT = 23.8103
private const val DHAKA_LNG = 90.4125

/**
 * A map page that draws one pin and accepts no input.
 *
 * Deliberately not a variant of [mapPage]: that one installs `BsdcPin` so taps can move the
 * pin, and a read-only delivery address must not expose that surface at all.
 */
private fun viewMapPage(
    lat: Double,
    lng: Double,
    zoom: Int,
    interactive: Boolean,
    leafletJs: String,
    leafletCss: String,
    mapErrorText: String,
): String = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
$leafletCss

  html,body,#map{height:100%;margin:0;padding:0;background:#e5e3df;font-family:sans-serif}
  .leaflet-control-attribution{font-size:9px}
</style>
</head>
<body>
<div id="map"></div>
<div id="bsdc-map-error" style="display:none;position:absolute;inset:0;z-index:1000;background:#e5e3df;color:#374151;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:13px;line-height:1.45">
  $mapErrorText
</div>
<script>
$leafletJs
</script>
<script>
  var map = L.map('map', {
    zoomControl: true,
    dragging: ${if (interactive) "true" else "false"},
    scrollWheelZoom: ${if (interactive) "true" else "false"},
    tap: true
  }).setView([$lat, $lng], $zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map).on('tileerror', function () {
    var el = document.getElementById('bsdc-map-error');
    if (el) { el.style.display = 'flex'; }
  });
  L.marker([$lat, $lng]).addTo(map);
</script>
</body>
</html>
""".trimIndent()

/**
 * The page is generated here with numbers only, so nothing from the user reaches the HTML.
 * Leaflet is bundled in assets (BSD-2-Clause). Only OSM map tiles come from the network, over HTTPS.
 * OSM attribution is shown on the map.
 */
private fun mapPage(
    lat: Double,
    lng: Double,
    hasPin: Boolean,
    leafletJs: String,
    leafletCss: String,
    mapErrorText: String,
): String = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
$leafletCss

  html,body,#map{height:100%;margin:0;padding:0;background:#e5e3df;font-family:sans-serif}
  .leaflet-control-attribution{font-size:9px}
</style>
</head>
<body>
<div id="map"></div>
<div id="bsdc-map-error" style="display:none;position:absolute;inset:0;z-index:1000;background:#e5e3df;color:#374151;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:13px;line-height:1.45">
  $mapErrorText
</div>
<script>
$leafletJs
</script>
<script>
  var map = L.map('map', { zoomControl: true }).setView([$lat, $lng], ${if (hasPin) 16 else 13});
  var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  // A blank white canvas tells nobody anything. If tiles never arrive, say so on the map itself.
  var tileErrors = 0, tileOk = 0;
  tiles.on('tileerror', function () {
    tileErrors++;
    if (tileOk === 0 && tileErrors >= 4) {
      var box = document.getElementById('bsdc-map-error');
      if (box) { box.style.display = 'flex'; }
    }
  });
  tiles.on('tileload', function () {
    tileOk++;
    var box = document.getElementById('bsdc-map-error');
    if (box) { box.style.display = 'none'; }
  });
  var marker = null;
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
  map.on('click', function (e) {
    place(e.latlng.lat, e.latlng.lng);
    BsdcPin.pinChanged(e.latlng.lat, e.latlng.lng);
  });
  if (${if (hasPin) "true" else "false"}) { place($lat, $lng); }
</script>
</body>
</html>
""".trimIndent()
