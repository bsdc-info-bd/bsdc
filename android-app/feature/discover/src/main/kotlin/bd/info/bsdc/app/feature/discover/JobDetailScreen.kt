package bd.info.bsdc.app.feature.discover

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.People
import androidx.compose.material.icons.rounded.TrendingUp
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcDirectorySkeletonCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcHeroBanner
import bd.info.bsdc.app.core.designsystem.BsdcInfoPill
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.launch

/** One job in full: role, pay, skills, the description, and the one action the reader can take. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun JobDetailScreen(
    slug: String,
    viewerUid: String?,
    viewerSkills: List<String> = emptyList(),
    repository: DiscoverRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenExternal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var job by remember(slug) { mutableStateOf<JobDetailDto?>(null) }
    var loading by remember(slug) { mutableStateOf(true) }
    var failed by remember(slug) { mutableStateOf(false) }
    var reloadNonce by remember(slug) { mutableStateOf(0) }
    var showApply by remember(slug) { mutableStateOf(false) }
    var coverLetter by remember(slug) { mutableStateOf("") }
    var resumeLink by remember(slug) { mutableStateOf("") }
    var applying by remember(slug) { mutableStateOf(false) }
    var applyError by remember(slug) { mutableStateOf<String?>(null) }
    var applied by remember(slug) { mutableStateOf(false) }
    var saved by remember(slug) { mutableStateOf(false) }
    var applicants by remember(slug) { mutableStateOf<List<JobApplicationDto>>(emptyList()) }
    var applicantsBusy by remember(slug) { mutableStateOf(false) }
    var banner by remember(slug) { mutableStateOf<String?>(null) }
    var bannerTone by remember(slug) { mutableStateOf(BsdcTone.OK) }
    var actionBusy by remember(slug) { mutableStateOf(false) }

    LaunchedEffect(slug, viewerUid, reloadNonce) {
        loading = true
        failed = false
        repository.fetchJobDetail(slug)
            .onSuccess { job = it }
            .onFailure { failed = true }
        loading = false

        val loaded = job
        val uid = viewerUid
        if (loaded != null) {
            repository.recordJobView(loaded.id)
            if (!uid.isNullOrBlank()) {
                repository.isOpportunitySaved("job", loaded.id).onSuccess { saved = it }
                if (loaded.posterUid == uid) {
                    applicantsBusy = true
                    repository.fetchJobApplications(loaded.id)
                        .onSuccess { applicants = JobDetailLogic.sortApplicationsForEmployer(it) }
                    applicantsBusy = false
                }
            }
        }
    }

    fun submitApplication(current: JobDetailDto) {
        if (applying) return
        applying = true
        applyError = null
        val resume = if (resumeLink.isBlank()) "" else DiscoverSearchEngine.safeHttpUrlOrEmpty(resumeLink)
        scope.launch {
            repository.applyToJob(current.id, coverLetter, resume)
                .onSuccess {
                    showApply = false
                    applied = true
                    coverLetter = ""
                    resumeLink = ""
                    reloadNonce += 1
                }
                .onFailure { err ->
                    applyError = err.localizedMessage
                        ?: if (bn) "আবেদন জমা হয়নি। আবার চেষ্টা করুন।" else "The application was not sent. Try again."
                }
            applying = false
        }
    }

    fun shareJob(current: JobDetailDto) {
        val url = JobDetailLogic.webUrl(current.slug)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, current.title)
            putExtra(Intent.EXTRA_TEXT, JobDetailLogic.shareText(current.title, current.company, url))
        }
        context.startActivity(Intent.createChooser(intent, if (bn) "চাকরি শেয়ার করুন" else "Share job"))
    }

    fun copyLink(current: JobDetailDto) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        clipboard.setPrimaryClip(ClipData.newPlainText("BSDC job", JobDetailLogic.webUrl(current.slug)))
        banner = if (bn) "লিংক কপি হয়েছে।" else "Link copied."
        bannerTone = BsdcTone.OK
    }

    fun withdraw(current: JobDetailDto) {
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            repository.withdrawMyJobApplication(current.id, viewerUid.orEmpty())
                .onSuccess {
                    banner = if (bn) "আবেদন প্রত্যাহার করা হয়েছে।" else "Application withdrawn."
                    bannerTone = BsdcTone.OK
                    reloadNonce += 1
                }
                .onFailure {
                    banner = if (bn) "প্রত্যাহার ব্যর্থ হয়েছে।" else "Withdrawal failed."
                    bannerTone = BsdcTone.BAD
                }
            actionBusy = false
        }
    }

    fun decide(current: JobDetailDto, application: JobApplicationDto, next: String) {
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            repository.decideApplication(application.id, next)
                .onSuccess {
                    repository.fetchJobApplications(current.id)
                        .onSuccess { applicants = JobDetailLogic.sortApplicationsForEmployer(it) }
                    banner = if (bn) "আবেদনের অবস্থা হালনাগাদ হয়েছে।" else "Application updated."
                    bannerTone = BsdcTone.OK
                }
                .onFailure {
                    banner = if (bn) "হালনাগাদ ব্যর্থ হয়েছে।" else "Update failed."
                    bannerTone = BsdcTone.BAD
                }
            actionBusy = false
        }
    }

    val current = job
    val resumeValid = resumeLink.isBlank() || DiscoverSearchEngine.safeHttpUrlOrEmpty(resumeLink).isNotBlank()

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = if (bn) "ফিরে যান" else "Back",
                )
            }
            Text(
                text = current?.title ?: (if (bn) "চাকরি" else "Job"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            current?.let { loaded ->
                IconButton(onClick = { copyLink(loaded) }) {
                    Icon(Icons.Rounded.ContentCopy, contentDescription = if (bn) "লিংক কপি" else "Copy link")
                }
                IconButton(
                    onClick = {
                        if (viewerUid.isNullOrBlank()) {
                            onSignInRequired()
                        } else {
                            scope.launch {
                                repository.toggleSavedOpportunity(
                                    kind = "job",
                                    remoteId = loaded.id,
                                    slug = loaded.slug,
                                    title = loaded.title,
                                    subtitle = loaded.company,
                                    nowMillis = System.currentTimeMillis(),
                                ).onSuccess { nowSaved ->
                                    saved = nowSaved
                                    banner = if (nowSaved) {
                                        if (bn) "চাকরি সংরক্ষিত হয়েছে।" else "Job saved."
                                    } else {
                                        if (bn) "সংরক্ষণ থেকে সরানো হয়েছে।" else "Removed from saved."
                                    }
                                    bannerTone = BsdcTone.OK
                                }
                            }
                        }
                    },
                ) {
                    Icon(
                        imageVector = if (saved) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                        contentDescription = if (bn) "সংরক্ষণ" else "Save",
                    )
                }
            }
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

                failed -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    BsdcEmptyState(
                        icon = Icons.Rounded.Work,
                        title = if (bn) "চাকরি লোড করা যায়নি" else "Job could not be loaded",
                        subtitle = if (bn) "সংযোগ দেখে আবার চেষ্টা করুন।" else "Check your connection and try again.",
                        modifier = Modifier.padding(16.dp),
                        actionLabel = if (bn) "আবার চেষ্টা করুন" else "Try again",
                        onAction = { reloadNonce += 1 },
                    )
                }

                current == null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    BsdcEmptyState(
                        icon = Icons.Rounded.Work,
                        title = if (bn) "চাকরিটি পাওয়া যায়নি" else "Job not found",
                        subtitle = if (bn) "এটি সরানো হয়ে থাকতে পারে।" else "It may have been removed.",
                        modifier = Modifier.padding(16.dp),
                        actionLabel = if (bn) "ফিরে যান" else "Go back",
                        onAction = onBack,
                    )
                }

                else -> {
                    val live = JobDetailLogic.isLive(current.status, current.expiresAt, System.currentTimeMillis())
                    val isOwner = viewerUid != null && viewerUid == current.posterUid
                    val externalUrl = DiscoverSearchEngine.safeHttpUrlOrEmpty(current.applyUrl)
                    val state = JobDetailLogic.applyState(
                        live = live,
                        isOwner = isOwner,
                        signedIn = !viewerUid.isNullOrBlank(),
                        myStatus = current.myStatus,
                        externalUrl = externalUrl,
                    )
                    val skills = JobDetailLogic.skillChips(current.skills)

                    BsdcResponsiveContainer(modifier = Modifier.fillMaxSize()) {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            item {
                                BsdcHeroBanner(
                                    title = current.title,
                                    subtitle = listOf(current.company, current.city.ifBlank { current.country })
                                        .filter { it.isNotBlank() }
                                        .joinToString(" · "),
                                    eyebrow = if (bn) "চাকরির সুযোগ" else "Job opportunity",
                                    icon = Icons.Rounded.Work,
                                    stats = buildList {
                                        add(
                                            (if (bn) "আবেদন" else "Applicants") to
                                                BanglaDigitFormatter.formatCount(current.applicationsCount.toLong(), language),
                                        )
                                        add((if (bn) "ধরন" else "Type") to current.jobType.replace("_", " "))
                                        if (current.workMode.isNotBlank()) {
                                            add((if (bn) "কাজ" else "Mode") to current.workMode)
                                        }
                                    },
                                    primaryActionLabel = when (state) {
                                        JobDetailLogic.ApplyState.IN_APP -> if (bn) "আবেদন করুন" else "Apply now"
                                        JobDetailLogic.ApplyState.EXTERNAL -> if (bn) "কোম্পানির সাইটে আবেদন" else "Apply on site"
                                        JobDetailLogic.ApplyState.SIGN_IN -> if (bn) "সাইন ইন করে আবেদন" else "Sign in to apply"
                                        else -> null
                                    },
                                    onPrimaryAction = {
                                        when (state) {
                                            JobDetailLogic.ApplyState.IN_APP -> showApply = true
                                            JobDetailLogic.ApplyState.EXTERNAL -> onOpenExternal(externalUrl)
                                            JobDetailLogic.ApplyState.SIGN_IN -> onSignInRequired()
                                            else -> Unit
                                        }
                                    },
                                    secondaryActionLabel = if (bn) "শেয়ার" else "Share",
                                    onSecondaryAction = { shareJob(current) },
                                )
                            }

                            item {
                                BsdcCard {
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        BsdcBadge(label = current.workMode.uppercase(), tone = BsdcTone.INFO)
                                        BsdcBadge(
                                            label = current.jobType.replace("_", " ").uppercase(),
                                            tone = BsdcTone.NEUTRAL,
                                        )
                                        BsdcBadge(label = current.level.uppercase(), tone = BsdcTone.NEUTRAL)
                                        if (current.city.isNotBlank()) {
                                            BsdcBadge(label = current.city, tone = BsdcTone.NEUTRAL)
                                        }
                                        if (!live) {
                                            BsdcBadge(
                                                label = if (bn) "বন্ধ" else "CLOSED",
                                                tone = BsdcTone.WARN,
                                            )
                                        }
                                    }
                                    BsdcInfoPill(
                                        text = DiscoverSearchEngine.formatCompensation(
                                            current.salaryMin,
                                            current.salaryMax,
                                            current.salaryCurrency,
                                            current.salaryPeriod,
                                            bn,
                                        ),
                                        icon = Icons.Rounded.TrendingUp,
                                        tone = BsdcTone.OK,
                                    )
                                    val yearly = JobDetailLogic.yearlyEquivalent(
                                        current.salaryMin,
                                        current.salaryMax,
                                        current.salaryCurrency,
                                        current.salaryPeriod,
                                    )
                                    if (yearly.isNotBlank()) {
                                        Text(
                                            text = if (bn) {
                                                "বার্ষিক হিসাবে প্রায় $yearly"
                                            } else {
                                                "About $yearly a year"
                                            },
                                            style = MaterialTheme.typography.bodySmall,
                                            color = BsdcThemeTokens.colors.mutedText,
                                        )
                                    }
                                    if (viewerSkills.isNotEmpty() && current.skills.isNotEmpty()) {
                                        val match = DiscoverSearchEngine.skillMatchPercent(
                                            current.skills,
                                            viewerSkills,
                                        )
                                        if (match > 0) {
                                            LinearProgressIndicator(
                                                progress = { match / 100f },
                                                modifier = Modifier.fillMaxWidth(),
                                            )
                                            Text(
                                                text = if (bn) {
                                                    "$match% দক্ষতা মিলেছে আপনার প্রোফাইলের সাথে"
                                                } else {
                                                    "$match% of the skills are already on your profile"
                                                },
                                                style = MaterialTheme.typography.labelMedium,
                                                color = BsdcThemeTokens.colors.mutedText,
                                            )
                                        }
                                    }
                                }
                            }

                            if (!banner.isNullOrBlank()) {
                                item {
                                    BsdcStatusBanner(title = banner.orEmpty(), body = "", tone = bannerTone)
                                }
                            }

                            if (!live) {
                                item {
                                    BsdcStatusBanner(
                                        title = if (bn) "এই চাকরিটি বন্ধ" else "This role is closed",
                                        body = if (bn) "এখন নতুন আবেদন নেওয়া হচ্ছে না।" else "New applications are no longer accepted.",
                                        tone = BsdcTone.WARN,
                                    )
                                }
                            }

                            if (applied) {
                                item {
                                    BsdcStatusBanner(
                                        title = if (bn) "আবেদন জমা হয়েছে" else "Application submitted",
                                        body = if (bn) "নিয়োগকর্তা আপনার আবেদন দেখতে পাবেন।" else "The employer can now see your application.",
                                        tone = BsdcTone.OK,
                                    )
                                }
                            } else if (!current.myStatus.isNullOrBlank()) {
                                item {
                                    BsdcCard {
                                        BsdcSectionHeader(
                                            title = if (bn) "আপনার আবেদন" else "Your application",
                                            subtitle = JobDetailLogic.applicationStatusLabel(
                                                current.myStatus.orEmpty(),
                                                bn,
                                            ),
                                        )
                                        LinearProgressIndicator(
                                            progress = {
                                                JobDetailLogic.applicationProgress(current.myStatus.orEmpty()) / 100f
                                            },
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        if (JobDetailLogic.canWithdraw(current.myStatus)) {
                                            BsdcButton(
                                                label = if (bn) "আবেদন প্রত্যাহার" else "Withdraw application",
                                                secondary = true,
                                                enabled = !actionBusy,
                                                onClick = { withdraw(current) },
                                                modifier = Modifier.fillMaxWidth(),
                                            )
                                        }
                                    }
                                }
                            }

                            item {
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    when (state) {
                                        JobDetailLogic.ApplyState.EXTERNAL -> BsdcButton(
                                            label = if (bn) "কোম্পানির সাইটে আবেদন" else "Apply on the company site",
                                            onClick = { onOpenExternal(externalUrl) },
                                            leadingIcon = Icons.Rounded.Language,
                                        )
                                        JobDetailLogic.ApplyState.IN_APP -> BsdcButton(
                                            label = if (bn) "আবেদন করুন" else "Apply now",
                                            onClick = { showApply = true },
                                            leadingIcon = Icons.Rounded.Work,
                                        )
                                        JobDetailLogic.ApplyState.SIGN_IN -> BsdcButton(
                                            label = if (bn) "আবেদন করতে সাইন ইন করুন" else "Sign in to apply",
                                            onClick = onSignInRequired,
                                            secondary = true,
                                        )
                                        JobDetailLogic.ApplyState.OWN_POST -> Text(
                                            text = if (bn) "এটি আপনার পোস্ট করা চাকরি।" else "You posted this role.",
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                        JobDetailLogic.ApplyState.APPLIED,
                                        JobDetailLogic.ApplyState.CLOSED -> Unit
                                    }
                                    BsdcButton(
                                        label = if (bn) "শেয়ার" else "Share",
                                        onClick = { shareJob(current) },
                                        secondary = true,
                                        leadingIcon = Icons.Rounded.Share,
                                    )
                                }
                            }

                            if (applyError != null) {
                                item {
                                    BsdcStatusBanner(
                                        title = if (bn) "সমস্যা হয়েছে" else "Something went wrong",
                                        body = applyError ?: "",
                                        tone = BsdcTone.BAD,
                                    )
                                }
                            }

                            if (skills.isNotEmpty()) {
                                item {
                                    BsdcCard {
                                        BsdcSectionHeader(title = if (bn) "দক্ষতা" else "Skills")
                                        FlowRow(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp),
                                            modifier = Modifier.padding(top = 8.dp),
                                        ) {
                                            skills.forEach { skill ->
                                                BsdcBadge(label = skill, tone = BsdcTone.NEUTRAL)
                                            }
                                        }
                                    }
                                }
                            }

                            if (current.description.isNotBlank()) {
                                item {
                                    BsdcCard {
                                        BsdcSectionHeader(title = if (bn) "বিবরণ" else "About the role")
                                        Text(
                                            text = current.description,
                                            style = MaterialTheme.typography.bodyMedium,
                                            modifier = Modifier.padding(top = 8.dp),
                                        )
                                    }
                                }
                            }

                            if (isOwner) {
                                item {
                                    BsdcSectionHeader(
                                        title = if (bn) "আবেদনকারীরা" else "Applicants",
                                        subtitle = if (applicants.isEmpty()) {
                                            if (bn) "এখনো কেউ আবেদন করেনি।" else "Nobody has applied yet."
                                        } else {
                                            if (bn) {
                                                "${applicants.size}টি আবেদন · ${applicants.count { !JobDetailLogic.isDecided(it.status) }}টি সিদ্ধান্ত বাকি"
                                            } else {
                                                "${applicants.size} total · ${applicants.count { !JobDetailLogic.isDecided(it.status) }} awaiting a decision"
                                            }
                                        },
                                    )
                                }
                                if (applicantsBusy) {
                                    items(2) { BsdcDirectorySkeletonCard() }
                                }
                                items(applicants, key = { it.id }) { application ->
                                    BsdcCard {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            BsdcAvatar(
                                                avatarUrl = application.applicant?.avatarUrl,
                                                displayName = application.applicant?.displayName
                                                    ?: application.applicant?.username
                                                    ?: (if (bn) "আবেদনকারী" else "Applicant"),
                                                imageLoader = imageLoader,
                                                size = 42.dp,
                                            )
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = application.applicant?.displayName
                                                        ?: application.applicant?.username
                                                        ?: (if (bn) "আবেদনকারী" else "Applicant"),
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                Text(
                                                    text = JobDetailLogic.applicationStatusLabel(application.status, bn),
                                                    style = MaterialTheme.typography.labelMedium,
                                                    color = BsdcThemeTokens.colors.mutedText,
                                                )
                                            }
                                            if (JobDetailLogic.isDecided(application.status)) {
                                                BsdcBadge(
                                                    label = JobDetailLogic.applicationStatusLabel(application.status, bn),
                                                    tone = BsdcTone.NEUTRAL,
                                                )
                                            }
                                        }
                                        if (application.coverLetter.isNotBlank()) {
                                            Text(
                                                text = application.coverLetter,
                                                style = MaterialTheme.typography.bodySmall,
                                                maxLines = 5,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                        val resume = DiscoverSearchEngine.safeHttpUrlOrEmpty(application.resumeUrl)
                                        if (resume.isNotBlank()) {
                                            BsdcButton(
                                                label = if (bn) "রিজিউমি খুলুন" else "Open résumé",
                                                secondary = true,
                                                onClick = { onOpenExternal(resume) },
                                            )
                                        }
                                        val actions = JobDetailLogic.employerActionsFor(application.status)
                                        if (actions.isNotEmpty()) {
                                            HorizontalDivider()
                                            FlowRow(
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                            ) {
                                                actions.forEach { next ->
                                                    BsdcButton(
                                                        label = JobDetailLogic.applicationStatusLabel(next, bn),
                                                        secondary = next != "hired",
                                                        enabled = !actionBusy,
                                                        onClick = { decide(current, application, next) },
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (showApply) {
                        AlertDialog(
                            onDismissRequest = { if (!applying) showApply = false },
                            title = { Text(current.title) },
                            text = {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = coverLetter,
                                        onValueChange = { coverLetter = it },
                                        label = { Text(if (bn) "কভার লেটার" else "Cover letter") },
                                        supportingText = {
                                            Text(
                                                if (bn) {
                                                    "কমপক্ষে ${BanglaDigitFormatter.formatCount(JobDetailLogic.MIN_COVER_LETTER.toLong(), language)} অক্ষর"
                                                } else {
                                                    "At least ${JobDetailLogic.MIN_COVER_LETTER} characters"
                                                },
                                            )
                                        },
                                        isError = coverLetter.isNotBlank() && !JobDetailLogic.coverLetterValid(coverLetter),
                                        minLines = 4,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    OutlinedTextField(
                                        value = resumeLink,
                                        onValueChange = { resumeLink = it },
                                        label = { Text(if (bn) "রিজিউমি লিংক (ঐচ্ছিক)" else "Resume link (optional)") },
                                        supportingText = {
                                            Text(
                                                if (resumeValid) {
                                                    if (bn) "https দিয়ে শুরু হওয়া লিংক" else "An https link"
                                                } else {
                                                    if (bn) "একটি বৈধ https লিংক দিন" else "Enter a valid https link"
                                                },
                                            )
                                        },
                                        isError = !resumeValid,
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    applyError?.let { message ->
                                        Text(text = message, color = MaterialTheme.colorScheme.error)
                                    }
                                }
                            },
                            confirmButton = {
                                TextButton(
                                    enabled = JobDetailLogic.coverLetterValid(coverLetter) && resumeValid && !applying,
                                    onClick = { submitApplication(current) },
                                ) {
                                    Text(if (bn) "জমা দিন" else "Submit")
                                }
                            },
                            dismissButton = {
                                TextButton(enabled = !applying, onClick = { showApply = false }) {
                                    Text(if (bn) "বাতিল" else "Cancel")
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}
