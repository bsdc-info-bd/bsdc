package bd.info.bsdc.app.feature.feed

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.RestoreFromTrash
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
import bd.info.bsdc.app.core.designsystem.bsdcShimmerPlaceholder
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaLightboxDialog
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.ReactionKind
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    repository: FeedRepository,
    imageLoader: ImageLoader,
    viewerUid: String?,
    language: AppLanguage,
    onOpenPost: (FeedPost) -> Unit,
    onOpenTrashChanged: ((Boolean) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selectedTab by remember { mutableStateOf(FeedTab.FOR_YOU) }
    var isLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var posts by remember { mutableStateOf<List<FeedPost>>(emptyList()) }
    var reasonsByPostId by remember { mutableStateOf<Map<String, List<String>>>(emptyMap()) }
    val interactionOverrides = remember { mutableStateMapOf<String, PostInteractionState>() }
    val pollVoteLocalChoice = remember { mutableStateMapOf<String, String>() }
    val hiddenPostIds = remember { mutableStateMapOf<String, Boolean>() }
    val revealedSensitiveIds = remember { mutableStateMapOf<String, Boolean>() }
    var isFromCache by remember { mutableStateOf(false) }
    var newPostsAvailable by remember { mutableIntStateOf(0) }
    var feedbackBanner by remember { mutableStateOf<String?>(null) }

    var lightboxData by remember { mutableStateOf<Pair<String, String>?>(null) }
    var reportTargetPost by remember { mutableStateOf<FeedPost?>(null) }
    var trashSheetOpen by remember { mutableStateOf(false) }
    var trashItems by remember { mutableStateOf<List<FeedTrashItem>>(emptyList()) }
    var trashLoading by remember { mutableStateOf(false) }

    suspend fun load(tab: FeedTab, refreshMode: Boolean) {
        if (refreshMode) isRefreshing = true else isLoading = true
        val bundle = repository.loadFeed(tab = tab, viewerUid = viewerUid)
        posts = bundle.posts
        reasonsByPostId = bundle.reasonsByPostId
        bundle.interactions.forEach { (id, state) ->
            interactionOverrides[id] = state
        }
        isFromCache = bundle.isFromOfflineCache
        newPostsAvailable = 0
        isLoading = false
        isRefreshing = false
    }

    LaunchedEffect(selectedTab, viewerUid) {
        load(selectedTab, refreshMode = false)
    }

    LaunchedEffect(posts.firstOrNull()?.publishedAt) {
        val newest = posts.firstOrNull()?.publishedAt.orEmpty()
        if (newest.isBlank()) return@LaunchedEffect
        delay(25_000L)
        newPostsAvailable = repository.fetchNewPostCount(newest)
    }

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FeedTab.entries.forEach { tab ->
                FilterChip(
                    selected = selectedTab == tab,
                    onClick = { selectedTab = tab },
                    label = {
                        Text(if (language == AppLanguage.BN) tab.labelBn else tab.labelEn)
                    },
                )
            }
            if (viewerUid != null) {
                FilterChip(
                    selected = trashSheetOpen,
                    onClick = {
                        trashSheetOpen = true
                        onOpenTrashChanged?.invoke(true)
                        scope.launch {
                            trashLoading = true
                            trashItems = runCatching { repository.fetchTrash() }.getOrDefault(emptyList())
                            trashLoading = false
                        }
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.DeleteOutline,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    label = { Text(if (language == AppLanguage.BN) "ট্র্যাশ" else "Trash") },
                )
            }
        }

        AnimatedVisibility(visible = isFromCache) {
            BsdcStatusBanner(
                title = if (language == AppLanguage.BN) {
                    "অফলাইন ক্যাশ মোড"
                } else {
                    "Viewing offline cached feed"
                },
                body = if (language == AppLanguage.BN) {
                    "ইন্টারনেট সংযোগ ফিরে এলে স্বয়ংক্রিয়ভাবে নতুন পোস্ট সিঙ্ক হবে।"
                } else {
                    "Pull down to refresh once connectivity returns."
                },
                tone = BsdcTone.WARN,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }

        AnimatedVisibility(visible = feedbackBanner != null) {
            feedbackBanner?.let { msg ->
                BsdcStatusBanner(
                    title = if (language == AppLanguage.BN) "তথ্য" else "Update",
                    body = msg,
                    tone = BsdcTone.INFO,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
        }

        AnimatedVisibility(visible = newPostsAvailable > 0) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.clickable {
                        scope.launch { load(selectedTab, refreshMode = true) }
                    },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(16.dp),
                        )
                        val countStr = BanglaDigitFormatter.formatCount(newPostsAvailable.toLong(), language)
                        Text(
                            text = if (language == AppLanguage.BN) {
                                "${countStr}টি নতুন পোস্ট — রিফ্রেশ করুন"
                            } else {
                                "$countStr new posts — tap to load"
                            },
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { scope.launch { load(selectedTab, refreshMode = true) } },
            modifier = Modifier.fillMaxSize(),
        ) {
            val visiblePosts = posts.filter { hiddenPostIds[it.id] != true }

            when {
                isLoading && visiblePosts.isEmpty() -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        items(4) {
                            FeedPostSkeletonCard()
                        }
                    }
                }

                visiblePosts.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        BsdcEmptyState(
                            icon = Icons.Rounded.CloudOff,
                            title = if (language == AppLanguage.BN) {
                                "এই মুহূর্তে কোনো পোস্ট নেই"
                            } else {
                                "No posts match this stream yet"
                            },
                            subtitle = if (language == AppLanguage.BN) {
                                "অন্য ট্যাব দেখুন অথবা নিচে টেনে রিফ্রেশ করুন।"
                            } else {
                                "Switch tabs above or pull down to sync the latest community posts."
                            },
                            actionLabel = if (language == AppLanguage.BN) "রিফ্রেশ করুন" else "Refresh feed",
                            onAction = { scope.launch { load(selectedTab, refreshMode = true) } },
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        items(visiblePosts, key = { it.id }) { post ->
                            val state = interactionOverrides[post.id] ?: PostInteractionState()
                            val chosenPollOption = pollVoteLocalChoice[post.id]
                            FeedPostCard(
                                post = post,
                                interaction = state,
                                rankingReasons = reasonsByPostId[post.id].orEmpty(),
                                selectedPollOptionId = chosenPollOption,
                                sensitiveRevealed = revealedSensitiveIds[post.id] == true,
                                isOwner = viewerUid != null && viewerUid == post.author?.uid,
                                canMutateSocial = viewerUid != null,
                                imageLoader = imageLoader,
                                language = language,
                                onRevealSensitive = { revealedSensitiveIds[post.id] = true },
                                onOpenPost = { onOpenPost(post) },
                                onOpenImageLightbox = { url -> lightboxData = url to post.title },
                                onToggleReaction = { kind ->
                                    if (viewerUid == null) {
                                        feedbackBanner = "Sign in to react to community posts."
                                        return@FeedPostCard
                                    }
                                    val prev = interactionOverrides[post.id] ?: PostInteractionState()
                                    scope.launch {
                                        runCatching { repository.toggleReaction(post.id, kind) }
                                            .onSuccess { (reacted, resolvedKind, total) ->
                                                interactionOverrides[post.id] = prev.copy(
                                                    reaction = if (reacted) resolvedKind else null,
                                                )
                                                posts = posts.map {
                                                    if (it.id == post.id) it.copy(likes = total) else it
                                                }
                                            }
                                            .onFailure {
                                                feedbackBanner = it.message ?: "Could not update reaction."
                                            }
                                    }
                                },
                                onToggleBookmark = {
                                    if (viewerUid == null) {
                                        feedbackBanner = "Sign in to bookmark posts offline."
                                        return@FeedPostCard
                                    }
                                    val prev = interactionOverrides[post.id] ?: PostInteractionState()
                                    scope.launch {
                                        runCatching { repository.toggleBookmark(post) }
                                            .onSuccess { saved ->
                                                interactionOverrides[post.id] = prev.copy(bookmarked = saved)
                                                feedbackBanner = if (saved) {
                                                    "Saved to offline bookmarks."
                                                } else {
                                                    "Removed from bookmarks."
                                                }
                                            }
                                            .onFailure {
                                                feedbackBanner = it.message ?: "Bookmark update failed."
                                            }
                                    }
                                },
                                onVotePoll = { optionId ->
                                    if (viewerUid == null) {
                                        feedbackBanner = "Sign in to cast your poll vote."
                                        return@FeedPostCard
                                    }
                                    pollVoteLocalChoice[post.id] = optionId
                                    scope.launch {
                                        runCatching { repository.castPollVote(post.id, optionId) }
                                            .onSuccess {
                                                val fresh = repository.fetchPostBySlugOrId(post.id)
                                                if (fresh != null) {
                                                    posts = posts.map { if (it.id == post.id) fresh else it }
                                                }
                                            }
                                            .onFailure {
                                                feedbackBanner = it.message ?: "Poll vote could not be recorded."
                                            }
                                    }
                                },
                                onShare = {
                                    val shareUrl = "https://bsdc.info.bd/p/${post.slug.ifBlank { post.id }}"
                                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_SUBJECT, post.title)
                                        putExtra(Intent.EXTRA_TEXT, "${post.title}\n\n$shareUrl")
                                    }
                                    context.startActivity(Intent.createChooser(shareIntent, "Share BSDC post"))
                                    scope.launch { repository.recordShare(post.id, "native") }
                                },
                                onFollowAuthor = {
                                    val targetUid = post.author?.uid.orEmpty()
                                    if (viewerUid != null && targetUid.isNotBlank()) {
                                        scope.launch {
                                            runCatching { repository.followUser(viewerUid, targetUid) }
                                                .onSuccess { feedbackBanner = "Now following ${post.author?.displayName}." }
                                                .onFailure { feedbackBanner = it.message ?: "Could not follow author." }
                                        }
                                    }
                                },
                                onBlockAuthor = {
                                    val targetUid = post.author?.uid.orEmpty()
                                    if (viewerUid != null && targetUid.isNotBlank()) {
                                        scope.launch {
                                            runCatching { repository.blockUser(viewerUid, targetUid) }
                                                .onSuccess {
                                                    posts.filter { it.author?.uid == targetUid }.forEach {
                                                        hiddenPostIds[it.id] = true
                                                    }
                                                    feedbackBanner = "Blocked author and hid their posts."
                                                }
                                                .onFailure { feedbackBanner = it.message ?: "Could not block user." }
                                        }
                                    }
                                },
                                onMoveToTrash = {
                                    scope.launch {
                                        runCatching { repository.movePostToTrash(post.id) }
                                            .onSuccess {
                                                hiddenPostIds[post.id] = true
                                                feedbackBanner = "Moved post to Trash (30-day recovery window)."
                                            }
                                            .onFailure { feedbackBanner = it.message ?: "Could not delete post." }
                                    }
                                },
                                onOpenReport = { reportTargetPost = post },
                            )
                        }
                    }
                }
            }
        }
    }

    lightboxData?.let { (url, caption) ->
        BsdcMediaLightboxDialog(
            fullUrl = url,
            caption = caption,
            imageLoader = imageLoader,
            onDismiss = { lightboxData = null },
        )
    }

    reportTargetPost?.let { target ->
        if (viewerUid != null) {
            ReportAbuseDialog(
                language = language,
                onDismiss = { reportTargetPost = null },
                onSubmit = { reason, details ->
                    scope.launch {
                        runCatching {
                            repository.submitReport(
                                reporterUid = viewerUid,
                                subjectType = "post",
                                subjectId = target.id,
                                reason = reason,
                                details = details,
                            )
                        }.onSuccess {
                            hiddenPostIds[target.id] = true
                            reportTargetPost = null
                            feedbackBanner = "Report submitted to BSDC moderators."
                        }.onFailure {
                            feedbackBanner = it.message ?: "Could not submit report."
                            reportTargetPost = null
                        }
                    }
                },
            )
        } else {
            reportTargetPost = null
            feedbackBanner = "Sign in to submit moderation reports."
        }
    }

    if (trashSheetOpen) {
        ModalBottomSheet(
            onDismissRequest = {
                trashSheetOpen = false
                onOpenTrashChanged?.invoke(false)
            },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = if (language == AppLanguage.BN) {
                        "ট্র্যাশ বিন (৩০ দিনের মধ্যে পুনরুদ্ধারযোগ্য)"
                    } else {
                        "Trash Bin (30-day recovery)"
                    },
                    style = MaterialTheme.typography.titleMedium,
                )
                if (trashLoading) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                } else if (trashItems.isEmpty()) {
                    Text(
                        text = if (language == AppLanguage.BN) "ট্র্যাশ খালি।" else "Your Trash Bin is empty.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.mutedText,
                        modifier = Modifier.padding(bottom = 24.dp),
                    )
                } else {
                    trashItems.forEach { item ->
                        BsdcCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                BsdcBadge(
                                    label = item.kind.uppercase(),
                                    tone = if (item.moderated) BsdcTone.BAD else BsdcTone.NEUTRAL,
                                )
                                if (item.restorable) {
                                    TextButton(
                                        onClick = {
                                            scope.launch {
                                                runCatching { repository.restoreTrashItem(item) }
                                                    .onSuccess {
                                                        trashItems = trashItems.filterNot { it.id == item.id }
                                                        load(selectedTab, refreshMode = true)
                                                    }
                                            }
                                        },
                                    ) {
                                        Icon(Icons.Rounded.RestoreFromTrash, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text(if (language == AppLanguage.BN) "পুনরুদ্ধার" else "Restore")
                                    }
                                }
                            }
                            Text(
                                text = item.title.ifBlank { item.preview },
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                }
            }
        }
    }
}

