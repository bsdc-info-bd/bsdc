package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Google Maps hand-off.
 *
 * The vendor order card used to leave the app for openstreetmap.org, which lost the order and
 * needed a browser. The replacement is a key-free `maps/dir/?api=1` link, and it has to be
 * exactly right: a malformed destination opens Maps at the wrong place, which for a delivery
 * address is worse than no link at all.
 */
class MkMapsLinkTest {

    @Test
    fun buildsTheKeyFreeDirectionsLink() {
        assertEquals(
            "https://www.google.com/maps/dir/?api=1&destination=23.810300,90.412500",
            MkLogic.googleMapsDirectionsUrl(23.8103, 90.4125),
        )
    }

    @Test
    fun sixDecimalsSeparateAddressesAboutElevenCentimetresApart() {
        // 1e-6 degrees is about 11 cm. Six decimals is the finest resolution the link keeps,
        // and two points that differ at that scale must not collapse onto one destination.
        val a = MkLogic.googleMapsDirectionsUrl(23.810301, 90.412500)
        val b = MkLogic.googleMapsDirectionsUrl(23.810302, 90.412500)
        assertFalse(a == b)
        assertTrue(a.endsWith("destination=23.810301,90.412500"))
        assertTrue(b.endsWith("destination=23.810302,90.412500"))
    }

    @Test
    fun roundsRatherThanTruncatesAtTheSixthDecimal() {
        // 23.8103009 is 23.810301, not 23.810300: the formatter rounds, so a pin is never
        // pulled backwards by truncation.
        assertTrue(
            MkLogic.googleMapsDirectionsUrl(23.8103009, 90.4125009)
                .endsWith("destination=23.810301,90.412501"),
        )
    }

    @Test
    fun usesADotEvenWhereTheLocaleWouldUseAComma() {
        // `%.6f` on a device set to a comma-decimal locale would produce "23,810300", and
        // Google Maps reads that as two destinations. The formatter pins Locale.ROOT.
        val url = MkLogic.googleMapsDirectionsUrl(23.8103, 90.4125)
        assertFalse(url.contains("23,810300"))
        assertTrue(url.contains("23.810300,90.412500"))
    }

    @Test
    fun refusesCoordinatesThatAreNotNumbers() {
        // A broken row must not produce "destination=NaN,NaN" as a tappable link.
        assertEquals("", MkLogic.googleMapsDirectionsUrl(Double.NaN, 90.4))
        assertEquals("", MkLogic.googleMapsDirectionsUrl(23.8, Double.POSITIVE_INFINITY))
    }

    @Test
    fun handlesTheSouthernAndWesternHemispheres() {
        // The maths must not assume Bangladesh. A negative longitude keeps its sign.
        val url = MkLogic.googleMapsDirectionsUrl(-33.868820, 151.209290)
        assertTrue(url.endsWith("destination=-33.868820,151.209290"))
    }

    @Test
    fun theLinkNeedsNoApiKey() {
        val url = MkLogic.googleMapsDirectionsUrl(23.8103, 90.4125)
        assertFalse(url.contains("key="))
        assertTrue(url.startsWith("https://"))
        assertTrue(url.contains("api=1"))
    }
}
