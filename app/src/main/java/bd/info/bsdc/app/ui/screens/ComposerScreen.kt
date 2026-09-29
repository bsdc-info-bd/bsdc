package bd.info.bsdc.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.PostVisibility
import bd.info.bsdc.app.ui.ComposerViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposerScreen(viewModel: ComposerViewModel, onPublished: () -> Unit, onBack: () -> Unit) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::attach) }
    LaunchedEffect(state.completed) { if (state.completed) onPublished() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create post") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Cancel") } },
                actions = { TextButton(onClick = viewModel::publish, enabled = !state.uploading && !state.publishing) { Text("Publish") } }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Share a question, lesson, project, or developer update.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = state.body,
                onValueChange = viewModel::updateBody,
                modifier = Modifier.fillMaxWidth().height(180.dp),
                label = { Text("What would you like to share?") },
                minLines = 6
            )
            OutlinedTextField(
                value = state.tags,
                onValueChange = viewModel::updateTags,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Topics") },
                supportingText = { Text("Separate up to 8 topics with commas, spaces, or new lines") }
            )
            Text("Post language", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = { viewModel.updateLanguage("en") }, label = { Text("English") })
                AssistChip(onClick = { viewModel.updateLanguage("bn") }, label = { Text("বাংলা") })
            }
            Text("Visibility", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = { viewModel.updateVisibility(PostVisibility.PUBLIC) }, label = { Text("Public") })
                AssistChip(onClick = { viewModel.updateVisibility(PostVisibility.FOLLOWERS) }, label = { Text("Followers") })
                AssistChip(onClick = { viewModel.updateVisibility(PostVisibility.ONLY_ME) }, label = { Text("Only me") })
            }
            TextButton(onClick = { picker.launch(arrayOf("image/*", "audio/*")) }, enabled = !state.uploading) {
                Text(if (state.uploading) "Uploading securely…" else "Attach image or voice note")
            }
            if (state.media.isNotEmpty()) {
                state.media.forEach { media ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(if (media.kind == "AUDIO") "Voice note attached" else "Image attached")
                        TextButton(onClick = { viewModel.removeMedia(media.url) }) { Text("Remove") }
                    }
                }
            }
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.height(8.dp))
            Button(onClick = viewModel::publish, enabled = !state.uploading && !state.publishing, modifier = Modifier.fillMaxWidth()) {
                if (state.publishing) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp) else Text("Publish post")
            }
            Text("Video uploads are intentionally unavailable. BSDC accepts images and voice notes only.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