@Composable
private fun FeedPostCard(
    post: FeedPost,
    interaction: PostInteractionState,
    rankingReasons: List<String>,
    selectedPollOptionId: String?,
    sensitiveRevealed: Boolean,
    isOwner: Boolean,
    canMutateSocial: Boolean,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onRevealSensitive: () -> Unit,
    onOpenPost: () -> Unit,
    onOpenImageLightbox: (String) -> Unit,
    onToggleReaction: (ReactionKind) -> Unit,
    onToggleBookmark: () -> Unit,
    onVotePoll: (String) -> Unit,
    onShare: () -> Unit,
    onFollowAuthor: () -> Unit,
    onBlockAuthor: () -> Unit,
    onMoveToTrash: () -> Unit,
    onOpenReport: () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    var menuExpanded by remember { mutableStateOf(false) }

    BsdcCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenPost),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f),
            ) {
                BsdcAvatarCircle(
                    initials = (post.author?.displayName ?: "B").take(2),
                    size = 40.dp,
                )
                Column {
                    Text(
                        text = post.author?.displayName ?: "BSDC Member",
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val meta = buildString {
                        if (!post.author?.username.isNullOrBlank()) {
                            append("@${post.author?.username} · ")
                        }
                        append("${post.readingTime} min read")
                    }
                    Text(
                        text = meta,
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.mutedText,
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                if (post.kind != PostKind.POST) {
                    BsdcBadge(
                        label = post.kind.name,
                        tone = when (post.kind) {
                            PostKind.QUESTION -> BsdcTone.INFO
                            PostKind.POLL -> BsdcTone.WARN
                            PostKind.SNIPPET -> BsdcTone.OK
                            else -> BsdcTone.NEUTRAL
                        },
                    )
                }
                Box {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = "More actions")
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        if (canMutateSocial && !isOwner && !post.author?.uid.isNullOrBlank()) {
                            DropdownMenuItem(
                                text = { Text("Follow author") },
                                leadingIcon = { Icon(Icons.Rounded.PersonAdd, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    onFollowAuthor()
                                },
                            )
                        }
                        if (isOwner) {
                            DropdownMenuItem(
                                text = { Text("Move to Trash") },
                                leadingIcon = { Icon(Icons.Rounded.DeleteOutline, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    onMoveToTrash()
                                },
                            )
                        }
                        if (canMutateSocial && !isOwner && !post.author?.uid.isNullOrBlank()) {
                            DropdownMenuItem(
                                text = { Text("Block author") },
                                leadingIcon = { Icon(Icons.Rounded.Block, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    onBlockAuthor()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Report post") },
                                leadingIcon = { Icon(Icons.Rounded.Flag, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    onOpenReport()
                                },
                            )
                        }
                    }
                }
            }
        }

        if (post.isSensitive && !sensitiveRevealed) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(tokens.surfaceElevated)
                    .border(1.dp, tokens.border, RoundedCornerShape(12.dp))
                    .padding(16.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Rounded.VisibilityOff, contentDescription = null, tint = tokens.warn)
                        Text(
                            text = if (language == AppLanguage.BN) {
                                "সংবেদনশীল কন্টেন্ট সতর্কতা"
                            } else {
                                "Sensitive content hidden by preference"
                            },
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                    BsdcButton(
                        label = if (language == AppLanguage.BN) "তবুও দেখুন" else "Reveal post",
                        onClick = onRevealSensitive,
                        secondary = true,
                    )
                }
            }
        } else {
            if (post.title.isNotBlank()) {
                Text(
                    text = post.title,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            val previewText = post.excerpt.ifBlank { post.body.take(240) }
            if (previewText.isNotBlank()) {
                Text(
                    text = previewText,
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.mutedText,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            if (post.kind == PostKind.SNIPPET && post.code.isNotBlank()) {
                BsdcCodeSnippetBlock(
                    code = post.code.lines().take(10).joinToString("\n"),
                    language = post.codeLanguage,
                )
            }

            if (post.kind == PostKind.POLL && post.poll.isNotEmpty()) {
                FeedPollWidget(
                    options = post.poll,
                    selectedOptionId = selectedPollOptionId,
                    language = language,
                    onVote = onVotePoll,
                )
            }

            val primaryImage = post.media.firstOrNull()?.url?.takeIf { it.isNotBlank() }
                ?: post.coverUrl.takeIf { it.isNotBlank() }
            if (primaryImage != null) {
                val thumb = post.media.firstOrNull()?.thumbUrl?.takeIf { it.isNotBlank() } ?: primaryImage
                BsdcImgbbImage(
                    fullUrl = primaryImage,
                    thumbUrl = thumb,
                    contentDescription = post.media.firstOrNull()?.altText ?: post.title,
                    imageLoader = imageLoader,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(210.dp),
                    onTapOpenLightbox = { onOpenImageLightbox(primaryImage) },
                )
            }
        }

        if (post.tags.isNotEmpty() || rankingReasons.isNotEmpty()) {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                rankingReasons.take(2).forEach { reason ->
                    BsdcBadge(label = reason, tone = BsdcTone.OK)
                }
                post.tags.take(4).forEach { tag ->
                    BsdcBadge(label = "#$tag", tone = BsdcTone.NEUTRAL)
                }
            }
        }

        HorizontalDivider(color = tokens.border)

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ReactionButtonWithDock(
                activeReaction = interaction.reaction,
                totalLikes = post.likes,
                language = language,
                onSelectReaction = onToggleReaction,
            )

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .clickable(onClick = onOpenPost)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.ChatBubbleOutline,
                    contentDescription = "Comments",
                    tint = tokens.mutedText,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = BanglaDigitFormatter.formatCount(post.comments.toLong(), language),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.mutedText,
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onToggleBookmark) {
                    Icon(
                        imageVector = if (interaction.bookmarked) {
                            Icons.Rounded.Bookmark
                        } else {
                            Icons.Rounded.BookmarkBorder
                        },
                        contentDescription = "Bookmark",
                        tint = if (interaction.bookmarked) tokens.brandStrong else tokens.mutedText,
                    )
                }
                IconButton(onClick = onShare) {
                    Icon(
                        imageVector = Icons.Rounded.Share,
                        contentDescription = "Share",
                        tint = tokens.mutedText,
                    )
                }
            }
        }
    }
}

@Composable
fun FeedPollWidget(
    options: List<PollOptionModel>,
    selectedOptionId: String?,
    language: AppLanguage,
    onVote: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val totalVotes = options.sumOf { it.votes }.coerceAtLeast(0)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(tokens.surfaceElevated)
            .border(1.dp, tokens.border, RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val pct = if (totalVotes > 0) (option.votes * 100) / totalVotes else 0
            val chosen = option.id == selectedOptionId
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (chosen) tokens.brandSoft else MaterialTheme.colorScheme.surface)
                    .border(
                        width = if (chosen) 1.5.dp else 1.dp,
                        color = if (chosen) tokens.brandStrong else tokens.border,
                        shape = RoundedCornerShape(10.dp),
                    )
                    .clickable { onVote(option.id) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = option.label,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (chosen) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = "${BanglaDigitFormatter.formatCount(pct.toLong(), language)}%",
                        style = MaterialTheme.typography.labelLarge,
                        color = if (chosen) tokens.brandStrong else tokens.mutedText,
                    )
                }
                LinearProgressIndicator(
                    progress = { if (totalVotes > 0) option.votes.toFloat() / totalVotes.toFloat() else 0f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(999.dp)),
                    color = if (chosen) tokens.brandStrong else tokens.mutedText,
                    trackColor = tokens.border,
                )
            }
        }
        val totalFormatted = BanglaDigitFormatter.formatCount(totalVotes.toLong(), language)
        Text(
            text = if (language == AppLanguage.BN) "${totalFormatted}টি ভোট" else "$totalFormatted total votes",
            style = MaterialTheme.typography.labelSmall,
            color = tokens.mutedText,
        )
    }
}

