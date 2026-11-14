package bd.info.bsdc.app.core.permissions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.PermissionGrantState

private data class PermissionCopy(
    val icon: ImageVector,
    val titleEn: String,
    val titleBn: String,
    val reasonEn: String,
    val reasonBn: String,
)

private fun copyFor(kind: DevicePermissionKind): PermissionCopy = when (kind) {
    DevicePermissionKind.NOTIFICATIONS -> PermissionCopy(
        icon = Icons.Rounded.NotificationsActive,
        titleEn = "Real-Time Push Notifications",
        titleBn = "রিয়েল-টাইম পুশ নোটিফিকেশন",
        reasonEn = "Delivers instant replies, comments, reactions, messages, and followed-author posts even when closed or locked.",
        reasonBn = "অ্যাপ বন্ধ বা লক থাকলেও লাইক, মন্তব্য, উত্তর, বার্তা ও অনুসরণ করা পোস্টের তাৎক্ষণিক বিজ্ঞপ্তি পাঠায়।",
    )
    DevicePermissionKind.LOCATION -> PermissionCopy(
        icon = Icons.Rounded.LocationOn,
        titleEn = "Foreground City & Meetups Location",
        titleBn = "নিকটবর্তী মিটআপ ও অবস্থান",
        reasonEn = "Used only when tapped to fill your city (~1 km rounded) for profile, local developer events, and marketplace pickup.",
        reasonBn = "প্রোফাইল শহর, লোকাল মিটআপ এবং মার্কেটপ্লেসের জন্য শুধু ব্যবহারকারীর অনুরোধে আনুমানিক (~১ কিমি) অবস্থান ব্যবহৃত হয়।",
    )
    DevicePermissionKind.CAMERA -> PermissionCopy(
        icon = Icons.Rounded.CameraAlt,
        titleEn = "Camera (QR Verification & Photos)",
        titleBn = "ক্যামেরা (QR যাচাই ও ছবি)",
        reasonEn = "Powers real-time Certificate/Notice QR scanning and capturing photos for ImgBB uploads.",
        reasonBn = "সার্টিফিকেট ও নোটিশের রিয়েল-টাইম QR স্ক্যান এবং ImgBB ছবি তোলার জন্য প্রয়োজন।",
    )
    DevicePermissionKind.MICROPHONE -> PermissionCopy(
        icon = Icons.Rounded.Mic,
        titleEn = "Microphone (Voice Search Only)",
        titleBn = "মাইক্রোফোন (শুধুমাত্র ভয়েস সার্চ)",
        reasonEn = "Dedicated exclusively to live Bengali & English Voice Search. BSDC never records or stores voice audio.",
        reasonBn = "শুধুমাত্র বাংলা ও ইংরেজি ভয়েস সার্চের জন্য ব্যবহৃত হয়। কোনো অডিও ফাইল সংরক্ষণ করা হয় না।",
    )
}

@Composable
fun PersistentPermissionReadinessBanner(
    coordinator: PermissionCoordinator,
    language: AppLanguage,
    onOpenSheet: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val missing = coordinator.missingPermissions
    if (missing.isEmpty()) return

    val bn = language == AppLanguage.BN
    val countText = BanglaDigitFormatter.formatCount(missing.size.toLong(), language)
    BsdcStatusBanner(
        modifier = modifier,
        title = if (bn) {
            "$countText টি ডিভাইস অনুমতি এখনও বাকি"
        } else {
            "$countText device permission${if (missing.size == 1) "" else "s"} needed for full experience"
        },
        body = if (bn) {
            "QR স্ক্যানার, ভয়েস সার্চ, লোকেশন ও লক-স্ক্রিন নোটিফিকেশনের জন্য সব অনুমতি চালু করুন।"
        } else {
            "Enable Camera, Mic Voice Search, Location, and Push Alerts so every BSDC tool responds smoothly."
        },
        tone = BsdcTone.WARN,
        actionLabel = if (bn) "অনুমতি দিন" else "Enable",
        onAction = onOpenSheet,
    )

    PermissionSettingsFallbackDialog(coordinator = coordinator, language = language)
}

