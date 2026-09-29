package bd.info.bsdc.app.media

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.MediaKind
import bd.info.bsdc.app.model.UploadResult
import bd.info.bsdc.app.util.SafetyPolicy
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Unsigned Cloudinary upload client. It deliberately never contains an API secret or signed
 * upload logic: mobile apps cannot keep secrets. Lock the unsigned preset in Cloudinary to the
 * BSDC folder, image/audio formats, transformations and conservative size limits.
 */
class CloudinaryMediaUploader(private val context: Context) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    suspend fun upload(uri: Uri, altText: String? = null): RepositoryResult<UploadResult> = withContext(Dispatchers.IO) {
        try {
            val cloudName = BuildConfig.CLOUDINARY_CLOUD_NAME
            val preset = BuildConfig.CLOUDINARY_UPLOAD_PRESET
            check(cloudName.isNotBlank() && preset.isNotBlank()) {
                "Media uploads are not configured for this build."
            }
            val mime = context.contentResolver.getType(uri) ?: error("Could not identify the selected file type.")
            require(SafetyPolicy.isAllowedUploadMime(mime)) { "BSDC supports images and voice notes only; video uploads are blocked." }
            val kind = if (mime.startsWith("image/")) MediaKind.IMAGE else MediaKind.AUDIO
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: error("Could not read selected media.")
            val byteLimit = if (kind == MediaKind.IMAGE) IMAGE_BYTES_LIMIT else AUDIO_BYTES_LIMIT
            require(bytes.size <= byteLimit) { "Selected file is too large." }
            val duration = if (kind == MediaKind.AUDIO) audioDuration(uri) else null
            require(duration == null || duration <= MAX_VOICE_NOTE_MILLIS) {
                "Voice notes are limited to 20 seconds."
            }

            // Cloudinary serves audio through the video resource endpoint. Input validation above
            // makes this audio-only; no video MIME type can reach this request.
            val endpointType = if (kind == MediaKind.IMAGE) "image" else "video"
            val folder = "bsdc/${FirebaseAuth.getInstance().currentUser?.uid ?: "anonymous"}"
            val form = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("upload_preset", preset)
                .addFormDataPart("folder", folder)
                .addFormDataPart("context", "alt=${altText.orEmpty().take(250)}")
                .addFormDataPart("file", displayName(uri), bytes.toRequestBody(mime.toMediaType()))
                .build()
            val request = Request.Builder()
                .url("https://api.cloudinary.com/v1_1/$cloudName/$endpointType/upload")
                .post(form)
                .build()
            client.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                check(response.isSuccessful) { "Media service rejected the upload (${response.code})." }
                val json = JSONObject(body)
                val secureUrl = json.optString("secure_url")
                check(secureUrl.isNotBlank()) { "Media service did not return a secure URL." }
                RepositoryResult.Success(
                    UploadResult(
                        secureUrl = secureUrl,
                        publicId = json.optString("public_id").ifBlank { null },
                        resourceType = kind,
                        width = json.optInt("width").takeIf { it > 0 },
                        height = json.optInt("height").takeIf { it > 0 },
                        durationMs = duration
                    )
                )
            }
        } catch (t: Throwable) {
            RepositoryResult.Failure(t.message ?: "Could not upload media.", t)
        }
    }

    private fun displayName(uri: Uri): String {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) return cursor.getString(0) ?: "upload"
        }
        return "upload"
    }

    private fun audioDuration(uri: Uri): Long? = runCatching {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, uri)
            retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
        } finally {
            retriever.release()
        }
    }.getOrNull()

    private companion object {
        const val IMAGE_BYTES_LIMIT = 10 * 1024 * 1024
        const val AUDIO_BYTES_LIMIT = 7 * 1024 * 1024
        const val MAX_VOICE_NOTE_MILLIS = 20_000L
    }
}
