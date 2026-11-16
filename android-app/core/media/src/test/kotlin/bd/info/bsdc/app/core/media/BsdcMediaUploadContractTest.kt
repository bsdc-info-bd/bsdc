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

        val assetId = transport.recordMediaAsset("uid-1", upload)
        assertEquals("asset-uuid-001", assetId)

        val edgeReq = server.takeRequest()
        assertEquals("/api/media/upload", edgeReq.path)
        assertEquals("Bearer jwt-token", edgeReq.getHeader("Authorization"))
        val multipartText = edgeReq.body.readUtf8()
        assertTrue(multipartText.contains("post-image"))

        val rpcReq = server.takeRequest()
        assertEquals("/rest/v1/rpc/record_media_asset", rpcReq.path)
        assertTrue(rpcReq.body.readUtf8().contains("https://i.ibb.co/sample/full.webp"))
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
