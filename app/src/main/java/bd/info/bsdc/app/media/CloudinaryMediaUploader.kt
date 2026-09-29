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
import com.cloudinary.android.MediaManager
import com.cloudinary.android.callback.ErrorInfo
import com.cloudinary.android.callback.UploadCallback
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Official Cloudinary Android SDK bridge for image and voice-note uploads. It uses an unsigned
 * preset, never an API key or API secret. The Cloudinary preset must enforce the same format,
 * folder, transformation and byte restrictions server-side because a mobile client is untrusted.
 */
class CloudinaryMediaUploader(private val context: Context) {
    suspend fun upload(uri: Uri, altText: String? = null): RepositoryResult<UploadResult> = try {
        val cloudName = BuildConfig.CLOUDINARY_CLOUD_NAME
        val preset = BuildConfig.CLOUDINARY_UPLOAD_PRESET
        check(cloudName.isNotBlank() && preset.isNotBlank()) {
            "Media uploads are not configured for this build."
        }
        val mime = context.contentResolver.getType(uri) ?: error("Could not identify the selected file type.")
        require(SafetyPolicy.isAllowedUploadMime(mime)) { "BSDC supports images and voice notes only; video uploads are blocked." }
        val kind = if (mime.startsWith("image/")) MediaKind.IMAGE else MediaKind.AUDIO
        val byteLimit = if (kind == MediaKind.IMAGE) IMAGE_BYTES_LIMIT else AUDIO_BYTES_LIMIT
        require(contentSize(uri) <= byteLimit) { "Selected file is too large." }
        val duration = if (kind == MediaKind.AUDIO) audioDuration(uri) else null
        require(duration == null || duration <= MAX_VOICE_NOTE_MILLIS) {
            "Voice notes are limited to 20 seconds."
        }

        val result = dispatchUnsignedUpload(uri, preset, kind, altText)
        RepositoryResult.Success(result.copy(durationMs = duration ?: result.durationMs))
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not upload media.", t)
    }

    private suspend fun dispatchUnsignedUpload(
        uri: Uri,
        preset: String,
        kind: MediaKind,
        altText: String?
    ): UploadResult = suspendCancellableCoroutine { continuation ->
        // Cloudinary serves audio via its video resource endpoint. We never pass video MIME
        // types to this SDK; resource_type is only a Cloudinary transport classification.
        val resourceType = if (kind == MediaKind.IMAGE) "image" else "video"
        val folder = "bsdc/${FirebaseAuth.getInstance().currentUser?.uid ?: "anonymous"}"
        MediaManager.get().upload(uri)
            .unsigned(preset)
            .option("resource_type", resourceType)
            .option("folder", folder)
            .option("context", "alt=${altText.orEmpty().take(250)}")
            .callback(object : UploadCallback {
                override fun onStart(requestId: String) = Unit
                override fun onProgress(requestId: String, bytes: Long, totalBytes: Long) = Unit

                override fun onSuccess(requestId: String, resultData: Map<*, *>) {
                    val secureUrl = resultData["secure_url"] as? String
                    if (secureUrl.isNullOrBlank()) {
                        if (continuation.isActive) continuation.resumeWith(Result.failure(IllegalStateException("Media service did not return a secure URL.")))
                        return
                    }
                    val result = UploadResult(
                        secureUrl = secureUrl,
                        publicId = resultData["public_id"] as? String,
                        resourceType = kind,
                        width = (resultData["width"] as? Number)?.toInt(),
                        height = (resultData["height"] as? Number)?.toInt(),
                        durationMs = ((resultData["duration"] as? Number)?.toDouble()?.times(1000))?.toLong()
                    )
                    if (continuation.isActive) continuation.resume(result)
                }

                override fun onError(requestId: String, error: ErrorInfo) {
                    if (continuation.isActive) continuation.resumeWith(Result.failure(IllegalStateException(error.description)))
                }

                override fun onReschedule(requestId: String, error: ErrorInfo) {
                    if (continuation.isActive) continuation.resumeWith(Result.failure(IllegalStateException("Upload is waiting for a network connection.")))
                }
            })
            .dispatch()
    }

    private fun contentSize(uri: Uri): Long {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0)
        }
        // The SDK can stream a provider URI without a declared size. Rejecting unknown size is
        // safer than buffering an unbounded attachment in the app process.
        error("Selected provider did not report a file size.")
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
