package bd.info.bsdc.app.core.media

import bd.info.bsdc.app.core.model.BsdcGalleryImage
import bd.info.bsdc.app.core.model.MediaPurpose

/**
 * The shelves the library offers, in the order its chips appear.
 *
 * The list is the website's `GALLERY_FILTERS` — `all` plus the nine purposes the column can actually
 * hold — and `BsdcGalleryLogicTest` reads that array out of `media-contract.ts` on every build. Two
 * rules travel together in it and neither is decoration: `'other'` is deliberately absent, because a
 * member who chooses the heading nothing was filed under expects pictures and finds only rows nobody
 * labelled; and the order is the order the chips are in, so the same shelf is the same distance from
 * the left edge on both clients.
 */
enum class GalleryFilter(val wire: String) {
    ALL("all"),
    POST_IMAGE("post-image"),
    CHAT_IMAGE("chat-image"),
    COMMENT_IMAGE("comment-image"),
    AVATAR("avatar"),
    COVER("cover"),
    PROJECT_IMAGE("project-image"),
    PROJECT_COVER("project-cover"),
    PRODUCT_IMAGE("product-image"),
    AD_CREATIVE("ad-creative"),
    ;

    /** The shelf this filter shows, or `null` for "everything the member has". */
    val purpose: MediaPurpose?
        get() = when (this) {
            ALL -> null
            POST_IMAGE -> MediaPurpose.POST_IMAGE
            CHAT_IMAGE -> MediaPurpose.CHAT_IMAGE
            COMMENT_IMAGE -> MediaPurpose.COMMENT_IMAGE
            AVATAR -> MediaPurpose.AVATAR
            COVER -> MediaPurpose.COVER
            PROJECT_IMAGE -> MediaPurpose.PROJECT_IMAGE
            PROJECT_COVER -> MediaPurpose.PROJECT_COVER
            PRODUCT_IMAGE -> MediaPurpose.PRODUCT_IMAGE
            AD_CREATIVE -> MediaPurpose.AD_CREATIVE
        }

    fun label(copy: GalleryCopy): String = when (this) {
        ALL -> copy.filterAll
        AVATAR -> copy.filterAvatars
        COVER -> copy.filterCovers
        PROJECT_IMAGE -> copy.filterProjectShots
        PROJECT_COVER -> copy.filterProjectCovers
        POST_IMAGE -> copy.filterPosts
        COMMENT_IMAGE -> copy.filterComments
        CHAT_IMAGE -> copy.filterChat
        PRODUCT_IMAGE -> copy.filterProducts
        AD_CREATIVE -> copy.filterAds
    }

    companion object {
        /** The database's word for a shelf, or `all`. */
        fun of(wire: String?): GalleryFilter =
            entries.firstOrNull { it.wire == wire?.trim()?.lowercase() } ?: ALL
    }
}

/** Tiles uploaded on one day, under a heading. Newest day first, as the function returns them. */
data class GalleryDaySection(
    val key: String,
    val day: String,
    val items: List<BsdcGalleryImage>,
)

/**
 * The library's rules, apart from any screen.
 *
 * Paging, grouping and selection are where a reuse-the-old-photo feature goes wrong, and none of them
 * needs a display: a member who searches under one shelf and switches to another must not keep a
 * cursor from the old list of matches, and a tile must not be selectable twice into one answer.
 */
object BsdcGalleryLogic {

    /**
     * The website's `normaliseMediaUrl`, and deliberately as strict: an address with a trailing slash
     * and one without are the same picture, and `http` is what an https address looks like after a
     * proxy mangles it. Anything that cannot be read as a URL is compared as it was typed.
     */
    fun normaliseMediaUrl(raw: String?): String {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return ""
        val withScheme = if (trimmed.startsWith("http://", ignoreCase = true)) {
            "https://" + trimmed.substring("http://".length)
        } else {
            trimmed
        }
        return withScheme.trimEnd('/')
    }

    fun isSameMedia(a: String?, b: String?): Boolean {
        val left = normaliseMediaUrl(a)
        return left.isNotEmpty() && left == normaliseMediaUrl(b)
    }

