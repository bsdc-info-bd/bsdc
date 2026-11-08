package bd.info.bsdc.app

import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.ui.viewinterop.AndroidView
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import bd.info.bsdc.app.links.IncomingLink
import bd.info.bsdc.app.links.IncomingLinkParser
import bd.info.bsdc.app.links.NewsReaderScreen
import bd.info.bsdc.app.links.UnsupportedLinkScreen
import bd.info.bsdc.app.links.openInTrustedBrowser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import bd.info.bsdc.app.auth.IdentityRepository
import bd.info.bsdc.app.auth.Member
import bd.info.bsdc.app.auth.safeAuthMessage
import bd.info.bsdc.app.feed.FeedRepository
import bd.info.bsdc.app.feed.FeedPost
import bd.info.bsdc.app.feed.CommentRepository
import bd.info.bsdc.app.feed.CommentsScreen
import bd.info.bsdc.app.social.SocialRepository
import bd.info.bsdc.app.social.MemberSearchScreen
import bd.info.bsdc.app.messaging.MessengerRepository
import bd.info.bsdc.app.messaging.MessengerInboxScreen
import bd.info.bsdc.app.messaging.ConversationScreen
import bd.info.bsdc.app.messaging.ConversationSummary
import bd.info.bsdc.app.verification.VerificationRepository
import bd.info.bsdc.app.verification.VerificationScreen
import kotlinx.coroutines.launch
import com.google.firebase.auth.FirebaseAuthException
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Ink = Color(0xFF13251F)
private val Green = Color(0xFF087B57)
private val Mint = Color(0xFFE8F5EF)
private val Canvas = Color(0xFFF5F8F6)
private val Muted = Color(0xFF718078)

class MainActivity : ComponentActivity() {
    companion object { const val NOTIFICATION_CHANNEL_ID = "bsdc_activity" }
    private var incomingLink by mutableStateOf<IncomingLink>(IncomingLink.Ignore)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val channel = NotificationChannel(NOTIFICATION_CHANNEL_ID, "BSDC activity", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Social activity and messages from BSDC"
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        incomingLink = parseIncomingIntent(intent)
        setContent { BsdcTheme { BsdcApp(incomingLink) { incomingLink = IncomingLink.Ignore } } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        incomingLink = parseIncomingIntent(intent)
    }

    private fun parseIncomingIntent(intent: Intent?): IncomingLink {
        val raw = intent?.dataString ?: intent?.getStringExtra("path") ?: intent?.getStringExtra("url")
        if (raw?.startsWith("/") == true && !raw.startsWith("//")) return IncomingLinkParser.parse("https://www.bsdc.info.bd$raw")
        return IncomingLinkParser.parse(raw)
    }
}

@Composable
private fun BsdcTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(primary = Green, onPrimary = Color.White, background = Canvas,
            surface = Color.White, onSurface = Ink, secondary = Color(0xFF43A982)),
        content = content
    )
}

private enum class Tab(val label: String) { Home("Home"), Explore("Explore"), Verify("Verify"), Inbox("Inbox"), You("You"), News("News"), Link("BSDC link"), Comments("Comments"), Conversation("Conversation") }

