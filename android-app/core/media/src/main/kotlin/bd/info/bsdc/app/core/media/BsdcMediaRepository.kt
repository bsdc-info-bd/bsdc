package bd.info.bsdc.app.core.media

import android.content.Context
import android.net.Uri
import bd.info.bsdc.app.core.auth.DataAccessBootstrapManager
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.MediaPurpose
import bd.info.bsdc.app.core.model.MediaUploadResult
import bd.info.bsdc.app.core.network.SupabaseApiException
import bd.info.bsdc.app.core.network.SupabaseRestClient
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import okio.Path.Companion.toOkioPath
import java.io.File
import java.io.IOException

@Serializable
private data class EdgeMediaUploadResponse(
    val ok: Boolean = false,
    val provider: String = "imgbb",
    val kind: String = "image",
    val url: String = "",
    val thumbUrl: String = "",
    val deleteToken: String = "",
    val width: Int? = null,
    val height: Int? = null,
    val bytes: Long = 0L,
    val mimeType: String = "image/webp",
    val expiresAt: String? = null,
    val errorKey: String? = null,
)

class MediaUploadException(
    val errorKey: String,
    override val message: String = errorKey,
) : Exception(message)

/**
 * Pure HTTP/Supabase transport for ImgBB edge uploads and `record_media_asset`
 * database persistence (testable directly on JVM with MockWebServer).
 */
class ImgbbEdgeMediaTransport(
    private val config: BsdcBackendConfig,
    private val okHttpClient: OkHttpClient,
    private val supabase: SupabaseRestClient,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun uploadToEdge(
        idToken: String,
        bytes: ByteArray,
        fileName: String,
        mimeType: String,
        purpose: MediaPurpose,
        onProgress: (Int) -> Unit = {},
    ): MediaUploadResult = withContext(Dispatchers.IO) {
        val endpoint = config.siteUrl.trim().trimEnd('/') + "/api/media/upload"
        val fileBody = ProgressBytesRequestBody(bytes, mimeType.toMediaType(), onProgress)
        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("purpose", purpose.wireValue)
            .addFormDataPart("file", fileName, fileBody)
            .build()

        val request = Request.Builder()
            .url(endpoint)
            .header("Authorization", "Bearer $idToken")
            .post(multipart)
            .build()

        val response = okHttpClient.newCall(request).execute()
        val bodyStr = response.body?.string().orEmpty()
        val parsed = runCatching { json.decodeFromString<EdgeMediaUploadResponse>(bodyStr) }.getOrNull()

        if (!response.isSuccessful || parsed == null || !parsed.ok) {
            throw MediaUploadException(parsed?.errorKey ?: "media.errors.failed", bodyStr)
        }
        if (parsed.provider != "imgbb" || !ImgbbUrlAllowlist.isAllowedImageUrl(parsed.url)) {
            throw MediaUploadException("media.errors.unsupported", "Only ImgBB image URLs are accepted")
        }

        MediaUploadResult(
            provider = parsed.provider,
            kind = parsed.kind,
            url = parsed.url,
            thumbUrl = parsed.thumbUrl.ifBlank { parsed.url },
            deleteToken = parsed.deleteToken,
            width = parsed.width,
            height = parsed.height,
            bytes = parsed.bytes,
            mimeType = parsed.mimeType,
            expiresAt = parsed.expiresAt,
        )
    }

    suspend fun recordMediaAsset(
        ownerUid: String,
        upload: MediaUploadResult,
    ): String {
        val rpcParams = buildJsonObject {
            put("p_provider", upload.provider)
            put("p_kind", upload.kind)
            put("p_url", upload.url)
            put("p_thumb_url", upload.thumbUrl)
            put("p_delete_token", upload.deleteToken)
            put("p_width", upload.width?.let { JsonPrimitive(it) } ?: JsonNull)
            put("p_height", upload.height?.let { JsonPrimitive(it) } ?: JsonNull)
            put("p_bytes", upload.bytes)
            put("p_mime_type", upload.mimeType)
            put("p_expires_at", upload.expiresAt?.let { JsonPrimitive(it) } ?: JsonNull)
        }

        val rpcOutcome = runCatching {
            supabase.rpcText("record_media_asset", rpcParams, requireAuth = true)
        }

        rpcOutcome.onSuccess { raw ->
            val id = parseAssetId(raw)
            if (!id.isNullOrBlank()) return id
        }

        val err = rpcOutcome.exceptionOrNull()
        if (err is SupabaseApiException && err.pgCode != "PGRST202" && err.pgCode != "42883") {
            throw err
        }

        val insertBody = buildJsonObject {
            put("owner_uid", ownerUid)
            put("provider", upload.provider)
            put("kind", upload.kind)
            put("url", upload.url)
            put("thumb_url", upload.thumbUrl)
            put("delete_token", upload.deleteToken)
            put("width", upload.width?.let { JsonPrimitive(it) } ?: JsonNull)
            put("height", upload.height?.let { JsonPrimitive(it) } ?: JsonNull)
            put("bytes", upload.bytes)
            put("mime_type", upload.mimeType)
            put("checksum", "")
        }
        val insertedRaw = supabase.postJson(
            table = "media_assets",
            body = insertBody,
            prefer = "return=representation",
            requireAuth = true,
        )
        return parseAssetId(insertedRaw)
            ?: throw MediaUploadException("media.errors.recordFailed")
    }

    private fun parseAssetId(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        if (trimmed.startsWith("\"")) {
            return trimmed.removeSurrounding("\"").takeIf { it.isNotBlank() }
        }
        val elem = runCatching { json.parseToJsonElement(trimmed) }.getOrNull() ?: return null
        val obj: JsonObject? = when (elem) {
            is JsonObject -> elem
            is JsonArray -> elem.jsonArray.firstOrNull()?.jsonObject
            is JsonPrimitive -> return elem.contentOrNull?.takeIf { it.isNotBlank() }
            else -> null
        }
        return obj?.get("id")?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
    }
}

