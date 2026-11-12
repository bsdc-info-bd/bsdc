package bd.info.bsdc.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.R
import bd.info.bsdc.app.core.auth.AuthGateState
import bd.info.bsdc.app.core.auth.AuthStateSnapshot
import bd.info.bsdc.app.core.common.AppLinkUriRouter
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.common.DocCodeChecksum
import bd.info.bsdc.app.core.database.BsdcDatabaseMappers
import bd.info.bsdc.app.core.designsystem.BsdcBrandWordmark
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcPalette
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.LinkDestination
import bd.info.bsdc.app.core.model.NotificationPrefs
import bd.info.bsdc.app.core.model.ParsedDocCode
import bd.info.bsdc.app.core.model.SyncNetworkPolicy
import bd.info.bsdc.app.core.model.ThemeMode
import bd.info.bsdc.app.core.permissions.PermissionPreferencesStore
import bd.info.bsdc.app.core.permissions.PermissionReadinessModalSheet
import bd.info.bsdc.app.core.permissions.PersistentPermissionReadinessBanner
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import bd.info.bsdc.app.core.sync.OfflineSyncSettings
import bd.info.bsdc.app.core.sync.SyncScheduler
import bd.info.bsdc.app.di.BsdcAppContainer
import bd.info.bsdc.app.feature.compose.CreateHubMode
import bd.info.bsdc.app.feature.compose.CreateHubScreen
import bd.info.bsdc.app.feature.feed.FeedScreen
import bd.info.bsdc.app.feature.feed.PostDetailScreen
import bd.info.bsdc.app.feature.messenger.MessengerRootScreen
import bd.info.bsdc.app.feature.notifications.NotificationsScreen
import bd.info.bsdc.app.feature.onboarding.BsdcAuthScreen
import bd.info.bsdc.app.feature.onboarding.OnboardingWizardScreen
import bd.info.bsdc.app.feature.onboarding.VerifyEmailGateScreen
import kotlinx.coroutines.launch

