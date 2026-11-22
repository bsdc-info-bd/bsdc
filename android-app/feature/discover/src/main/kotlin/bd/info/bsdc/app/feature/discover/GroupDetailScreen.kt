package bd.info.bsdc.app.feature.discover

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.saveable.rememberSaveable
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
import bd.info.bsdc.app.core.designsystem.BsdcConfirmDialog
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.launch

/** A group page: identity, the viewer's standing and join action, channels, and members. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GroupDetailScreen(
    slug: String,
    viewerUid: String?,
    repository: DiscoverRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    /**
     * Opens the composer aimed at one of this group's channels.
     *
     * Defaulted to nothing so a host that has no create surface still renders the page — but the
     * button below is only shown when the caller can actually take the member somewhere, because a
     * control that does nothing is the one UI sin a member never forgives.
     */
    onWriteInChannel: (channelId: String, channelName: String) -> Unit = { _, _ -> },
    canWriteInChannels: Boolean = false,
    /**
     * Opens one room's timeline, in-app.
     *
     * The card is the link, as it is on the website — `CommunityChannelsSection` makes the channel name
     * an `<a>` to `/g/{group}/c/{channel}`, so a tap on the row is not an app-side invention. It is
     * opt-in (`canOpenChannels`) rather than always-on for the same reason the write button is: a host
     * without a channel screen to go to must not be left with a card that swallows taps.
     */
    onOpenChannel: (channelSlug: String) -> Unit = {},
    canOpenChannels: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var group by remember(slug) { mutableStateOf<GroupDetailDto?>(null) }
    var viewer by remember(slug) { mutableStateOf(GroupViewerState(null, null)) }
    var channels by remember(slug) { mutableStateOf<List<GroupChannelDto>>(emptyList()) }
    var members by remember(slug) { mutableStateOf<List<GroupMemberDto>>(emptyList()) }
    var membersFailed by remember(slug) { mutableStateOf(false) }
    var pendingDelete by remember(slug) { mutableStateOf(false) }
    var ownerBusy by remember(slug) { mutableStateOf(false) }
    var ownerError by remember(slug) { mutableStateOf<String?>(null) }
    var loading by remember(slug) { mutableStateOf(true) }
    var failed by remember(slug) { mutableStateOf(false) }
    var reloadNonce by remember(slug) { mutableStateOf(0) }
    var busy by remember(slug) { mutableStateOf(false) }
    var notice by remember(slug) { mutableStateOf<Pair<String, BsdcTone>?>(null) }
    var tab by remember(slug) { mutableStateOf(GroupTab.CHANNELS) }
    var memberQuery by rememberSaveable(slug) { mutableStateOf("") }
    var channelSaving by remember(slug) { mutableStateOf(false) }
    var showAddChannel by remember(slug) { mutableStateOf(false) }
    var editingChannelId by remember(slug) { mutableStateOf<String?>(null) }
    var channelCounts by remember(slug) { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var showEditSheet by remember(slug) { mutableStateOf(false) }
    var editSaving by remember(slug) { mutableStateOf(false) }
    var editError by remember(slug) { mutableStateOf<String?>(null) }

    LaunchedEffect(slug, viewerUid, reloadNonce) {
        loading = true
        failed = false
        val loaded = repository.fetchGroupBySlug(slug)
            .onFailure { failed = true }
            .getOrNull()
        group = loaded
        if (loaded != null) {
            val uid = viewerUid
            viewer = if (uid.isNullOrBlank()) {
                GroupViewerState(null, null)
            } else {
                repository.fetchGroupViewer(loaded.id, uid).getOrDefault(GroupViewerState(null, null))
            }
            channels = repository.fetchGroupChannels(loaded.id).getOrDefault(emptyList())
            channelCounts = repository.channelPostCounts(loaded.id).getOrDefault(emptyMap())
            repository.fetchGroupMembers(loaded.id)
                .onSuccess { members = GroupDetailLogic.sortMembers(it, { m -> m.role }, { m -> m.joinedAt }); membersFailed = false }
                .onFailure { membersFailed = true }
        }
        loading = false
    }

    /**
     * Writes the group edit sheet's payload.
     *
     * The reload is a `reloadNonce` bump rather than a poke at local state: `update_group` normalises
     * what it is given — it trims, and it refuses a name that is too short — so the page must show the
     * row the database kept, not the text that happened to be typed.
     */
    fun saveGroupEdit(payload: GroupEditPayload) {
        val current = group ?: return
        if (editSaving) return
        editSaving = true
        editError = null
        scope.launch {
            repository.updateGroup(
                groupId = current.id,
                name = payload.name,
                description = payload.description,
                rules = payload.rules,
                privacy = payload.privacy,
                language = payload.language,
                avatarUrl = payload.avatarUrl,
                coverUrl = payload.coverUrl,
            ).onSuccess {
                showEditSheet = false
                notice = (if (bn) "গ্রুপ হালনাগাদ হয়েছে" else "Group updated") to BsdcTone.OK
                reloadNonce++
            }.onFailure { err ->
                editError = GroupEditLogic.editFailureMessage(err, bn)
            }
            editSaving = false
        }
    }

    fun deleteGroup(current: GroupDetailDto) {
        if (ownerBusy) return
        ownerBusy = true
        scope.launch {
            repository.deleteGroup(current.id)
                .onSuccess {
                    pendingDelete = false
                    onBack()
                }
                .onFailure { ownerError = ownerFailureMessage(it, bn) }
            ownerBusy = false
        }
    }

    fun runAction(current: GroupDetailDto, action: GroupJoinAction) {
        if (busy) return
        if (action == GroupJoinAction.CLOSED && viewerUid.isNullOrBlank()) {
            onSignInRequired()
            return
        }
        busy = true
        notice = null
        scope.launch {
            val result = if (action == GroupJoinAction.OPEN) {
                repository.leaveGroup(current.id).map { if (bn) "আপনি গ্রুপ ছেড়েছেন।" else "You left the group." }
            } else {
                repository.joinGroup(current.id).map { status ->
                    when {
                        status == "approved" && bn -> "আপনি যোগ দিয়েছেন।"
                        status == "approved" -> "You joined the group."
                        bn -> "যোগদানের অনুরোধ পাঠানো হয়েছে।"
                        else -> "Your request was sent."
                    }
                }
            }
            result
                .onSuccess { message ->
                    notice = message to BsdcTone.OK
                    reloadNonce += 1
                }
                .onFailure { err ->
                    notice = (err.localizedMessage ?: if (bn) "অনুরোধটি সম্পন্ন হয়নি।" else "That did not work.") to BsdcTone.BAD
                }
            busy = false
        }
    }

    /** Runs a channel-management action, reloading the group's channels after. */
    fun runChannelAction(action: suspend () -> Result<Unit>, onDone: () -> Unit = {}) {
        if (channelSaving) return
        channelSaving = true
        scope.launch {
            action()
                .onSuccess {
                    reloadNonce += 1
                    onDone()
                }
                .onFailure {
                    notice = (it.localizedMessage ?: if (bn) "অনুরোধটি সম্পন্ন হয়নি।" else "That did not work.") to BsdcTone.BAD
                }
            channelSaving = false
        }
    }

    fun share(current: GroupDetailDto) {
        val url = GroupDetailLogic.webUrl(current.slug)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, current.name)
            putExtra(Intent.EXTRA_TEXT, GroupDetailLogic.shareText(current.name, url))
        }
        context.startActivity(Intent.createChooser(intent, if (bn) "গ্রুপ শেয়ার করুন" else "Share group"))
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
                text = group?.name ?: (if (bn) "গ্রুপ" else "Group"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }

        val current = group
        when {
            loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }

            failed -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                BsdcEmptyState(
                    icon = Icons.Rounded.Groups,
                    title = if (bn) "গ্রুপ লোড করা যায়নি" else "Group could not be loaded",
                    subtitle = if (bn) "সংযোগ দেখে আবার চেষ্টা করুন।" else "Check your connection and try again.",
                    modifier = Modifier.padding(16.dp),
                    actionLabel = if (bn) "আবার চেষ্টা করুন" else "Try again",
                    onAction = { reloadNonce += 1 },
                )
            }

            current == null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                BsdcEmptyState(
                    icon = Icons.Rounded.Groups,
                    title = if (bn) "গ্রুপ পাওয়া যায়নি" else "Group not found",
                    subtitle = if (bn) "এটি সরানো হয়ে থাকতে পারে, বা আপনি দেখতে পারবেন না।" else "It may have been removed, or it is not visible to you.",
                    modifier = Modifier.padding(16.dp),
                    actionLabel = if (bn) "ফিরে যান" else "Go back",
                    onAction = onBack,
                )
            }

            else -> {
                val action = GroupDetailLogic.joinAction(current.privacy, viewer.role, viewer.requestStatus, !viewerUid.isNullOrBlank())
                val memberCount = BanglaDigitFormatter.formatCount(current.membersCount.toLong(), language)
                val postCount = BanglaDigitFormatter.formatCount(current.postsCount.toLong(), language)
                val privacyLabel = when (current.privacy) {
                    "private" -> if (bn) "ব্যক্তিগত" else "Private"
                    "secret" -> if (bn) "গোপন" else "Secret"
                    else -> if (bn) "সর্বজনীন" else "Public"
                }
                val roleLabel = viewer.role?.let { role ->
                    when (role) {
                        "owner" -> if (bn) "মালিক" else "Owner"
                        "admin" -> if (bn) "অ্যাডমিন" else "Admin"
                        "moderator" -> if (bn) "মডারেটর" else "Moderator"
                        else -> if (bn) "সদস্য" else "Member"
                    }
                }
                val cover = current.coverUrl.orEmpty()
                val visibleMembers = GroupDetailLogic.searchMembers(
                    members,
                    memberQuery,
                    nameOf = { it.profile().displayName },
                    handleOf = { it.profile().username },
                )
                val visibleMembersLabel = BanglaDigitFormatter.formatCount(visibleMembers.size.toLong(), language)
                val totalMemberLabel = BanglaDigitFormatter.formatCount(current.membersCount.toLong(), language)

                BsdcResponsiveContainer(modifier = Modifier.fillMaxSize()) {
                    LazyColumn(
                        contentPadding = PaddingValues(bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth()) {
                                if (cover.isNotBlank()) {
                                    BsdcImgbbImage(
                                        fullUrl = cover,
                                        thumbUrl = cover,
                                        contentDescription = current.name,
                                        imageLoader = imageLoader,
                                        modifier = Modifier.fillMaxWidth().height(160.dp),
                                        targetWidthPx = 960,
                                        cornerRadiusDp = 0,
                                    )
                                } else {
                                    Box(
                                        modifier = Modifier.fillMaxWidth().height(120.dp).background(BsdcThemeTokens.colors.brandSoft),
                                    )
                                }
                            }
                        }

                        item {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.Bottom,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    BsdcAvatar(
                                        avatarUrl = current.avatarUrl,
                                        displayName = current.name,
                                        imageLoader = imageLoader,
                                        size = 72.dp,
                                        borderWidth = 3.dp,
                                        modifier = Modifier.offset(y = (-24).dp),
                                    )
                                    Text(
                                        text = current.name,
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.weight(1f).padding(bottom = 4.dp),
                                    )
                                }
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    BsdcBadge(
                                        label = privacyLabel,
                                        tone = BsdcTone.INFO,
                                    )
                                    if (roleLabel != null) BsdcBadge(label = roleLabel, tone = BsdcTone.OK)
                                    if (current.isArchived) {
                                        BsdcBadge(label = if (bn) "আর্কাইভ" else "Archived", tone = BsdcTone.WARN)
                                    }
                                }
                                Text(
                                    text = if (bn) "$memberCount সদস্য • $postCount পোস্ট" else "$memberCount members • $postCount posts",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                val about = current.description.orEmpty().trim()
                                if (about.isNotBlank()) {
                                    Text(text = about, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }

                        notice?.let { (message, tone) ->
                            item {
                                BsdcStatusBanner(
                                    title = message,
                                    body = "",
                                    tone = tone,
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                )
                            }
                        }

                        item {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(horizontal = 16.dp),
                            ) {
                                when (action) {
                                    GroupJoinAction.JOIN -> BsdcButton(
                                        label = if (bn) "যোগ দিন" else "Join group",
                                        onClick = { runAction(current, action) },
                                        busy = busy,
                                    )
                                    GroupJoinAction.REQUEST -> BsdcButton(
                                        label = if (bn) "যোগদানের অনুরোধ" else "Request to join",
                                        onClick = { runAction(current, action) },
                                        busy = busy,
                                    )
                                    GroupJoinAction.PENDING -> BsdcButton(
                                        label = if (bn) "অনুরোধ অপেক্ষমান" else "Request pending",
                                        onClick = {},
                                        enabled = false,
                                    )
                                    GroupJoinAction.OPEN -> BsdcButton(
                                        label = if (bn) "গ্রুপ ছাড়ুন" else "Leave group",
                                        onClick = { runAction(current, action) },
                                        busy = busy,
                                        secondary = true,
                                    )
                                    GroupJoinAction.CLOSED -> Text(
                                        text = if (bn) "এই গ্রুপটি আমন্ত্রণ-ভিত্তিক।" else "This group is invite-only.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                BsdcButton(
                                    label = if (bn) "শেয়ার" else "Share",
                                    onClick = { share(current) },
                                    secondary = true,
                                    leadingIcon = Icons.Rounded.Share,
                                )
                                BsdcButton(
                                    label = if (bn) "ওয়েবে খুলুন" else "Open on web",
                                    onClick = { onOpenExternal(GroupDetailLogic.webUrl(current.slug)) },
                                    secondary = true,
                                    leadingIcon = Icons.Rounded.Language,
                                )
                            }
                        }

                        // A moderator may correct the group; only its owner may delete
                        // it, and `OwnerActionsLogic` is where that difference lives so
                        // the app and the website cannot disagree about it.
                        val groupControls = OwnerActionsLogic.groupControls(viewer.role, isStaff = false)
                        if (groupControls.any) {
                            item {
                                BsdcCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                                    BsdcSectionHeader(
                                        title = if (bn) "আপনার গ্রুপ" else "Your group",
                                        subtitle = if (groupControls.canDelete) {
                                            if (bn) "গ্রুপের তথ্য ঠিক করুন বা গ্রুপটি মুছে ফেলুন।" else "Correct the group, or remove it."
                                        } else {
                                            if (bn) "গ্রুপের তথ্য ঠিক করুন।" else "Correct the group."
                                        },
                                    )
                                    if (!ownerError.isNullOrBlank()) {
                                        BsdcStatusBanner(
                                            title = ownerError.orEmpty(),
                                            body = "",
                                            tone = BsdcTone.WARN,
                                        )
                                    }
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        // This used to read "Edit on the web" — an honest signpost, and
                                        // the gap itself: `update_group` has been callable from here the
                                        // whole time.
                                        BsdcButton(
                                            label = if (bn) "গ্রুপ সম্পাদনা" else "Edit group",
                                            onClick = {
                                                editError = null
                                                showEditSheet = true
                                            },
                                            secondary = true,
                                            leadingIcon = Icons.Rounded.Edit,
                                        )
                                        if (groupControls.canDelete) {
                                            BsdcButton(
                                                label = if (bn) "গ্রুপ মুছুন" else "Delete group",
                                                onClick = { pendingDelete = true },
                                                secondary = true,
                                                busy = ownerBusy,
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        val rules = current.rules.orEmpty().trim()
                        if (rules.isNotBlank()) {
                            item {
                                BsdcCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                                    BsdcSectionHeader(title = if (bn) "নিয়মাবলি" else "Rules")
                                    Text(text = rules, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                                }
                            }
                        }

                        item {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.padding(horizontal = 16.dp),
                            ) {
                                BsdcFilterPill(
                                    label = if (bn) "চ্যানেল" else "Channels",
                                    selected = tab == GroupTab.CHANNELS,
                                    onClick = { tab = GroupTab.CHANNELS },
                                    leadingIcon = Icons.Rounded.ChatBubbleOutline,
                                    countLabel = channels.size.toString(),
                                )
                                BsdcFilterPill(
                                    label = if (bn) "সদস্য" else "Members",
                                    selected = tab == GroupTab.MEMBERS,
                                    onClick = { tab = GroupTab.MEMBERS },
                                    leadingIcon = Icons.Rounded.Groups,
                                    countLabel = current.membersCount.toString(),
                                )
                            }
                        }

                        when (tab) {
                            GroupTab.CHANNELS -> {
                                val canModerate = GroupDetailLogic.canModerate(viewer.role)
                                if (canModerate) {
                                    item {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 16.dp, vertical = 4.dp),
                                        ) {
                                            Text(
                                                text = if (bn) "চ্যানেল যোগ করুন" else "Add channel",
                                                style = MaterialTheme.typography.labelLarge,
                                                color = MaterialTheme.colorScheme.primary,
                                                modifier = Modifier
                                                    .clickable(enabled = !channelSaving) { showAddChannel = true }
                                                    .padding(vertical = 4.dp),
                                            )
                                        }
                                    }
                                }
                                if (channels.isEmpty()) {
                                    item {
                                        BsdcEmptyState(
                                            icon = Icons.Rounded.ChatBubbleOutline,
                                            title = if (bn) "এখনও কোনো চ্যানেল নেই" else "No channels yet",
                                            subtitle = if (bn) "গ্রুপের অ্যাডমিন চ্যানেল যোগ করতে পারেন।" else "Admins can add channels for topics.",
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                        )
                                    }
                                }
                                items(channels, key = { it.id }) { channel ->
                                    // A room that appears, disappears or moves is a change the member
                                    // just caused, so it is shown as movement rather than as a repaint.
                                    BsdcCard(
                                        modifier = Modifier
                                            .animateItem()
                                            .padding(horizontal = 16.dp)
                                            .then(
                                                if (canOpenChannels && channel.slug.isNotBlank()) {
                                                    Modifier.clickable { onOpenChannel(channel.slug) }
                                                } else {
                                                    Modifier
                                                },
                                            ),
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text(
                                                text = GroupDetailLogic.channelTitle(channel.name),
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (canOpenChannels && channel.slug.isNotBlank()) {
                                                    MaterialTheme.colorScheme.primary
                                                } else {
                                                    MaterialTheme.colorScheme.onSurface
                                                },
                                                modifier = Modifier.weight(1f),
                                            )
                                            val count = channelCounts[channel.id] ?: 0
                                            // The count is the proof the room is alive. Before
                                            // `channel_post_counts` there was nothing to put here, and
                                            // a channel card with no number read as a broken feature
                                            // rather than as an empty room, which is a real difference.
                                            BsdcBadge(
                                                label = GroupDetailLogic.postCountLabel(
                                                    formattedCount = BanglaDigitFormatter.formatCount(count.toLong(), language),
                                                    count = count,
                                                    bn = bn,
                                                ),
                                                tone = if (count == 0) BsdcTone.NEUTRAL else BsdcTone.OK,
                                            )
                                            if (channel.isReadOnly) {
                                                BsdcBadge(label = if (bn) "শুধু পড়া" else "Read only", tone = BsdcTone.NEUTRAL)
                                            }
                                            // A glyph was the obvious cue here, and the one this line
                                            // first asked for does not exist: RTL-flipped chevron
                                            // support arrived in material-icons-extended as
                                            // `ChevronLeft` under `Icons.AutoMirrored`, not as a
                                            // `ChevronRight`, and the compiler named it in three
                                            // minutes. Rather than import a symbol no other screen in
                                            // this app uses, the room's own name carries the affordance:
                                            // tappable is coloured like a link, not tappable is plain
                                            // text. Nothing to translate, nothing to mirror.
                                        }
                                        channel.topic?.takeIf { it.isNotBlank() }?.let { topic ->
                                            Text(text = topic, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        if (canWriteInChannels && !channel.isReadOnly) {
                                            BsdcButton(
                                                label = if (bn) "এখানে লিখুন" else "Write here",
                                                onClick = { onWriteInChannel(channel.id, channel.name) },
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(top = 8.dp),
                                            )
                                        }
                                        if (canModerate) {
                                            ChannelRowControls(
                                                channel = channel,
                                                index = channels.indexOf(channel),
                                                total = channels.size,
                                                saving = channelSaving,
                                                editing = editingChannelId == channel.id,
                                                onStartEdit = { editingChannelId = channel.id },
                                                onCancelEdit = { editingChannelId = null },
                                                onRename = { name, topic ->
                                                    runChannelAction({ repository.updateChannel(channel.id, name, topic) }) {
                                                        editingChannelId = null
                                                    }
                                                },
                                                onMove = { position ->
                                                    runChannelAction({ repository.updateChannel(channel.id, position = position) })
                                                },
                                                onToggleReadOnly = {
                                                    runChannelAction({
                                                        if (channel.isReadOnly) repository.openChannel(channel.id) else repository.closeChannel(channel.id)
                                                    })
                                                },
                                                bn = bn,
                                            )
                                        }
                                    }
                                }
                            }

                            GroupTab.MEMBERS -> {
                                if (membersFailed) {
                                    item {
                                        BsdcStatusBanner(
                                            title = if (bn) "সদস্য তালিকা লোড করা যায়নি" else "Members could not be loaded",
                                            body = if (bn) "পরে আবার চেষ্টা করুন।" else "Try again later.",
                                            tone = BsdcTone.WARN,
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                        )
                                    }
                                }
                                item {
                                    OutlinedTextField(
                                        value = memberQuery,
                                        onValueChange = { memberQuery = it },
                                        label = { Text(if (bn) "সদস্য খুঁজুন" else "Search members") },
                                        singleLine = true,
                                        leadingIcon = {
                                            Icon(Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                                        },
                                        trailingIcon = {
                                            if (memberQuery.isNotEmpty()) {
                                                IconButton(onClick = { memberQuery = "" }) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.Close,
                                                        contentDescription = if (bn) "মুছে ফেলুন" else "Clear",
                                                        modifier = Modifier.size(18.dp),
                                                    )
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                                    )
                                }
                                if (members.isNotEmpty() && visibleMembers.isEmpty()) {
                                    item {
                                        BsdcEmptyState(
                                            icon = Icons.Rounded.Groups,
                                            title = if (bn) "কোনো সদস্য মেলেনি" else "No member matches",
                                            subtitle = if (bn) "অন্য নামে খুঁজুন।" else "Try another name or @handle.",
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                            actionLabel = if (bn) "খোঁজ মুছুন" else "Clear search",
                                            onAction = { memberQuery = "" },
                                        )
                                    }
                                } else if (members.isNotEmpty()) {
                                    item {
                                        Text(
                                            text = if (bn) "$totalMemberLabel সদস্যের মধ্যে $visibleMembersLabel জন" else "$visibleMembersLabel of $totalMemberLabel",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                        )
                                    }
                                }
                                items(visibleMembers, key = { it.uid }) { member ->
                                    val profile = member.profile()
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 16.dp)
                                            .clickable(enabled = profile.username.isNotBlank()) { onOpenProfile(profile.username) },
                                    ) {
                                        BsdcAvatar(
                                            avatarUrl = profile.avatarUrl,
                                            displayName = profile.displayName,
                                            imageLoader = imageLoader,
                                            size = 40.dp,
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(text = profile.displayName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                            if (profile.username.isNotBlank()) {
                                                Text(
                                                    text = "@${profile.username}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                        val label = when (member.role) {
                                            "owner" -> if (bn) "মালিক" else "Owner"
                                            "admin" -> if (bn) "অ্যাডমিন" else "Admin"
                                            "moderator" -> if (bn) "মডারেটর" else "Moderator"
                                            else -> null
                                        }
                                        label?.let { BsdcBadge(label = it, tone = BsdcTone.OK) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    val confirmGroup = group
    group?.let { current ->
        MkGroupEditSheet(
            visible = showEditSheet,
            group = current,
            bn = bn,
            saving = editSaving,
            errorMessage = editError,
            onDismiss = { if (!editSaving) showEditSheet = false },
            onSave = { payload -> saveGroupEdit(payload) },
        )
    }

    if (confirmGroup != null && pendingDelete) {
        BsdcConfirmDialog(
            visible = true,
            title = if (bn) "এই গ্রুপটি মুছবেন?" else "Delete this group?",
            message = OwnerActionsLogic.deleteMessage(OwnerActionsLogic.DeleteMessage.GROUP, 0, bn),
            confirmLabel = if (bn) "মুছুন" else "Delete",
            cancelLabel = if (bn) "বাতিল" else "Cancel",
            onConfirm = { deleteGroup(confirmGroup) },
            onDismiss = { pendingDelete = false },
            busy = ownerBusy,
            destructive = true,
        )
    }

    val addGroup = group
    if (addGroup != null && showAddChannel) {
        AddChannelDialog(
            visible = true,
            saving = channelSaving,
            onDismiss = { showAddChannel = false },
            onCreate = { slug, name, topic ->
                runChannelAction({ repository.createChannel(addGroup.id, slug, name, topic) }) {
                    showAddChannel = false
                }
            },
            bn = bn,
        )
    }
}

/**
 * One channel's row controls: rename, move up or down, and close or open.
 * The rename is committed with a single `update_channel` call.
 */
@Composable
private fun ChannelRowControls(
    channel: GroupChannelDto,
    index: Int,
    total: Int,
    saving: Boolean,
    editing: Boolean,
    onStartEdit: () -> Unit,
    onCancelEdit: () -> Unit,
    onRename: (name: String, topic: String) -> Unit,
    onMove: (position: Int) -> Unit,
    onToggleReadOnly: () -> Unit,
    bn: Boolean,
) {
    if (editing) {
        var name by remember { mutableStateOf(channel.name) }
        var topic by remember { mutableStateOf(channel.topic.orEmpty()) }
        Column(modifier = Modifier.padding(top = 8.dp)) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(if (bn) "নাম" else "Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = topic,
                onValueChange = { topic = it },
                label = { Text(if (bn) "টপিক" else "Topic") },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.padding(top = 4.dp)) {
                BsdcButton(
                    onClick = onCancelEdit,
                    enabled = !saving,
                    secondary = true,
                    label = if (bn) "বাতিল" else "Cancel",
                )
                BsdcButton(
                    onClick = { onRename(name.trim(), topic.trim()) },
                    enabled = !saving,
                    label = if (bn) "সংরক্ষণ" else "Save",
                )
            }
        }
    } else {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(top = 4.dp),
        ) {
            BsdcButton(
                onClick = onStartEdit,
                enabled = !saving,
                secondary = true,
                label = if (bn) "নাম পরিবর্তন" else "Rename",
            )
            BsdcButton(
                onClick = { onMove(channel.position - 1) },
                enabled = !saving && index > 0,
                secondary = true,
                label = "↑",
            )
            BsdcButton(
                onClick = { onMove(channel.position + 1) },
                enabled = !saving && index < total - 1,
                secondary = true,
                label = "↓",
            )
            BsdcButton(
                onClick = onToggleReadOnly,
                enabled = !saving,
                secondary = true,
                label = if (channel.isReadOnly) (if (bn) "খুলুন" else "Open") else (if (bn) "বন্ধ করুন" else "Close"),
            )
        }
    }
}

/** The dialog that builds a new channel through the 0130 routine. */
@Composable
private fun AddChannelDialog(
    visible: Boolean,
    saving: Boolean,
    onDismiss: () -> Unit,
    onCreate: (slug: String, name: String, topic: String) -> Unit,
    bn: Boolean,
) {
    var slug by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var topic by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(if (bn) "নতুন চ্যানেল" else "New channel") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = slug,
                    onValueChange = { slug = it },
                    label = { Text(if (bn) "ঠিকানা" else "Address") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(if (bn) "নাম" else "Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = topic,
                    onValueChange = { topic = it },
                    label = { Text(if (bn) "টপিক" else "Topic") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            BsdcButton(
                onClick = { onCreate(slug.trim(), name.trim(), topic.trim()) },
                enabled = !saving && name.isNotBlank(),
                busy = saving,
                label = if (bn) "তৈরি করুন" else "Create",
            )
        },
        dismissButton = {
            BsdcButton(
                onClick = onDismiss,
                enabled = !saving,
                secondary = true,
                label = if (bn) "বাতিল" else "Cancel",
            )
        },
    )
}

private enum class GroupTab { CHANNELS, MEMBERS }

private data class MemberView(val username: String, val displayName: String, val avatarUrl: String?)

private fun GroupMemberDto.profile(): MemberView {
    val name = profiles?.displayName?.takeIf { it.isNotBlank() } ?: profiles?.username.orEmpty()
    return MemberView(
        username = profiles?.username.orEmpty(),
        displayName = name.ifBlank { "•" },
        avatarUrl = profiles?.avatarUrl,
    )
}
