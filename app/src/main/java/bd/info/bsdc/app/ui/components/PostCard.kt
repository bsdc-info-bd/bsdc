package bd.info.bsdc.app.ui.components

import android.text.format.DateUtils
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.content.PublishingTools
import bd.info.bsdc.app.model.CommunityPost
import coil.compose.AsyncImage

@Composable
fun PostCard(
    post: CommunityPost,
    onAuthorClick: () -> Unit,
    onReact: () -> Unit,
    onComment: () -> Unit,
    onMore: () -> Unit,
    onSeriesClick: ((String) -> Unit)? = null,
    onOrganizationClick: ((String) -> Unit)? = null,
    expanded: Boolean = false,
    modifier: Modifier = Modifier
) {
    val parsed = PublishingTools.splitFrontmatter(post.body)
    val metadata = if (post.frontmatter.isNotEmpty()) post.frontmatter else parsed.metadata
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(22.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            post.seriesId?.let { id ->
                SeriesRibbon(post.seriesTitle ?: "BSDC series", post.seriesOrder, onClick = { onSeriesClick?.invoke(id) })
                Spacer(Modifier.height(10.dp))
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
                            modifier = Modifier.size(44.dp).clip(CircleShape),
                            contentScale = ContentScale.Crop
                        )
                    } else ProfileGlyph(post.authorName)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(post.authorName.ifBlank { "BSDC member" }, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
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
                IconButton(onClick = onMore) { Icon(Icons.Outlined.MoreHoriz, contentDescription = "Post actions") }
            }
            post.organizationId?.let { orgId ->
                AnimatedVisibility(visible = post.organizationName != null) {
                    Text(
                        "Published with ${post.organizationName}",
                        modifier = Modifier.padding(top = 10.dp).clip(RoundedCornerShape(8.dp))
                            .clickable { onOrganizationClick?.invoke(orgId) }.background(MaterialTheme.colorScheme.secondaryContainer).padding(horizontal = 9.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }
            metadata["title"]?.let { title ->
                Spacer(Modifier.height(12.dp))
                Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            }
            if (parsed.content.isNotBlank()) {
                Spacer(Modifier.height(10.dp))
                MarkdownDocument(parsed.content, maxLines = if (expanded) Int.MAX_VALUE else 8, showEmbeds = expanded)
            }
            post.media.firstOrNull { it.kind == "IMAGE" }?.let { media ->
                Spacer(Modifier.height(12.dp))
                AsyncImage(
                    model = media.url,
                    contentDescription = media.altText ?: "Post image",
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)),
                    contentScale = ContentScale.FillWidth
                )
            }
            if (post.embeds.isNotEmpty() && !expanded) {
                Spacer(Modifier.height(10.dp))
                post.embeds.take(2).forEach { EmbedCard(it) }
            }
            if (post.tags.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    post.tags.take(4).forEach { tag -> AssistChip(onClick = {}, label = { Text("#$tag") }) }
                }
            }
            if (post.coAuthorNames.isNotEmpty()) {
                Text(
                    "With ${post.coAuthorNames.joinToString(", ")}",
                    modifier = Modifier.padding(top = 10.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                SocialAction(Icons.Outlined.FavoriteBorder, "${post.reactionCount}", "React", onReact)
                SocialAction(Icons.Outlined.ChatBubbleOutline, "${post.commentCount}", "Comment", onComment)
                SocialAction(Icons.Outlined.Share, "${post.shareCount}", "Share", {})
                Spacer(Modifier.weight(1f))
                Icon(Icons.Outlined.BookmarkBorder, contentDescription = "Save post", modifier = Modifier.size(19.dp))
            }
        }
    }
}

@Composable
private fun SeriesRibbon(title: String, order: Long?, onClick: () -> Unit) {
    Text(
        text = if (order != null) "$title · Part $order" else title,
        modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick)
            .background(MaterialTheme.colorScheme.tertiaryContainer).padding(horizontal = 10.dp, vertical = 6.dp),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onTertiaryContainer
    )
}

@Composable
private fun ProfileGlyph(name: String) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
        contentAlignment = Alignment.Center
    ) { Text(name.firstOrNull()?.uppercase() ?: "?", fontWeight = FontWeight.Bold) }
}

@Composable
private fun SocialAction(icon: androidx.compose.ui.graphics.vector.ImageVector, count: String, label: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(end = 14.dp).clickable(onClick = onClick).padding(vertical = 8.dp)
    ) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(5.dp))
        Text(count, style = MaterialTheme.typography.labelMedium)
    }
}
