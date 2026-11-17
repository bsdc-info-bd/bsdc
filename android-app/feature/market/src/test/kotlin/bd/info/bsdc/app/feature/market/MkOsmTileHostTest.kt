package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The map's tile routing.
 *
 * A blank white map on Android came from a strict `host == "tile.openstreetmap.org"` check:
 * the page asks for that host, OSM answers by redirecting to its `a.`/`b.`/`c.` shards, and
 * every sharded tile was dropped. These cases pin both halves of the rule down.
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
