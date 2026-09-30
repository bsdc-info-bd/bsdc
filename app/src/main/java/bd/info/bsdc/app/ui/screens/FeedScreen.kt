package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.ui.FeedViewModel
import bd.info.bsdc.app.ui.components.BsdcBrand
import bd.info.bsdc.app.ui.components.PostCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    viewModel: FeedViewModel,
    onCompose: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenSeries: (String) -> Unit = {},
    onOpenOrganization: (String) -> Unit = {}
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.actionMessage) { state.actionMessage?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { BsdcBrand(compact = true) },
                actions = { TextButton(onClick = onCompose) { Text("Create") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.TopCenter
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().widthIn(max = 760.dp),
                contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item("community-intro") { CommunityIntro(onCompose) }
                when {
                    state.loading -> item("loading") { FeedLoadingState() }
                    state.error != null -> item("error") { FeedMessage(state.error, onCompose) }
                    state.posts.isEmpty() -> item("empty") {
                        FeedMessage(
                            "There are no public discussions yet. Start a useful conversation, share a launch, or publish a lesson for the community.",
                            onCompose
                        )
                    }
                    else -> {
                        item("community-title") {
                            Text("From the community", style = MaterialTheme.typography.titleLarge)
                        }
                        items(state.posts, key = { it.id }) { post ->
                            PostCard(
                                post = post,
                                onAuthorClick = { onOpenProfile(post.authorId) },
                                onReact = { viewModel.react(post.id) },
                                onComment = { onOpenPost(post.id) },
                                onSeriesClick = onOpenSeries,
                                onOrganizationClick = onOpenOrganization
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CommunityIntro(onCompose: () -> Unit) {
    val shape = MaterialTheme.shapes.large
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary)
                )
            )
            .padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text("Build in public. Grow together.", style = MaterialTheme.typography.headlineSmall, color = Color.White)
        Text(
            "Share a lesson, question, launch, or opportunity with developers across Bangladesh and beyond.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.9f)
        )
        Spacer(Modifier.height(4.dp))
        Button(
            onClick = onCompose,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.White,
                contentColor = MaterialTheme.colorScheme.primary
            )
        ) { Text("Write a post") }
    }
}

@Composable
private fun FeedLoadingState() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        CircularProgressIndicator()
        Text("Loading community updates", color = MaterialTheme.colorScheme.onSurfaceVariant)
        repeat(2) {
            Card(
                modifier = Modifier.fillMaxWidth().height(164.dp),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) { }
        }
    }
}

@Composable
private fun FeedMessage(text: String, onCompose: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                Icons.Outlined.Forum,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
            Text("Your community feed", style = MaterialTheme.typography.titleLarge)
            Text(
                text,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium
            )
            Button(onClick = onCompose) { Text("Create a post") }
        }
    }
}
