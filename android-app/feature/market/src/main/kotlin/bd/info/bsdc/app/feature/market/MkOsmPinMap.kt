package bd.info.bsdc.app.feature.market

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
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
    modifier: Modifier = Modifier,
) {
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
                // The map is a single page. Any link inside it stays where it is.
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = true

                    // OpenStreetMap refuses tile requests without an identifying User-Agent and Referer, which a
                    // WebView does not reliably send. Tiles are fetched here instead, and only from the tile host.
                    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                        val uri = request?.url ?: return null
                        if (uri.scheme != "https" || uri.host != OSM_TILE_HOST) return null
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

private const val OSM_TILE_HOST = "tile.openstreetmap.org"
private const val TILE_USER_AGENT = "BSDC-Android/1.0 (+https://www.bsdc.info.bd)"

/** Fetches one OSM tile with the app's identity. Runs on the WebView's background thread. Null means the tile is skipped. */
private fun fetchTile(url: String): WebResourceResponse? = runCatching {
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
        WebResourceResponse("image/png", "binary", connection.inputStream)
    }
}.getOrNull()

private const val DHAKA_LAT = 23.8103
private const val DHAKA_LNG = 90.4125

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
<script>
$leafletJs
</script>
<script>
  var map = L.map('map', { zoomControl: true }).setView([$lat, $lng], ${if (hasPin) 16 else 13});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  var marker = null;
  var radiusCircle = null;
  var PIN_ICON = L.divIcon({
    className: 'bsdc-pin',
    html: '<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#0f766e"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>',
    iconSize: [30, 40],
    iconAnchor: [15, 40]
  });
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
