package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.BsdcRole
import bd.info.bsdc.app.core.model.ProfileDraft
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BsdcPlatformApiContractTest {

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
    fun reverseGeocodeRoundsCoordinatesToTwoDecimalsBeforeSending() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"place":"Dhaka, Bangladesh","latitude":23.81,"longitude":90.41}"""),
        )
        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(
            supabaseUrl = baseUrl,
            supabasePublishableKey = "anon-key",
            siteUrl = baseUrl,
        )
        val http = BsdcHttpClientFactory.createKtorClient()
        val api = BsdcPlatformApi(config, http, SupabaseRestClient(config, http) { "jwt" })

        val result = api.reverseGeocode(23.814999, 90.412512, AppLanguage.EN)
        assertEquals("Dhaka, Bangladesh", result.place)

        val recorded = server.takeRequest()
        assertEquals("/api/geo/reverse", recorded.path)
        val sentJson = BsdcHttpClientFactory.sharedJson.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("23.81", sentJson["latitude"]!!.jsonPrimitive.content)
        assertEquals("90.41", sentJson["longitude"]!!.jsonPrimitive.content)
        assertEquals("en", sentJson["language"]!!.jsonPrimitive.content)
    }

    @Test
    fun saveOnboardingProfileOmitsDatabaseOwnedColumnsAndCallsClaimUsername() = runTest {
        server.enqueue(MockResponse().setResponseCode(201).setBody(""))
        server.enqueue(MockResponse().setResponseCode(204).setBody(""))
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"uid":"uid-1","username":"tasnim_bd","display_name":"Tasnim","onboarding_complete":true}"""),
        )

        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(
            supabaseUrl = baseUrl,
            supabasePublishableKey = "anon-key",
            siteUrl = baseUrl,
        )
        val http = BsdcHttpClientFactory.createKtorClient()
        val api = BsdcPlatformApi(config, http, SupabaseRestClient(config, http) { "jwt-token" })

        val saved = api.saveOnboardingProfile(
            uid = "uid-1",
            draft = ProfileDraft(
                username = "Tasnim_BD",
                displayName = "Tasnim",
                bio = "Kotlin developer",
                language = AppLanguage.EN,
                onboardingComplete = true,
            ),
        )

        assertEquals("tasnim_bd", saved.username)
        assertTrue(saved.onboardingComplete)

        val upsertReq = server.takeRequest()
        val upsertBody = upsertReq.body.readUtf8()
        assertFalse("Must never write db-owned role", upsertBody.contains("\"role\""))
        assertFalse("Must never write db-owned verified", upsertBody.contains("\"verified\""))
        assertFalse("Must never write db-owned stats", upsertBody.contains("\"reputation\""))

        val patchReq = server.takeRequest()
        assertEquals("PATCH", patchReq.method)

        val rpcReq = server.takeRequest()
        assertEquals("/rest/v1/rpc/claim_username", rpcReq.path)
        assertTrue(rpcReq.body.readUtf8().contains("tasnim_bd"))
    }

    @Test
    fun mintAuthClaimsPostsExpectedPayload() = runTest {
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"uid":"u1","project":"bsdc-bd"}"""))
        val baseUrl = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(baseUrl, "anon-key", siteUrl = baseUrl)
        val http = BsdcHttpClientFactory.createKtorClient()
        val api = BsdcPlatformApi(config, http, SupabaseRestClient(config, http) { null })

        val resp = api.mintAuthClaims("id-token-1", "u1", BsdcRole.MEMBER)
        assertEquals("bsdc-bd", resp.project)
        val req = server.takeRequest()
        assertEquals("Bearer id-token-1", req.getHeader("Authorization"))
    }
}
