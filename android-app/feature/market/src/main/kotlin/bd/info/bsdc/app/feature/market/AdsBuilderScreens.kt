package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.launch

/** Campaign form, shown in place of the dashboard. Saving makes a draft; payment comes next. */
@Composable
fun AdsCampaignBuilderScreen(
    repository: AdsRepository,
    bn: Boolean,
    onCreated: (campaignId: String, budgetPoisha: Long) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(AdsDraft()) }
    var errors by remember { mutableStateOf<Set<String>>(emptySet()) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    fun update(transform: (AdsDraft) -> AdsDraft) {
        draft = transform(draft)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onCancel) {
                Icon(
                    Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = mkText(bn, "Back", "ফিরে যান"),
                )
            }
            Text(
                text = mkText(bn, "Build your campaign", "আপনার ক্যাম্পেইন তৈরি করুন"),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            text = mkText(
                bn,
                "Fill in every part of the campaign. Saving makes a draft. Then pay the budget by bKash, and the campaign goes to review once staff approve your payment.",
                "ক্যাম্পেইনের প্রতিটি অংশ পূরণ করুন। সংরক্ষণ করলে খসড়া হবে। তারপর bKash-এ বাজেট পাঠান; স্টাফ পেমেন্ট অনুমোদন করলে ক্যাম্পেইন রিভিউতে যাবে।",
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = BsdcThemeTokens.colors.mutedText,
        )

        BsdcSectionHeader(title = mkText(bn, "Campaign", "ক্যাম্পেইন"))
        BuilderField(
            value = draft.name,
            onValueChange = { value -> update { it.copy(name = value) } },
            label = mkText(bn, "Campaign name", "ক্যাম্পেইনের নাম"),
            error = errorFor("name", errors, bn),
        )
        ChoiceRow(
            options = AdsBuilderLogic.PRICINGS.map { it to pricingLabel(it, bn) },
            selected = draft.pricing,
            onSelect = { value -> update { it.copy(pricing = value) } },
        )
        BuilderField(
            value = draft.bidTaka,
            onValueChange = { value -> update { it.copy(bidTaka = value) } },
            label = mkText(bn, "Bid (৳)", "বিড (৳)"),
            hint = mkText(bn, "The most you will pay for one click or 1,000 views. At least ৳1.", "এক ক্লিক বা ১,০০০ ভিউয়ের জন্য সর্বোচ্চ যা দেবেন। কমপক্ষে ৳১।"),
            error = errorFor("bid", errors, bn),
            keyboardType = KeyboardType.Decimal,
        )

        BsdcSectionHeader(title = mkText(bn, "Budget and schedule", "বাজেট ও সময়সূচি"))
        BuilderField(
            value = draft.budgetTaka,
            onValueChange = { value -> update { it.copy(budgetTaka = value) } },
            label = mkText(bn, "Total budget (৳)", "মোট বাজেট (৳)"),
            hint = mkText(bn, "Between ৳100 and ৳100,000. This is the amount you send by bKash.", "৳১০০ থেকে ৳১,০০,০০০-এর মধ্যে। এটাই bKash-এ পাঠানোর অঙ্ক।"),
            error = errorFor("budget", errors, bn),
            keyboardType = KeyboardType.Decimal,
        )
        BuilderField(
            value = draft.dailyCapTaka,
            onValueChange = { value -> update { it.copy(dailyCapTaka = value) } },
            label = mkText(bn, "Daily cap (৳, optional)", "দৈনিক সীমা (৳, ঐচ্ছিক)"),
            hint = mkText(bn, "Leave empty for no daily cap. Otherwise at least ৳10.", "সীমা না চাইলে খালি রাখুন। না হলে কমপক্ষে ৳১০।"),
            error = errorFor("dailyCap", errors, bn),
            keyboardType = KeyboardType.Decimal,
        )
        BuilderField(
            value = draft.startsOn,
            onValueChange = { value -> update { it.copy(startsOn = value.trim()) } },
            label = mkText(bn, "Start date (optional, yyyy-MM-dd)", "শুরুর তারিখ (ঐচ্ছিক, yyyy-MM-dd)"),
            hint = mkText(bn, "Leave empty to start as soon as the campaign is approved.", "খালি রাখলে অনুমোদনের পরই শুরু হবে।"),
            error = errorFor("schedule", errors, bn),
        )
        BuilderField(
            value = draft.endsOn,
            onValueChange = { value -> update { it.copy(endsOn = value.trim()) } },
            label = mkText(bn, "End date (optional, yyyy-MM-dd)", "শেষের তারিখ (ঐচ্ছিক, yyyy-MM-dd)"),
        )
        ChoiceRow(
            options = AdsBuilderLogic.LANGUAGES.map { it to languageLabel(it, bn) },
            selected = draft.language,
            onSelect = { value -> update { it.copy(language = value) } },
        )

        BsdcSectionHeader(title = mkText(bn, "The ad people will see", "যে বিজ্ঞাপনটি দেখানো হবে"))
        ChoiceRow(
            options = AdsBuilderLogic.PLACEMENTS.map { it to placementLabel(it, bn) },
            selected = draft.placement,
            onSelect = { value -> update { it.copy(placement = value) } },
        )
        Text(
            text = mkText(bn, "Show on", "যেখানে দেখাবে"),
            style = MaterialTheme.typography.titleSmall,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AdsBuilderLogic.PLATFORMS.forEach { platform ->
                val on = platform in draft.platforms
                FilterChip(
                    selected = on,
                    onClick = {
                        update {
                            it.copy(
                                platforms = if (on) it.platforms - platform else it.platforms + platform,
                            )
                        }
                    },
                    label = { Text(platformLabel(platform, bn)) },
                )
            }
        }
        errorFor("platforms", errors, bn)?.let { message ->
            Text(text = message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        BuilderField(
            value = draft.headline,
            onValueChange = { value -> update { it.copy(headline = value) } },
            label = mkText(bn, "Headline", "শিরোনাম"),
            error = errorFor("headline", errors, bn),
        )
        BuilderField(
            value = draft.body,
            onValueChange = { value -> update { it.copy(body = value) } },
            label = mkText(bn, "Body text (optional)", "মূল লেখা (ঐচ্ছিক)"),
            hint = mkText(bn, "Up to 200 characters.", "২০০ অক্ষর পর্যন্ত।"),
            error = errorFor("body", errors, bn),
            singleLine = false,
        )
        BuilderField(
            value = draft.ctaLabel,
            onValueChange = { value -> update { it.copy(ctaLabel = value) } },
            label = mkText(bn, "Button label (optional)", "বাটনের লেখা (ঐচ্ছিক)"),
            error = errorFor("cta", errors, bn),
        )
        BuilderField(
            value = draft.targetUrl,
            onValueChange = { value -> update { it.copy(targetUrl = value.trim()) } },
            label = mkText(bn, "Destination link (https://)", "গন্তব্যের লিংক (https://)"),
            error = errorFor("targetUrl", errors, bn),
            keyboardType = KeyboardType.Uri,
        )
        BuilderField(
            value = draft.imageUrl,
            onValueChange = { value -> update { it.copy(imageUrl = value.trim()) } },
            label = mkText(bn, "Image link (optional)", "ছবির লিংক (ঐচ্ছিক)"),
            hint = mkText(bn, "Images must be hosted on ImgBB.", "ছবি অবশ্যই ImgBB-তে থাকতে হবে।"),
            error = errorFor("imageUrl", errors, bn),
            keyboardType = KeyboardType.Uri,
        )

        if (failed) {
            BsdcStatusBanner(
                title = mkText(bn, "The campaign was not saved", "ক্যাম্পেইন সংরক্ষণ হয়নি"),
                body = mkText(bn, "Check the details and try again.", "তথ্য দেখে আবার চেষ্টা করুন।"),
                tone = BsdcTone.BAD,
            )
        }

        Spacer(Modifier.height(4.dp))
        BsdcButton(
            label = if (busy) {
                mkText(bn, "Saving…", "সংরক্ষণ হচ্ছে…")
            } else {
                mkText(bn, "Save campaign", "ক্যাম্পেইন সংরক্ষণ করুন")
            },
            onClick = {
                val found = AdsBuilderLogic.validate(draft, LocalDate.now(ZoneId.of("Asia/Dhaka")).toEpochDay())
                errors = found
                if (found.isEmpty() && !busy) {
                    busy = true
                    failed = false
                    val payload = AdsBuilderLogic.toPayload(draft, Instant.now().toString())
                    val budget = MkLogic.parseTakaToPoisha(draft.budgetTaka) ?: 0L
                    scope.launch {
                        repository.createCampaign(payload)
                            .onSuccess { id ->
                                busy = false
                                onCreated(id, budget)
                            }
                            .onFailure {
                                busy = false
                                failed = true
                            }
                    }
                }
            },
            enabled = !busy,
            busy = busy,
            modifier = Modifier.fillMaxWidth(),
        )
        BsdcButton(
            label = mkText(bn, "Cancel", "বাতিল"),
            onClick = onCancel,
            secondary = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(24.dp))
    }
}

/**
 * Pay the budget the way a vendor pays for credits: send it by bKash to the BSDC
 * number, then report the sender, account name and transaction ID. Staff approve
 * the transaction before the wallet is credited.
 */
@Composable
fun AdsPaymentScreen(
    repository: AdsRepository,
    campaignId: String,
    budgetPoisha: Long,
    latest: AdPaymentRequestDto?,
    bn: Boolean,
    onDone: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var instructions by remember { mutableStateOf<AdPaymentInstructionsDto?>(null) }
    var loadFailed by remember { mutableStateOf(false) }
    var sender by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var txn by remember { mutableStateOf("") }
    var showErrors by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(campaignId) {
        repository.fetchPaymentInstructions()
            .onSuccess { instructions = it }
            .onFailure { loadFailed = true }
    }

    val senderBad = !MkLogic.isBdMobile(sender)
    val accountBad = account.trim().length !in 2..80
    val txnBad = !MkLogic.isTxnId(txn)
    val waiting = latest?.status == "pending"
    val amount = MkLogic.formatTaka(budgetPoisha, bn)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = mkText(bn, "Back", "ফিরে যান"),
                )
            }
            Text(
                text = mkText(bn, "Pay the budget by bKash", "bKash-এ বাজেট পাঠান"),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            text = mkText(
                bn,
                "Send $amount from bKash to the BSDC number below. Add any cash-out charge yourself, then report the payment here.",
                "bKash থেকে নিচের BSDC নম্বরে $amount পাঠান। ক্যাশ-আউট চার্জ আপনাকেই যোগ করতে হবে। তারপর এখানে পেমেন্টের তথ্য দিন।",
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = BsdcThemeTokens.colors.mutedText,
        )

        BsdcCard(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = mkText(bn, "BSDC bKash number", "BSDC bKash নম্বর"),
                style = MaterialTheme.typography.labelLarge,
                color = BsdcThemeTokens.colors.mutedText,
            )
            val number = instructions?.bikashNumber
            if (number != null) {
                Text(
                    text = number,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Text(
                    text = if (loadFailed) {
                        mkText(bn, "The payment number could not be loaded. Reopen this screen to try again.", "পেমেন্ট নম্বর লোড করা যায়নি। এই পর্দাটি আবার খুলুন।")
                    } else {
                        mkText(bn, "Loading the payment number…", "পেমেন্ট নম্বর লোড হচ্ছে…")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = mkText(bn, "Amount to send: $amount", "যে পরিমাণ পাঠাবেন: $amount"),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
        }

        if (latest?.status == "rejected") {
            BsdcStatusBanner(
                title = mkText(bn, "Payment not accepted", "পেমেন্ট গ্রহণ করা হয়নি"),
                body = mkText(bn, "Reason: ${latest?.reviewNote.orEmpty()}. Report a corrected payment below.", "কারণ: ${latest?.reviewNote.orEmpty()}। নিচে সঠিক পেমেন্টের তথ্য দিন।"),
                tone = BsdcTone.BAD,
            )
        }
        if (waiting) {
            BsdcStatusBanner(
                title = mkText(bn, "Payment waiting for review", "পেমেন্ট যাচাইয়ের অপেক্ষায়"),
                body = mkText(bn, "We received transaction ${latest?.txnId.orEmpty()}. You will be notified when it is approved.", "ট্রানজেকশন ${latest?.txnId.orEmpty()} পেয়েছি। অনুমোদন হলে জানানো হবে।"),
                tone = BsdcTone.INFO,
            )
        } else {
            BsdcSectionHeader(title = mkText(bn, "Your payment", "আপনার পেমেন্ট"))
            BuilderField(
                value = sender,
                onValueChange = { sender = it },
                label = mkText(bn, "Your bKash number", "আপনার bKash নম্বর"),
                hint = mkText(bn, "The number you sent the money from.", "যে নম্বর থেকে টাকা পাঠিয়েছেন।"),
                error = if (showErrors && senderBad) mkText(bn, "Enter the Bangladeshi mobile number you paid from.", "যে বাংলাদেশি মোবাইল নম্বর থেকে টাকা পাঠিয়েছেন তা দিন।") else null,
                keyboardType = KeyboardType.Phone,
            )
            BuilderField(
                value = account,
                onValueChange = { account = it },
                label = mkText(bn, "Account holder name", "অ্যাকাউন্টধারীর নাম"),
                error = if (showErrors && accountBad) mkText(bn, "Enter the name as it appears on bKash.", "bKash-এ যেভাবে আছে সেই নাম দিন।") else null,
            )
            BuilderField(
                value = txn,
                onValueChange = { txn = it },
                label = mkText(bn, "bKash transaction ID", "bKash ট্রানজেকশন আইডি"),
                error = if (showErrors && txnBad) mkText(bn, "Enter the bKash transaction ID.", "bKash ট্রানজেকশন আইডি দিন।") else null,
            )
            if (failed) {
                BsdcStatusBanner(
                    title = mkText(bn, "The payment was not sent", "পেমেন্টের তথ্য পাঠানো যায়নি"),
                    body = mkText(bn, "Check the details and try again.", "তথ্য দেখে আবার চেষ্টা করুন।"),
                    tone = BsdcTone.BAD,
                )
            }
            BsdcButton(
                label = mkText(bn, "Send payment for review", "পেমেন্ট রিভিউয়ের জন্য পাঠান"),
                onClick = {
                    showErrors = true
                    val ready = !senderBad && !accountBad && !txnBad && instructions?.bikashNumber != null
                    if (ready && !busy) {
                        busy = true
                        failed = false
                        scope.launch {
                            repository.submitPayment(
                                campaignId = campaignId,
                                sender = MkLogic.normaliseBdMobile(sender),
                                account = account,
                                txn = txn,
                            )
                                .onSuccess {
                                    busy = false
                                    onDone()
                                }
                                .onFailure {
                                    busy = false
                                    failed = true
                                }
                        }
                    }
                },
                enabled = !busy,
                busy = busy,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** A campaign's payment status and the next step, shown on each draft. */
@Composable
fun AdsDraftFundingRow(
    latest: AdPaymentRequestDto?,
    bn: Boolean,
    sendBusy: Boolean,
    onPay: () -> Unit,
    onSend: () -> Unit,
) {
    when (latest?.status) {
        "approved" -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BsdcBadge(label = mkText(bn, "Funded", "তহবিল আছে"), tone = BsdcTone.OK)
            BsdcButton(
                label = mkText(bn, "Send for review", "রিভিউয়ের জন্য পাঠান"),
                onClick = onSend,
                busy = sendBusy,
                enabled = !sendBusy,
            )
        }
        "pending" -> Row(verticalAlignment = Alignment.CenterVertically) {
            BsdcBadge(label = mkText(bn, "Payment checking", "পেমেন্ট যাচাই হচ্ছে"), tone = BsdcTone.INFO)
        }
        else -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BsdcBadge(
                label = if (latest?.status == "rejected") {
                    mkText(bn, "Payment declined", "পেমেন্ট প্রত্যাখ্যাত")
                } else {
                    mkText(bn, "Needs payment", "পেমেন্ট বাকি")
                },
                tone = if (latest?.status == "rejected") BsdcTone.BAD else BsdcTone.WARN,
            )
            BsdcButton(
                label = mkText(bn, "Pay by bKash", "bKash-এ পেমেন্ট"),
                onClick = onPay,
                secondary = true,
            )
        }
    }
}

@Composable
private fun BuilderField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    error: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        isError = error != null,
        supportingText = if (error != null || hint != null) {
            { Text(error ?: hint.orEmpty()) }
        } else {
            null
        },
        singleLine = singleLine,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun ChoiceRow(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (key, label) ->
            FilterChip(
                selected = key == selected,
                onClick = { onSelect(key) },
                label = { Text(label) },
            )
        }
    }
}

private fun errorFor(key: String, errors: Set<String>, bn: Boolean): String? {
    if (key !in errors) return null
    return when (key) {
        "name" -> mkText(bn, "Use between 3 and 80 characters.", "৩ থেকে ৮০ অক্ষরের মধ্যে লিখুন।")
        "bid" -> mkText(bn, "Enter a bid of at least ৳1 and at most ৳10,000.", "কমপক্ষে ৳১ ও সর্বোচ্চ ৳১০,০০০ দিন।")
        "budget" -> mkText(bn, "Enter a budget between ৳100 and ৳100,000.", "৳১০০ থেকে ৳১,০০,০০০-এর মধ্যে বাজেট দিন।")
        "dailyCap" -> mkText(bn, "Enter at least ৳10, no more than the budget, or leave it empty.", "কমপক্ষে ৳১০, বাজেটের বেশি নয়, অথবা খালি রাখুন।")
        "schedule" -> mkText(bn, "Use dates like 2026-12-01. The end must come after the start and within a year.", "2026-12-01-এর মতো তারিখ দিন। শেষ তারিখ শুরুর পরে ও এক বছরের মধ্যে হতে হবে।")
        "platforms" -> mkText(bn, "Choose at least one platform.", "অন্তত একটি প্ল্যাটফর্ম বেছে নিন।")
        "headline" -> mkText(bn, "Use between 3 and 80 characters.", "৩ থেকে ৮০ অক্ষরের মধ্যে লিখুন।")
        "body" -> mkText(bn, "Keep the body text to 200 characters.", "মূল লেখা ২০০ অক্ষরের মধ্যে রাখুন।")
        "cta" -> mkText(bn, "Keep the button label to 32 characters.", "বাটনের লেখা ৩২ অক্ষরের মধ্যে রাখুন।")
        "targetUrl" -> mkText(bn, "Use a full https:// address.", "পূর্ণ https:// ঠিকানা দিন।")
        "imageUrl" -> mkText(bn, "Images must come from ImgBB, as an https:// link.", "ছবি ImgBB থেকে https:// লিংক হিসেবে দিতে হবে।")
        else -> mkText(bn, "Check this field.", "এই ঘরটি দেখুন।")
    }
}

private fun pricingLabel(key: String, bn: Boolean): String = when (key) {
    "cpm" -> mkText(bn, "Per 1,000 views", "প্রতি ১,০০০ ভিউতে")
    else -> mkText(bn, "Per click", "প্রতি ক্লিকে")
}

private fun placementLabel(key: String, bn: Boolean): String = when (key) {
    "sidebar" -> mkText(bn, "Sidebar", "সাইডবার")
    "shop" -> mkText(bn, "Marketplace", "মার্কেটপ্লেস")
    "search" -> mkText(bn, "Search results", "সার্চ ফলাফল")
    "article" -> mkText(bn, "Articles", "প্রবন্ধ")
    else -> mkText(bn, "Home feed", "হোম ফিড")
}

private fun languageLabel(key: String, bn: Boolean): String = when (key) {
    "bn" -> mkText(bn, "Bangla", "বাংলা")
    "en" -> mkText(bn, "English", "ইংরেজি")
    else -> mkText(bn, "Any language", "যেকোনো ভাষা")
}

private fun platformLabel(key: String, bn: Boolean): String = when (key) {
    "android" -> mkText(bn, "Android app", "অ্যান্ড্রয়েড অ্যাপ")
    else -> mkText(bn, "Website", "ওয়েবসাইট")
}
