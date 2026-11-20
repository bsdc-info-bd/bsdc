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
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
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
            repository.fetchGroupMembers(loaded.id)
                .onSuccess { members = GroupDetailLogic.sortMembers(it, { m -> m.role }, { m -> m.joinedAt }); membersFailed = false }
                .onFailure { membersFailed = true }
        }
        loading = false
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
                                        BsdcButton(
                                            label = if (bn) "ওয়েবে সম্পাদনা করুন" else "Edit on the web",
                                            onClick = { onOpenExternal(GroupDetailLogic.webUrl(current.slug)) },
                                            secondary = true,
                                            leadingIcon = Icons.Rounded.Language,
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
                                    BsdcCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Text(
                                                text = GroupDetailLogic.channelTitle(channel.name),
                                                style = MaterialTheme.typography.titleSmall,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.weight(1f),
                                            )
                                            if (channel.isReadOnly) {
                                                BsdcBadge(label = if (bn) "শুধু পড়া" else "Read only", tone = BsdcTone.NEUTRAL)
                                            }
                                        }
                                        channel.topic?.takeIf { it.isNotBlank() }?.let { topic ->
                                            Text(text = topic, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    val confirmGroup = group
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

}
