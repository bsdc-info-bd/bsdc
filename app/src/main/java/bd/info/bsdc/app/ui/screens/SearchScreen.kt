package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.UserProfile
import bd.info.bsdc.app.ui.SearchMode
import bd.info.bsdc.app.ui.SearchViewModel
import bd.info.bsdc.app.ui.components.PostCard

/** Bounded public discovery: member-handle prefix and exact public-tag search only. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenPost: (String) -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isMemberSearch = state.mode == SearchMode.MEMBERS
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Discover") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item("controls") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Find BSDC members and public topics", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Member search matches public usernames by prefix. Topic search matches one exact public post tag; BSDC does not claim private, full-text, or semantic search here.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = isMemberSearch, onClick = { viewModel.selectMode(SearchMode.MEMBERS) }, label = { Text("Members") })
                        FilterChip(selected = !isMemberSearch, onClick = { viewModel.selectMode(SearchMode.TOPICS) }, label = { Text("Topics") })
                    }
                    OutlinedTextField(
                        value = state.query,
                        onValueChange = viewModel::updateQuery,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(if (isMemberSearch) "Username prefix" else "Exact tag") },
                        prefix = { Text(if (isMemberSearch) "@" else "#") },
                        supportingText = {
                            Text(
                                if (isMemberSearch) "At least 2 lowercase letters, numbers, or underscores." else "At least 2 lowercase letters, numbers, hyphens, or underscores."
                            )
                        },
                        singleLine = true
                    )
                    Button(onClick = viewModel::search, enabled = !state.searching && state.query.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                        Text(if (state.searching) "Searching…" else if (isMemberSearch) "Search members" else "Search public topics")
                    }
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
            when {
                state.searching -> item("loading") { SearchMessage("Searching BSDC", "Searching a bounded public index.") }
                !state.hasSearched -> item("initial") { SearchMessage("Start a search", "Use a member handle prefix or an exact public topic tag.") }
                isMemberSearch && state.members.isEmpty() -> item("empty-members") { SearchMessage("No members found", "Try a different username prefix. BSDC does not expose private accounts through search.") }
                !isMemberSearch && state.posts.isEmpty() -> item("empty-topics") { SearchMessage("No public posts found", "Try another exact topic tag, without spaces.") }
                isMemberSearch -> items(state.members, key = { it.id }) { profile ->
                    MemberResult(profile) { onOpenProfile(profile.id) }
                }
                else -> items(state.posts, key = { it.id }) { post ->
                    PostCard(
                        post = post,
                        onAuthorClick = { onOpenProfile(post.authorId) },
                        onComment = { onOpenPost(post.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchMessage(title: String, body: String) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
) {
    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MemberResult(profile: UserProfile, onOpen: () -> Unit) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
) {
    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(profile.displayName.ifBlank { "BSDC member" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("@${profile.username}", color = MaterialTheme.colorScheme.primary)
        if (profile.bio.isNotBlank()) Text(profile.bio, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onOpen) { Text("View profile") }
    }
}
