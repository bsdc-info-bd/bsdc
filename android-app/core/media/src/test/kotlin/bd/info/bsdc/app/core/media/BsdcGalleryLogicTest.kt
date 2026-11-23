package bd.info.bsdc.app.core.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The library's rules, tested apart from any screen.
 *
 * These are the four ways a "pick one you already have" feature goes quietly wrong — a page resumed
 * from a cursor that belongs to a different search, a selection that survives the list it was chosen
 * from, a limit that lets one more tile in than the surface can hold, and a picture the member can
 * attach twice — plus the two catalogues the sheet is built from, read out of the web's own files.
 */
class BsdcGalleryLogicTest {

    private fun image(id: String, url: String, createdAt: String) = BsdcGalleryImage(
        id = id,
        url = url,
        thumbUrl = "",
        purpose = "post-image",
        width = null,
        height = null,
        bytes = 1L,
        mimeType = "image/webp",
        createdAt = createdAt,
        expiresAt = null,
        inUse = false,
        uses = 0,
        surfaces = emptyList(),
        altText = "",
    )

    // ------------------------------------------------------------------ addresses

    @Test
    fun twoSpellingsOfOneAddressAreOnePicture() {
        assertEquals(
            "https://i.ibb.co/x/a.png",
            BsdcGalleryLogic.normaliseMediaUrl("  http://i.ibb.co/x/a.png/  "),
        )
        assertTrue(BsdcGalleryLogic.isSameMedia("https://i.ibb.co/x/a.png", "https://i.ibb.co/x/a.png/"))
        assertTrue(BsdcGalleryLogic.isSameMedia("http://i.ibb.co/x/a.png", "https://i.ibb.co/x/a.png"))
        // A different file at the same host is a different picture, however similar the names look.
        assertFalse(BsdcGalleryLogic.isSameMedia("https://i.ibb.co/x/a.png", "https://i.ibb.co/x/b.png"))
        // And nothing is never the same as nothing: an empty address must not mark every empty tile.
        assertFalse(BsdcGalleryLogic.isSameMedia("", ""))
        assertFalse(BsdcGalleryLogic.isSameMedia(null, "https://i.ibb.co/x/a.png"))
    }

    @Test
    fun anAttachedTileIsRecognisedByEitherOfItsAddresses() {
        val attached = BsdcGalleryLogic.attachedKeys(
            listOf("https://i.ibb.co/x/a.png/", "", null, "https://i.ibb.co/x/thumb.png"),
        )
        assertEquals(2, attached.size)
        assertTrue(BsdcGalleryLogic.isAttached(image("a", "https://i.ibb.co/x/a.png", "2026-01-01"), attached))
        assertTrue(
            BsdcGalleryLogic.isAttached(image("b", "https://i.ibb.co/x/thumb.png", "2026-01-01"), attached),
        )
        assertFalse(BsdcGalleryLogic.isAttached(image("c", "https://i.ibb.co/x/new.png", "2026-01-01"), attached))
    }

    // ------------------------------------------------------------------ paging

    @Test
    fun aRowThatLandsInTwoPagesIsShownOnce() {
        val a = image("a", "https://i.ibb.co/x/a.png", "2026-03-04T09:12:00Z")
        val b = image("b", "https://i.ibb.co/x/b.png", "2026-03-03T09:12:00Z")
        val c = image("", "https://i.ibb.co/x/noid.png", "2026-03-02T09:12:00Z")
        // First answer wins, because the earlier page is the one the member was looking at.
        val merged = BsdcGalleryLogic.dedupPages(listOf(listOf(a, b), listOf(b, c)))
        assertEquals(listOf("a", "b"), merged.map { it.id })
    }

    @Test
    fun aShortPageIsTheEndOfTheLibrary() {
        assertFalse(BsdcGalleryLogic.reachedEnd(GALLERY_PAGE_SIZE, GALLERY_PAGE_SIZE))
        assertTrue(BsdcGalleryLogic.reachedEnd(41, GALLERY_PAGE_SIZE))
        // An empty page is the end too, so nothing keeps a sentinel watching for more.
        assertTrue(BsdcGalleryLogic.reachedEnd(0, GALLERY_PAGE_SIZE))
    }

