package bd.info.bsdc.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.UserProfile
import bd.info.bsdc.app.ui.NotificationsViewModel
import bd.info.bsdc.app.ui.ProfileViewModel
import bd.info.bsdc.app.ui.components.PostCard
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onSignOut: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
    onBack: (() -> Unit)? = null
) {
    val profile by viewModel.state.collectAsStateWithLifecycle()
    val posts by viewModel.posts.collectAsStateWithLifecycle()
    val following by viewModel.isFollowing.collectAsStateWithLifecycle()
    val action by viewModel.action.collectAsStateWithLifecycle()
    val conversationId by viewModel.conversationId.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) }
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::uploadAvatar) }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::uploadCover) }

    LaunchedEffect(conversationId) {
        conversationId?.let {
            onOpenConversation(it)
            viewModel.consumeConversation()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (viewModel.isOwnProfile) "Your profile" else "Developer profile") },
                navigationIcon = { onBack?.let { TextButton(onClick = it) { Text("Back") } } },
                actions = {
                    if (viewModel.isOwnProfile) TextButton(onClick = onSignOut) { Text("Sign out") }
                }
            )
        }
    ) { padding ->
        val member = profile
        if (member == null) {
            Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text("Loading profile", style = MaterialTheme.typography.titleLarge)
                Text("This profile is fetched from BSDC in real time.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item(key = "identity") {
                    ProfileIdentity(
                        profile = member,
                        editable = viewModel.isOwnProfile,
                        busy = action.busy,
                        onEditCover = { coverPicker.launch(arrayOf("image/*")) },
                        onEditAvatar = { avatarPicker.launch(arrayOf("image/*")) }
                    )
                }
                item(key = "actions") {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (viewModel.isOwnProfile) {
                            Button(onClick = { editing = true }, enabled = !action.busy, modifier = Modifier.fillMaxWidth()) { Text("Edit profile") }
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                                Button(onClick = viewModel::toggleFollow, enabled = !action.busy, modifier = Modifier.weight(1f)) {
                                    Text(if (following) "Following" else "Follow")
                                }
                                Button(onClick = viewModel::messageMember, enabled = !action.busy, modifier = Modifier.weight(1f)) { Text("Message") }
                            }
                        }
                        action.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        action.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
                    }
                }
                item(key = "tabs") {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = { selectedTab = 0 }, label = { Text("Posts ${posts.size}") })
                        AssistChip(onClick = { selectedTab = 1 }, label = { Text("About") })
                    }
                }
                if (selectedTab == 0) {
                    if (posts.isEmpty()) {
                        item(key = "empty-posts") { EmptyProfilePosts(viewModel.isOwnProfile) }
                    } else {
                        items(posts, key = { "post-${it.id}" }) { post ->
                            PostCard(
                                post = post,
                                onAuthorClick = { onOpenProfile(post.authorId) },
                                onReact = {},
                                onComment = {},
                                onMore = {},
                                modifier = Modifier.padding(horizontal = 12.dp)
                            )
                        }
                    }
                } else {
                    item(key = "about") { AboutProfile(member) }
                }
            }
        }
    }

    if (editing && profile != null) {
        EditProfileDialog(
            profile = profile!!,
            busy = action.busy,
            onDismiss = { editing = false },
            onSave = { username, name, bio, skills, location ->
                if (username != profile!!.username) viewModel.changeUsername(username)
                viewModel.update(name, bio, skills, location)
                editing = false
            }
        )
    }
}

