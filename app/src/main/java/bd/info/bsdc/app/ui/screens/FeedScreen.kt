package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.ui.FeedViewModel
import bd.info.bsdc.app.ui.components.BsdcBrand
import bd.info.bsdc.app.ui.components.PostCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(viewModel: FeedViewModel, onCompose: () -> Unit, onOpenProfile: (String) -> Unit) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.actionMessage) { state.actionMessage?.let { snackbar.showSnackbar(it) } }
    Scaffold(
        topBar = { TopAppBar(title = { BsdcBrand(compact = true) }, actions = { TextButton(onClick = onCompose) { Text("Publish") } }) },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading -> Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
            }
            state.error != null -> EmptyFeed(padding, state.error, onCompose)
            state.posts.isEmpty() -> EmptyFeed(padding, "No public posts are available yet. Publish the first discussion or follow developers to shape your feed.", onCompose)
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(state.posts, key = { it.id }) { post ->
                    PostCard(post = post, onAuthorClick = { onOpenProfile(post.authorId) }, onReact = { viewModel.react(post.id) }, onComment = onCompose, onMore = {})
                }
            }
        }
    }
}

@Composable
private fun EmptyFeed(padding: PaddingValues, text: String, onCompose: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(padding).padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Your community feed", style = MaterialTheme.typography.headlineSmall)
        Text(text, modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onCompose, modifier = Modifier.padding(top = 12.dp)) { Text("Create a post") }
    }
}