private enum class MainTab(
    val titleRes: Int,
    val icon: ImageVector,
) {
    HOME(R.string.tab_home, Icons.Rounded.Home),
    VERIFY(R.string.tab_verify, Icons.Rounded.VerifiedUser),
    CREATE(R.string.tab_create, Icons.Rounded.AddCircleOutline),
    MESSAGES(R.string.tab_messenger, Icons.Rounded.ChatBubbleOutline),
    EXPLORE(R.string.tab_explore, Icons.Rounded.Explore),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BsdcAppShell(
    container: BsdcAppContainer,
    incomingDestination: LinkDestination,
    language: AppLanguage,
    themeMode: ThemeMode,
    onChangeLanguage: (AppLanguage) -> Unit,
    onChangeTheme: (ThemeMode) -> Unit,
    onRouteEvaluated: (LinkDestination) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val useRail = LocalConfiguration.current.screenWidthDp >= 600

    val authState by container.authRepository.state.collectAsStateWithLifecycle()
    val syncSettings by container.syncPrefsStore.settingsFlow().collectAsState(initial = OfflineSyncSettings())
    val cachedEntities by container.database.postDao().observeFeed("latest").collectAsState(initial = emptyList())
    val cachedPosts = remember(cachedEntities) { cachedEntities.map { BsdcDatabaseMappers.toDomain(it) } }
    val permissionCoordinator = rememberPermissionCoordinator()
    val permissionStore = remember(context) { PermissionPreferencesStore(context.applicationContext) }
    val onboardingSeen by permissionStore.onboardingSeenFlow().collectAsState(initial = true)

    var selectedTab by rememberSaveable { mutableStateOf(MainTab.HOME) }
    var guestBrowsing by rememberSaveable { mutableStateOf(false) }
    var showAuthModal by rememberSaveable { mutableStateOf(false) }
    var showPermissionSheet by rememberSaveable { mutableStateOf(false) }
    var showNotificationsScreen by rememberSaveable { mutableStateOf(false) }
    var unreadNotifications by remember { mutableStateOf(0) }
    var activeDetailSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var activeDetailPost by remember { mutableStateOf<FeedPost?>(null) }

    LaunchedEffect(onboardingSeen, permissionCoordinator.allGranted, authState.gate) {
        if (!onboardingSeen && !permissionCoordinator.allGranted && authState.gate != AuthGateState.INITIALIZING) {
            showPermissionSheet = true
            permissionStore.markOnboardingSeen()
        }
    }

    LaunchedEffect(incomingDestination) {
        when (incomingDestination) {
            is LinkDestination.NativeRoute -> {
                val p = incomingDestination.path
                when {
                    p.startsWith("/p/") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        selectedTab = MainTab.HOME
                        activeDetailPost = null
                        activeDetailSlug = p.removePrefix("/p/").trim('/')
                    }
                    p.startsWith("/notifications") -> {
                        activeDetailSlug = null
                        showNotificationsScreen = true
                    }
                    p.startsWith("/verify") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        activeDetailSlug = null
                        selectedTab = MainTab.VERIFY
                    }
                    p.startsWith("/compose") || p.startsWith("/create") -> {
                        showNotificationsScreen = false
                        activeDetailSlug = null
                        selectedTab = MainTab.CREATE
                    }
                    p.startsWith("/messages") -> {
                        showNotificationsScreen = false
                        activeDetailSlug = null
                        selectedTab = MainTab.MESSAGES
                    }
                    p != "/" -> {
                        showNotificationsScreen = false
                        activeDetailSlug = null
                        selectedTab = MainTab.EXPLORE
                    }
                    else -> {
                        showNotificationsScreen = false
                        activeDetailSlug = null
                        selectedTab = MainTab.HOME
                    }
                }
            }
            is LinkDestination.NewsReader -> {
                guestBrowsing = true
                showNotificationsScreen = false
                activeDetailSlug = null
                selectedTab = MainTab.EXPLORE
            }
            is LinkDestination.ExternalBrowser -> openInCustomTab(context, incomingDestination.url)
            else -> Unit
        }
    }

    // Clear explicit auth overlay automatically, register FCM token, and refresh unread badge
    LaunchedEffect(authState.gate, authState.session?.uid, language) {
        if (authState.gate == AuthGateState.READY) {
            showAuthModal = false
            val uid = authState.session?.uid
            if (!uid.isNullOrBlank()) {
                container.pushRegistrationManager.registerCurrentDevice(uid, language)
                unreadNotifications = container.notificationsRepository.fetchUnreadCount()
            }
        } else if (authState.gate == AuthGateState.SIGNED_OUT) {
            unreadNotifications = 0
        }
    }

    when {
        authState.gate == AuthGateState.INITIALIZING -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return
        }
        authState.gate == AuthGateState.NEEDS_EMAIL_VERIFICATION -> {
            VerifyEmailGateScreen(
                email = authState.session?.email.orEmpty(),
                authState = authState,
                authRepository = container.authRepository,
                language = language,
            )
            return
        }
        authState.gate == AuthGateState.NEEDS_ONBOARDING -> {
            OnboardingWizardScreen(
                authState = authState,
                authRepository = container.authRepository,
                platformApi = container.platformApi,
                permissionCoordinator = permissionCoordinator,
                language = language,
                onLanguageSelected = onChangeLanguage,
            )
            return
        }
        (authState.gate == AuthGateState.SIGNED_OUT && !guestBrowsing) || showAuthModal -> {
            BsdcAuthScreen(
                authState = authState,
                authRepository = container.authRepository,
                language = language,
                onContinueAsGuest = {
                    showAuthModal = false
                    guestBrowsing = true
                },
            )
            return
        }
        activeDetailSlug != null -> {
            PostDetailScreen(
                postSlugOrId = activeDetailSlug!!,
                initialPost = activeDetailPost,
                repository = container.feedRepository,
                imageLoader = container.imageLoader,
                viewerUid = authState.session?.uid,
                language = language,
                onBack = {
                    activeDetailSlug = null
                    activeDetailPost = null
                },
            )
            return
        }
        showNotificationsScreen -> {
            NotificationsScreen(
                viewerUid = authState.session?.uid,
                initialPrefs = authState.profile?.notifications ?: NotificationPrefs(),
                repository = container.notificationsRepository,
                pushManager = container.pushRegistrationManager,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { showNotificationsScreen = false },
                onSignInRequired = { showAuthModal = true },
                onNavigatePath = { destPath ->
                    showNotificationsScreen = false
                    onRouteEvaluated(LinkDestination.NativeRoute(destPath))
                },
            )
            return
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    BsdcBrandWordmark(
                        subtitle = if (language == AppLanguage.BN) {
                            "বাংলাদেশ ডেভেলপার কমিউনিটি"
                        } else {
                            "BANGLADESH DEVELOPER COMMUNITY"
                        },
                    )
                },
                actions = {
                    IconButton(onClick = { showNotificationsScreen = true }) {
                        BadgedBox(
                            badge = {
                                if (unreadNotifications > 0) {
                                    Badge {
                                        Text(
                                            BanglaDigitFormatter.formatCount(
                                                unreadNotifications.coerceAtMost(99).toLong(),
                                                language,
                                            ),
                                        )
                                    }
                                }
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Notifications,
                                contentDescription = if (language == AppLanguage.BN) "বিজ্ঞপ্তি" else "Notifications",
                            )
                        }
                    }
                    IconButton(onClick = { showPermissionSheet = true }) {
                        Icon(
                            imageVector = Icons.Rounded.Security,
                            contentDescription = "Permissions",
                            tint = if (permissionCoordinator.allGranted) {
                                BsdcThemeTokens.colors.brandStrong
                            } else {
                                BsdcThemeTokens.colors.warn
                            },
                        )
                    }
                    IconButton(
                        onClick = {
                            val next = if (language == AppLanguage.BN) AppLanguage.EN else AppLanguage.BN
                            onChangeLanguage(next)
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Language,
                            contentDescription = language.nativeLabel,
                        )
                    }
                    if (authState.gate == AuthGateState.READY) {
                        IconButton(
                            onClick = {
                                scope.launch {
                                    container.pushRegistrationManager.unregisterOnSignOut(authState.session?.uid)
                                    container.authRepository.atomicSignOut {
                                        container.database.wipeUserScopedTables()
                                    }
                                }
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Logout,
                                contentDescription = if (language == AppLanguage.BN) "সাইন আউট" else "Sign out",
                            )
                        }
                    } else {
                        IconButton(onClick = { showAuthModal = true }) {
                            Icon(
                                imageVector = Icons.Rounded.AccountCircle,
                                contentDescription = if (language == AppLanguage.BN) "সাইন ইন" else "Sign in",
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        bottomBar = {
            if (!useRail) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    MainTab.entries.forEach { tab ->
                        val label = stringResource(tab.titleRes)
                        NavigationBarItem(
                            selected = selectedTab == tab,
                            onClick = { selectedTab = tab },
                            icon = { Icon(tab.icon, contentDescription = label) },
                            label = { Text(label, maxLines = 1) },
                        )
                    }
                }
            }
        },
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
    ) { innerPadding ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            if (useRail) {
                NavigationRail(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    MainTab.entries.forEach { tab ->
                        val label = stringResource(tab.titleRes)
                        NavigationRailItem(
                            selected = selectedTab == tab,
                            onClick = { selectedTab = tab },
                            icon = { Icon(tab.icon, contentDescription = label) },
                            label = { Text(label, maxLines = 1) },
                        )
                    }
                }
            }

            Column(modifier = Modifier.fillMaxSize()) {
                PersistentPermissionReadinessBanner(
                    coordinator = permissionCoordinator,
                    language = language,
                    onOpenSheet = { showPermissionSheet = true },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )

                when (selectedTab) {
                    MainTab.HOME -> FeedScreen(
                        repository = container.feedRepository,
                        imageLoader = container.imageLoader,
                        viewerUid = authState.session?.uid,
                        language = language,
                        onOpenPost = { post ->
                            activeDetailPost = post
                            activeDetailSlug = post.slug.ifBlank { post.id }
                        },
                    )
                    MainTab.VERIFY -> VerifyChecksumSandboxTab(language = language)
                    MainTab.CREATE -> CreateHubScreen(
                        viewerUid = authState.session?.uid,
                        composeRepository = container.composeRepository,
                        mediaRepository = container.mediaRepository,
                        imageLoader = container.imageLoader,
                        language = language,
                        initialMode = if (incomingDestination is LinkDestination.NativeRoute &&
                            incomingDestination.path.startsWith("/create")
                        ) {
                            CreateHubMode.EVENT
                        } else {
                            CreateHubMode.POST
                        },
                        onSignInRequired = { showAuthModal = true },
                        onPostPublished = { res ->
                            activeDetailPost = null
                            activeDetailSlug = res.slug.ifBlank { res.id }
                            selectedTab = MainTab.HOME
                        },
                        onDirectoryCreated = { _, _ ->
                            selectedTab = MainTab.HOME
                        },
                    )
                    MainTab.MESSAGES -> {
                        val deepConversationId = (incomingDestination as? LinkDestination.NativeRoute)
                            ?.path
                            ?.takeIf { it.startsWith("/messages/") }
                            ?.removePrefix("/messages/")
                            ?.trim('/')
                            ?.takeIf { it.isNotBlank() }
                        MessengerRootScreen(
                            viewerUid = authState.session?.uid,
                            repository = container.messengerRepository,
                            realtimeTransport = container.messengerRealtimeTransport,
                            mediaRepository = container.mediaRepository,
                            imageLoader = container.imageLoader,
                            language = language,
                            initialConversationId = deepConversationId,
                            onSignInRequired = { showAuthModal = true },
                        )
                    }
                    MainTab.EXPLORE -> ExploreRouterAndSettingsTab(
                        language = language,
                        themeMode = themeMode,
                        syncSettings = syncSettings,
                        cachedPostCount = cachedPosts.size,
                        incomingDestination = incomingDestination,
                        onChangeTheme = onChangeTheme,
                        onChangeLanguage = onChangeLanguage,
                        onChangeSyncPolicy = { policy ->
                            scope.launch {
                                container.syncPrefsStore.setNetworkPolicy(policy)
                                SyncScheduler.applyPeriodicPolicy(context, policy)
                            }
                        },
                        onTriggerSync = { SyncScheduler.triggerImmediateSync(context, forceManual = true) },
                        onOpenPermissionSheet = { showPermissionSheet = true },
                        onTestRoute = { url -> onRouteEvaluated(AppLinkUriRouter.resolveLink(url)) },
                        onOpenExternal = { url -> openInCustomTab(context, url) },
                    )
                }
            }
        }
    }

    if (showPermissionSheet) {
        PermissionReadinessModalSheet(
            coordinator = permissionCoordinator,
            language = language,
            onDismiss = { showPermissionSheet = false },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VerifyChecksumSandboxTab(language: AppLanguage) {
    val bn = language == AppLanguage.BN
    val sampleValid = remember {
        val body = "4A7C21B9"
        "BSDC-CT-$body-${DocCodeChecksum.cardCheckDigit(body)}"
    }
    var codeInput by remember { mutableStateOf(sampleValid) }
    val parsed = remember(codeInput) { DocCodeChecksum.parseDocCode(codeInput) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            BsdcCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Rounded.QrCodeScanner, contentDescription = null)
                    Text(
                        text = if (bn) "BSDC ডকুমেন্ট যাচাই (অফলাইন চেকসাম)" else "BSDC Verification (Local Checksum Engine)",
                        style = MaterialTheme.typography.titleLarge,
                    )
                }
                Text(
                    text = if (bn) {
                        "vf.bsdc.info.bd-এর একই Java 21 চেক-ডিজিট যুক্তি এবং O→4 / I→8 অটো-মেরামত। ক্যামেরা QR স্ক্যানার ধাপ ৮-এ যুক্ত হবে।"
                    } else {
                        "Exact Java 21 parity with vf.bsdc.info.bd check-digit math & O→4 / I→8 repair. Live CameraX QR scanning arrives in Phase 8."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = BsdcThemeTokens.colors.mutedText,
                )
                OutlinedTextField(
                    value = codeInput,
                    onValueChange = { codeInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text(if (bn) "ডকুমেন্ট কোড লিখুন" else "Document Code") },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = false,
                        onClick = { codeInput = sampleValid },
                        label = { Text("Valid CT") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = {
                            val b = "48AB12CD"
                            codeInput = "bsdc–id–OIAB12CD—${DocCodeChecksum.cardCheckDigit(b)}"
                        },
                        label = { Text("O/I Typo Test") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = { codeInput = "BSDC-CT-4A7C21B9-9" },
                        label = { Text("Bad Check Digit") },
                    )
                }
            }
        }

        item {
            when (parsed) {
                is ParsedDocCode.Valid -> {
                    BsdcStatusBanner(
                        title = if (bn) "কোড ফরম্যাট সঠিক (${parsed.kind.code})" else "Check Digit Valid (${parsed.kind.code})",
                        body = "Formatted: ${DocCodeChecksum.formatDocCode(parsed.code)}\nShare URL: ${DocCodeChecksum.verificationUrl(BuildConfig.VF_ORIGIN, parsed.code)}",
                        tone = BsdcTone.OK,
                    )
                }
                is ParsedDocCode.Invalid -> {
                    BsdcStatusBanner(
                        title = if (bn) "অবৈধ বা ভুল কোড" else "Local Checksum Rejection",
                        body = parsed.reason,
                        tone = BsdcTone.BAD,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExploreRouterAndSettingsTab(
    language: AppLanguage,
    themeMode: ThemeMode,
    syncSettings: OfflineSyncSettings,
    cachedPostCount: Int,
    incomingDestination: LinkDestination,
    onChangeTheme: (ThemeMode) -> Unit,
    onChangeLanguage: (AppLanguage) -> Unit,
    onChangeSyncPolicy: (SyncNetworkPolicy) -> Unit,
    onTriggerSync: () -> Unit,
    onOpenPermissionSheet: () -> Unit,
    onTestRoute: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
) {
    val bn = language == AppLanguage.BN
    var testUrl by remember { mutableStateOf("https://news.bsdc.info.bd/") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            BsdcCard {
                Text(
                    text = if (bn) "অফলাইন অটো-সিঙ্ক ও মিডিয়া ক্যাশ" else "Smart Offline Auto-Sync & ImgBB Cache",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = if (bn) {
                        "সংরক্ষিত পোস্ট: ${BanglaDigitFormatter.formatCount(cachedPostCount.toLong(), language)} টি · সর্বোচ্চ ImgBB ক্যাশ: ${syncSettings.maxCacheMb} MB"
                    } else {
                        "Cached offline posts: $cachedPostCount · ImgBB disk cap: ${syncSettings.maxCacheMb} MB"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = BsdcThemeTokens.colors.mutedText,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SyncNetworkPolicy.entries.forEach { policy ->
                        FilterChip(
                            selected = syncSettings.policy == policy,
                            onClick = { onChangeSyncPolicy(policy) },
                            label = {
                                Text(
                                    when (policy) {
                                        SyncNetworkPolicy.WIFI_ONLY -> if (bn) "শুধু Wi-Fi" else "Wi-Fi Only"
                                        SyncNetworkPolicy.WIFI_AND_CELLULAR -> if (bn) "Wi-Fi + ডেটা" else "Wi-Fi + Cellular"
                                        SyncNetworkPolicy.OFF -> if (bn) "বন্ধ" else "Off"
                                    },
                                )
                            },
                        )
                    }
                }
                BsdcButton(
                    label = if (bn) "এখনই অফলাইন ফিড সিঙ্ক করুন" else "Sync Offline Feed Now",
                    secondary = true,
                    onClick = onTriggerSync,
                )
            }
        }
        item {
            BsdcCard {
                Text(
                    text = if (bn) "থিম, ভাষা ও অনুমতি সেটিংস" else "Theme, Language & Permissions",
                    style = MaterialTheme.typography.titleLarge,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ThemeMode.entries.forEach { mode ->
                        FilterChip(
                            selected = themeMode == mode,
                            onClick = { onChangeTheme(mode) },
                            label = { Text(mode.name) },
                        )
                    }
                    AppLanguage.entries.forEach { lang ->
                        FilterChip(
                            selected = language == lang,
                            onClick = { onChangeLanguage(lang) },
                            label = { Text(lang.nativeLabel) },
                        )
                    }
                }
                TextButton(onClick = onOpenPermissionSheet) {
                    Text(if (bn) "ডিভাইস অনুমতি অবস্থা দেখুন" else "Manage Device Permissions")
                }
            }
        }

        item {
            BsdcCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Rounded.Newspaper, contentDescription = null)
                    Text(
                        text = if (bn) "অ্যাপ লিংক ও নিউজ ওয়েবভিউ রাউটার পরীক্ষা" else "App Link & News WebView Router Test",
                        style = MaterialTheme.typography.titleLarge,
                    )
                }
                OutlinedTextField(
                    value = testUrl,
                    onValueChange = { testUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("URL") },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = false,
                        onClick = { testUrl = "https://www.bsdc.info.bd/p/compose-guide" },
                        label = { Text("www.bsdc") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = { testUrl = "https://vf.bsdc.info.bd/?code=BSDC-CT-4A7C21B9-6" },
                        label = { Text("vf.bsdc") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = { testUrl = "https://news.bsdc.info.bd/latest" },
                        label = { Text("news.bsdc") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = { testUrl = "https://www.bsdc.info.bd/admin/users" },
                        label = { Text("/admin (blocked)") },
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BsdcButton(
                        label = if (bn) "রাউট পরীক্ষা করুন" else "Evaluate Route",
                        onClick = { onTestRoute(testUrl) },
                    )
                    BsdcButton(
                        label = if (bn) "ব্রাউজার খুলুন" else "Open Safe Tab",
                        onClick = { onOpenExternal(BuildConfig.NEWS_ORIGIN) },
                        secondary = true,
                    )
                }
                val tone = when (incomingDestination) {
                    is LinkDestination.NativeRoute -> BsdcTone.OK
                    is LinkDestination.NewsReader -> BsdcTone.INFO
                    is LinkDestination.AdminWebOnly, is LinkDestination.Ignored -> BsdcTone.BAD
                    is LinkDestination.ExternalBrowser -> BsdcTone.WARN
                }
                BsdcStatusBanner(
                    title = incomingDestination::class.simpleName ?: "Route",
                    body = incomingDestination.toString(),
                    tone = tone,
                )
            }
        }
    }
}

private fun openInCustomTab(context: Context, url: String) {
    val parsed = runCatching { Uri.parse(url) }.getOrNull() ?: return
    if (parsed.scheme != "https") return
    val params = CustomTabColorSchemeParams.Builder()
        .setToolbarColor(BsdcPalette.LightGreen800.toArgb())
        .build()
    runCatching {
        CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(params)
            .setShowTitle(true)
            .build()
            .launchUrl(context, parsed)
    }.onFailure {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, parsed))
        }
    }
}
