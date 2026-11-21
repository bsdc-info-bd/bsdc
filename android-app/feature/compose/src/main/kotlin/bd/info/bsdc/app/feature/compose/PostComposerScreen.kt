package bd.info.bsdc.app.feature.compose

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Drafts
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Preview
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcAnimatedEntrance
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.MediaPurpose
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.feature.feed.BsdcCodeSnippetBlock
import bd.info.bsdc.app.feature.feed.PostMarkdownRenderer
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val CodeLanguages = listOf(
    "kotlin", "java", "typescript", "javascript", "python", "sql", "bash", "go", "rust", "json",
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PostComposerScreen(
    authorUid: String,
    composeRepository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    initialDraft: PostComposerDraft = PostComposerDraft(language = language),
    /**
     * Opens a fresh composer addressed to one group channel.
     *
     * Applied after the draft is seeded, not instead of it, because the two are not in conflict: a
     * draft restored for editing may already live in a channel, and a caller's target only speaks for
     * a *new* post. Marking it touched is deliberate — the member came from the channel, so the key
     * belongs in the payload even though they never opened the picker.
     */
    initialChannelId: String? = null,
    initialChannelName: String? = null,
    onPublished: (PublishedResult) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val scope = rememberCoroutineScope()
    val bn = language == AppLanguage.BN

    var draft by remember { mutableStateOf(initialDraft) }
    // The body field keeps its own selection so the formatting buttons can act on
    // what is selected; the draft keeps the text, which is what gets saved.
    var bodyField by remember { mutableStateOf(TextFieldValue(initialDraft.body)) }

    fun applyMarkdown(edit: MarkdownEdit?) {
        if (edit == null) return
        bodyField = TextFieldValue(edit.text, TextRange(edit.start, edit.end))
        draft = draft.copy(body = edit.text)
    }
    var mode by remember { mutableStateOf(MkComposerMode.WRITE) }

    /**
     * The rooms this member may post into.
     *
     * A failure here is not fatal and must not look like one: the feed needs no channel list, so a
     * member who cannot load their channels can still publish — the row simply says the list could
     * not be read, and the pickers stay closed. Nothing about the draft changes on a fetch failure.
     */
    var channels by remember { mutableStateOf<List<PostableChannel>>(emptyList()) }
    var channelsUnavailable by remember { mutableStateOf(false) }
    var showChannelSheet by remember { mutableStateOf(false) }
    var showVisibilitySheet by remember { mutableStateOf(false) }
    var curatedTags by remember { mutableStateOf<List<CuratedTagItem>>(emptyList()) }
    var tagInput by remember { mutableStateOf("") }
    var publishing by remember { mutableStateOf(false) }
    var savingDraft by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var statusMsg by remember { mutableStateOf<String?>(null) }
    var showSavedDraftsSheet by remember { mutableStateOf(false) }

    val savedLocalDrafts by composeRepository.observeLocalDrafts().collectAsState(initial = emptyList())

    LaunchedEffect(Unit) {
        curatedTags = composeRepository.fetchCuratedTags()
        runCatching { composeRepository.fetchPostableChannels() }
            .onSuccess { channels = it }
            .onFailure { channelsUnavailable = true }
    }

    // Room offline draft auto-save every time user stops typing for 1.5s
    LaunchedEffect(
        draft.title,
        draft.body,
        draft.code,
        draft.tags,
        draft.pollOptions,
        draft.kind,
        draft.media,
    ) {
        if (draft.title.isBlank() && draft.body.isBlank() && draft.code.isBlank() && draft.media.isEmpty()) {
            return@LaunchedEffect
        }
        delay(1_500L)
        composeRepository.saveLocalDraft(draft)
    }

    fun uploadAttachment(localKey: String, uri: android.net.Uri) {
        scope.launch {
            runCatching {
                mediaRepository.uploadImageUri(
                    uri = uri,
                    purpose = MediaPurpose.POST_IMAGE,
                    onProgress = { pct ->
                        draft = draft.copy(
                            media = draft.media.map {
                                if (it.localKey == localKey) it.copy(progressPct = pct) else it
                            },
                        )
                    },
                )
            }.onSuccess { result ->
                draft = draft.copy(
                    media = draft.media.map {
                        if (it.localKey == localKey) {
                            it.copy(
                                mediaId = result.assetId.orEmpty(),
                                url = result.url,
                                thumbUrl = result.thumbUrl,
                                progressPct = 100,
                                stage = AttachmentUploadStage.READY,
                                error = null,
                            )
                        } else {
                            it
                        }
                    },
                )
            }.onFailure { err ->
                draft = draft.copy(
                    media = draft.media.map {
                        if (it.localKey == localKey) {
                            it.copy(
                                stage = AttachmentUploadStage.FAILED,
                                error = err.message ?: "Upload failed",
                            )
                        } else {
                            it
                        }
                    },
                )
            }
        }
    }

    val mediaPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(6),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val remainingSlots = (6 - draft.media.size).coerceAtLeast(0)
        val picked = uris.take(remainingSlots)
        val pending = picked.map { uri ->
            ComposerMediaAttachment(localUri = uri, stage = AttachmentUploadStage.UPLOADING)
        }
        draft = draft.copy(media = draft.media + pending)
        pending.forEach { att ->
            att.localUri?.let { uri -> uploadAttachment(att.localKey, uri) }
        }
    }

    LaunchedEffect(initialChannelId, initialDraft.remotePostId) {
        if (initialChannelId.isNullOrBlank() || initialDraft.remotePostId != null) return@LaunchedEffect
        draft = draft.copy(
            channelId = initialChannelId,
            channelTouched = true,
            // A channel cannot carry `private`, so the audience moves rather than the destination.
            visibility = ChannelRules.reconcileVisibility(
                ComposerVisibility.fromWire(draft.visibility),
                initialChannelId,
            ).wire,
        )
        if (!initialChannelName.isNullOrBlank()) {
            statusMsg = if (bn) {
                "পোস্টটি #$initialChannelName চ্যানেলে যাবে।"
            } else {
                "This post will go in #$initialChannelName."
            }
        }
    }

    val detectedHashtags = remember(draft.body) {
        ComposerValidationEngine.extractHashtags(draft.body)
            .filterNot { it in draft.tags }
    }

    val tagSuggestions = remember(tagInput, curatedTags, draft.tags) {
        val needle = ComposerValidationEngine.normalizeTag(tagInput)
        if (needle.isEmpty()) {
            curatedTags.filterNot { it.slug in draft.tags }.take(8)
        } else {
            curatedTags.filter {
                it.slug !in draft.tags &&
                    (it.slug.contains(needle) || it.nameEn.lowercase().contains(needle))
            }.take(8)
        }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item("top_controls") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MkComposerModeSwitch(
                    mode = mode,
                    onModeChange = { next -> mode = next },
                    bn = bn,
                )
                if (savedLocalDrafts.isNotEmpty()) {
                    TextButton(onClick = { showSavedDraftsSheet = true }) {
                        Icon(Icons.Rounded.Drafts, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            if (bn) {
                                "খসড়া (${BanglaDigitFormatter.formatCount(savedLocalDrafts.size.toLong(), language)})"
                            } else {
                                "Drafts (${savedLocalDrafts.size})"
                            },
                        )
                    }
                }
            }
        }

        errorMsg?.let { msg ->
            item("error") {
                BsdcStatusBanner(
                    title = if (bn) "যাচাইকরণ ত্রুটি" else "Please review",
                    body = msg,
                    tone = BsdcTone.BAD,
                )
            }
        }

        statusMsg?.let { msg ->
            item("status") {
                BsdcStatusBanner(
                    title = if (bn) "সংরক্ষিত" else "Saved",
                    body = msg,
                    tone = BsdcTone.OK,
                )
            }
        }

        item("kind_selector") {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PostKind.entries.forEach { kind ->
                    FilterChip(
                        selected = draft.kind == kind,
                        onClick = { draft = draft.copy(kind = kind) },
                        label = {
                            Text(
                                when (kind) {
                                    PostKind.POST -> if (bn) "পোস্ট" else "Post"
                                    PostKind.ARTICLE -> if (bn) "আর্টিকেল" else "Article"
                                    PostKind.QUESTION -> if (bn) "প্রশ্ন" else "Question"
                                    PostKind.POLL -> if (bn) "পোল" else "Poll"
                                    PostKind.SNIPPET -> if (bn) "কোড স্নিপেট" else "Snippet"
                                },
                            )
                        },
                    )
                }
            }
        }

        item("audience") {
            val selectedChannel = channels.firstOrNull { it.id == draft.channelId }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                MkAudienceRow(
                    channel = selectedChannel,
                    hasChannel = draft.channelId != null,
                    visibility = ComposerVisibility.fromWire(draft.visibility),
                    bn = bn,
                    onPickChannel = { showChannelSheet = true },
                    onPickVisibility = { showVisibilitySheet = true },
                )
                if (channelsUnavailable) {
                    Text(
                        text = if (bn) {
                            "চ্যানেলের তালিকা আনা যায়নি — পোস্টটি ফিডে যাবে।"
                        } else {
                            "Channels could not be loaded — this post will go to the feed."
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.danger,
                    )
                } else if (draft.channelId != null && selectedChannel == null && channels.isNotEmpty()) {
                    Text(
                        text = if (bn) {
                            "নির্বাচিত চ্যানেলটি এখন আর পাওয়া যাচ্ছে না — আবার বেছে নিন।"
                        } else {
                            "The chosen channel is no longer listed. Pick again before publishing."
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.danger,
                    )
                }
            }
        }

        if (mode != MkComposerMode.PREVIEW) {
            item("title_body") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = draft.title,
                        onValueChange = { draft = draft.copy(title = it.take(140)) },
                        label = {
                            Text(
                                when (draft.kind) {
                                    PostKind.QUESTION -> if (bn) "আপনার প্রশ্ন" else "Your technical question"
                                    PostKind.POLL -> if (bn) "পোল শিরোনাম" else "Poll question"
                                    else -> if (bn) "শিরোনাম" else "Title"
                                },
                            )
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        // The same formatting the web editor offers, in the order a
                        // writer reaches for it. Each button is one entry in
                        // MarkdownInsert, which is unit-tested on the JVM.
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.wrap(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                    "**",
                                    "**",
                                    if (bn) "বোল্ড লেখা" else "bold text",
                                ),
                            )
                        }) { Text("B", fontWeight = androidx.compose.ui.text.font.FontWeight.Bold) }
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.wrap(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                    "*",
                                    "*",
                                    if (bn) "ইটালিক লেখা" else "italic text",
                                ),
                            )
                        }) { Text("I", fontStyle = androidx.compose.ui.text.font.FontStyle.Italic) }
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.linePrefix(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                    "## ",
                                ),
                            )
                        }) { Text("H2") }
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.linePrefix(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                    "- ",
                                ),
                            )
                        }) { Text("•") }
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.linePrefix(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                    "1. ",
                                ),
                            )
                        }) { Text("1.") }
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.codeBlock(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                ),
                            )
                        }) { Text("</>") }
                        TextButton(onClick = {
                            applyMarkdown(
                                MarkdownInsert.link(
                                    bodyField.text,
                                    bodyField.selection.start,
                                    bodyField.selection.end,
                                ),
                            )
                        }) { Text("🔗") }
                    }
                    OutlinedTextField(
                        value = bodyField,
                        onValueChange = { value ->
                            bodyField = value
                            draft = draft.copy(body = value.text)
                        },
                        label = {
                            Text(
                                if (bn) "Markdown-এ বিস্তারিত লিখুন (@উল্লেখ, #ট্যাগ)"
                                else "Body in Markdown (@mention, #tag supported)",
                            )
                        },
                        minLines = 6,
                        maxLines = 14,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (draft.kind == PostKind.SNIPPET) {
                item("snippet_editor") {
                    BsdcCard {
                        Text(
                            text = if (bn) "কোড স্নিপেট" else "Code Snippet",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            CodeLanguages.forEach { lang ->
                                FilterChip(
                                    selected = draft.codeLanguage == lang,
                                    onClick = { draft = draft.copy(codeLanguage = lang) },
                                    label = { Text(lang) },
                                )
                            }
                        }
                        OutlinedTextField(
                            value = draft.code,
                            onValueChange = { draft = draft.copy(code = it) },
                            label = { Text("Source Code") },
                            minLines = 6,
                            maxLines = 16,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            if (draft.kind == PostKind.POLL) {
                item("poll_editor") {
                    BsdcCard {
                        Text(
                            text = if (bn) "পোলের বিকল্প (২–৬টি)" else "Poll Options (2 to 6)",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        draft.pollOptions.forEachIndexed { idx, option ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                OutlinedTextField(
                                    value = option,
                                    onValueChange = { next ->
                                        draft = draft.copy(
                                            pollOptions = draft.pollOptions.mapIndexed { i, v ->
                                                if (i == idx) next.take(80) else v
                                            },
                                        )
                                    },
                                    label = { Text("Option ${idx + 1}") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                if (draft.pollOptions.size > 2) {
                                    IconButton(
                                        onClick = {
                                            draft = draft.copy(
                                                pollOptions = draft.pollOptions.filterIndexed { i, _ -> i != idx },
                                            )
                                        },
                                    ) {
                                        Icon(Icons.Rounded.Close, contentDescription = "Remove option")
                                    }
                                }
                            }
                        }
                        if (draft.pollOptions.size < 6) {
                            TextButton(
                                onClick = {
                                    draft = draft.copy(pollOptions = draft.pollOptions + "")
                                },
                            ) {
                                Icon(Icons.Rounded.Add, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text(if (bn) "আরও বিকল্প যোগ করুন" else "Add option")
                            }
                        }
                    }
                }
            }
        }

        if (mode != MkComposerMode.WRITE) {
            item("markdown_preview") {
                // `key(mode)` re-enters the card on every mode change, so SPLIT ↔ PREVIEW animates as
                // well as the first move into preview. The editor above is deliberately *not* animated
                // the same way: it would replay its entrance while the member is mid-thought, and a
                // text field that fades in under the cursor feels broken rather than designed.
                key(mode) {
                    BsdcAnimatedEntrance {
                        MkComposerPreviewCard(
                            title = draft.title,
                            body = draft.body,
                            code = draft.code,
                            codeLanguage = draft.codeLanguage,
                            showCode = draft.kind == PostKind.SNIPPET && draft.code.isNotBlank(),
                            split = mode == MkComposerMode.SPLIT,
                            bn = bn,
                        )
                    }
                }
            }
        }

        // ImgBB Gallery Attachment Block
        item("media_block") {
            BsdcCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (bn) "ImgBB ছবি সংযুক্তি (${draft.media.size}/৬)" else "ImgBB Images (${draft.media.size}/6)",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    BsdcButton(
                        label = if (bn) "ছবি যোগ করুন" else "Add Photos",
                        onClick = {
                            mediaPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        enabled = draft.media.size < 6,
                        secondary = true,
                        leadingIcon = Icons.Rounded.AddPhotoAlternate,
                    )
                }

                if (draft.media.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(draft.media, key = { it.localKey }) { item ->
                            Column(
                                modifier = Modifier
                                    .width(180.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(tokens.surfaceElevated)
                                    .border(1.dp, tokens.border, RoundedCornerShape(12.dp))
                                    .padding(8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(110.dp),
                                ) {
                                    if (item.url.isNotBlank()) {
                                        BsdcImgbbImage(
                                            fullUrl = item.url,
                                            thumbUrl = item.thumbUrl,
                                            contentDescription = item.altText.ifBlank { "Attachment" },
                                            imageLoader = imageLoader,
                                            modifier = Modifier.fillMaxSize(),
                                        )
                                    } else {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .background(tokens.brandSoft),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(
                                                text = when (item.stage) {
                                                    AttachmentUploadStage.UPLOADING -> "${item.progressPct}%"
                                                    AttachmentUploadStage.FAILED -> "Failed"
                                                    AttachmentUploadStage.READY -> "Ready"
                                                },
                                                style = MaterialTheme.typography.labelLarge,
                                            )
                                        }
                                    }
                                    IconButton(
                                        onClick = {
                                            draft = draft.copy(
                                                media = draft.media.filterNot { it.localKey == item.localKey },
                                            )
                                        },
                                        modifier = Modifier.align(Alignment.TopEnd),
                                    ) {
                                        Icon(Icons.Rounded.Close, contentDescription = "Remove")
                                    }
                                }
                                if (item.stage == AttachmentUploadStage.UPLOADING) {
                                    LinearProgressIndicator(
                                        progress = { item.progressPct / 100f },
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                } else if (item.stage == AttachmentUploadStage.FAILED) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            text = item.error ?: "Failed",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = tokens.danger,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f),
                                        )
                                        item.localUri?.let { uri ->
                                            IconButton(
                                                onClick = {
                                                    draft = draft.copy(
                                                        media = draft.media.map {
                                                            if (it.localKey == item.localKey) {
                                                                it.copy(stage = AttachmentUploadStage.UPLOADING, progressPct = 0, error = null)
                                                            } else {
                                                                it
                                                            }
                                                        },
                                                    )
                                                    uploadAttachment(item.localKey, uri)
                                                },
                                            ) {
                                                Icon(Icons.Rounded.Refresh, contentDescription = "Retry upload")
                                            }
                                        }
                                    }
                                } else {
                                    OutlinedTextField(
                                        value = item.altText,
                                        onValueChange = { alt ->
                                            draft = draft.copy(
                                                media = draft.media.map {
                                                    if (it.localKey == item.localKey) it.copy(altText = alt.take(120)) else it
                                                },
                                            )
                                        },
                                        label = { Text("Alt text") },
                                        singleLine = true,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Tags & Autocomplete
        item("tags_block") {
            BsdcCard {
                Text(
                    text = if (bn) "বিষয় ও ট্যাগ (সর্বোচ্চ ৫টি)" else "Topics & Curated Tags (max 5)",
                    style = MaterialTheme.typography.titleMedium,
                )
                if (draft.tags.isNotEmpty()) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        draft.tags.forEach { slug ->
                            FilterChip(
                                selected = true,
                                onClick = { draft = draft.copy(tags = draft.tags - slug) },
                                label = { Text("#$slug") },
                                trailingIcon = { Icon(Icons.Rounded.Close, contentDescription = null, Modifier.size(14.dp)) },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = tagInput,
                    onValueChange = { tagInput = it },
                    label = { Text(if (bn) "ট্যাগ খুঁজুন বা যোগ করুন" else "Search curated tags") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (detectedHashtags.isNotEmpty() || tagSuggestions.isNotEmpty()) {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        detectedHashtags.take(3).forEach { tag ->
                            BsdcBadge(
                                label = "+ #$tag",
                                tone = BsdcTone.INFO,
                                modifier = Modifier.clickable {
                                    if (draft.tags.size < 5) {
                                        draft = draft.copy(tags = (draft.tags + tag).distinct())
                                    }
                                },
                            )
                        }
                        tagSuggestions.forEach { item ->
                            FilterChip(
                                selected = false,
                                onClick = {
                                    if (draft.tags.size < 5) {
                                        draft = draft.copy(tags = (draft.tags + item.slug).distinct())
                                        tagInput = ""
                                    }
                                },
                                label = { Text("#${item.slug}") },
                            )
                        }
                    }
                }
            }
        }

        // Options & Publish Action Bar
        item("options_and_submit") {
            BsdcCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (bn) "মন্তব্য অনুমতি দিন" else "Allow comments", style = MaterialTheme.typography.bodyMedium)
                    Switch(
                        checked = draft.allowComments,
                        onCheckedChange = { draft = draft.copy(allowComments = it) },
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (bn) "সংবেদনশীল কন্টেন্ট সতর্কতা" else "Mark as sensitive", style = MaterialTheme.typography.bodyMedium)
                    Switch(
                        checked = draft.isSensitive,
                        onCheckedChange = { draft = draft.copy(isSensitive = it) },
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BsdcButton(
                        label = if (bn) "খসড়া" else "Save Draft",
                        onClick = {
                            val issues = ComposerValidationEngine.validatePostDraft(
                                draft.kind.name.lowercase(),
                                draft.title,
                                draft.body,
                                draft.code,
                                draft.pollOptions,
                                draft.media.any { !it.isReady },
                            )
                            if (issues.isNotEmpty()) {
                                errorMsg = issues.first()
                                return@BsdcButton
                            }
                            savingDraft = true
                            errorMsg = null
                            scope.launch {
                                runCatching {
                                    composeRepository.savePost(draft, publish = false)
                                }.onSuccess {
                                    statusMsg = if (bn) "খসড়া সংরক্ষিত হয়েছে।" else "Draft saved to your profile."
                                }.onFailure { err ->
                                    errorMsg = composeErrorMessage(err, bn, "Failed to save draft.")
                                }
                                savingDraft = false
                            }
                        },
                        busy = savingDraft,
                        enabled = !publishing,
                        secondary = true,
                        leadingIcon = Icons.Rounded.Save,
                        modifier = Modifier.weight(1f),
                    )
                    BsdcButton(
                        label = if (bn) "প্রকাশ করুন" else "Publish",
                        onClick = {
                            val issues = ComposerValidationEngine.validatePostDraft(
                                draft.kind.name.lowercase(),
                                draft.title,
                                draft.body,
                                draft.code,
                                draft.pollOptions,
                                draft.media.any { !it.isReady },
                            )
                            if (issues.isNotEmpty()) {
                                errorMsg = issues.first()
                                return@BsdcButton
                            }
                            publishing = true
                            errorMsg = null
                            scope.launch {
                                runCatching {
                                    composeRepository.savePost(draft, publish = true)
                                }.onSuccess { res ->
                                    draft = PostComposerDraft(language = language)
                                    onPublished(res)
                                }.onFailure { err ->
                                    errorMsg = composeErrorMessage(err, bn, "Could not publish post.")
                                }
                                publishing = false
                            }
                        },
                        busy = publishing,
                        enabled = !savingDraft,
                        leadingIcon = Icons.Rounded.Publish,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }

    MkChannelPickerSheet(
        visible = showChannelSheet,
        channels = channels,
        selectedChannelId = draft.channelId,
        visibility = ComposerVisibility.fromWire(draft.visibility),
        bn = bn,
        onDismiss = { showChannelSheet = false },
        onPick = { pickedChannelId ->
            val current = ComposerVisibility.fromWire(draft.visibility)
            val nextVisibility = ChannelRules.reconcileVisibility(current, pickedChannelId)
            draft = draft.copy(
                channelId = pickedChannelId,
                channelTouched = true,
                visibility = nextVisibility.wire,
            )
            val name = channels.firstOrNull { it.id == pickedChannelId }?.let { channel ->
                "#${channel.slug}"
            } ?: (if (bn) "ফিড" else "the feed")
            statusMsg = if (bn) "পোস্টটি $name-এ যাবে।" else "This post will go to $name."
        },
    )
    MkVisibilityPickerSheet(
        visible = showVisibilitySheet,
        visibility = ComposerVisibility.fromWire(draft.visibility),
        channelId = draft.channelId,
        bn = bn,
        onDismiss = { showVisibilitySheet = false },
        onPick = { picked ->
            draft = draft.copy(visibility = picked.wire)
        },
    )

    if (showSavedDraftsSheet) {
        ModalBottomSheet(onDismissRequest = { showSavedDraftsSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = if (bn) "সংরক্ষিত অফলাইন খসড়া" else "Saved Offline Drafts",
                    style = MaterialTheme.typography.titleLarge,
                )
                savedLocalDrafts.forEach { entity ->
                    BsdcCard(
                        modifier = Modifier.clickable {
                            draft = composeRepository.restoreFromEntity(entity)
                            showSavedDraftsSheet = false
                        },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = entity.title.ifBlank { entity.bodyMarkdown.take(60) }.ifBlank { "Untitled ${entity.kind}" },
                                    style = MaterialTheme.typography.titleMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = entity.kind,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.mutedText,
                                )
                            }
                            IconButton(
                                onClick = {
                                    scope.launch { composeRepository.deleteLocalDraft(entity.localId) }
                                },
                            ) {
                                Icon(Icons.Rounded.Close, contentDescription = "Delete draft")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

/**
 * The rendered post, exactly as a reader will see it.
 *
 * It is the reader's own renderer (`PostMarkdownRenderer`), not a second implementation for the
 * composer: the moment a preview and the real post parse Markdown differently, the preview becomes
 * the thing members blame when the post looks wrong.
 */
@Composable
private fun MkComposerPreviewCard(
    title: String,
    body: String,
    code: String,
    codeLanguage: String,
    showCode: Boolean,
    split: Boolean,
    bn: Boolean,
) {
    val tokens = BsdcThemeTokens.colors
    BsdcCard(
        modifier = Modifier.then(
            if (split) {
                // In split mode the preview is a proof, not the page: it is framed as the card the
                // reader will see, sized down, so the two panes read as one screen rather than two.
                Modifier.padding(top = 2.dp)
            } else {
                Modifier
            },
        ),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (title.isNotBlank()) {
                Text(title, style = MaterialTheme.typography.headlineMedium)
            }
            if (body.isNotBlank()) {
                PostMarkdownRenderer(markdown = body)
            } else {
                Text(
                    text = if (bn) {
                        "প্রিভিউ দেখতে কিছু লিখুন…"
                    } else {
                        "Write Markdown content to preview here…"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.mutedText,
                )
            }
            if (showCode) {
                BsdcCodeSnippetBlock(code = code, language = codeLanguage)
            }
        }
    }
}

/**
 * The sentence shown when a save fails.
 *
 * A poll that has votes keeps its options (0121). The repository says so by
 * refusing the save, and the member reads why in their own language rather than
 * the database's key.
 */
private fun composeErrorMessage(err: Throwable, bn: Boolean, fallback: String): String =
    if (err is PollOptionsLockedException) {
        if (bn) {
            "এই জরিপে ইতিমধ্যে ভোট পড়েছে, তাই এর অপশনগুলো অপরিবর্তিত থাকবে।"
        } else {
            "This poll already has votes, so its options stay as they are."
        }
    } else {
        err.message ?: fallback
    }