    @Test
    fun aTrailingSpaceIsAKeystrokeAndNotANewSearch() {
        assertFalse(BsdcGalleryLogic.shouldResetFor("all", "monsoon", "all", "monsoon  "))
        assertTrue(BsdcGalleryLogic.shouldResetFor("all", "monsoon", "all", "monsoon two"))
        assertTrue(BsdcGalleryLogic.shouldResetFor("all", "monsoon", "cover", "monsoon"))
    }

    @Test
    fun aFieldFullOfPicturesAsksForNoMore() {
        assertEquals(5, BsdcGalleryLogic.roomFor(3, 8))
        assertEquals(0, BsdcGalleryLogic.roomFor(8, 8))
        // A draft that already holds more than the device allows — eight screenshots opened on
        // a build that permits six — must not offer a negative number of slots.
        assertEquals(0, BsdcGalleryLogic.roomFor(8, 6))
    }

    // ------------------------------------------------------------------ selection

    @Test
    fun tappingATileAddsItAndTappingItAgainTakesItBack() {
        val one = BsdcGalleryLogic.toggle(emptyList(), "a", 2)
        val two = BsdcGalleryLogic.toggle(one, "b", 1)
        assertEquals(listOf("a", "b"), two)
        assertEquals(listOf("a"), BsdcGalleryLogic.toggle(two, "b", 0))
    }

    @Test
    fun theTapThatDoesNotFitIsTheOneRefused() {
        val selected = BsdcGalleryLogic.toggle(listOf("a"), "b", 0)
        // Room is counted before the tap, so the picture already chosen is never displaced by a
        // later one — losing a selection the member can see is worse than ignoring a click.
        assertEquals(listOf("a"), selected)
    }

    @Test
    fun anAnswerIsInTheOrderItWasChosenAndCarriesNothingAttached() {
        val a = image("a", "https://i.ibb.co/x/a.png", "2026-03-04")
        val b = image("b", "https://i.ibb.co/x/b.png", "2026-03-03")
        val attached = BsdcGalleryLogic.attachedKeys(listOf("https://i.ibb.co/x/b.png"))
        val picked = BsdcGalleryLogic.picked(listOf(a, b), listOf("b", "a"), attached)
        // Chosen first but already on the surface, so it is not an answer; the other one is.
        assertEquals(listOf("a"), picked.map { it.id })
        // An id with no row in front of the member is not an answer either — it is a selection
        // that outlived the list it came from.
        assertTrue(BsdcGalleryLogic.picked(listOf(a), listOf("zz"), emptySet()).isEmpty())
    }

    // ------------------------------------------------------------------ the day headings

    @Test
    fun daysAreCutAtAChangeAndNotReSorted() {
        val items = listOf(
            image("a", "https://i.ibb.co/x/a.png", "2026-03-04T09:12:00Z"),
            image("b", "https://i.ibb.co/x/b.png", "2026-03-04T01:00:00Z"),
            image("c", "https://i.ibb.co/x/c.png", "2026-03-03T22:00:00Z"),
            image("d", "https://i.ibb.co/x/d.png", "2026-03-04T08:00:00Z"),
        )
        val sections = BsdcGalleryLogic.groupByDay(items) { iso -> iso.take(10) }
        // Four rows, three headings: the fourth picture is the same day as the first, and re-sorting
        // here would disagree with the keyset cursor that ordered them.
        assertEquals(
            listOf("2026-03-04", "2026-03-03", "2026-03-04"),
            sections.map { it.day },
        )
        assertEquals(listOf(2, 1, 1), sections.map { it.items.size })
        // A heading is keyed on its first row, so a recomposition cannot mix two runs of one day.
        assertEquals("2026-03-04-a", sections.first().key)
        assertEquals("2026-03-04-d", sections.last().key)
    }

    // ------------------------------------------------------------------ the shelves

    @Test
    fun theShelvesAreTheWebsShelvesInOrder() {
        val contract = readRepoFile("main-site", "src", "lib", "storage", "media-contract.ts")
        val block = Regex("""GALLERY_FILTERS\s*:\s*[^=]+=\s*\[(.*?)]""", RegexOption.DOT_MATCHES_ALL)
            .find(contract)
            ?.groupValues
            ?.get(1)
            ?: error("GALLERY_FILTERS not found in the web's media contract")
        val web = Regex("'([^']+)'").findAll(block).map { it.groupValues[1] }.toList()
        assertEquals("both clients must offer the same shelves, in the same order", web, GalleryFilter.entries.map { it.wire })
        // `'other'` is absent on purpose: the heading nobody labelled is not a shelf a member
        // should be invited to look for.
        assertFalse(web.contains("other"))
    }

