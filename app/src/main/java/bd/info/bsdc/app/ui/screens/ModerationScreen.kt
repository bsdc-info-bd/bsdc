package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.ContentReport
import bd.info.bsdc.app.model.ModerationAction
import bd.info.bsdc.app.model.ReportReason
import bd.info.bsdc.app.ui.ModerationViewModel

/** Native staff workspace. Every decision calls trusted Functions, never a client-side role bypass. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModerationScreen(viewModel: ModerationViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableIntStateOf(0) }
    var reportToResolve by remember { mutableStateOf<ContentReport?>(null) }
    var postToRestore by remember { mutableStateOf<CommunityPost?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Moderation workspace") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }
            )
        }
    ) { padding ->
        when {
            state.loadingAccess -> StaffMessage(padding, "Checking staff access", "BSDC is checking your trusted account role.")
            !state.authorized -> StaffMessage(padding, "Staff access required", "This workspace is available only to accounts with an admin or moderator custom claim issued by trusted BSDC operations.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item("tabs") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = selectedTab == 0, onClick = { selectedTab = 0 }, label = { Text("Open reports ${state.reports.size}") })
                        FilterChip(selected = selectedTab == 1, onClick = { selectedTab = 1 }, label = { Text("Hidden posts ${state.moderatedPosts.size}") })
                    }
                }
                state.notice?.let { notice -> item("notice") { Text(notice, color = MaterialTheme.colorScheme.primary) } }
                state.error?.let { error -> item("error") { Text(error, color = MaterialTheme.colorScheme.error) } }
                if (selectedTab == 0) {
                    if (state.reports.isEmpty()) item("empty-reports") { EmptyStaffCard("No open reports", "New member reports will appear here in real time.") }
                    else items(state.reports, key = { it.id }) { report ->
                        ReportCard(report, state.busy) { reportToResolve = report }
                    }
                } else {
                    if (state.moderatedPosts.isEmpty()) item("empty-hidden") { EmptyStaffCard("No hidden posts", "Posts hidden by staff can be restored here.") }
                    else items(state.moderatedPosts, key = { it.id }) { post ->
                        ModeratedPostCard(post, state.busy) { postToRestore = post }
                    }
                }
            }
        }
    }

    reportToResolve?.let { report ->
        ResolveReportDialog(
            report = report,
            busy = state.busy,
            onDismiss = { reportToResolve = null },
            onResolve = { action, note ->
                viewModel.resolve(report.id, action, note)
                reportToResolve = null
            }
        )
    }
    postToRestore?.let { post ->
        RestorePostDialog(
            post = post,
            busy = state.busy,
            onDismiss = { postToRestore = null },
            onRestore = { note ->
                viewModel.restore(post.id, note)
                postToRestore = null
            }
        )
    }
}

@Composable
private fun StaffMessage(padding: androidx.compose.foundation.layout.PaddingValues, title: String, body: String) = Column(
    Modifier.fillMaxSize().padding(padding).padding(24.dp),
    verticalArrangement = Arrangement.Center
) {
    Text(title, style = MaterialTheme.typography.headlineSmall)
    Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun EmptyStaffCard(title: String, body: String) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
) {
    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ReportCard(report: ContentReport, busy: Boolean, onResolve: () -> Unit) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
) {
    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(report.reason.asReportLabel(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("Post ID: ${report.targetId}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Reporter: ${report.reporterId}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (report.details.isNotBlank()) Text(report.details)
        TextButton(onClick = onResolve, enabled = !busy) { Text("Review report") }
    }
}

@Composable
private fun ModeratedPostCard(post: CommunityPost, busy: Boolean, onRestore: () -> Unit) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
) {
    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(post.authorName.ifBlank { "BSDC member" }, style = MaterialTheme.typography.titleMedium)
        Text("@${post.authorHandle}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        Text(post.body, maxLines = 4, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onRestore, enabled = !busy) { Text("Review and restore") }
    }
}

@Composable
private fun ResolveReportDialog(report: ContentReport, busy: Boolean, onDismiss: () -> Unit, onResolve: (ModerationAction, String) -> Unit) {
    var action by remember(report.id) { mutableStateOf(ModerationAction.DISMISS) }
    var note by remember(report.id) { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Review report") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${report.reason.asReportLabel()} · ${report.targetId}", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = action == ModerationAction.DISMISS, onClick = { action = ModerationAction.DISMISS }, label = { Text("Dismiss") })
                    FilterChip(selected = action == ModerationAction.HIDE_POST, onClick = { action = ModerationAction.HIDE_POST }, label = { Text("Hide post") })
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(1_000) },
                    label = { Text("Internal staff note (optional)") },
                    supportingText = { Text("This is stored in the staff-only moderation audit.") },
                    minLines = 2
                )
            }
        },
        confirmButton = { Button(onClick = { onResolve(action, note) }, enabled = !busy) { Text(if (action == ModerationAction.HIDE_POST) "Hide post" else "Dismiss report") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

@Composable
private fun RestorePostDialog(post: CommunityPost, busy: Boolean, onDismiss: () -> Unit, onRestore: (String) -> Unit) {
    var note by remember(post.id) { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Restore this post?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(post.body, maxLines = 5, overflow = TextOverflow.Ellipsis)
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(1_000) },
                    label = { Text("Internal staff note (optional)") },
                    supportingText = { Text("The restore decision is recorded in the staff-only audit.") },
                    minLines = 2
                )
            }
        },
        confirmButton = { Button(onClick = { onRestore(note) }, enabled = !busy) { Text("Restore post") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

private fun String.asReportLabel(): String = runCatching {
    when (ReportReason.valueOf(this)) {
        ReportReason.SPAM -> "Spam or scam"
        ReportReason.HARASSMENT -> "Harassment or bullying"
        ReportReason.HATE -> "Hate or discrimination"
        ReportReason.SEXUAL_CONTENT -> "Sexual content"
        ReportReason.VIOLENCE -> "Violence or threats"
        ReportReason.SELF_HARM -> "Self-harm concern"
        ReportReason.MISINFORMATION -> "Misleading information"
        ReportReason.INTELLECTUAL_PROPERTY -> "Intellectual property"
        ReportReason.OTHER -> "Other concern"
    }
}.getOrDefault("Other concern")
