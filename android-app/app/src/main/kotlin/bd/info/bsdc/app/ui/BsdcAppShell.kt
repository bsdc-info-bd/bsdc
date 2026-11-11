package bd.info.bsdc.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.VerifiedUser
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
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.R
import bd.info.bsdc.app.core.common.AppLinkUriRouter
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.common.DocCodeChecksum
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
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.LinkDestination
import bd.info.bsdc.app.core.model.ParsedDocCode
import bd.info.bsdc.app.core.model.ThemeMode

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
    incomingDestination: LinkDestination,
    language: AppLanguage,
    themeMode: ThemeMode,
    onChangeLanguage: (AppLanguage) -> Unit,
    onChangeTheme: (ThemeMode) -> Unit,
    onRouteEvaluated: (LinkDestination) -> Unit,
) {
    var selectedTab by remember { mutableStateOf(MainTab.HOME) }
    val context = LocalContext.current
    val useRail = LocalConfiguration.current.screenWidthDp >= 600

    LaunchedEffect(incomingDestination) {
        when (incomingDestination) {
            is LinkDestination.NativeRoute -> {
                val p = incomingDestination.path
                selectedTab = when {
                    p.startsWith("/verify") -> MainTab.VERIFY
                    p.startsWith("/compose") || p.startsWith("/create") -> MainTab.CREATE
                    p.startsWith("/messages") -> MainTab.MESSAGES
                    p != "/" -> MainTab.EXPLORE
                    else -> MainTab.HOME
                }
            }
            is LinkDestination.NewsReader -> selectedTab = MainTab.EXPLORE
            is LinkDestination.ExternalBrowser -> openInCustomTab(context, incomingDestination.url)
            else -> Unit
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

            when (selectedTab) {
                MainTab.HOME -> HomeFoundationTab(
                    language = language,
                    incomingDestination = incomingDestination,
                    onJumpVerify = { selectedTab = MainTab.VERIFY },
                    onJumpExplore = { selectedTab = MainTab.EXPLORE },
                )
                MainTab.VERIFY -> VerifyChecksumSandboxTab(language = language)
                MainTab.CREATE -> CreateFoundationTab(language = language)
                MainTab.MESSAGES -> MessagesFoundationTab(language = language)
                MainTab.EXPLORE -> ExploreRouterAndSettingsTab(
                    language = language,
                    themeMode = themeMode,
                    incomingDestination = incomingDestination,
                    onChangeTheme = onChangeTheme,
                    onChangeLanguage = onChangeLanguage,
                    onTestRoute = { url -> onRouteEvaluated(AppLinkUriRouter.resolveLink(url)) },
                    onOpenExternal = { url -> openInCustomTab(context, url) },
                )
            }
        }
    }
}

@Composable
private fun HomeFoundationTab(
    language: AppLanguage,
    incomingDestination: LinkDestination,
    onJumpVerify: () -> Unit,
    onJumpExplore: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            BsdcStatusBanner(
                title = if (bn) "BSDC নেটিভ অ্যান্ড্রয়েড · ধাপ ১ সক্রিয়" else "BSDC Native Android · Phase 1 Active",
                body = if (bn) {
                    "সম্পূর্ণ Kotlin + Java 21 + Jetpack Compose ভিত্তি, ডিপ লিংক রাউটার এবং অফলাইন চেকসাম ইঞ্জিন প্রস্তুত।"
                } else {
                    "Pure Kotlin + Java 21 + Jetpack Compose core, verified App Link router, and native check-digit engine active."
                },
                tone = BsdcTone.OK,
                actionLabel = if (bn) "যাচাই" else "Verify",
                onAction = onJumpVerify,
            )
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
private fun CreateFoundationTab(language: AppLanguage) {
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
            )
        }
    }
}

@Composable
private fun MessagesFoundationTab(language: AppLanguage) {
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
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExploreRouterAndSettingsTab(
    language: AppLanguage,
    themeMode: ThemeMode,
    incomingDestination: LinkDestination,
    onChangeTheme: (ThemeMode) -> Unit,
    onChangeLanguage: (AppLanguage) -> Unit,
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
                    text = if (bn) "থিম ও ভাষা পছন্দ" else "Theme & Language",
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
