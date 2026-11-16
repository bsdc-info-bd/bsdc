package bd.info.bsdc.app.feature.discover

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.AlertDialog
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
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import kotlinx.coroutines.launch

/** One job in full: role, pay, skills, the description, and the one action the reader can take. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun JobDetailScreen(
    slug: String,
    viewerUid: String?,
    repository: DiscoverRepository,
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

    LaunchedEffect(slug, viewerUid, reloadNonce) {
        loading = true
        failed = false
        repository.fetchJobDetail(slug)
            .onSuccess { job = it }
            .onFailure { failed = true }
        loading = false
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
                    val applicationCount = BanglaDigitFormatter.formatCount(current.applicationsCount.toLong(), language)

                    BsdcResponsiveContainer(modifier = Modifier.fillMaxSize()) {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                                    }
                                    Text(
                                        text = current.title,
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    if (current.company.isNotBlank()) {
                                        Text(text = current.company, style = MaterialTheme.typography.bodyLarge)
                                    }
                                    Text(
                                        text = DiscoverSearchEngine.formatCompensation(
                                            current.salaryMin,
                                            current.salaryMax,
                                            current.salaryCurrency,
                                            current.salaryPeriod,
                                            bn,
                                        ),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = BsdcThemeTokens.colors.brandStrong,
                                    )
                                    Text(
                                        text = if (bn) "আবেদন: $applicationCount" else "Applications: ${current.applicationsCount}",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
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
                                    BsdcStatusBanner(
                                        title = if (bn) "আপনার আবেদন" else "Your application",
                                        body = current.myStatus.orEmpty(),
                                        tone = BsdcTone.INFO,
                                    )
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
