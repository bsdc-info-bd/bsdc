package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.BsdcBackendConfig
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

@Serializable
private data class NullCoercionProbeDto(
    val id: String = "",
    val title: String = "",
    @SerialName("budget_min") val budgetMin: Int? = null,
    @SerialName("budget_max") val budgetMax: Int? = null,
    @SerialName("duration_days") val durationDays: Int = 7,
    val currency: String = "BDT",
    val skills: List<String> = emptyList(),
)

class SupabaseRestClientContractTest {

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
    fun modernPublishableKeyOmitsAuthorizationHeaderWhenAnonymous() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("[]"))
        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(
            supabaseUrl = baseUrl,
            supabasePublishableKey = "sb_publishable_example_key",
            siteUrl = baseUrl,
        )
        val client = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient()) { null }

        client.rpcText("feed_candidates", requireAuth = false)

        val recorded = server.takeRequest()
        assertEquals("sb_publishable_example_key", recorded.getHeader("apikey"))
        assertNull(
            "sb_publishable_* must never be sent as Bearer JWT",
            recorded.getHeader("Authorization"),
        )
    }

    @Test
    fun legacyAnonJwtSetsBothApikeyAndBearerWhenAnonymous() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("[]"))
        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(
            supabaseUrl = baseUrl,
            supabasePublishableKey = "legacy-anon-jwt",
            siteUrl = baseUrl,
        )
        val client = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient()) { null }

        client.rpcText("feed_candidates", requireAuth = false)

        val recorded = server.takeRequest()
        assertEquals("legacy-anon-jwt", recorded.getHeader("apikey"))
        assertEquals("Bearer legacy-anon-jwt", recorded.getHeader("Authorization"))
    }

    @Test
    fun authenticatedRequestsAlwaysCarryMemberFirebaseJwtEvenWithPublishableKey() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("[]"))
        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(
            supabaseUrl = baseUrl,
            supabasePublishableKey = "sb_publishable_example_key",
            siteUrl = baseUrl,
        )
        val client = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient()) { "firebase-jwt-123" }

        client.getJsonText("profiles", requireAuth = true)

        val recorded = server.takeRequest()
        assertEquals("sb_publishable_example_key", recorded.getHeader("apikey"))
        assertEquals("Bearer firebase-jwt-123", recorded.getHeader("Authorization"))
    }

    @Test
    fun unconfiguredBuildThrows503SupabaseException() = runTest {
        val config = BsdcBackendConfig(supabaseUrl = "", supabasePublishableKey = "")
        val client = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient()) { null }

        try {
            client.getJsonText("posts", requireAuth = false)
            fail("Expected SupabaseApiException for unconfigured build")
        } catch (err: SupabaseApiException) {
            assertEquals(503, err.statusCode)
            assertEquals("Supabase is not configured in this build", err.message)
        }
    }

    @Test
    fun wakePushNowPostsBearerTokenToSiteApiPushWake() = runTest {
        server.enqueue(MockResponse().setResponseCode(202).setBody("{\"ok\":true}"))
        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(
            supabaseUrl = baseUrl,
            supabasePublishableKey = "sb_publishable_example_key",
            siteUrl = baseUrl,
        )
        val client = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient()) { "firebase-jwt-wake" }

        val ok = client.wakePushNow("comment")

        assertEquals(true, ok)
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/api/push/wake", recorded.path)
        assertEquals("Bearer firebase-jwt-wake", recorded.getHeader("Authorization"))
    }

    @Test
    fun sharedJsonCoercesNullNumericTextAndArrayColumnsFromPostgrest() {
        val raw = """[{"id":"gig-1","title":"Build Android app\nwebsite","budget_min":null,"budget_max":null,"currency":null,"duration_days":null,"skills":null}]"""
        val decoded = BsdcHttpClientFactory.sharedJson.decodeFromString<List<NullCoercionProbeDto>>(raw)
        assertEquals(1, decoded.size)
        val first = decoded.first()
        assertEquals("gig-1", first.id)
        assertNull(first.budgetMin)
        assertNull(first.budgetMax)
        assertEquals(7, first.durationDays)
        assertEquals("BDT", first.currency)
        assertEquals(emptyList<String>(), first.skills)
    }
}