@Composable
private fun FeedPostSkeletonCard() {
    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .bsdcShimmerPlaceholder(),
            )
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    modifier = Modifier
                        .width(140.dp)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .bsdcShimmerPlaceholder(),
                )
                Box(
                    modifier = Modifier
                        .width(96.dp)
                        .height(10.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .bsdcShimmerPlaceholder(),
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(20.dp)
                .clip(RoundedCornerShape(6.dp))
                .bsdcShimmerPlaceholder(),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .clip(RoundedCornerShape(12.dp))
                .bsdcShimmerPlaceholder(),
        )
    }
}

@Composable
fun ReportAbuseDialog(
    language: AppLanguage,
    onDismiss: () -> Unit,
    onSubmit: (ReportReason, String) -> Unit,
) {
    var selected by remember { mutableStateOf(ReportReason.SPAM) }
    var details by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(if (language == AppLanguage.BN) "কন্টেন্ট রিপোর্ট করুন" else "Report post to BSDC moderators")
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ReportReason.entries.forEach { reason ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { selected = reason }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selected == reason, onClick = { selected = reason })
                        Spacer(Modifier.width(4.dp))
                        Text(reason.label(language), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                OutlinedTextField(
                    value = details,
                    onValueChange = { details = it },
                    label = { Text(if (language == AppLanguage.BN) "অতিরিক্ত তথ্য (ঐচ্ছিক)" else "Additional context (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSubmit(selected, details) }) {
                Text(if (language == AppLanguage.BN) "রিপোর্ট পাঠান" else "Submit report")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(if (language == AppLanguage.BN) "বাতিল" else "Cancel")
            }
        },
    )
}
