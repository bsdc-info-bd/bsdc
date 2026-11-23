package bd.info.bsdc.app.core.media

import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.MediaPurpose
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseApiException
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The app's half of the shelf: one page of the member's own pictures, read from
 * `my_gallery` (0132) and nothing else.
 *
 * These are the four things a reuse-the-old-photo feature gets wrong when it is
 * written in a hurry — whose library is asked for, what a page resumes from, what an
 * end looks like, and what a refusal sounds like.
 */
class BsdcGalleryClientTest {

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

    private fun transport(): ImgbbEdgeMediaTransport {
        val base = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(base, "anon-key", siteUrl = base)
        val okHttp = OkHttpClient()
        return ImgbbEdgeMediaTransport(
            config,
            okHttp,
            SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient(okHttp)) { "jwt" },
        )
    }

    @Test
    fun asksForOneShelfOfTheCallersOwnLibrary() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    [
                      {
                        "id": "6f1c0b6a-0000-4000-8000-000000000001",
                        "url": "https://i.ibb.co/shelf/banner.png",
                        "thumb_url": "https://i.ibb.co/shelf/banner-medium.png",
                        "purpose": "cover",
                        "width": 1920,
                        "height": 640,
                        "bytes": 240118,
                        "mime_type": "image/png",
                        "created_at": "2026-03-04T09:12:00Z",
                        "expires_at": "2027-04-03T09:12:00Z",
                        "in_use": true,
                        "uses": 2,
                        "surfaces": ["group", "seo"],
                        "alt_text": "The shop front on Eid morning"
                      },
                      {
                        "id": "6f1c0b6a-0000-4000-8000-000000000002",
                        "url": "https://i.ibb.co/shelf/old.png",
                        "thumb_url": "",
                        "purpose": "cover",
                        "width": null,
                        "height": null,
                        "bytes": 12,
                        "mime_type": "image/webp",
                        "created_at": "2026-02-02T08:00:00Z",
                        "expires_at": null,
                        "in_use": false,
                        "uses": 0,
                        "surfaces": [],
                        "alt_text": ""
                      }
                    ]
                    """.trimIndent(),
                ),
        )

        val page = transport().listGallery(purpose = MediaPurpose.COVER, query = "monsoon")

        assertEquals(2, page.items.size)
        val first = page.items.first()
        // The row as the database wrote it, including the two columns a tile cannot do
        // without: the caption the member gave the picture, and where it hangs today.
        assertEquals("https://i.ibb.co/shelf/banner-medium.png", first.thumbUrl)
        assertEquals("The shop front on Eid morning", first.altText)
        assertTrue(first.inUse)
        assertEquals(listOf("group", "seo"), first.surfaces)
        // A row with no thumbnail of its own still shows the picture, and unknown
        // dimensions stay unknown rather than becoming zero — a tile that believes a
        // picture is 0×640 reserves space for nothing.
        val second = page.items[1]
        assertEquals("", second.thumbUrl)
        assertNull(second.width)
        assertNull(second.expiresAt)
        assertFalse(second.inUse)

        val request = server.takeRequest()
        assertEquals("/rest/v1/rpc/my_gallery", request.path)
        val body = request.body.readUtf8()
        assertTrue(body.contains("\"p_purpose\":\"cover\""))
        assertTrue(body.contains("\"p_query\":\"monsoon\""))
        assertTrue(body.contains("\"p_limit\":$GALLERY_PAGE_SIZE"))
        assertTrue(body.contains("\"p_before\":null"))
        // The owner is never named: the function reads it from the token, which is what
        // stops a client from asking for somebody else's shelf.
        assertFalse(body.contains("owner_uid"))
    }

    @Test
    fun resumesFromTheOldestRowOfThePageItWasGiven() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    [
                      {"id":"a1","url":"https://i.ibb.co/x/1.png","thumb_url":"","purpose":"cover",
                       "width":null,"height":null,"bytes":1,"mime_type":"image/png",
                       "created_at":"2026-03-04T09:12:00Z","expires_at":null,"in_use":false,
                       "uses":0,"surfaces":[],"alt_text":""},
                      {"id":"a2","url":"https://i.ibb.co/x/2.png","thumb_url":"","purpose":"cover",
                       "width":null,"height":null,"bytes":1,"mime_type":"image/png",
                       "created_at":"2026-01-31T23:59:59Z","expires_at":null,"in_use":false,
                       "uses":0,"surfaces":[],"alt_text":""}
                    ]
                    """.trimIndent(),
                ),
        )

        val page = transport().listGallery()
        val cursor = page.nextCursor
        assertTrue("a full page has to say where the next one starts", cursor != null)
        // The oldest row, because the sort is newest first — and both halves together,
        // which is what the function insists on.
        assertEquals("2026-01-31T23:59:59Z", cursor?.before)
        assertEquals("a2", cursor?.beforeId)

        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("[]"),
        )
        transport().listGallery(cursor = cursor)

        server.takeRequest()
        val next = server.takeRequest().body.readUtf8()
        assertTrue(next.contains("\"p_before\":\"2026-01-31T23:59:59Z\""))
        assertTrue(next.contains("\"p_before_id\":\"a2\""))
    }

    @Test
    fun anEmptyShelfIsAnEndAndNotALoop() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("[]"),
        )

        val page = transport().listGallery()
        assertTrue(page.items.isEmpty())
        // No position to resume from, so a list that keeps asking for more stops.
        assertNull(page.nextCursor)
    }

    @Test
    fun aRefusedFilterIsNotQuietlyAnEmptyShelf() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(400)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"code":"22023","message":"invalid picture filter"}"""),
        )

        var refused: SupabaseApiException? = null
        try {
            transport().listGallery(purpose = MediaPurpose.COVER)
        } catch (err: SupabaseApiException) {
            refused = err
        }
        // "This filter does not exist" and "you have no pictures" are different
        // sentences, and only one of them tells a member to try again.
        assertEquals("22023", refused?.pgCode)
    }
}
