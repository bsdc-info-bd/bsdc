package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.PostComment
import bd.info.bsdc.app.ui.PostDetailViewModel
import bd.info.bsdc.app.ui.components.PostCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostDetailScreen(viewModel: PostDetailViewModel, onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf("") }
    Scaffold(
        topBar = { TopAppBar(title = { Text("Discussion") }, navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }) },
        bottomBar = {
            Row(Modifier.fillMaxWidth().imePadding().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    label = { Text("Add a comment") },
                    maxLines = 4
                )
                Spacer(Modifier.width(8.dp))
                TextButton(
                    onClick = { if (draft.isNotBlank()) { viewModel.addComment(draft); draft = "" } },
                    enabled = draft.isNotBlank() && !state.sending
                ) { Text(if (state.sending) "Sending" else "Send") }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            state.post?.let { post ->
                item("post-${post.id}") {
                    PostCard(
                        post = post,
                        onAuthorClick = { onOpenProfile(post.authorId) },
                        expanded = true,
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                }
            } ?: item("loading") {
                Text("Loading discussion", modifier = Modifier.padding(24.dp), style = MaterialTheme.typography.titleMedium)
            }
            item("comment-title") { Text("Comments ${state.comments.size}", modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium) }
            if (state.comments.isEmpty()) {
                item("empty-comments") { Text("Start a constructive discussion.", modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                items(state.comments, key = { it.id }) { comment -> CommentItem(comment, onOpenProfile) }
            }
            state.error?.let { error -> item("error") { Text(error, modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error) } }
        }
    }
}

@Composable
private fun CommentItem(comment: PostComment, onOpenProfile: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = comment.authorName,
            modifier = Modifier.padding(bottom = 1.dp),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold
        )
        Text(comment.body)
        TextButton(onClick = { onOpenProfile(comment.authorId) }) { Text("View profile") }
    }
}