@Composable
private fun BsdcApp(incomingLink: IncomingLink, consumeIncomingLink: () -> Unit) {
    val context = LocalContext.current
    var toast by remember { mutableStateOf("") }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> toast = if (granted) "BSDC notifications are enabled on this device." else "Notifications remain off; you can enable them in Android settings." }
    val requestNotifications = {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        else toast = "Manage BSDC notifications in Android settings."
    }
    val identity = remember { IdentityRepository(context) }
    var member by remember { mutableStateOf(identity.currentMember()) }
    val scope = rememberCoroutineScope()
    val feedRepository = remember { FeedRepository(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) { identity.currentIdToken() } }
    val commentRepository = remember { CommentRepository(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) { identity.currentIdToken() } }
    val socialRepository = remember { SocialRepository(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) { identity.currentIdToken() } }
    val messengerRepository = remember { MessengerRepository(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) { identity.currentIdToken() } }
    val verificationRepository = remember { VerificationRepository(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) }
    var selectedConversation by remember { mutableStateOf<ConversationSummary?>(null) }
    var selectedPost by remember { mutableStateOf<FeedPost?>(null) }
    var feedItems by remember { mutableStateOf<List<FeedPost>>(emptyList()) }
    var feedLoading by remember { mutableStateOf(true) }
    var feedError by remember { mutableStateOf<String?>(null) }
    var newsUrl by remember { mutableStateOf("https://news.bsdc.info.bd") }
    var internalPath by remember { mutableStateOf("/") }
    var showAuth by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf(Tab.Home) }
    var query by remember { mutableStateOf("") }
    var showComposer by remember { mutableStateOf(false) }
    var liked by remember { mutableStateOf(setOf<String>()) }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(incomingLink) {
        when (val destination = incomingLink) {
            is IncomingLink.News -> { newsUrl = destination.url; tab = Tab.News }
            is IncomingLink.Internal -> {
                internalPath = destination.path
                tab = when {
                    destination.path == "/" -> Tab.Home
                    destination.path.startsWith("/verify") || destination.path.startsWith("/certificate") -> Tab.Verify
                    destination.path.startsWith("/@") -> Tab.You
                    destination.path.startsWith("/search") -> Tab.Explore
                    destination.path.startsWith("/messages") -> Tab.Inbox
                    else -> Tab.Link
                }
            }
            IncomingLink.Ignore -> Unit
        }
        if (incomingLink !is IncomingLink.Ignore) consumeIncomingLink()
    }
    LaunchedEffect(member?.uid) {
        if (member != null) runCatching { identity.registerCurrentFcmDevice() }
            .onFailure { toast = "Push registration could not be refreshed. Other app features remain available." }
    }
    LaunchedEffect(member?.uid) {
        feedLoading = true
        feedError = null
        runCatching { feedRepository.load() }
            .onSuccess { feedItems = it }
            .onFailure { feedError = it.message ?: "The BSDC feed could not be loaded." }
        feedLoading = false
    }
    LaunchedEffect(toast) { if (toast.isNotBlank()) { snack.showSnackbar(toast); toast = "" } }

    Scaffold(containerColor = Canvas, snackbarHost = { SnackbarHost(snack) },
        topBar = { TopBar(onSearch = { tab = Tab.Explore }, onBell = { toast = "You're all caught up" }) },
        bottomBar = { if (tab != Tab.News && tab != Tab.Link && tab != Tab.Comments && tab != Tab.Conversation) NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
            listOf(Tab.Home, Tab.Explore, Tab.Verify, Tab.Inbox, Tab.You).forEach { item ->
                val icon = when (item) { Tab.Home -> Icons.Filled.Home; Tab.Explore -> Icons.Filled.Search; Tab.Verify -> Icons.Filled.QrCodeScanner; Tab.Inbox -> Icons.Filled.ChatBubbleOutline; else -> Icons.Filled.Person }
                NavigationBarItem(selected = tab == item, onClick = { tab = item }, icon = { Icon(icon, contentDescription = item.label) }, label = { Text(item.label, fontSize = 11.sp) }, colors = NavigationBarItemDefaults.colors(selectedIconColor = Green, indicatorColor = Mint, selectedTextColor = Green))
            }
        } }, floatingActionButton = { if (tab == Tab.Home) FloatingActionButton(onClick = { showComposer = true }, containerColor = Green, contentColor = Color.White, shape = CircleShape) { Icon(Icons.Filled.Add, "Create a post") } }) { padding ->
        AnimatedContent(targetState = tab, transitionSpec = { fadeIn(tween(160)) togetherWith fadeOut(tween(100)) }, label = "tab", modifier = Modifier.padding(padding)) { screen ->
            when (screen) {
                Tab.Home -> HomeScreen(posts = feedItems, loading = feedLoading, error = feedError, liked = liked,
                    onRefresh = { scope.launch { feedLoading = true; runCatching { feedRepository.load() }.onSuccess { feedItems = it; feedError = null }.onFailure { feedError = it.message }; feedLoading = false } },
                    onLike = { post ->
                        if (member == null) toast = "Sign in to react to posts."
                        else scope.launch {
                            runCatching { feedRepository.toggleLike(post.id) }
                                .onSuccess { result ->
                                    liked = if (result.reacted) liked + post.id else liked - post.id
                                    feedItems = feedItems.map { if (it.id == post.id) it.copy(likes = result.total) else it }
                                }
                                .onFailure { toast = it.message ?: "Reaction could not be saved." }
                        }
                    }, onOpen = { toast = it }, onComments = { post -> selectedPost = post; tab = Tab.Comments })
                Tab.Explore -> MemberSearchScreen(query, { query = it }, member?.uid, socialRepository, onSignIn = { showAuth = true }, onNotice = { toast = it }, onMessage = { person ->
                    if (member == null) showAuth = true
                    else scope.launch { runCatching { messengerRepository.openDirect(person.uid) }.onSuccess { id -> selectedConversation = ConversationSummary(id, "direct", person.displayName, "", 0, person.uid, person.displayName); tab = Tab.Conversation }.onFailure { toast = it.message ?: "Couldn't open conversation." } }
                })
                Tab.Verify -> VerificationScreen(verificationRepository)
                Tab.Inbox -> if (member == null) InboxScreen(onOpen = { showAuth = true }) else MessengerInboxScreen(messengerRepository, onOpen = { selectedConversation = it; tab = Tab.Conversation }, onBack = { tab = Tab.Home })
                Tab.You -> ProfileScreen(member = member, onSignIn = { showAuth = true }, onNotifications = requestNotifications, onSignOut = {
                    scope.launch { runCatching { identity.signOut() }.onSuccess { member = null; toast = "Signed out" }.onFailure { toast = it.message ?: "Could not securely sign out. Try again when online." } }
                }, onOpen = { toast = it })
                Tab.News -> NewsReaderScreen(newsUrl, onBack = { tab = Tab.Home })
                Tab.Link -> UnsupportedLinkScreen(internalPath, onHome = { tab = Tab.Home }, onOpenBrowser = { openInTrustedBrowser(context, it) })
                Tab.Comments -> selectedPost?.let { post -> CommentsScreen(post, member?.uid, commentRepository, onBack = { tab = Tab.Home }, onSignIn = { showAuth = true }) } ?: FeedNotice("Select a post to view its comments.", loading = false, action = { tab = Tab.Home })
                Tab.Conversation -> selectedConversation?.let { conversation -> member?.uid?.let { uid -> ConversationScreen(conversation, uid, messengerRepository, onBack = { tab = Tab.Inbox }) } ?: InboxScreen(onOpen = { showAuth = true }) } ?: FeedNotice("Choose a conversation.", loading = false, action = { tab = Tab.Inbox })
            }
        }
    }
    if (showComposer) ComposerDialog(onDismiss = { showComposer = false }, onPost = { showComposer = false; toast = "Publishing will be enabled after the secure content API is connected." })
    if (showAuth) AuthDialog(identity, onDismiss = { showAuth = false }, onSignedIn = { signedIn -> member = signedIn; showAuth = false; toast = "Signed in as ${signedIn.email}" })
}

