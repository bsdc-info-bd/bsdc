package bd.info.bsdc.app.social

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChatBubbleOutline
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

@Composable
fun MemberSearchScreen(query: String, onQueryChange: (String) -> Unit, viewerUid: String?, repository: SocialRepository, onSignIn: () -> Unit, onNotice: (String) -> Unit, onMessage: (MemberResult) -> Unit) {
    var results by remember { mutableStateOf<List<MemberResult>>(emptyList()) }
    var followed by remember { mutableStateOf(setOf<String>()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pendingUid by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(query, viewerUid) {
        val term = query.trim()
        if (term.length < 2) { results = emptyList(); error = null; loading = false }
        else {
            delay(300)
            loading = true; error = null
            runCatching { repository.searchMembers(term) }
                .onSuccess { found ->
                    results = found
                    if (viewerUid != null) runCatching { repository.following(viewerUid, found.map { it.uid }) }
                        .onSuccess { followed = it }
                        .onFailure { error = it.message ?: "Follow status is unavailable." }
                    else followed = emptySet()
                }
                .onFailure { error = it.message ?: "Member search is unavailable." }
            loading = false
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 16.dp)) {
        Text("Discover", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color(0xFF13251F))
        Text("Find people and ideas in BSDC", color = Color.Gray, modifier = Modifier.padding(top = 4.dp, bottom = 18.dp))
        OutlinedTextField(value = query, onValueChange = onQueryChange, modifier = Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Filled.Search, null) }, placeholder = { Text("Search community members") }, shape = RoundedCornerShape(16.dp), singleLine = true)
        if (query.trim().length < 2) {
            Text("Explore topics", Modifier.padding(top = 24.dp, bottom = 12.dp), fontWeight = FontWeight.Bold, color = Color(0xFF13251F))
            listOf("Kotlin & Android", "Web development", "Career growth", "Open source", "AI & machine learning").forEach { topic ->
                Surface(Modifier.fillMaxWidth().padding(vertical = 5.dp), shape = RoundedCornerShape(14.dp), color = Color.White) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Tag, null, tint = Color(0xFF087B57)); Spacer(Modifier.width(12.dp)); Text(topic, color = Color(0xFF13251F)) } }
            }
        } else {
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 10.dp))
            error?.let { Text(it, Modifier.padding(vertical = 10.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
            LazyColumn(Modifier.fillMaxSize().padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(results, key = { it.uid }) { person ->
                    Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(16.dp)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(44.dp).background(Color(0xFF087B57), CircleShape), contentAlignment = Alignment.Center) { Text(person.displayName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold) }
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(person.displayName, fontWeight = FontWeight.SemiBold, color = Color(0xFF13251F)); Text("@${person.username}", color = Color.Gray, fontSize = 12.sp); if (person.bio.isNotBlank()) Text(person.bio, color = Color.Gray, fontSize = 12.sp, maxLines = 2) }
                        val isFollowing = person.uid in followed
                        IconButton(onClick = { if (viewerUid == null) onSignIn() else onMessage(person) }) { Icon(Icons.Filled.ChatBubbleOutline, contentDescription = "Message ${person.displayName}", tint = Color(0xFF087B57)) }
                        OutlinedButton(enabled = pendingUid != person.uid, onClick = {
                            if (viewerUid == null) onSignIn()
                            else {
                                pendingUid = person.uid
                                scope.launch {
                                    runCatching { repository.setFollowing(viewerUid, person.uid, !isFollowing) }
                                        .onSuccess { followed = if (isFollowing) followed - person.uid else followed + person.uid }
                                        .onFailure { onNotice(it.message ?: "Follow action failed.") }
                                    pendingUid = null
                                }
                            }
                        }, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)) {
                            if (pendingUid == person.uid) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            else { Icon(if (isFollowing) Icons.Filled.Check else Icons.Filled.PersonAdd, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(5.dp)); Text(if (isFollowing) "Following" else "Follow", fontSize = 11.sp) }
                        }
                    }
                }
                if (!loading && error == null && results.isEmpty()) item { Text("No members found for that search.", Modifier.padding(18.dp), color = Color.Gray) }
            }
        }
    }
}
