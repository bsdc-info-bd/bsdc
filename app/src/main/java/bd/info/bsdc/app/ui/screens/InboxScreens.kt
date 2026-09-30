package bd.info.bsdc.app.ui.screens

import android.media.MediaPlayer
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.ChatMessage
import bd.info.bsdc.app.model.DirectConversation
import bd.info.bsdc.app.ui.ChatRoomViewModel
import bd.info.bsdc.app.ui.InboxViewModel
import coil.compose.AsyncImage
import com.google.firebase.auth.FirebaseAuth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(viewModel: InboxViewModel, openConversation: (String) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var showCreateGroup by remember { mutableStateOf(false) }
    LaunchedEffect(state.createdConversationId) {
        state.createdConversationId?.let { id ->
            openConversation(id)
            viewModel.consumeCreatedConversation()
        }
    }
    val filtered = state.conversations.filter { conversation ->
        query.isBlank() || conversation.displayTitle().contains(query, ignoreCase = true) || conversation.lastMessage.contains(query, ignoreCase = true)
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("BSDC Messenger") },
                actions = { TextButton(onClick = { showCreateGroup = true }) { Text("New group") } }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                label = { Text("Search conversations") },
                singleLine = true
            )
            state.error?.let { Text(it, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error) }
            if (filtered.isEmpty()) {
                Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center) {
                    Text("No conversations yet", style = MaterialTheme.typography.headlineSmall)
                    Text("Open a member profile to message them, or create a group with BSDC member handles.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { showCreateGroup = true }, modifier = Modifier.padding(top = 14.dp)) { Text("Create group chat") }
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(filtered, key = { it.id }) { conversation ->
                        ConversationRow(conversation, onClick = { openConversation(conversation.id) })
                        HorizontalDivider()
                    }
                }
            }
        }
    }
    if (showCreateGroup) {
        CreateGroupDialog(
            busy = state.creatingGroup,
            onDismiss = { showCreateGroup = false },
            onCreate = { title, description, handles -> viewModel.createGroup(title, description, handles) }
        )
    }
}

@Composable
private fun ConversationRow(conversation: DirectConversation, onClick: () -> Unit) {
    val unread = conversation.unreadBy[FirebaseAuth.getInstance().currentUser?.uid.orEmpty()].orZero()
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.secondaryContainer),
            contentAlignment = Alignment.Center
        ) { Text(if (conversation.kind == "group") "G" else "M", style = MaterialTheme.typography.titleMedium) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(conversation.displayTitle(), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(conversation.lastMessage.ifBlank { "No messages yet" }, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (unread > 0) {
            Box(Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 8.dp, vertical = 3.dp)) {
                Text(if (unread > 99) "99+" else unread.toString(), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun CreateGroupDialog(busy: Boolean, onDismiss: () -> Unit, onCreate: (String, String, String) -> Unit) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var handles by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create BSDC group") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Group name") }, singleLine = true)
                OutlinedTextField(description, { description = it }, label = { Text("Description") }, minLines = 2)
                OutlinedTextField(handles, { handles = it }, label = { Text("Member handles") }, supportingText = { Text("Separate @usernames with spaces or commas") }, minLines = 2)
            }
        },
        confirmButton = { TextButton(onClick = { onCreate(title, description, handles) }, enabled = !busy) { Text(if (busy) "Creating" else "Create group") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatRoomScreen(viewModel: ChatRoomViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf("") }
    val myUid = FirebaseAuth.getInstance().currentUser?.uid
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::attach) }
    LaunchedEffect(draft) { viewModel.draftChanged(draft.isNotBlank()) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(state.conversation?.displayTitle() ?: "Conversation")
                        if (state.conversation?.kind == "group") Text("${state.conversation?.memberCount ?: 0} members", style = MaterialTheme.typography.labelSmall)
                    }
                },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                actions = { TextButton(onClick = { picker.launch(arrayOf("image/*", "audio/*")) }, enabled = !state.uploading) { Text(if (state.uploading) "Uploading" else "Media") } }
            )
        },
        bottomBar = {
            Row(Modifier.fillMaxWidth().imePadding().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Write a message") },
                    maxLines = 4
                )
                Spacer(Modifier.width(8.dp))
                TextButton(onClick = { if (draft.isNotBlank()) { viewModel.send(draft); draft = "" } }, enabled = !state.sending && !state.uploading) { Text("Send") }
            }
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.typing.any { it != myUid }) Text("A member is typing", modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall)
            state.error?.let { Text(it, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.error) }
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                reverseLayout = false
            ) {
                items(state.messages, key = { it.id }) { message ->
                    MessageBubble(message, message.senderId == myUid, onDelete = { viewModel.remove(message.id) })
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, mine: Boolean, onDelete: () -> Unit) {
    var showDelete by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
            Box(
                Modifier.clip(RoundedCornerShape(16.dp)).background(if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 12.dp, vertical = 9.dp)
            ) {
                when {
                    message.deletedAt != null -> Text("Message removed", color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                    message.kind == "image" && message.attachmentUrl != null -> AsyncImage(
                        model = message.attachmentUrl,
                        contentDescription = "Message image",
                        modifier = Modifier.size(200.dp).clip(RoundedCornerShape(10.dp)),
                        contentScale = ContentScale.Crop
                    )
                    message.kind == "audio" && message.attachmentUrl != null -> VoiceNoteButton(message.attachmentUrl, mine)
                    else -> Text(message.body, color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (message.editedAt != null && message.deletedAt == null) Text("Edited", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (mine && message.deletedAt == null) TextButton(onClick = { showDelete = true }) { Text("Remove") }
        }
    }
    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Remove message?") },
            text = { Text("This removes the message body and attachment for conversation members.") },
            confirmButton = { TextButton(onClick = { onDelete(); showDelete = false }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun VoiceNoteButton(url: String, mine: Boolean) {
    val player = remember { MediaPlayer() }
    DisposableEffect(player) { onDispose { player.release() } }
    TextButton(onClick = {
        runCatching {
            player.reset()
            player.setDataSource(url)
            player.setOnPreparedListener { it.start() }
            player.prepareAsync()
        }
    }) { Text("Play voice note", color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary) }
}

private fun DirectConversation.displayTitle(): String = when {
    kind == "group" && title.isNotBlank() -> title
    kind == "group" -> "BSDC group"
    else -> "Direct conversation"
}

private fun Long?.orZero(): Long = this ?: 0L
