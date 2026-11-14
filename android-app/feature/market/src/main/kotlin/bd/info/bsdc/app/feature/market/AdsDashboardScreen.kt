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
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.text.style.TextAlign
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
    var selectedId by remember { mutableStateOf<String?>(null) }

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

    val selected = campaigns.firstOrNull { it.id == selectedId }
    if (selected != null) {
        AdsCampaignDetail(
            campaign = selected,
            bn = bn,
            busy = busyCampaignId == selected.id,
            anyBusy = busyCampaignId != null,
            onBack = { selectedId = null },
            onTogglePause = {
                val pause = selected.status == "active"
                scope.launch {
                    busyCampaignId = selected.id
                    actionError = null
                    notice = null
                    repository.setCampaignPaused(selected.id, pause)
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
                onOpen = { selectedId = campaign.id },
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
    onOpen: () -> Unit,
) {
    val colors = BsdcThemeTokens.colors
    val canToggle = campaign.status == "active" || campaign.status == "paused"
    val fraction = if (campaign.totalBudget > 0) {
        (campaign.spent.toFloat() / campaign.totalBudget.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }

    BsdcCard(modifier = Modifier.fillMaxWidth(), onClick = onOpen) {
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
internal fun clickRateLabel(clicks: Int, impressions: Int, bn: Boolean): String {
    if (impressions <= 0) return digits("0%", bn)
    val rate = clicks * 100.0 / impressions
    return digits("${"%.2f".format(rate)}%", bn)
}

/** Converts ASCII digits to Bangla digits when the Bangla interface is on. Other text is unchanged. */
internal fun digits(text: String, bn: Boolean): String {
    if (!bn) return text
    return text.map { c -> if (c in '0'..'9') '০' + (c - '0') else c }.joinToString("")
}

/** Full view of one campaign: budget, schedule, pricing, daily cap, creatives and metrics. */
@Composable
private fun AdsCampaignDetail(
    campaign: AdCampaignDto,
    bn: Boolean,
    busy: Boolean,
    anyBusy: Boolean,
    onBack: () -> Unit,
    onTogglePause: () -> Unit,
) {
    val colors = BsdcThemeTokens.colors
    val canToggle = campaign.status == "active" || campaign.status == "paused"
    val remaining = (campaign.totalBudget - campaign.spent).coerceAtLeast(0L)
    val fraction = if (campaign.totalBudget > 0) {
        (campaign.spent.toFloat() / campaign.totalBudget.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val pricingLabel = when (campaign.pricing) {
        "cpc" -> mkText(bn, "Per click", "প্রতি ক্লিকে")
        else -> mkText(bn, "Per 1,000 views", "প্রতি ১,০০০ ভিউতে")
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = mkText(bn, "Back", "ফিরে যান"),
                    )
                }
                Text(
                    text = campaign.name,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            BsdcCard(modifier = Modifier.fillMaxWidth()) {
                BsdcBadge(
                    label = statusLabel(campaign.status, bn),
                    tone = statusTone(campaign.status),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = mkText(bn, "Budget left", "বাকি বাজেট"),
                    style = MaterialTheme.typography.labelLarge,
                    color = colors.mutedText,
                )
                Text(
                    text = MkLogic.formatTaka(remaining, bn),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(colors.mutedText.copy(alpha = 0.2f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(fraction)
                            .height(8.dp)
                            .background(colors.brandStrong),
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    text = mkText(
                        bn,
                        "${MkLogic.formatTaka(campaign.spent, bn)} of ${MkLogic.formatTaka(campaign.totalBudget, bn)} spent",
                        "${MkLogic.formatTaka(campaign.spent, bn)} / ${MkLogic.formatTaka(campaign.totalBudget, bn)} খরচ হয়েছে",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.mutedText,
                )
            }
        }

        item {
            BsdcSectionHeader(title = mkText(bn, "Metrics", "পরিসংখ্যান"))
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BsdcMetricTile(
                    label = mkText(bn, "Impressions", "ইমপ্রেশন"),
                    value = digits(campaign.impressions.toString(), bn),
                    icon = Icons.Rounded.Visibility,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = mkText(bn, "Clicks", "ক্লিক"),
                    value = digits(campaign.clicks.toString(), bn),
                    icon = Icons.Rounded.PlayArrow,
                    tone = BsdcTone.INFO,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BsdcMetricTile(
                    label = mkText(bn, "CTR", "সিটিআর"),
                    value = clickRateLabel(campaign.clicks, campaign.impressions, bn),
                    icon = Icons.Rounded.Campaign,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = mkText(bn, "Spent today", "আজ খরচ"),
                    value = MkLogic.formatTaka(campaign.spendToday, bn),
                    icon = Icons.Rounded.Payments,
                    tone = BsdcTone.WARN,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            BsdcCard(modifier = Modifier.fillMaxWidth()) {
                DetailLine(mkText(bn, "Pricing", "মূল্য নির্ধারণ"), pricingLabel)
                DetailLine(
                    mkText(bn, "Bid", "বিড"),
                    "${MkLogic.formatTaka(campaign.bid, bn)} · $pricingLabel",
                )
                DetailLine(
                    mkText(bn, "Total budget", "মোট বাজেট"),
                    MkLogic.formatTaka(campaign.totalBudget, bn),
                )
                DetailLine(
                    mkText(bn, "Daily cap", "দৈনিক সীমা"),
                    if (campaign.dailyBudget > 0) {
                        MkLogic.formatTaka(campaign.dailyBudget, bn)
                    } else {
                        mkText(bn, "No cap", "কোনো সীমা নেই")
                    },
                )
                DetailLine(
                    mkText(bn, "Schedule", "সময়সূচি"),
                    scheduleLabel(campaign.startsAt, campaign.endsAt, bn),
                )
                DetailLine(
                    mkText(bn, "Creatives", "ক্রিয়েটিভ"),
                    digits(campaign.creativeCount.toString(), bn),
                )
            }
        }

        if (campaign.reviewNote.isNotBlank()) {
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Review note", "রিভিউ মন্তব্য"),
                    body = campaign.reviewNote,
                    tone = BsdcTone.WARN,
                )
            }
        }

        if (canToggle) {
            item {
                BsdcButton(
                    label = if (campaign.status == "active") {
                        mkText(bn, "Pause campaign", "ক্যাম্পেইন বিরতি দিন")
                    } else {
                        mkText(bn, "Resume campaign", "ক্যাম্পেইন চালু করুন")
                    },
                    onClick = onTogglePause,
                    enabled = !anyBusy,
                    busy = busy,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = BsdcThemeTokens.colors.mutedText,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f).padding(start = 16.dp),
        )
    }
}

private fun statusLabel(status: String, bn: Boolean): String = when (status) {
    "active" -> mkText(bn, "Live", "চালু")
    "paused" -> mkText(bn, "Paused", "বিরতিতে")
    "pending_review" -> mkText(bn, "In review", "রিভিউ চলছে")
    "rejected" -> mkText(bn, "Rejected", "প্রত্যাখ্যাত")
    else -> mkText(bn, "Draft", "খসড়া")
}

private fun scheduleLabel(startsAt: String?, endsAt: String?, bn: Boolean): String {
    val start = startsAt?.take(10).orEmpty()
    val end = endsAt?.take(10).orEmpty()
    return when {
        start.isEmpty() && end.isEmpty() -> mkText(bn, "Starts on approval", "অনুমোদনের পর শুরু")
        end.isEmpty() -> mkText(bn, "From $start, no end date", "$start থেকে, শেষের তারিখ নেই")
        else -> mkText(bn, "$start to $end", "$start থেকে $end")
    }.let { digits(it, bn) }
}