    @Test
    fun everyShelfExceptAllAsksForOnePurpose() {
        GalleryFilter.entries.forEach { filter ->
            if (filter == GalleryFilter.ALL) {
                assertEquals(null, filter.purpose)
            } else {
                assertEquals(filter.wire, filter.purpose?.wireValue)
            }
        }
        assertEquals(GalleryFilter.ALL, GalleryFilter.of("mystery-shelf"))
        assertEquals(GalleryFilter.COVER, GalleryFilter.of(" cover "))
        assertEquals(GalleryFilter.PROJECT_COVER, GalleryFilter.of("project-cover"))
    }

    @Test
    fun everyShelfHasItsOwnWords() {
        val copy = GalleryCopy.forLanguage(false)
        val labels = GalleryFilter.entries.map { it.label(copy) }
        assertEquals("each shelf needs a name of its own", labels.size, labels.distinct().size)
        assertEquals("All", labels.first())
        assertNotEquals(labels.first(), copy.filterUnfiled)
    }

    // ------------------------------------------------------------------ the sentences

    @Test
    fun theShelfsWordsAreTheWebsWords() {
        // Not politeness. A member reads one product's sentences or they learn, by comparison, that
        // the phone and the laptop are two products — and a translator fixing one side would only
        // widen the gap. Every string below is looked up in the website's own catalogue.
        for (bn in listOf(true, false)) {
            val locale = localeFile(if (bn) "bn" else "en")
            val gallery = sectionOf(locale, "gallery", "tileNoAlt")
            val copy = GalleryCopy.forLanguage(bn)
            assertEquals("title", valueOf(gallery, "title"), copy.title)
            assertEquals("close", valueOf(gallery, "close"), copy.close)
            assertEquals("open", valueOf(gallery, "open"), copy.open)
            assertEquals("loading", valueOf(gallery, "loading"), copy.loading)
            assertEquals("count", valueOf(gallery, "count"), copy.count)
            assertEquals("grid", valueOf(gallery, "grid"), copy.grid)
            assertEquals("filters", valueOf(gallery, "filters"), copy.filters)
            assertEquals("search label", valueOf(gallery, "searchLabel"), copy.searchLabel)
            assertEquals(
                "search placeholder",
                valueOf(gallery, "searchPlaceholder"),
                copy.searchPlaceholder,
            )
            assertEquals("tile without a caption", valueOf(gallery, "tileNoAlt"), copy.tileNoAlt)
            assertEquals("already added", valueOf(gallery, "alreadyAttached"), copy.alreadyAttached)
            assertEquals("unpick", valueOf(gallery, "unpick"), copy.unpick)
            assertEquals("pick hint", valueOf(gallery, "pickHint"), copy.pickHint)
            assertEquals("selected count", valueOf(gallery, "selectedCount"), copy.selectedCount)
            assertEquals("add", valueOf(gallery, "add"), copy.add)
            assertEquals("add many", valueOf(gallery, "addCount"), copy.addCount)
            assertEquals("load more", valueOf(gallery, "loadMore"), copy.loadMore)
            assertEquals("loading more", valueOf(gallery, "loadingMore"), copy.loadingMore)
            assertEquals("end of library", valueOf(gallery, "endOfLibrary"), copy.endOfLibrary)
            assertEquals("empty", valueOf(gallery, "empty"), copy.empty)
            assertEquals("empty hint", valueOf(gallery, "emptyHint"), copy.emptyHint)
            assertEquals("no matches", valueOf(gallery, "noMatches"), copy.noMatches)
            assertEquals("no matches hint", valueOf(gallery, "noMatchesHint"), copy.noMatchesHint)
            assertEquals("clear filters", valueOf(gallery, "clearFilters"), copy.clearFilters)
            assertEquals("error", valueOf(gallery, "errorTitle"), copy.errorTitle)
            assertEquals("retry", valueOf(gallery, "retry"), copy.retry)
            // The key each shelf's name comes from is spelled out here rather than read back
            // through `label()`, because the one mistake a label table makes is pointing at a
            // neighbouring row — and a self-comparison would pass while the chips said
            // "Project covers" over the pictures shelf.
            val shelfKeys = mapOf(
                GalleryFilter.ALL to "filterAll",
                GalleryFilter.AVATAR to "filterAvatars",
                GalleryFilter.COVER to "filterCovers",
                GalleryFilter.PROJECT_COVER to "filterProjectCovers",
                GalleryFilter.PROJECT_IMAGE to "filterProjectShots",
                GalleryFilter.POST_IMAGE to "filterPosts",
                GalleryFilter.COMMENT_IMAGE to "filterComments",
                GalleryFilter.CHAT_IMAGE to "filterChat",
                GalleryFilter.PRODUCT_IMAGE to "filterProducts",
                GalleryFilter.AD_CREATIVE to "filterAds",
            )
            shelfKeys.forEach { (filter, webKey) ->
                assertEquals("shelf " + filter.wire, valueOf(gallery, webKey), filter.label(copy))
            }
            assertEquals("where a row is filed and nobody said", valueOf(gallery, "filterUnfiled"), copy.filterUnfiled)
            // The web nests this one (`media.gallery.errors.failed`); the app's copy
            // flattens it, and the test says which leaf it came from.
            assertEquals("a failed page", valueOf(gallery, "failed"), copy.errorsFailed)
        }
    }

