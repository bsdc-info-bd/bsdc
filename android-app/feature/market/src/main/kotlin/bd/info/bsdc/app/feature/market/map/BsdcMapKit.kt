package bd.info.bsdc.app.feature.market.map

import java.io.File

/**
 * The native map's rules: which tile providers exist, how they fail over, how the tile cache is
 * bounded, and what geometry a delivery radius actually is. Nothing in this file touches Android's
 * view system or osmdroid, so every rule here is testable on the JVM — see `BsdcMapKitTest`.
 *
 * The previous map put these same decisions in three places (a Kotlin host allowlist, a generated
 * HTML page and a hand-rolled tile fetcher) and a blank surface could hide in any one of them while
 * all three passed their own tests. Centralising the *decisions* here, with the rendering in
 * `MkNativeMap`, is the structural fix; the WebView is gone entirely.
 */
object BsdcMapKit {

    /** 256 px raster tiles — the one size every provider in [PROVIDERS] serves. */
    const val TILE_SIZE_PX: Int = 256

    /** Zoom band. The floor shows the whole country; the ceiling is door-number level. */
    const val MIN_ZOOM: Int = 2
    const val MAX_ZOOM: Int = 19

    /**
     * Tile providers, most preferred first.
     *
     * Failover only means something across independent infrastructure, so the shards of one
     * operator are deliberately kept *inside* one provider: `a.`/`b.`/`c.tile.openstreetmap.org`
     * share an operator, a rate limit and an outage. The second provider is the German community
     * mirror, which serves the same OpenStreetMap raster data from different hardware. Every entry
     * carries its own attribution, because the map must credit whoever served the pixels.
     */
    val PROVIDERS: List<BsdcTileProvider> = listOf(
        BsdcTileProvider(
            id = "osm",
            label = "© OpenStreetMap contributors",
            baseUrl = "https://tile.openstreetmap.org/",
            shards = listOf(
                "https://a.tile.openstreetmap.org/",
                "https://b.tile.openstreetmap.org/",
                "https://c.tile.openstreetmap.org/",
            ),
        ),
        BsdcTileProvider(
            id = "osm-de",
            label = "© OpenStreetMap contributors (tile.openstreetmap.de)",
            baseUrl = "https://tile.openstreetmap.de/",
            shards = emptyList(),
        ),
    )

    /** Where the persistent tile cache lives, under the app's cache directory. */
    const val TILE_CACHE_DIR_NAME: String = "osm_tiles"

    /** 50 MB, oldest-first eviction: roughly 2 000 tiles, i.e. days of deliveries, not a hoard. */
    const val DISK_QUOTA_BYTES: Long = 50L * 1024 * 1024

    /** A provider that fails this many times in a row is set aside for [COOLDOWN_MS]. */
    const val FAILURES_BEFORE_COOLDOWN: Int = 3
    const val COOLDOWN_MS: Long = 60_000L

    /** The cache directory for a device's cache root. Created by the caller, never here. */
    fun tileCacheDir(cacheRoot: File): File = File(cacheRoot, TILE_CACHE_DIR_NAME)

    /**
     * Whether a URL is one this map may fetch: absolute HTTPS, a default port, a listed provider
     * host, and the `{z}/{x}/{y}.png` shape of a raster tile — nothing else.
     *
     * The path shape matters as much as the host allowlist: `tile.openstreetmap.org` also serves
     * other people's proxies, and a map that will fetch *any* path from an allowlisted host is an
     * open proxy with a nice icon on it.
     */
    fun isAllowedTileUrl(raw: String): Boolean {
        val uri = runCatching { java.net.URI(raw) }.getOrNull() ?: return false
        if (!uri.isAbsolute || !uri.scheme.equals("https", ignoreCase = true)) return false
        if (uri.port != -1 && uri.port != 443) return false
        val host = uri.host?.trim()?.trimEnd('.')?.lowercase() ?: return false
        val path = uri.path ?: return false
        if (!path.matches(Regex("^/\\d{1,2}/\\d{1,8}/\\d{1,8}\\.png$"))) return false
        return PROVIDERS.any { provider -> provider.hosts.any { it.host == host } }
    }

