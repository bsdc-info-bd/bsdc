package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.ui.OrganizationViewModel
import bd.info.bsdc.app.ui.SeriesViewModel
import bd.info.bsdc.app.ui.components.PostCard
import com.google.firebase.auth.FirebaseAuth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeriesScreen(viewModel: SeriesViewModel, onBack: () -> Unit, onOpenPost: (String) -> Unit, onOpenProfile: (String) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold(topBar = { TopAppBar(title = { Text(state.series?.title ?: "Series") }, navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item("header") {
                Card(Modifier.padding(horizontal = 14.dp, vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(state.series?.title ?: "Loading series", style = MaterialTheme.typography.headlineSmall)
                        state.series?.description?.takeIf { it.isNotBlank() }?.let { Text(it, modifier = Modifier.padding(top = 6.dp), color = MaterialTheme.colorScheme.onPrimaryContainer) }
                        Text("${state.posts.size} published part${if (state.posts.size == 1) "" else "s"}", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
            if (state.posts.isEmpty()) item("empty") { Text("The published parts of this series will appear here.", modifier = Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(state.posts, key = { it.id }) { post ->
                PostCard(post, onAuthorClick = { onOpenProfile(post.authorId) }, onReact = {}, onComment = { onOpenPost(post.id) }, onMore = {}, modifier = Modifier.padding(horizontal = 12.dp))
            }
            state.error?.let { item("error") { Text(it, modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrganizationScreen(viewModel: OrganizationViewModel, onBack: () -> Unit, onOpenPost: (String) -> Unit, onOpenProfile: (String) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var addingEditor by remember { mutableStateOf(false) }
    if (addingEditor) AddEditorDialog(onAdd = { viewModel.addEditor(it); addingEditor = false }, onDismiss = { addingEditor = false })
    Scaffold(topBar = { TopAppBar(title = { Text(state.organization?.name ?: "Organization") }, navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }, actions = {
        if (state.organization?.ownerId == FirebaseAuth.getInstance().currentUser?.uid) TextButton(onClick = { addingEditor = true }) { Text("Add editor") }
    }) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item("header") {
                Card(Modifier.padding(horizontal = 14.dp, vertical = 4.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(state.organization?.name ?: "Loading organization", style = MaterialTheme.typography.headlineSmall)
                        Text(state.organization?.handle?.let { "@$it" } ?: "", style = MaterialTheme.typography.labelLarge)
                        state.organization?.description?.takeIf { it.isNotBlank() }?.let { Text(it, modifier = Modifier.padding(top = 7.dp)) }
                        Text("${state.members.size} editor${if (state.members.size == 1) "" else "s"} · ${state.posts.size} public post${if (state.posts.size == 1) "" else "s"}", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
            item("members") { Text("Team", modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium) }
            items(state.members, key = { it.id }) { member ->
                Text(
                    "${member.memberName.ifBlank { "BSDC member" }} · ${member.role.replaceFirstChar { it.uppercase() }}",
                    modifier = Modifier.padding(horizontal = 20.dp),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            item("posts") { Text("Published by this organization", modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium) }
            if (state.posts.isEmpty()) item("empty") { Text("No public organization posts yet.", modifier = Modifier.padding(horizontal = 18.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(state.posts, key = { it.id }) { post ->
                PostCard(post, onAuthorClick = { onOpenProfile(post.authorId) }, onReact = {}, onComment = { onOpenPost(post.id) }, onMore = {}, modifier = Modifier.padding(horizontal = 12.dp))
            }
            state.message?.let { item("message") { Text(it, modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.primary) } }
            state.error?.let { item("error") { Text(it, modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
        }
    }
}

@Composable
private fun AddEditorDialog(onAdd: (String) -> Unit, onDismiss: () -> Unit) {
    var handle by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Add organization editor") }, text = {
        Column {
            OutlinedTextField(value = handle, onValueChange = { handle = it }, modifier = Modifier.fillMaxWidth(), label = { Text("BSDC handle") })
            Text("The member receives publishing access for this organization.", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.labelSmall)
        }
    }, confirmButton = { Button(onClick = { onAdd(handle) }, enabled = handle.trim().length >= 3) { Text("Add editor") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}
