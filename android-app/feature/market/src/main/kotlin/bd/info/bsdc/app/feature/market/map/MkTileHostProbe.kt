package bd.info.bsdc.app.feature.market.map

import java.net.HttpURLConnection
import java.net.URL

/**
 * A reachability check for tile hosts, so provider failover is driven by evidence rather than hope.
 *
 * A map cannot read osmdroid's per-tile outcomes without replacing the library's downloader, and
 * replacing it is a larger change than this rewrite needs. So the app asks each provider one
 * question, once per map open: *is this host answering at all?* A tile that 404s still proves the
 * host is alive and serving, which is the only thing the cooldown rule in [ProviderHealth] needs to
 * know — an alive host that rate-limits us is a different problem with a different fix.
 *
 * One request per provider, four-second budget, no retry loop. If this probe were any more
 * ambitious it would be a second tile fetcher to audit, which is exactly what this rewrite deleted.
 */
internal object MkTileHostProbe {

    private const val CONNECT_TIMEOUT_MS = 4_000
    private const val READ_TIMEOUT_MS = 4_000

    /** A tile the probe asks for. A low zoom level, a tile every provider must have, never cached. */
    private const val PROBE_ZOOM = 1
    private const val PROBE_X = 1
    private const val PROBE_Y = 1

    /**
     * What an HTTP answer means for a provider's health.
     *
     * `true` means "reachable": anything the server actually answered with, including 404 and
     * 403 — a host that refuses us is up, and refusing is not a reason to stop drawing tiles from
     * it while its mirror is also down. Only transport failure (no connection at all, a timeout, a
     * TLS problem) counts against a host, and that is what `null` carries here.
     */
    fun isReachable(statusCode: Int): Boolean = statusCode in 200..599

    /**
     * Ask one provider whether it is serving. Never throws: an unreachable host is a result, not an
     * exception, and the caller has a map to draw either way.
     */
    fun probe(provider: BsdcTileProvider): Boolean {
        val url = provider.urlFor(PROBE_ZOOM, PROBE_X, PROBE_Y)
        if (!BsdcMapKit.isAllowedTileUrl(url)) return false
        return runCatching {
            val connection = (URL(url).openConnection() as? HttpURLConnection) ?: return false
            try {
                connection.requestMethod = "GET"
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.useCaches = false
                connection.instanceFollowRedirects = false
                val code = connection.responseCode
                // A redirect is an answer from the host, and the shard story is documented: OSM
                // may bounce the canonical host to a. / b. / c. That is reachability, not failure.
                isReachable(code) || isTileRedirect(code)
            } finally {
                connection.disconnect()
            }
        }.getOrDefault(false)
    }

    /** Same status set the deleted WebView fetcher treated as "follow it, it is fine". */
    private fun isTileRedirect(statusCode: Int): Boolean =
        statusCode == HttpURLConnection.HTTP_MOVED_PERM ||
            statusCode == HttpURLConnection.HTTP_MOVED_TEMP ||
            statusCode == HttpURLConnection.HTTP_SEE_OTHER ||
            statusCode == 307 ||
            statusCode == 308
}