@Composable
private fun TopBar(onSearch: () -> Unit, onBell: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Color.White).statusBarsPadding().padding(start = 20.dp, end = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(13.dp)).background(Green), contentAlignment = Alignment.Center) { Text("B", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.ExtraBold) }
        Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text("BSDC", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Ink); Text("Bangladesh Software Development Community", fontSize = 10.sp, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        IconButton(onClick = onSearch) { Icon(Icons.Filled.Search, "Search", tint = Ink) }
        IconButton(onClick = onBell) { BadgedBox(badge = { Badge(containerColor = Color(0xFFE95F59)) }) { Icon(Icons.Filled.NotificationsNone, "Notifications", tint = Ink) } }
    }
}

@Composable
private fun HomeScreen(posts: List<FeedPost>, loading: Boolean, error: String?, liked: Set<String>, onRefresh: () -> Unit, onLike: (FeedPost) -> Unit, onOpen: (String) -> Unit, onComments: (FeedPost) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 18.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("Your community", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Ink); Text("Ideas, people and progress.", color = Muted, fontSize = 13.sp) }; IconButton(onClick = onRefresh, enabled = !loading) { Icon(Icons.Filled.Refresh, "Refresh feed", tint = Green) } } }
        item { Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).clickable { onOpen("Sign in to create a post") }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) { Avatar("B", Green, 38); Spacer(Modifier.width(12.dp)); Text("Share something with the community…", Modifier.weight(1f), color = Muted, fontSize = 13.sp); Icon(Icons.Filled.Edit, "Create post", tint = Green) } }
        item { Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) { Text("For you", fontWeight = FontWeight.Bold, color = Ink); Spacer(Modifier.weight(1f)); Text("BSDC feed", color = Green, fontSize = 13.sp) } }
        if (loading && posts.isEmpty()) item { FeedNotice("Loading community posts…", loading = true, action = null) }
        if (error != null && posts.isEmpty()) item { FeedNotice(error, loading = false, action = onRefresh) }
        if (!loading && error == null && posts.isEmpty()) item { FeedNotice("No posts to show yet. Check back soon.", loading = false, action = onRefresh) }
        items(posts, key = { it.id }) { post -> PostCard(post, liked = post.id in liked, onLike = { onLike(post) }, onComment = { onComments(post) }) }
        if (!loading && posts.isNotEmpty()) item { Text("You're all caught up for now", Modifier.fillMaxWidth().padding(26.dp), color = Muted, fontSize = 12.sp) }
    }
}

