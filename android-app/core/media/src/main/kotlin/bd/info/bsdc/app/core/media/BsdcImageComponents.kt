package bd.info.bsdc.app.core.media

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BrokenImage
import androidx.compose.material.icons.rounded.Close
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.shimmerBrush
import bd.info.bsdc.app.core.model.BsdcHosts
import coil3.ImageLoader
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest

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
        ImgbbUrlAllowlist.selectResponsiveUrl(fullUrl, thumbUrl, targetWidthPx)
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
        modifier = clickMod.clip(RoundedCornerShape(cornerRadiusDp.dp)),
        loading = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(shimmerBrush()),
            )
        },
        error = {
            if (!useProxyRepair && ImgbbUrlAllowlist.isAllowedImageUrl(preferredUrl)) {
                useProxyRepair = true
            }
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
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

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
                    .data(fullUrl)
                    .build(),
                imageLoader = imageLoader,
                contentDescription = caption.ifBlank { "BSDC Image" },
                contentScale = ContentScale.Fit,
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
                    .padding(16.dp)
                    .align(Alignment.TopEnd),
                horizontalArrangement = Arrangement.End,
            ) {
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
