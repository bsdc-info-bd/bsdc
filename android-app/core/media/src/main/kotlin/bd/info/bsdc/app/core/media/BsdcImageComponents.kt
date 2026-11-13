package bd.info.bsdc.app.core.media

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BrokenImage
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import bd.info.bsdc.app.core.designsystem.BsdcAvatarCircle
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.bsdcShimmerPlaceholder
import bd.info.bsdc.app.core.designsystem.pressBounceScale
import bd.info.bsdc.app.core.model.BsdcHosts
import coil3.ImageLoader
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

private val mediaDownloadClient by lazy {
    OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()
}

/**
 * Downloads an image (falling back to the CORS-friendly ImgBB edge proxy if needed)
 * and persists it into the device Pictures/BSDC gallery without legacy storage permissions.
 */
suspend fun saveImageToDevice(
    context: Context,
    rawUrl: String,
): Result<String> = withContext(Dispatchers.IO) {
    runCatching {
        val normalized = ImgbbUrlAllowlist.normalizeImageUrl(rawUrl).ifEmpty { rawUrl.trim() }
        require(normalized.startsWith("https://")) { "Invalid image URL" }

        val candidates = buildList {
            add(normalized)
            if (ImgbbUrlAllowlist.isRepairableImageUrl(normalized)) {
                add(ImgbbUrlAllowlist.edgeRepairUrl(BsdcHosts.SITE_ORIGIN, normalized))
            }
        }

        var downloadedBytes: ByteArray? = null
        var contentType = ""
        for (candidate in candidates) {
            val res = runCatching {
                val req = Request.Builder().url(candidate).get().build()
                mediaDownloadClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) error("HTTP ${resp.code}")
                    val bytes = resp.body?.bytes() ?: ByteArray(0)
                    require(bytes.isNotEmpty() && bytes.size <= 25 * 1024 * 1024) { "Empty or oversized image" }
                    contentType = resp.header("Content-Type").orEmpty()
                    bytes
                }
            }.getOrNull()
            if (res != null) {
                downloadedBytes = res
                break
            }
        }

        val bytes = downloadedBytes ?: error("Could not fetch image")
        val mime = when {
            contentType.contains("png", ignoreCase = true) || normalized.endsWith(".png", ignoreCase = true) -> "image/png"
            contentType.contains("webp", ignoreCase = true) || normalized.endsWith(".webp", ignoreCase = true) -> "image/webp"
            contentType.contains("gif", ignoreCase = true) || normalized.endsWith(".gif", ignoreCase = true) -> "image/gif"
            else -> "image/jpeg"
        }
        val ext = when (mime) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/gif" -> "gif"
            else -> "jpg"
        }
        val fileName = "bsdc-${System.currentTimeMillis()}.$ext"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Images.Media.MIME_TYPE, mime)
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/BSDC")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: error("Failed to create MediaStore entry")
            try {
                resolver.openOutputStream(uri)?.use { out ->
                    out.write(bytes)
                    out.flush()
                } ?: error("Failed to open image stream")
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (err: Throwable) {
                runCatching { resolver.delete(uri, null, null) }
                throw err
            }
            fileName
        } else {
            val rootDir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: context.cacheDir
            val folder = File(rootDir, "BSDC").apply { mkdirs() }
            val outFile = File(folder, fileName)
            outFile.writeBytes(bytes)
            MediaScannerConnection.scanFile(context, arrayOf(outFile.absolutePath), arrayOf(mime), null)
            fileName
        }
    }
}

/**
 * Circular member or group avatar backed by Coil with multi-host support,
 * ImgBB edge-repair retry, shimmer placeholder, and clean initials fallback.
 */