    /** The addresses a surface already carries, normalised once for a whole page of tiles. */
    fun attachedKeys(urls: List<String?>): Set<String> {
        val out = LinkedHashSet<String>()
        urls.forEach { url ->
            val normalised = normaliseMediaUrl(url)
            if (normalised.isNotEmpty()) out.add(normalised)
        }
        return out
    }

    fun isAttached(image: BsdcGalleryImage, attached: Set<String>): Boolean =
        attached.contains(normaliseMediaUrl(image.url)) ||
            attached.contains(normaliseMediaUrl(image.thumbUrl))

    /**
     * The pages a member has scrolled through, as one list.
     *
     * A row can appear in two pages when an upload is written between them; the first answer wins,
     * because the earlier page is the one the member saw. A row with no id is not a row.
     */
    fun dedupPages(pages: List<List<BsdcGalleryImage>>): List<BsdcGalleryImage> {
        val seen = LinkedHashSet<String>()
        val out = ArrayList<BsdcGalleryImage>()
        pages.forEach { page ->
            page.forEach { image ->
                if (image.id.isEmpty()) return@forEach
                if (seen.add(image.id)) out.add(image)
            }
        }
        return out
    }

    /** A short page is the end of the library, whether or not the caller asked for more. */
    fun reachedEnd(lastPageSize: Int, pageSize: Int): Boolean = lastPageSize < pageSize

    /**
     * Whether a new search or shelf throws away the pages already loaded.
     *
     * It always should: a keyset cursor is a position in a *sorted list of matches*, so resuming a
     * page fetched under "posts" inside "chat" silently skips pictures. The query is compared trimmed
     * on both sides, because the pages are keyed on the trimmed word — a trailing space is a keystroke
     * and not a new search, and dropping a member's selection for it is the worse half of the bug.
     */
    fun shouldResetFor(
        previousWire: String,
        previousQuery: String,
        nextWire: String,
        nextQuery: String,
    ): Boolean =
        previousWire != nextWire || previousQuery.trim() != nextQuery.trim()

    /** How many more pictures a surface may take, clamped at zero. */
    fun roomFor(current: Int, max: Int): Int = (max - current).coerceAtLeast(0)

    /**
     * One tap on a tile: add it to the selection, or take it back out.
     *
     * The room is checked here rather than by disabling the tiles, so the answer to "what happens at
     * the limit" is one rule: the last tap that fitted is kept and the one that did not is refused,
     * in the order the member tapped.
     */
    fun toggle(selected: List<String>, imageId: String, room: Int): List<String> {
        if (selected.contains(imageId)) return selected.filter { it != imageId }
        if (room <= 0) return selected
        return selected + imageId
    }

    /** The selected rows, in the order they were chosen, with the attached ones left out. */
    fun picked(items: List<BsdcGalleryImage>, selected: List<String>, attached: Set<String>): List<BsdcGalleryImage> {
        val byId = items.associateBy { it.id }
        return selected.mapNotNull { id ->
            val image = byId[id]
            if (image == null || isAttached(image, attached)) null else image
        }
    }

    /**
     * Tiles grouped by the day they were uploaded, newest day first.
     *
     * A date above each run is the difference between a wall of thumbnails and a library. Runs are
     * cut at a change of day rather than by sorting, because the rows arrive already ordered by the
     * function and re-sorting them here would quietly disagree with the cursor.
     */
    fun groupByDay(items: List<BsdcGalleryImage>, dayOf: (String) -> String): List<GalleryDaySection> {
        val keys = ArrayList<String>()
        val buckets = ArrayList<MutableList<BsdcGalleryImage>>()
        items.forEach { image ->
            val day = dayOf(image.createdAt)
            val lastIndex = buckets.size - 1
            if (lastIndex >= 0 && keys[lastIndex] == day) {
                buckets[lastIndex].add(image)
            } else {
                keys.add(day)
                buckets.add(mutableListOf(image))
            }
        }
        return keys.mapIndexed { index, day ->
            val bucket = buckets[index]
            GalleryDaySection(
                key = day + "-" + (bucket.firstOrNull()?.id ?: index.toString()),
                day = day,
                items = bucket,
            )
        }
    }
}
