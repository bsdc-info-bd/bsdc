package bd.info.bsdc.app.core.media

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.BsdcGalleryCursor
import bd.info.bsdc.app.core.model.BsdcGalleryImage
import coil3.ImageLoader
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * The member's own library, to pick from.
 *
 * The app's half of the website's `GalleryPickerDialog`: the same pages from the same function
 * (`my_gallery`, 0132), grouped by the day a picture was uploaded, filtered by what it was filed as,
 * and searchable by the words the member typed when they posted it. What it does not have is an upload
 * button of its own — a surface that offers a device picker already has one, and the tile grid is
 * where a member who finds nothing wants to look, not to be handed a second file chooser.
 *
 * The rules that decide what a page is, whether the selection survives a search, and what happens at
 * the limit live in [BsdcGalleryLogic] rather than here, so they have tests that do not need a device.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BsdcGalleryPickerSheet(
    visible: Boolean,
    repository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    onDismiss: () -> Unit,
    onPicked: (List<BsdcGalleryImage>) -> Unit,
    max: Int = 1,
    attached: List<String> = emptyList(),
    initialFilter: GalleryFilter = GalleryFilter.ALL,
) {
    if (!visible) return
    val copy = remember(bn) { GalleryCopy.forLanguage(bn) }
    val tokens = BsdcThemeTokens.colors
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    var filter by remember { mutableStateOf(initialFilter) }
    var query by remember { mutableStateOf("") }
    var pages by remember { mutableStateOf(listOf<List<BsdcGalleryImage>>()) }
    var cursor by remember { mutableStateOf<BsdcGalleryCursor?>(null) }
    var loadedCriteria by remember { mutableStateOf<Pair<String, String>?>(null) }
    var reloadToken by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(listOf<String>()) }

    val wire = filter.wire
    val trimmedQuery = query.trim()
    val attachedKeys = remember(attached) { BsdcGalleryLogic.attachedKeys(attached) }
    val items = remember(pages) { BsdcGalleryLogic.dedupPages(pages) }
    val room = BsdcGalleryLogic.roomFor(selected.size, max)

    // A keyset cursor is a position in one sorted list of matches, so a new word or a new shelf
    // reloads from the top instead of resuming where the old list left off.
    LaunchedEffect(wire, trimmedQuery, reloadToken) {
        val previous = loadedCriteria
        val mustReset = previous == null ||
            BsdcGalleryLogic.shouldResetFor(previous.first, previous.second, wire, trimmedQuery)
        loadedCriteria = wire to trimmedQuery
        if (mustReset) selected = emptyList()
        loading = true
        failed = false
        val outcome = runCatching {
            repository.myGallery(
                limit = GALLERY_PAGE_SIZE,
                purpose = filter.purpose,
                query = trimmedQuery,
            )
        }
        val page = outcome.getOrNull()
        pages = listOf(page?.items ?: emptyList())
        cursor = page?.nextCursor
        loading = false
        failed = outcome.isFailure
    }

    val lastPageSize = pages.lastOrNull()?.size ?: 0
    val atEnd = pages.isNotEmpty() && BsdcGalleryLogic.reachedEnd(lastPageSize, GALLERY_PAGE_SIZE)
    val sections = remember(items, bn) { groupByUploadedDay(items, bn) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, end = 18.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = copy.title, style = MaterialTheme.typography.titleLarge)
                    Text(
                        text = when {
                            loading -> copy.loading
                            items.isEmpty() -> copy.empty
                            else -> copy.count.replace("{{count}}", items.size.toString())
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.mutedText,
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(imageVector = Icons.Rounded.Close, contentDescription = copy.close)
                }
            }

            BsdcFormText(
                label = copy.searchLabel,
                value = query,
                onValueChange = { query = it },
                leadingIcon = Icons.Rounded.Search,
                hint = copy.searchPlaceholder,
                singleLine = true,
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                GalleryFilter.entries.forEach { entry ->
                    FilterChip(
                        selected = entry == filter,
                        onClick = { filter = entry },
                        label = { Text(entry.label(copy)) },
                    )
                }
            }

            if (max > 1) {
                Text(
                    text = copy
                        .pickHint
                        .replace("{{count}}", max.toString()) +
                        if (selected.isEmpty()) {
                            ""
                        } else {
                            " · " + copy.selectedCount.replace("{{count}}", selected.size.toString())
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.mutedText,
                )
            }

            if (failed) {
                BsdcStatusBanner(
                    title = copy.errorTitle,
                    body = copy.errorsFailed,
                    tone = BsdcTone.BAD,
                )
                BsdcButton(
                    label = copy.retry,
                    onClick = { reloadToken += 1 },
                    secondary = true,
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 180.dp, max = 420.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (loading && items.isEmpty()) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 28.dp),
                                horizontalArrangement = Arrangement.Center,
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(22.dp))
                            }
                        }
                    }
                    if (!loading && items.isEmpty()) {
                        item {
                            Column(modifier = Modifier.padding(vertical = 20.dp)) {
                                Text(text = copy.empty, style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    text = if (trimmedQuery.isNotEmpty() || filter != GalleryFilter.ALL) {
                                        copy.noMatchesHint
                                    } else {
                                        copy.emptyHint
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.mutedText,
                                )
                                if (trimmedQuery.isNotEmpty() || filter != GalleryFilter.ALL) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    BsdcButton(
                                        label = copy.clearFilters,
                                        onClick = {
                                            query = ""
                                            filter = GalleryFilter.ALL
                                        },
                                        secondary = true,
                                    )
                                }
                            }
                        }
                    }
                    sections.forEach { section ->
                        item(key = section.key) {
                            Text(
                                text = section.day,
                                style = MaterialTheme.typography.labelMedium,
                                color = tokens.mutedText,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                        // Three across, in rows of the same shape: the tiles are square-ish and a
                        // wall of single full-width pictures is a feed, not a library. An empty row
                        // keeps the weight of a full one, so the last line does not stretch.
                        section.items.chunked(TILES_PER_ROW).forEach { row ->
                            item(key = "bsdc-gallery-row-" + row.first().id) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    row.forEach { image ->
                                        val attachedHere = BsdcGalleryLogic.isAttached(image, attachedKeys)
                                        GalleryTile(
                                            image = image,
                                            imageLoader = imageLoader,
                                            copy = copy,
                                            chosen = selected.contains(image.id),
                                            locked = attachedHere,
                                            modifier = Modifier.weight(1f),
                                            onClick = {
                                                if (!attachedHere) {
                                                    selected =
                                                        BsdcGalleryLogic.toggle(selected, image.id, room)
                                                }
                                            },
                                        )
                                    }
                                    repeat(TILES_PER_ROW - row.size) {
                                        Spacer(modifier = Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }
                    if (items.isNotEmpty() && !atEnd) {
                        item {
                            BsdcButton(
                                label = if (loadingMore) copy.loadingMore else copy.loadMore,
                                onClick = {
                                    val next = cursor ?: return@BsdcButton
                                    scope.launch {
                                        loadingMore = true
                                        val outcome = runCatching {
                                            repository.myGallery(
                                                limit = GALLERY_PAGE_SIZE,
                                                purpose = filter.purpose,
                                                query = trimmedQuery,
                                                cursor = next,
                                            )
                                        }
                                        val page = outcome.getOrNull()
                                        if (page != null) {
                                            pages = pages + listOf(page.items)
                                            cursor = page.nextCursor
                                        }
                                        loadingMore = false
                                    }
                                },
                                secondary = true,
                                busy = loadingMore,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                    if (items.isNotEmpty() && atEnd) {
                        item {
                            Text(
                                text = copy.endOfLibrary,
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.mutedText,
                                modifier = Modifier.padding(vertical = 10.dp),
                            )
                        }
                    }
                }
            }

            BsdcButton(
                label = copy.addLabel(selected.size),
                onClick = {
                    onPicked(BsdcGalleryLogic.picked(items, selected, attachedKeys))
                },
                enabled = selected.isNotEmpty(),
                leadingIcon = Icons.Rounded.CheckCircle,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** One picture in the grid: its thumbnail, its caption as the name, and a tick when chosen. */
@Composable
private fun GalleryTile(
    image: BsdcGalleryImage,
    imageLoader: ImageLoader,
    copy: GalleryCopy,
    chosen: Boolean,
    locked: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier = modifier
            .height(96.dp)
            .clip(shape)
            .border(
                width = if (chosen) 2.dp else 1.dp,
                color = if (chosen) tokens.brandStrong else tokens.border,
                shape = shape,
            )
            .clickable(enabled = !locked) { onClick() },
    ) {
        BsdcImgbbImage(
            fullUrl = image.url,
            thumbUrl = image.thumbUrl,
            contentDescription = image.altText.ifEmpty { copy.tileNoAlt },
            imageLoader = imageLoader,
            modifier = Modifier.fillMaxWidth(),
            targetWidthPx = 320,
            cornerRadiusDp = 14,
        )
        if (chosen) {
            Icon(
                imageVector = Icons.Rounded.CheckCircle,
                contentDescription = copy.unpick,
                tint = tokens.brandStrong,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(6.dp)
                    .size(20.dp),
            )
        }
        if (locked) {
            // The web greys the tile; a phone has to say why it does not answer, in the
            // plate the member reads on the picture itself.
            Text(
                text = copy.alreadyAttached,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.62f))
                    .padding(horizontal = 6.dp, vertical = 3.dp),
            )
        }
    }
}

/**
 * The day a picture was uploaded, in the language the member reads.
 *
 * A date the platform cannot read is shown as the raw key rather than guessed at, which is what the
 * website's heading does for the same row.
 */
private const val TILES_PER_ROW = 3

private fun groupByUploadedDay(items: List<BsdcGalleryImage>, bn: Boolean): List<GalleryDaySection> {
    val locale = Locale.forLanguageTag(if (bn) "bn" else "en")
    val dayOf: (String) -> String = { iso ->
        val key = iso.trim().take(10)
        runCatching {
            val parsed = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(key)
            requireNotNull(parsed)
            SimpleDateFormat("d MMMM yyyy", locale).format(parsed)
        }.getOrDefault(key)
    }
    return BsdcGalleryLogic.groupByDay(items, dayOf)
}
