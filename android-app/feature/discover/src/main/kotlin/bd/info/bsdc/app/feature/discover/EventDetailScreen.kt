package bd.info.bsdc.app.feature.discover

import android.content.Intent
import android.provider.CalendarContract
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import bd.info.bsdc.app.core.designsystem.BsdcInfoPill
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.launch

/** One event in full: when and where, the reader's RSVP, the calendar entry, and the join link for attendees. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventDetailScreen(
    slug: String,
    viewerUid: String?,
    repository: DiscoverRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenExternal: (String) -> Unit,
    mediaRepository: BsdcMediaRepository? = null,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var event by remember(slug) { mutableStateOf<EventDetailDto?>(null) }
    var loading by remember(slug) { mutableStateOf(true) }
    var failed by remember(slug) { mutableStateOf(false) }
    var reloadNonce by remember(slug) { mutableStateOf(0) }
    // The viewer's role in the group that organised the event, when there is one; the
    // host and that group's moderators are the people the routines admit.
    var groupRole by remember(slug) { mutableStateOf<String?>(null) }
    var pendingCancel by remember(slug) { mutableStateOf(false) }
    var pendingDelete by remember(slug) { mutableStateOf(false) }
    var ownerBusy by remember(slug) { mutableStateOf(false) }
    var rsvpBusy by remember(slug) { mutableStateOf(false) }
    var showEditSheet by remember(slug) { mutableStateOf(false) }
    var editSaving by remember(slug) { mutableStateOf(false) }
    var editError by remember(slug) { mutableStateOf<String?>(null) }
    var actionError by remember(slug) { mutableStateOf<String?>(null) }
    // The countdown has to move on its own while the page is open, so it ticks once a minute.
    var clockMillis by remember(slug) { mutableStateOf(System.currentTimeMillis()) }

    LaunchedEffect(slug) {
        while (true) {
            clockMillis = System.currentTimeMillis()
            kotlinx.coroutines.delay(60_000L)
        }
    }

    LaunchedEffect(slug, viewerUid, reloadNonce) {
        loading = true
        failed = false
        repository.fetchEventDetail(slug)
            .onSuccess { loaded ->
                event = loaded
                // Only asked when the event belongs to a group and somebody is signed in;
                // `group_members` answers for a member and stays silent for everybody else.
                val groupId = loaded?.groupId
                val uid = viewerUid
                groupRole = if (!groupId.isNullOrBlank() && !uid.isNullOrBlank()) {
                    repository.fetchGroupRole(groupId, uid).getOrNull()
                } else {
                    null
                }
            }
            .onFailure { failed = true }
        loading = false
    }

    /**
     * Writes the event editor's payload, then reloads the page.
     *
     * The nonce bump is the whole point: `update_event` clamps the title, keeps the row's own slug, and
     * refuses a capacity below the number of people already going, so the page must show what the routine
     * kept. It is also the moment the attendees were notified — the banner says as much, because a host
     * who moved an event should know that the notification went out and not infer it later.
     */
    fun saveEventEdit(payload: EventEditPayload) {
        val current = event ?: return
        if (editSaving) return
        editSaving = true
        editError = null
        scope.launch {
            repository.updateEvent(
                eventId = current.id,
                title = payload.title,
                description = payload.description,
                startsAt = payload.startsAt,
                endsAt = payload.endsAt,
                mode = payload.mode,
                venue = payload.venue,
                city = payload.city,
                joinUrl = payload.joinUrl,
                coverUrl = payload.coverUrl,
                timezone = payload.timezone,
                capacity = payload.capacity,
            ).onSuccess {
                showEditSheet = false
                actionError = null
                reloadNonce += 1
            }.onFailure { error ->
                editError = EventEditLogic.editFailureMessage(error, bn)
            }
            editSaving = false
        }
    }

    fun cancelEvent(current: EventDetailDto) {
        if (ownerBusy) return
        ownerBusy = true
        scope.launch {
            repository.cancelEvent(current.id)
                .onSuccess {
                    pendingCancel = false
                    reloadNonce += 1
                }
                .onFailure { actionError = ownerFailureMessage(it, bn) }
            ownerBusy = false
        }
    }

    fun deleteEvent(current: EventDetailDto) {
        if (ownerBusy) return
        ownerBusy = true
        scope.launch {
            repository.deleteEvent(current.id)
                .onSuccess {
                    pendingDelete = false
                    onBack()
                }
                .onFailure { actionError = ownerFailureMessage(it, bn) }
            ownerBusy = false
        }
    }

    fun rsvp(current: EventDetailDto, choice: String) {
        if (viewerUid.isNullOrBlank()) {
            onSignInRequired()
            return
        }
        if (rsvpBusy) return
        rsvpBusy = true
        actionError = null
        scope.launch {
            repository.rsvpEvent(current.id, choice)
                .onSuccess { goingCount ->
                    event = current.copy(myStatus = choice, goingCount = goingCount)
                }
                .onFailure { err ->
                    actionError = err.localizedMessage
                        ?: if (bn) "আপনার RSVP সংরক্ষণ হয়নি।" else "Your RSVP was not saved."
                }
            rsvpBusy = false
        }
    }

    fun addToCalendar(current: EventDetailDto) {
        val window = EventDetailLogic.calendarWindow(current.startsAt, current.endsAt) ?: return
        val place = listOfNotNull(current.venue, current.city)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(", ")
        val intent = Intent(Intent.ACTION_INSERT).apply {
            data = CalendarContract.Events.CONTENT_URI
            putExtra(CalendarContract.Events.TITLE, current.title)
            putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, window.first)
            putExtra(CalendarContract.EXTRA_EVENT_END_TIME, window.second)
            putExtra(CalendarContract.Events.EVENT_LOCATION, place)
            putExtra(CalendarContract.Events.DESCRIPTION, EventDetailLogic.webUrl(current.slug))
            putExtra(CalendarContract.Events.EVENT_TIMEZONE, EventDetailLogic.zoneFor(current.timezone).id)
        }
        runCatching { context.startActivity(intent) }
            .onFailure {
                actionError = if (bn) "ক্যালেন্ডার অ্যাপ পাওয়া যায়নি।" else "No calendar app was found."
            }
    }

    fun shareEvent(current: EventDetailDto) {
        val url = EventDetailLogic.webUrl(current.slug)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, current.title)
            putExtra(Intent.EXTRA_TEXT, EventDetailLogic.shareText(current.title, url))
        }
        context.startActivity(Intent.createChooser(intent, if (bn) "ইভেন্ট শেয়ার করুন" else "Share event"))
    }

    val current = event

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
                text = current?.title ?: (if (bn) "ইভেন্ট" else "Event"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                loading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

                failed -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    BsdcEmptyState(
                        icon = Icons.Rounded.Event,
                        title = if (bn) "ইভেন্ট লোড করা যায়নি" else "Event could not be loaded",
                        subtitle = if (bn) "সংযোগ দেখে আবার চেষ্টা করুন।" else "Check your connection and try again.",
                        modifier = Modifier.padding(16.dp),
                        actionLabel = if (bn) "আবার চেষ্টা করুন" else "Try again",
                        onAction = { reloadNonce += 1 },
                    )
                }

                current == null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    BsdcEmptyState(
                        icon = Icons.Rounded.Event,
                        title = if (bn) "ইভেন্ট পাওয়া যায়নি" else "Event not found",
                        subtitle = if (bn) "এটি সরানো হয়ে থাকতে পারে।" else "It may have been removed.",
                        modifier = Modifier.padding(16.dp),
                        actionLabel = if (bn) "ফিরে যান" else "Go back",
                        onAction = onBack,
                    )
                }

                else -> {
                    val nowMillis = System.currentTimeMillis()
                    val cancelled = current.isCancelled
                    val ended = EventDetailLogic.hasEnded(current.endsAt, nowMillis)
                    val live = EventDetailLogic.isHappeningNow(current.startsAt, current.endsAt, nowMillis)
                    val signedIn = !viewerUid.isNullOrBlank()
                    val full = EventDetailLogic.isFull(current.capacity, current.goingCount, current.myStatus)
                    val rsvpOpen = EventDetailLogic.canRsvp(signedIn, cancelled, ended)
                    val joinLink = DiscoverSearchEngine.safeHttpUrlOrEmpty(current.joinUrl.orEmpty())
                    val whenLine = EventDetailLogic.formatWhen(current.startsAt, current.endsAt, current.timezone, bn)
                    val placeLine = listOfNotNull(current.venue, current.city)
                        .map { it.trim() }
                        .filter { it.isNotEmpty() }
                        .joinToString(", ")
                    val canCalendar = EventDetailLogic.calendarWindow(current.startsAt, current.endsAt) != null
                    val goingLabel = BanglaDigitFormatter.formatCount(current.goingCount.toLong(), language)
                    val countdown = EventDetailLogic.startCountdown(
                        startsAt = current.startsAt,
                        endsAt = current.endsAt,
                        nowMillis = clockMillis,
                        bn = bn,
                    )
                    val seats = EventDetailLogic.seatsLeft(current.capacity, current.goingCount)
                    val seatsLabel = seats?.let {
                        BanglaDigitFormatter.formatCount(it.toLong(), language)
                    }
                    val cover = current.coverUrl.orEmpty()
                    val description = current.description.orEmpty()

                    BsdcResponsiveContainer(modifier = Modifier.fillMaxSize()) {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            val eventControls = OwnerActionsLogic.eventControls(
                                isHost = !viewerUid.isNullOrBlank() && current.hostUid == viewerUid,
                                groupRole = groupRole,
                                isCancelled = current.isCancelled,
                                isStaff = false,
                            )
                            if (eventControls.any) {
                                item {
                                    BsdcCard {
                                        BsdcSectionHeader(
                                            title = if (bn) "আপনার ইভেন্ট" else "Your event",
                                            subtitle = if (bn) {
                                                "ইভেন্টের তথ্য ঠিক করুন, বাতিল করুন, বা মুছে ফেলুন।"
                                            } else {
                                                "Correct the details, cancel it, or remove it."
                                            },
                                        )
                                        FlowRow(
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            verticalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            if (eventControls.canEdit) {
                                                // This used to send the host to a browser to reach
                                                // `update_event`, which this screen could already call.
                                                // The subtitle repeats the one consequence a host cannot
                                                // undo: a moved date tells everyone who said they were coming.
                                                BsdcButton(
                                                    label = if (bn) "ইভেন্ট সম্পাদনা" else "Edit event",
                                                    onClick = {
                                                        editError = null
                                                        showEditSheet = true
                                                    },
                                                    secondary = true,
                                                    enabled = !ownerBusy && !editSaving,
                                                    leadingIcon = Icons.Rounded.Edit,
                                                )
                                            }
                                            if (eventControls.canClose) {
                                                BsdcButton(
                                                    label = if (bn) "বাতিল করুন" else "Cancel event",
                                                    onClick = { pendingCancel = true },
                                                    secondary = true,
                                                    busy = ownerBusy,
                                                )
                                            }
                                            if (eventControls.canDelete) {
                                                BsdcButton(
                                                    label = if (bn) "মুছুন" else "Delete event",
                                                    onClick = { pendingDelete = true },
                                                    secondary = true,
                                                    enabled = !ownerBusy,
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                            item {
                                // The cover carries the one fact a reader needs before they RSVP:
                                // how long they have left. It floats over the image so the page
                                // does not spend a whole row on a status line.
                                Box(modifier = Modifier.fillMaxWidth()) {
                                    if (cover.isNotBlank()) {
                                        BsdcImgbbImage(
                                            fullUrl = cover,
                                            thumbUrl = cover,
                                            contentDescription = current.title,
                                            imageLoader = imageLoader,
                                            modifier = Modifier.fillMaxWidth().height(200.dp),
                                            targetWidthPx = 960,
                                            cornerRadiusDp = 16,
                                        )
                                    } else {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(140.dp)
                                                .background(BsdcThemeTokens.colors.brandSoft),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.Event,
                                                contentDescription = null,
                                                tint = BsdcThemeTokens.colors.brandStrong,
                                                modifier = Modifier.size(44.dp),
                                            )
                                        }
                                    }
                                    val heroPill = when {
                                        live -> if (bn) "এখন চলছে" else "Happening now"
                                        countdown.isNotBlank() -> countdown
                                        whenLine.isNotBlank() -> whenLine
                                        else -> ""
                                    }
                                    if (heroPill.isNotBlank()) {
                                        BsdcInfoPill(
                                            text = heroPill,
                                            icon = if (live) Icons.Rounded.Event else Icons.Rounded.Schedule,
                                            tone = if (live) BsdcTone.OK else BsdcTone.INFO,
                                            modifier = Modifier
                                                .align(Alignment.BottomStart)
                                                .padding(12.dp),
                                        )
                                    }
                                    if (seats != null && seats in 1..10) {
                                        BsdcInfoPill(
                                            text = if (bn) "মাত্র $seatsLabel আসন বাকি" else "Only $seatsLabel seats left",
                                            tone = BsdcTone.WARN,
                                            modifier = Modifier
                                                .align(Alignment.BottomEnd)
                                                .padding(12.dp),
                                        )
                                    }
                                }
                            }

                            item {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        BsdcBadge(label = current.mode.uppercase(), tone = BsdcTone.INFO)
                                        BsdcBadge(
                                            label = if (bn) "$goingLabel যাচ্ছেন" else "$goingLabel going",
                                            tone = BsdcTone.OK,
                                        )
                                        if (full && !cancelled && !ended) {
                                            BsdcBadge(label = if (bn) "পূর্ণ" else "Full", tone = BsdcTone.WARN)
                                        }
                                        if (cancelled) {
                                            BsdcBadge(label = if (bn) "বাতিল" else "Cancelled", tone = BsdcTone.BAD)
                                        }
                                    }
                                    Text(
                                        text = current.title,
                                        style = MaterialTheme.typography.headlineSmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    if (whenLine.isNotBlank()) {
                                        Text(text = whenLine, style = MaterialTheme.typography.bodyLarge)
                                    }
                                    if (placeLine.isNotBlank()) {
                                        Text(
                                            text = placeLine,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }

                            if (cancelled) {
                                item {
                                    BsdcStatusBanner(
                                        title = if (bn) "এই ইভেন্ট বাতিল করা হয়েছে" else "This event was cancelled",
                                        body = if (bn) "নতুন RSVP নেওয়া হচ্ছে না।" else "New RSVPs are closed.",
                                        tone = BsdcTone.BAD,
                                    )
                                }
                            } else if (ended) {
                                item {
                                    BsdcStatusBanner(
                                        title = if (bn) "ইভেন্টটি শেষ হয়েছে" else "This event has ended",
                                        body = if (bn) "নতুন RSVP নেওয়া হচ্ছে না।" else "New RSVPs are closed.",
                                        tone = BsdcTone.WARN,
                                    )
                                }
                            } else if (full) {
                                item {
                                    BsdcStatusBanner(
                                        title = if (bn) "ইভেন্ট পূর্ণ" else "This event is full",
                                        body = if (bn) "নতুন অংশগ্রহণকারী নেওয়া হচ্ছে না।" else "No more people can join.",
                                        tone = BsdcTone.WARN,
                                    )
                                }
                            }

                            if (seats != null && !cancelled) {
                                item {
                                    BsdcCard {
                                        BsdcSectionHeader(
                                            title = if (bn) "আসন" else "Seats",
                                            subtitle = if (seats == 0) {
                                                if (bn) "সব আসন পূর্ণ" else "Every seat is taken"
                                            } else if (bn) {
                                                "$seatsLabel আসন বাকি"
                                            } else {
                                                "$seatsLabel seats left"
                                            },
                                        )
                                        Spacer(Modifier.height(8.dp))
                                        val capacity = current.capacity ?: 0
                                        val filled = (current.goingCount.toFloat() / capacity.toFloat())
                                            .coerceIn(0f, 1f)
                                        LinearProgressIndicator(
                                            progress = { filled },
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                    }
                                }
                            }

                            item {
                                BsdcCard {
                                    BsdcSectionHeader(title = if (bn) "আপনি কি যাচ্ছেন?" else "Are you going?")
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.padding(top = 8.dp),
                                    ) {
                                        if (!signedIn) {
                                            BsdcButton(
                                                label = if (bn) "RSVP করতে সাইন ইন করুন" else "Sign in to RSVP",
                                                onClick = onSignInRequired,
                                                secondary = true,
                                            )
                                        } else {
                                            val choices = listOf(
                                                "going" to (if (bn) "যাচ্ছি" else "Going"),
                                                "interested" to (if (bn) "আগ্রহী" else "Interested"),
                                                "declined" to (if (bn) "যেতে পারব না" else "Can't go"),
                                            )
                                            choices.forEach { (choice, label) ->
                                                val blockedByCapacity =
                                                    choice == "going" && full && current.myStatus != "going"
                                                BsdcButton(
                                                    label = label,
                                                    onClick = { rsvp(current, choice) },
                                                    enabled = rsvpOpen && !rsvpBusy && !blockedByCapacity,
                                                    secondary = current.myStatus != choice,
                                                )
                                            }
                                        }
                                    }
                                    actionError?.let { message ->
                                        Text(
                                            text = message,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.error,
                                            modifier = Modifier.padding(top = 8.dp),
                                        )
                                    }
                                }
                            }

                            item {
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    if (current.myStatus == "going" && joinLink.isNotBlank()) {
                                        BsdcButton(
                                            label = if (bn) "অনলাইনে যোগ দিন" else "Join online",
                                            onClick = { onOpenExternal(joinLink) },
                                            leadingIcon = Icons.Rounded.Language,
                                        )
                                    }
                                    if (canCalendar) {
                                        BsdcButton(
                                            label = if (bn) "ক্যালেন্ডারে যোগ করুন" else "Add to calendar",
                                            onClick = { addToCalendar(current) },
                                            secondary = true,
                                            leadingIcon = Icons.Rounded.Event,
                                        )
                                    }
                                    BsdcButton(
                                        label = if (bn) "শেয়ার" else "Share",
                                        onClick = { shareEvent(current) },
                                        secondary = true,
                                        leadingIcon = Icons.Rounded.Share,
                                    )
                                }
                            }

                            if (description.isNotBlank()) {
                                item {
                                    BsdcCard {
                                        BsdcSectionHeader(title = if (bn) "বিবরণ" else "About")
                                        Text(
                                            text = description,
                                            style = MaterialTheme.typography.bodyMedium,
                                            modifier = Modifier.padding(top = 8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    event?.let { current ->
        MkEventEditSheet(
            visible = showEditSheet,
            event = current,
            bn = bn,
            saving = editSaving,
            errorMessage = editError.orEmpty(),
            imageLoader = imageLoader,
            mediaRepository = mediaRepository,
            onDismiss = { if (!editSaving) showEditSheet = false },
            onSave = { payload -> saveEventEdit(payload) },
        )
    }

    val confirmEvent = event
    if (confirmEvent != null && pendingCancel) {
        BsdcConfirmDialog(
            visible = true,
            title = if (bn) "ইভেন্টটি বাতিল করবেন?" else "Cancel this event?",
            message = OwnerActionsLogic.closeMessage(OwnerActionsLogic.DeleteMessage.EVENT, bn),
            confirmLabel = if (bn) "বাতিল করুন" else "Cancel it",
            cancelLabel = if (bn) "রাখুন" else "Keep it",
            onConfirm = { cancelEvent(confirmEvent) },
            onDismiss = { pendingCancel = false },
            busy = ownerBusy,
        )
    }
    if (confirmEvent != null && pendingDelete) {
        BsdcConfirmDialog(
            visible = true,
            title = if (bn) "ইভেন্টটি মুছবেন?" else "Delete this event?",
            message = OwnerActionsLogic.deleteMessage(
                OwnerActionsLogic.DeleteMessage.EVENT,
                confirmEvent.goingCount,
                bn,
            ),
            confirmLabel = if (bn) "মুছুন" else "Delete",
            cancelLabel = if (bn) "বাতিল" else "Cancel",
            onConfirm = { deleteEvent(confirmEvent) },
            onDismiss = { pendingDelete = false },
            busy = ownerBusy,
            destructive = true,
        )
    }

}
