package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.AdEventKind
import bd.info.bsdc.app.core.model.AdLayout
import bd.info.bsdc.app.core.model.AdPlacement
import bd.info.bsdc.app.core.model.AdSafetyValidator
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BsdcAdsApiContractTest {

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun fetchServedAdsSendsAndroidPlatformTargetingAndDecodesCustomFields() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    [
                      {
                        "creative_id": "cr-101",
                        "campaign_id": "cmp-101",
                        "headline": "Kotlin Hiring Drive",
                        "body": "Join Dhaka engineering teams",
                        "image_url": "https://i.ibb.co/demo/full.webp",
                        "thumb_url": "https://i.ibb.co/demo/med.webp",
                        "image_alt": "Kotlin developer card",
                        "cta_label": "Apply now",
                        "target_url": "https://www.bsdc.info.bd/jobs",
                        "placement": "feed",
                        "layout": "banner",
                        "accent_color": "#15803d",
                        "badge_label": "Hiring"
                      }
                    ]
                    """.trimIndent(),
                ),
        )

        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = SupabaseRestClient(
            config = BsdcBackendConfig(baseUrl, "sb_publishable_demo", siteUrl = baseUrl),
            httpClient = BsdcHttpClientFactory.createKtorClient(),
            tokenProvider = { null },
        )

        val result = client.fetchServedAds(
            placement = AdPlacement.FEED,
            limit = 1,
            language = AppLanguage.BN,
            topic = "kotlin",
            city = "Dhaka",
            viewerToken = "android_viewer_token_123456",
        )

        assertTrue(result.isSuccess)
        val ads = result.getOrThrow()
        assertEquals(1, ads.size)
        val ad = ads.first()
        assertEquals("cr-101", ad.creativeId)
        assertEquals("https://i.ibb.co/demo/med.webp", ad.thumbUrl)
        assertEquals("Kotlin developer card", ad.imageAlt)
        assertEquals(AdLayout.BANNER, AdLayout.fromWire(ad.layout))
        assertEquals("#15803d", ad.accentColor)
        assertEquals("Hiring", ad.badgeLabel)

        val request = server.takeRequest()
        assertTrue(request.path.orEmpty().endsWith("/rest/v1/rpc/serve_ads"))
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"p_placement\":\"feed\""))
        assertTrue(body.contains("\"p_platform\":\"android\""))
        assertTrue(body.contains("\"p_language\":\"bn\""))
        assertTrue(body.contains("\"p_topic\":\"kotlin\""))
        assertTrue(body.contains("\"p_city\":\"Dhaka\""))
        assertTrue(body.contains("\"p_viewer_token\":\"android_viewer_token_123456\""))
    }

    @Test
    fun recordAdEventSendsViewerTokenAndParsesBooleanResult() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("true"))

        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = SupabaseRestClient(
            config = BsdcBackendConfig(baseUrl, "sb_publishable_demo", siteUrl = baseUrl),
            httpClient = BsdcHttpClientFactory.createKtorClient(),
            tokenProvider = { null },
        )

        val recorded = client.recordAdEvent(
            creativeId = "cr-101",
            kind = AdEventKind.IMPRESSION,
            viewerToken = "android_viewer_token_123456",
        )

        assertTrue(recorded.isSuccess)
        assertTrue(recorded.getOrThrow())

        val request = server.takeRequest()
        assertTrue(request.path.orEmpty().endsWith("/rest/v1/rpc/record_ad_event"))
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"p_creative_id\":\"cr-101\""))
        assertTrue(body.contains("\"p_kind\":\"impression\""))
        assertTrue(body.contains("\"p_viewer_token\":\"android_viewer_token_123456\""))
    }

    @Test
    fun adSafetyValidatorGuardsUrlsAndHexColors() {
        assertTrue(AdSafetyValidator.isSafeTargetUrl("https://www.bsdc.info.bd/jobs"))
        assertFalse(AdSafetyValidator.isSafeTargetUrl("http://example.com"))
        assertFalse(AdSafetyValidator.isSafeTargetUrl("javascript:alert(1)"))
        assertEquals("#15803d", AdSafetyValidator.sanitizeHexColor("#15803d"))
        assertNull(AdSafetyValidator.sanitizeHexColor("#fff"))
        assertNull(AdSafetyValidator.sanitizeHexColor("green"))
    }
}
