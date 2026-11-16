package bd.info.bsdc.app.feature.discover

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.launch

/** One project in full: cover, story, tech, star, share, and its repository and demo links. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProjectDetailScreen(
    slug: String,
    viewerUid: String?,
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

    var project by remember(slug) { mutableStateOf<ProjectDto?>(null) }
    var loading by remember(slug) { mutableStateOf(true) }
    var failed by remember(slug) { mutableStateOf(false) }
    var starred by remember(slug) { mutableStateOf(false) }
    var stars by remember(slug) { mutableStateOf(0) }
    var starBusy by remember(slug) { mutableStateOf(false) }
    var actionError by remember(slug) { mutableStateOf<String?>(null) }
    var reloadNonce by remember(slug) { mutableStateOf(0) }

    LaunchedEffect(slug, viewerUid, reloadNonce) {
        loading = true
        failed = false
        repository.fetchProject(slug)
            .onSuccess { loaded ->
                project = loaded
                stars = loaded?.starsCount ?: 0
            }
            .onFailure { failed = true }
        loading = false
        val loaded = project
        val uid = viewerUid
        if (loaded != null && !uid.isNullOrBlank()) {
            repository.fetchViewerStarred(loaded.id, uid)
                .onSuccess { starred = it }
        }
    }

    fun toggleStar(current: ProjectDto) {
        if (viewerUid.isNullOrBlank()) {
            onSignInRequired()
            return
        }
        if (starBusy) return
        starBusy = true
        actionError = null
        scope.launch {
            repository.toggleProjectStar(current.id)
                .onSuccess { nowStarred ->
                    starred = nowStarred
                    stars = (stars + (if (nowStarred) 1 else -1)).coerceAtLeast(0)
                }
                .onFailure { err ->
                    actionError = err.localizedMessage
                        ?: if (bn) "ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" else "That did not work. Try again."
                }
            starBusy = false
        }
    }

    fun shareProject(current: ProjectDto) {
        val url = ProjectDetailLogic.webUrl(current.slug)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, current.name)
            putExtra(Intent.EXTRA_TEXT, ProjectDetailLogic.shareText(current.name, current.tagline, url))
        }
        context.startActivity(Intent.createChooser(intent, if (bn) "প্রজেক্ট শেয়ার করুন" else "Share project"))
    }

    val current = project

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = if (bn) "ফিরে যান" else "Back",
                )
            }
            Text(
                text = current?.name ?: (if (bn) "প্রজেক্ট" else "Project"),
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
                        icon = Icons.Rounded.Code,
                        title = if (bn) "প্রজেক্ট লোড করা যায়নি" else "Project could not be loaded",
                        subtitle = if (bn) "সংযোগ দেখে আবার চেষ্টা করুন।" else "Check your connection and try again.",
                        modifier = Modifier.padding(16.dp),
                        actionLabel = if (bn) "আবার চেষ্টা করুন" else "Try again",
                        onAction = { reloadNonce += 1 },
                    )
                }

                current == null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    BsdcEmptyState(
                        icon = Icons.Rounded.Code,
                        title = if (bn) "প্রজেক্ট পাওয়া যায়নি" else "Project not found",
                        subtitle = if (bn) "এটি সরানো হয়ে থাকতে পারে।" else "It may have been removed.",
                        modifier = Modifier.padding(16.dp),
                        actionLabel = if (bn) "ফিরে যান" else "Go back",
                        onAction = onBack,
                    )
                }

                else -> BsdcResponsiveContainer(modifier = Modifier.fillMaxSize()) {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        item {
                            if (current.coverUrl.isNotBlank()) {
                                BsdcImgbbImage(
                                    fullUrl = current.coverUrl,
                                    thumbUrl = current.coverUrl,
                                    contentDescription = current.name,
                                    imageLoader = imageLoader,
                                    modifier = Modifier.fillMaxWidth().height(220.dp),
                                    targetWidthPx = 960,
                                    cornerRadiusDp = 16,
                                )
                            } else {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(150.dp)
                                        .background(BsdcThemeTokens.colors.brandSoft),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Code,
                                        contentDescription = null,
                                        tint = BsdcThemeTokens.colors.brandStrong,
                                        modifier = Modifier.size(48.dp),
                                    )
                                }
                            }
                        }

                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = current.name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                                if (current.tagline.isNotBlank()) {
                                    Text(
                                        text = current.tagline,
                                        style = MaterialTheme.typography.bodyLarge,
                                    )
                                }
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    BsdcBadge(
                                        label = if (bn) "স্টার ${BanglaDigitFormatter.formatCount(stars.toLong(), language)}" else "Stars ${BanglaDigitFormatter.formatCount(stars.toLong(), language)}",
                                        tone = BsdcTone.INFO,
                                    )
                                    BsdcBadge(
                                        label = current.license.ifBlank { "MIT" },
                                        tone = BsdcTone.NEUTRAL,
                                    )
                                    if (current.lookingForContributors) {
                                        BsdcBadge(
                                            label = if (bn) "অবদানকারী প্রয়োজন" else "Looking for contributors",
                                            tone = BsdcTone.OK,
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
                                BsdcButton(
                                    label = when {
                                        starred && bn -> "স্টার সরান"
                                        starred -> "Unstar"
                                        bn -> "স্টার দিন"
                                        else -> "Star"
                                    },
                                    onClick = { toggleStar(current) },
                                    busy = starBusy,
                                    secondary = starred,
                                    leadingIcon = Icons.Rounded.Star,
                                )
                                BsdcButton(
                                    label = if (bn) "শেয়ার" else "Share",
                                    onClick = { shareProject(current) },
                                    secondary = true,
                                    leadingIcon = Icons.Rounded.Share,
                                )
                                val repo = DiscoverSearchEngine.safeHttpUrlOrEmpty(current.repoUrl)
                                if (repo.isNotBlank()) {
                                    BsdcButton(
                                        label = if (bn) "রিপোজিটরি" else "Repository",
                                        onClick = { onOpenExternal(repo) },
                                        secondary = true,
                                        leadingIcon = Icons.Rounded.Code,
                                    )
                                }
                                val demo = DiscoverSearchEngine.safeHttpUrlOrEmpty(current.demoUrl)
                                if (demo.isNotBlank()) {
                                    BsdcButton(
                                        label = if (bn) "লাইভ ডেমো" else "Live demo",
                                        onClick = { onOpenExternal(demo) },
                                        secondary = true,
                                        leadingIcon = Icons.Rounded.Language,
                                    )
                                }
                            }
                        }

                        actionError?.let { message ->
                            item {
                                BsdcStatusBanner(
                                    title = if (bn) "সমস্যা হয়েছে" else "Something went wrong",
                                    body = message,
                                    tone = BsdcTone.BAD,
                                )
                            }
                        }

                        if (current.description.isNotBlank()) {
                            item {
                                BsdcCard {
                                    Text(
                                        text = current.description,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                            }
                        }

                        val tech = ProjectDetailLogic.techChips(current.tech)
                        if (tech.isNotEmpty()) {
                            item {
                                BsdcCard {
                                    BsdcSectionHeader(title = if (bn) "প্রযুক্তি" else "Built with")
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                        modifier = Modifier.padding(top = 8.dp),
                                    ) {
                                        tech.forEach { name ->
                                            BsdcBadge(label = name, tone = BsdcTone.NEUTRAL)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
