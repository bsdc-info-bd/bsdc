package bd.info.bsdc.app.feature.messenger

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaLightboxDialog
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Root Messenger shell switching cleanly between Conversation Inbox and Live Thread view.
 * Zero audio notes / zero voice note storage — supports text, code snippets, and ImgBB photos.
 */
@Composable
fun MessengerRootScreen(
    viewerUid: String?,
    repository: MessengerRepository,
    realtimeTransport: SupabaseRealtimeTransport,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    initialConversationId: String? = null,
    onSignInRequired: () -> Unit,
    onOpenProfileHandle: (String) -> Unit = {},
) {
    val bn = language == AppLanguage.BN
    var selectedConversationId by rememberSaveable(initialConversationId) {
        mutableStateOf(initialConversationId?.takeIf { it.isNotBlank() })
    }

    if (viewerUid.isNullOrBlank()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            BsdcEmptyState(
                icon = Icons.Rounded.ChatBubbleOutline,
                title = if (bn) "মেসেঞ্জারে সাইন ইন করুন" else "Sign in to BSDC Messenger",
                subtitle = if (bn) {
                    "রিয়েল-টাইম সরাসরি বার্তা, গ্রুপ চ্যাট, ImgBB ছবি এবং অফলাইন আউটবক্স ব্যবহার করতে লগইন করুন।"
                } else {
                    "Sign in to access real-time direct chats, group conversations, ImgBB photo sharing, and offline outbox sync."
                },
                actionLabel = if (bn) "সাইন ইন" else "Sign In",
                onAction = onSignInRequired,
            )
        }
        return
    }

    val openId = selectedConversationId
    if (openId == null) {
        MessengerInboxScreen(
            viewerUid = viewerUid,
            repository = repository,
            realtimeTransport = realtimeTransport,
            imageLoader = imageLoader,
            language = language,
            onOpenConversation = { id -> selectedConversationId = id },
        )
    } else {
        ConversationThreadScreen(
            conversationId = openId,
            viewerUid = viewerUid,
            repository = repository,
            realtimeTransport = realtimeTransport,
            mediaRepository = mediaRepository,
            imageLoader = imageLoader,
            language = language,
            onBack = { selectedConversationId = null },
            onOpenProfileHandle = onOpenProfileHandle,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessengerInboxScreen(
    viewerUid: String,
    repository: MessengerRepository,
    realtimeTransport: SupabaseRealtimeTransport,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onOpenConversation: (String) -> Unit,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()
    val cachedThreads by repository.observeCachedThreads().collectAsStateWithLifecycle(initialValue = emptyList())

    var liveThreads by remember { mutableStateOf<List<ConversationSummaryItem>?>(null) }
    var liveStatus by remember { mutableStateOf(LiveChannelStatus.CONNECTING) }
    var filter by rememberSaveable { mutableStateOf(InboxFilter.ALL) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var refreshing by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var showNewChatSheet by remember { mutableStateOf(false) }
    var showSavedSheet by remember { mutableStateOf(false) }
    var refreshNonce by remember { mutableIntStateOf(0) }

    suspend fun reloadInbox() {
        refreshing = true
        runCatching { repository.fetchInbox(viewerUid) }
            .onSuccess { list ->
                liveThreads = list
                errorMsg = null
            }
            .onFailure { err ->
                errorMsg = err.message
            }
        refreshing = false
    }

    LaunchedEffect(viewerUid, refreshNonce) {
        reloadInbox()
    }

    // Real-time inbox channel via Supabase Phoenix WebSocket + graceful fallback polling
    DisposableEffect(viewerUid) {
        val stop = realtimeTransport.joinInbox(
            viewerUid = viewerUid,
            listener = object : SupabaseRealtimeTransport.InboxListener {
                override fun onInboxActivity() {
                    scope.launch { reloadInbox() }
                }

                override fun onStatusChanged(status: LiveChannelStatus) {
                    liveStatus = status
                }
            },
        )
        onDispose { stop() }
    }

    LaunchedEffect(viewerUid, liveStatus) {
        while (true) {
            delay(if (liveStatus == LiveChannelStatus.LIVE) 60_000L else 20_000L)
            runCatching { repository.fetchInbox(viewerUid) }
                .onSuccess { liveThreads = it }
        }
    }

    val sourceThreads = liveThreads ?: cachedThreads
    val filteredThreads = remember(sourceThreads, filter, searchQuery) {
        val inputs = sourceThreads.map { item ->
            MessengerEngine.InboxItemInput(
                item.id,
                item.kind,
                item.title,
                item.other?.displayName.orEmpty(),
                item.other?.username.orEmpty(),
                item.preview,
                item.lastMessageAt,
                item.unreadCount,
                item.pinned,
                item.archived,
            )
        }
        val sortedIds = MessengerEngine.sortAndFilterInbox(inputs, filter.wireKey, searchQuery).map { it.id }
        val byId = sourceThreads.associateBy { it.id }
        sortedIds.mapNotNull { byId[it] }
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showNewChatSheet = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ) {
                Icon(Icons.Rounded.Add, contentDescription = if (bn) "নতুন চ্যাট" else "New Chat")
            }
        },
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = if (bn) "মেসেঞ্জার" else "Messenger",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    )
                    LiveStatusChip(status = liveStatus, bn = bn)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(onClick = { showSavedSheet = true }) {
                        Icon(
                            Icons.Rounded.Star,
                            contentDescription = if (bn) "সংরক্ষিত বার্তা" else "Saved messages",
                        )
                    }
                    IconButton(onClick = { refreshNonce++ }) {
                        Icon(Icons.Rounded.Refresh, contentDescription = if (bn) "রিফ্রেশ" else "Refresh")
                    }
                }
            }

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                placeholder = {
                    Text(if (bn) "কথোপকথন বা @ইউজারনেম খুঁজুন..." else "Search conversations or @username...")
                },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Rounded.Close, contentDescription = null)
                        }
                    }
                },
            )

            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(InboxFilter.entries) { f ->
                    val label = when (f) {
                        InboxFilter.ALL -> if (bn) "সব" else "All"
                        InboxFilter.UNREAD -> if (bn) "অপঠিত" else "Unread"
                        InboxFilter.DIRECT -> if (bn) "সরাসরি" else "Direct"
                        InboxFilter.GROUPS -> if (bn) "গ্রুপ" else "Groups"
                        InboxFilter.PINNED -> if (bn) "পিন করা" else "Pinned"
                        InboxFilter.ARCHIVED -> if (bn) "আর্কাইভ" else "Archived"
                    }
                    FilterChip(
                        selected = filter == f,
                        onClick = { filter = f },
                        label = { Text(label) },
                    )
                }
            }

            if (errorMsg != null && liveThreads == null) {
                BsdcStatusBanner(
                    title = if (bn) "অফলাইন ক্যাশ প্রদর্শিত হচ্ছে" else "Showing offline cache",
                    body = errorMsg.orEmpty(),
                    tone = BsdcTone.WARN,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { refreshNonce++ },
                modifier = Modifier.weight(1f),
            ) {
                if (filteredThreads.isEmpty() && !refreshing) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                    ) {
                        item {
                            BsdcEmptyState(
                                icon = Icons.Rounded.ChatBubbleOutline,
                                title = if (bn) "কোনো কথোপকথন নেই" else "No conversations yet",
                                subtitle = if (bn) {
                                    "সদস্যদের সাথে সরাসরি বার্তা বা নতুন গ্রুপ শুরু করতে + বোতামে ট্যাপ করুন।"
                                } else {
                                    "Tap + to start a direct chat or create a group with BSDC members."
                                },
                                actionLabel = if (bn) "নতুন চ্যাট" else "Start a chat",
                                onAction = { showNewChatSheet = true },
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(filteredThreads, key = { it.id }) { thread ->
                            InboxThreadCard(
                                item = thread,
                                imageLoader = imageLoader,
                                language = language,
                                onClick = { onOpenConversation(thread.id) },
                                onTogglePin = {
                                    scope.launch {
                                        runCatching {
                                            repository.updateConversationFlags(thread.id, viewerUid, pinned = !thread.pinned)
                                        }.onSuccess { refreshNonce++ }
                                    }
                                },
                                onToggleArchive = {
                                    scope.launch {
                                        runCatching {
                                            repository.updateConversationFlags(thread.id, viewerUid, archived = !thread.archived)
                                        }.onSuccess { refreshNonce++ }
                                    }
                                },
                                onToggleMute = {
                                    scope.launch {
                                        runCatching {
                                            repository.updateConversationFlags(thread.id, viewerUid, muted = !thread.muted)
                                        }.onSuccess { refreshNonce++ }
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showNewChatSheet) {
        NewConversationSheet(
            bn = bn,
            onDismiss = { showNewChatSheet = false },
            onStartDirect = { handle ->
                scope.launch {
                    runCatching { repository.openDirectConversation(handle) }
                        .onSuccess { cid ->
                            showNewChatSheet = false
                            if (cid.isNotBlank()) onOpenConversation(cid)
                        }
                        .onFailure { err -> errorMsg = err.message }
                }
            },
            onCreateGroup = { title, handles ->
                scope.launch {
                    runCatching { repository.createGroupConversation(title, handles) }
                        .onSuccess { cid ->
                            showNewChatSheet = false
                            if (cid.isNotBlank()) onOpenConversation(cid)
                        }
                        .onFailure { err -> errorMsg = err.message }
                }
            },
        )
    }

    if (showSavedSheet) {
        SavedMessagesSheet(
            bn = bn,
            repository = repository,
            onDismiss = { showSavedSheet = false },
            onJump = { cid ->
                showSavedSheet = false
                onOpenConversation(cid)
            },
        )
    }
}

@Composable
private fun LiveStatusChip(status: LiveChannelStatus, bn: Boolean) {
    val (label, tone) = when (status) {
        LiveChannelStatus.LIVE -> (if (bn) "লাইভ" else "Live") to BsdcTone.OK
        LiveChannelStatus.CONNECTING -> (if (bn) "সংযুক্ত হচ্ছে" else "Connecting") to BsdcTone.INFO
        LiveChannelStatus.RECONNECTING -> (if (bn) "পুনঃসংযোগ" else "Reconnecting") to BsdcTone.WARN
        LiveChannelStatus.OFFLINE -> (if (bn) "অফলাইন" else "Offline") to BsdcTone.NEUTRAL
    }
    BsdcBadge(label = label, tone = tone)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun InboxThreadCard(
    item: ConversationSummaryItem,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleArchive: () -> Unit,
    onToggleMute: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    val title = item.displayTitle(bn)
    val avatarUrl = item.other?.avatarUrl?.ifBlank { item.avatarUrl } ?: item.avatarUrl
    var menuExpanded by remember { mutableStateOf(false) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .combinedClickable(
                onClick = onClick,
                onLongClick = { menuExpanded = true },
            ),
        shape = RoundedCornerShape(18.dp),
        color = if (item.unreadCount > 0) BsdcThemeTokens.colors.surfaceElevated else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(
            1.dp,
            if (item.pinned) MaterialTheme.colorScheme.primary.copy(alpha = 0.4f) else BsdcThemeTokens.colors.border,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BsdcAvatar(
                avatarUrl = avatarUrl,
                displayName = title,
                imageLoader = imageLoader,
                size = 48.dp,
                online = item.kind == "direct",
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (item.kind == "group") {
                        Icon(
                            Icons.Rounded.Group,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = BsdcThemeTokens.colors.mutedText,
                        )
                    }
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = if (item.unreadCount > 0) FontWeight.Bold else FontWeight.SemiBold,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (item.pinned) {
                        Icon(
                            Icons.Rounded.PushPin,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (item.muted) {
                        Icon(
                            Icons.Rounded.NotificationsOff,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = BsdcThemeTokens.colors.mutedText,
                        )
                    }
                }
                Text(
                    text = item.preview.ifBlank {
                        if (bn) "এখনো কোনো বার্তা নেই" else "No messages yet"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (item.unreadCount > 0) MaterialTheme.colorScheme.onSurface else BsdcThemeTokens.colors.mutedText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (item.unreadCount > 0) {
                    val countText = BanglaDigitFormatter.formatCount(item.unreadCount.toLong(), language)
                    BsdcBadge(label = countText, tone = BsdcTone.OK)
                }
                Box {
                    IconButton(onClick = { menuExpanded = true }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(if (item.pinned) (if (bn) "আনপিন করুন" else "Unpin") else (if (bn) "পিন করুন" else "Pin")) },
                            leadingIcon = { Icon(Icons.Rounded.PushPin, contentDescription = null) },
                            onClick = { menuExpanded = false; onTogglePin() },
                        )
                        DropdownMenuItem(
                            text = { Text(if (item.muted) (if (bn) "আনমিউট" else "Unmute") else (if (bn) "মিউট" else "Mute")) },
                            leadingIcon = {
                                Icon(
                                    if (item.muted) Icons.Rounded.NotificationsActive else Icons.Rounded.NotificationsOff,
                                    contentDescription = null,
                                )
                            },
                            onClick = { menuExpanded = false; onToggleMute() },
                        )
                        DropdownMenuItem(
                            text = { Text(if (item.archived) (if (bn) "আন-আর্কাইভ" else "Unarchive") else (if (bn) "আর্কাইভ" else "Archive")) },
                            leadingIcon = {
                                Icon(
                                    if (item.archived) Icons.Rounded.Unarchive else Icons.Rounded.Archive,
                                    contentDescription = null,
                                )
                            },
                            onClick = { menuExpanded = false; onToggleArchive() },
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationThreadScreen(
    conversationId: String,
    viewerUid: String,
    repository: MessengerRepository,
    realtimeTransport: SupabaseRealtimeTransport,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onOpenProfileHandle: (String) -> Unit,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    val cachedMessages by repository.observeCachedMessages(conversationId).collectAsStateWithLifecycle(emptyList())
    val outboxMessages by repository.observeOutbox(conversationId).collectAsStateWithLifecycle(emptyList())

    var serverMessages by remember(conversationId) { mutableStateOf<List<ChatMessageItem>?>(null) }
    var threadState by remember(conversationId) { mutableStateOf<ConversationStateModel?>(null) }
    var pins by remember(conversationId) { mutableStateOf<List<ConversationPinModel>>(emptyList()) }
    var members by remember(conversationId) { mutableStateOf<List<ConversationMemberItem>>(emptyList()) }
    var liveStatus by remember(conversationId) { mutableStateOf(LiveChannelStatus.CONNECTING) }
    var typingUids by remember(conversationId) { mutableStateOf<List<String>>(emptyList()) }
    var channelHandle by remember(conversationId) { mutableStateOf<SupabaseRealtimeTransport.ChannelHandle?>(null) }

    var draftBody by rememberSaveable(conversationId) { mutableStateOf("") }
    var draftSeeded by remember(conversationId) { mutableStateOf(false) }
    var snippetMode by rememberSaveable(conversationId) { mutableStateOf(false) }
    var snippetLanguage by rememberSaveable(conversationId) { mutableStateOf("kotlin") }
    var replyTarget by remember { mutableStateOf<ChatMessageItem?>(null) }
    var editingTarget by remember { mutableStateOf<ChatMessageItem?>(null) }
    var selectedActionMsg by remember { mutableStateOf<ChatMessageItem?>(null) }
    var lightboxUrl by remember { mutableStateOf<String?>(null) }
    var uploadProgress by remember { mutableStateOf<Int?>(null) }
    var errorBanner by remember { mutableStateOf<String?>(null) }

    var searchingInThread by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var searchHits by remember { mutableStateOf<List<MessageSearchHitItem>>(emptyList()) }
    var showPinsSheet by remember { mutableStateOf(false) }
    var showMembersSheet by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }

    suspend fun loadThread() {
        runCatching {
            val msgs = repository.fetchConversationMessages(conversationId)
            val st = repository.fetchConversationState(conversationId)
            val pn = repository.fetchPinnedMessages(conversationId)
            val mem = repository.fetchMembers(conversationId)
            Triple(msgs, st, pn to mem)
        }.onSuccess { (msgs, st, pair) ->
            serverMessages = msgs
            threadState = st
            pins = pair.first
            members = pair.second
            if (!draftSeeded && st != null && st.draftBody.isNotBlank() && draftBody.isBlank()) {
                draftBody = st.draftBody
            }
            draftSeeded = true
            errorBanner = null
            msgs.lastOrNull { it.senderUid != viewerUid }?.let { lastIncoming ->
                runCatching { repository.markMessageRead(lastIncoming.id) }
            }
        }.onFailure { err ->
            errorBanner = err.message
        }
    }

    LaunchedEffect(conversationId) {
        loadThread()
    }

    DisposableEffect(conversationId, viewerUid) {
        val handle = realtimeTransport.joinThread(
            conversationId = conversationId,
            viewerUid = viewerUid,
            listener = object : SupabaseRealtimeTransport.ThreadListener {
                override fun onMessageChange() {
                    scope.launch { loadThread() }
                }

                override fun onMetaChange() {
                    scope.launch { loadThread() }
                }

                override fun onMembersChange() {
                    scope.launch {
                        runCatching { repository.fetchMembers(conversationId) }.onSuccess { members = it }
                    }
                }

                override fun onTypingUsers(uids: List<String>) {
                    typingUids = uids
                }

                override fun onStatusChanged(status: LiveChannelStatus) {
                    liveStatus = status
                }
            },
        )
        channelHandle = handle
        onDispose {
            channelHandle = null
            handle.close()
        }
    }

    // Fallback polling when socket is not live, plus 60s live reconciliation
    LaunchedEffect(conversationId, liveStatus) {
        while (true) {
            delay(if (liveStatus == LiveChannelStatus.LIVE) 60_000L else 12_000L)
            runCatching { repository.fetchConversationMessages(conversationId) }
                .onSuccess { serverMessages = it }
        }
    }

    // Debounced cross-device draft sync (`conversation_members.draft_body`)
    LaunchedEffect(conversationId, draftBody, draftSeeded) {
        if (!draftSeeded || editingTarget != null) return@LaunchedEffect
        delay(900L)
        repository.saveDraft(conversationId, viewerUid, draftBody)
    }

    // Debounced in-thread search
    LaunchedEffect(conversationId, searchingInThread, searchQuery) {
        if (!searchingInThread || searchQuery.isBlank()) {
            searchHits = emptyList()
            return@LaunchedEffect
        }
        delay(250L)
        runCatching { repository.searchMessages(searchQuery, conversationId) }
            .onSuccess { searchHits = it }
    }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploadProgress = 5
            runCatching {
                val uploaded = mediaRepository.uploadImageUri(
                    uri = uri,
                    purpose = MediaPurpose.COMMENT_IMAGE,
                    onProgress = { pct -> uploadProgress = pct },
                )
                repository.sendMessageWithOutbox(
                    conversationId = conversationId,
                    body = draftBody.trim(),
                    kind = "image",
                    mediaUrl = uploaded.url,
                    mediaName = "image-${System.currentTimeMillis()}.webp",
                    replyToId = replyTarget?.id,
                )
            }.onSuccess {
                uploadProgress = null
                draftBody = ""
                replyTarget = null
                loadThread()
            }.onFailure { err ->
                uploadProgress = null
                errorBanner = err.message ?: if (bn) "ছবি পাঠানো যায়নি" else "Photo upload failed"
            }
        }
    }

    val confirmedList = serverMessages ?: cachedMessages
    val outboxWithSender = remember(outboxMessages, viewerUid) {
        outboxMessages.map { it.copy(senderUid = viewerUid) }
    }
    val combinedMessages = remember(confirmedList, outboxWithSender) {
        val confirmedClients = confirmedList.mapNotNull { it.clientId }.toSet()
        val remainingOutbox = outboxWithSender.filter { it.clientId !in confirmedClients }
        (confirmedList + remainingOutbox).sortedWith { a, b ->
            MessengerEngine.compareInstants(a.createdAt, b.createdAt)
        }
    }

    LaunchedEffect(combinedMessages.size) {
        if (combinedMessages.isNotEmpty() && !searchingInThread) {
            listState.animateScrollToItem((combinedMessages.size - 1).coerceAtLeast(0))
        }
    }

    val memberReadPairs = remember(members) {
        members.map { "${it.uid}|${it.lastReadAt}" }
    }
    val peerNames = members.filter { it.uid != viewerUid }
        .mapNotNull { it.profile?.displayName?.takeIf(String::isNotBlank) }
    val headerTitle = if (peerNames.size == 1) peerNames.first() else (if (bn) "কথোপকথন" else "Conversation")

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                title = {
                    Column {
                        Text(headerTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val sub = when {
                            typingUids.isNotEmpty() -> if (bn) "টাইপ করছেন..." else "typing..."
                            liveStatus == LiveChannelStatus.LIVE -> if (bn) "লাইভ সংযুক্ত" else "Live"
                            else -> if (bn) "অফলাইন/সিঙ্ক হচ্ছে" else "Syncing"
                        }
                        Text(
                            text = sub,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (typingUids.isNotEmpty()) MaterialTheme.colorScheme.primary else BsdcThemeTokens.colors.mutedText,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { searchingInThread = !searchingInThread }) {
                        Icon(Icons.Rounded.Search, contentDescription = null)
                    }
                    if (pins.isNotEmpty()) {
                        IconButton(onClick = { showPinsSheet = true }) {
                            Icon(Icons.Rounded.PushPin, contentDescription = null)
                        }
                    }
                    Box {
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Rounded.MoreVert, contentDescription = null)
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text(if (bn) "সদস্য (${BanglaDigitFormatter.formatCount(members.size.toLong(), language)})" else "Members (${members.size})") },
                                leadingIcon = { Icon(Icons.Rounded.Group, contentDescription = null) },
                                onClick = { menuExpanded = false; showMembersSheet = true },
                            )
                            val isMuted = threadState?.muted == true
                            DropdownMenuItem(
                                text = { Text(if (isMuted) (if (bn) "আনমিউট" else "Unmute") else (if (bn) "মিউট" else "Mute")) },
                                leadingIcon = { Icon(Icons.Rounded.NotificationsOff, contentDescription = null) },
                                onClick = {
                                    menuExpanded = false
                                    scope.launch {
                                        runCatching { repository.updateConversationFlags(conversationId, viewerUid, muted = !isMuted) }
                                            .onSuccess { loadThread() }
                                    }
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(if (bn) "গ্রুপ ত্যাগ করুন" else "Leave conversation") },
                                leadingIcon = { Icon(Icons.AutoMirrored.Rounded.ExitToApp, contentDescription = null) },
                                onClick = { menuExpanded = false; confirmLeave = true },
                            )
                        }
                    }
                },
            )
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                uploadProgress?.let { pct ->
                    LinearProgressIndicator(
                        progress = { (pct / 100f).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (replyTarget != null || editingTarget != null) {
                    val activeLabel = if (editingTarget != null) {
                        (if (bn) "সম্পাদনা: " else "Editing: ") + MessengerEngine.previewLine(editingTarget?.body.orEmpty(), 48)
                    } else {
                        (if (bn) "উত্তর দিচ্ছেন: " else "Replying to: ") + MessengerEngine.previewLine(replyTarget?.body.orEmpty(), 48)
                    }
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = BsdcThemeTokens.colors.brandSoft,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = activeLabel,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            IconButton(
                                onClick = { replyTarget = null; editingTarget = null },
                                modifier = Modifier.size(24.dp),
                            ) {
                                Icon(Icons.Rounded.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }

                if (snippetMode) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(listOf("kotlin", "java", "typescript", "sql", "python")) { lang ->
                            FilterChip(
                                selected = snippetLanguage == lang,
                                onClick = { snippetLanguage = lang },
                                label = { Text(lang) },
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    IconButton(
                        onClick = {
                            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        enabled = editingTarget == null && uploadProgress == null,
                    ) {
                        Icon(
                            Icons.Rounded.PhotoLibrary,
                            contentDescription = if (bn) "ছবি পাঠান (ImgBB)" else "Send photo (ImgBB)",
                        )
                    }
                    IconButton(
                        onClick = { snippetMode = !snippetMode },
                        enabled = editingTarget == null,
                    ) {
                        Icon(
                            Icons.Rounded.Code,
                            contentDescription = if (bn) "কোড স্নিপেট" else "Code snippet",
                            tint = if (snippetMode) MaterialTheme.colorScheme.primary else BsdcThemeTokens.colors.mutedText,
                        )
                    }
                    OutlinedTextField(
                        value = draftBody,
                        onValueChange = { next ->
                            draftBody = next
                            channelHandle?.signalTyping(next.isNotBlank())
                        },
                        modifier = Modifier.weight(1f),
                        maxLines = 5,
                        shape = RoundedCornerShape(20.dp),
                        placeholder = {
                            Text(
                                if (snippetMode) {
                                    if (bn) "কোড পেস্ট করুন..." else "Paste code snippet..."
                                } else {
                                    if (bn) "বার্তা লিখুন..." else "Write a message..."
                                },
                            )
                        },
                    )
                    IconButton(
                        enabled = draftBody.trim().isNotEmpty(),
                        onClick = {
                            val textToSend = draftBody.trim()
                            val editMsg = editingTarget
                            val repMsg = replyTarget
                            draftBody = ""
                            editingTarget = null
                            replyTarget = null
                            channelHandle?.signalTyping(false)
                            scope.launch {
                                if (editMsg != null) {
                                    runCatching { repository.editMessage(editMsg.id, textToSend) }
                                        .onSuccess { loadThread() }
                                        .onFailure { errorBanner = it.message }
                                } else {
                                    val kind = if (snippetMode) "snippet" else "text"
                                    val lang = if (snippetMode) snippetLanguage else ""
                                    snippetMode = false
                                    repository.sendMessageWithOutbox(
                                        conversationId = conversationId,
                                        body = textToSend,
                                        kind = kind,
                                        codeLanguage = lang,
                                        replyToId = repMsg?.id,
                                    )
                                    loadThread()
                                }
                            }
                        },
                    ) {
                        Icon(
                            Icons.AutoMirrored.Rounded.Send,
                            contentDescription = if (bn) "পাঠান" else "Send",
                            tint = if (draftBody.trim().isNotEmpty()) MaterialTheme.colorScheme.primary else BsdcThemeTokens.colors.mutedText,
                        )
                    }
                }
            }
        },
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            if (searchingInThread) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                        placeholder = { Text(if (bn) "এই থ্রেডে খুঁজুন..." else "Search in this thread...") },
                        trailingIcon = {
                            IconButton(onClick = { searchingInThread = false; searchQuery = "" }) {
                                Icon(Icons.Rounded.Close, contentDescription = null)
                            }
                        },
                    )
                    if (searchHits.isNotEmpty()) {
                        LazyColumn(modifier = Modifier.heightIn(max = 180.dp)) {
                            items(searchHits, key = { it.messageId }) { hit ->
                                val spans = remember(hit.body, searchQuery) {
                                    MessengerEngine.highlightMatches(hit.body, searchQuery)
                                }
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            val idx = combinedMessages.indexOfFirst { it.id == hit.messageId }
                                            if (idx >= 0) {
                                                scope.launch { listState.animateScrollToItem(idx) }
                                            }
                                            searchingInThread = false
                                        },
                                ) {
                                    Text(
                                        text = buildAnnotatedString {
                                            spans.forEach { sp ->
                                                if (sp.hit) {
                                                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)) {
                                                        append(sp.text)
                                                    }
                                                } else append(sp.text)
                                            }
                                        },
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }

            if (pins.isNotEmpty()) {
                val topPin = pins.first()
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showPinsSheet = true },
                    color = BsdcThemeTokens.colors.brandSoft,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            Icons.Rounded.PushPin,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = BsdcThemeTokens.colors.brandStrong,
                        )
                        Text(
                            text = MessengerEngine.previewLine(topPin.body.ifBlank { topPin.kind }, 80),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        if (pins.size > 1) {
                            val totalStr = BanglaDigitFormatter.formatCount(pins.size.toLong(), language)
                            BsdcBadge(label = totalStr, tone = BsdcTone.INFO)
                        }
                    }
                }
            }

            errorBanner?.let { msg ->
                BsdcStatusBanner(
                    title = if (bn) "সংযোগ সতর্কতা" else "Sync notice",
                    body = msg,
                    tone = BsdcTone.WARN,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                )
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(combinedMessages.size, key = { idx -> combinedMessages[idx].id }) { index ->
                    val msg = combinedMessages[index]
                    val prev = if (index > 0) combinedMessages[index - 1] else null
                    val grouped = prev != null && MessengerEngine.shouldGroupWithPrevious(
                        prev.senderUid,
                        prev.createdAt,
                        msg.senderUid,
                        msg.createdAt,
                    )
                    val mine = msg.senderUid == viewerUid
                    val readers = MessengerEngine.countReadByMembers(
                        msg.createdAt,
                        msg.senderUid,
                        viewerUid,
                        memberReadPairs,
                    )
                    MessageBubbleCard(
                        msg = msg,
                        mine = mine,
                        groupedWithPrevious = grouped,
                        readCount = readers,
                        imageLoader = imageLoader,
                        bn = bn,
                        onLongPress = { selectedActionMsg = msg },
                        onSwipeReply = { replyTarget = msg },
                        onRetryOutbox = { cid ->
                            scope.launch {
                                repository.retryOutboxMessage(cid)
                                loadThread()
                            }
                        },
                        onToggleReaction = { emoji ->
                            scope.launch {
                                runCatching { repository.toggleReaction(msg.id, emoji) }
                                    .onSuccess { loadThread() }
                            }
                        },
                        onTapImage = { url -> lightboxUrl = url },
                        onTapMention = onOpenProfileHandle,
                    )
                }
            }
        }
    }

    selectedActionMsg?.let { actionMsg ->
        ModalBottomSheet(onDismissRequest = { selectedActionMsg = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (actionMsg.deliveryState == OutboxDeliveryState.CONFIRMED && !actionMsg.isDeleted) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        items(MessengerEngine.REACTION_CHOICES) { emoji ->
                            val active = emoji in actionMsg.myReactions
                            Surface(
                                shape = CircleShape,
                                color = if (active) BsdcThemeTokens.colors.brandSoft else MaterialTheme.colorScheme.surfaceVariant,
                                modifier = Modifier.clickable {
                                    selectedActionMsg = null
                                    scope.launch {
                                        runCatching { repository.toggleReaction(actionMsg.id, emoji) }
                                            .onSuccess { loadThread() }
                                    }
                                },
                            ) {
                                Text(
                                    text = emoji,
                                    style = MaterialTheme.typography.titleLarge,
                                    modifier = Modifier.padding(10.dp),
                                )
                            }
                        }
                    }
                    HorizontalDivider()
                    SheetActionRow(Icons.AutoMirrored.Rounded.Reply, if (bn) "উত্তর দিন" else "Reply") {
                        replyTarget = actionMsg
                        selectedActionMsg = null
                    }
                    SheetActionRow(
                        if (actionMsg.starred) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                        if (actionMsg.starred) (if (bn) "তারকা সরান" else "Unstar") else (if (bn) "তারকা চিহ্নিত করুন" else "Star message"),
                    ) {
                        selectedActionMsg = null
                        scope.launch { runCatching { repository.toggleStar(actionMsg.id) }.onSuccess { loadThread() } }
                    }
                    SheetActionRow(
                        Icons.Rounded.PushPin,
                        if (actionMsg.pinned) (if (bn) "আনপিন করুন" else "Unpin") else (if (bn) "পিন করুন" else "Pin message"),
                    ) {
                        selectedActionMsg = null
                        scope.launch { runCatching { repository.togglePin(actionMsg.id) }.onSuccess { loadThread() } }
                    }
                    if (actionMsg.senderUid == viewerUid) {
                        if (actionMsg.kind == "text") {
                            SheetActionRow(Icons.Rounded.Edit, if (bn) "সম্পাদনা করুন" else "Edit") {
                                editingTarget = actionMsg
                                draftBody = actionMsg.body
                                selectedActionMsg = null
                            }
                        }
                        SheetActionRow(Icons.Rounded.Delete, if (bn) "মুছে ফেলুন" else "Delete") {
                            selectedActionMsg = null
                            scope.launch { runCatching { repository.deleteMessage(actionMsg.id) }.onSuccess { loadThread() } }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    if (showPinsSheet) {
        ModalBottomSheet(onDismissRequest = { showPinsSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = if (bn) "পিন করা বার্তা" else "Pinned messages",
                    style = MaterialTheme.typography.titleLarge,
                )
                pins.forEach { p ->
                    BsdcCard {
                        Text(p.body.ifBlank { p.kind }, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    if (showMembersSheet) {
        ModalBottomSheet(onDismissRequest = { showMembersSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = if (bn) "সদস্য তালিকা" else "Conversation members",
                    style = MaterialTheme.typography.titleLarge,
                )
                members.filter { it.leftAt == null }.forEach { m ->
                    val name = m.profile?.displayName?.ifBlank { "@${m.profile.username}" } ?: m.uid
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        BsdcAvatar(
                            avatarUrl = m.profile?.avatarUrl.orEmpty(),
                            displayName = name,
                            imageLoader = imageLoader,
                            size = 36.dp,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(name, style = MaterialTheme.typography.titleSmall)
                            if (!m.profile?.username.isNullOrBlank()) {
                                Text("@${m.profile?.username}", style = MaterialTheme.typography.bodySmall, color = BsdcThemeTokens.colors.mutedText)
                            }
                        }
                        BsdcBadge(label = m.role, tone = if (m.role == "owner") BsdcTone.OK else BsdcTone.NEUTRAL)
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text(if (bn) "কথোপকথন ছাড়বেন?" else "Leave conversation?") },
            text = {
                Text(
                    if (bn) "আপনি পুরনো ইতিহাস রাখতে পারবেন কিন্তু নতুন বার্তা পাবেন না।"
                    else "You will keep past history, but stop receiving new messages.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmLeave = false
                        scope.launch {
                            runCatching { repository.leaveConversation(conversationId) }
                                .onSuccess { onBack() }
                        }
                    },
                ) {
                    Text(if (bn) "ছেড়ে যান" else "Leave")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLeave = false }) {
                    Text(if (bn) "বাতিল" else "Cancel")
                }
            },
        )
    }

    lightboxUrl?.let { url ->
        BsdcMediaLightboxDialog(
            fullUrl = url,
            caption = "",
            imageLoader = imageLoader,
            onDismiss = { lightboxUrl = null },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubbleCard(
    msg: ChatMessageItem,
    mine: Boolean,
    groupedWithPrevious: Boolean,
    readCount: Int,
    imageLoader: ImageLoader,
    bn: Boolean,
    onLongPress: () -> Unit,
    onSwipeReply: () -> Unit,
    onRetryOutbox: (String) -> Unit,
    onToggleReaction: (String) -> Unit,
    onTapImage: (String) -> Unit,
    onTapMention: (String) -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    var dragOffset by remember { mutableFloatStateOf(0f) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = if (groupedWithPrevious) 1.dp else 8.dp),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        if (!mine && !groupedWithPrevious && msg.author != null) {
            Text(
                text = msg.author.displayName,
                style = MaterialTheme.typography.labelSmall,
                color = BsdcThemeTokens.colors.mutedText,
                modifier = Modifier.padding(start = 8.dp, bottom = 2.dp),
            )
        }

        Surface(
            modifier = Modifier
                .widthIn(max = 310.dp)
                .offset { IntOffset(dragOffset.roundToInt(), 0) }
                .pointerInput(msg.id) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            if (dragOffset > 64f && !msg.isDeleted) onSwipeReply()
                            dragOffset = 0f
                        },
                        onDragCancel = { dragOffset = 0f },
                        onHorizontalDrag = { _, delta ->
                            dragOffset = (dragOffset + delta).coerceIn(0f, 96f)
                        },
                    )
                }
                .clip(RoundedCornerShape(18.dp))
                .combinedClickable(
                    onClick = {},
                    onLongClick = onLongPress,
                ),
            shape = RoundedCornerShape(18.dp),
            color = if (mine) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
            border = BorderStroke(
                1.dp,
                if (msg.deliveryState == OutboxDeliveryState.FAILED) BsdcThemeTokens.colors.danger
                else BsdcThemeTokens.colors.border,
            ),
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (!msg.replyBody.isNullOrBlank()) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.background.copy(alpha = 0.55f),
                    ) {
                        Text(
                            text = MessengerEngine.previewLine(msg.replyBody, 90),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                        )
                    }
                }

                when {
                    msg.isDeleted -> {
                        Text(
                            text = if (bn) "বার্তা মুছে ফেলা হয়েছে" else "Message deleted",
                            style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic),
                            color = BsdcThemeTokens.colors.mutedText,
                        )
                    }
                    msg.kind == "image" && msg.mediaUrl.isNotBlank() -> {
                        BsdcImgbbImage(
                            fullUrl = msg.mediaUrl,
                            thumbUrl = msg.mediaUrl,
                            contentDescription = msg.mediaName,
                            imageLoader = imageLoader,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 120.dp, max = 240.dp),
                            targetWidthPx = 720,
                            contentScale = ContentScale.Crop,
                            cornerRadiusDp = 12,
                            onTapOpenLightbox = { onTapImage(msg.mediaUrl) },
                        )
                        if (msg.body.isNotBlank()) {
                            RichMessageBody(msg.body, onTapUrl = { uriHandler.openUri(it) }, onTapMention = onTapMention)
                        }
                    }
                    msg.kind == "snippet" -> {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surface,
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                if (msg.codeLanguage.isNotBlank()) {
                                    Text(
                                        text = msg.codeLanguage.uppercase(),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                                Text(
                                    text = msg.body,
                                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                                )
                            }
                        }
                    }
                    else -> {
                        RichMessageBody(msg.body, onTapUrl = { uriHandler.openUri(it) }, onTapMention = onTapMention)
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (msg.isEdited) {
                        Text(
                            text = if (bn) "সম্পাদিত" else "edited",
                            style = MaterialTheme.typography.labelSmall,
                            color = BsdcThemeTokens.colors.mutedText,
                        )
                    }
                    if (msg.starred) {
                        Icon(Icons.Rounded.Star, contentDescription = null, modifier = Modifier.size(13.dp), tint = BsdcThemeTokens.colors.warn)
                    }
                    when (msg.deliveryState) {
                        OutboxDeliveryState.PENDING, OutboxDeliveryState.SENDING -> {
                            Icon(Icons.Rounded.Schedule, contentDescription = null, modifier = Modifier.size(14.dp), tint = BsdcThemeTokens.colors.mutedText)
                        }
                        OutboxDeliveryState.FAILED -> {
                            Row(
                                modifier = Modifier.clickable {
                                    msg.clientId?.let { onRetryOutbox(it) }
                                },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(Icons.Rounded.ErrorOutline, contentDescription = null, modifier = Modifier.size(14.dp), tint = BsdcThemeTokens.colors.danger)
                                Text(
                                    text = if (bn) "ব্যর্থ · আবার চেষ্টা করুন" else "Failed · Tap to retry",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = BsdcThemeTokens.colors.danger,
                                )
                            }
                        }
                        OutboxDeliveryState.CONFIRMED -> {
                            if (mine && readCount > 0) {
                                Icon(
                                    Icons.Rounded.DoneAll,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (msg.reactions.isNotEmpty() && !msg.isDeleted) {
            Row(
                modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                msg.reactions.forEach { (emoji, count) ->
                    val chosen = emoji in msg.myReactions
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = if (chosen) BsdcThemeTokens.colors.brandSoft else MaterialTheme.colorScheme.surfaceVariant,
                        border = BorderStroke(1.dp, BsdcThemeTokens.colors.border),
                        modifier = Modifier.clickable { onToggleReaction(emoji) },
                    ) {
                        Text(
                            text = "$emoji $count",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RichMessageBody(
    body: String,
    onTapUrl: (String) -> Unit,
    onTapMention: (String) -> Unit,
) {
    val segments = remember(body) { MessengerEngine.parseMessageBody(body) }
    val primaryColor = MaterialTheme.colorScheme.primary
    val blocks = remember(segments) {
        buildList<List<MessengerEngine.BodySegment>> {
            val inlineBuf = mutableListOf<MessengerEngine.BodySegment>()
            for (seg in segments) {
                if (seg.type == MessengerEngine.SegmentType.CODE) {
                    if (inlineBuf.isNotEmpty()) {
                        add(inlineBuf.toList())
                        inlineBuf.clear()
                    }
                    add(listOf(seg))
                } else {
                    inlineBuf.add(seg)
                }
            }
            if (inlineBuf.isNotEmpty()) add(inlineBuf.toList())
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        blocks.forEach { block ->
            val first = block.firstOrNull()
            if (first != null && first.type == MessengerEngine.SegmentType.CODE) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surface,
                ) {
                    Column(modifier = Modifier.padding(8.dp)) {
                        if (first.metadata.isNotBlank()) {
                            Text(
                                text = first.metadata.uppercase(),
                                style = MaterialTheme.typography.labelSmall,
                                color = primaryColor,
                            )
                        }
                        Text(
                            text = first.value,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        )
                    }
                }
            } else if (block.isNotEmpty()) {
                val text = buildAnnotatedString {
                    block.forEach { seg ->
                        when (seg.type) {
                            MessengerEngine.SegmentType.TEXT -> append(seg.value)
                            MessengerEngine.SegmentType.LINK -> {
                                withStyle(SpanStyle(color = primaryColor, fontWeight = FontWeight.Medium)) {
                                    append(seg.value)
                                }
                            }
                            MessengerEngine.SegmentType.MENTION -> {
                                withStyle(SpanStyle(color = primaryColor, fontWeight = FontWeight.SemiBold)) {
                                    append(seg.value)
                                }
                            }
                            MessengerEngine.SegmentType.CODE -> {}
                        }
                    }
                }
                val firstLink = block.firstOrNull { it.type == MessengerEngine.SegmentType.LINK }
                val firstMention = block.firstOrNull { it.type == MessengerEngine.SegmentType.MENTION }
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = when {
                        firstLink != null -> Modifier.clickable { onTapUrl(firstLink.metadata) }
                        firstMention != null -> Modifier.clickable { onTapMention(firstMention.metadata) }
                        else -> Modifier
                    },
                )
            }
        }
    }
}

@Composable
private fun SheetActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, contentDescription = null)
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewConversationSheet(
    bn: Boolean,
    onDismiss: () -> Unit,
    onStartDirect: (String) -> Unit,
    onCreateGroup: (String, List<String>) -> Unit,
) {
    var groupMode by remember { mutableStateOf(false) }
    var handleInput by remember { mutableStateOf("") }
    var groupTitle by remember { mutableStateOf("") }
    var membersRaw by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = if (bn) "নতুন কথোপকথন শুরু করুন" else "Start a conversation",
                style = MaterialTheme.typography.titleLarge,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = !groupMode,
                    onClick = { groupMode = false },
                    label = { Text(if (bn) "সরাসরি মেসেজ" else "Direct message") },
                )
                FilterChip(
                    selected = groupMode,
                    onClick = { groupMode = true },
                    label = { Text(if (bn) "গ্রুপ চ্যাট" else "Group chat") },
                )
            }
            if (!groupMode) {
                OutlinedTextField(
                    value = handleInput,
                    onValueChange = { handleInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(if (bn) "@ইউজারনেম বা UID" else "@username or UID") },
                )
                BsdcButton(
                    label = if (bn) "চ্যাট খুলুন" else "Open chat",
                    enabled = handleInput.isNotBlank(),
                    onClick = { onStartDirect(handleInput) },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                OutlinedTextField(
                    value = groupTitle,
                    onValueChange = { groupTitle = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(if (bn) "গ্রুপের নাম" else "Group title") },
                )
                OutlinedTextField(
                    value = membersRaw,
                    onValueChange = { membersRaw = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (bn) "সদস্য (@handle কমা দিয়ে লিখুন)" else "Members (@handles comma-separated)") },
                )
                BsdcButton(
                    label = if (bn) "গ্রুপ তৈরি করুন" else "Create group",
                    enabled = groupTitle.trim().isNotEmpty(),
                    onClick = {
                        val handles = membersRaw.split(",").map { it.trim() }.filter { it.isNotBlank() }
                        onCreateGroup(groupTitle, handles)
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SavedMessagesSheet(
    bn: Boolean,
    repository: MessengerRepository,
    onDismiss: () -> Unit,
    onJump: (String) -> Unit,
) {
    var items by remember { mutableStateOf<List<SavedMessageItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        items = runCatching { repository.fetchSavedMessages() }.getOrDefault(emptyList())
        loading = false
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = if (bn) "সংরক্ষিত বার্তা" else "Saved messages",
                style = MaterialTheme.typography.titleLarge,
            )
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            } else if (items.isEmpty()) {
                Text(
                    text = if (bn) "কোনো বার্তা তারকা চিহ্নিত করা হয়নি।" else "No starred messages yet.",
                    color = BsdcThemeTokens.colors.mutedText,
                )
            } else {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 320.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(items, key = { it.messageId }) { saved ->
                        BsdcCard(modifier = Modifier.clickable { onJump(saved.conversationId) }) {
                            Text(
                                text = saved.body.ifBlank { saved.mediaName.ifBlank { saved.kind } },
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