@Composable
private fun ProfileIdentity(
    profile: UserProfile,
    editable: Boolean,
    busy: Boolean,
    onEditCover: () -> Unit,
    onEditAvatar: () -> Unit
) {
    Column {
        Box(Modifier.fillMaxWidth().height(178.dp).background(MaterialTheme.colorScheme.secondaryContainer)) {
            profile.coverUrl?.let {
                AsyncImage(
                    model = it,
                    contentDescription = "${profile.displayName} cover image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
            if (editable) TextButton(onClick = onEditCover, enabled = !busy, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) { Text("Change cover") }
        }
        Row(Modifier.padding(horizontal = 16.dp).padding(top = 0.dp), verticalAlignment = Alignment.Bottom) {
            Box(Modifier.size(102.dp).padding(bottom = 0.dp)) {
                if (profile.photoUrl != null) {
                    AsyncImage(
                        model = profile.photoUrl,
                        contentDescription = "${profile.displayName} profile photo",
                        modifier = Modifier.fillMaxSize().clip(CircleShape).background(MaterialTheme.colorScheme.surface),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    ProfileMonogram(profile.displayName, Modifier.fillMaxSize())
                }
                if (editable) TextButton(onClick = onEditAvatar, enabled = !busy, modifier = Modifier.align(Alignment.BottomCenter)) { Text("Photo") }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.padding(top = 16.dp).weight(1f)) {
                Text(profile.displayName, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("@${profile.username}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleSmall)
                if (profile.verified) Text("Verified BSDC member", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            if (profile.bio.isNotBlank()) Text(profile.bio, style = MaterialTheme.typography.bodyLarge)
            if (profile.locationLabel != null) Text(profile.locationLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row {
                Text("${profile.followerCount} followers", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.width(18.dp))
                Text("${profile.followingCount} following", style = MaterialTheme.typography.labelLarge)
            }
            if (profile.skills.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                profile.skills.take(4).forEach { skill -> AssistChip(onClick = {}, label = { Text(skill) }) }
            }
        }
    }
}

@Composable
private fun ProfileMonogram(name: String, modifier: Modifier = Modifier) {
    Box(modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
        Text(name.firstOrNull()?.uppercase() ?: "?", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun EmptyProfilePosts(isOwn: Boolean) {
    Card(Modifier.padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Text(
            if (isOwn) "Your public posts will appear here when you publish them." else "This developer has not published a public post yet.",
            modifier = Modifier.padding(18.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun AboutProfile(profile: UserProfile) {
    Card(Modifier.padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("About", style = MaterialTheme.typography.titleMedium)
            Text(profile.bio.ifBlank { "This member has not added a biography yet." })
            profile.locationLabel?.let { Text("Location: $it") }
            if (profile.skills.isNotEmpty()) Text("Skills: ${profile.skills.joinToString(", ")}")
        }
    }
}

@Composable
private fun EditProfileDialog(profile: UserProfile, busy: Boolean, onDismiss: () -> Unit, onSave: (String, String, String, String, String) -> Unit) {
    var username by remember(profile.id) { mutableStateOf(profile.username) }
    var name by remember(profile.id) { mutableStateOf(profile.displayName) }
    var bio by remember(profile.id) { mutableStateOf(profile.bio) }
    var skills by remember(profile.id) { mutableStateOf(profile.skills.joinToString(", ")) }
    var location by remember(profile.id) { mutableStateOf(profile.locationLabel.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit your BSDC profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(username, { username = it }, label = { Text("Username") }, prefix = { Text("@") }, singleLine = true)
                OutlinedTextField(name, { name = it }, label = { Text("Display name") }, singleLine = true)
                OutlinedTextField(bio, { bio = it }, label = { Text("Bio") }, minLines = 3)
                OutlinedTextField(skills, { skills = it }, label = { Text("Skills") }, supportingText = { Text("Separate skills with commas") })
                OutlinedTextField(location, { location = it }, label = { Text("Location") }, singleLine = true)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(username, name, bio, skills, location) }, enabled = !busy) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(viewModel: NotificationsViewModel) {
    val notifications = viewModel.notifications.collectAsStateWithLifecycle().value
    Scaffold(topBar = { TopAppBar(title = { Text("Notifications") }) }) { padding ->
        if (notifications.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text("You’re all caught up", style = MaterialTheme.typography.titleLarge)
                Text("Activity from your community will appear here.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            items(notifications, key = { it.id }) { notice ->
                Column(
                    Modifier.fillMaxWidth().clickable { viewModel.markRead(notice.id) }.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(notice.title, style = MaterialTheme.typography.titleSmall)
                    Text(notice.body, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!notice.isRead) Text("New", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                HorizontalDivider()
            }
        }
    }
}
