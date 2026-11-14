package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcMetricTile
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.BsdcHosts
import kotlinx.coroutines.launch

/**
 * Advertiser dashboard: ad wallet, totals, and each campaign's budget, delivery and pause control.
 * Money is shown in taka (৳). Campaigns are created and edited on the web.
 */
@Composable
fun AdsDashboardScreen(
    repository: AdsRepository,
    bn: Boolean,
    signedIn: Boolean,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenExternal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var balance by remember { mutableStateOf(0L) }
    var campaigns by remember { mutableStateOf<List<AdCampaignDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var busyCampaignId by remember { mutableStateOf<String?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        repository.fetchWalletBalance()
            .onSuccess { balance = it }
            .onFailure { loadFailed = true }
        repository.fetchCampaigns()
            .onSuccess {
                campaigns = it
                loadFailed = false
            }
            .onFailure { loadFailed = true }
        loading = false
    }

    LaunchedEffect(signedIn) {
        if (signedIn) reload() else loading = false
    }

    if (!signedIn) {
        BsdcEmptyState(
            icon = Icons.Rounded.Campaign,
            title = mkText(bn, "Sign in to manage your ads", "বিজ্ঞাপন পরিচালনা করতে সাইন ইন করুন"),
            subtitle = mkText(
                bn,
                "Your ad wallet and campaigns are private to your account.",
                "আপনার বিজ্ঞাপন ওয়ালেট ও ক্যাম্পেইন শুধু আপনার অ্যাকাউন্টে দেখা যায়।",
            ),
            actionLabel = mkText(bn, "Sign in", "সাইন ইন"),
            onAction = onSignInRequired,
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    val activeCount = campaigns.count { it.status == "active" }
    val totalSpent = campaigns.sumOf { it.spent }
    val totalImpressions = campaigns.sumOf { it.impressions }
    val totalClicks = campaigns.sumOf { it.clicks }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = mkText(bn, "Back", "ফিরে যান"),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = mkText(bn, "Ads", "বিজ্ঞাপন"),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = mkText(
                            bn,
                            "Budgets, delivery and pause control",
                            "বাজেট, প্রদর্শন ও বিরতি নিয়ন্ত্রণ",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                BsdcButton(
                    label = mkText(bn, "Refresh", "রিফ্রেশ"),
                    onClick = { scope.launch { loading = true; reload() } },
                    secondary = true,
                    leadingIcon = Icons.Rounded.Refresh,
                    enabled = !loading,
                )
            }
        }

        item {
            BsdcMetricTile(
                label = mkText(bn, "Ad wallet", "বিজ্ঞাপন ওয়ালেট"),
                value = MkLogic.formatTaka(balance, bn),
                icon = Icons.Rounded.Payments,
                tone = BsdcTone.OK,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                BsdcMetricTile(
                    label = mkText(bn, "Live campaigns", "চলমান ক্যাম্পেইন"),
                    value = digits(activeCount.toString(), bn),
                    icon = Icons.Rounded.Campaign,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = mkText(bn, "Total spend", "মোট ব্যয়"),
                    value = MkLogic.formatTaka(totalSpent, bn),
                    icon = Icons.Rounded.Payments,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                BsdcMetricTile(
                    label = mkText(bn, "Impressions", "ইমপ্রেশন"),
                    value = digits(totalImpressions.toString(), bn),
                    icon = Icons.Rounded.Visibility,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = mkText(bn, "Click rate", "ক্লিক রেট"),
                    value = clickRateLabel(totalClicks, totalImpressions, bn),
                    icon = Icons.Rounded.Campaign,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (loadFailed) {
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Could not load your ads", "বিজ্ঞাপন লোড করা যায়নি"),
                    body = mkText(
                        bn,
                        "Check your connection and try again.",
                        "সংযোগ দেখে আবার চেষ্টা করুন।",
                    ),
                    tone = BsdcTone.BAD,
                    actionLabel = mkText(bn, "Retry", "আবার চেষ্টা"),
                    onAction = { scope.launch { loading = true; reload() } },
                )
            }
        }

        actionError?.let { message ->
            item { BsdcStatusBanner(title = message, body = "", tone = BsdcTone.BAD) }
        }
        notice?.let { message ->
            item { BsdcStatusBanner(title = message, body = "", tone = BsdcTone.OK) }
        }

        item {
            BsdcSectionHeader(
                title = mkText(bn, "Campaigns", "ক্যাম্পেইন"),
                subtitle = mkText(bn, "${campaigns.size} in your account", "আপনার অ্যাকাউন্টে ${digits(campaigns.size.toString(), bn)}টি"),
            )
        }

        if (!loading && campaigns.isEmpty() && !loadFailed) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.Campaign,
                    title = mkText(bn, "No campaigns yet", "এখনো কোনো ক্যাম্পেইন নেই"),
                    subtitle = mkText(
                        bn,
                        "Create a campaign on the web. Once it is approved, it starts running here.",
                        "ওয়েবে ক্যাম্পেইন তৈরি করুন। অনুমোদনের পর এখানে চালু হবে।",
                    ),
                    actionLabel = mkText(bn, "Create on web", "ওয়েবে তৈরি করুন"),
                    onAction = { onOpenExternal("${BsdcHosts.SITE_ORIGIN}/ads") },
                )
            }
        }

        items(campaigns, key = { it.id }) { campaign ->
            CampaignCard(
                campaign = campaign,
                bn = bn,
                busy = busyCampaignId == campaign.id,
                anyBusy = busyCampaignId != null,
                onTogglePause = {
                    val pause = campaign.status == "active"
                    scope.launch {
                        busyCampaignId = campaign.id
                        actionError = null
                        notice = null
                        repository.setCampaignPaused(campaign.id, pause)
                            .onSuccess {
                                notice = if (pause) {
                                    mkText(bn, "Campaign paused.", "ক্যাম্পেইন বিরতিতে রাখা হয়েছে।")
                                } else {
                                    mkText(bn, "Campaign is live again.", "ক্যাম্পেইন আবার চালু হয়েছে।")
                                }
                                reload()
                            }
                            .onFailure {
                                actionError = mkText(
                                    bn,
                                    "Could not change this campaign. Try again.",
                                    "ক্যাম্পেইনটি বদলানো যায়নি। আবার চেষ্টা করুন।",
                                )
                            }
                        busyCampaignId = null
                    }
                },
            )
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun CampaignCard(
    campaign: AdCampaignDto,
    bn: Boolean,
    busy: Boolean,
    anyBusy: Boolean,
    onTogglePause: () -> Unit,
) {
    val colors = BsdcThemeTokens.colors
    val canToggle = campaign.status == "active" || campaign.status == "paused"
    val fraction = if (campaign.totalBudget > 0) {
        (campaign.spent.toFloat() / campaign.totalBudget.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }

    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = campaign.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            BsdcBadge(label = statusLabel(campaign.status, bn), tone = statusTone(campaign.status))
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = mkText(
                bn,
                "Budget ${MkLogic.formatTaka(campaign.spent, bn)} of ${MkLogic.formatTaka(campaign.totalBudget, bn)}",
                "বাজেট ${MkLogic.formatTaka(campaign.spent, bn)} / ${MkLogic.formatTaka(campaign.totalBudget, bn)}",
            ),
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(6.dp)
                    .background(colors.brandStrong),
            )
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = mkText(
                bn,
                "Impressions ${digits(campaign.impressions.toString(), bn)} · Clicks ${digits(campaign.clicks.toString(), bn)} · CTR ${clickRateLabel(campaign.clicks, campaign.impressions, bn)}",
                "ইমপ্রেশন ${digits(campaign.impressions.toString(), bn)} · ক্লিক ${digits(campaign.clicks.toString(), bn)} · CTR ${clickRateLabel(campaign.clicks, campaign.impressions, bn)}",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = colors.mutedText,
        )
        Text(
            text = mkText(
                bn,
                "Today ${MkLogic.formatTaka(campaign.spendToday, bn)} · Daily cap ${MkLogic.formatTaka(campaign.dailyBudget, bn)}",
                "আজ ${MkLogic.formatTaka(campaign.spendToday, bn)} · দৈনিক সীমা ${MkLogic.formatTaka(campaign.dailyBudget, bn)}",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = colors.mutedText,
        )

        if (campaign.status == "rejected" && campaign.reviewNote.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = campaign.reviewNote,
                style = MaterialTheme.typography.bodySmall,
                color = colors.danger,
            )
        }

        if (canToggle) {
            Spacer(Modifier.height(12.dp))
            BsdcButton(
                label = if (campaign.status == "active") {
                    mkText(bn, "Pause", "বিরতি")
                } else {
                    mkText(bn, "Resume", "চালু করুন")
                },
                onClick = onTogglePause,
                secondary = true,
                busy = busy,
                enabled = !anyBusy,
                leadingIcon = if (campaign.status == "active") Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun statusLabel(status: String, bn: Boolean): String = when (status) {
    "active" -> mkText(bn, "Live", "চলমান")
    "paused" -> mkText(bn, "Paused", "বিরতিতে")
    "pending_review" -> mkText(bn, "In review", "পর্যালোচনায়")
    "rejected" -> mkText(bn, "Rejected", "প্রত্যাখ্যাত")
    "completed" -> mkText(bn, "Completed", "সম্পন্ন")
    else -> mkText(bn, "Draft", "খসড়া")
}

private fun statusTone(status: String): BsdcTone = when (status) {
    "active" -> BsdcTone.OK
    "paused" -> BsdcTone.WARN
    "pending_review" -> BsdcTone.INFO
    "rejected" -> BsdcTone.BAD
    else -> BsdcTone.NEUTRAL
}

/** Click-through rate as a percentage. Zero impressions reads as 0%, never a division error. */
private fun clickRateLabel(clicks: Int, impressions: Int, bn: Boolean): String {
    if (impressions <= 0) return digits("0%", bn)
    val rate = clicks * 100.0 / impressions
    return digits("${"%.2f".format(rate)}%", bn)
}

/** Converts ASCII digits to Bangla digits when the Bangla interface is on. Other text is unchanged. */
private fun digits(text: String, bn: Boolean): String {
    if (!bn) return text
    return text.map { c -> if (c in '0'..'9') '০' + (c - '0') else c }.joinToString("")
}