@Composable
fun BsdcAvatar(
    avatarUrl: String?,
    displayName: String,
    imageLoader: ImageLoader,
    modifier: Modifier = Modifier,
    online: Boolean = false,
    size: Dp = 42.dp,
    borderWidth: Dp = 1.dp,
    borderColor: Color = BsdcThemeTokens.colors.border,
    onClick: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val ext = BsdcThemeTokens.colors
    val normalizedUrl = remember(avatarUrl) {
        ImgbbUrlAllowlist.normalizeImageUrl(avatarUrl.orEmpty())
    }
    var useProxyRepair by remember(normalizedUrl) { mutableStateOf(false) }
    var exhausted by remember(normalizedUrl) { mutableStateOf(false) }

    val clickMod = if (onClick != null) {
        val interactionSource = remember { MutableInteractionSource() }
        modifier
            .pressBounceScale(interactionSource)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
    } else {
        modifier
    }

    if (normalizedUrl.isEmpty() || exhausted) {
        BsdcAvatarCircle(
            initials = displayName.ifBlank { "B" },
            online = online,
            size = size,
            modifier = clickMod,
        )
        return
    }

    val activeUrl = remember(normalizedUrl, useProxyRepair) {
        if (useProxyRepair) {
            ImgbbUrlAllowlist.edgeRepairUrl(BsdcHosts.SITE_ORIGIN, normalizedUrl)
        } else {
            normalizedUrl
        }
    }

    Box(modifier = clickMod.size(size)) {
        SubcomposeAsyncImage(
            model = ImageRequest.Builder(context)
                .data(activeUrl)
                .build(),
            imageLoader = imageLoader,
            contentDescription = displayName,
            contentScale = ContentScale.Crop,
            onError = {
                if (!useProxyRepair && ImgbbUrlAllowlist.isRepairableImageUrl(normalizedUrl)) {
                    useProxyRepair = true
                } else {
                    exhausted = true
                }
            },
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .then(
                    if (borderWidth > 0.dp) {
                        Modifier.border(borderWidth, borderColor, CircleShape)
                    } else {
                        Modifier
                    },
                ),
            loading = {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .bsdcShimmerPlaceholder(),
                )
            },
            error = {
                BsdcAvatarCircle(
                    initials = displayName.ifBlank { "B" },
                    online = false,
                    size = size,
                )
            },
        )
        if (online) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size((size * 0.28f).coerceAtLeast(10.dp))
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.background)
                    .padding(2.dp)
                    .clip(CircleShape)
                    .background(ext.online),
            )
        }
    }
}

@Composable
fun BsdcImgbbImage(
    fullUrl: String,
    thumbUrl: String = "",
    contentDescription: String?,
    imageLoader: ImageLoader,
    modifier: Modifier = Modifier,
    targetWidthPx: Int = 640,
    contentScale: ContentScale = ContentScale.Crop,
    cornerRadiusDp: Int = 14,
    onTapOpenLightbox: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val preferredUrl = remember(fullUrl, thumbUrl, targetWidthPx) {
        val raw = ImgbbUrlAllowlist.selectResponsiveUrl(fullUrl, thumbUrl, targetWidthPx)
        ImgbbUrlAllowlist.normalizeImageUrl(raw).ifEmpty { raw.trim() }
    }
    var useProxyRepair by remember(preferredUrl) { mutableStateOf(false) }
    val activeUrl = if (useProxyRepair) {
        ImgbbUrlAllowlist.edgeRepairUrl(BsdcHosts.SITE_ORIGIN, preferredUrl)
    } else {
        preferredUrl
    }

    val clickMod = if (onTapOpenLightbox != null) {
        modifier.clickable(onClick = onTapOpenLightbox)
    } else {
        modifier
    }

    SubcomposeAsyncImage(
        model = ImageRequest.Builder(context)
            .data(activeUrl)
            .build(),
        imageLoader = imageLoader,
        contentDescription = contentDescription,
        contentScale = contentScale,
        onError = {
            if (!useProxyRepair && ImgbbUrlAllowlist.isRepairableImageUrl(preferredUrl)) {
                useProxyRepair = true
            }
        },
        modifier = clickMod.clip(RoundedCornerShape(cornerRadiusDp.dp)),
        loading = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .bsdcShimmerPlaceholder(),
            )
        },
        error = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(BsdcThemeTokens.colors.surfaceElevated),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.BrokenImage,
                    contentDescription = contentDescription,
                    tint = BsdcThemeTokens.colors.mutedText,
                )
            }
        },
    )
}

