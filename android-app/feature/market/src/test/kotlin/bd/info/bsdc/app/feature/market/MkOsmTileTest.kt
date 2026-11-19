package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure security and status rules around the WebView map.
 *
 * The bundled Leaflet routes, HTTPS OSM allowlist, shard redirects, and the tile-event status
 * protocol are all kept independent of Android WebView so the contract can be unit tested here.
 * A real WebView/device check is still needed for rendering and touch behavior.
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
        assertFalse(MkLogic.isOsmTileRequest("https", "not-an-osm-shard.tile.openstreetmap.org"))
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
    fun refusesNonstandardPortsEvenWhenTheHostnameIsAllowed() {
        assertTrue(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org", 443))
        assertTrue(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org", -1))
        assertFalse(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org", 8443))
        assertFalse(MkLogic.isOsmTileRequest("https", "tile.openstreetmap.org", 80))
    }

    @Test
    fun onlyExactBundledLeafletAssetsUseTheVirtualSiteOrigin() {
        assertTrue(
            MkLogic.isOsmMapAssetRequest(
                "https",
                "WWW.BSDC.INFO.BD",
                MkLogic.OSM_MAP_JS_PATH,
                "www.bsdc.info.bd",
            ),
        )
        assertTrue(
            MkLogic.isOsmMapAssetRequest(
                "https",
                "www.bsdc.info.bd",
                MkLogic.OSM_MAP_CSS_PATH,
                "www.bsdc.info.bd",
                443,
            ),
        )
        assertFalse(
            MkLogic.isOsmMapAssetRequest(
                "http",
                "www.bsdc.info.bd",
                MkLogic.OSM_MAP_JS_PATH,
                "www.bsdc.info.bd",
            ),
        )
        assertFalse(
            MkLogic.isOsmMapAssetRequest(
                "https",
                "www.bsdc.info.bd.evil.example",
                MkLogic.OSM_MAP_JS_PATH,
                "www.bsdc.info.bd",
            ),
        )
        assertFalse(
            MkLogic.isOsmMapAssetRequest(
                "https",
                "www.bsdc.info.bd",
                "/__bsdc_map/other.js",
                "www.bsdc.info.bd",
            ),
        )
        assertFalse(
            MkLogic.isOsmMapAssetRequest(
                "https",
                "www.bsdc.info.bd",
                MkLogic.OSM_MAP_JS_PATH,
                "www.bsdc.info.bd",
                8443,
            ),
        )
    }

    @Test
    fun resourceClassifierAllowsOnlyLeafletAssetsAndOsmTiles() {
        assertEquals(
            OsmMapResource.LEAFLET_JS,
            MkLogic.classifyOsmMapResource(
                "https",
                "www.bsdc.info.bd",
                MkLogic.OSM_MAP_JS_PATH,
                "www.bsdc.info.bd",
            ),
        )
        assertEquals(
            OsmMapResource.LEAFLET_CSS,
            MkLogic.classifyOsmMapResource(
                "https",
                "www.bsdc.info.bd",
                MkLogic.OSM_MAP_CSS_PATH,
                "www.bsdc.info.bd",
            ),
        )
        assertEquals(
            OsmMapResource.OSM_TILE,
            MkLogic.classifyOsmMapResource(
                "https",
                "b.tile.openstreetmap.org",
                "/15/27525/15571.png",
                "www.bsdc.info.bd",
            ),
        )
        assertEquals(
            OsmMapResource.BLOCKED,
            MkLogic.classifyOsmMapResource(
                "https",
                "tiles.evil.example",
                "/15/27525/15571.png",
                "www.bsdc.info.bd",
            ),
        )
        assertEquals(
            OsmMapResource.BLOCKED,
            MkLogic.classifyOsmMapResource(
                "http",
                "tile.openstreetmap.org",
                "/15/27525/15571.png",
                "www.bsdc.info.bd",
            ),
        )
    }

    @Test
    fun firstTileFailureSurfacesAnErrorButOneGoodTileClearsIt() {
        assertEquals(
            OsmMapStatus.ERROR,
            MkLogic.osmMapStatusFromConsoleMessage("[BSDC_MAP] tileerror ok=0 errors=1"),
        )
        assertEquals(
            OsmMapStatus.READY,
            MkLogic.osmMapStatusFromConsoleMessage("[BSDC_MAP] tileload ok=1 errors=1"),
        )
        assertNull(MkLogic.osmMapStatusFromConsoleMessage("[BSDC_MAP] tileerror ok=2 errors=3"))
        assertNull(MkLogic.osmMapStatusFromConsoleMessage("other console output"))
        assertNull(MkLogic.osmMapStatusFromConsoleMessage("[BSDC_MAP] tileerror ok=x errors=1"))
    }
}