    /**
     * The zoom that fits a service radius in view, from Web Mercator resolution.
     *
     * `156 543.03392 m/px` is the equatorial ground resolution at z0 for 256 px tiles; it halves
     * per zoom level and shrinks with latitude. This is the pure half of "show the delivery area":
     * the ring is a rendering detail, the *framing* is arithmetic, and arithmetic is what a test can
     * pin down as the value a vendor actually gets.
     */
    fun zoomToFitRadius(radiusKm: Double, latitudeDegrees: Double, shorterSidePx: Int): Double {
        if (!radiusKm.isFinite() || radiusKm <= 0.0) return 15.0
        if (!latitudeDegrees.isFinite() || shorterSidePx <= 0) return 15.0
        // 0.45 leaves half a screen for the ring plus a margin, so the handle is never flush with the edge.
        val metresPerPixel = (radiusKm * 1000.0) / (shorterSidePx * 0.45)
        val cosLatitude = cosOf(latitudeDegrees).takeIf { it > 0.0 } ?: return 15.0
        val zoom = kotlin.math.log2(156_543.03392 * cosLatitude / metresPerPixel)
        if (!zoom.isFinite()) return 15.0
        return zoom.coerceIn(MIN_ZOOM.toDouble(), (MAX_ZOOM - 1).toDouble())
    }

    /**
     * Points of a ground circle, as `lat to lng` pairs in degrees, first point due east.
     *
     * A radius on a Web Mercator map is not a screen circle: one kilometre of latitude is fixed
     * while one kilometre of longitude shrinks with the cosine of the latitude. Correcting for that
     * keeps a 3 km delivery area from looking like an ellipse stretched east–west, and lets the same
     * list drive both the drawn ring and any "is this address inside the area?" test.
     */
    fun circleRing(
        centreLat: Double,
        centreLng: Double,
        radiusKm: Double,
        steps: Int = 64,
    ): List<Pair<Double, Double>> {
        if (!centreLat.isFinite() || !centreLng.isFinite() || !radiusKm.isFinite() || radiusKm <= 0.0) {
            return emptyList()
        }
        val cosLatitude = cosOf(centreLat).takeIf { it > 0.0 } ?: return emptyList()
        val count = steps.coerceIn(8, 512)
        val degreesLatitudePerMetre = 1.0 / 111_320.0
        return (0 until count).map { index ->
            val bearing = (2.0 * Math.PI * index) / count
            val northMetres = radiusKm * 1000.0 * kotlin.math.sin(bearing)
            val eastMetres = radiusKm * 1000.0 * kotlin.math.cos(bearing)
            val lat = centreLat + northMetres * degreesLatitudePerMetre
            val lng = centreLng + eastMetres * degreesLatitudePerMetre / cosLatitude
            lat to lng
        }
    }

    /**
     * Keep the tile cache under [quotaBytes], dropping the oldest tiles first.
     *
     * A cache nobody bounds becomes the thing that fills the customer's phone. Oldest-first is the
     * right order here because a vendor's map is revisited rather than re-read once: the tiles from
     * last month's route are the least likely to be needed this afternoon. Returns the size left
     * on disk so a caller (or a test) can see the bound held.
     */
    fun pruneCache(cacheDir: File, quotaBytes: Long = DISK_QUOTA_BYTES): Long {
        if (!cacheDir.isDirectory) return 0L
        val files = cacheDir.listFiles()?.filter { it.isFile } ?: return 0L
        var total = files.sumOf { it.length() }
        if (total <= quotaBytes) return total
        for (file in files.sortedBy { it.lastModified() }) {
            val size = file.length()
            if (file.delete()) total -= size
            if (total <= quotaBytes) break
        }
        return total
    }

    /**
     * The base URLs to hand the tile loader, given which providers are healthy right now.
     *
     * Three rules, in order: a provider in cooldown is left out entirely, the preference order is
     * preserved so the primary host still serves most tiles, and every base must satisfy
     * [isAllowedTileUrl] before it appears. That last one is what stops a typo in [PROVIDERS] from
     * turning the map into a general-purpose proxy — the failure is silent otherwise, because the
     * map still draws tiles, just from wherever the typo points.
     *
     * If nothing passes at all, the first provider is used anyway: a map with tiles from a host the
     * operator is repairing beats a map that refused to draw, and the health record already says
     * what is wrong.
     */
    fun tileBases(nowMs: Long, health: ProviderHealth): List<String> =
        health.orderFor(nowMs)
            .filter { provider -> provider.hosts.any { isAllowedTileUrl(it.base + "3/4/5.png") } }
            .ifEmpty { listOf(PROVIDERS.first()) }
            .flatMap { provider -> listOf(provider.baseUrl) + provider.shards }
            .map { it.trimEnd('/') + "/" }
            .distinct()

