package bd.info.bsdc.app.feature.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcAnimatedEntrance
import bd.info.bsdc.app.core.designsystem.BsdcAvatar
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PostKind
import coil3.ImageLoader
import kotlinx.coroutines.launch

/**
 * One channel's timeline, on the phone.
 *
 * The shape is the website's channel page: the room's name and the group it belongs to at the top, the
 * posts written into it below in the reader's order, and the same "post in this channel" door the site
 * offers — which is what makes the two halves of the feature meet: this app can already write here, and
 * until now a member had to open a browser to read what they wrote.
 *
 * Three things are deliberately not here. There is no second renderer: each row's body goes through
 * [PostMarkdownRenderer], the same parser the feed and the composer's preview use, so a post cannot look
 * different depending on how a reader reached it. There is no media strip: a row is a summary, and
 * tapping it opens the post, where photos, reactions and comments already work. And there is no
 * client-side permission check: `channel_feed` answers only for a reader the database accepts, and a
 * room that is not readable is simply not there — which is also, on purpose, what a typo looks like.
 */
@Composable
fun ChannelFeedScreen(
    repository: FeedRepository,
    groupSlug: String,
    channelSlug: String,
    language: AppLanguage,
    imageLoader: ImageLoader,
    onBack: () -> Unit,
    onOpenPost: (FeedPost) -> Unit,
    onWriteHere: (channelId: String, channelName: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = remember(language) { ChannelFeedCopy.forLanguage(language) }
    val scope = rememberCoroutineScope()

    var page by remember(groupSlug, channelSlug) { mutableStateOf<ChannelFeedPage?>(null) }
    var posts by remember(groupSlug, channelSlug) { mutableStateOf<List<FeedPost>>(emptyList()) }
    var cursor by remember(groupSlug, channelSlug) { mutableStateOf<String?>(null) }
    var loadingMore by remember { mutableStateOf(false) }
    var retryNonce by remember { mutableIntStateOf(0) }

    LaunchedEffect(groupSlug, channelSlug, retryNonce) {
        page = null
        posts = emptyList()
        cursor = null
        val first = repository.fetchChannelTimeline(groupSlug, channelSlug)
        page = first
        if (first is ChannelFeedPage.Ready) {
            posts = first.posts
            cursor = first.nextCursor
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        MkChannelHeader(
            title = (page as? ChannelFeedPage.Ready)?.room?.title ?: ChannelFeed.titleOf(channelSlug),
            groupName = (page as? ChannelFeedPage.Ready)?.room?.groupName ?: groupSlug,
            topic = (page as? ChannelFeedPage.Ready)?.room?.topic,
            backLabel = copy.backToGroupFor(
                (page as? ChannelFeedPage.Ready)?.room?.groupName ?: groupSlug,
            ),
            postHereLabel = copy.postHere,
            canWrite = (page as? ChannelFeedPage.Ready)
                ?.let { !it.room.isReadOnly }
                ?: false,
            onBack = onBack,
            onWriteHere = {
                val room = (page as? ChannelFeedPage.Ready)?.room ?: return@MkChannelHeader
                onWriteHere(room.id, room.name)
            },
        )

        when (val current = page) {
            null -> LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            is ChannelFeedPage.Unreachable -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                BsdcAnimatedEntrance {
                    BsdcEmptyState(
                        icon = Icons.Rounded.ChatBubbleOutline,
                        title = copy.notFoundTitle,
                        subtitle = copy.notFoundBody,
                        actionLabel = copy.backToGroupFor(groupSlug),
                        onAction = onBack,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }

            is ChannelFeedPage.Failed -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                BsdcAnimatedEntrance {
                    BsdcEmptyState(
                        icon = Icons.Rounded.ChatBubbleOutline,
                        title = copy.failed,
                        subtitle = current.message,
                        actionLabel = copy.retry,
                        onAction = { retryNonce++ },
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }

            is ChannelFeedPage.Ready -> {
                if (current.room.isReadOnly) {
                    BsdcStatusBanner(
                        title = copy.readOnlyNote,
                        body = "",
                        tone = BsdcTone.WARN,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (posts.isEmpty()) {
                        item {
                            BsdcEmptyState(
                                icon = Icons.Rounded.ChatBubbleOutline,
                                title = copy.emptyTitle,
                                subtitle = copy.emptyBodyFor(current.room.groupName),
                                modifier = Modifier.padding(top = 32.dp),
                            )
                        }
                    }
                    items(posts, key = { it.id }) { post ->
                        // `animateItem` keeps a room's timeline settling like the feed's does: the same
                        // list rule on both screens is part of why the two are not two different apps.
                        MkChannelPostRow(
                            modifier = Modifier.animateItem(),
                            post = post,
                            language = language,
                            imageLoader = imageLoader,
                            onClick = { onOpenPost(post) },
                        )
                    }
                    if (cursor != null) {
                        item {
                            BsdcButton(
                                label = copy.loadMore,
                                onClick = {
                                    val before = cursor
                                    if (before.isNullOrBlank() || loadingMore) return@BsdcButton
                                    loadingMore = true
                                    scope.launch {
                                        val next = repository.fetchChannelTimeline(groupSlug, channelSlug, before)
                                        if (next is ChannelFeedPage.Ready) {
                                            // Append, never replace, and never twice: `channel_feed` pages
                                            // with a strict `published_at < cursor`, so a repeated id means
                                            // the same page arrived again (a retry, a tap in a hurry) — and
                                            // a duplicated key in a `items(...)` list is a crash, not a
                                            // cosmetic fault.
                                            val seen = posts.mapTo(mutableSetOf()) { it.id }
                                            posts = posts + next.posts.filterNot { it.id in seen }
                                            cursor = next.nextCursor
                                        } else {
                                            // A page that stopped answering is not a reason to lose the
                                            // posts already on screen; it is only the end of the list.
                                            cursor = null
                                        }
                                        loadingMore = false
                                    }
                                },
                                enabled = cursor != null && !loadingMore,
                                busy = loadingMore,
                                secondary = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MkChannelHeader(
    title: String,
    groupName: String,
    topic: String?,
    backLabel: String,
    postHereLabel: String,
    canWrite: Boolean,
    onBack: () -> Unit,
    onWriteHere: () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = backLabel,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = topic ?: groupName,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.mutedText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (canWrite) {
            BsdcButton(
                label = postHereLabel,
                onClick = onWriteHere,
                secondary = true,
                modifier = Modifier.padding(start = 8.dp),
            )
        } else {
            Spacer(Modifier.width(8.dp))
        }
    }
}

/**
 * One post as the room saw it: who wrote it, what they wrote, and how it went down.
 *
 * The body goes through the reader's own markdown renderer rather than an excerpt, because an excerpt is
 * a second opinion about the same text — and the second opinion is the one that drops a member's code
 * fence halfway.
 */
@Composable
private fun MkChannelPostRow(
    post: FeedPost,
    language: AppLanguage,
    imageLoader: ImageLoader,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    BsdcCard(modifier = modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BsdcAvatar(
                avatarUrl = post.author?.avatarUrl.orEmpty(),
                displayName = post.author?.displayName ?: "BSDC Member",
                imageLoader = imageLoader,
                size = 36.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = post.author?.displayName ?: "BSDC Member",
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val handle = post.author?.username?.trim().orEmpty()
                Text(
                    text = if (handle.isEmpty()) "${post.readingTime} min" else "@$handle",
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.mutedText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (post.kind != PostKind.POST) {
                BsdcBadge(label = post.kind.name, tone = BsdcTone.NEUTRAL)
            }
        }
        if (post.title.isNotBlank()) {
            Text(
                text = post.title,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 10.dp),
            )
        }
        if (post.body.isNotBlank()) {
            PostMarkdownRenderer(
                markdown = post.body,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.padding(top = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Favorite,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = tokens.mutedText,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = BanglaDigitFormatter.formatCount(post.likes.toLong(), language),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.mutedText,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.ChatBubbleOutline,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = tokens.mutedText,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = BanglaDigitFormatter.formatCount(post.comments.toLong(), language),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.mutedText,
                )
            }
        }
    }
}
