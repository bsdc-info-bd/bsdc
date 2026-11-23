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
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
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
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.LinkDestination
import bd.info.bsdc.app.core.model.NotificationPrefs
import bd.info.bsdc.app.core.model.ThemeMode
import bd.info.bsdc.app.core.permissions.PermissionPreferencesStore
import bd.info.bsdc.app.core.permissions.PermissionReadinessModalSheet
import bd.info.bsdc.app.core.permissions.PersistentPermissionReadinessBanner
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import bd.info.bsdc.app.core.push.OrderAlarmService
import bd.info.bsdc.app.core.push.PushEventBus
import bd.info.bsdc.app.core.push.PushNotificationRouter
import bd.info.bsdc.app.core.push.PushRegistrationSyncWorker
import bd.info.bsdc.app.core.sync.OfflineSyncSettings
import bd.info.bsdc.app.core.sync.SyncScheduler
import bd.info.bsdc.app.di.BsdcAppContainer
import bd.info.bsdc.app.feature.compose.CreateHubMode
import bd.info.bsdc.app.feature.compose.CreateHubScreen
import bd.info.bsdc.app.feature.discover.DiscoverHubScreen
import bd.info.bsdc.app.feature.discover.GigDetailScreen
import bd.info.bsdc.app.feature.discover.DiscoverSection
import bd.info.bsdc.app.feature.discover.EventDetailScreen
import bd.info.bsdc.app.feature.discover.GroupDetailScreen
import bd.info.bsdc.app.feature.discover.JobDetailScreen
import bd.info.bsdc.app.feature.discover.MemberProfileScreen
import bd.info.bsdc.app.feature.discover.ProjectDetailScreen
import bd.info.bsdc.app.feature.feed.ChannelFeedScreen
import bd.info.bsdc.app.feature.feed.FeedScreen
import bd.info.bsdc.app.feature.feed.PostDetailScreen
import bd.info.bsdc.app.feature.market.AdsDashboardScreen
import bd.info.bsdc.app.feature.market.MarketSection
import bd.info.bsdc.app.feature.market.MkMarketScreen
import bd.info.bsdc.app.feature.market.MkSavedStore
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
    destinationNonce: Long = 0L,
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
    var showMarketAds by rememberSaveable { mutableStateOf(false) }
    var activeNewsUrl by rememberSaveable { mutableStateOf<String?>(null) }
    var activeProfileTarget by rememberSaveable { mutableStateOf<String?>(null) }
    var activeProjectSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var activeGigSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var activeJobSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var activeEventSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var activeGroupSlug by rememberSaveable { mutableStateOf<String?>(null) }
    /**
     * The channel a member chose to write in, carried from the group page to the composer.
     *
     * Deliberately not `rememberSaveable`: the composer's own draft persists in Room, and a restored
     * process landing the member straight into a half-written group post is a surprise, not a
     * recovery. The target lives only as long as the trip it describes.
     */
    var createChannelTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
    var discoverSection by rememberSaveable { mutableStateOf(DiscoverSection.SEARCH) }
    var marketSection by rememberSaveable { mutableStateOf(MarketSection.SHOP) }
    var pendingMessengerTarget by rememberSaveable { mutableStateOf<String?>(null) }
    var unreadNotifications by remember { mutableIntStateOf(0) }
    var notificationsLiveNonce by remember { mutableIntStateOf(0) }
    var localRouteNonce by remember { mutableIntStateOf(0) }
    var activeDetailSlug by rememberSaveable { mutableStateOf<String?>(null) }
    var activeDetailPost by remember { mutableStateOf<FeedPost?>(null) }
    /**
     * The room whose timeline is open: group slug to channel slug, which is the website's address for a
     * channel and the only pair that identifies one, because a channel slug is unique inside a group and
     * not across them.
     */
    var activeChannelFeed by remember { mutableStateOf<Pair<String, String>?>(null) }

    LaunchedEffect(onboardingSeen, permissionCoordinator.allGranted, authState.gate) {
        if (!onboardingSeen && !permissionCoordinator.allGranted && authState.gate != AuthGateState.INITIALIZING) {
            showPermissionSheet = true
            permissionStore.markOnboardingSeen()
        }
    }

    LaunchedEffect(incomingDestination, destinationNonce, localRouteNonce) {
        when (incomingDestination) {
            is LinkDestination.NativeRoute -> {
                val p = incomingDestination.path
                when {
                    p.startsWith("/p/") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        selectedTab = MainTab.HOME
                        activeDetailPost = null
                        activeDetailSlug = p.removePrefix("/p/").trim('/')
                    }
                    p.startsWith("/@") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeDetailSlug = null
                        activeProfileTarget = p.removePrefix("/").trim('/')
                    }
                    p.startsWith("/notifications") || p.startsWith("/moderation") -> {
                        activeDetailSlug = null
                        activeProfileTarget = null
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        showNotificationsScreen = true
                    }
                    p.startsWith("/verify") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.VERIFY
                    }
                    p.startsWith("/compose") || p.startsWith("/create") -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.CREATE
                    }
                    p.startsWith("/messages") -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        selectedTab = MainTab.MESSAGES
                    }
                    p.startsWith("/marketplace") || p.startsWith("/shop") || p.startsWith("/cart") ||
                        p.startsWith("/orders") || p.startsWith("/vendor") || p.startsWith("/ads") ||
                        p.startsWith("/checkout") -> {
                        guestBrowsing = true
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        marketSection = when {
                            p.startsWith("/cart") || p.startsWith("/marketplace/cart") ||
                                p.startsWith("/marketplace/checkout") || p.startsWith("/checkout") -> MarketSection.CART
                            p.startsWith("/orders") || p.startsWith("/marketplace/orders") -> MarketSection.ORDERS
                            p.startsWith("/vendor") || p.startsWith("/marketplace/apply") -> MarketSection.VENDOR
                            p.startsWith("/ads") -> MarketSection.ADS
                            else -> MarketSection.SHOP
                        }
                        showMarketScreen = true
                    }
                    p != "/" -> {
                        showNotificationsScreen = false
                        showSettingsScreen = false
                        showMarketScreen = false
                        activeNewsUrl = null
                        activeProfileTarget = null
                        activeDetailSlug = null
                        // A collection address opens the collection; an address with a slug
                        // underneath it opens that one listing, so a shared gig, job, project,
                        // event or group link lands on the page the sender was reading.
                        val groupsSlug = slashSlug(p, "/g/", "/groups/")
                        val eventsSlug = slashSlug(p, "/events/")
                        val jobsSlug = slashSlug(p, "/jobs/")
                        val gigSlug = slashSlug(p, "/gigs/", "/freelance/", "/gig/")
                        val projectsSlug = slashSlug(p, "/projects/")?.takeUnless { it == "new" }
                        activeGroupSlug = groupsSlug
                        // `/g/bsdcland/c/ship-it` opens the room on top of the group, so a link pasted
                        // into chat lands the member where the browser would have.
                        activeChannelFeed = channelTargetOf(p, listOf("/g/", "/groups/"))
                        activeEventSlug = eventsSlug
                        activeJobSlug = jobsSlug
                        activeGigSlug = gigSlug
                        activeProjectSlug = projectsSlug
                        discoverSection = when {
                            groupsSlug != null || p.startsWith("/groups") || p.startsWith("/g/") -> DiscoverSection.GROUPS
                            eventsSlug != null || p.startsWith("/events") -> DiscoverSection.EVENTS
                            jobsSlug != null || p.startsWith("/jobs") -> DiscoverSection.JOBS
                            gigSlug != null || p.startsWith("/gigs") || p.startsWith("/freelance") -> DiscoverSection.GIGS
                            projectsSlug != null || p.startsWith("/projects") -> DiscoverSection.PROJECTS
                            p.startsWith("/courses") || p.startsWith("/learn") -> DiscoverSection.COURSES
                            p.startsWith("/people") -> DiscoverSection.PEOPLE
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
                activeProfileTarget = null
                activeDetailSlug = null
                activeNewsUrl = incomingDestination.url
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
                PushRegistrationSyncWorker.enqueueImmediate(context)
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

                    override fun onNotificationInserted(
                        record: SupabaseRealtimeTransport.LiveNotificationRecord,
                    ) {
                        if (!record.read && PushNotificationRouter.isOrderAlarm(null, record.url)) {
                            OrderAlarmService.start(
                                context = context.applicationContext,
                                notificationId = record.id.takeIf { it.isNotBlank() },
                                body = record.body.takeIf { it.isNotBlank() },
                            )
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
            PushRegistrationSyncWorker.enqueueImmediate(context)
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
                mediaRepository = container.mediaRepository,
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
                    localRouteNonce++
                    onRouteEvaluated(LinkDestination.NativeRoute(destPath))
                },
                liveRefreshNonce = notificationsLiveNonce,
            )
            return
        }
        activeChannelFeed != null -> {
            val (channelGroupSlug, channelSlug) = activeChannelFeed!!
            ChannelFeedScreen(
                repository = container.feedRepository,
                groupSlug = channelGroupSlug,
                channelSlug = channelSlug,
                language = language,
                imageLoader = container.imageLoader,
                onBack = { activeChannelFeed = null },
                onOpenPost = { post ->
                    activeChannelFeed = null
                    activeDetailPost = post
                    activeDetailSlug = post.slug.ifBlank { post.id }
                },
                onWriteHere = { channelId, channelName ->
                    // Same hop the group page makes: the composer opens aimed at the room, and the
                    // stack of overlays unwinds so a publish returns to the feed, as it means to.
                    activeChannelFeed = null
                    activeGroupSlug = null
                    createChannelTarget = channelId to channelName
                    selectedTab = MainTab.CREATE
                },
            )
            return
        }
        activeGroupSlug != null -> {
            GroupDetailScreen(
                slug = activeGroupSlug!!,
                viewerUid = authState.session?.uid,
                repository = container.discoverRepository,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { activeGroupSlug = null },
                onSignInRequired = { showAuthModal = true },
                onOpenProfile = { username ->
                    activeGroupSlug = null
                    activeProfileTarget = username
                },
                onOpenExternal = { url -> openInCustomTab(context, url) },
                canWriteInChannels = authState.session?.uid != null,
                canOpenChannels = true,
                onOpenChannel = { channelSlug -> activeChannelFeed = activeGroupSlug!! to channelSlug },
                onWriteInChannel = { channelId, channelName ->
                    activeGroupSlug = null
                    createChannelTarget = channelId to channelName
                    selectedTab = MainTab.CREATE
                },
            )
            return
        }
        activeEventSlug != null -> {
            EventDetailScreen(
                slug = activeEventSlug!!,
                viewerUid = authState.session?.uid,
                repository = container.discoverRepository,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { activeEventSlug = null },
                onSignInRequired = { showAuthModal = true },
                onOpenExternal = { url -> openInCustomTab(context, url) },
                mediaRepository = container.mediaRepository,
            )
            return
        }
        activeJobSlug != null -> {
            JobDetailScreen(
                slug = activeJobSlug!!,
                viewerUid = authState.session?.uid,
                viewerSkills = authState.profile?.skills ?: emptyList(),
                repository = container.discoverRepository,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { activeJobSlug = null },
                onSignInRequired = { showAuthModal = true },
                onOpenExternal = { url -> openInCustomTab(context, url) },
                mediaRepository = container.mediaRepository,
            )
            return
        }
        activeGigSlug != null -> {
            GigDetailScreen(
                slug = activeGigSlug!!,
                viewerUid = authState.session?.uid,
                viewerSkills = authState.profile?.skills ?: emptyList(),
                repository = container.discoverRepository,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { activeGigSlug = null },
                onSignInRequired = { showAuthModal = true },
                onOpenProfile = { target ->
                    activeGigSlug = null
                    activeProfileTarget = target
                },
                mediaRepository = container.mediaRepository,
            )
            return
        }
        activeProjectSlug != null -> {
            ProjectDetailScreen(
                slug = activeProjectSlug!!,
                viewerUid = authState.session?.uid,
                repository = container.discoverRepository,
                imageLoader = container.imageLoader,
                language = language,
                onBack = { activeProjectSlug = null },
                onSignInRequired = { showAuthModal = true },
                onOpenExternal = { url -> openInCustomTab(context, url) },
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
                    pendingMessengerTarget = activeProfileTarget
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
                onOpenProfile = { target ->
                    activeProfileTarget = target
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
                    localRouteNonce++
                    onRouteEvaluated(AppLinkUriRouter.resolveLink(nativeUrl))
                },
                onOpenExternal = { extUrl -> openInCustomTab(context, extUrl) },
            )
            return
        }
        showMarketScreen -> {
            if (showMarketAds || marketSection == MarketSection.ADS) {
                AdsDashboardScreen(
                    repository = container.adsRepository,
                    bn = language == AppLanguage.BN,
                    signedIn = authState.session != null,
                    onBack = {
                        showMarketAds = false
                        marketSection = MarketSection.SHOP
                    },
                    onSignInRequired = { showAuthModal = true },
                    onOpenExternal = { url -> openInCustomTab(context, url) },
                )
            } else {
                MkMarketScreen(
                    repository = container.mkRepository,
                    mediaRepository = container.mediaRepository,
                    imageLoader = container.imageLoader,
                    viewerUid = authState.session?.uid,
                    language = language,
                    onBack = {
                        showMarketScreen = false
                        showMarketAds = false
                    },
                    onSignInRequired = { showAuthModal = true },
                    onOpenExternal = { url -> openInCustomTab(context, url) },
                    // Directions go to the system: the Maps app if it is installed, a browser
                    // otherwise. A Custom Tab would always choose the browser.
                    onOpenGoogleMaps = { url -> openInMaps(context, url) },
                    onOpenAds = { showMarketAds = true },
                    initialSection = marketSection,
                )
            }
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
                    marketSection = MarketSection.SHOP
                    showMarketScreen = true
                },
                onOpenNewsReader = {
                    showSettingsScreen = false
                    activeNewsUrl = BsdcHosts.NEWS_ORIGIN
                },
                onTestRoute = { url ->
                    showSettingsScreen = false
                    localRouteNonce++
                    onRouteEvaluated(AppLinkUriRouter.resolveLink(url))
                },
                onOpenExternal = { url -> openInCustomTab(context, url) },
                onBack = { showSettingsScreen = false },
                privacyPrefs = authState.profile?.privacy,
                onUpdatePrivacy = if (authState.session?.uid != null) {
                    { nextPrivacy ->
                        val uid = authState.session?.uid ?: return@SystemDiagnosticsAndSettingsScreen
                        scope.launch {
                            container.discoverRepository.updatePrivacyPrefs(uid, nextPrivacy)
                                .onSuccess { container.authRepository.refreshSessionAndProfile() }
                        }
                    }
                } else {
                    null
                },
                // Google Play requires in-app account deletion. The repository
                // runs the database half, then removes the Firebase user, then
                // clears the session — the order the two systems force.
                onDeleteAccount = if (authState.session?.uid != null) {
                    { container.authRepository.deleteMyAccount() }
                } else {
                    null
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
                                        // Wish list and "recently viewed" are per-device
                                        // preferences, so they must not outlive the account
                                        // that created them on a shared phone.
                                        MkSavedStore.get(context).clear()
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
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding)
                .imePadding(),
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
                        initialChannelId = createChannelTarget?.first,
                        initialChannelName = createChannelTarget?.second,
                        composeRepository = container.composeRepository,
                        mediaRepository = container.mediaRepository,
                        imageLoader = container.imageLoader,
                        language = language,
                        initialMode = if (incomingDestination is LinkDestination.NativeRoute &&
                            incomingDestination.path.startsWith("/create")
                        ) {
                            // `/create?kind=group` means the group screen, as it does on the web; the
                            // hub used to read every create link as an event.
                            CreateHubMode.fromRoute(incomingDestination.path)
                        } else {
                            CreateHubMode.POST
                        },
                        onSignInRequired = { showAuthModal = true },
                        onPostPublished = { res ->
                            createChannelTarget = null
                            activeDetailPost = null
                            activeDetailSlug = res.slug.ifBlank { res.id }
                            selectedTab = MainTab.HOME
                        },
                        onDirectoryCreated = { mode, _ ->
                            discoverSection = when (mode) {
                                CreateHubMode.EVENT -> DiscoverSection.EVENTS
                                CreateHubMode.JOB -> DiscoverSection.JOBS
                                CreateHubMode.GIG -> DiscoverSection.GIGS
                                CreateHubMode.PROJECT -> DiscoverSection.PROJECTS
                                CreateHubMode.GROUP -> DiscoverSection.GROUPS
                                CreateHubMode.POST -> DiscoverSection.SEARCH
                            }
                            selectedTab = MainTab.EXPLORE
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
                            initialPeerHandleOrUid = pendingMessengerTarget,
                            onConsumeInitialPeer = { pendingMessengerTarget = null },
                            onSignInRequired = { showAuthModal = true },
                            onOpenProfileHandle = { target -> activeProfileTarget = target },
                        )
                    }
                    MainTab.EXPLORE -> DiscoverHubScreen(
                        repository = container.discoverRepository,
                        imageLoader = container.imageLoader,
                        viewerUid = authState.session?.uid,
                        language = language,
                        viewerSkills = authState.profile?.skills ?: emptyList(),
                        initialSection = discoverSection,
                        onSignInRequired = { showAuthModal = true },
                        onOpenPost = { slugOrId ->
                            activeDetailPost = null
                            activeDetailSlug = slugOrId
                        },
                        onOpenProfile = { target ->
                            activeProfileTarget = target
                        },
                        onOpenProject = { slug ->
                            activeProjectSlug = slug
                        },
                        onOpenJob = { slug ->
                            activeJobSlug = slug
                        },
                        onOpenGig = { slug ->
                            activeGigSlug = slug
                        },
                        onOpenEvent = { slug ->
                            activeEventSlug = slug
                        },
                        onOpenGroup = { slug ->
                            activeGroupSlug = slug
                        },
                        onOpenVerifyCode = { code ->
                            localRouteNonce++
                            onRouteEvaluated(LinkDestination.NativeRoute("/verify?code=$code"))
                        },
                        onOpenExternal = { url -> openInCustomTab(context, url) },
                        onOpenMarketplace = {
                            marketSection = MarketSection.SHOP
                            showMarketScreen = true
                        },
                        onOpenNewsReader = { activeNewsUrl = BsdcHosts.NEWS_ORIGIN },
                        onOpenCreateHub = {
                            showNotificationsScreen = false
                            showSettingsScreen = false
                            showMarketScreen = false
                            activeNewsUrl = null
                            selectedTab = MainTab.CREATE
                        },
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

/**
 * Hands a Google Maps link to the system, preferring the Maps app.
 *
 * [openInCustomTab] is right for a web page, but wrong for directions: a Custom Tab always
 * opens a browser, which hides the one thing a delivery driver wants — turn-by-turn in the
 * navigation app. `ACTION_VIEW` lets Android route the link to Maps when it is installed and
 * fall back to a browser when it is not. Nothing here is required to exist on the device, so
 * both outcomes are normal rather than errors.
 */
private fun openInMaps(context: Context, url: String) {
    val parsed = runCatching { Uri.parse(url) }.getOrNull() ?: return
    if (parsed.scheme != "https") return
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, parsed).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }.onFailure {
        // No Maps app and no browser that claims the link: fall back to the in-app tab so the
        // tap is never silently swallowed.
        openInCustomTab(context, url)
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

/**
 * The slug that follows one of [prefixes] in a route, or null when the route is the bare
 * collection, points somewhere else, or carries no slug at all. Trailing slashes and deeper
 * segments (`/projects/<slug>/edit`) are tolerated: the first segment after the prefix wins.
 */
/**
 * The room a path names, as `groupSlug to channelSlug`, or null when the path is a group page or
 * something else entirely. `/g/{group}/c/{channel}` is `channelPath()` in `main-site/src/lib/site.ts`.
 */
private fun channelTargetOf(path: String, prefixes: List<String>): Pair<String, String>? {
    val clean = path.trim()
    for (prefix in prefixes) {
        if (!clean.startsWith(prefix)) continue
        val rest = clean.removePrefix(prefix)
        val group = rest.substringBefore('/').substringBefore('?').substringBefore('#').trim()
        val tail = rest.substringAfter('/', "")
        if (group.isBlank() || !tail.startsWith("c/")) continue
        val channel = tail.removePrefix("c/").substringBefore('/').substringBefore('?').substringBefore('#').trim()
        if (channel.isBlank()) continue
        return group to channel
    }
    return null
}

private fun slashSlug(path: String, vararg prefixes: String): String? {
    val clean = path.trim()
    for (prefix in prefixes) {
        if (!clean.startsWith(prefix)) continue
        val rest = clean.removePrefix(prefix).substringBefore('/').substringBefore('?').substringBefore('#').trim()
        return rest.ifBlank { null }
    }
    return null
}
