package bd.info.bsdc.app.feature.market.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import kotlin.math.cos
import kotlin.math.roundToInt

/**
 * The native map's rules, on the JVM. No device, no emulator, no network: that is the whole point of
 * keeping selection, health, cache bounds and geometry in [BsdcMapKit] instead of in a `View`.
 *
 * These tests are also the reason the rewrite is safe to land without one: the blank-map failure this
 * project is fixing was never about drawing, it was about a *rule* drifting somewhere nobody was
 * looking. Rules are what a unit test can hold.
 */
class BsdcMapKitTest {

    @Test
    fun everyProviderUrlIsAnAllowedTileUrl() {
        for (provider in BsdcMapKit.PROVIDERS) {
            for (shard in provider.shards.indices) {
                val url = provider.urlFor(zoom = 13, x = 6153, y = 3537, shardIndex = shard)
                assertTrue("provider ${provider.id} shard $shard must be allowed: $url", BsdcMapKit.isAllowedTileUrl(url))
            }
            val canonical = provider.urlFor(0, 0, 0)
            assertTrue("canonical base must be allowed: $canonical", BsdcMapKit.isAllowedTileUrl(canonical))
        }
    }

    @Test
    fun tileUrlsRotateOverShardsAndWrapAround() {
        val osm = BsdcMapKit.PROVIDERS.first { it.id == "osm" }
        assertEquals(3, osm.shards.size)
        val hosts = (0 until 6).map { index ->
            osm.urlFor(5, 16, 10, shardIndex = index).substringAfter("://").substringBefore('/')
        }
        assertEquals(listOf("a.", "b.", "c.", "a.", "b.", "c."), hosts.map { it.removeSuffix(".tile.openstreetmap.org") })
    }

    @Test
    fun theAllowlistRefusesEverythingThatIsNotATile() {
        val good = "https://tile.openstreetmap.org/13/6153/3537.png"
        assertTrue(BsdcMapKit.isAllowedTileUrl(good))
        listOf(
            "http://tile.openstreetmap.org/13/6153/3537.png",
            "https://tile.openstreetmap.org:8443/13/6153/3537.png",
            "https://tile.openstreetmap.org/13/6153/3537.json",
            "https://tile.openstreetmap.org/13/6153/3537.png/extra",
            "https://tile.openstreetmap.org/../secret",
            "https://tile.openstreetmap.org/13/6153/../9.png",
            "https://tile.openstreetmap.org.evil.example/13/6153/3537.png",
            "https://evil.example/13/6153/3537.png",
            "not a url",
            "",
        ).forEach { refused ->
            assertFalse("must be refused: $refused", BsdcMapKit.isAllowedTileUrl(refused))
        }
    }

    @Test
    fun aCoolingProviderIsLeftOutOfTheBaseListButTheListNeverEmpties() {
        val health = ProviderHealth()
        val before = BsdcMapKit.tileBases(nowMs = 1_000L, health = health)
        assertTrue("every provider's canonical base must be present", before.contains("https://tile.openstreetmap.org/"))
        assertTrue(before.contains("https://tile.openstreetmap.de/"))

        // The engine's own policy: one failed probe is enough to set a provider aside.
        val strict = ProviderHealth(failuresBeforeCooldown = 1, cooldownMs = 120_000L)
        strict.recordFailure(nowMs = 2_000L, providerId = "osm-de")
        val after = BsdcMapKit.tileBases(nowMs = 2_000L, health = strict)
        assertFalse("the cooling mirror must be dropped", after.contains("https://tile.openstreetmap.de/"))
        assertTrue("the primary must stay", after.contains("https://tile.openstreetmap.org/"))

        strict.recordFailure(nowMs = 2_000L, providerId = "osm")
        val cooling = BsdcMapKit.tileBases(nowMs = 2_000L, health = strict)
        assertEquals(
            "when nothing is healthy the map still draws from the first provider",
            listOf("https://tile.openstreetmap.org/", "https://a.tile.openstreetmap.org/", "https://b.tile.openstreetmap.org/", "https://c.tile.openstreetmap.org/"),
            cooling,
        )
    }

    @Test
    fun healthNeedsThreeStrikesHoldsTheCooldownAndClearsOnSuccess() {
        val health = ProviderHealth()
        val id = "osm"
        repeat(BsdcMapKit.FAILURES_BEFORE_COOLDOWN - 1) { attempt ->
            health.recordFailure(nowMs = 10_000L, providerId = id)
            assertTrue(
                "strike ${attempt + 1} of ${BsdcMapKit.FAILURES_BEFORE_COOLDOWN} must not cool a provider",
                health.isAvailable(10_000L, id),
            )
        }
        assertEquals(BsdcMapKit.FAILURES_BEFORE_COOLDOWN - 1, health.failuresFor(id))
        health.recordFailure(nowMs = 10_000L, providerId = id)
        assertFalse("the third strike must set the provider aside", health.isAvailable(10_000L, id))
        assertFalse(health.isAvailable(10_000L + BsdcMapKit.COOLDOWN_MS - 1L, id))
        assertTrue("the cooldown must expire", health.isAvailable(10_000L + BsdcMapKit.COOLDOWN_MS, id))
        assertEquals(0, health.failuresFor(id))
    }

