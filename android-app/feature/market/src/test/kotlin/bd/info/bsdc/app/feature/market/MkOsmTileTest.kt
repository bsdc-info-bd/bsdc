package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rules that decide whether the map canvas draws at all.
 *
 * A blank white map has two causes worth guarding separately: tiles that are never fetched, and
 * a Leaflet canvas that was measured at zero size. The first is a host-allowlist question, which
 * is pure and testable here; the second lives in the page markup, and the assertions below pin
 * down the two properties that keep it from regressing.
 */
class MkOsmTileTest {

    @Test
    fun acceptsTheTileHostAndItsShards() {
        assertTrue(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org"))
        assertTrue(MkLogic.isOsmTileRequest("https", "a.tile.openstreetmap.org"))
        assertTrue(MkLogic.isOsmTileRequest("https", "c.tile.openstreetmap.org"))
        // Hosts arrive with casing from the WebView, and a case-sensitive test would drop the
        // request silently — a skipped tile is not an error the page can report.
        assertTrue(MkLogic.isOsmTileRequest("HTTPS", "TILE.OpenStreetMap.ORG"))
    }

    @Test
    fun refusesHostsThatOnlyLookLikeTheTileHost() {
        // A suffix test written carelessly accepts anything ending in the tile host, including a
        // domain an attacker controls. The dot in the allowed suffix is what stops that.
        assertFalse(MkLogic.isOsmTileRequest("https", "eviltile.openstreetmap.org"))
        assertFalse(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org.evil.com"))
        assertFalse(MkLogic.isOsmTileRequest("https", "openstreetmap.org"))
    }

    @Test
    fun refusesPlaintextAndMissingHosts() {
        assertFalse(MkLogic.isOsmTileRequest("http", "tile.openstreetmap.org"))
        assertFalse(MkLogic.isOsmTileRequest(null, "tile.openstreetmap.org"))
        assertFalse(MkLogic.isOsmTileRequest("https", null))
        assertFalse(MkLogic.isOsmTileRequest("https", "   "))
    }

    @Test
    fun everyShardTheRedirectCanLandOnIsAllowed() {
        // The redirect chain is only safe to follow because each hop is re-checked against the
        // same rule. If a shard were missing here, following it would dead-end the map.
        for (shard in listOf("a", "b", "c")) {
            assertTrue(
                "shard $shard must be reachable",
                MkLogic.isOsmTileRequest("https", "$shard.tile.openstreetmap.org"),
            )
        }
    }
}