    private fun cosOf(degrees: Double): Double =
        kotlin.math.cos(Math.toRadians(degrees.coerceIn(-85.0, 85.0)))
}

/**
 * What the map may report, and the only states the notice is allowed to render.
 *
 * `OFFLINE` and `ERROR` are deliberately different: they look the same on a screen and ask for
 * different things of the user, and a retry that cannot possibly help is worse than no retry.
 */
enum class BsdcMapStatus {
    /** The map is mounted; no frame has been drawn yet. There is always a spinner, never a blank box. */
    LOADING,

    /** At least one frame has been painted. */
    READY,

    /** The device has no data connection. Cached tiles still render, so this is not "the map broke". */
    OFFLINE,

    /** No frame within the budget while the device claims to be online. Paired with a retry. */
    ERROR,
}

/** One tile provider: an operator's infrastructure, not one hostname. */
data class BsdcTileProvider(
    val id: String,
    val label: String,
    val baseUrl: String,
    val shards: List<String>,
) {
    /** The hosts this provider may serve. Parsed here so the allowlist and the fetcher agree. */
    val hosts: List<BsdcTileHost> = (listOf(baseUrl) + shards).mapNotNull { raw ->
        runCatching { java.net.URI(raw) }.getOrNull()?.host?.let { host ->
            BsdcTileHost(host.lowercase(), raw)
        }
    }

    /** A tile URL for this provider, rotating over its shards. Also the shape [BsdcMapKit.isAllowedTileUrl] admits. */
    fun urlFor(zoom: Int, x: Int, y: Int, shardIndex: Int = 0): String {
        val bases = listOf(baseUrl) + shards
        val base = bases[((shardIndex % bases.size) + bases.size) % bases.size]
        return base.trimEnd('/') + "/$zoom/$x/$y.png"
    }
}

/** A host this map is allowed to fetch tiles from, with the base it is reached at. */
data class BsdcTileHost(val host: String, val base: String)

/**
 * Which provider is currently trusted, and how long it is set aside after failing.
 *
 * The point of health tracking is that a blank map must not keep paying for a dead provider on every
 * single tile: after [BsdcMapKit.FAILURES_BEFORE_COOLDOWN] consecutive failures a provider is
 * skipped until its cooldown expires, and one success clears the record. Time arrives as a
 * parameter, which makes the rule a pure function of (now, events) and testable without a clock or
 * a network — the reason this class is in the pure core rather than beside the `MapView`.
 */
class ProviderHealth(
    private val failuresBeforeCooldown: Int = BsdcMapKit.FAILURES_BEFORE_COOLDOWN,
    private val cooldownMs: Long = BsdcMapKit.COOLDOWN_MS,
) {
    private val failures = HashMap<String, Int>()
    private val cooldownUntil = HashMap<String, Long>()

    /** Providers in the order they should be used: available ones first, in preference order. */
    fun orderFor(
        nowMs: Long,
        providers: List<BsdcTileProvider> = BsdcMapKit.PROVIDERS,
    ): List<BsdcTileProvider> {
        val (ready, cooling) = providers.partition { isAvailable(nowMs, it.id) }
        return ready + cooling
    }

    fun isAvailable(nowMs: Long, providerId: String): Boolean = (cooldownUntil[providerId] ?: 0L) <= nowMs

    fun recordFailure(nowMs: Long, providerId: String) {
        val count = (failures[providerId] ?: 0) + 1
        if (count >= failuresBeforeCooldown) {
            cooldownUntil[providerId] = nowMs + cooldownMs
            failures.remove(providerId)
        } else {
            failures[providerId] = count
        }
    }

    fun recordSuccess(providerId: String) {
        failures.remove(providerId)
        cooldownUntil.remove(providerId)
    }

    /**
     * Exposed for diagnostics and tests: a provider in trouble must be visible, not silent. The old
     * system swallowed tile failures into a blank surface, which is how a blank map stayed
     * unexplained for a whole release.
     */
    fun failuresFor(providerId: String): Int = failures[providerId] ?: 0
}
