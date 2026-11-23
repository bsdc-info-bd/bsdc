package bd.info.bsdc.app.core.media

import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.MediaPurpose
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BsdcMediaUploadContractTest {

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
    fun uploadsMultipartToEdgeAndRecordsAssetInSupabase() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "ok": true,
                      "provider": "imgbb",
                      "kind": "image",
                      "url": "https://i.ibb.co/sample/full.webp",
                      "thumbUrl": "https://i.ibb.co/sample/medium.webp",
                      "deleteToken": "https://ibb.co/delete/token",
                      "width": 1200,
                      "height": 800,
                      "bytes": 64200,
                      "mimeType": "image/webp"
                    }
                    """.trimIndent(),
                ),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("\"asset-uuid-001\""))

        val base = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(base, "anon-key", siteUrl = base)
        val okHttp = OkHttpClient()
        val ktor = BsdcHttpClientFactory.createKtorClient(okHttp)
        val rest = SupabaseRestClient(config, ktor) { "jwt-token" }
        val transport = ImgbbEdgeMediaTransport(config, okHttp, rest)

        val pngBytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00)
        var lastPct = 0
        val upload = transport.uploadToEdge(
            idToken = "jwt-token",
            bytes = pngBytes,
            fileName = "photo.webp",
            mimeType = "image/webp",
            purpose = MediaPurpose.POST_IMAGE,
            onProgress = { pct -> lastPct = pct },
        )

        assertEquals(100, lastPct)
        assertEquals("imgbb", upload.provider)
        assertEquals("https://i.ibb.co/sample/medium.webp", upload.thumbUrl)

        val assetId = transport.recordMediaAsset("uid-1", upload, MediaPurpose.POST_IMAGE)
        assertEquals("asset-uuid-001", assetId)

        val edgeReq = server.takeRequest()
        assertEquals("/api/media/upload", edgeReq.path)
        assertEquals("Bearer jwt-token", edgeReq.getHeader("Authorization"))
        val multipartText = edgeReq.body.readUtf8()
        assertTrue(multipartText.contains("post-image"))

        val rpcReq = server.takeRequest()
        assertEquals("/rest/v1/rpc/record_media_asset", rpcReq.path)
        val rpcBody = rpcReq.body.readUtf8()
        assertTrue(rpcBody.contains("https://i.ibb.co/sample/full.webp"))
        // The filing, not just the file. A picture recorded without its purpose is in
        // the member's library but on no shelf of it, which is exactly the difference
        // between a gallery and a pile of everything they ever uploaded.
        assertTrue(rpcBody.contains("\"p_purpose\":\"post-image\""))
    }

    @Test
    fun filesAnUnlabelledUploadWhereTheGalleryWillStillFindIt() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "ok": true,
                      "provider": "imgbb",
                      "kind": "image",
                      "url": "https://i.ibb.co/sample/full.webp",
                      "thumbUrl": "https://i.ibb.co/sample/full.webp",
                      "deleteToken": "",
                      "width": 1200,
                      "height": 800,
                      "bytes": 64200,
                      "mimeType": "image/webp"
                    }
                    """.trimIndent(),
                ),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("\"asset-uuid-002\""))

        val base = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(base, "anon-key", siteUrl = base)
        val okHttp = OkHttpClient()
        val rest = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient(okHttp)) { "jwt" }
        val transport = ImgbbEdgeMediaTransport(config, okHttp, rest)

        val upload = transport.uploadToEdge(
            idToken = "jwt-token",
            bytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            fileName = "loose.webp",
            mimeType = "image/webp",
            purpose = MediaPurpose.OTHER,
        )
        // No purpose named at the record call, which is what a caller written before
        // 0132 does: the default has to be the heading the gallery files unlabelled
        // rows under, and not a null the column's check constraint refuses.
        transport.recordMediaAsset("uid-1", upload)

        server.takeRequest() // the edge upload, whose own multipart purpose is separate
        val rpcBody = server.takeRequest().body.readUtf8()
        assertTrue(rpcBody.contains("\"p_purpose\":\"other\""))
    }

    @Test
    fun carriesThePurposeThroughTheFallbackInsertToo() = runTest {
        // A deployment whose `record_media_asset` has not been published yet answers
        // PGRST202, and the row is written straight into the table instead. Both paths
        // have to file the picture, or the library is complete on one host and not on
        // another — which is the same silence as never filing it at all.
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "ok": true,
                      "provider": "imgbb",
                      "kind": "image",
                      "url": "https://i.ibb.co/sample/full.webp",
                      "thumbUrl": "",
                      "deleteToken": "",
                      "width": null,
                      "height": null,
                      "bytes": 10,
                      "mimeType": "image/webp"
                    }
                    """.trimIndent(),
                ),
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setBody("""{"code":"PGRST202","message":"Could not find the function"}"""),
        )
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody("""[{"id":"asset-uuid-003"}]"""),
        )

        val base = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(base, "anon-key", siteUrl = base)
        val okHttp = OkHttpClient()
        val rest = SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient(okHttp)) { "jwt" }
        val transport = ImgbbEdgeMediaTransport(config, okHttp, rest)

        val upload = transport.uploadToEdge(
            idToken = "jwt-token",
            bytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            fileName = "old-host.webp",
            mimeType = "image/webp",
            purpose = MediaPurpose.CHAT_IMAGE,
        )
        assertEquals("asset-uuid-003", transport.recordMediaAsset("uid-1", upload, MediaPurpose.CHAT_IMAGE))

        server.takeRequest()
        server.takeRequest()
        val insertReq = server.takeRequest()
        // The table and the `select` that reads the row back, because
        // `prefer = return=representation` is answered with a body the caller has to
        // parse — an insert nobody can name the id of is an insert that will be retried.
        assertEquals("/rest/v1/media_assets?select=id", insertReq.path)
        assertTrue(insertReq.body.readUtf8().contains("\"purpose\":\"chat-image\""))
    }

    @Test
    fun rejectsCloudinaryUploadResponseEvenOnHttp200() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "ok": true,
                      "provider": "cloudinary",
                      "kind": "image",
                      "url": "https://res.cloudinary.com/demo/image/upload/v1/x.webp"
                    }
                    """.trimIndent(),
                ),
        )
        val base = server.url("/").toString().trimEnd('/')
        val config = BsdcBackendConfig(base, "anon-key", siteUrl = base)
        val okHttp = OkHttpClient()
        val transport = ImgbbEdgeMediaTransport(
            config,
            okHttp,
            SupabaseRestClient(config, BsdcHttpClientFactory.createKtorClient(okHttp)) { "jwt" },
        )

        var threwUnsupported = false
        try {
            transport.uploadToEdge(
                idToken = "jwt",
                bytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
                fileName = "x.png",
                mimeType = "image/png",
                purpose = MediaPurpose.AVATAR,
            )
        } catch (ex: MediaUploadException) {
            threwUnsupported = ex.errorKey == "media.errors.unsupported"
        }
        assertTrue(threwUnsupported)
    }
}
