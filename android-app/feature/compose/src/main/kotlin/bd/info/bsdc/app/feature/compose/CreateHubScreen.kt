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
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
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

@Composable
fun CreateHubScreen(
    viewerUid: String?,
    composeRepository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    initialMode: CreateHubMode = CreateHubMode.POST,
    onSignInRequired: () -> Unit,
    onPostPublished: (PublishedResult) -> Unit,
    onDirectoryCreated: (CreateHubMode, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    if (viewerUid == null) {
        LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
        ) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.AddCircleOutline,
                    title = if (bn) "প্রকাশ করতে সাইন ইন করুন" else "Sign in to create & publish",
                    subtitle = if (bn) {
                        "পোস্ট, প্রশ্ন, পোল, ইভেন্ট, চাকরি, প্রজেক্ট ও গ্রুপ তৈরি করতে আপনার BSDC অ্যাকাউন্টে প্রবেশ করুন।"
                    } else {
                        "Sign in to publish posts, articles, Q&A, polls, snippets, events, jobs, gigs, projects, or groups."
                    },
                    actionLabel = if (bn) "সাইন ইন করুন" else "Sign In",
                    onAction = onSignInRequired,
                )
            }
        }
        return
    }

    var mode by remember(initialMode) { mutableStateOf(initialMode) }

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CreateHubMode.entries.forEach { entry ->
                FilterChip(
                    selected = mode == entry,
                    onClick = { mode = entry },
                    label = { Text(if (bn) entry.labelBn else entry.labelEn) },
                )
            }
        }

        when (mode) {
            CreateHubMode.POST -> PostComposerScreen(
                authorUid = viewerUid,
                composeRepository = composeRepository,
                mediaRepository = mediaRepository,
                imageLoader = imageLoader,
                language = language,
                onPublished = onPostPublished,
            )

            CreateHubMode.EVENT -> EventCreateForm(
                hostUid = viewerUid,
                repository = composeRepository,
                mediaRepository = mediaRepository,
                imageLoader = imageLoader,
                language = language,
                onCreated = { slug -> onDirectoryCreated(CreateHubMode.EVENT, slug) },
            )

            CreateHubMode.JOB -> JobCreateForm(
                posterUid = viewerUid,
                repository = composeRepository,
                language = language,
                onCreated = { slug -> onDirectoryCreated(CreateHubMode.JOB, slug) },
            )

            CreateHubMode.GIG -> GigCreateForm(
                clientUid = viewerUid,
                repository = composeRepository,
                language = language,
                onCreated = { slug -> onDirectoryCreated(CreateHubMode.GIG, slug) },
            )

            CreateHubMode.PROJECT -> ProjectCreateForm(
                ownerUid = viewerUid,
                repository = composeRepository,
                mediaRepository = mediaRepository,
                imageLoader = imageLoader,
                language = language,
                onCreated = { slug -> onDirectoryCreated(CreateHubMode.PROJECT, slug) },
            )

            CreateHubMode.GROUP -> GroupCreateForm(
                repository = composeRepository,
                language = language,
                onCreated = { slug -> onDirectoryCreated(CreateHubMode.GROUP, slug) },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EventCreateForm(
    hostUid: String,
    repository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onCreated: (String) -> Unit,
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun JobCreateForm(
    posterUid: String,
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(JobDraftInput()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Job Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                Text(if (language == AppLanguage.BN) "চাকরি পোস্ট করুন" else "Post a Job Opening", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(value = draft.title, onValueChange = { draft = draft.copy(title = it) }, label = { Text("Role Title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.company, onValueChange = { draft = draft.copy(company = it) }, label = { Text("Company") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.description, onValueChange = { draft = draft.copy(description = it) }, label = { Text("Role Description (20+ chars)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("onsite", "hybrid", "remote").forEach { mode ->
                        FilterChip(
                            selected = draft.workMode == mode,
                            onClick = { draft = draft.copy(workMode = mode) },
                            label = { Text(mode.uppercase()) },
                        )
                    }
                }
                OutlinedTextField(value = draft.city, onValueChange = { draft = draft.copy(city = it) }, label = { Text("City") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = draft.salaryMinText, onValueChange = { draft = draft.copy(salaryMinText = it) }, label = { Text("Min BDT") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = draft.salaryMaxText, onValueChange = { draft = draft.copy(salaryMaxText = it) }, label = { Text("Max BDT") }, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = draft.skillsText, onValueChange = { draft = draft.copy(skillsText = it) }, label = { Text("Skills (comma-separated)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.applyUrl, onValueChange = { draft = draft.copy(applyUrl = it) }, label = { Text("Apply URL (optional)") }, modifier = Modifier.fillMaxWidth())
                BsdcButton(
                    label = "Publish Job",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    onClick = {
                        val issues = ComposerValidationEngine.validateJobDraft(
                            draft.title, draft.company, draft.description, draft.workMode, draft.city,
                            draft.salaryMinText.toIntOrNull(), draft.salaryMaxText.toIntOrNull(),
                            draft.skillsText.split(",").filter { it.isNotBlank() }, draft.applyUrl,
                        )
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createJob(posterUid, draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to create job." }
                            submitting = false
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun GigCreateForm(
    clientUid: String,
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(GigDraftInput()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Gig Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                Text(if (language == AppLanguage.BN) "ফ্রিল্যান্স গিগ প্রকাশ করুন" else "Post a Freelance Gig", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(value = draft.title, onValueChange = { draft = draft.copy(title = it) }, label = { Text("Gig Title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.description, onValueChange = { draft = draft.copy(description = it) }, label = { Text("Scope & Deliverables (20+ chars)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = draft.budgetMinText, onValueChange = { draft = draft.copy(budgetMinText = it) }, label = { Text("Min Budget (BDT)") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = draft.budgetMaxText, onValueChange = { draft = draft.copy(budgetMaxText = it) }, label = { Text("Max Budget (BDT)") }, modifier = Modifier.weight(1f))
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Hourly billing rate")
                    Switch(checked = draft.isHourly, onCheckedChange = { draft = draft.copy(isHourly = it) })
                }
                OutlinedTextField(value = draft.durationDaysText, onValueChange = { draft = draft.copy(durationDaysText = it) }, label = { Text("Estimated Days") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.skillsText, onValueChange = { draft = draft.copy(skillsText = it) }, label = { Text("Skills (comma-separated)") }, modifier = Modifier.fillMaxWidth())
                BsdcButton(
                    label = "Publish Gig",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    onClick = {
                        val issues = ComposerValidationEngine.validateGigDraft(
                            draft.title, draft.description,
                            draft.budgetMinText.toIntOrNull(), draft.budgetMaxText.toIntOrNull(),
                            draft.durationDaysText.toIntOrNull(),
                            draft.skillsText.split(",").filter { it.isNotBlank() },
                        )
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createGig(clientUid, draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to post gig." }
                            submitting = false
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun ProjectCreateForm(
    ownerUid: String,
    repository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onCreated: (String) -> Unit,
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GroupCreateForm(
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(GroupDraftInput(language = language.tag)) }
    var slugEdited by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Group Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                Text(if (language == AppLanguage.BN) "নতুন কমিউনিটি গ্রুপ তৈরি করুন" else "Create a Community Group", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(
                    value = draft.name,
                    onValueChange = { next ->
                        val nextSlug = if (!slugEdited) ComposerValidationEngine.slugify(next, "group") else draft.slug
                        draft = draft.copy(name = next, slug = nextSlug)
                    },
                    label = { Text("Group Name") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.slug,
                    onValueChange = {
                        slugEdited = true
                        draft = draft.copy(slug = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' })
                    },
                    label = { Text("Group Handle (/g/...)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.description,
                    onValueChange = { draft = draft.copy(description = it) },
                    label = { Text("Description") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("public", "private").forEach { priv ->
                        FilterChip(
                            selected = draft.privacy == priv,
                            onClick = { draft = draft.copy(privacy = priv) },
                            label = { Text(priv.uppercase()) },
                        )
                    }
                }
                BsdcButton(
                    label = "Create Group",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    onClick = {
                        val issues = ComposerValidationEngine.validateGroupDraft(draft.slug, draft.name, draft.description)
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createGroupListing(draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to create group." }
                            submitting = false
                        }
                    },
                )
            }
        }
    }
}