class BsdcMediaRepository(
    private val context: Context,
    private val config: BsdcBackendConfig,
    private val okHttpClient: OkHttpClient,
    private val firebaseAuth: FirebaseAuth,
    private val bootstrapManager: DataAccessBootstrapManager,
    supabase: SupabaseRestClient,
) {
    private val transport = ImgbbEdgeMediaTransport(config, okHttpClient, supabase)

    fun createImageLoader(maxCacheMb: Int = 150): ImageLoader {
        val boundedBytes = maxCacheMb.coerceIn(32, 1024).toLong() * 1024L * 1024L
        val guardedOkHttp = okHttpClient.newBuilder()
            .addInterceptor { chain ->
                val url = chain.request().url.toString()
                if (!ImgbbUrlAllowlist.isAllowedImageUrl(url) && !url.startsWith(config.siteUrl)) {
                    throw IOException("Blocked non-allowlisted image host: ${chain.request().url.host}")
                }
                chain.proceed(chain.request())
            }
            .build()

        return ImageLoader.Builder(context)
            .components {
                add(OkHttpNetworkFetcherFactory(callFactory = { guardedOkHttp }))
            }
            .memoryCache {
                MemoryCache.Builder()
                    .maxSizePercent(context, 0.20)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(File(context.cacheDir, "bsdc_image_cache").toOkioPath())
                    .maxSizeBytes(boundedBytes)
                    .build()
            }
            .crossfade(true)
            .build()
    }

    suspend fun uploadImageUri(
        uri: Uri,
        purpose: MediaPurpose,
        onProgress: (Int) -> Unit = {},
    ): MediaUploadResult = withContext(Dispatchers.IO) {
        val rawBytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw MediaUploadException("media.errors.empty", "Unable to open selected image")

        val fileName = uri.lastPathSegment?.substringAfterLast('/') ?: "bsdc_image.webp"
        uploadRawBytes(
            rawBytes = rawBytes,
            fileName = fileName,
            purpose = purpose,
            onProgress = onProgress,
        )
    }

    suspend fun uploadRawBytes(
        rawBytes: ByteArray,
        fileName: String,
        purpose: MediaPurpose,
        onProgress: (Int) -> Unit = {},
    ): MediaUploadResult = withContext(Dispatchers.IO) {
        if (rawBytes.isEmpty()) throw MediaUploadException("media.errors.empty")
        if (rawBytes.size > ImageSignatureInspector.MAX_IMAGE_BYTES) {
            throw MediaUploadException("media.errors.tooLarge")
        }
        if (!ImageSignatureInspector.looksLikeImageBytes(rawBytes)) {
            throw MediaUploadException("media.errors.unsupported")
        }

        val user = firebaseAuth.currentUser
            ?: throw MediaUploadException("media.errors.signInRequired")
        val (idToken, _) = bootstrapManager.ensureDataAccess(user)

        val transcoded = ImageResizeTranscoder.transcodeForPurpose(rawBytes, fileName, purpose)
        val edgeUpload = transport.uploadToEdge(
            idToken = idToken,
            bytes = transcoded.bytes,
            fileName = transcoded.fileName,
            mimeType = transcoded.mimeType,
            purpose = purpose,
            onProgress = onProgress,
        )
        val assetId = transport.recordMediaAsset(user.uid, edgeUpload)
        edgeUpload.copy(assetId = assetId)
    }
}

private class ProgressBytesRequestBody(
    private val data: ByteArray,
    private val mediaType: okhttp3.MediaType,
    private val onProgress: (Int) -> Unit,
) : RequestBody() {
    override fun contentType(): okhttp3.MediaType = mediaType
    override fun contentLength(): Long = data.size.toLong()

    override fun writeTo(sink: BufferedSink) {
        val chunkSize = 8192
        var offset = 0
        var lastPct = -1
        while (offset < data.size) {
            val count = minOf(chunkSize, data.size - offset)
            sink.write(data, offset, count)
            offset += count
            val pct = ((offset * 100L) / data.size.coerceAtLeast(1)).toInt().coerceIn(0, 100)
            if (pct != lastPct) {
                lastPct = pct
                onProgress(pct)
            }
        }
    }
}
