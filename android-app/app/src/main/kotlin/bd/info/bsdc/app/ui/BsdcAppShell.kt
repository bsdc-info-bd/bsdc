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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.VerifiedUser
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
import bd.info.bsdc.app.core.designsystem.BsdcAvatarCircle
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcBrandWordmark
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcCodeTextStyle
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcPalette
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaLightboxDialog
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.LinkDestination
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
    var lightboxImage by remember { mutableStateOf<Pair<String, String>?>(null) }

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
                selectedTab = when {
                    p.startsWith("/verify") -> {
                        guestBrowsing = true
                        MainTab.VERIFY
                    }
                    p.startsWith("/compose") || p.startsWith("/create") -> MainTab.CREATE
                    p.startsWith("/messages") -> MainTab.MESSAGES
                    p != "/" -> MainTab.EXPLORE
                    else -> MainTab.HOME
                }
            }
            is LinkDestination.NewsReader -> {
                guestBrowsing = true
                selectedTab = MainTab.EXPLORE
            }
            is LinkDestination.ExternalBrowser -> openInCustomTab(context, incomingDestination.url)
            else -> Unit
        }
    }

    // Clear explicit auth overlay automatically once user completes authentication
    LaunchedEffect(authState.gate) {
        if (authState.gate == AuthGateState.READY) {
            showAuthModal = false
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
                    MainTab.HOME -> HomeFoundationTab(
                        language = language,
                        authState = authState,
                        cachedPosts = cachedPosts,
                        syncSettings = syncSettings,
                        container = container,
                        incomingDestination = incomingDestination,
                        onOpenLightbox = { url, alt -> lightboxImage = url to alt },
                        onTriggerSync = { SyncScheduler.triggerImmediateSync(context, forceManual = true) },
                        onSignInClick = { showAuthModal = true },
                        onJumpVerify = { selectedTab = MainTab.VERIFY },
                        onJumpExplore = { selectedTab = MainTab.EXPLORE },
                    )
                    MainTab.VERIFY -> VerifyChecksumSandboxTab(language = language)
                    MainTab.CREATE -> CreateFoundationTab(language = language, authState = authState, onSignInClick = { showAuthModal = true })
                    MainTab.MESSAGES -> MessagesFoundationTab(language = language, authState = authState, onSignInClick = { showAuthModal = true })
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

    lightboxImage?.let { (url, caption) ->
        BsdcMediaLightboxDialog(
            fullUrl = url,
            caption = caption,
            imageLoader = container.imageLoader,
            onDismiss = { lightboxImage = null },
        )
    }
}

@Composable
private fun HomeFoundationTab(
    language: AppLanguage,
    authState: AuthStateSnapshot,
    cachedPosts: List<FeedPost>,
    syncSettings: OfflineSyncSettings,
    container: BsdcAppContainer,
    incomingDestination: LinkDestination,
    onOpenLightbox: (String, String) -> Unit,
    onTriggerSync: () -> Unit,
    onSignInClick: () -> Unit,
    onJumpVerify: () -> Unit,
    onJumpExplore: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val profile = authState.profile
        if (profile != null && authState.session != null) {
            item {
                BsdcCard(elevated = true) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        BsdcAvatarCircle(initials = profile.displayName, online = true, size = 48.dp)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = profile.displayName, style = MaterialTheme.typography.titleLarge)
                            Text(
                                text = "@${profile.username} · ${authState.session?.claims?.role?.wireValue ?: "member"}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = BsdcThemeTokens.colors.mutedText,
                            )
                        }
                        BsdcBadge(
                            label = if (authState.session?.claims?.postgresAuthenticated == true) {
                                if (bn) "JWT সক্রিয়" else "DB Authenticated"
                            } else {
                                if (bn) "সিঙ্ক হচ্ছে" else "Syncing"
                            },
                            tone = BsdcTone.OK,
                        )
                    }
                    if (profile.bio.isNotBlank()) {
                        Text(text = profile.bio, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        } else {
            item {
                BsdcStatusBanner(
                    title = if (bn) "BSDC সদস্য হিসেবে সাইন ইন করুন" else "Sign in to your BSDC account",
                    body = if (bn) {
                        "ভিজিটর মোডে যাচাইকরণ টুল খোলা আছে; পোস্ট, মেসেঞ্জার ও প্রোফাইল ব্যবহারের জন্য সাইন ইন করুন।"
                    } else {
                        "Public verification works as a guest. Sign in with Email, Google, or GitHub to post, chat, and sync bookmarks."
                    },
                    tone = BsdcTone.INFO,
                    actionLabel = if (bn) "সাইন ইন" else "Sign In",
                    onAction = onSignInClick,
                )
            }
        }

        item {
            BsdcStatusBanner(
                title = if (bn) "BSDC নেটিভ অ্যান্ড্রয়েড · ধাপ ৩ সক্রিয়" else "BSDC Native Android · Phase 3 Active",
                body = if (bn) {
                    "Room অফলাইন ফিড ক্যাশ (${BanglaDigitFormatter.formatCount(cachedPosts.size.toLong(), language)} টি পোস্ট), স্মার্ট WorkManager প্রিফেচ ও ImgBB মিডিয়া পাইপলাইন সক্রিয়।"
                } else {
                    "Room offline feed store (${cachedPosts.size} cached posts), WorkManager smart sync (${syncSettings.policy.wireValue}), and ImgBB-only Coil media pipeline active."
                },
                tone = BsdcTone.OK,
                actionLabel = if (bn) "সিঙ্ক" else "Sync Now",
                onAction = onTriggerSync,
            )
        }

        if (cachedPosts.isNotEmpty()) {
            items(cachedPosts.take(5).size) { idx ->
                val post = cachedPosts[idx]
                BsdcCard {
                    Text(
                        text = post.title.ifBlank { post.excerpt.take(80) },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    if (post.excerpt.isNotBlank()) {
                        Text(
                            text = post.excerpt,
                            style = MaterialTheme.typography.bodyMedium,
                            color = BsdcThemeTokens.colors.mutedText,
                            maxLines = 2,
                        )
                    }
                    post.media.firstOrNull()?.let { media ->
                        BsdcImgbbImage(
                            fullUrl = media.url,
                            thumbUrl = media.thumbUrl,
                            contentDescription = media.altText.ifBlank { post.title },
                            imageLoader = container.imageLoader,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(180.dp),
                            onTapOpenLightbox = { onOpenLightbox(media.url, media.altText.ifBlank { post.title }) },
                        )
                    }
                }
            }
        }

        item {
            BsdcCard {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    BsdcBadge(label = BuildConfig.APPLICATION_ID, tone = BsdcTone.INFO)
                    BsdcBadge(
                        label = "v${BuildConfig.VERSION_NAME} (#${BanglaDigitFormatter.formatCount(BuildConfig.VERSION_CODE.toLong(), language)})",
                        tone = BsdcTone.OK,
                    )
                }
                Text(
                    text = if (bn) "আর্কিটেকচার কনট্র্যাক্ট সারসংক্ষেপ" else "Verified Platform Contracts",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = if (bn) {
                        "• মিডিয়া: শুধু ImgBB ইমেজ (কোনো Cloudinary বা অডিও রেকর্ড স্টোরেজ নেই)\n• পুশ: FCM HTTP v1 (${BuildConfig.PUSH_WORKER_ORIGIN})\n• ভয়েস: শুধু ভয়েস সার্চ\n• এডমিন প্যানেল সম্পূর্ণ বাদ দেওয়া হয়েছে"
                    } else {
                        "• Media: ImgBB images only (zero Cloudinary, zero voice-note audio storage)\n• Push: FCM HTTP v1 (${BuildConfig.PUSH_WORKER_ORIGIN})\n• Voice: Dedicated to Voice Search\n• Admin consoles excluded by design"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = BsdcThemeTokens.colors.mutedText,
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BsdcButton(
                        label = if (bn) "ডিপ-লিংক ও থিম টেস্ট" else "Test Router & Theme",
                        onClick = onJumpExplore,
                        leadingIcon = Icons.Rounded.Link,
                    )
                    BsdcButton(
                        label = if (bn) "যাচাই" else "Verify",
                        onClick = onJumpVerify,
                        secondary = true,
                    )
                }
            }
        }

        item {
            val destLabel = when (incomingDestination) {
                is LinkDestination.NativeRoute -> "NativeRoute -> ${incomingDestination.path}"
                is LinkDestination.NewsReader -> "NewsReader WebView -> ${incomingDestination.url}"
                is LinkDestination.AdminWebOnly -> "Blocked Admin Web-Only -> ${incomingDestination.path}"
                is LinkDestination.ExternalBrowser -> "Custom Tab -> ${incomingDestination.url}"
                is LinkDestination.Ignored -> "Ignored -> ${incomingDestination.reason}"
            }
            BsdcCard(elevated = true) {
                Text(
                    text = if (bn) "সর্বশেষ অ্যাপ লিংক রাউটিং" else "Active Intent Resolution",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(text = destLabel, style = BsdcCodeTextStyle)
            }
        }
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

@Composable
private fun CreateFoundationTab(
    language: AppLanguage,
    authState: AuthStateSnapshot,
    onSignInClick: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            BsdcEmptyState(
                icon = Icons.Rounded.AddCircleOutline,
                title = if (bn) "কন্টেন্ট ও ডিরেক্টরি কম্পোজার (ধাপ ৫)" else "Rich Composer & ImgBB Pipeline (Phase 5)",
                subtitle = if (bn) {
                    "পোস্ট, আর্টিকেল, প্রশ্ন, পোল, কোড স্নিপেট এবং ImgBB ইমেজ আপলোড এখানে সক্রিয় হবে।"
                } else {
                    "Post, Article, Question, Poll, Code Snippet composers and ImgBB multi-image crop/upload activate in Phase 3 & Phase 5."
                },
                actionLabel = if (authState.session == null) (if (bn) "সাইন ইন করুন" else "Sign In") else null,
                onAction = if (authState.session == null) onSignInClick else null,
            )
        }
    }
}

@Composable
private fun MessagesFoundationTab(
    language: AppLanguage,
    authState: AuthStateSnapshot,
    onSignInClick: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            BsdcEmptyState(
                icon = Icons.Rounded.ChatBubbleOutline,
                title = if (bn) "রিয়েল-টাইম মেসেঞ্জার (ধাপ ৬)" else "Real-Time Messenger (Phase 6)",
                subtitle = if (bn) {
                    "Supabase Realtime ও RTDB-ভিত্তিক চ্যাট, টাইপিং, রিপ্লাই এবং ImgBB ছবি শেয়ার (কোনো ভয়েস নোট রেকর্ডিং ছাড়াই)।"
                } else {
                    "Supabase Realtime + RTDB live threads, typing indicators, replies, code snippets, and ImgBB image attachments (zero audio recording)."
                },
                actionLabel = if (authState.session == null) (if (bn) "সাইন ইন করুন" else "Sign In") else null,
                onAction = if (authState.session == null) onSignInClick else null,
            )
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
