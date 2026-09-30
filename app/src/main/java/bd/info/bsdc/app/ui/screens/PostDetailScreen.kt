package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import bd.info.bsdc.app.model.ReportReason
import bd.info.bsdc.app.ui.PostDetailViewModel
import bd.info.bsdc.app.ui.components.PostCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostDetailScreen(viewModel: PostDetailViewModel, onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf("") }
    var showReport by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Discussion") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                actions = {
                    TextButton(onClick = { showReport = true }, enabled = state.post != null && !state.reporting) { Text("Report") }
                }
            )
        },
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
                        bookmarked = state.bookmarked,
                        onToggleBookmark = viewModel::toggleBookmark,
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
            state.notice?.let { notice -> item("notice") { Text(notice, modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.primary) } }
            state.error?.let { error -> item("error") { Text(error, modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error) } }
        }
    }
    if (showReport) {
        ReportPostDialog(
            busy = state.reporting,
            onDismiss = { showReport = false },
            onSubmit = { reason, details ->
                viewModel.report(reason, details)
                showReport = false
            }
        )
    }
}

@Composable
private fun ReportPostDialog(busy: Boolean, onDismiss: () -> Unit, onSubmit: (ReportReason, String) -> Unit) {
    var reason by remember { mutableStateOf(ReportReason.SPAM) }
    var details by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report this post") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Reports are visible only to trusted BSDC moderation staff. Choose the best reason and include factual detail if useful.", style = MaterialTheme.typography.bodySmall)
                listOf(
                    ReportReason.SPAM to "Spam or scam",
                    ReportReason.HARASSMENT to "Harassment",
                    ReportReason.HATE to "Hate or discrimination",
                    ReportReason.SEXUAL_CONTENT to "Sexual content",
                    ReportReason.VIOLENCE to "Violence or threats",
                    ReportReason.SELF_HARM to "Self-harm concern",
                    ReportReason.MISINFORMATION to "Misleading information",
                    ReportReason.INTELLECTUAL_PROPERTY to "Intellectual property",
                    ReportReason.OTHER to "Other"
                ).forEach { (value, label) ->
                    FilterChip(selected = reason == value, onClick = { reason = value }, label = { Text(label) })
                }
                OutlinedTextField(
                    value = details,
                    onValueChange = { details = it.take(1_000) },
                    label = { Text("Details (optional)") },
                    supportingText = { Text("Do not include passwords, payment information, or private contact details.") },
                    minLines = 2
                )
            }
        },
        confirmButton = { TextButton(onClick = { onSubmit(reason, details) }, enabled = !busy) { Text("Send report") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
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