@Composable
private fun FeedNotice(message: String, loading: Boolean, action: (() -> Unit)?) {
    Column(Modifier.fillMaxWidth().padding(20.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (loading) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
        Text(message, Modifier.padding(top = 10.dp), color = Muted, fontSize = 13.sp)
        if (action != null) TextButton(onClick = action) { Text("Try again", color = Green) }
    }
}

@Composable
private fun PostCard(post: FeedPost, liked: Boolean, onLike: () -> Unit, onComment: () -> Unit) {
    val initials = post.author.split(" ").take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("").ifBlank { "B" }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).clip(RoundedCornerShape(22.dp)).background(Color.White).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Avatar(initials, Green, 42); Spacer(Modifier.width(11.dp)); Column(Modifier.weight(1f)) { Text(post.author, fontWeight = FontWeight.SemiBold, color = Ink, fontSize = 14.sp); Text("@${post.handle} · ${post.kind}", color = Muted, fontSize = 11.sp) }; IconButton(onClick = onComment) { Icon(Icons.Filled.MoreHoriz, "Post options", tint = Muted) } }
        Spacer(Modifier.height(13.dp)); Text(post.text.ifBlank { "BSDC ${post.kind.lowercase()}" }, color = Ink, fontSize = 14.sp, lineHeight = 21.sp)
        Spacer(Modifier.height(13.dp)); Text(post.kind.uppercase(), Modifier.clip(RoundedCornerShape(8.dp)).background(Mint).padding(horizontal = 10.dp, vertical = 5.dp), color = Green, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        HorizontalDivider(Modifier.padding(top = 13.dp), color = Color(0xFFF0F3F1))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { TextButton(onClick = onLike) { Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, null, tint = if (liked) Color(0xFFE65368) else Muted, modifier = Modifier.size(19.dp)); Spacer(Modifier.width(6.dp)); Text("${post.likes}", color = Muted) }; TextButton(onClick = onComment) { Icon(Icons.Filled.ChatBubbleOutline, null, tint = Muted, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("${post.comments}", color = Muted) }; Spacer(Modifier.weight(1f)); IconButton(onClick = onComment) { Icon(Icons.Filled.Share, "Share post", tint = Muted, modifier = Modifier.size(19.dp)) } }
    }
}

