package bd.info.bsdc.app.feature.feed

import bd.info.bsdc.app.core.model.AppLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The room timeline's rules, checked without a device.
 *
 * Three kinds of test, in the order that matters. The paging rule is the one a client gets wrong on its
 * own (offering "load more" forever, or never). The header's fallbacks are the ones that decide whether a
 * post written into a room still renders when the room's group row is hidden. And the last two read the
 * *other* side of this repository — migration 0129 and the web's locale files — because a channel page
 * that calls a renamed RPC, or says the wrong sentence, is a channel page that has stopped being the
 * website's.
 */
class ChannelFeedTest {
    // ---------------------------------------------------------------- paging

    @Test
    fun aFullPageIsTheOnlyReasonToOfferAnother() {
        assertTrue(ChannelFeed.canLoadMore(ChannelFeed.PAGE_SIZE))
        assertTrue("a page that over-shot still means there is more", ChannelFeed.canLoadMore(ChannelFeed.PAGE_SIZE + 1))
        assertFalse(ChannelFeed.canLoadMore(ChannelFeed.PAGE_SIZE - 1))
        assertFalse("an empty room is the end, not a reason to spin", ChannelFeed.canLoadMore(0))
    }

    @Test
    fun theCursorIsTheOldestRowOfThePage() {
        assertNull(ChannelFeed.cursorFor(emptyList()))
        val rows = listOf(
            ChannelFeedRow(postId = "p1", publishedAt = "2026-11-20T09:00:00Z"),
            ChannelFeedRow(postId = "p2", publishedAt = "2026-11-19T08:00:00Z"),
        )
        assertEquals("2026-11-19T08:00:00Z", ChannelFeed.cursorFor(rows))
        // A row that carries no timestamp cannot be a cursor: `p_before` would then be asked to filter
        // on an empty string, which reads as "older than nothing" and returns an empty page forever.
        assertNull(ChannelFeed.cursorFor(listOf(ChannelFeedRow(postId = "p1", publishedAt = "   "))))
    }

    // ---------------------------------------------------------------- header

    @Test
    fun theRoomPrefersTheEmbeddedGroupAndFallsBackToTheAddress() {
        val row = ChannelRow(
            id = "c1",
            slug = "ship-it",
            name = "Ship it",
            topic = "  Releases  ",
            isReadOnly = false,
            groups = RoomGroupRow(slug = "bsdcland", name = "BSDCLand"),
        )
        val room = ChannelFeed.roomOf(row, askedGroupSlug = "ignored")
        assertEquals("c1", room.id)
        assertEquals("ship-it", room.slug)
        assertEquals("# Ship it", room.title)
        assertEquals("Releases", room.topic)
        assertEquals("BSDCLand", room.groupName)
        assertEquals("bsdcland", room.groupSlug)
    }

    @Test
    fun aRoomWhoseGroupIsHiddenStillRenders() {
        // RLS can show a channel and hide its group row — the page then has an address to go back to but
        // no name for it. The slug is the answer, exactly as `PostCard.tsx` uses `groupName ?? groupSlug`.
        val row = ChannelRow(id = "c1", slug = "ship-it", name = "Ship it", groups = null)
        val room = ChannelFeed.roomOf(row, askedGroupSlug = "bsdcland")
        assertEquals("bsdcland", room.groupSlug)
        assertEquals("bsdcland", room.groupName)
    }

    @Test
    fun aBlankTopicIsNoTopic() {
        val row = ChannelRow(id = "c1", slug = "s", name = "N", topic = "   ", groups = RoomGroupRow(slug = "g"))
        assertNull(ChannelFeed.roomOf(row, askedGroupSlug = "g").topic)
    }

    @Test
    fun oneHashAndOnlyOne() {
        assertEquals("# general", ChannelFeed.titleOf("general"))
        assertEquals("# general", ChannelFeed.titleOf("  # general  "))
        assertEquals("# help-desk", ChannelFeed.titleOf("#help-desk"))
    }

    // ---------------------------------------------------------------- parity

    @Test
    fun theRpcIsCalledWithTheArgumentsTheMigrationDeclares() {
        val sql = readRepoFile("supabase", "migrations", "0129_a_post_finds_its_channel.sql")
        assertTrue(
            "channel_feed must be declared in migration 0129 — this screen calls it by that name",
            sql.contains("function public.${ChannelFeed.RPC_NAME}("),
        )
        val signature = Regex("""channel_feed\((.*?)\)""", RegexOption.DOT_MATCHES_ALL)
            .find(sql)
            ?: error("channel_feed's parameter list is no longer readable in the migration")
        val declared = Regex("""p_[a-z_]+""")
            .findAll(signature.groupValues[1])
            .map { it.value }
            .toList()
        assertEquals(
            "the app's arguments must be the routine's, in the order it declares them",
            listOf(ChannelFeed.PARAM_CHANNEL_ID, ChannelFeed.PARAM_LIMIT, ChannelFeed.PARAM_BEFORE),
            declared,
        )
    }

