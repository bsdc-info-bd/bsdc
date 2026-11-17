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
 */
class MkOsmTileHostTest {

    @Test
    fun bareTileHostIsATileRequest() {
        assertTrue(isOsmTileRequest("https", "tile.openstreetmap.org"))
    }

    @Test
    fun everyShardSubdomainIsATileRequest() {
        for (shard in listOf("a", "b", "c")) {
            assertTrue(isOsmTileRequest("https", "$shard.tile.openstreetmap.org"))
        }
    }

    @Test
    fun hostMatchingIsCaseInsensitiveAndToleratesPadding() {
        assertTrue(isOsmTileRequest("https", "A.Tile.OpenStreetMap.org "))
    }

    @Test
    fun lookalikeHostsAreRefused() {
        // A suffix test that forgot the dot would accept all of these.
        assertFalse(isOsmTileRequest("https", "eviltile.openstreetmap.org"))
        assertFalse(isOsmTileRequest("https", "tile.openstreetmap.org.evil.com"))
        assertFalse(isOsmTileRequest("https", "openstreetmap.org"))
        assertFalse(isOsmTileRequest("https", null))
    }

    @Test
    fun plainHttpTilesAreRefused() {
        assertFalse(isOsmTileRequest("http", "tile.openstreetmap.org"))
    }
}
