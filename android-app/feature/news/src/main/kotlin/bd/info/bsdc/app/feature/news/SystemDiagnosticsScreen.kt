package bd.info.bsdc.app.feature.news

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcHosts
import bd.info.bsdc.app.core.model.LinkDestination
import bd.info.bsdc.app.core.model.OfflineSyncSettings
import bd.info.bsdc.app.core.model.SyncNetworkPolicy
import bd.info.bsdc.app.core.model.ThemeMode

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SystemDiagnosticsAndSettingsScreen(
    language: AppLanguage,
    themeMode: ThemeMode,
    syncSettings: OfflineSyncSettings,
    cachedPostCount: Int,
    incomingDestination: LinkDestination,
    versionName: String,
    versionCode: Int,
    onChangeTheme: (ThemeMode) -> Unit,
    onChangeLanguage: (AppLanguage) -> Unit,
    onChangeSyncPolicy: (SyncNetworkPolicy) -> Unit,
    onTriggerSync: () -> Unit,
    onOpenPermissionSheet: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenMarketplace: () -> Unit,
    onOpenNewsReader: () -> Unit,
    onTestRoute: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    var testUrl by remember { mutableStateOf(BsdcHosts.NEWS_ORIGIN) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (bn) "সেটিংস, শপ, নিউজ ও ডায়াগনস্টিকস" else "Settings, Store, News & System")
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                BsdcCard {
                    Text(
                        text = if (bn) "বিশেষ মডিউল শর্টকাট" else "Ecosystem Hubs",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(onClick = onOpenMarketplace) {
                            Icon(Icons.Rounded.ShoppingBag, contentDescription = null)
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(if (bn) "মার্কেটপ্লেস" else "Marketplace")
                        }
                        OutlinedButton(onClick = onOpenNewsReader) {
                            Icon(Icons.Rounded.Newspaper, contentDescription = null)
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(if (bn) "BSDC নিউজ রিডার" else "News Reader")
                        }
                        OutlinedButton(onClick = onOpenNotifications) {
                            Icon(Icons.Rounded.Notifications, contentDescription = null)
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(if (bn) "বিজ্ঞপ্তি" else "Notifications")
                        }
                        OutlinedButton(onClick = onOpenPermissionSheet) {
                            Icon(Icons.Rounded.Security, contentDescription = null)
                            Spacer(modifier = Modifier.size(6.dp))
                            Text(if (bn) "অনুমতি" else "Permissions")
                        }
                    }
                }
            }

            item {
                BsdcCard {
                    Text(
                        text = if (bn) "অফলাইন অটো-সিঙ্ক ও ImgBB ক্যাশ" else "Smart Offline Auto-Sync & ImgBB Cache",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    val countText = BanglaDigitFormatter.formatCount(cachedPostCount.toLong(), language)
                    Text(
                        text = if (bn) {
                            "সংরক্ষিত পোস্ট: ${countText} টি · সর্বোচ্চ ImgBB ক্যাশ: ${syncSettings.maxCacheMb} MB"
                        } else {
                            "Cached offline posts: $countText · ImgBB disk cap: ${syncSettings.maxCacheMb} MB"
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
                        text = if (bn) "থিম ও ভাষা" else "Theme & Language",
                        style = MaterialTheme.typography.titleMedium,
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
                            text = if (bn) "অ্যাপ লিংক ও নিউজ ওয়েবভিউ ডায়াগনস্টিকস" else "System Link Router & Diagnostics",
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                    Text(
                        text = "${BsdcHosts.PACKAGE_ID} • v$versionName ($versionCode)",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = testUrl,
                        onValueChange = { testUrl = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("URL") },
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        BsdcButton(
                            label = if (bn) "রাউট খুলুন" else "Evaluate Route",
                            onClick = { onTestRoute(testUrl) },
                        )
                        OutlinedButton(onClick = { onOpenExternal("${BsdcHosts.SITE_ORIGIN}/guidelines") }) {
                            Text(if (bn) "নীতিমালা" else "Guidelines")
                        }
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
}