@Composable
fun BsdcMediaLightboxDialog(
    fullUrl: String,
    caption: String = "",
    imageLoader: ImageLoader,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    val normalizedFull = remember(fullUrl) {
        ImgbbUrlAllowlist.normalizeImageUrl(fullUrl).ifEmpty { fullUrl.trim() }
    }
    var useProxyRepair by remember(normalizedFull) { mutableStateOf(false) }
    var downloading by remember { mutableStateOf(false) }
    var downloadedOnce by remember { mutableStateOf(false) }

    val activeUrl = if (useProxyRepair) {
        ImgbbUrlAllowlist.edgeRepairUrl(BsdcHosts.SITE_ORIGIN, normalizedFull)
    } else {
        normalizedFull
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.94f)),
        ) {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context)
                    .data(activeUrl)
                    .build(),
                imageLoader = imageLoader,
                contentDescription = caption.ifBlank { "BSDC Image" },
                contentScale = ContentScale.Fit,
                onError = {
                    if (!useProxyRepair && ImgbbUrlAllowlist.isRepairableImageUrl(normalizedFull)) {
                        useProxyRepair = true
                    }
                },
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onDoubleTap = {
                                if (scale > 1.2f) {
                                    scale = 1f
                                    offsetX = 0f
                                    offsetY = 0f
                                } else {
                                    scale = 2.4f
                                }
                            },
                        )
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            val nextScale = (scale * zoom).coerceIn(1f, 4f)
                            scale = nextScale
                            if (nextScale > 1f) {
                                offsetX += pan.x
                                offsetY += pan.y
                            } else {
                                offsetX = 0f
                                offsetY = 0f
                                if (pan.y > 42f) onDismiss()
                            }
                        }
                    }
                    .graphicsLayer(
                        scaleX = scale,
                        scaleY = scale,
                        translationX = offsetX,
                        translationY = offsetY,
                    ),
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(16.dp)
                    .align(Alignment.TopEnd),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color.Black.copy(alpha = 0.6f),
                ) {
                    IconButton(
                        enabled = !downloading,
                        onClick = {
                            scope.launch {
                                downloading = true
                                saveImageToDevice(context, normalizedFull)
                                    .onSuccess {
                                        downloadedOnce = true
                                        Toast.makeText(context, "Saved image to Pictures/BSDC", Toast.LENGTH_SHORT).show()
                                    }
                                    .onFailure { err ->
                                        Toast.makeText(
                                            context,
                                            err.localizedMessage ?: "Could not download image",
                                            Toast.LENGTH_SHORT,
                                        ).show()
                                    }
                                downloading = false
                            }
                        },
                    ) {
                        when {
                            downloading -> CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Color.White,
                                strokeWidth = 2.dp,
                            )
                            downloadedOnce -> Icon(
                                imageVector = Icons.Rounded.Check,
                                contentDescription = "Downloaded",
                                tint = BsdcThemeTokens.colors.brandStrong,
                            )
                            else -> Icon(
                                imageVector = Icons.Rounded.Download,
                                contentDescription = "Download image",
                                tint = Color.White,
                            )
                        }
                    }
                }
                Surface(
                    shape = CircleShape,
                    color = Color.Black.copy(alpha = 0.6f),
                ) {
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Close lightbox",
                            tint = Color.White,
                        )
                    }
                }
            }

            if (caption.isNotBlank()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(Color.Black.copy(alpha = 0.58f))
                        .navigationBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                ) {
                    Text(
                        text = caption,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White,
                    )
                }
            }
        }
    }
}
