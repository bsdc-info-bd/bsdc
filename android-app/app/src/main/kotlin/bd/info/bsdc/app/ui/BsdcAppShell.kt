package bd.info.bsdc.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.R
import bd.info.bsdc.app.core.auth.AuthGateState
import bd.info.bsdc.app.core.common.AppLinkUriRouter
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.database.BsdcDatabaseMappers
import bd.info.bsdc.app.core.designsystem.BsdcBrandWordmark
import bd.info.bsdc.app.core.designsystem.BsdcMotionSpecs
import bd.info.bsdc.app.core.designsystem.BsdcPalette
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcHosts
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.LinkDestination
import bd.info.bsdc.app.core.model.NotificationPrefs
import bd.info.bsdc.app.core.model.PermissionGrantState
import bd.info.bsdc.app.core.model.ThemeMode
import bd.info.bsdc.app.core.permissions.PermissionPreferencesStore
import bd.info.bsdc.app.core.permissions.PermissionReadinessModalSheet
import bd.info.bsdc.app.core.permissions.PersistentPermissionReadinessBanner
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import bd.info.bsdc.app.core.push.PushEventBus
import bd.info.bsdc.app.core.push.PushRegistrationSyncWorker
import bd.info.bsdc.app.core.sync.OfflineSyncSettings
import bd.info.bsdc.app.core.sync.SyncScheduler
import bd.info.bsdc.app.di.BsdcAppContainer
import bd.info.bsdc.app.feature.compose.CreateHubMode
import bd.info.bsdc.app.feature.compose.CreateHubScreen
import bd.info.bsdc.app.feature.discover.DiscoverHubScreen
import bd.info.bsdc.app.feature.discover.DiscoverSection
import bd.info.bsdc.app.feature.discover.MemberProfileScreen
import bd.info.bsdc.app.feature.feed.FeedScreen
import bd.info.bsdc.app.feature.feed.PostDetailScreen
import bd.info.bsdc.app.feature.market.MarketHubScreen
import bd.info.bsdc.app.feature.messenger.LiveChannelStatus
import bd.info.bsdc.app.feature.messenger.MessengerRootScreen
import bd.info.bsdc.app.feature.messenger.SupabaseRealtimeTransport
import bd.info.bsdc.app.feature.news.NewsReaderScreen
import bd.info.bsdc.app.feature.news.SystemDiagnosticsAndSettingsScreen
import bd.info.bsdc.app.feature.notifications.NotificationsScreen
import bd.info.bsdc.app.feature.onboarding.BsdcAuthScreen
import bd.info.bsdc.app.feature.onboarding.OnboardingWizardScreen
import bd.info.bsdc.app.feature.onboarding.ProfileSyncRecoveryScreen
import bd.info.bsdc.app.feature.onboarding.VerifyEmailGateScreen
import bd.info.bsdc.app.feature.verify.VerifyHubScreen
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
    var showSettingsScreen by rememberSaveable { mutableStateOf(false) }
    var showMarketScreen by rememberSaveable { mutableStateOf(false) }
    var activeNewsUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var activeProfileTarget by rememberSaveable { mutableStateOf<String?>(null) }
    var discoverSection by rememberSaveable { mutableStateOf(DiscoverSection.SEARCH) }
    var unreadNotifications by remember { mutableIntStateOf(0) }
    var notificationsLiveNonce by remember { mutableIntStateOf(0) }
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
                        showSettingsScreen = false
                        activeProfileTarget = null
                        selectedTab = MainTab.HOME
                        activeDetailPost = null
                        activeDetailSlug = p.removePrefix("/p/").trim('/')
                    }
                    p.startsWith("/@") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        activeDetailSlug = null
                        activeProfileTarget = p.removePrefix("/").trim('/')
                    }
                    p.startsWith("/notifications") -> {
                        activeDetailSlug = null
                        activeProfileTarget = null
                        showSettingsScreen = false
                        showNotificationsScreen = true
                    }
                    p.startsWith("/verify") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.VERIFY
                    }
                    p.startsWith("/compose") || p.startsWith("/create") -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.CREATE
                    }
                    p.startsWith("/messages") -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.MESSAGES
                    }
                    p.startsWith("/shop") || p.startsWith("/cart") || p.startsWith("/orders") ||
                        p.startsWith("/vendor") || p.startsWith("/ads") || p.startsWith("/checkout") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        showMarketScreen = true
                    }
                    p != "/" -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        discoverSection = when {
                            p.startsWith("/groups") || p.startsWith("/g/") -> DiscoverSection.GROUPS
                            p.startsWith("/events") -> DiscoverSection.EVENTS
                            p.startsWith("/jobs") -> DiscoverSection.JOBS
                            p.startsWith("/gigs") || p.startsWith("/freelance") -> DiscoverSection.GIGS
                            p.startsWith("/projects") -> DiscoverSection.PROJECTS
                            p.startsWith("/courses") || p.startsWith("/learn") -> DiscoverSection.COURSES
                            else -> DiscoverSection.SEARCH
                        }
                        selectedTab = MainTab.EXPLORE
                    }
                    else -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.HOME
                    }
                }
            }
            is LinkDestination.NewsReader -> {
                guestBrowsing = true
                showNotificationsScreen = false
                showSettingsScreen = false
                showMarketScreen = false
                activeDetailSlug = null
                activeNewsUrl = incomingDestination.url
            }
            is LinkDestination.ExternalBrowser -> openInCustomTab(context, incomingDestination.url)
            else -> Unit
        }
    }

    // Clear explicit auth overlay automatically, register FCM token, and refresh unread badge
    val notifPermGranted = permissionCoordinator.states[DevicePermissionKind.NOTIFICATIONS] == PermissionGrantState.GRANTED
    LaunchedEffect(authState.gate, authState.session?.uid, language, notifPermGranted) {
        if (authState.gate == AuthGateState.READY) {
            showAuthModal = false
            val uid = authState.session?.uid
            if (!uid.isNullOrBlank()) {
                container.pushRegistrationManager.registerCurrentDevice(uid, language)
                if (notifPermGranted) {
                    PushRegistrationSyncWorker.enqueueImmediate(context)
                }
                unreadNotifications = container.notificationsRepository.fetchUnreadCount()
            }
        } else if (authState.gate == AuthGateState.SIGNED_OUT) {
            unreadNotifications = 0
        }
    }

    // Real-time Supabase WebSocket notification stream + live foreground FCM event bus
    val readyUid = authState.session?.uid?.takeIf { authState.gate == AuthGateState.READY && it.isNotBlank() }
    DisposableEffect(readyUid) {
        if (readyUid == null) {
            onDispose { }
        } else {
            val stop = container.messengerRealtimeTransport.joinNotificationStream(
                viewerUid = readyUid,
                listener = object : SupabaseRealtimeTransport.NotificationStreamListener {
                    override fun onNotificationChange() {
                        notificationsLiveNonce++
                        scope.launch {
                            unreadNotifications = container.notificationsRepository.fetchUnreadCount()
                        }
                    }

                    override fun onStatusChanged(status: LiveChannelStatus) = Unit
                },
            )
            onDispose { stop() }
        }
    }

    LaunchedEffect(readyUid) {
        if (readyUid == null) return@LaunchedEffect
        PushEventBus.events.collect {
            notificationsLiveNonce++
            unreadNotifications = container.notificationsRepository.fetchUnreadCount()
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (readyUid != null) {
            notificationsLiveNonce++
            scope.launch {
                unreadNotifications = container.notificationsRepository.fetchUnreadCount()
            }
            if (notifPermGranted) {
                PushRegistrationSyncWorker.enqueueImmediate(context)
            }
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
        authState.gate == AuthGateState.PROFILE_LOAD_FAILED -> {
            ProfileSyncRecoveryScreen(
                authState = authState,
                authRepository = container.authRepository,
                language = language,
                onContinueAsGuest = { guestBrowsing = true },
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
                onOpenProfile = { target ->
                    activeDetailSlug = null
                    activeDetailPost = null
                    activeProfileTarget = target
                },
                onOpenExternal = { url -> openInCustomTab(context, url) },
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
                liveRefreshNonce = notificationsLiveNonce,
            )
            return
        }
        activeProfileTarget != null -> {
            MemberProfileScreen(
                usernameOrUid = activeProfileTarget!!,
                viewerUid = authState.session?.uid,
                repository = container.discoverRepository,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { activeProfileTarget = null },
                onSignInRequired = { showAuthModal = true },
                onOpenMessages = {
                    activeProfileTarget = null
                    selectedTab = MainTab.MESSAGES
                },
                onOpenExternal = { url -> openInCustomTab(context, url) },
                mediaRepository = container.mediaRepository,
                onOpenPost = { post ->
                    activeProfileTarget = null
                    activeDetailPost = post
                    activeDetailSlug = post.slug.ifBlank { post.id }
                },
                onProfileUpdated = {
                    scope.launch { container.authRepository.refreshSessionAndProfile() }
                },
            )
            return
        }
        activeNewsUrl != null -> {
            NewsReaderScreen(
                initialUrl = activeNewsUrl!!,
                language = language,
                onBack = { activeNewsUrl = null },
                onRouteNativeUrl = { nativeUrl ->
                    activeNewsUrl = null
                    onRouteEvaluated(AppLinkUriRouter.resolveLink(nativeUrl))
                },
                onOpenExternal = { extUrl -> openInCustomTab(context, extUrl) },
            )
            return
        }
        showMarketScreen -> {
            MarketHubScreen(
                repository = container.marketRepository,
                imageLoader = container.imageLoader,
                viewerUid = authState.session?.uid,
                language = language,
                onBack = { showMarketScreen = false },
                onSignInRequired = { showAuthModal = true },
                onOpenExternal = { url -> openInCustomTab(context, url) },
            )
            return
        }
        showSettingsScreen -> {
            SystemDiagnosticsAndSettingsScreen(
                language = language,
                themeMode = themeMode,
                syncSettings = syncSettings,
                cachedPostCount = cachedPosts.size,
                incomingDestination = incomingDestination,
                versionName = BuildConfig.VERSION_NAME,
                versionCode = BuildConfig.VERSION_CODE,
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
                onOpenNotifications = {
                    showSettingsScreen = false
                    showNotificationsScreen = true
                },
                onOpenMarketplace = {
                    showSettingsScreen = false
                    showMarketScreen = true
                },
                onOpenNewsReader = {
                    showSettingsScreen = false
                    activeNewsUrl = BsdcHosts.NEWS_ORIGIN
                },
                onTestRoute = { url ->
                    showSettingsScreen = false
                    onRouteEvaluated(AppLinkUriRouter.resolveLink(url))
                },
                onOpenExternal = { url -> openInCustomTab(context, url) },
                onBack = { showSettingsScreen = false },
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
                    IconButton(onClick = { showSettingsScreen = true }) {
                        Icon(
                            imageVector = Icons.Rounded.Settings,
                            contentDescription = if (language == AppLanguage.BN) "সেটিংস" else "Settings",
                        )
                    }
                    if (authState.gate == AuthGateState.READY) {
                        IconButton(
                            onClick = {
                                val target = authState.profile?.username?.takeIf { it.isNotBlank() }
                                    ?: authState.session?.uid
                                if (!target.isNullOrBlank()) {
                                    activeProfileTarget = target
                                }
                            },
                        ) {
                            val topAvatarUrl = authState.profile?.avatarUrl?.takeIf { it.isNotBlank() }
                                ?: authState.session?.photoUrl.orEmpty()
                            val topDisplayName = authState.profile?.displayName?.takeIf { it.isNotBlank() }
                                ?: authState.session?.displayName
                                ?: "U"
                            BsdcAvatar(
                                avatarUrl = topAvatarUrl,
                                displayName = topDisplayName,
                                imageLoader = container.imageLoader,
                                size = 30.dp,
                            )
                        }
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

                val reducedMotion = BsdcThemeTokens.reducedMotion
                AnimatedContent(
                    targetState = selectedTab,
                    transitionSpec = { BsdcMotionSpecs.tabTransition(reducedMotion) },
                    label = "mainTabTransition",
                ) { tab ->
                when (tab) {
                    MainTab.HOME -> FeedScreen(
                        repository = container.feedRepository,
                        imageLoader = container.imageLoader,
                        viewerUid = authState.session?.uid,
                        language = language,
                        onOpenPost = { post ->
                            activeDetailPost = post
                            activeDetailSlug = post.slug.ifBlank { post.id }
                        },
                        onOpenProfile = { target ->
                            activeProfileTarget = target
                        },
                        onOpenExternal = { url -> openInCustomTab(context, url) },
                    )
                    MainTab.VERIFY -> {
                        val verifyRoute = (incomingDestination as? LinkDestination.NativeRoute)
                            ?.path
                            ?.takeIf { it.startsWith("/verify") }
                        VerifyHubScreen(
                            repository = container.verifyRepository,
                            viewerUid = authState.session?.uid,
                            language = language,
                            initialRoutePath = verifyRoute,
                            onSignInRequired = { showAuthModal = true },
                        )
                    }
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
                    MainTab.EXPLORE -> DiscoverHubScreen(
                        repository = container.discoverRepository,
                        imageLoader = container.imageLoader,
                        viewerUid = authState.session?.uid,
                        language = language,
                        initialSection = discoverSection,
                        onSignInRequired = { showAuthModal = true },
                        onOpenPost = { slugOrId ->
                            activeDetailPost = null
                            activeDetailSlug = slugOrId
                        },
                        onOpenProfile = { target ->
                            activeProfileTarget = target
                        },
                        onOpenVerifyCode = { code ->
                            onRouteEvaluated(LinkDestination.NativeRoute("/verify?code=$code"))
                        },
                        onOpenExternal = { url -> openInCustomTab(context, url) },
                        onOpenMarketplace = { showMarketScreen = true },
                        onOpenNewsReader = { activeNewsUrl = BsdcHosts.NEWS_ORIGIN },
                    )
                }
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