    @Test
    fun everySentenceIsTheWebsitesOwn() {
        for (bn in listOf(true, false)) {
            val file = readRepoFile("main-site", "src", "i18n", "locales", "${if (bn) "bn" else "en"}.ts")
            val channels = sectionOf(file, "channels", "privatePost:")
            val errors = sectionOf(channels, "errors", "readOnly:")
            val social = sectionOf(file, "social", "emptyFollowers:")
            val copy = ChannelFeedCopy.forLanguage(if (bn) AppLanguage.BN else AppLanguage.EN)
            assertEquals("empty title", valueOf(channels, "emptyTitle"), copy.emptyTitle)
            assertEquals("empty body", valueOf(channels, "emptyBody"), copy.emptyBody)
            assertEquals("failed", valueOf(channels, "failed"), copy.failed)
            assertEquals("not found title", valueOf(channels, "notFoundTitle"), copy.notFoundTitle)
            assertEquals("not found body", valueOf(channels, "notFoundBody"), copy.notFoundBody)
            assertEquals("back to group", valueOf(channels, "backToGroup"), copy.backToGroup)
            assertEquals("post here", valueOf(channels, "postHere"), copy.postHere)
            assertEquals("read-only note", valueOf(errors, "readOnly"), copy.readOnlyNote)
            assertEquals("member note", valueOf(errors, "notMember"), copy.memberNote)
            assertEquals("missing note", valueOf(errors, "notFound"), copy.missingNote)
            assertEquals("load more", valueOf(social, "loadMore"), copy.loadMore)
        }
    }

    /**
     * The interpolation is part of the parity, not a detail of it: the web fills `{{group}}` and so must
     * the app, in the same position, with the same punctuation around it.
     */
    @Test
    fun theGroupNameGoesWhereTheTemplateSays() {
        for (bn in listOf(true, false)) {
            val file = readRepoFile("main-site", "src", "i18n", "locales", "${if (bn) "bn" else "en"}.ts")
            val channels = sectionOf(file, "channels", "privatePost:")
            val copy = ChannelFeedCopy.forLanguage(if (bn) AppLanguage.BN else AppLanguage.EN)
            assertEquals(
                "empty body, rendered",
                valueOf(channels, "emptyBody").replace("{{group}}", MARK),
                copy.emptyBodyFor(MARK),
            )
            assertEquals(
                "back to group, rendered",
                valueOf(channels, "backToGroup").replace("{{group}}", MARK),
                copy.backToGroupFor(MARK),
            )
        }
    }

    private companion object {
        /** Stands in for a group's name, so the test compares the sentence around it. */
        const val MARK = "\u25e6"
    }

    // ---------------------------------------------------------------- helpers

    /**
     * The body of `parent: { … }` whose text also contains [mustContain].
     *
     * Leaf names are reused across the catalogue — `posts`, `readOnly`, `notFound` all appear more than
     * once — so a parser that took the first match could compare this app against another section's
     * words and pass while proving nothing.
     */
    private fun sectionOf(text: String, parent: String, mustContain: String): String {
        val header = Regex("""(?m)^[ \t]*""" + Regex.escape(parent) + """:[ \t]*\{[ \t]*""")
        for (match in header.findAll(text)) {
            val indent = match.groupValues[1]
            val rest = text.substring(match.range.last + 1)
            val close = Regex("""(?m)^""" + Regex.escape(indent) + """\},[ \t]*""").find(rest)
            val body = rest.substring(0, close?.range?.first ?: rest.length)
            if (mustContain in body) return body
        }
        error("no `" + parent + "` section containing `" + mustContain + "`")
    }

    /** A catalogue entry: single-quoted, possibly wrapped onto its own line, unescaped. */
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
        repeat(6) {
            val candidate = dir?.let { root -> parts.fold(root) { acc, part -> acc.resolve(part) } }
            if (candidate != null && candidate.isFile) return candidate.readText()
            dir = dir?.parentFile
        }
        error("could not find ${parts.joinToString("/")} above ${System.getProperty("user.dir")}")
    }
}
