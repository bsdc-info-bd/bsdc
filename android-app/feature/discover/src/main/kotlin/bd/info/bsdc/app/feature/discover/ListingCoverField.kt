package bd.info.bsdc.app.feature.discover

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch

/**
 * The cover row every listing editor needs: an address box, a photo picker, and the picture itself.
 *
 * A gig, a job and an event all store a cover the same way — a URL in an allow-listed image host,
 * checked by `bsdc.assert_listing_cover` on the way in — so all three used to paste the same three
 * blocks, and only two of them had them. One composable, one behaviour: the address is what is saved,
 * the picker only writes an address the host will accept, and the preview is the same renderer the
 * listing page uses, so what the member sees here is what a reader sees there.
 *
 * The picker is offered only when a [mediaRepository] was handed to the screen. Without it the box
 * still works exactly as the website's does, which is why the parameter is optional rather than
 * assumed: a preview build that has not wired media must still be able to save a cover.
 */
@Composable
fun MkListingCoverField(
    coverUrl: String,
    onCoverUrl: (String) -> Unit,
    bn: Boolean,
    allowed: Boolean,
    imageLoader: ImageLoader,
    modifier: Modifier = Modifier,
    error: String = "",
    mediaRepository: BsdcMediaRepository? = null,
    enabled: Boolean = true,
) {
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    val trimmed = coverUrl.trim()

    val picker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val repo = mediaRepository
        if (uri == null || repo == null) return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            runCatching { repo.uploadImageUri(uri, MediaPurpose.COVER) }
                .onSuccess { uploaded -> onCoverUrl(uploaded.url) }
                // A refused upload leaves the box as it was; the error line below is where that reads.
                .onFailure { }
            uploading = false
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BsdcFormText(
            label = if (bn) "কভারের ঠিকানা" else "Cover URL",
            value = coverUrl,
            onValueChange = onCoverUrl,
            leadingIcon = Icons.Rounded.Image,
            hint = if (bn) {
                "খালি করলে কভার মুছে যাবে।"
            } else {
                "Clear this box to remove the cover."
            },
            error = error,
            complete = trimmed.isNotBlank() && allowed,
            enabled = enabled && !uploading,
            singleLine = true,
        )
        if (mediaRepository != null) {
            BsdcButton(
                label = if (uploading) {
                    if (bn) "আপলোড হচ্ছে…" else "Uploading…"
                } else {
                    if (bn) "ছবি থেকে কভার বেছে নিন" else "Pick a cover photo"
                },
                onClick = {
                    picker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                secondary = true,
                busy = uploading,
                enabled = enabled,
                leadingIcon = Icons.Rounded.Link,
            )
        }
        if (trimmed.isNotBlank() && allowed) {
            BsdcImgbbImage(
                fullUrl = trimmed,
                thumbUrl = trimmed,
                contentDescription = null,
                imageLoader = imageLoader,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(126.dp),
                targetWidthPx = 960,
                cornerRadiusDp = 16,
            )
        }
    }
}