    @Test
    fun oneSuccessEndsTheTrouble() {
        val health = ProviderHealth()
        repeat(BsdcMapKit.FAILURES_BEFORE_COOLDOWN - 1) { health.recordFailure(1_000L, "osm") }
        health.recordSuccess("osm")
        assertEquals(0, health.failuresFor("osm"))
        assertTrue(health.isAvailable(1_000L, "osm"))
        val order = health.orderFor(1_000L)
        assertEquals("preference order must survive a clean bill of health", BsdcMapKit.PROVIDERS, order)
    }

    @Test
    fun coolingProvidersAreDemotedNotDeleted() {
        val health = ProviderHealth(failuresBeforeCooldown = 1, cooldownMs = 60_000L)
        health.recordFailure(0L, "osm")
        val order = health.orderFor(nowMs = 1_000L)
        assertEquals(listOf("osm-de", "osm"), order.map { it.id })
    }

    @Test
    fun zoomToFitIsMonotonicAndStaysInsideTheBand() {
        val dhaka = 23.8103
        var previous = Double.MAX_VALUE
        for (radius in listOf(1.0, 3.0, 10.0, 30.0, 100.0)) {
            val zoom = BsdcMapKit.zoomToFitRadius(radius, dhaka, 690)
            assertTrue(
                "a bigger area must not zoom in ($radius km -> $zoom)",
                zoom < previous || zoom == BsdcMapKit.MIN_ZOOM.toDouble(),
            )
            assertTrue(
                "zoom must stay in the tile band",
                zoom in BsdcMapKit.MIN_ZOOM.toDouble()..(BsdcMapKit.MAX_ZOOM - 1).toDouble(),
            )
            previous = zoom
        }
    }

    @Test
    fun aThreeKilometreAreaFillsA230dpCardAtStreetLevel() {
        // 230 dp at density 3.0 is 690 px; a 3 km radius should land in the 13–14 band, i.e. the
        // level where a vendor can still read the neighbourhood names around the area.
        val zoom = BsdcMapKit.zoomToFitRadius(radiusKm = 3.0, latitudeDegrees = 23.8103, shorterSidePx = 690)
        assertTrue("expected 13–15, was $zoom", zoom in 13.0..15.0)
    }

    @Test
    fun junkGeometryFallsBackToAUsefulZoomInsteadOfCrankingTheMap() {
        listOf(
            Triple(Double.NaN, 23.8, 690),
            Triple(0.0, 23.8, 690),
            Triple(-5.0, 23.8, 690),
            Triple(3.0, Double.NaN, 690),
            Triple(3.0, 23.8, 0),
            Triple(3.0, 23.8, -100),
        ).forEach { (radius, latitude, side) ->
            assertEquals(15.0, BsdcMapKit.zoomToFitRadius(radius, latitude, side), 1e-9)
        }
    }

    @Test
    fun theRingIsAConstantGroundDistanceFromItsCentre() {
        val centreLat = 23.8103
        val centreLng = 90.4125
        val radiusKm = 7.5
        val ring = BsdcMapKit.circleRing(centreLat, centreLng, radiusKm, steps = 64)
        assertEquals(64, ring.size)
        ring.forEach { (lat, lng) ->
            val metres = haversineKm(centreLat, centreLng, lat, lng) * 1000.0
            assertTrue(
                "point ($lat,$lng) is ${metres.roundToInt()} m from the centre, want ${radiusKm * 1000} m",
                kotlin.math.abs(metres - radiusKm * 1000.0) < 120.0,
            )
        }
    }

    @Test
    fun theRingIsNotAFlattenedEllipse() {
        // The failure this guards: treating degrees as metres makes the east–west extent blow up by
        // 1/cos(latitude), so the ring reaches ~5 km east while going 3 km north. At Dhaka's latitude
        // that error is ~9%, which is visible and which no amount of ring-smoothing can hide.
        val ring = BsdcMapKit.circleRing(centreLat = 23.8103, centreLng = 90.4125, radiusKm = 3.0)
        val east = ring.first()
        val north = ring[ring.size / 4]
        val eastLat = 23.8103
        val northLng = 90.4125
        assertEquals("the east point must sit on the centre's latitude", eastLat, east.first, 1e-9)
        assertEquals("the north point must sit on the centre's longitude", northLng, north.second, 1e-9)
        val eastKm = haversineKm(eastLat, 90.4125, east.first, east.second)
        val northKm = haversineKm(eastLat, 90.4125, north.first, north.second)
        assertEquals(eastKm, northKm, 0.02)
        assertTrue("and both must really be 3 km", eastKm in 2.95..3.05 && northKm in 2.95..3.05)
    }

