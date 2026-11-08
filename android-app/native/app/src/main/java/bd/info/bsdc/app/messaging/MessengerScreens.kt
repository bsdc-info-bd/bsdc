package bd.info.bsdc.app.messaging

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
fun MessengerInboxScreen(repository: MessengerRepository, onOpen: (ConversationSummary) -> Unit, onBack: () -> Unit) {
    var conversations by remember { mutableStateOf<List<ConversationSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun refresh() { scope.launch { loading = true; runCatching { repository.inbox() }.onSuccess { conversations = it; error = null }.onFailure { error = it.message ?: "Inbox is unavailable." }; loading = false } }
    LaunchedEffect(Unit) { refresh() }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Back") }; Text("Messages", fontSize = 22.sp, fontWeight = FontWeight.Bold) }
        if (loading && conversations.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else if (error != null && conversations.isEmpty()) Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(error!!, color = Color.Gray); TextButton(onClick = ::refresh) { Text("Try again") } }
        else if (conversations.isEmpty()) Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Icon(Icons.Filled.ChatBubbleOutline, null, tint = Color(0xFF087B57), modifier = Modifier.size(40.dp)); Text("No conversations yet", Modifier.padding(top = 12.dp), fontWeight = FontWeight.SemiBold); Text("Start a conversation from a member profile.", Modifier.padding(top = 6.dp), color = Color.Gray) }
        else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(conversations, key = { it.id }) { conversation ->
                Surface(onClick = { onOpen(conversation) }, shape = RoundedCornerShape(16.dp), color = Color.White) {
                    Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).background(Color(0xFF087B57), CircleShape), contentAlignment = Alignment.Center) { Text(conversation.otherName.take(1).ifBlank { conversation.title.take(1) }.uppercase(), color = Color.White, fontWeight = FontWeight.Bold) }
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(conversation.otherName.ifBlank { conversation.title.ifBlank { "BSDC conversation" } }, fontWeight = FontWeight.SemiBold); Text(conversation.preview.ifBlank { "Start a conversation" }, color = Color.Gray, maxLines = 1, fontSize = 13.sp) }
                        if (conversation.unread > 0) Badge { Text(conversation.unread.toString()) }
                    }
                }
            }
        }
    }
}

@Composable
fun ConversationScreen(conversation: ConversationSummary, viewerUid: String, repository: MessengerRepository, onBack: () -> Unit) {
    var messages by remember(conversation.id) { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var pendingClientId by remember { mutableStateOf<String?>(null) }
    var pendingBody by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    suspend fun refresh() {
        runCatching { repository.messages(conversation.id) }.onSuccess { messages = it; error = null }.onFailure { error = it.message ?: "Messages are unavailable." }
    }
    LaunchedEffect(conversation.id) {
        refresh(); runCatching { repository.markRead(conversation.id) }
        while (true) { delay(8_000); refresh() }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "Back") }; Column { Text(conversation.otherName.ifBlank { conversation.title.ifBlank { "Conversation" } }, fontWeight = FontWeight.Bold); Text("Messages refresh periodically", color = Color.Gray, fontSize = 11.sp) } }
        if (messages.isEmpty() && error != null) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text(error!!, color = Color.Gray) }
        else LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(messages, key = { it.id }) { message ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (message.senderUid == viewerUid) Arrangement.End else Arrangement.Start) {
                    Column(Modifier.widthIn(max = 300.dp).background(if (message.senderUid == viewerUid) Color(0xFFE8F5EF) else Color.White, RoundedCornerShape(16.dp)).padding(12.dp)) {
                        if (message.senderUid != viewerUid) Text(message.senderName, fontWeight = FontWeight.SemiBold, color = Color(0xFF087B57), fontSize = 11.sp)
                        Text(if (message.deleted) "Message deleted" else message.body, Modifier.padding(top = 4.dp), color = Color(0xFF13251F), fontSize = 14.sp)
                    }
                }
            }
        }
        error?.takeIf { messages.isNotEmpty() }?.let { Text(it, Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        Row(Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().imePadding().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(text, { value -> if (value.length <= 20_000) { if (value != pendingBody) pendingClientId = null; text = value } }, Modifier.weight(1f), placeholder = { Text("Message…") }, shape = RoundedCornerShape(20.dp), maxLines = 5, enabled = !busy)
            IconButton(enabled = !busy && text.isNotBlank(), onClick = {
                val body = text
                val clientId = pendingClientId?.takeIf { pendingBody == body } ?: UUID.randomUUID().toString()
                pendingClientId = clientId; pendingBody = body
                busy = true
                scope.launch { runCatching { repository.send(conversation.id, body, clientId) }.onSuccess { sent -> messages = (messages + sent).distinctBy { it.id }.sortedBy { it.createdAt }; text = ""; pendingClientId = null; pendingBody = "" }.onFailure { error = it.message ?: "Message could not be sent. Retrying keeps the same request identifier." }; busy = false }
            }) { if (busy) CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 2.dp) else Icon(Icons.Filled.Send, "Send message", tint = Color(0xFF087B57)) }
        }
    }
}
