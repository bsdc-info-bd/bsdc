package bd.info.bsdc.app.ui.components

import android.content.Intent
import android.text.format.DateUtils
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.content.PublishingTools
import bd.info.bsdc.app.model.CommunityPost
import coil.compose.AsyncImage

/** A native, responsive representation of an actual Firestore post. No fabricated engagement. */
@Composable
fun PostCard(
    post: CommunityPost,
    onAuthorClick: () -> Unit,
    onReact: (() -> Unit)? = null,
    onComment: (() -> Unit)? = null,
    bookmarked: Boolean = false,
    onToggleBookmark: (() -> Unit)? = null,
    onSeriesClick: ((String) -> Unit)? = null,
    onOrganizationClick: ((String) -> Unit)? = null,
    expanded: Boolean = false,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val parsed = remember(post.body) { PublishingTools.splitFrontmatter(post.body) }
    val metadata = if (post.frontmatter.isNotEmpty()) post.frontmatter else parsed.metadata
    val shareText = remember(post.id, post.authorName, parsed.content, metadata) {
        buildShareText(post, metadata["title"], parsed.content)
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.large,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.58f))
    ) {
        Column(Modifier.padding(18.dp)) {
            post.seriesId?.let { id ->
                SeriesRibbon(
                    post.seriesTitle ?: "BSDC series",
                    post.seriesOrder,
                    onClick = onSeriesClick?.let { navigate -> { navigate(id) } }
                )
                Spacer(Modifier.size(10.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    modifier = Modifier.weight(1f).clickable(onClick = onAuthorClick),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (post.authorPhotoUrl != null) {
                        AsyncImage(
                            model = post.authorPhotoUrl,
                            contentDescription = "${post.authorName} profile",
                            modifier = Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
                            contentScale = ContentScale.Crop
                        )
                    } else ProfileGlyph(post.authorName)
                    Spacer(Modifier.width(11.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            post.authorName.ifBlank { "BSDC member" },
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        val timestamp = post.publishedAt?.toDate()?.time ?: post.createdAt?.toDate()?.time ?: System.currentTimeMillis()
                        Text(
                            "@${post.authorHandle} · ${DateUtils.getRelativeTimeSpanString(timestamp)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
            post.organizationId?.let { orgId ->
                AnimatedVisibility(visible = post.organizationName != null) {
                    Text(
                        "Published with ${post.organizationName}",
                        modifier = Modifier.padding(top = 12.dp).clip(MaterialTheme.shapes.small)
                            .then(onOrganizationClick?.let { navigate -> Modifier.clickable { navigate(orgId) } } ?: Modifier)
                            .background(MaterialTheme.colorScheme.secondaryContainer)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }
            metadata["title"]?.takeIf(String::isNotBlank)?.let { title ->
                Spacer(Modifier.size(14.dp))
                Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            }
            if (parsed.content.isNotBlank()) {
                Spacer(Modifier.size(10.dp))
                MarkdownDocument(parsed.content, maxLines = if (expanded) Int.MAX_VALUE else 8, showEmbeds = expanded)
            }
            post.media.firstOrNull { it.kind == "IMAGE" }?.let { media ->
                Spacer(Modifier.size(14.dp))
                AsyncImage(
                    model = media.url,
                    contentDescription = media.altText ?: "Post image",
                    modifier = Modifier.fillMaxWidth().heightIn(max = 440.dp).clip(MaterialTheme.shapes.medium)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentScale = ContentScale.Crop
                )
            }
            if (post.embeds.isNotEmpty() && !expanded) {
                Spacer(Modifier.size(12.dp))
                post.embeds.take(2).forEach { EmbedCard(it) }
            }
            if (post.tags.isNotEmpty()) {
                Spacer(Modifier.size(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    post.tags.take(4).forEach { tag ->
                        Text(
                            "#$tag",
                            modifier = Modifier.clip(MaterialTheme.shapes.small)
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            if (post.coAuthorNames.isNotEmpty()) {
                Text(
                    "With ${post.coAuthorNames.joinToString(", ")}",
                    modifier = Modifier.padding(top = 12.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.size(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                onReact?.let {
                    SocialAction(
                        icon = Icons.Outlined.FavoriteBorder,
                        count = post.reactionCount.toString(),
                        label = "React",
                        onClick = it,
                        modifier = Modifier.weight(1f)
                    )
                }
                onComment?.let {
                    SocialAction(
                        icon = Icons.Outlined.ChatBubbleOutline,
                        count = post.commentCount.toString(),
                        label = "Comment",
                        onClick = it,
                        modifier = Modifier.weight(1f)
                    )
                }
                onToggleBookmark?.let { action ->
                    IconAction(
                        icon = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                        label = if (bookmarked) "Remove from saved" else "Save post",
                        onClick = action
                    )
                }
                SocialAction(
                    icon = Icons.Outlined.Share,
                    count = post.shareCount.toString(),
                    label = "Share",
                    onClick = { context.sharePlainText(shareText) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

private fun buildShareText(post: CommunityPost, title: String?, content: String): String = buildString {
    append(title?.takeIf(String::isNotBlank) ?: "A post from BSDC")
    append("\n\n")
    append(content.trim().take(1_500))
    if (content.length > 1_500) append("…")
    append("\n\nShared from Bangladesh Software Development Community")
    if (post.authorName.isNotBlank()) append(" · ${post.authorName}")
}

private fun android.content.Context.sharePlainText(text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    startActivity(Intent.createChooser(intent, "Share BSDC post"))
}

@Composable
private fun SeriesRibbon(title: String, order: Long?, onClick: (() -> Unit)?) {
    Text(
        text = if (order != null) "$title · Part $order" else title,
        modifier = Modifier.clip(MaterialTheme.shapes.small)
            .then(onClick?.let { action -> Modifier.clickable(onClick = action) } ?: Modifier)
            .background(MaterialTheme.colorScheme.tertiaryContainer).padding(horizontal = 10.dp, vertical = 6.dp),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onTertiaryContainer
    )
}

@Composable
private fun ProfileGlyph(name: String) {
    Box(
        modifier = Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center
    ) {
        Text(
            name.firstOrNull()?.uppercase() ?: "?",
            color = MaterialTheme.colorScheme.onPrimaryContainer,
            fontWeight = FontWeight.ExtraBold
        )
    }
}

@Composable
private fun IconAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(46.dp)
            .clip(MaterialTheme.shapes.small)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun SocialAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = modifier
            .heightIn(min = 46.dp)
            .clip(MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .padding(horizontal = 7.dp, vertical = 8.dp)
    ) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(19.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(6.dp))
        Text(count, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
