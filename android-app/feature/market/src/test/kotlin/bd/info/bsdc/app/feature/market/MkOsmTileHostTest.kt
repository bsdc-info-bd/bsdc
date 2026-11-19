package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The map's exact HTTPS tile-host allowlist, including OpenStreetMap's `a.`/`b.`/`c.` shards.
 *
 * The rule lives in [MkLogic] rather than beside the WebView that uses it, because a JVM unit
 * test cannot reach into a file that imports `android.webkit.WebView`.
 */
class MkOsmTileHostTest {

    @Test
    fun bareTileHostIsATileRequest() {
        assertTrue(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org"))
    }

    @Test
    fun everyShardSubdomainIsATileRequest() {
        for (shard in listOf("a", "b", "c")) {
            assertTrue(MkLogic.isOsmTileRequest("https", "$shard.tile.openstreetmap.org"))
        }
    }

    @Test
    fun hostMatchingIsCaseInsensitiveAndToleratesPadding() {
        assertTrue(MkLogic.isOsmTileRequest("https", "A.Tile.OpenStreetMap.org "))
    }

    @Test
    fun lookalikeHostsAreRefused() {
        // A suffix test that forgot the dot would accept all of these.
        assertFalse(MkLogic.isOsmTileRequest("https", "eviltile.openstreetmap.org"))
        assertFalse(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org.evil.com"))
        assertFalse(MkLogic.isOsmTileRequest("https", "openstreetmap.org"))
        assertFalse(MkLogic.isOsmTileRequest("https", null))
    }

    @Test
    fun plainHttpTilesAreRefused() {
        assertFalse(MkLogic.isOsmTileRequest("http", "tile.openstreetmap.org"))
    }
}
