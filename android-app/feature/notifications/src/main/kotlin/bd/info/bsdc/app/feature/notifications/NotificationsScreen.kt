package bd.info.bsdc.app.feature.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.NotificationPrefs
import bd.info.bsdc.app.core.push.BsdcPushRegistrationManager
import bd.info.bsdc.app.core.push.PushEventBus
import bd.info.bsdc.app.core.push.RegisteredFcmDevice
import coil3.ImageLoader
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewerUid: String?,
    initialPrefs: NotificationPrefs,
    repository: NotificationsRepository,
    pushManager: BsdcPushRegistrationManager,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onNavigatePath: (String) -> Unit,
    liveRefreshNonce: Int = 0,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()

    var items by remember { mutableStateOf<List<NotificationInboxItem>>(emptyList()) }
    var devices by remember { mutableStateOf<List<RegisteredFcmDevice>>(emptyList()) }
    var prefs by remember(initialPrefs) { mutableStateOf(initialPrefs) }
    var filter by rememberSaveable { mutableStateOf(NotificationsFilterEngine.CategoryFilter.ALL) }
    var refreshing by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var pushMsg by remember { mutableStateOf<String?>(null) }
    var showPrefsSheet by remember { mutableStateOf(false) }
    var refreshNonce by remember { mutableIntStateOf(0) }

    LaunchedEffect(viewerUid) {
        if (viewerUid.isNullOrBlank()) return@LaunchedEffect
        PushEventBus.events.collect {
            refreshNonce++
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (!viewerUid.isNullOrBlank()) {
            refreshNonce++
        }
    }

    LaunchedEffect(viewerUid, refreshNonce, liveRefreshNonce) {
        if (viewerUid.isNullOrBlank()) return@LaunchedEffect
        refreshing = true
        runCatching { repository.fetchInbox() }
            .onSuccess { list ->
                items = list
                errorMsg = null
            }
            .onFailure { err -> errorMsg = err.message }
        devices = runCatching { pushManager.listMyDevices() }.getOrDefault(emptyList())
        refreshing = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                title = {
                    Text(if (bn) "বিজ্ঞপ্তি" else "Notifications")
                },
                actions = {
                    if (items.any { it.isUnread }) {
                        IconButton(
                            onClick = {
                                scope.launch {
                                    runCatching { repository.markInboxRead(null) }
                                        .onSuccess { refreshNonce++ }
                                        .onFailure { err -> errorMsg = err.message ?: (if (bn) "আপডেট ব্যর্থ" else "Failed to mark read.") }
                                }
                            },
                        ) {
                            Icon(
                                Icons.Rounded.DoneAll,
                                contentDescription = if (bn) "সব পঠিত" else "Mark all read",
                            )
                        }
                    }
                    if (items.any { !it.isUnread }) {
                        IconButton(
                            onClick = {
                                scope.launch {
                                    runCatching { repository.clearInbox() }
                                        .onSuccess { refreshNonce++ }
                                        .onFailure { err -> errorMsg = err.message ?: (if (bn) "মুছে ফেলা যায়নি" else "Failed to clear notifications.") }
                                }
                            },
                        ) {
                            Icon(
                                Icons.Rounded.DeleteSweep,
                                contentDescription = if (bn) "পঠিত মুছুন" else "Clear read",
                            )
                        }
                    }
                    if (!viewerUid.isNullOrBlank()) {
                        IconButton(onClick = { showPrefsSheet = true }) {
                            Icon(
                                Icons.Rounded.Tune,
                                contentDescription = if (bn) "বিজ্ঞপ্তি সেটিংস" else "Notification settings",
                            )
                        }
                    }
                },
            )
        },
    ) { inner ->
        if (viewerUid.isNullOrBlank()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(inner)
                    .padding(16.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                BsdcEmptyState(
                    icon = Icons.Rounded.NotificationsNone,
                    title = if (bn) "বিজ্ঞপ্তি দেখতে সাইন ইন করুন" else "Sign in to view notifications",
                    subtitle = if (bn) {
                        "মন্তব্য, উত্তর, মেনশন, মেসেঞ্জার এবং অর্ডার পুশ বিজ্ঞপ্তি এখানে দেখা যাবে।"
                    } else {
                        "Comments, replies, mentions, Messenger messages, and verification alerts appear here."
                    },
                    actionLabel = if (bn) "সাইন ইন" else "Sign In",
                    onAction = onSignInRequired,
                )
            }
            return@Scaffold
        }

        val filtered = remember(items, filter) {
            items.filter { NotificationsFilterEngine.matchesFilter(it.kind, it.isUnread, filter) }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(NotificationsFilterEngine.CategoryFilter.entries) { f ->
                    val label = when (f) {
                        NotificationsFilterEngine.CategoryFilter.ALL -> if (bn) "সব" else "All"
                        NotificationsFilterEngine.CategoryFilter.UNREAD -> if (bn) "অপঠিত" else "Unread"
                        NotificationsFilterEngine.CategoryFilter.SOCIAL -> if (bn) "সামাজিক" else "Community"
                        NotificationsFilterEngine.CategoryFilter.MESSAGES -> if (bn) "বার্তা" else "Messages"
                        NotificationsFilterEngine.CategoryFilter.ALERTS -> if (bn) "সতর্কতা" else "Alerts"
                    }
                    FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(label) })
                }
            }

            pushMsg?.let { msg ->
                BsdcStatusBanner(
                    title = if (bn) "পুশ ডিভাইস" else "Push registration",
                    body = msg,
                    tone = BsdcTone.INFO,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            errorMsg?.let { err ->
                BsdcStatusBanner(
                    title = if (bn) "লোড ব্যর্থ হয়েছে" else "Failed to load",
                    body = err,
                    tone = BsdcTone.BAD,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { refreshNonce++ },
                modifier = Modifier.weight(1f),
            ) {
                if (filtered.isEmpty() && !refreshing) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item {
                            PushReadinessCard(
                                bn = bn,
                                devicesCount = devices.count { it.state == "live" },
                                language = language,
                                onRegisterNow = {
                                    scope.launch {
                                        pushManager.registerCurrentDevice(viewerUid, language)
                                            .onSuccess {
                                                pushMsg = if (bn) "এই Android ডিভাইস FCM-এ নিবন্ধিত হয়েছে।" else "Registered this Android device for FCM push."
                                                refreshNonce++
                                            }
                                            .onFailure { e ->
                                                pushMsg = e.message
                                            }
                                    }
                                },
                                onOpenPrefs = { showPrefsSheet = true },
                            )
                        }
                        item {
                            BsdcEmptyState(
                                icon = Icons.Rounded.NotificationsNone,
                                title = if (bn) "সবকিছু দেখা হয়ে গেছে" else "You're all caught up",
                                subtitle = if (bn) "কোনো নতুন বিজ্ঞপ্তি নেই।" else "No notifications match this filter.",
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        item {
                            PushReadinessCard(
                                bn = bn,
                                devicesCount = devices.count { it.state == "live" },
                                language = language,
                                onRegisterNow = {
                                    scope.launch {
                                        pushManager.registerCurrentDevice(viewerUid, language)
                                            .onSuccess {
                                                pushMsg = if (bn) "এই Android ডিভাইস নিবন্ধিত হয়েছে।" else "Android push device updated."
                                                refreshNonce++
                                            }
                                            .onFailure { e -> pushMsg = e.message }
                                    }
                                },
                                onOpenPrefs = { showPrefsSheet = true },
                            )
                        }
                        items(filtered, key = { it.id }) { item ->
                            NotificationRowCard(
                                item = item,
                                imageLoader = imageLoader,
                                language = language,
                                onClick = {
                                    if (item.isUnread) {
                                        scope.launch {
                                            runCatching { repository.markInboxRead(listOf(item.id)) }
                                                .onSuccess { refreshNonce++ }
                                                .onFailure { err -> errorMsg = err.message }
                                        }
                                    }
                                    val dest = NotificationsFilterEngine.sanitizeTargetPath(
                                        item.kind,
                                        item.targetUrl,
                                        item.actor?.username,
                                    )
                                    onNavigatePath(dest)
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showPrefsSheet && !viewerUid.isNullOrBlank()) {
        ModalBottomSheet(onDismissRequest = { showPrefsSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = if (bn) "বিজ্ঞপ্তি ও ডিভাইস পছন্দ" else "Notification Preferences & Devices",
                    style = MaterialTheme.typography.titleLarge,
                )
                PrefToggleRow(
                    title = if (bn) "মেসেঞ্জার বার্তা" else "Messenger messages",
                    checked = prefs.messages,
                    onCheckedChange = { v ->
                        val prev = prefs
                        val next = prefs.copy(messages = v)
                        prefs = next
                        scope.launch {
                            runCatching { repository.updateNotificationPrefs(viewerUid, next) }
                                .onFailure { err ->
                                    prefs = prev
                                    pushMsg = err.message ?: (if (bn) "পছন্দ সংরক্ষণ ব্যর্থ" else "Could not save notification preferences.")
                                }
                        }
                    },
                )
                PrefToggleRow(
                    title = if (bn) "মন্তব্য ও উত্তর" else "Comments & replies",
                    checked = prefs.comments,
                    onCheckedChange = { v ->
                        val prev = prefs
                        val next = prefs.copy(comments = v)
                        prefs = next
                        scope.launch {
                            runCatching { repository.updateNotificationPrefs(viewerUid, next) }
                                .onFailure { err ->
                                    prefs = prev
                                    pushMsg = err.message ?: (if (bn) "পছন্দ সংরক্ষণ ব্যর্থ" else "Could not save notification preferences.")
                                }
                        }
                    },
                )
                PrefToggleRow(
                    title = if (bn) "মেনশন (@উল্লেখ)" else "Mentions (@handle)",
                    checked = prefs.mentions,
                    onCheckedChange = { v ->
                        val prev = prefs
                        val next = prefs.copy(mentions = v)
                        prefs = next
                        scope.launch {
                            runCatching { repository.updateNotificationPrefs(viewerUid, next) }
                                .onFailure { err ->
                                    prefs = prev
                                    pushMsg = err.message ?: (if (bn) "পছন্দ সংরক্ষণ ব্যর্থ" else "Could not save notification preferences.")
                                }
                        }
                    },
                )
                PrefToggleRow(
                    title = if (bn) "নতুন অনুসরণকারী" else "Followers",
                    checked = prefs.followers,
                    onCheckedChange = { v ->
                        val prev = prefs
                        val next = prefs.copy(followers = v)
                        prefs = next
                        scope.launch {
                            runCatching { repository.updateNotificationPrefs(viewerUid, next) }
                                .onFailure { err ->
                                    prefs = prev
                                    pushMsg = err.message ?: (if (bn) "পছন্দ সংরক্ষণ ব্যর্থ" else "Could not save notification preferences.")
                                }
                        }
                    },
                )
                PrefToggleRow(
                    title = if (bn) "সাপ্তাহিক ডাইজেস্ট" else "Community digest",
                    checked = prefs.digest,
                    onCheckedChange = { v ->
                        val prev = prefs
                        val next = prefs.copy(digest = v)
                        prefs = next
                        scope.launch {
                            runCatching { repository.updateNotificationPrefs(viewerUid, next) }
                                .onFailure { err ->
                                    prefs = prev
                                    pushMsg = err.message ?: (if (bn) "পছন্দ সংরক্ষণ ব্যর্থ" else "Could not save notification preferences.")
                                }
                        }
                    },
                )
                if (devices.isNotEmpty()) {
                    HorizontalDivider()
                    Text(
                        text = if (bn) "নিবন্ধিত পুশ ডিভাইস" else "Registered FCM devices",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    devices.forEach { dev ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(Icons.Rounded.PhoneAndroid, contentDescription = null)
                            Column(modifier = Modifier.weight(1f)) {
                                Text(dev.userAgent.ifBlank { dev.platform }, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${dev.platform} · ${dev.language}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = BsdcThemeTokens.colors.mutedText,
                                )
                            }
                            BsdcBadge(
                                label = dev.state,
                                tone = when (dev.state) {
                                    "live" -> BsdcTone.OK
                                    "invalid" -> BsdcTone.WARN
                                    else -> BsdcTone.BAD
                                },
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun PushReadinessCard(
    bn: Boolean,
    devicesCount: Int,
    language: AppLanguage,
    onRegisterNow: () -> Unit,
    onOpenPrefs: () -> Unit,
) {
    val countText = BanglaDigitFormatter.formatCount(devicesCount.toLong(), language)
    BsdcCard {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Rounded.NotificationsActive,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (bn) "FCM HTTP v1 পুশ সক্রিয় ($countText ডিভাইস)" else "FCM HTTP v1 Push ($countText live devices)",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = if (bn) "৫টি Android চ্যানেল ও লক-স্ক্রিন দ্রুত উত্তর সমর্থিত।" else "5 Android O+ channels & lock-screen inline replies ready.",
                    style = MaterialTheme.typography.bodySmall,
                    color = BsdcThemeTokens.colors.mutedText,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BsdcButton(
                label = if (bn) "ডিভাইস সিঙ্ক" else "Sync Device",
                onClick = onRegisterNow,
                secondary = true,
            )
            BsdcButton(
                label = if (bn) "ক্যাটাগরি পছন্দ" else "Preferences",
                onClick = onOpenPrefs,
                secondary = true,
            )
        }
    }
}

@Composable
private fun NotificationRowCard(
    item: NotificationInboxItem,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onClick: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    val actorName = item.actor?.displayName.orEmpty()
    val summaryText = NotificationsFilterEngine.describeNotificationAction(item.kind, actorName, bn)
    val extraCount = (item.occurrences - 1).coerceAtLeast(0)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (item.isUnread) BsdcThemeTokens.colors.surfaceElevated else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(
            1.dp,
            if (item.isUnread) MaterialTheme.colorScheme.primary.copy(alpha = 0.45f) else BsdcThemeTokens.colors.border,
        ),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val avatarUrl = item.actor?.avatarUrl.orEmpty()
            BsdcAvatar(
                avatarUrl = avatarUrl,
                displayName = actorName.ifBlank { "B" },
                imageLoader = imageLoader,
                size = 40.dp,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                val extraLabel = if (extraCount > 0) {
                    val c = BanglaDigitFormatter.formatCount(extraCount.toLong(), language)
                    if (bn) " (+ আরও ${c}টি)" else " (+$c more)"
                } else ""
                Text(
                    text = summaryText + extraLabel,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = if (item.isUnread) FontWeight.Bold else FontWeight.Normal,
                    ),
                )
                if (item.body.isNotBlank()) {
                    Text(
                        text = item.body,
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (item.isUnread) {
                Surface(
                    modifier = Modifier.size(8.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primary,
                ) {}
            }
        }
    }
}

@Composable
private fun PrefToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
