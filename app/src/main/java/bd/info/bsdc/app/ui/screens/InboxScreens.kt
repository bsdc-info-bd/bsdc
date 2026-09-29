package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.ChatMessage
import bd.info.bsdc.app.ui.ChatRoomViewModel
import bd.info.bsdc.app.ui.InboxViewModel
import com.google.firebase.auth.FirebaseAuth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(viewModel: InboxViewModel, openConversation: (String) -> Unit) {
    val conversations = viewModel.conversations.collectAsStateWithLifecycle().value
    Scaffold(topBar = { TopAppBar(title = { Text("Messages") }) }) { padding ->
        if (conversations.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(28.dp), verticalArrangement = Arrangement.Center) {
                Text("No conversations yet", style = MaterialTheme.typography.headlineSmall)
                Text("Open a member profile and choose Message to begin a private conversation.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(vertical = 4.dp)) {
                items(conversations, key = { it.id }) { conversation ->
                    Column(Modifier.fillMaxWidth().clickable { openConversation(conversation.id) }.padding(horizontal = 18.dp, vertical = 14.dp)) {
                        Text("Direct conversation", style = MaterialTheme.typography.titleMedium)
                        Text(conversation.lastMessage.ifBlank { "No messages sent" }, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatRoomScreen(viewModel: ChatRoomViewModel, onBack: () -> Unit) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    var draft by remember { mutableStateOf("") }
    val myUid = FirebaseAuth.getInstance().currentUser?.uid
    LaunchedEffect(draft) { viewModel.typing(draft.isNotBlank()) }
    Scaffold(
        topBar = { TopAppBar(title = { Text("Conversation") }, navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }) },
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
                TextButton(onClick = { if (draft.isNotBlank()) { viewModel.send(draft); draft = "" } }, enabled = !state.sending) { Text("Send") }
            }
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.typing.any { it != myUid }) Text("Someone is typing…", modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp), style = MaterialTheme.typography.labelSmall)
            state.error?.let { Text(it, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.error) }
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                reverseLayout = false
            ) {
                items(state.messages, key = { it.id }) { message -> MessageBubble(message, message.senderId == myUid) }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, mine: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Box(
            Modifier.background(
                if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(16.dp)
            ).padding(horizontal = 12.dp, vertical = 9.dp)
        ) {
            Text(
                when (message.kind) {
                    "image" -> "Image attachment"
                    "audio" -> "Voice note attachment"
                    else -> message.body
                },
                color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
