package bd.info.bsdc.app.feature.feed

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Reply
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.ThumbUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaLightboxDialog
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import coil3.ImageLoader
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostDetailScreen(
    postSlugOrId: String,
    initialPost: FeedPost?,
    repository: FeedRepository,
    imageLoader: ImageLoader,
    viewerUid: String?,
    language: AppLanguage,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var post by remember { mutableStateOf(initialPost) }
    var loadingPost by remember { mutableStateOf(initialPost == null) }
    var interaction by remember { mutableStateOf(PostInteractionState()) }
    var selectedPollOptionId by remember { mutableStateOf<String?>(null) }
    var comments by remember { mutableStateOf<List<FeedComment>>(emptyList()) }
    var loadingComments by remember { mutableStateOf(true) }
    var replyTarget by remember { mutableStateOf<FeedComment?>(null) }
    var commentDraft by remember { mutableStateOf("") }
    var submittingComment by remember { mutableStateOf(false) }
    var bannerMessage by remember { mutableStateOf<String?>(null) }
    var lightboxData by remember { mutableStateOf<Pair<String, String>?>(null) }
    var showReportDialog by remember { mutableStateOf(false) }

    LaunchedEffect(postSlugOrId, viewerUid) {
        if (post == null) loadingPost = true
        val fetched = repository.fetchPostBySlugOrId(postSlugOrId)
        if (fetched != null) {
            post = fetched
            if (viewerUid != null) {
                interaction = repository.fetchInteractionState(listOf(fetched.id))[fetched.id]
                    ?: PostInteractionState()
            }
            loadingComments = true
            comments = runCatching { repository.fetchComments(fetched.id, viewerUid) }
                .getOrDefault(emptyList())
            loadingComments = false
        }
        loadingPost = false
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = post?.title?.ifBlank { "Post" } ?: "Post",
                        maxLines = 1,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    val activePost = post
                    if (activePost != null) {
                        IconButton(
                            onClick = {
                                if (viewerUid == null) {
                                    bannerMessage = "Sign in to bookmark posts."
                                    return@IconButton
                                }
                                scope.launch {
                                    runCatching { repository.toggleBookmark(activePost) }
                                        .onSuccess { saved ->
                                            interaction = interaction.copy(bookmarked = saved)
                                        }
                                }
                            },
                        ) {
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
                        IconButton(
                            onClick = {
                                val shareUrl = "https://bsdc.info.bd/p/${activePost.slug.ifBlank { activePost.id }}"
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_SUBJECT, activePost.title)
                                    putExtra(Intent.EXTRA_TEXT, "${activePost.title}\n\n$shareUrl")
                                }
                                context.startActivity(Intent.createChooser(shareIntent, "Share BSDC post"))
                                scope.launch { repository.recordShare(activePost.id, "native") }
                            },
                        ) {
                            Icon(Icons.Rounded.Share, contentDescription = "Share")
                        }
                    }
                },
            )
        },
        bottomBar = {
            val activePost = post
            if (activePost != null && activePost.allowComments) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .border(1.dp, tokens.border)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    replyTarget?.let { parent ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Replying to ${parent.author?.displayName ?: "comment"}",
                                style = MaterialTheme.typography.labelMedium,
                                color = tokens.brandStrong,
                            )
                            TextButton(onClick = { replyTarget = null }) {
                                Text("Cancel")
                            }
                        }
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = commentDraft,
                            onValueChange = { commentDraft = it },
                            placeholder = {
                                Text(
                                    if (viewerUid == null) {
                                        "Sign in to comment..."
                                    } else if (language == AppLanguage.BN) {
                                        "মন্তব্য লিখুন..."
                                    } else {
                                        "Add a thoughtful comment..."
                                    },
                                )
                            },
                            enabled = viewerUid != null && !submittingComment,
                            modifier = Modifier.weight(1f),
                            maxLines = 4,
                        )
                        IconButton(
                            enabled = viewerUid != null && commentDraft.trim().isNotEmpty() && !submittingComment,
                            onClick = {
                                val uid = viewerUid ?: return@IconButton
                                submittingComment = true
                                scope.launch {
                                    runCatching {
                                        repository.createComment(
                                            postId = activePost.id,
                                            authorUid = uid,
                                            body = commentDraft,
                                            parentId = replyTarget?.id,
                                        )
                                    }.onSuccess { created ->
                                        comments = comments + created
                                        commentDraft = ""
                                        replyTarget = null
                                        post = activePost.copy(comments = activePost.comments + 1)
                                    }.onFailure {
                                        bannerMessage = it.message ?: "Failed to post comment."
                                    }
                                    submittingComment = false
                                }
                            },
                        ) {
                            Icon(Icons.Rounded.Send, contentDescription = "Send comment", tint = tokens.brandStrong)
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        val activePost = post
        if (loadingPost && activePost == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else if (activePost == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                BsdcStatusBanner(
                    title = "Post unavailable",
                    body = "This post could not be loaded or may have been moved to Trash.",
                    tone = BsdcTone.WARN,
                )
            }
        } else {
            val isPostOwner = viewerUid != null && viewerUid == activePost.author?.uid
            val orderedThread = remember(comments) { flattenCommentTree(comments) }
            val authorTarget = activePost.author?.username?.takeIf { it.isNotBlank() }
                ?: activePost.author?.uid.orEmpty()

            BsdcResponsiveContainer(
                maxWidth = 760.dp,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                bannerMessage?.let { msg ->
                    item("banner") {
                        BsdcStatusBanner(title = "Update", body = msg, tone = BsdcTone.INFO)
                    }
                }

                item("header") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable(enabled = authorTarget.isNotBlank()) {
                                        onOpenProfile(authorTarget)
                                    },
                            ) {
                                BsdcAvatar(
                                    avatarUrl = activePost.author?.avatarUrl.orEmpty(),
                                    displayName = activePost.author?.displayName ?: "BSDC Member",
                                    imageLoader = imageLoader,
                                    size = 44.dp,
                                )
                                Column {
                                    Text(
                                        text = activePost.author?.displayName ?: "BSDC Member",
                                        style = MaterialTheme.typography.titleMedium,
                                    )
                                    val viewsFmt = BanglaDigitFormatter.formatCount(activePost.views.toLong(), language)
                                    Text(
                                        text = "@${activePost.author?.username.orEmpty().ifBlank { "member" }} · ${activePost.readingTime} min read · $viewsFmt views",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = tokens.mutedText,
                                    )
                                }
                            }
                            if (viewerUid != null && !isPostOwner && !activePost.author?.uid.isNullOrBlank()) {
                                Row {
                                    IconButton(
                                        onClick = {
                                            scope.launch {
                                                runCatching {
                                                    repository.followUser(viewerUid, activePost.author!!.uid)
                                                }.onSuccess {
                                                    bannerMessage = "Following ${activePost.author?.displayName}."
                                                }
                                            }
                                        },
                                    ) {
                                        Icon(Icons.Rounded.PersonAdd, contentDescription = "Follow")
                                    }
                                    IconButton(onClick = { showReportDialog = true }) {
                                        Icon(Icons.Rounded.Flag, contentDescription = "Report")
                                    }
                                }
                            }
                        }

                        if (activePost.title.isNotBlank()) {
                            Text(
                                text = activePost.title,
                                style = MaterialTheme.typography.headlineMedium,
                            )
                        }

                        if (activePost.tags.isNotEmpty()) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(activePost.tags) { tag ->
                                    BsdcBadge(label = "#$tag", tone = BsdcTone.NEUTRAL)
                                }
                            }
                        }
                    }
                }

                val images = activePost.media.ifEmpty {
                    if (activePost.coverUrl.isNotBlank()) {
                        listOf(
                            PostMediaModel(
                                mediaId = "cover",
                                url = activePost.coverUrl,
                                thumbUrl = activePost.coverUrl,
                                altText = activePost.title,
                            ),
                        )
                    } else {
                        emptyList()
                    }
                }

                if (images.isNotEmpty()) {
                    item("media") {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(images, key = { it.mediaId + it.url }) { media ->
                                BsdcImgbbImage(
                                    fullUrl = media.url,
                                    thumbUrl = media.thumbUrl,
                                    contentDescription = media.altText.ifBlank { activePost.title },
                                    imageLoader = imageLoader,
                                    modifier = Modifier
                                        .width(if (images.size > 1) 280.dp else 360.dp)
                                        .height(220.dp),
                                    onTapOpenLightbox = { lightboxData = media.url to media.altText.ifBlank { activePost.title } },
                                )
                            }
                        }
                    }
                }

                if (activePost.body.isNotBlank()) {
                    item("body") {
                        PostMarkdownRenderer(markdown = activePost.body)
                    }
                }

                if (activePost.kind == PostKind.SNIPPET && activePost.code.isNotBlank()) {
                    item("code") {
                        BsdcCodeSnippetBlock(
                            code = activePost.code,
                            language = activePost.codeLanguage,
                        )
                    }
                }

                if (activePost.kind == PostKind.POLL && activePost.poll.isNotEmpty()) {
                    item("poll") {
                        FeedPollWidget(
                            options = activePost.poll,
                            selectedOptionId = selectedPollOptionId,
                            language = language,
                            onVote = { optionId ->
                                if (viewerUid == null) {
                                    bannerMessage = "Sign in to cast a poll vote."
                                    return@FeedPollWidget
                                }
                                selectedPollOptionId = optionId
                                scope.launch {
                                    runCatching { repository.castPollVote(activePost.id, optionId) }
                                        .onSuccess {
                                            repository.fetchPostBySlugOrId(activePost.id)?.let { post = it }
                                        }
                                }
                            },
                        )
                    }
                }

                item("reactions_bar") {
                    BsdcCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            ReactionButtonWithDock(
                                activeReaction = interaction.reaction,
                                totalLikes = activePost.likes,
                                language = language,
                                onSelectReaction = { kind ->
                                    if (viewerUid == null) {
                                        bannerMessage = "Sign in to react."
                                        return@ReactionButtonWithDock
                                    }
                                    scope.launch {
                                        runCatching { repository.toggleReaction(activePost.id, kind) }
                                            .onSuccess { (reacted, resolved, total) ->
                                                interaction = interaction.copy(
                                                    reaction = if (reacted) resolved else null,
                                                )
                                                post = activePost.copy(likes = total)
                                            }
                                    }
                                },
                            )
                            Text(
                                text = "${
                                    BanglaDigitFormatter.formatCount(activePost.comments.toLong(), language)
                                } ${if (language == AppLanguage.BN) "টি মন্তব্য" else "comments"}",
                                style = MaterialTheme.typography.labelLarge,
                                color = tokens.mutedText,
                            )
                        }
                    }
                }

                item("comments_heading") {
                    HorizontalDivider(color = tokens.border)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (language == AppLanguage.BN) "আলোচনা ও মন্তব্য" else "Discussion",
                        style = MaterialTheme.typography.titleLarge,
                    )
                }

                if (loadingComments) {
                    item("comments_loading") {
                        CircularProgressIndicator(modifier = Modifier.size(28.dp))
                    }
                } else if (orderedThread.isEmpty()) {
                    item("comments_empty") {
                        Text(
                            text = if (language == AppLanguage.BN) {
                                "এখনো কোনো মন্তব্য নেই। প্রথম মন্তব্যটি করুন!"
                            } else {
                                "No comments yet. Start the discussion below."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = tokens.mutedText,
                        )
                    }
                } else {
                    items(orderedThread, key = { it.id }) { comment ->
                        CommentRow(
                            comment = comment,
                            imageLoader = imageLoader,
                            canMarkAnswer = isPostOwner && activePost.kind == PostKind.QUESTION,
                            isCommentOwner = viewerUid != null && viewerUid == comment.author?.uid,
                            canInteract = viewerUid != null,
                            language = language,
                            onOpenProfile = onOpenProfile,
                            onLike = {
                                if (viewerUid == null) return@CommentRow
                                scope.launch {
                                    runCatching { repository.toggleCommentLike(comment.id) }
                                        .onSuccess { (liked, total) ->
                                            comments = comments.map {
                                                if (it.id == comment.id) {
                                                    it.copy(liked = liked, likes = total)
                                                } else {
                                                    it
                                                }
                                            }
                                        }
                                }
                            },
                            onReply = { replyTarget = comment },
                            onToggleAnswer = {
                                scope.launch {
                                    runCatching { repository.markAcceptedAnswer(comment.id) }
                                        .onSuccess { accepted ->
                                            comments = comments.map {
                                                when {
                                                    it.id == comment.id -> it.copy(isAnswer = accepted)
                                                    accepted -> it.copy(isAnswer = false)
                                                    else -> it
                                                }
                                            }
                                        }
                                }
                            },
                            onDelete = {
                                scope.launch {
                                    runCatching { repository.moveCommentToTrash(comment.id) }
                                        .onSuccess {
                                            comments = comments.filterNot { it.id == comment.id }
                                        }
                                }
                            },
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

    if (showReportDialog && post != null && viewerUid != null) {
        ReportAbuseDialog(
            language = language,
            onDismiss = { showReportDialog = false },
            onSubmit = { reason, details ->
                scope.launch {
                    runCatching {
                        repository.submitReport(
                            reporterUid = viewerUid,
                            subjectType = "post",
                            subjectId = post!!.id,
                            reason = reason,
                            details = details,
                        )
                    }.onSuccess {
                        showReportDialog = false
                        bannerMessage = "Report submitted to BSDC moderators."
                    }
                }
            },
        )
    }
}

@Composable
private fun CommentRow(
    comment: FeedComment,
    imageLoader: ImageLoader,
    canMarkAnswer: Boolean,
    isCommentOwner: Boolean,
    canInteract: Boolean,
    language: AppLanguage,
    onOpenProfile: (String) -> Unit,
    onLike: () -> Unit,
    onReply: () -> Unit,
    onToggleAnswer: () -> Unit,
    onDelete: () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    val indentDp = (comment.depth.coerceIn(0, 3) * 18).dp
    val commentAuthorTarget = comment.author?.username?.takeIf { it.isNotBlank() }
        ?: comment.author?.uid.orEmpty()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = indentDp),
    ) {
        if (comment.depth > 0) {
            Box(
                modifier = Modifier
                    .padding(end = 10.dp)
                    .width(2.dp)
                    .height(72.dp)
                    .background(tokens.border),
            )
        }
        BsdcCard(
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (comment.isAnswer) {
                        Modifier.border(1.5.dp, tokens.brandStrong, RoundedCornerShape(18.dp))
                    } else {
                        Modifier
                    },
                ),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(enabled = commentAuthorTarget.isNotBlank()) {
                            onOpenProfile(commentAuthorTarget)
                        },
                ) {
                    BsdcAvatar(
                        avatarUrl = comment.author?.avatarUrl.orEmpty(),
                        displayName = comment.author?.displayName ?: "Member",
                        imageLoader = imageLoader,
                        size = 30.dp,
                    )
                    Text(
                        text = comment.author?.displayName ?: "Member",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                if (comment.isAnswer) {
                    BsdcBadge(
                        label = if (language == AppLanguage.BN) "গৃহীত উত্তর" else "Accepted Answer",
                        tone = BsdcTone.OK,
                    )
                }
            }

            Text(
                text = comment.body,
                style = MaterialTheme.typography.bodyMedium,
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(enabled = canInteract, onClick = onLike)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ThumbUp,
                        contentDescription = "Like comment",
                        tint = if (comment.liked) tokens.brandStrong else tokens.mutedText,
                        modifier = Modifier.size(15.dp),
                    )
                    Text(
                        text = BanglaDigitFormatter.formatCount(comment.likes.toLong(), language),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (comment.liked) tokens.brandStrong else tokens.mutedText,
                    )
                }

                if (comment.depth < 3) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(enabled = canInteract, onClick = onReply)
                            .padding(horizontal = 6.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Reply,
                            contentDescription = "Reply",
                            tint = tokens.mutedText,
                            modifier = Modifier.size(15.dp),
                        )
                        Text(
                            text = if (language == AppLanguage.BN) "উত্তর" else "Reply",
                            style = MaterialTheme.typography.labelMedium,
                            color = tokens.mutedText,
                        )
                    }
                }

                if (canMarkAnswer) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClick = onToggleAnswer)
                            .padding(horizontal = 6.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = "Mark answer",
                            tint = if (comment.isAnswer) tokens.brandStrong else tokens.mutedText,
                            modifier = Modifier.size(15.dp),
                        )
                        Text(
                            text = if (comment.isAnswer) "Unmark" else "Mark answer",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (comment.isAnswer) tokens.brandStrong else tokens.mutedText,
                        )
                    }
                }

                if (isCommentOwner) {
                    Icon(
                        imageVector = Icons.Rounded.DeleteOutline,
                        contentDescription = "Delete comment",
                        tint = tokens.mutedText,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable(onClick = onDelete),
                    )
                }
            }
        }
    }
}

private fun flattenCommentTree(comments: List<FeedComment>): List<FeedComment> {
    if (comments.isEmpty()) return emptyList()
    val byParent = comments.groupBy { it.parentId }
    val result = mutableListOf<FeedComment>()

    fun walk(parentId: String?, depth: Int) {
        val children = byParent[parentId].orEmpty().sortedWith(
            compareByDescending<FeedComment> { it.isAnswer }.thenBy { it.createdAt },
        )
        for (c in children) {
            result += c.copy(depth = depth.coerceAtMost(3))
            walk(c.id, depth + 1)
        }
    }

    walk(null, 0)
    val seen = result.mapTo(HashSet()) { it.id }
    for (c in comments) {
        if (!seen.contains(c.id)) result += c
    }
    return result
}
