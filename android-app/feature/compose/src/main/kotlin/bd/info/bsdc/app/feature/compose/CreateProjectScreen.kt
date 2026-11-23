package bd.info.bsdc.app.feature.compose

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcGalleryPickerSheet
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.media.GalleryCopy
import bd.info.bsdc.app.core.media.GalleryFilter
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcGalleryImage
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch

/**
 * The project screen, on its own.
 *
 * Projects are judged by their screenshots, so the cover picker and the shot strip are the first
 * thing the form shows; before this they were a card at the bottom of a shared hub, where a member
 * who never scrolled could not know they existed.
 */
@Composable
fun MkCreateProjectScreen(
    ownerUid: String,
    repository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
) {
    MkCreateScaffold(
        mode = CreateHubMode.PROJECT,
        bn = language == AppLanguage.BN,
        onBack = onBack,
    ) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(ProjectDraftInput()) }
    var screenshots by remember { mutableStateOf<List<ComposerMediaAttachment>>(emptyList()) }
    var showCoverLibrary by remember { mutableStateOf(false) }
    var showShotLibrary by remember { mutableStateOf(false) }
    val bn = language == AppLanguage.BN
    val library = GalleryCopy.forLanguage(bn)
    var coverBusy by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    /**
     * Attach a picture this member already hosted, without uploading it again.
     *
     * A project screenshot is the one image a member is most likely to have posted
     * somewhere else already — the launch post carried it last month — so this is the
     * pick that saves the most: no bytes moved, one copy at the host, and the caption
     * the member wrote the first time arrives as the attachment's alt text. The stored
     * id rides along, which is what makes the attachment `isReady` instead of pending,
     * and a shot whose address the project already has is dropped rather than doubled.
     */
    fun attachPickedShots(picked: List<BsdcGalleryImage>) {
        val room = (8 - screenshots.size).coerceAtLeast(0)
        if (room <= 0) return
        val added = picked
            .filter { image -> screenshots.none { shot -> shot.url == image.url } }
            .take(room)
            .map { image ->
                ComposerMediaAttachment(
                    localUri = null,
                    mediaId = image.id,
                    url = image.url,
                    thumbUrl = image.thumbUrl.ifEmpty { image.url },
                    altText = image.altText,
                    progressPct = 100,
                    stage = AttachmentUploadStage.READY,
                )
            }
        if (added.isEmpty()) return
        screenshots = screenshots + added
    }

    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        coverBusy = true
        scope.launch {
            runCatching { mediaRepository.uploadImageUri(uri, MediaPurpose.PROJECT_COVER) }
                .onSuccess { draft = draft.copy(coverUrl = it.url) }
                .onFailure { error = it.message ?: "Cover upload failed." }
            coverBusy = false
        }
    }

    val shotPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(8)) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val pending = uris.take(8 - screenshots.size).map {
            ComposerMediaAttachment(localUri = it, stage = AttachmentUploadStage.UPLOADING)
        }
        screenshots = screenshots + pending
        pending.forEach { item ->
            val uri = item.localUri ?: return@forEach
            scope.launch {
                runCatching {
                    mediaRepository.uploadImageUri(uri, MediaPurpose.PROJECT_IMAGE) { pct ->
                        screenshots = screenshots.map {
                            if (it.localKey == item.localKey) it.copy(progressPct = pct) else it
                        }
                    }
                }.onSuccess { res ->
                    screenshots = screenshots.map {
                        if (it.localKey == item.localKey) {
                            it.copy(
                                mediaId = res.assetId.orEmpty(),
                                url = res.url,
                                thumbUrl = res.thumbUrl,
                                progressPct = 100,
                                stage = AttachmentUploadStage.READY,
                            )
                        } else {
                            it
                        }
                    }
                }.onFailure { err ->
                    screenshots = screenshots.map {
                        if (it.localKey == item.localKey) it.copy(stage = AttachmentUploadStage.FAILED, error = err.message) else it
                    }
                }
            }
        }
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Project Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                Text(if (language == AppLanguage.BN) "ওপেন-সোর্স প্রজেক্ট যোগ করুন" else "Showcase an Open-Source Project", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(value = draft.name, onValueChange = { draft = draft.copy(name = it) }, label = { Text("Project Name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.tagline, onValueChange = { draft = draft.copy(tagline = it) }, label = { Text("Short Tagline") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.description, onValueChange = { draft = draft.copy(description = it) }, label = { Text("Description") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.repoUrl, onValueChange = { draft = draft.copy(repoUrl = it) }, label = { Text("GitHub / Repo URL") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.demoUrl, onValueChange = { draft = draft.copy(demoUrl = it) }, label = { Text("Live Demo URL") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.techText, onValueChange = { draft = draft.copy(techText = it) }, label = { Text("Tech Stack (comma-separated)") }, modifier = Modifier.fillMaxWidth())
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Looking for contributors")
                    Switch(checked = draft.lookingForContributors, onCheckedChange = { draft = draft.copy(lookingForContributors = it) })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BsdcButton(
                        label = "Cover",
                        secondary = true,
                        busy = coverBusy,
                        onClick = { coverPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        modifier = Modifier.weight(1f),
                    )
                    BsdcButton(
                        label = "Screenshots (${screenshots.size}/8)",
                        secondary = true,
                        enabled = screenshots.size < 8,
                        onClick = { shotPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Two doors to the member's own shelf, one per picture the project
                    // keeps: a wide cover and the run of screenshots. Both are labelled
                    // with the website's words for the same door, because it *is* the
                    // same door — the same function, the same rows, the same marks for
                    // what the project already carries.
                    BsdcButton(
                        label = library.open,
                        secondary = true,
                        onClick = { showCoverLibrary = true },
                        modifier = Modifier.weight(1f),
                        leadingIcon = Icons.Rounded.Image,
                    )
                    // Both doors read the same, because they are the same door: the two
                    // buttons are weighted to sit under `Cover` and `Screenshots`
                    // respectively, so the column says which picture each one is for.
                    BsdcButton(
                        label = library.open,
                        secondary = true,
                        enabled = screenshots.size < 8,
                        onClick = { showShotLibrary = true },
                        modifier = Modifier.weight(1f),
                        leadingIcon = Icons.Rounded.Image,
                    )
                }

                BsdcGalleryPickerSheet(
                    visible = showCoverLibrary,
                    repository = mediaRepository,
                    imageLoader = imageLoader,
                    bn = bn,
                    max = 1,
                    attached = listOf(draft.coverUrl),
                    initialFilter = GalleryFilter.COVER,
                    onDismiss = { showCoverLibrary = false },
                    onPicked = { picked ->
                        val url = picked.firstOrNull()?.url.orEmpty()
                        if (url.isNotEmpty()) draft = draft.copy(coverUrl = url)
                        showCoverLibrary = false
                    },
                )

                BsdcGalleryPickerSheet(
                    visible = showShotLibrary,
                    repository = mediaRepository,
                    imageLoader = imageLoader,
                    bn = bn,
                    max = (8 - screenshots.size).coerceAtLeast(1),
                    attached = screenshots.map { it.url },
                    initialFilter = GalleryFilter.PROJECT_IMAGE,
                    onDismiss = { showShotLibrary = false },
                    onPicked = { picked ->
                        attachPickedShots(picked)
                        showShotLibrary = false
                    },
                )
                if (screenshots.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(screenshots, key = { it.localKey }) { shot ->
                            if (shot.url.isNotBlank()) {
                                BsdcImgbbImage(
                                    fullUrl = shot.url,
                                    thumbUrl = shot.thumbUrl,
                                    contentDescription = shot.altText,
                                    imageLoader = imageLoader,
                                    modifier = Modifier.size(110.dp),
                                )
                            } else {
                                LinearProgressIndicator(progress = { shot.progressPct / 100f })
                            }
                        }
                    }
                }
                BsdcButton(
                    label = "Publish Project",
                    busy = submitting,
                    enabled = screenshots.none { it.stage == AttachmentUploadStage.UPLOADING },
                    leadingIcon = Icons.Rounded.Publish,
                    onClick = {
                        val issues = ComposerValidationEngine.validateProjectDraft(
                            draft.name, draft.tagline, draft.description, draft.repoUrl, draft.demoUrl,
                            draft.techText.split(",").filter { it.isNotBlank() },
                        )
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createProjectWithScreenshots(ownerUid, draft, screenshots) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to publish project." }
                            submitting = false
                        }
                    },
                )
            }
        }
    }
    }
}