    @Test
    fun theCountIsPutWhereTheWebPutThePlaceholder() {
        val copy = GalleryCopy.forLanguage(false)
        // The template is the website's, `{{count}}` and all, so a sentence that changes on the web
        // changes here too instead of being re-invented in a language the member was not reading.
        assertEquals("Add 3", copy.addLabel(3))
        assertEquals("Add", copy.addLabel(1))
        assertEquals("Add", copy.addLabel(0))
        assertEquals("3 selected", copy.withCount(copy.selectedCount, 3))
    }

    // --------------------------------------------------------------------------------------------
    // Cross-platform parity gates. These read the other side's source rather than a fixture copied
    // from it, so a rename on one client breaks the other one's test instead of producing two apps.
    // --------------------------------------------------------------------------------------------

    private fun localeFile(lang: String): String =
        readRepoFile("main-site", "src", "i18n", "locales", "$lang.ts")

    /** The body of `parent: { … }` whose text also contains [mustContain]. */
    private fun sectionOf(text: String, parent: String, mustContain: String): String {
        val header = Regex("""(?m)^([ \t]*)""" + Regex.escape(parent) + """:[ \t]*\{[ \t]*""")
        for (match in header.findAll(text)) {
            val indent = match.groupValues[1]
            val rest = text.substring(match.range.last + 1)
            val close = Regex("""(?m)^""" + Regex.escape(indent) + """\},[ \t]*""").find(rest)
            val body = rest.substring(0, close?.range?.first ?: rest.length)
            if (mustContain in body) return body
        }
        error("no `" + parent + "` section containing `" + mustContain + "` in the locale file")
    }

    /** A catalogue entry, single-quoted and possibly wrapped onto its own line, unescaped. */
    private fun valueOf(section: String, name: String): String {
        val entry = Regex(
            """(?m)^[ \t]*""" + Regex.escape(name) + """[ \t]*:[ \t]*(?:\r?\n[ \t]*)?'((?:[^'\\]|\\.)*)',""",
        ).find(section) ?: error("`" + name + "` not found in the locale section")
        return entry.groupValues[1].replace("\\'", "'").replace("\\\"", "\"")
    }

    private fun readRepoFile(vararg parts: String): String {
        // Tests run with the module directory as the working directory, so walk up to the repo root
        // instead of assuming how Gradle was launched.
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        repeat(8) {
            val candidate = dir?.let { root -> parts.fold(root) { acc, part -> acc.resolve(part) } }
            if (candidate != null && candidate.isFile) return candidate.readText()
            dir = dir?.parentFile
        }
        error("could not find " + parts.joinToString("/") + " above " + System.getProperty("user.dir"))
    }
}
