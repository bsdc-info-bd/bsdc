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
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
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
    var coverBusy by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

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
