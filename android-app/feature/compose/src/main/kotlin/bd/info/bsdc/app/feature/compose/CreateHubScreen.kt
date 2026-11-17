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
    var showPicker by remember(initialMode) { mutableStateOf(initialMode == CreateHubMode.POST) }

    Column(modifier = modifier.fillMaxSize()) {
        // The picker: one tile per directory, so the reader chooses what they are making
        // rather than decoding a strip of chips. Collapses once a form is open.
        if (showPicker) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    BsdcHeroBanner(
                        title = if (bn) "কী তৈরি করবেন?" else "What will you build?",
                        subtitle = if (bn) {
                            "পোস্ট, ইভেন্ট, চাকরি, গিগ, প্রজেক্ট বা গ্রুপ — এক ট্যাপে শুরু করুন।"
                        } else {
                            "A post, an event, a job, a gig, a project or a group — pick one to start."
                        },
                        eyebrow = if (bn) "তৈরি করুন" else "Create",
                        icon = Icons.Rounded.AddCircleOutline,
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "পোস্ট / নিবন্ধ" else "Post or article",
                        subtitle = if (bn) {
                            "লেখা, কোড স্নিপেট, প্রশ্ন, পোল বা ছবি — সব এক কম্পোজারে।"
                        } else {
                            "Writing, code snippets, questions, polls and photos — one composer."
                        },
                        icon = Icons.Rounded.PhotoLibrary,
                        onClick = {
                            mode = CreateHubMode.POST
                            showPicker = false
                        },
                        badge = if (bn) "মার্কডাউন" else "Markdown",
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "ইভেন্ট" else "Event",
                        subtitle = if (bn) {
                            "মিটআপ, ওয়ার্কশপ বা হ্যাকাথন — সময়, স্থান ও ক্যাপাসিটি সহ।"
                        } else {
                            "A meetup, workshop or hackathon — with time, place and capacity."
                        },
                        icon = Icons.Rounded.Event,
                        tone = BsdcTone.INFO,
                        onClick = {
                            mode = CreateHubMode.EVENT
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "চাকরি" else "Job",
                        subtitle = if (bn) {
                            "পূর্ণকালীন, খণ্ডকালীন বা রিমোট ভূমিকা — বেতন ও দক্ষতা সহ।"
                        } else {
                            "A full-time, part-time or remote role — with pay and skills."
                        },
                        icon = Icons.Rounded.Work,
                        tone = BsdcTone.INFO,
                        onClick = {
                            mode = CreateHubMode.JOB
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "ফ্রিল্যান্স গিগ" else "Freelance gig",
                        subtitle = if (bn) {
                            "একটি নির্দিষ্ট কাজের বাজেট দিন — ফ্রিল্যান্সাররা প্রস্তাব পাঠাবে।"
                        } else {
                            "Scope one piece of work and freelancers send proposals."
                        },
                        icon = Icons.Rounded.Work,
                        tone = BsdcTone.OK,
                        onClick = {
                            mode = CreateHubMode.GIG
                            showPicker = false
                        },
                        badge = if (bn) "প্রস্তাব" else "Proposals",
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "প্রজেক্ট" else "Project",
                        subtitle = if (bn) {
                            "ওপেন-সোর্স প্রজেক্ট দেখান — রিপো, ডেমো ও স্ক্রিনশট সহ।"
                        } else {
                            "Show an open-source project — repository, demo and screenshots."
                        },
                        icon = Icons.Rounded.Code,
                        tone = BsdcTone.NEUTRAL,
                        onClick = {
                            mode = CreateHubMode.PROJECT
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "কমিউনিটি গ্রুপ" else "Community group",
                        subtitle = if (bn) {
                            "একটি বিষয়ভিত্তিক গ্রুপ খুলুন — পাবলিক বা প্রাইভেট।"
                        } else {
                            "Open a group around a topic — public or private."
                        },
                        icon = Icons.Rounded.Groups,
                        tone = BsdcTone.WARN,
                        onClick = {
                            mode = CreateHubMode.GROUP
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcButton(
                        label = if (bn) "একটি ফর্ম খুলুন" else "Open the composer",
                        onClick = { showPicker = false },
                        secondary = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            return
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CreateHubMode.entries.forEach { entry ->
                FilterChip(
                    selected = mode == entry,
                    onClick = { mode = entry },
                    label = { Text(if (bn) entry.labelBn else entry.labelEn) },
                )
            }
            FilterChip(
                selected = false,
                onClick = { showPicker = true },
                label = { Text(if (bn) "ধরন বদলান" else "Change type") },
            )
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
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(JobDraftInput()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val salaryMin = draft.salaryMinText.trim().toIntOrNull()
    val salaryMax = draft.salaryMaxText.trim().toIntOrNull()
    val skills = draft.skillsText.split(",").map { it.trim() }.filter { it.isNotBlank() }
    val issues = ComposerValidationEngine.validateJobDraft(
        draft.title, draft.company, draft.description, draft.workMode, draft.city,
        salaryMin, salaryMax, skills, draft.applyUrl,
    )

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Job Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "চাকরি পোস্ট করুন" else "Post a job opening",
                    subtitle = if (bn) {
                        "ভূমিকা, বেতন আর দক্ষতা স্পষ্ট লিখলে সঠিক প্রার্থী আসে।"
                    } else {
                        "A clear role, pay range and skill list find the right applicant."
                    },
                )
                OutlinedTextField(value = draft.title, onValueChange = { draft = draft.copy(title = it) }, label = { Text(if (bn) "পদের নাম" else "Role title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.company, onValueChange = { draft = draft.copy(company = it) }, label = { Text(if (bn) "প্রতিষ্ঠান" else "Company") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.description, onValueChange = { draft = draft.copy(description = it) }, label = { Text(if (bn) "ভূমিকার বিবরণ (২০+ অক্ষর)" else "Role description (20+ chars)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("onsite", "hybrid", "remote").forEach { mode ->
                        FilterChip(
                            selected = draft.workMode == mode,
                            onClick = { draft = draft.copy(workMode = mode) },
                            label = { Text(mode.uppercase()) },
                        )
                    }
                }
                OutlinedTextField(value = draft.city, onValueChange = { draft = draft.copy(city = it) }, label = { Text(if (bn) "শহর" else "City") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = draft.salaryMinText, onValueChange = { draft = draft.copy(salaryMinText = it.filter(Char::isDigit)) }, label = { Text(if (bn) "সর্বনিম্ন BDT" else "Min BDT") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = draft.salaryMaxText, onValueChange = { draft = draft.copy(salaryMaxText = it.filter(Char::isDigit)) }, label = { Text(if (bn) "সর্বোচ্চ BDT" else "Max BDT") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = draft.skillsText, onValueChange = { draft = draft.copy(skillsText = it) }, label = { Text(if (bn) "দক্ষতা (কমা দিয়ে)" else "Skills (comma-separated)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.applyUrl, onValueChange = { draft = draft.copy(applyUrl = it) }, label = { Text(if (bn) "আবেদনের লিংক (ঐচ্ছিক)" else "Apply URL (optional)") }, modifier = Modifier.fillMaxWidth())
            }
        }

        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "লাইভ প্রিভিউ" else "Live preview",
                    subtitle = if (bn) "প্রার্থীরা এভাবেই দেখবে।" else "This is how applicants will see it.",
                )
                Text(
                    text = draft.title.ifBlank { if (bn) "পদের নাম" else "Role title" },
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = listOf(draft.company, draft.city).filter { it.isNotBlank() }
                        .joinToString(" · ")
                        .ifBlank { if (bn) "প্রতিষ্ঠান" else "Company" },
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = when {
                        salaryMin == null && salaryMax == null -> if (bn) "আলোচনা সাপেক্ষ" else "Negotiable"
                        salaryMin != null && salaryMax != null -> "BDT $salaryMin – $salaryMax /month"
                        salaryMin != null -> "BDT $salaryMin /month"
                        else -> "BDT $salaryMax /month"
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.brandStrong,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    BsdcBadge(label = draft.workMode.uppercase(), tone = BsdcTone.INFO)
                    skills.take(6).forEach { BsdcBadge(label = it.lowercase(), tone = BsdcTone.NEUTRAL) }
                }
            }
        }

        item {
            BsdcCard {
                BsdcSectionHeader(title = if (bn) "প্রকাশের চেকলিস্ট" else "Ready to publish?")
                ChecklistRow(if (bn) "পদের নাম লেখা হয়েছে" else "Role title is written", draft.title.trim().length >= 3)
                ChecklistRow(if (bn) "প্রতিষ্ঠানের নাম" else "Company is named", draft.company.trim().isNotBlank())
                ChecklistRow(
                    if (bn) "বিবরণ ২০+ অক্ষর" else "Description is at least 20 characters",
                    draft.description.trim().length >= 20,
                )
                ChecklistRow(
                    if (bn) "বেতনের ক্রম ঠিক" else "Salary bounds are in order",
                    salaryMax == null || salaryMin == null || salaryMax >= salaryMin,
                    blocking = false,
                )
                if (issues.isNotEmpty()) {
                    Text(
                        text = issues.first(),
                        style = MaterialTheme.typography.bodySmall,
                        color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.warn,
                    )
                }
                BsdcButton(
                    label = if (bn) "চাকরি প্রকাশ করুন" else "Publish job",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    enabled = issues.isEmpty(),
                    onClick = {
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
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GigCreateForm(
    clientUid: String,
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(GigDraftInput()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scopeIdeas = remember {
        listOf(
            "Landing page" to "One responsive page, mobile-first, with the copy you supply.",
            "Logo and identity" to "A wordmark, a mark and the two files a print shop asks for.",
            "API integration" to "Connect one REST API to one screen, with error states handled.",
            "Bug fix sprint" to "A time-boxed pass over a list of reproducible defects.",
        )
    }

    val budgetMin = draft.budgetMinText.trim().toIntOrNull()
    val budgetMax = draft.budgetMaxText.trim().toIntOrNull()
    val days = draft.durationDaysText.trim().toIntOrNull()
    val skills = draft.skillsText.split(",").map { it.trim() }.filter { it.isNotBlank() }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Gig Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "ফ্রিল্যান্স গিগ প্রকাশ করুন" else "Post a freelance gig",
                    subtitle = if (bn) {
                        "যত স্পষ্ট স্কোপ, তত ভালো প্রস্তাব।"
                    } else {
                        "The clearer the scope, the better the proposals."
                    },
                )
                OutlinedTextField(
                    value = draft.title,
                    onValueChange = { draft = draft.copy(title = it) },
                    label = { Text(if (bn) "গিগের শিরোনাম" else "Gig title") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.description,
                    onValueChange = { draft = draft.copy(description = it) },
                    label = { Text(if (bn) "কাজের বিবরণ ও ডেলিভারেবল (২০+ অক্ষর)" else "Scope & deliverables (20+ chars)") },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    scopeIdeas.forEach { (label, body) ->
                        FilterChip(
                            selected = false,
                            onClick = {
                                draft = draft.copy(
                                    title = draft.title.ifBlank { label },
                                    description = if (draft.description.isBlank()) body else draft.description,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = draft.budgetMinText,
                        onValueChange = { draft = draft.copy(budgetMinText = it.filter(Char::isDigit)) },
                        label = { Text(if (bn) "সর্বনিম্ন (BDT)" else "Min budget (BDT)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = draft.budgetMaxText,
                        onValueChange = { draft = draft.copy(budgetMaxText = it.filter(Char::isDigit)) },
                        label = { Text(if (bn) "সর্বোচ্চ (BDT)" else "Max budget (BDT)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
                if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) {
                    Text(
                        text = if (bn) {
                            "সর্বোচ্চ বাজেট সর্বনিম্নের চেয়ে কম হতে পারে না।"
                        } else {
                            "The maximum budget cannot be lower than the minimum."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.warn,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (bn) "ঘণ্টাভিত্তিক হার" else "Hourly billing rate")
                    Switch(checked = draft.isHourly, onCheckedChange = { draft = draft.copy(isHourly = it) })
                }
                OutlinedTextField(
                    value = draft.durationDaysText,
                    onValueChange = { draft = draft.copy(durationDaysText = it.filter(Char::isDigit)) },
                    label = { Text(if (bn) "আনুমানিক দিন" else "Estimated days") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.skillsText,
                    onValueChange = { draft = draft.copy(skillsText = it) },
                    label = { Text(if (bn) "দক্ষতা (কমা দিয়ে আলাদা)" else "Skills (comma-separated)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Kotlin", "Compose", "Android", "React", "Node", "Postgres", "Figma", "SEO")
                        .forEach { suggestion ->
                            FilterChip(
                                selected = skills.any { it.equals(suggestion, ignoreCase = true) },
                                onClick = {
                                    val already = skills.any { it.equals(suggestion, ignoreCase = true) }
                                    val next = if (already) {
                                        skills.filterNot { it.equals(suggestion, ignoreCase = true) }
                                    } else {
                                        skills + suggestion
                                    }
                                    draft = draft.copy(skillsText = next.joinToString(", "))
                                },
                                label = { Text(suggestion) },
                            )
                        }
                }
            }
        }

        // Live preview: what a freelancer will see in the directory.
        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "লাইভ প্রিভিউ" else "Live preview",
                    subtitle = if (bn) "ফ্রিল্যান্সাররা এভাবেই দেখবে।" else "This is how freelancers will see it.",
                )
                Text(
                    text = draft.title.ifBlank { if (bn) "গিগের শিরোনাম" else "Gig title" },
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = when {
                        budgetMin == null && budgetMax == null -> if (bn) "আলোচনা সাপেক্ষ" else "Negotiable"
                        budgetMin != null && budgetMax != null -> "BDT $budgetMin – $budgetMax"
                        budgetMin != null -> "BDT $budgetMin"
                        else -> "BDT $budgetMax"
                    } + if (draft.isHourly) (if (bn) " /ঘণ্টা" else " /hr") else "",
                    style = MaterialTheme.typography.labelLarge,
                    color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.brandStrong,
                )
                if (draft.description.isNotBlank()) {
                    Text(
                        text = draft.description.take(180),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (days != null && days > 0) {
                        BsdcBadge(
                            label = if (bn) "$days দিন" else "$days day delivery",
                            tone = BsdcTone.INFO,
                        )
                    }
                    skills.take(6).forEach { skill ->
                        BsdcBadge(label = skill.lowercase(), tone = BsdcTone.NEUTRAL)
                    }
                }
            }
        }

        // Validation checklist, computed from the same engine the publish button uses.
        item {
            val issues = ComposerValidationEngine.validateGigDraft(
                draft.title,
                draft.description,
                budgetMin,
                budgetMax,
                days,
                skills,
            )
            BsdcCard {
                BsdcSectionHeader(title = if (bn) "প্রকাশের চেকলিস্ট" else "Ready to publish?")
                ChecklistRow(if (bn) "শিরোনাম লেখা হয়েছে" else "Title is written", draft.title.trim().length >= 3)
                ChecklistRow(
                    if (bn) "বিবরণ ২০+ অক্ষর" else "Scope is at least 20 characters",
                    draft.description.trim().length >= 20,
                )
                val budgetOrdered = budgetMax == null || budgetMin == null || budgetMax >= budgetMin
                ChecklistRow(
                    if (bn) "বাজেটের ক্রম ঠিক আছে" else "Budget bounds are in order",
                    budgetOrdered,
                    blocking = false,
                )
                ChecklistRow(
                    if (bn) "কমপক্ষে একটি দক্ষতা" else "At least one skill",
                    skills.isNotEmpty(),
                    blocking = false,
                )
                BsdcButton(
                    label = if (bn) "গিগ প্রকাশ করুন" else "Publish gig",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    enabled = issues.isEmpty(),
                    onClick = {
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
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** One checklist line: a filled tick when satisfied, an outline when not. */
@Composable
private fun ChecklistRow(label: String, done: Boolean, blocking: Boolean = true) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = if (done) "✓" else "○",
            style = MaterialTheme.typography.titleMedium,
            color = when {
                done -> MaterialTheme.colorScheme.primary
                blocking -> MaterialTheme.colorScheme.onSurfaceVariant
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
