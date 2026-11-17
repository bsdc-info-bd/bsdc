package bd.info.bsdc.app.feature.discover

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcDirectorySkeletonCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcHeroBanner
import bd.info.bsdc.app.core.designsystem.BsdcInfoPill
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.launch

/**
 * One freelance gig in full: the brief, the budget and terms, the reader's skills against it,
 * their own proposal and its status, and — for the client who posted it — the proposal
 * manager with the open/pause/close controls.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GigDetailScreen(
    slug: String,
    viewerUid: String?,
    viewerSkills: List<String>,
    repository: DiscoverRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenProfile: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var gig by remember(slug) { mutableStateOf<GigDto?>(null) }
    var loading by remember(slug) { mutableStateOf(true) }
    var failed by remember(slug) { mutableStateOf(false) }
    var reloadNonce by remember(slug) { mutableStateOf(0) }

    var myProposal by remember(slug) { mutableStateOf<GigProposalDto?>(null) }
    var proposals by remember(slug) { mutableStateOf<List<GigProposalDto>>(emptyList()) }
    var proposalsBusy by remember(slug) { mutableStateOf(false) }
    var saved by remember(slug) { mutableStateOf(false) }
    var banner by remember(slug) { mutableStateOf<String?>(null) }
    var bannerTone by remember(slug) { mutableStateOf(BsdcTone.OK) }
    var actionBusy by remember(slug) { mutableStateOf(false) }
    var showProposalSheet by remember(slug) { mutableStateOf(false) }
    var pitch by remember(slug) { mutableStateOf("") }
    var bid by remember(slug) { mutableStateOf("") }
    var days by remember(slug) { mutableStateOf("7") }

    fun showInfo(message: String, tone: BsdcTone = BsdcTone.OK) {
        banner = message
        bannerTone = tone
    }

    LaunchedEffect(slug, viewerUid, reloadNonce) {
        loading = true
        failed = false
        repository.fetchGigDetail(slug)
            .onSuccess { gig = it }
            .onFailure { failed = true }
        loading = false

        val current = gig
        val uid = viewerUid
        if (current != null && !uid.isNullOrBlank()) {
            repository.isOpportunitySaved("gig", current.id).onSuccess { saved = it }
            if (current.clientUid == uid) {
                proposalsBusy = true
                repository.fetchGigProposalsForClient(current.id)
                    .onSuccess { proposals = GigDetailLogic.sortProposalsForClient(it) }
                proposalsBusy = false
            } else {
                repository.fetchMyGigProposal(current.id, uid).onSuccess { myProposal = it }
            }
        }
        repository.recordJobView(current?.id.orEmpty())
    }

    fun share(current: GigDto, budgetLabel: String) {
        val url = GigDetailLogic.webUrl(current.slug)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, current.title)
            putExtra(Intent.EXTRA_TEXT, GigDetailLogic.shareText(current.title, budgetLabel, url))
        }
        context.startActivity(
            Intent.createChooser(intent, if (bn) "গিগ শেয়ার করুন" else "Share gig"),
        )
    }

    fun copyLink(current: GigDto) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        clipboard.setPrimaryClip(
            ClipData.newPlainText("BSDC gig", GigDetailLogic.webUrl(current.slug)),
        )
        showInfo(if (bn) "লিংক কপি হয়েছে।" else "Link copied.")
    }

    fun submit(current: GigDto) {
        val bidValue = bid.trim().toIntOrNull()
        val daysValue = days.trim().toIntOrNull()
        val problems = DiscoverSearchEngine.proposalProblems(pitch, bidValue, daysValue)
        if (problems.isNotEmpty()) {
            showInfo(proposalProblemMessage(problems.first(), bn), BsdcTone.WARN)
            return
        }
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            repository.submitProposal(current.id, pitch, bidValue ?: 0, daysValue ?: 7)
                .onSuccess {
                    showProposalSheet = false
                    pitch = ""
                    reloadNonce += 1
                    showInfo(if (bn) "প্রস্তাব পাঠানো হয়েছে।" else "Proposal submitted.")
                }
                .onFailure { err ->
                    showInfo(
                        err.localizedMessage
                            ?: if (bn) "প্রস্তাব পাঠানো যায়নি।" else "The proposal was not sent.",
                        BsdcTone.BAD,
                    )
                }
            actionBusy = false
        }
    }

    fun withdraw(current: GigDto) {
        val proposal = myProposal ?: return
        val uid = viewerUid ?: return
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            repository.withdrawGigProposal(proposal.id, uid)
                .onSuccess {
                    reloadNonce += 1
                    showInfo(if (bn) "প্রস্তাব প্রত্যাহার করা হয়েছে।" else "Proposal withdrawn.")
                }
                .onFailure { showInfo(if (bn) "প্রত্যাহার ব্যর্থ হয়েছে।" else "Withdrawal failed.", BsdcTone.BAD) }
            actionBusy = false
        }
        // current is part of the signature so the caller reads clearly; nothing else needed.
        check(current.id.isNotEmpty())
    }

    fun moveStatus(current: GigDto, next: String) {
        val uid = viewerUid ?: return
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            repository.updateGigStatus(current.id, uid, next)
                .onSuccess {
                    reloadNonce += 1
                    showInfo(
                        if (bn) "গিগের অবস্থা এখন ${GigDetailLogic.gigStatusLabel(next, true)}।"
                        else "Gig is now ${GigDetailLogic.gigStatusLabel(next, false)}.",
                    )
                }
                .onFailure { showInfo(if (bn) "অবস্থা বদলানো যায়নি।" else "The status was not changed.", BsdcTone.BAD) }
            actionBusy = false
        }
    }

    fun decide(proposal: GigProposalDto, next: String) {
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            repository.decideGigProposal(proposal.id, next)
                .onSuccess {
                    val posted = gig
                    if (posted != null) {
                        repository.fetchGigProposalsForClient(posted.id)
                            .onSuccess { proposals = GigDetailLogic.sortProposalsForClient(it) }
                    }
                    showInfo(
                        if (bn) "প্রস্তাবের অবস্থা হালনাগাদ হয়েছে।" else "Proposal status updated.",
                    )
                }
                .onFailure { showInfo(if (bn) "হালনাগাদ ব্যর্থ হয়েছে।" else "Update failed.", BsdcTone.BAD) }
            actionBusy = false
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = if (bn) "ফিরে যান" else "Back",
                )
            }
            Text(
                text = if (bn) "ফ্রিল্যান্স গিগ" else "Freelance gig",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            val current = gig
            if (current != null) {
                IconButton(onClick = { copyLink(current) }) {
                    Icon(Icons.Rounded.ContentCopy, contentDescription = if (bn) "লিংক কপি" else "Copy link")
                }
                IconButton(onClick = { share(current, DiscoverSearchEngine.formatBudgetShort(current.budgetMin, current.budgetMax, current.currency, bn)) }) {
                    Icon(Icons.Rounded.Share, contentDescription = if (bn) "শেয়ার" else "Share")
                }
                IconButton(
                    onClick = {
                        if (viewerUid.isNullOrBlank()) {
                            onSignInRequired()
                        } else {
                            scope.launch {
                                repository.toggleSavedOpportunity(
                                    kind = "gig",
                                    remoteId = current.id,
                                    slug = current.slug,
                                    title = current.title,
                                    subtitle = DiscoverSearchEngine.formatBudgetShort(current.budgetMin, current.budgetMax, current.currency, bn),
                                    nowMillis = System.currentTimeMillis(),
                                ).onSuccess { nowSaved ->
                                    saved = nowSaved
                                    showInfo(
                                        if (nowSaved) {
                                            if (bn) "গিগ সংরক্ষিত হয়েছে।" else "Gig saved."
                                        } else {
                                            if (bn) "সংরক্ষণ থেকে সরানো হয়েছে।" else "Removed from saved."
                                        },
                                    )
                                }
                            }
                        }
                    },
                ) {
                    Icon(
                        imageVector = if (saved) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                        contentDescription = if (bn) "সংরক্ষণ" else "Save",
                    )
                }
            }
        }

        if (loading) {
            Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator()
                BsdcDirectorySkeletonCard()
                BsdcDirectorySkeletonCard()
            }
            return@Column
        }

        val current = gig
        if (failed || current == null) {
            Box(modifier = Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
                BsdcEmptyState(
                    icon = Icons.Rounded.Work,
                    title = if (bn) "গিগটি পাওয়া যায়নি" else "This gig is not available",
                    subtitle = if (bn) {
                        "লিংকটি ভুল হতে পারে, অথবা গিগটি সরিয়ে নেওয়া হয়েছে।"
                    } else {
                        "The link may be wrong, or the client took the gig down."
                    },
                    actionLabel = if (bn) "ফিরে যান" else "Go back",
                    onAction = onBack,
                )
            }
            return@Column
        }

        val budgetLong = DiscoverSearchEngine.formatBudget(
            current.budgetMin,
            current.budgetMax,
            current.currency,
            current.isHourly,
            current.durationDays,
            bn,
        )
        val isOwner = !viewerUid.isNullOrBlank() && current.clientUid == viewerUid
        val action = GigDetailLogic.action(
            status = current.status,
            isOwner = isOwner,
            signedIn = !viewerUid.isNullOrBlank(),
            myProposalStatus = myProposal?.status,
        )
        val matchPercent = DiscoverSearchEngine.skillMatchPercent(current.skills, viewerSkills)
        val missing = DiscoverSearchEngine.missingSkills(current.skills, viewerSkills)

        BsdcResponsiveContainer(maxWidth = 860.dp, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    BsdcHeroBanner(
                        title = current.title,
                        subtitle = budgetLong,
                        eyebrow = if (bn) "ফ্রিল্যান্স সুযোগ" else "Freelance opportunity",
                        icon = Icons.Rounded.Work,
                        stats = buildList {
                            add((if (bn) "প্রস্তাব" else "Proposals") to BanglaDigitFormatter.formatCount(current.proposalsCount.toLong(), language))
                            val posted = GigDetailLogic.postedAgo(current.publishedAt ?: current.createdAt, System.currentTimeMillis(), bn)
                            if (posted.isNotBlank()) add((if (bn) "প্রকাশিত" else "Posted") to posted)
                        },
                        primaryActionLabel = when (action) {
                            GigDetailLogic.GigAction.PROPOSE -> if (bn) "প্রস্তাব দিন" else "Submit a proposal"
                            GigDetailLogic.GigAction.PROPOSED -> if (bn) "প্রস্তাব দেখুন" else "View your proposal"
                            GigDetailLogic.GigAction.WITHDRAWN -> if (bn) "আবার প্রস্তাব দিন" else "Propose again"
                            GigDetailLogic.GigAction.SIGN_IN -> if (bn) "সাইন ইন করে আবেদন" else "Sign in to apply"
                            GigDetailLogic.GigAction.OWN_GIG -> null
                            GigDetailLogic.GigAction.CLOSED -> null
                        },
                        onPrimaryAction = {
                            when (action) {
                                GigDetailLogic.GigAction.SIGN_IN -> onSignInRequired()
                                GigDetailLogic.GigAction.PROPOSE, GigDetailLogic.GigAction.WITHDRAWN -> {
                                    bid = (current.budgetMin ?: current.budgetMax ?: 0).toString()
                                    days = (current.durationDays ?: 7).coerceAtLeast(1).toString()
                                    pitch = ""
                                    showProposalSheet = true
                                }
                                GigDetailLogic.GigAction.PROPOSED -> myProposal?.let { unit ->
                                    showInfo(
                                        if (bn) {
                                            "আপনার প্রস্তাব: ${GigDetailLogic.proposalStatusLabel(unit.status, true)}"
                                        } else {
                                            "Your proposal: ${GigDetailLogic.proposalStatusLabel(unit.status, false)}"
                                        },
                                        BsdcTone.INFO,
                                    )
                                }
                                else -> Unit
                            }
                        },
                        secondaryActionLabel = if (bn) "প্রোফাইল দেখুন" else "View client",
                        onSecondaryAction = current.clientUid.takeIf { it.isNotBlank() }?.let { uid ->
                            { onOpenProfile(uid) }
                        },
                    )
                }

                if (!banner.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = banner.orEmpty(),
                            body = "",
                            tone = bannerTone,
                        )
                    }
                }

                item {
                    BsdcCard {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            BsdcBadge(
                                label = GigDetailLogic.gigStatusLabel(current.status, bn).uppercase(),
                                tone = if (GigDetailLogic.isAcceptingProposals(current.status)) BsdcTone.OK else BsdcTone.WARN,
                            )
                            BsdcBadge(
                                label = if (current.isHourly) {
                                    if (bn) "ঘণ্টাভিত্তিক" else "HOURLY"
                                } else {
                                    if (bn) "নির্ধারিত মূল্য" else "FIXED PRICE"
                                },
                                tone = BsdcTone.INFO,
                            )
                        }
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            BsdcInfoPill(
                                text = budgetLong,
                                icon = Icons.Rounded.Work,
                                tone = BsdcTone.OK,
                            )
                            current.durationDays?.let { window ->
                                BsdcInfoPill(
                                    text = if (bn) "$window দিনে ডেলিভারি" else "$window-day delivery",
                                    icon = Icons.Rounded.Schedule,
                                    tone = BsdcTone.NEUTRAL,
                                )
                            }
                            BsdcInfoPill(
                                text = if (bn) {
                                    "${BanglaDigitFormatter.formatCount(current.proposalsCount.toLong(), language)} প্রস্তাব"
                                } else {
                                    "${current.proposalsCount} proposal${if (current.proposalsCount == 1) "" else "s"}"
                                },
                                icon = Icons.Rounded.Work,
                                tone = BsdcTone.NEUTRAL,
                            )
                        }
                    }
                }

                if (current.skills.isNotEmpty()) {
                    item {
                        BsdcCard {
                            BsdcSectionHeader(
                                title = if (bn) "প্রয়োজনীয় দক্ষতা" else "Skills wanted",
                                subtitle = if (matchPercent > 0) {
                                    if (bn) {
                                        "$matchPercent% মিলেছে আপনার প্রোফাইলের সাথে"
                                    } else {
                                        "$matchPercent% match with your profile"
                                    }
                                } else {
                                    if (bn) "আপনার প্রোফাইলে দক্ষতা যোগ করুন" else "Add skills to your profile to match"
                                },
                            )
                            if (matchPercent > 0) {
                                LinearProgressIndicator(
                                    progress = { matchPercent / 100f },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                val mine = DiscoverSearchEngine.normaliseSkills(viewerSkills)
                                DiscoverSearchEngine.normaliseSkills(current.skills).forEach { skill ->
                                    val have = mine.contains(skill)
                                    BsdcInfoPill(
                                        text = skill,
                                        tone = if (have) BsdcTone.OK else BsdcTone.NEUTRAL,
                                        icon = if (have) Icons.Rounded.CheckCircle else null,
                                    )
                                }
                            }
                            if (missing.isNotEmpty()) {
                                Text(
                                    text = if (bn) {
                                        "আরও যেটা লাগবে: ${missing.joinToString(", ")}"
                                    } else {
                                        "Also needed: ${missing.joinToString(", ")}"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = BsdcThemeTokens.colors.mutedText,
                                )
                            }
                        }
                    }
                }

                item {
                    BsdcCard {
                        BsdcSectionHeader(title = if (bn) "কাজের বিবরণ" else "The brief")
                        Text(
                            text = current.description.ifBlank {
                                if (bn) "ক্লায়েন্ট এখনো বিস্তারিত লেখেনি।" else "The client has not added a brief yet."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                if (!isOwner) {
                    item {
                        BsdcCard {
                            BsdcSectionHeader(
                                title = if (bn) "আপনার প্রাপ্তি" else "What you would take home",
                                subtitle = if (bn) {
                                    "আজ BSDC কোনো কমিশন কাটে না।"
                                } else {
                                    "BSDC takes no commission today."
                                },
                            )
                            val gross = current.budgetMax ?: current.budgetMin ?: 0
                            val payout = GigDetailLogic.payout(gross)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                PayoutColumn(
                                    label = if (bn) "প্রস্তাবিত মূল্য" else "Your bid",
                                    value = DiscoverSearchEngine.formatBudgetShort(gross, gross, current.currency, bn),
                                    bn = bn,
                                )
                                PayoutColumn(
                                    label = if (bn) "প্ল্যাটফর্ম ফি" else "Platform fee",
                                    value = if (payout.feePercent == 0) {
                                        if (bn) "০%" else "0%"
                                    } else {
                                        "${payout.feePercent}%"
                                    },
                                    bn = bn,
                                )
                                PayoutColumn(
                                    label = if (bn) "আপনি পাবেন" else "You receive",
                                    value = DiscoverSearchEngine.formatBudgetShort(payout.net, payout.net, current.currency, bn),
                                    bn = bn,
                                )
                            }
                        }
                    }
                }

                if (isOwner) {
                    item {
                        BsdcCard {
                            BsdcSectionHeader(
                                title = if (bn) "গিগ নিয়ন্ত্রণ" else "Gig controls",
                                subtitle = if (bn) {
                                    "খোলা থাকলে ফ্রিল্যান্সাররা প্রস্তাব দিতে পারে।"
                                } else {
                                    "Freelancers can only propose while the gig is open."
                                },
                            )
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                DiscoverSearchEngine.gigNextStatuses(current.status).forEach { next ->
                                    val icon = when (next) {
                                        "open" -> Icons.Rounded.PlayArrow
                                        "paused" -> Icons.Rounded.Pause
                                        else -> Icons.Rounded.Block
                                    }
                                    BsdcButton(
                                        label = GigDetailLogic.gigStatusLabel(next, bn),
                                        leadingIcon = icon,
                                        secondary = next != "open",
                                        enabled = !actionBusy,
                                        onClick = { moveStatus(current, next) },
                                    )
                                }
                            }
                        }
                    }
                }

                if (!isOwner && myProposal != null) {
                    item {
                        val mine = myProposal!!
                        BsdcCard {
                            BsdcSectionHeader(
                                title = if (bn) "আপনার প্রস্তাব" else "Your proposal",
                                subtitle = GigDetailLogic.proposalStatusLabel(mine.status, bn),
                            )
                            LinearProgressIndicator(
                                progress = { GigDetailLogic.proposalProgress(mine.status) / 100f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text(text = mine.pitch, style = MaterialTheme.typography.bodyMedium)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                BsdcInfoPill(
                                    text = DiscoverSearchEngine.formatBudgetShort(mine.bidAmount, mine.bidAmount, current.currency, bn),
                                    icon = Icons.Rounded.Work,
                                    tone = BsdcTone.OK,
                                )
                                BsdcInfoPill(
                                    text = if (bn) "${mine.deliveryDays} দিন" else "${mine.deliveryDays} days",
                                    icon = Icons.Rounded.Schedule,
                                )
                            }
                            if (DiscoverSearchEngine.proposalAction(mine.status) == "withdraw") {
                                BsdcButton(
                                    label = if (bn) "প্রস্তাব প্রত্যাহার" else "Withdraw proposal",
                                    secondary = true,
                                    enabled = !actionBusy,
                                    onClick = { withdraw(current) },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }

                if (isOwner) {
                    item {
                        BsdcSectionHeader(
                            title = if (bn) "প্রস্তাবের তালিকা" else "Proposals",
                            subtitle = if (proposals.isEmpty()) {
                                if (bn) "এখনো কোনো প্রস্তাব আসেনি।" else "No proposals yet."
                            } else {
                                if (bn) {
                                    "${proposals.size}টি প্রস্তাব · ${proposals.count { GigDetailLogic.isOpenProposal(it.status) }}টি চলমান"
                                } else {
                                    "${proposals.size} total · ${proposals.count { GigDetailLogic.isOpenProposal(it.status) }} still open"
                                }
                            },
                        )
                    }
                    if (proposalsBusy) {
                        items(2) { BsdcDirectorySkeletonCard() }
                    }
                    items(proposals, key = { it.id }) { proposal ->
                        BsdcCard {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                BsdcAvatar(
                                    avatarUrl = proposal.profiles?.avatarUrl,
                                    displayName = proposal.profiles?.displayName
                                        ?: proposal.profiles?.username
                                        ?: (if (bn) "ফ্রিল্যান্সার" else "Freelancer"),
                                    imageLoader = imageLoader,
                                    size = 42.dp,
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = proposal.profiles?.displayName
                                            ?: proposal.profiles?.username
                                            ?: (if (bn) "ফ্রিল্যান্সার" else "Freelancer"),
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = GigDetailLogic.proposalStatusLabel(proposal.status, bn),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = BsdcThemeTokens.colors.mutedText,
                                    )
                                }
                                BsdcBadge(
                                    label = DiscoverSearchEngine.formatBudgetShort(proposal.bidAmount, proposal.bidAmount, current.currency, bn),
                                    tone = BsdcTone.OK,
                                )
                            }
                            Text(text = proposal.pitch, style = MaterialTheme.typography.bodySmall, maxLines = 4, overflow = TextOverflow.Ellipsis)
                            Text(
                                text = if (bn) "ডেলিভারি: ${proposal.deliveryDays} দিন" else "Delivery: ${proposal.deliveryDays} days",
                                style = MaterialTheme.typography.labelMedium,
                                color = BsdcThemeTokens.colors.mutedText,
                            )
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                proposal.profiles?.uid?.takeIf { it.isNotBlank() }?.let { uid ->
                                    BsdcButton(
                                        label = if (bn) "প্রোফাইল" else "Profile",
                                        secondary = true,
                                        onClick = { onOpenProfile(uid) },
                                    )
                                }
                                if (proposal.status != "shortlisted" && GigDetailLogic.isOpenProposal(proposal.status)) {
                                    BsdcButton(
                                        label = if (bn) "শর্টলিস্ট" else "Shortlist",
                                        secondary = true,
                                        enabled = !actionBusy,
                                        onClick = { decide(proposal, "shortlisted") },
                                    )
                                }
                                if (proposal.status != "hired") {
                                    BsdcButton(
                                        label = if (bn) "নিয়োগ দিন" else "Hire",
                                        enabled = !actionBusy,
                                        onClick = { decide(proposal, "hired") },
                                    )
                                }
                                if (proposal.status != "rejected") {
                                    BsdcButton(
                                        label = if (bn) "বাতিল" else "Decline",
                                        secondary = true,
                                        enabled = !actionBusy,
                                        onClick = { decide(proposal, "rejected") },
                                    )
                                }
                            }
                        }
                    }
                }

                item {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = if (bn) {
                                "সব লেনদেন BSDC-এর নিরাপদ বার্তায় সম্পন্ন করুন।"
                            } else {
                                "Agree terms in a BSDC conversation before you start work."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = BsdcThemeTokens.colors.mutedText,
                        )
                        Spacer(modifier = Modifier.size(4.dp))
                        Text(
                            text = GigDetailLogic.webUrl(current.slug),
                            style = MaterialTheme.typography.labelSmall,
                            color = BsdcThemeTokens.colors.mutedText,
                            modifier = Modifier.clickable { copyLink(current) },
                        )
                    }
                }
            }
        }
    }

    if (showProposalSheet) {
        val current = gig
        AlertDialog(
            onDismissRequest = { showProposalSheet = false },
            title = { Text(if (bn) "প্রস্তাব পাঠান" else "Send a proposal") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val problems = DiscoverSearchEngine.proposalProblems(
                        pitch,
                        bid.trim().toIntOrNull(),
                        days.trim().toIntOrNull(),
                    )
                    OutlinedTextField(
                        value = pitch,
                        onValueChange = { pitch = it },
                        label = {
                            Text(
                                if (bn) {
                                    "কেন আপনি উপযুক্ত (${DiscoverSearchEngine.MIN_PITCH}+ অক্ষর)"
                                } else {
                                    "Why you are a fit (${DiscoverSearchEngine.MIN_PITCH}+ characters)"
                                },
                            )
                        },
                        minLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        text = if (bn) "${pitch.trim().length} অক্ষর" else "${pitch.trim().length} characters",
                        style = MaterialTheme.typography.labelSmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                    OutlinedTextField(
                        value = bid,
                        onValueChange = { bid = it.filter { ch -> ch.isDigit() } },
                        label = { Text(if (bn) "আপনার মূল্য (${current?.currency ?: "BDT"})" else "Your bid (${current?.currency ?: "BDT"})") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = days,
                        onValueChange = { days = it.filter { ch -> ch.isDigit() } },
                        label = { Text(if (bn) "ডেলিভারি (দিন)" else "Delivery days") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    val gross = bid.trim().toIntOrNull() ?: 0
                    val payout = GigDetailLogic.payout(gross)
                    HorizontalDivider()
                    Text(
                        text = if (bn) {
                            "প্ল্যাটফর্ম ফি ${payout.feePercent}% · আপনি পাবেন ${DiscoverSearchEngine.formatBudgetShort(payout.net, payout.net, current?.currency ?: "BDT", true)}"
                        } else {
                            "Platform fee ${payout.feePercent}% · you receive ${DiscoverSearchEngine.formatBudgetShort(payout.net, payout.net, current?.currency ?: "BDT", false)}"
                        },
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (problems.isNotEmpty()) {
                        Text(
                            text = proposalProblemMessage(problems.first(), bn),
                            style = MaterialTheme.typography.bodySmall,
                            color = BsdcThemeTokens.colors.warn,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !actionBusy,
                    onClick = { current?.let { submit(it) } },
                ) { Text(if (bn) "পাঠান" else "Send") }
            },
            dismissButton = {
                TextButton(onClick = { showProposalSheet = false }) { Text(if (bn) "বাতিল" else "Cancel") }
            },
        )
    }
}

@Composable
private fun PayoutColumn(label: String, value: String, bn: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
    }
    check(bn || !bn)
}

/** One translated sentence per stable problem code from `DiscoverSearchEngine.proposalProblems`. */
internal fun proposalProblemMessage(code: String, bn: Boolean): String = when (code) {
    "pitch_short" -> if (bn) {
        "প্রস্তাবটি কমপক্ষে ${DiscoverSearchEngine.MIN_PITCH} অক্ষরের হতে হবে।"
    } else {
        "The pitch needs at least ${DiscoverSearchEngine.MIN_PITCH} characters."
    }
    "bid_invalid" -> if (bn) "মূল্য একটি বৈধ সংখ্যা হতে হবে।" else "Enter a valid bid amount."
    "days_invalid" -> if (bn) "ডেলিভারি সময় কমপক্ষে ১ দিন হতে হবে।" else "Delivery must be at least one day."
    "days_too_long" -> if (bn) {
        "ডেলিভারি সময় ${DiscoverSearchEngine.MAX_DELIVERY_DAYS} দিনের বেশি হতে পারে না।"
    } else {
        "Delivery cannot exceed ${DiscoverSearchEngine.MAX_DELIVERY_DAYS} days."
    }
    else -> if (bn) "তথ্যগুলো আবার দেখুন।" else "Please check the details."
}
