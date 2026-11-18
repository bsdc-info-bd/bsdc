package bd.info.bsdc.app.feature.news

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Newspaper
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import bd.info.bsdc.app.core.model.PrivacyPrefs
import bd.info.bsdc.app.core.model.SyncNetworkPolicy
import bd.info.bsdc.app.core.model.ThemeMode
import bd.info.bsdc.app.core.sync.OfflineSyncSettings
import kotlinx.coroutines.launch

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
    privacyPrefs: PrivacyPrefs? = null,
    onUpdatePrivacy: ((PrivacyPrefs) -> Unit)? = null,
    onDeleteAccount: (suspend () -> Result<Unit>)? = null,
) {
    val bn = language == AppLanguage.BN
    var testUrl by remember { mutableStateOf(BsdcHosts.NEWS_ORIGIN) }
    var localPrivacy by remember(privacyPrefs) { mutableStateOf(privacyPrefs ?: PrivacyPrefs()) }
    val scope = rememberCoroutineScope()
    var deleteDialogOpen by remember { mutableStateOf(false) }
    var deleteAnswer by remember { mutableStateOf("") }
    var deleteBusy by remember { mutableStateOf(false) }
    var deleteMessage by remember { mutableStateOf<String?>(null) }

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
                .padding(innerPadding)
                .imePadding(),
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

            if (privacyPrefs != null && onUpdatePrivacy != null) {
                item {
                    BsdcCard {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Lock,
                                contentDescription = null,
                                tint = BsdcThemeTokens.colors.brandStrong,
                            )
                            Text(
                                text = if (bn) "গোপনীয়তা ও অনুসন্ধান দৃশ্যমানতা" else "Privacy & Discovery",
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                        PrivacyToggleRow(
                            title = if (bn) "অনুসন্ধান ও সাজেশনে প্রোফাইল দেখান" else "Show profile in search & suggestions",
                            checked = localPrivacy.discoverable,
                            onCheckedChange = { checked ->
                                val next = localPrivacy.copy(discoverable = checked)
                                localPrivacy = next
                                onUpdatePrivacy(next)
                            },
                        )
                        HorizontalDivider(color = BsdcThemeTokens.colors.border)
                        PrivacyToggleRow(
                            title = if (bn) "সক্রিয়তার অবস্থা দেখান" else "Show activity status",
                            checked = localPrivacy.showActivity,
                            onCheckedChange = { checked ->
                                val next = localPrivacy.copy(showActivity = checked)
                                localPrivacy = next
                                onUpdatePrivacy(next)
                            },
                        )
                        HorizontalDivider(color = BsdcThemeTokens.colors.border)
                        PrivacyToggleRow(
                            title = if (bn) "অনুসারী ও অনুসরণ তালিকা উন্মুক্ত রাখুন" else "Show followers & following lists",
                            checked = localPrivacy.showFollowers,
                            onCheckedChange = { checked ->
                                val next = localPrivacy.copy(showFollowers = checked)
                                localPrivacy = next
                                onUpdatePrivacy(next)
                            },
                        )
                        HorizontalDivider(color = BsdcThemeTokens.colors.border)
                        PrivacyToggleRow(
                            title = if (bn) "প্রোফাইলে ইমেইল দৃশ্যমান রাখুন" else "Show email on profile",
                            checked = localPrivacy.showEmail,
                            onCheckedChange = { checked ->
                                val next = localPrivacy.copy(showEmail = checked)
                                localPrivacy = next
                                onUpdatePrivacy(next)
                            },
                        )
                    }
                }
            }

            item {
                // Google Play expects the policy and the terms to be reachable
                // from inside the app, not only from the store listing, and a
                // member should be able to read what they agreed to without
                // leaving for a browser they have to remember the address of.
                BsdcCard {
                    Text(
                        text = if (bn) "আইনি তথ্য" else "Legal",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = if (bn) {
                            "গোপনীয়তা নীতি ও সেবার শর্তাবলি পড়ুন।"
                        } else {
                            "Read the privacy policy and the terms of service."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        OutlinedButton(onClick = { onOpenExternal("${BsdcHosts.SITE_ORIGIN}/privacy") }) {
                            Text(if (bn) "গোপনীয়তা নীতি" else "Privacy policy")
                        }
                        OutlinedButton(onClick = { onOpenExternal("${BsdcHosts.SITE_ORIGIN}/terms") }) {
                            Text(if (bn) "শর্তাবলি" else "Terms of service")
                        }
                    }
                }
            }

            if (onDeleteAccount != null) {
                item {
                    // Required by Google Play for any app with account creation.
                    // The wording is deliberately explicit: a member deleting
                    // their account should know what goes and what stays before
                    // they confirm, not after.
                    BsdcCard {
                        Text(
                            text = if (bn) "আপনার অ্যাকাউন্ট মোছা" else "Delete your account",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = if (bn) {
                                "আপনার প্রোফাইল, পোস্ট, মন্তব্য, বার্তা, ঠিকানা ও ডিভাইস টোকেন মুছে যাবে। " +
                                    "লেনদেনের অন্য পক্ষের প্রয়োজন হয় এমন অর্ডার ও পেমেন্ট নথিতে থাকবে, তবে আপনার নাম, " +
                                    "ঠিকানা বা ফোন নম্বর ছাড়া। এটি পূর্বাবস্থায় ফেরানো যায় না।"
                            } else {
                                "This removes your profile, posts, comments, messages, addresses and device tokens. " +
                                    "Orders and payments the other party still needs stay on file without your name, " +
                                    "address or phone number. It cannot be undone."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        deleteMessage?.let { message ->
                            BsdcStatusBanner(
                                title = if (bn) "অ্যাকাউন্ট মোছা" else "Delete account",
                                body = message,
                                tone = BsdcTone.BAD,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            BsdcButton(
                                label = if (bn) "অ্যাকাউন্ট মোছা" else "Delete account",
                                onClick = {
                                    deleteMessage = null
                                    deleteAnswer = ""
                                    deleteDialogOpen = true
                                },
                            )
                            OutlinedButton(onClick = { onOpenExternal("${BsdcHosts.SITE_ORIGIN}/privacy") }) {
                                Text(if (bn) "গোপনীয়তা নীতি" else "Privacy policy")
                            }
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

        val delete = onDeleteAccount
        if (deleteDialogOpen && delete != null) {
            AlertDialog(
                onDismissRequest = { if (!deleteBusy) deleteDialogOpen = false },
                title = { Text(if (bn) "অ্যাকাউন্ট মোছা নিশ্চিত করুন" else "Confirm account deletion") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = if (bn) {
                                "যা মুছে যাবে তা ফিরিয়ে আনা যাবে না। নিশ্চিত করতে DELETE লিখুন।"
                            } else {
                                "What you delete cannot be recovered. Type DELETE to confirm."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        OutlinedTextField(
                            value = deleteAnswer,
                            onValueChange = { deleteAnswer = it },
                            singleLine = true,
                            label = { Text("DELETE") },
                        )
                    }
                },
                confirmButton = {
                    TextButton(
                        enabled = deleteAnswer.trim() == "DELETE" && !deleteBusy,
                        onClick = {
                            if (deleteBusy) return@TextButton
                            deleteBusy = true
                            scope.launch {
                                val result = delete()
                                deleteBusy = false
                                deleteDialogOpen = false
                                deleteAnswer = ""
                                deleteMessage = result.exceptionOrNull()?.let { err ->
                                    val text = err.message.orEmpty()
                                    when {
                                        text.contains("delete-pending") -> if (bn) {
                                            "আপনার অ্যাকাউন্টের তথ্য মুছে গেছে। এই সেশনে সাইন-ইন সরানো যায়নি — " +
                                                "আবার সাইন ইন করে আবার চেষ্টা করলে বাকিটাও শেষ হবে।"
                                        } else {
                                            "Your account data has been deleted. Your sign-in could not be removed " +
                                                "in this session — sign in again and repeat this to finish."
                                        }
                                        text.contains("owner", ignoreCase = true) || text.contains("42501") -> if (bn) {
                                            "ওনার অ্যাকাউন্ট এখান থেকে মোছা যায় না। প্রথমে মালিকানা হস্তান্তর করুন।"
                                        } else {
                                            "The owner account cannot be deleted here. Transfer ownership first."
                                        }
                                        else -> if (bn) {
                                            "অ্যাকাউন্ট মোছা যায়নি। কিছুই বদলায়নি। আবার চেষ্টা করুন।"
                                        } else {
                                            "The account could not be deleted. Nothing was changed. Please try again."
                                        }
                                    }
                                }
                            }
                        },
                    ) {
                        Text(
                            if (deleteBusy) {
                                if (bn) "মোছা হচ্ছে" else "Deleting"
                            } else if (bn) {
                                "মুছুন"
                            } else {
                                "Delete"
                            },
                        )
                    }
                },
                dismissButton = {
                    TextButton(
                        enabled = !deleteBusy,
                        onClick = {
                            deleteDialogOpen = false
                            deleteAnswer = ""
                        },
                    ) {
                        Text(if (bn) "বাতিল" else "Cancel")
                    }
                },
            )
        }
    }
}

@Composable
private fun PrivacyToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .weight(1f)
                .padding(end = 12.dp),
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}
