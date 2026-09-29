package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import bd.info.bsdc.app.ui.NotificationsViewModel
import bd.info.bsdc.app.ui.ProfileViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(viewModel: ProfileViewModel, onSignOut: () -> Unit) {
    val profile by viewModel.state.collectAsStateWithLifecycle()
    val updateMessage by viewModel.updateMessage.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf(false) }
    Scaffold(topBar = { TopAppBar(title = { Text("Profile") }, actions = { TextButton(onClick = onSignOut) { Text("Sign out") } }) }) { padding ->
        val item = profile
        if (item == null) {
            Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text("Loading profile", style = MaterialTheme.typography.titleLarge)
            }
        } else {
            Column(Modifier.fillMaxSize().padding(padding).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(item.displayName, style = MaterialTheme.typography.headlineMedium)
                Text("@${item.username}", color = MaterialTheme.colorScheme.primary)
                if (item.bio.isNotBlank()) Text(item.bio)
                if (item.locationLabel != null) Text(item.locationLabel, style = MaterialTheme.typography.bodySmall)
                if (item.skills.isNotEmpty()) Text(item.skills.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                Row { Text("${item.followerCount} followers"); Spacer(Modifier.width(18.dp)); Text("${item.followingCount} following") }
                Button(onClick = { editing = true }) { Text("Edit profile") }
                updateMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            }
        }
    }
    if (editing && profile != null) {
        EditProfileDialog(profile!!.displayName, profile!!.bio, profile!!.skills.joinToString(", "), profile!!.locationLabel.orEmpty(), onDismiss = { editing = false }, onSave = { name, bio, skills, location ->
            viewModel.update(name, bio, skills, location)
            editing = false
        })
    }
}

@Composable
private fun EditProfileDialog(nameStart: String, bioStart: String, skillsStart: String, locationStart: String, onDismiss: () -> Unit, onSave: (String, String, String, String) -> Unit) {
    var name by remember { mutableStateOf(nameStart) }
    var bio by remember { mutableStateOf(bioStart) }
    var skills by remember { mutableStateOf(skillsStart) }
    var location by remember { mutableStateOf(locationStart) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Display name") })
                OutlinedTextField(bio, { bio = it }, label = { Text("Bio") }, minLines = 3)
                OutlinedTextField(skills, { skills = it }, label = { Text("Skills") })
                OutlinedTextField(location, { location = it }, label = { Text("Location") })
            }
        },
        confirmButton = { TextButton(onClick = { onSave(name, bio, skills, location) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
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
                    Modifier.fillMaxWidth().padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(notice.title, style = MaterialTheme.typography.titleSmall)
                    Text(notice.body, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!notice.isRead) TextButton(onClick = { viewModel.markRead(notice.id) }) { Text("Mark as read") }
                }
            }
        }
    }
}
