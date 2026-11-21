package bd.info.bsdc.app.feature.compose

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material3.FilterChip
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
import bd.info.bsdc.app.core.designsystem.BsdcActionTile
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcHeroBanner
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * The event screen, on its own.
 *
 * It used to be a form inside the create hub, which meant the one creation flow with the most
 * schedule-sensitive fields — start, end, venue, capacity, an IANA zone the app cannot pick for you —
 * shared a scroll container with a tile grid. Now it gets the room, a back affordance that returns to
 * the picker, and a header that says what an event is judged on.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MkCreateEventScreen(
    hostUid: String,
    repository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
) {
    MkCreateScaffold(
        mode = CreateHubMode.EVENT,
        bn = language == AppLanguage.BN,
        onBack = onBack,
    ) {
    val scope = rememberCoroutineScope()
    val defaultStart = remember { Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES).toString() }
    val defaultEnd = remember { Instant.now().plus(2, ChronoUnit.DAYS).plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MINUTES).toString() }
    var draft by remember {
        mutableStateOf(EventDraftInput(startsAtIso = defaultStart, endsAtIso = defaultEnd))
    }
    var coverUploading by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val coverPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        coverUploading = true
        scope.launch {
            runCatching { mediaRepository.uploadImageUri(uri, MediaPurpose.COVER) }
                .onSuccess { draft = draft.copy(coverUrl = it.url) }
                .onFailure { error = it.message ?: "Cover upload failed." }
            coverUploading = false
        }
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Event Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                Text(if (language == AppLanguage.BN) "নতুন ইভেন্ট তৈরি করুন" else "Host a Community Event", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(value = draft.title, onValueChange = { draft = draft.copy(title = it) }, label = { Text("Event Title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.description, onValueChange = { draft = draft.copy(description = it) }, label = { Text("Description") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("online", "in_person", "hybrid").forEach { mode ->
                        FilterChip(
                            selected = draft.mode == mode,
                            onClick = { draft = draft.copy(mode = mode) },
                            label = { Text(mode.replace('_', ' ').uppercase()) },
                        )
                    }
                }
                if (draft.mode != "in_person") {
                    OutlinedTextField(value = draft.joinUrl, onValueChange = { draft = draft.copy(joinUrl = it) }, label = { Text("Join URL (https://...)") }, modifier = Modifier.fillMaxWidth())
                }
                if (draft.mode != "online") {
                    OutlinedTextField(value = draft.venue, onValueChange = { draft = draft.copy(venue = it) }, label = { Text("Venue Address") }, modifier = Modifier.fillMaxWidth())
                }
                OutlinedTextField(value = draft.city, onValueChange = { draft = draft.copy(city = it) }, label = { Text("City") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.startsAtIso, onValueChange = { draft = draft.copy(startsAtIso = it) }, label = { Text("Starts At (ISO-8601)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.endsAtIso, onValueChange = { draft = draft.copy(endsAtIso = it) }, label = { Text("Ends At (ISO-8601)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.capacityText, onValueChange = { draft = draft.copy(capacityText = it) }, label = { Text("Capacity (optional)") }, modifier = Modifier.fillMaxWidth())
                BsdcButton(
                    label = if (coverUploading) "Uploading Cover..." else "Pick ImgBB Cover (Optional)",
                    secondary = true,
                    busy = coverUploading,
                    leadingIcon = Icons.Rounded.AddPhotoAlternate,
                    onClick = { coverPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                )
                if (draft.coverUrl.isNotBlank()) {
                    BsdcImgbbImage(
                        fullUrl = draft.coverUrl,
                        thumbUrl = draft.coverUrl,
                        contentDescription = draft.title,
                        imageLoader = imageLoader,
                        modifier = Modifier.fillMaxWidth().height(150.dp),
                    )
                }
                BsdcButton(
                    label = "Publish Event",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    onClick = {
                        val issues = ComposerValidationEngine.validateEventDraft(
                            draft.title, draft.description, draft.mode, draft.venue, draft.city,
                            draft.joinUrl, draft.startsAtIso, draft.endsAtIso, draft.capacityText.toIntOrNull(),
                        )
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createEvent(hostUid, draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to create event." }
                            submitting = false
                        }
                    },
                )
            }
        }
    }
    }
}