@Composable
fun PermissionSettingsFallbackDialog(
    coordinator: PermissionCoordinator,
    language: AppLanguage,
) {
    val target = coordinator.showSettingsFallbackDialogFor ?: return
    val copy = copyFor(target)
    val bn = language == AppLanguage.BN

    AlertDialog(
        onDismissRequest = coordinator::dismissSettingsDialog,
        icon = { Icon(Icons.Rounded.Settings, contentDescription = null) },
        title = {
            Text(
                if (bn) "অ্যান্ড্রয়েড সেটিংস থেকে অনুমতি চালু করুন" else "Allow in Android Settings",
            )
        },
        text = {
            Text(
                if (bn) {
                    "${copy.titleBn}: অ্যান্ড্রয়েড পূর্বে অনুমতিটি ব্লক করায় পপ-আপ দেখানো যাচ্ছে না। সেটিংস > Permissions থেকে এটি Allow করুন।"
                } else {
                    "${copy.titleEn}: Android suppressed further pop-ups after earlier denials. Open App Settings > Permissions and allow it to keep using this tool."
                },
            )
        },
        confirmButton = {
            BsdcButton(
                label = if (bn) "সেটিংস খুলুন" else "Open Settings",
                onClick = coordinator::openAppSettings,
            )
        },
        dismissButton = {
            TextButton(onClick = coordinator::dismissSettingsDialog) {
                Text(if (bn) "পরে" else "Not now")
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermissionReadinessModalSheet(
    coordinator: PermissionCoordinator,
    language: AppLanguage,
    onDismiss: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = if (bn) "BSDC ডিভাইস প্রস্তুতি ও অনুমতি" else "BSDC Device Readiness & Permissions",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                text = if (bn) {
                    "সেরা অভিজ্ঞতার জন্য প্রতিটি অনুমতি সক্রিয় রাখুন। অনুপস্থিত থাকলে সংশ্লিষ্ট ফিচার খোলার সময় পুনরায় চাওয়া হবে।"
                } else {
                    "Grant each capability for full functionality. Any missing permission is cleanly re-prompted when its feature is used."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = BsdcThemeTokens.colors.mutedText,
            )

            DevicePermissionKind.entries.forEach { kind ->
                val state = coordinator.states[kind] ?: PermissionGrantState.NEEDS_REQUEST
                val copy = copyFor(kind)
                val granted = state == PermissionGrantState.GRANTED
                BsdcCard(elevated = granted) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(
                            imageVector = copy.icon,
                            contentDescription = null,
                            tint = if (granted) BsdcThemeTokens.colors.brandStrong else BsdcThemeTokens.colors.warn,
                            modifier = Modifier.size(26.dp),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (bn) copy.titleBn else copy.titleEn,
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                text = if (bn) copy.reasonBn else copy.reasonEn,
                                style = MaterialTheme.typography.bodyMedium,
                                color = BsdcThemeTokens.colors.mutedText,
                            )
                        }
                        if (granted) {
                            Icon(
                                imageVector = Icons.Rounded.CheckCircle,
                                contentDescription = if (bn) "অনুমোদিত" else "Granted",
                                tint = BsdcThemeTokens.colors.brandStrong,
                            )
                        } else {
                            val needsSettings = state == PermissionGrantState.PERMANENTLY_DENIED_OPEN_SETTINGS
                            BsdcButton(
                                label = when {
                                    bn && needsSettings -> "সেটিংস"
                                    bn -> "চালু"
                                    needsSettings -> "Settings"
                                    else -> "Allow"
                                },
                                onClick = { coordinator.request(kind) },
                                secondary = true,
                            )
                        }
                    }
                }
            }

            if (!coordinator.allGranted) {
                BsdcButton(
                    label = if (bn) "বাকি সব অনুমতি দিন" else "Allow All Missing Permissions",
                    onClick = coordinator::requestAllMissing,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                BsdcBadge(
                    label = if (bn) "সব অনুমতি সক্রিয় — প্রস্তুত!" else "All Permissions Granted · Ready",
                    tone = BsdcTone.OK,
                )
            }
        }
    }
}
