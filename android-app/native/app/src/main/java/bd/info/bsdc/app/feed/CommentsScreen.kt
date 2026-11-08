package bd.info.bsdc.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun CommentsScreen(post: FeedPost, viewerUid: String?, repository: CommentRepository, onBack: () -> Unit, onSignIn: () -> Unit) {
    var comments by remember(post.id) { mutableStateOf<List<FeedComment>>(emptyList()) }
    var text by remember { mutableStateOf("") }
    var loading by remember(post.id) { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var liked by remember { mutableStateOf(setOf<String>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(post.id, viewerUid) {
        loading = true; error = null
        runCatching { repository.list(post.id) }
            .onSuccess { comments = it }
            .onFailure { error = it.message ?: "Comments could not be loaded." }
        loading = false
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Back") }
            Column { Text("Comments", fontWeight = FontWeight.Bold); Text("${post.comments} on this post", color = Color.Gray, fontSize = 12.sp) }
        }
        if (loading && comments.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else if (error != null && comments.isEmpty()) Column(Modifier.weight(1f).fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Text(error!!, color = Color.Gray); TextButton(onClick = { loading = true; scope.launch { runCatching { repository.list(post.id) }.onSuccess { comments = it; error = null }.onFailure { error = it.message }; loading = false } }) { Text("Retry") } }
        else if (comments.isEmpty()) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text("No comments yet. Start a thoughtful conversation.", color = Color.Gray) }
        else LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 12.dp)) {
            items(comments, key = { it.id }) { comment ->
                Column(Modifier.fillMaxWidth().padding(start = (comment.depth.coerceIn(0, 3) * 14).dp, top = 7.dp, bottom = 7.dp).background(Color.White, RoundedCornerShape(16.dp)).padding(14.dp)) {
                    Text(comment.author, fontWeight = FontWeight.SemiBold, color = Color(0xFF13251F), fontSize = 13.sp)
                    Text(comment.body, Modifier.padding(top = 7.dp), color = Color(0xFF26342E), fontSize = 14.sp, lineHeight = 20.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = {
                            if (viewerUid == null) onSignIn()
                            else scope.launch {
                                runCatching { repository.toggleLike(comment.id) }.onSuccess { (reacted, total) ->
                                    liked = if (reacted) liked + comment.id else liked - comment.id
                                    comments = comments.map { if (it.id == comment.id) it.copy(likes = total) else it }
                                }.onFailure { error = it.message ?: "Reaction could not be saved." }
                            }
                        }) {
                            Icon(if (comment.id in liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "Like comment", tint = if (comment.id in liked) Color(0xFFE65368) else Color.Gray, modifier = Modifier.size(17.dp))
                            Spacer(Modifier.width(5.dp)); Text(comment.likes.toString(), color = Color.Gray, fontSize = 12.sp)
                        }
                        if (comment.replies > 0) Text("${comment.replies} replies", color = Color.Gray, fontSize = 12.sp)
                    }
                }
            }
        }
        error?.takeIf { comments.isNotEmpty() }?.let { Text(it, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        Row(Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().imePadding().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = text, onValueChange = { if (it.length <= 4000) text = it }, modifier = Modifier.weight(1f), enabled = !busy, placeholder = { Text(if (viewerUid == null) "Sign in to comment" else "Write a comment…") }, shape = RoundedCornerShape(20.dp), maxLines = 4)
            IconButton(enabled = !busy && text.isNotBlank(), onClick = {
                if (viewerUid == null) onSignIn()
                else {
                    busy = true
                    scope.launch {
                        runCatching { repository.create(post.id, viewerUid, text) }
                            .onSuccess { comments = comments + it; text = "" }
                            .onFailure { error = it.message ?: "Comment could not be posted." }
                        busy = false
                    }
                }
            }) { if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Icon(Icons.Filled.Send, "Send comment", tint = if (text.isBlank()) Color.Gray else Color(0xFF087B57)) }
        }
    }
}
