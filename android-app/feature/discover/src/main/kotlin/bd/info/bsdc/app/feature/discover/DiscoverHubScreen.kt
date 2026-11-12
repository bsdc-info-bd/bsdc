package bd.info.bsdc.app.feature.discover

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcAvatarCircle
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import coil3.ImageLoader
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DiscoverHubScreen(
    repository: DiscoverRepository,
    imageLoader: ImageLoader,
    viewerUid: String?,
    language: AppLanguage,
    initialSection: DiscoverSection = DiscoverSection.SEARCH,
    onSignInRequired: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenVerifyCode: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    onOpenMarketplace: () -> Unit = {},
    onOpenNewsReader: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val permissionCoordinator = rememberPermissionCoordinator()
    val recentSearches by repository.observeRecentSearches().collectAsState(initial = emptyList())

    var section by rememberSaveable { mutableStateOf(initialSection) }
    var searchInput by rememberSaveable { mutableStateOf("") }
    var selectedKindFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var searchResults by remember { mutableStateOf<List<SearchResultDto>>(emptyList()) }
    var trending by remember { mutableStateOf<List<TrendingSearchDto>>(emptyList()) }
    var searchBusy by remember { mutableStateOf(false) }
    var nearMeCity by remember { mutableStateOf<String?>(null) }

    var groups by remember { mutableStateOf<List<GroupDirectoryDto>>(emptyList()) }
    var events by remember { mutableStateOf<List<EventCalendarDto>>(emptyList()) }
    var jobs by remember { mutableStateOf<List<JobBoardDto>>(emptyList()) }
    var gigs by remember { mutableStateOf<List<GigDto>>(emptyList()) }
    var projects by remember { mutableStateOf<List<ProjectDto>>(emptyList()) }
    var courses by remember { mutableStateOf<List<CourseCatalogDto>>(emptyList()) }
    var people by remember { mutableStateOf<List<FollowSuggestionDto>>(emptyList()) }
    var listBusy by remember { mutableStateOf(false) }
    var bannerMessage by remember { mutableStateOf<String?>(null) }
    var bannerTone by remember { mutableStateOf(BsdcTone.INFO) }

    // Interactive modals: Job apply, Gig proposal, Course outline & quiz
    var applyingJob by remember { mutableStateOf<JobBoardDto?>(null) }
    var coverLetterInput by remember { mutableStateOf("") }
    var resumeUrlInput by remember { mutableStateOf("") }

    var biddingGig by remember { mutableStateOf<GigDto?>(null) }
    var proposalPitch by remember { mutableStateOf("") }
    var proposalBid by remember { mutableStateOf("") }
    var proposalDays by remember { mutableStateOf("7") }

    var activeCourse by remember { mutableStateOf<CourseCatalogDto?>(null) }
    var courseLessons by remember { mutableStateOf<List<CourseOutlineRowDto>>(emptyList()) }
    var courseQuizId by remember { mutableStateOf<String?>(null) }
    var quizQuestions by remember { mutableStateOf<List<QuizQuestionUi>>(emptyList()) }
    val selectedQuizAnswers = remember { mutableStateMapOf<String, String>() }
    var quizGrade by remember { mutableStateOf<GradeResultDto?>(null) }

    fun showInfo(msg: String, tone: BsdcTone = BsdcTone.OK) {
        bannerMessage = msg
        bannerTone = tone
    }

    fun executeSearch(q: String, isVoice: Boolean = false) {
        val clean = DiscoverSearchEngine.sanitizeSearchQuery(q)
        searchInput = clean
        if (clean.isEmpty()) return
        scope.launch {
            searchBusy = true
            val kinds = selectedKindFilter?.let { listOf(it) } ?: emptyList()
            repository.globalSearch(clean, kinds = kinds, isVoice = isVoice)
                .onSuccess { searchResults = it }
                .onFailure { err -> showInfo(err.localizedMessage ?: "Search error", BsdcTone.BAD) }
            searchBusy = false
        }
    }

    val voiceLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val spoken = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (!spoken.isNullOrBlank()) {
                section = DiscoverSection.SEARCH
                executeSearch(spoken, isVoice = true)
            }
        }
    }

    fun launchVoiceSearch() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language.speechLocale)
            putExtra(
                RecognizerIntent.EXTRA_PROMPT,
                if (bn) "BSDC-তে অনুসন্ধান করতে বলুন..." else "Speak to search BSDC...",
            )
        }
        runCatching { voiceLauncher.launch(intent) }.onFailure {
            showInfo(
                if (bn) "এই ডিভাইসে ভয়েস সার্চ সেবা অনুপলব্ধ।" else "Voice recognition service unavailable on this device.",
                BsdcTone.WARN,
            )
        }
    }

    fun loadSectionData(target: DiscoverSection) {
        scope.launch {
            listBusy = true
            when (target) {
                DiscoverSection.SEARCH -> {
                    if (trending.isEmpty()) {
                        repository.fetchTrending().onSuccess { trending = it }
                    }
                }
                DiscoverSection.GROUPS -> repository.fetchGroups().onSuccess { groups = it }
                DiscoverSection.EVENTS -> repository.fetchEvents().onSuccess { events = it }
                DiscoverSection.JOBS -> repository.fetchJobs().onSuccess { jobs = it }
                DiscoverSection.GIGS -> repository.fetchGigs().onSuccess { gigs = it }
                DiscoverSection.PROJECTS -> repository.fetchProjects().onSuccess { projects = it }
                DiscoverSection.COURSES -> repository.fetchCourses().onSuccess { courses = it }
                DiscoverSection.PEOPLE -> {
                    if (!viewerUid.isNullOrBlank()) {
                        repository.fetchFollowSuggestions().onSuccess { people = it }
                    }
                }
            }
            listBusy = false
        }
    }

    LaunchedEffect(section, viewerUid) {
        loadSectionData(section)
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            BsdcCard {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Explore,
                            contentDescription = null,
                            tint = BsdcThemeTokens.colors.brandStrong,
                        )
                        Text(
                            text = if (bn) "অন্বেষণ, সুযোগ ও কমিউনিটি" else "Discover, Opportunities & Learning",
                            style = MaterialTheme.typography.titleLarge,
                        )
                    }

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        DiscoverSection.entries.forEach { tab ->
                            val label = when (tab) {
                                DiscoverSection.SEARCH -> if (bn) "অনুসন্ধান" else "Search"
                                DiscoverSection.GROUPS -> if (bn) "গ্রুপ" else "Groups"
                                DiscoverSection.EVENTS -> if (bn) "ইভেন্ট" else "Events"
                                DiscoverSection.JOBS -> if (bn) "চাকরি" else "Jobs"
                                DiscoverSection.GIGS -> if (bn) "ফ্রিল্যান্স গিগ" else "Gigs"
                                DiscoverSection.PROJECTS -> if (bn) "প্রজেক্ট" else "Projects"
                                DiscoverSection.COURSES -> if (bn) "কোর্স" else "Courses"
                                DiscoverSection.PEOPLE -> if (bn) "সদস্য" else "People"
                            }
                            FilterChip(
                                selected = section == tab,
                                onClick = { section = tab },
                                label = { Text(label) },
                            )
                        }
                        FilterChip(
                            selected = false,
                            onClick = onOpenMarketplace,
                            label = { Text(if (bn) "মার্কেটপ্লেস" else "Market") },
                        )
                        FilterChip(
                            selected = false,
                            onClick = onOpenNewsReader,
                            label = { Text(if (bn) "নিউজ" else "News") },
                        )
                    }
                }
            }
        }

        if (!bannerMessage.isNullOrBlank()) {
            item {
                BsdcStatusBanner(
                    title = bannerMessage.orEmpty(),
                    body = "",
                    tone = bannerTone,
                )
            }
        }

        if (listBusy || searchBusy) {
            item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
        }

        when (section) {
            DiscoverSection.SEARCH -> {
                item {
                    BsdcCard {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            OutlinedTextField(
                                value = searchInput,
                                onValueChange = { searchInput = it },
                                label = { Text(if (bn) "পোস্ট, মানুষ, কোর্স, চাকরি..." else "Search posts, people, courses, jobs...") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                trailingIcon = {
                                    IconButton(onClick = { launchVoiceSearch() }) {
                                        Icon(
                                            imageVector = Icons.Rounded.Mic,
                                            contentDescription = if (bn) "ভয়েস সার্চ" else "Voice Search",
                                        )
                                    }
                                },
                            )
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            val kinds = listOf(null to (if (bn) "সব" else "All"), "post" to "Post", "person" to "Person", "group" to "Group", "course" to "Course", "job" to "Job", "project" to "Project")
                            kinds.forEach { (k, label) ->
                                FilterChip(
                                    selected = selectedKindFilter == k,
                                    onClick = { selectedKindFilter = k },
                                    label = { Text(label) },
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            BsdcButton(
                                label = if (bn) "খুঁজুন" else "Search",
                                leadingIcon = Icons.Rounded.Search,
                                onClick = { executeSearch(searchInput) },
                                enabled = searchInput.isNotBlank() && !searchBusy,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedButton(
                                onClick = {
                                    if (!DiscoverLocationHelper.hasLocationPermission(context)) {
                                        permissionCoordinator.request(DevicePermissionKind.LOCATION)
                                    } else {
                                        scope.launch {
                                            val coords = DiscoverLocationHelper.fetchApproximateCoordinates(context)
                                            if (coords != null) {
                                                repository.resolveCityFromCoords(coords.first, coords.second, language)
                                                    .onSuccess { place ->
                                                        if (place.isNotBlank()) {
                                                            nearMeCity = place
                                                            executeSearch(place)
                                                        }
                                                    }
                                            }
                                        }
                                    }
                                },
                            ) {
                                Icon(Icons.Rounded.LocationOn, contentDescription = null)
                                Spacer(modifier = Modifier.size(4.dp))
                                Text(nearMeCity ?: (if (bn) "নিকটস্থ" else "Near me"))
                            }
                        }
                    }
                }

                if (trending.isNotEmpty() && searchResults.isEmpty()) {
                    item {
                        BsdcCard {
                            Text(
                                text = if (bn) "জনপ্রিয় অনুসন্ধান" else "Trending searches",
                                style = MaterialTheme.typography.titleSmall,
                            )
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                trending.forEach { t ->
                                    AssistChip(
                                        onClick = { executeSearch(t.term) },
                                        label = { Text("${t.term} (${t.uses})") },
                                    )
                                }
                            }
                        }
                    }
                }

                if (recentSearches.isNotEmpty()) {
                    item {
                        BsdcCard {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = if (bn) "সাম্প্রতিক অনুসন্ধান" else "Recent searches",
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                IconButton(onClick = { scope.launch { repository.clearRecentSearches() } }) {
                                    Icon(Icons.Rounded.DeleteSweep, contentDescription = "Clear")
                                }
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                recentSearches.forEach { s ->
                                    AssistChip(
                                        onClick = { executeSearch(s.query) },
                                        label = { Text(if (s.isVoiceQuery) "🎙 ${s.query}" else s.query) },
                                    )
                                }
                            }
                        }
                    }
                }

                items(searchResults, key = { "${it.kind}_${it.id}" }) { row ->
                    BsdcCard(
                        modifier = Modifier.clickable {
                            when (row.kind.lowercase()) {
                                "post" -> onOpenPost(row.slug.ifBlank { row.id })
                                "person" -> onOpenProfile(row.slug.ifBlank { row.id })
                                "group" -> section = DiscoverSection.GROUPS
                                "course" -> section = DiscoverSection.COURSES
                                "job" -> section = DiscoverSection.JOBS
                                "project" -> section = DiscoverSection.PROJECTS
                                else -> Unit
                            }
                        },
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            BsdcAvatarCircle(initials = row.title.ifBlank { row.kind }, size = 40.dp)
                            Column(modifier = Modifier.weight(1f)) {
                                BsdcBadge(label = row.kind.uppercase(), tone = BsdcTone.INFO)
                                Text(text = row.title, style = MaterialTheme.typography.titleMedium)
                                if (row.subtitle.isNotBlank()) {
                                    Text(
                                        text = row.subtitle,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            DiscoverSection.GROUPS -> {
                if (groups.isEmpty() && !listBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.Groups,
                            title = if (bn) "কোনো গ্রুপ পাওয়া যায়নি" else "No groups yet",
                            subtitle = if (bn) "কমিউনিটি গ্রুপ এখানে দেখা যাবে।" else "Community developer groups appear here.",
                        )
                    }
                }
                items(groups, key = { it.id }) { g ->
                    BsdcCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(text = g.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text(
                                    text = "${g.privacy.uppercase()} • ${BanglaDigitFormatter.formatCount(g.membersCount.toLong(), language)} ${if (bn) "সদস্য" else "members"}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (g.myRole != null) {
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            repository.leaveGroup(g.id).onSuccess { loadSectionData(DiscoverSection.GROUPS) }
                                        }
                                    },
                                ) { Text(if (bn) "ছেড়ে দিন" else "Leave") }
                            } else {
                                BsdcButton(
                                    label = if (g.requestStatus == "pending") {
                                        if (bn) "অপেক্ষমান" else "Pending"
                                    } else {
                                        if (bn) "যোগ দিন" else "Join"
                                    },
                                    enabled = g.requestStatus != "pending",
                                    onClick = {
                                        if (viewerUid.isNullOrBlank()) {
                                            onSignInRequired()
                                        } else {
                                            scope.launch {
                                                repository.joinGroup(g.id).onSuccess { loadSectionData(DiscoverSection.GROUPS) }
                                            }
                                        }
                                    },
                                )
                            }
                        }
                        if (g.description.isNotBlank()) {
                            Text(text = g.description, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            DiscoverSection.EVENTS -> {
                if (events.isEmpty() && !listBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.Event,
                            title = if (bn) "কোনো আসন্ন ইভেন্ট নেই" else "No upcoming events",
                            subtitle = if (bn) "মিটআপ ও হ্যাকাথন এখানে তালিকাভুক্ত হবে।" else "Developer meetups & workshops appear here.",
                        )
                    }
                }
                items(events, key = { it.id }) { ev ->
                    BsdcCard {
                        if (ev.coverUrl.isNotBlank()) {
                            BsdcImgbbImage(
                                fullUrl = ev.coverUrl,
                                thumbUrl = ev.coverUrl,
                                contentDescription = ev.title,
                                imageLoader = imageLoader,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            BsdcBadge(label = ev.mode.uppercase(), tone = BsdcTone.INFO)
                            val goingTxt = BanglaDigitFormatter.formatCount(ev.goingCount.toLong(), language)
                            BsdcBadge(label = if (bn) "${goingTxt} অংশগ্রহণ" else "$goingTxt going", tone = BsdcTone.OK)
                        }
                        Text(text = ev.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        val place = listOf(ev.venue, ev.city).filter { it.isNotBlank() }.joinToString(", ")
                        if (place.isNotBlank()) {
                            Text(text = place, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(text = ev.startsAt.take(16).replace("T", " "), style = MaterialTheme.typography.labelMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("going" to (if (bn) "যাচ্ছি" else "Going"), "interested" to (if (bn) "আগ্রহী" else "Interested")).forEach { (st, lbl) ->
                                FilterChip(
                                    selected = ev.myStatus == st,
                                    onClick = {
                                        if (viewerUid.isNullOrBlank()) {
                                            onSignInRequired()
                                        } else {
                                            scope.launch {
                                                repository.rsvpEvent(ev.id, st).onSuccess { loadSectionData(DiscoverSection.EVENTS) }
                                            }
                                        }
                                    },
                                    label = { Text(lbl) },
                                )
                            }
                        }
                    }
                }
            }

            DiscoverSection.JOBS -> {
                if (jobs.isEmpty() && !listBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.Work,
                            title = if (bn) "কোনো চাকরির বিজ্ঞপ্তি নেই" else "No open job listings",
                            subtitle = if (bn) "বাংলাদেশি টেক কোম্পানির চাকরির খবর এখানে পাবেন।" else "Engineering & software positions appear here.",
                        )
                    }
                }
                items(jobs, key = { it.id }) { job ->
                    BsdcCard {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            BsdcBadge(label = job.workMode.uppercase(), tone = BsdcTone.INFO)
                            BsdcBadge(label = job.jobType.replace("_", " ").uppercase(), tone = BsdcTone.NEUTRAL)
                        }
                        Text(text = job.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            text = "${job.company} • ${job.city.ifBlank { "Bangladesh" }}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            text = DiscoverSearchEngine.formatCompensation(
                                job.salaryMin,
                                job.salaryMax,
                                job.salaryCurrency,
                                job.salaryPeriod,
                                bn,
                            ),
                            style = MaterialTheme.typography.labelLarge,
                            color = BsdcThemeTokens.colors.brandStrong,
                        )
                        if (job.myStatus != null) {
                            BsdcBadge(label = "Status: ${job.myStatus}", tone = BsdcTone.OK)
                        } else {
                            BsdcButton(
                                label = if (bn) "আবেদন করুন" else "Apply Now",
                                onClick = {
                                    if (viewerUid.isNullOrBlank()) {
                                        onSignInRequired()
                                    } else {
                                        applyingJob = job
                                        coverLetterInput = ""
                                        resumeUrlInput = ""
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }

            DiscoverSection.GIGS -> {
                if (gigs.isEmpty() && !listBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.Work,
                            title = if (bn) "কোনো ফ্রিল্যান্স গিগ নেই" else "No open freelance gigs",
                            subtitle = if (bn) "কনট্রাক্ট ও ফ্রিল্যান্স কাজের প্রস্তাব দিন।" else "Freelance contracts appear here.",
                        )
                    }
                }
                items(gigs, key = { it.id }) { gig ->
                    BsdcCard {
                        Text(text = gig.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            text = DiscoverSearchEngine.formatCompensation(
                                gig.budgetMin,
                                gig.budgetMax,
                                gig.currency,
                                if (gig.isHourly) "hr" else "fixed",
                                bn,
                            ),
                            style = MaterialTheme.typography.labelLarge,
                            color = BsdcThemeTokens.colors.brandStrong,
                        )
                        if (gig.description.isNotBlank()) {
                            Text(text = gig.description.take(180), style = MaterialTheme.typography.bodySmall)
                        }
                        BsdcButton(
                            label = if (bn) "প্রস্তাব পাঠান" else "Submit Proposal",
                            onClick = {
                                if (viewerUid.isNullOrBlank()) {
                                    onSignInRequired()
                                } else {
                                    biddingGig = gig
                                    proposalBid = gig.budgetMin.toString()
                                    proposalDays = gig.durationDays.coerceAtLeast(1).toString()
                                    proposalPitch = ""
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            DiscoverSection.PROJECTS -> {
                if (projects.isEmpty() && !listBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.Code,
                            title = if (bn) "কোনো ওপেন-সোর্স প্রজেক্ট নেই" else "No showcase projects yet",
                            subtitle = if (bn) "বাংলাদেশি ডেভেলপারদের ওপেন-সোর্স প্রজেক্ট।" else "Community open-source projects appear here.",
                        )
                    }
                }
                items(projects, key = { it.id }) { proj ->
                    BsdcCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(text = proj.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                if (proj.tagline.isNotBlank()) {
                                    Text(text = proj.tagline, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            OutlinedButton(
                                onClick = {
                                    if (viewerUid.isNullOrBlank()) {
                                        onSignInRequired()
                                    } else {
                                        scope.launch {
                                            repository.toggleProjectStar(proj.id).onSuccess {
                                                loadSectionData(DiscoverSection.PROJECTS)
                                            }
                                        }
                                    }
                                },
                            ) {
                                Icon(Icons.Rounded.Star, contentDescription = null)
                                Spacer(modifier = Modifier.size(4.dp))
                                Text(BanglaDigitFormatter.formatCount(proj.starsCount.toLong(), language))
                            }
                        }
                        val repo = DiscoverSearchEngine.safeHttpUrlOrEmpty(proj.repoUrl)
                        if (repo.isNotBlank()) {
                            TextButton(onClick = { onOpenExternal(repo) }) {
                                Text(repo)
                            }
                        }
                    }
                }
            }

            DiscoverSection.COURSES -> {
                if (courses.isEmpty() && !listBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.School,
                            title = if (bn) "কোনো কোর্স প্রকাশিত হয়নি" else "No courses published",
                            subtitle = if (bn) "টিউটোরিয়াল কোর্স ও কুইজ এখানে পাবেন।" else "Interactive courses & certificates appear here.",
                        )
                    }
                }
                items(courses, key = { it.id }) { course ->
                    BsdcCard {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            BsdcBadge(label = course.level.uppercase(), tone = BsdcTone.INFO)
                            if (course.hasCertificate) {
                                BsdcBadge(label = if (bn) "সার্টিফিকেট" else "CERTIFICATE", tone = BsdcTone.OK)
                            }
                        }
                        Text(text = course.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        if (course.summary.isNotBlank()) {
                            Text(text = course.summary, style = MaterialTheme.typography.bodySmall)
                        }
                        if (course.myProgress != null) {
                            LinearProgressIndicator(
                                progress = { (course.myProgress.coerceIn(0, 100)) / 100f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (course.myStatus == null) {
                                BsdcButton(
                                    label = if (bn) "ভর্তি হন" else "Enroll Free",
                                    onClick = {
                                        if (viewerUid.isNullOrBlank()) {
                                            onSignInRequired()
                                        } else {
                                            scope.launch {
                                                repository.enrollInCourse(course.id).onSuccess {
                                                    loadSectionData(DiscoverSection.COURSES)
                                                }
                                            }
                                        }
                                    },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        activeCourse = course
                                        quizQuestions = emptyList()
                                        quizGrade = null
                                        selectedQuizAnswers.clear()
                                        repository.fetchCourseOutline(course.slug).onSuccess { courseLessons = it }
                                        courseQuizId = repository.fetchCourseQuizId(course.id)
                                    }
                                },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(if (bn) "পাঠ্যক্রম ও কুইজ" else "Lessons & Quiz")
                            }
                        }
                    }
                }
            }

            DiscoverSection.PEOPLE -> {
                if (viewerUid.isNullOrBlank()) {
                    item {
                        BsdcCard {
                            Text(
                                text = if (bn) "সদস্য সুপারিশ দেখতে সাইন ইন করুন" else "Sign in for personalized member recommendations",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            BsdcButton(
                                label = if (bn) "সাইন ইন" else "Sign in",
                                onClick = onSignInRequired,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
                items(people, key = { it.uid }) { person ->
                    BsdcCard(modifier = Modifier.clickable { onOpenProfile(person.username.ifBlank { person.uid }) }) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            BsdcAvatarCircle(initials = person.displayName.ifBlank { person.username }, size = 44.dp)
                            Column(modifier = Modifier.weight(1f)) {
                                Text(text = person.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text(
                                    text = "@${person.username} • ${DiscoverSearchEngine.followReasonLabel(person.reason, person.mutualCount, person.sharedSkills, bn)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Apply to Job dialog
    applyingJob?.let { job ->
        AlertDialog(
            onDismissRequest = { applyingJob = null },
            title = { Text(job.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = coverLetterInput,
                        onValueChange = { coverLetterInput = it },
                        label = { Text(if (bn) "কভার লেটার" else "Cover letter") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = resumeUrlInput,
                        onValueChange = { resumeUrlInput = it },
                        label = { Text(if (bn) "রিজিউমি লিংক (ঐচ্ছিক)" else "Resume URL (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            repository.applyToJob(job.id, coverLetterInput, resumeUrlInput)
                                .onSuccess {
                                    applyingJob = null
                                    showInfo(if (bn) "চাকরির আবেদন জমা হয়েছে।" else "Application submitted.")
                                    loadSectionData(DiscoverSection.JOBS)
                                }
                                .onFailure { err -> showInfo(err.localizedMessage ?: "Failed", BsdcTone.BAD) }
                        }
                    },
                ) { Text(if (bn) "জমা দিন" else "Submit") }
            },
            dismissButton = {
                TextButton(onClick = { applyingJob = null }) { Text(if (bn) "বাতিল" else "Cancel") }
            },
        )
    }

    // Bid on Freelance Gig dialog
    biddingGig?.let { gig ->
        AlertDialog(
            onDismissRequest = { biddingGig = null },
            title = { Text(gig.title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = proposalPitch,
                        onValueChange = { proposalPitch = it },
                        label = { Text(if (bn) "আপনার প্রস্তাব" else "Proposal pitch") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = proposalBid,
                        onValueChange = { proposalBid = it },
                        label = { Text(if (bn) "বাজেট (${gig.currency})" else "Bid (${gig.currency})") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = proposalDays,
                        onValueChange = { proposalDays = it },
                        label = { Text(if (bn) "সময় (দিন)" else "Delivery days") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            val bid = proposalBid.toIntOrNull() ?: gig.budgetMin
                            val days = (proposalDays.toIntOrNull() ?: 7).coerceAtLeast(1)
                            repository.submitProposal(gig.id, proposalPitch, bid, days)
                                .onSuccess {
                                    biddingGig = null
                                    showInfo(if (bn) "প্রস্তাব পাঠানো হয়েছে।" else "Proposal submitted.")
                                }
                                .onFailure { err -> showInfo(err.localizedMessage ?: "Failed", BsdcTone.BAD) }
                        }
                    },
                ) { Text(if (bn) "পাঠান" else "Send") }
            },
            dismissButton = {
                TextButton(onClick = { biddingGig = null }) { Text(if (bn) "বাতিল" else "Cancel") }
            },
        )
    }

    // Course Outline & Interactive Quiz dialog
    activeCourse?.let { course ->
        AlertDialog(
            onDismissRequest = { activeCourse = null },
            title = { Text(course.title) },
            text = {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(courseLessons, key = { it.lessonId }) { lesson ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Checkbox(
                                checked = lesson.completed,
                                onCheckedChange = {
                                    if (!viewerUid.isNullOrBlank()) {
                                        scope.launch {
                                            repository.completeLesson(lesson.lessonId).onSuccess {
                                                repository.fetchCourseOutline(course.slug).onSuccess { courseLessons = it }
                                                loadSectionData(DiscoverSection.COURSES)
                                            }
                                        }
                                    }
                                },
                            )
                            Column {
                                Text(text = lesson.title, style = MaterialTheme.typography.titleSmall)
                                if (lesson.body.isNotBlank()) {
                                    Text(text = lesson.body.take(160), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }

                    if (!courseQuizId.isNullOrBlank() && quizQuestions.isEmpty()) {
                        item {
                            BsdcButton(
                                label = if (bn) "কুইজ শুরু করুন" else "Take Course Quiz",
                                onClick = {
                                    if (viewerUid.isNullOrBlank()) {
                                        onSignInRequired()
                                    } else {
                                        scope.launch {
                                            repository.fetchQuizPaper(courseQuizId!!).onSuccess { quizQuestions = it }
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }

                    items(quizQuestions, key = { it.id }) { q ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(text = q.prompt, style = MaterialTheme.typography.titleSmall)
                            q.options.forEach { opt ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.clickable { selectedQuizAnswers[q.id] = opt.id },
                                ) {
                                    RadioButton(
                                        selected = selectedQuizAnswers[q.id] == opt.id,
                                        onClick = { selectedQuizAnswers[q.id] = opt.id },
                                    )
                                    Text(text = opt.label, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }

                    if (quizQuestions.isNotEmpty() && quizGrade == null) {
                        item {
                            BsdcButton(
                                label = if (bn) "কুইজ জমা দিন" else "Submit Quiz",
                                onClick = {
                                    scope.launch {
                                        repository.gradeQuiz(courseQuizId!!, selectedQuizAnswers.toMap())
                                            .onSuccess { quizGrade = it }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }

                    quizGrade?.let { res ->
                        item {
                            BsdcStatusBanner(
                                title = if (res.passed) {
                                    if (bn) "উত্তীর্ণ! স্কোর: ${res.score}%" else "Passed! Score: ${res.score}%"
                                } else {
                                    if (bn) "স্কোর: ${res.score}%" else "Score: ${res.score}%"
                                },
                                body = res.certificateCode?.let { "Certificate: $it" } ?: "",
                                tone = if (res.passed) BsdcTone.OK else BsdcTone.WARN,
                            )
                            res.certificateCode?.let { certCode ->
                                OutlinedButton(
                                    onClick = {
                                        activeCourse = null
                                        onOpenVerifyCode(certCode)
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(if (bn) "সার্টিফিকেট যাচাই করুন" else "Verify Certificate")
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { activeCourse = null }) { Text(if (bn) "বন্ধ করুন" else "Close") }
            },
        )
    }
}
