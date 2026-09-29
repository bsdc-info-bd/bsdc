package bd.info.bsdc.app.ui.components

import android.text.format.DateUtils
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
import bd.info.bsdc.app.model.CommunityPost
import coil.compose.AsyncImage

@Composable
fun PostCard(
    post: CommunityPost,
    onReact: () -> Unit,
    onComment: () -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(18.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (post.authorPhotoUrl != null) {
                    AsyncImage(
                        model = post.authorPhotoUrl,
                        contentDescription = "${post.authorName} profile",
                        modifier = Modifier.size(42.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    ProfileGlyph(post.authorName)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(post.authorName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    val timestamp = post.createdAt?.toDate()?.time ?: System.currentTimeMillis()
                    Text(
                        "@${post.authorHandle} · ${DateUtils.getRelativeTimeSpanString(timestamp)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = onMore) {
                    Icon(Icons.Outlined.MoreHoriz, contentDescription = "Post actions")
                }
            }
            if (post.body.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(post.body, style = MaterialTheme.typography.bodyLarge)
            }
            if (post.tags.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    post.tags.take(3).forEach { tag -> AssistChip(onClick = {}, label = { Text("#$tag") }) }
                }
            }
            post.media.firstOrNull { it.kind == "IMAGE" }?.let { media ->
                Spacer(Modifier.height(12.dp))
                AsyncImage(
                    model = media.url,
                    contentDescription = media.altText ?: "Post image",
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)),
                    contentScale = ContentScale.FillWidth
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                SocialAction(Icons.Outlined.FavoriteBorder, "${post.reactionCount}", "React", onReact)
                SocialAction(Icons.Outlined.ChatBubbleOutline, "${post.commentCount}", "Comment", onComment)
                SocialAction(Icons.Outlined.Share, "${post.shareCount}", "Share", {})
            }
        }
    }
}

@Composable
private fun ProfileGlyph(name: String) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.size(42.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
        contentAlignment = Alignment.Center
    ) {
        Text(name.firstOrNull()?.uppercase() ?: "?", fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SocialAction(icon: androidx.compose.ui.graphics.vector.ImageVector, count: String, label: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(end = 16.dp).clickable(onClick = onClick).padding(vertical = 8.dp)
    ) {
        Icon(icon, contentDescription = label, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(5.dp))
        Text(count, style = MaterialTheme.typography.labelMedium)
    }
}