@Composable
private fun InboxScreen(onOpen: (String) -> Unit) { Column(Modifier.fillMaxSize().padding(22.dp)) { Text("Messages", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Ink); Text("Your conversations, in one place.", Modifier.padding(top = 4.dp, bottom = 24.dp), color = Muted); Surface(shape = RoundedCornerShape(20.dp), color = Color.White) { Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Filled.ChatBubbleOutline, null, tint = Green, modifier = Modifier.size(36.dp)); Text("Your inbox is ready", Modifier.padding(top = 12.dp), fontWeight = FontWeight.SemiBold, color = Ink); Text("Sign in to see and send messages.", Modifier.padding(top = 6.dp), color = Muted); TextButton(onClick = { onOpen("Sign in to continue") }) { Text("Sign in", color = Green) } } } } }

@Composable
private fun ProfileScreen(member: Member?, onSignIn: () -> Unit, onNotifications: () -> Unit, onSignOut: () -> Unit, onOpen: (String) -> Unit) { Column(Modifier.fillMaxSize().padding(22.dp)) { Text("Your space", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Ink); Surface(Modifier.fillMaxWidth().padding(top = 18.dp), shape = RoundedCornerShape(22.dp), color = Color.White) { Column(Modifier.padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally) { Avatar(member?.email?.take(1)?.uppercase() ?: "B", Green, 72); Text(member?.email ?: "Welcome to BSDC", Modifier.padding(top = 14.dp), fontWeight = FontWeight.Bold, fontSize = 19.sp, color = Ink); Text(if (member == null) "Sign in or create an account to connect with the community." else if (member.emailVerified) "Email verified" else "Check your inbox to verify your email address.", Modifier.padding(top = 7.dp), color = Muted); Button(onClick = if (member == null) onSignIn else onSignOut, Modifier.fillMaxWidth().padding(top = 16.dp), shape = RoundedCornerShape(14.dp)) { Text(if (member == null) "Sign in or create account" else "Sign out") } } }; OutlinedButton(onClick = onNotifications, Modifier.fillMaxWidth().padding(top = 12.dp), shape = RoundedCornerShape(14.dp)) { Icon(Icons.Filled.NotificationsNone, null); Spacer(Modifier.width(8.dp)); Text("Notification settings") }; listOf("Settings", "Privacy & safety", "Help and support", "About BSDC").forEach { Row(Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(15.dp)).background(Color.White).clickable { onOpen("$it will be added in a later native milestone") }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Text(it, Modifier.weight(1f), color = Ink); Icon(Icons.Filled.ChevronRight, null, tint = Muted) } } } }

@Composable
private fun AuthDialog(identity: IdentityRepository, onDismiss: () -> Unit, onSignedIn: (Member) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var createAccount by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (createAccount) "Join BSDC" else "Welcome back") },
        text = { Column {
            Text(if (identity.configured()) "Use your BSDC account" else "Sign-in configuration is not available in this build.", color = Muted)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(email, { email = it; error = null }, label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), enabled = !busy)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(password, { password = it; error = null }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), enabled = !busy)
            error?.let { Text(it, Modifier.padding(top = 10.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
            TextButton(onClick = { createAccount = !createAccount; error = null }, enabled = !busy) { Text(if (createAccount) "Already a member? Sign in" else "New to BSDC? Create an account") }
        } },
        confirmButton = { Button(enabled = !busy && identity.configured() && email.contains('@') && password.isNotEmpty(), onClick = {
            busy = true; error = null
            scope.launch {
                runCatching { if (createAccount) identity.register(email, password) else identity.signIn(email, password) }
                    .onSuccess(onSignedIn)
                    .onFailure { error = safeAuthMessage(it, createAccount) }
                busy = false
            }
        }) { if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text(if (createAccount) "Create account" else "Sign in") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

@Composable
private fun ComposerDialog(onDismiss: () -> Unit, onPost: () -> Unit) { var text by remember { mutableStateOf("") }; AlertDialog(onDismissRequest = onDismiss, title = { Text("Create a post") }, text = { OutlinedTextField(value = text, onValueChange = { text = it }, placeholder = { Text("What's on your mind?") }, minLines = 4) }, confirmButton = { TextButton(onClick = onPost, enabled = text.isNotBlank()) { Text("Continue") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }) }

@Composable
private fun Avatar(initials: String, color: Color, size: Int) { Box(Modifier.size(size.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) { Text(initials, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size / 3.2f).sp) } }