    @Test
    fun aDegenerateRingIsNoRingAtAll() {
        assertTrue(BsdcMapKit.circleRing(Double.NaN, 90.0, 3.0).isEmpty())
        assertTrue(BsdcMapKit.circleRing(23.8, Double.POSITIVE_INFINITY, 3.0).isEmpty())
        assertTrue(BsdcMapKit.circleRing(23.8, 90.4, 0.0).isEmpty())
        assertTrue(BsdcMapKit.circleRing(23.8, 90.4, -2.0).isEmpty())
    }

    @Test
    fun pruningKeepsTheNewestTilesUnderTheQuota() {
        val dir = File(createTempDir(), "osm_tiles")
        check(dir.mkdirs())
        // Five 1 KiB tiles, oldest first.
        val files = (0 until 5).map { index ->
            File(dir, "tile-$index.png").apply {
                writeBytes(ByteArray(1024))
                setLastModified(1_000L + index * 1_000L)
            }
        }
        val remaining = BsdcMapKit.pruneCache(dir, quotaBytes = 2 * 1024L)
        assertTrue("cache must fit the quota, was $remaining bytes", remaining <= 2 * 1024L)
        val survivors = dir.listFiles()?.map { it.name }?.sorted() ?: emptyList()
        assertEquals(
            "the two newest tiles are the ones to keep",
            listOf("tile-3.png", "tile-4.png"),
            survivors,
        )
        files.forEach { assertTrue(!it.exists() || it.length() == 1024L) }
    }

    @Test
    fun aCacheUnderTheQuotaIsLeftAlone() {
        val dir = File(createTempDir(), "osm_tiles")
        check(dir.mkdirs())
        val keep = File(dir, "only.png").apply { writeBytes(ByteArray(2048)) }
        val remaining = BsdcMapKit.pruneCache(dir, quotaBytes = 4096L)
        assertEquals(2048L, remaining)
        assertTrue(keep.exists())
        assertEquals(0L, BsdcMapKit.pruneCache(File(dir, "never-created"), 1L))
    }

    @Test
    fun aHostThatAnswersIsReachableEvenWhenItRefuses() {
        // A 404 or a 403 is the host being alive; only the absence of an answer is a strike. A
        // health rule that punished refusals would retire a rate-limiting mirror that is still the
        // best source available, which is the opposite of failover.
        assertTrue(MkTileHostProbe.isReachable(200))
        assertTrue(MkTileHostProbe.isReachable(304))
        assertTrue(MkTileHostProbe.isReachable(404))
        assertTrue(MkTileHostProbe.isReachable(HttpURLConnection.HTTP_FORBIDDEN))
        assertTrue(MkTileHostProbe.isReachable(500))
        assertFalse(MkTileHostProbe.isReachable(0))
        assertFalse(MkTileHostProbe.isReachable(-1))
        assertFalse(MkTileHostProbe.isReachable(1000))
    }

    @Test
    fun theTileCacheIsNamedWhereTheRendererLooks() {
        val dir = BsdcMapKit.tileCacheDir(File("/data/data/bd.info.bsdc.app/cache"))
        assertEquals(
            File("/data/data/bd.info.bsdc.app/cache/osm_tiles").path,
            dir.path,
        )
        assertEquals(BsdcMapKit.TILE_CACHE_DIR_NAME, dir.name)
    }

    /**
     * Haversine, written independently of [BsdcMapKit.circleRing].
     *
     * A ring test that measures the ring with the same formula that drew it proves nothing; this one
     * uses the spherical law of haversines on the mean Earth radius, so it catches a wrong degrees
     * conversion rather than restating it.
     */
    private fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val earthRadiusKm = 6371.0088
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val h = sin2(dLat / 2.0) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin2(dLng / 2.0)
        return 2.0 * earthRadiusKm * kotlin.math.asin(kotlin.math.sqrt(h.coerceIn(0.0, 1.0)))
    }

    private fun sin2(x: Double): Double = kotlin.math.sin(x).let { it * it }

    private fun createTempDir(): File =
        File(System.getProperty("java.io.tmpdir"), "bsdc-map-${System.nanoTime()}").apply { mkdirs() }
}
