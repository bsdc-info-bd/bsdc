package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GroupDetailLogicTest {
    private companion object {
        /** Stands in for `{{count, number}}` on both sides of the comparison. */
        const val COUNT_MARK = "\u25e6"
    }

    @Test
    fun webUrlUsesGroupRouteAndEncodesSlug() {
        assertEquals("https://www.bsdc.info.bd/g/dhaka%20devs", GroupDetailLogic.webUrl(" dhaka devs "))
    }

    @Test
    fun memberAlwaysOpensTheGroup() {
        assertEquals(GroupJoinAction.OPEN, GroupDetailLogic.joinAction("secret", "member", null, true))
    }

    @Test
    fun signedOutViewerCannotJoin() {
        assertEquals(GroupJoinAction.CLOSED, GroupDetailLogic.joinAction("public", null, null, false))
    }

    @Test
    fun publicGroupJoinsDirectlyAndPrivateGroupTakesARequest() {
        assertEquals(GroupJoinAction.JOIN, GroupDetailLogic.joinAction("public", null, null, true))
        assertEquals(GroupJoinAction.REQUEST, GroupDetailLogic.joinAction("private", null, null, true))
    }

    @Test
    fun pendingRequestWinsOverPrivacy() {
        assertEquals(GroupJoinAction.PENDING, GroupDetailLogic.joinAction("private", null, "pending", true))
    }

    @Test
    fun secretGroupIsInviteOnly() {
        assertEquals(GroupJoinAction.CLOSED, GroupDetailLogic.joinAction("secret", null, null, true))
    }

    @Test
    fun moderationRightsFollowRoleRank() {
        assertTrue(GroupDetailLogic.canModerate("owner"))
        assertTrue(GroupDetailLogic.canModerate("moderator"))
        assertFalse(GroupDetailLogic.canModerate("member"))
        assertFalse(GroupDetailLogic.canModerate(null))
        assertTrue(GroupDetailLogic.canAdminister("admin"))
        assertFalse(GroupDetailLogic.canAdminister("moderator"))
    }

    @Test
    fun membersSortByRankThenJoinOrder() {
        data class M(val name: String, val role: String, val joined: String)
        val sorted = GroupDetailLogic.sortMembers(
            listOf(
                M("late member", "member", "2026-11-10T10:00:00Z"),
                M("early member", "member", "2026-11-01T10:00:00Z"),
                M("admin", "admin", "2026-11-09T10:00:00Z"),
                M("owner", "owner", "2026-11-12T10:00:00Z"),
            ),
            roleOf = { it.role },
            joinedAtOf = { it.joined },
        )
        assertEquals(listOf("owner", "admin", "early member", "late member"), sorted.map { it.name })
    }

    @Test
    fun memberSearchMatchesNameAndHandleIgnoringCase() {
        val roster = listOf("Rahim Uddin" to "rahim", "Karim" to "karim99", "Fatima" to "fatima")
        fun find(query: String) = GroupDetailLogic.searchMembers(
            roster,
            query,
            nameOf = { it.first },
            handleOf = { it.second },
        ).map { it.first }

        assertEquals(listOf("Rahim Uddin", "Karim", "Fatima"), find("  "))
        assertEquals(listOf("Rahim Uddin"), find("rahim u"))
        assertEquals(listOf("Karim"), find("KARIM99"))
        assertEquals(listOf("Fatima"), find("tim"))
        assertEquals(emptyList<String>(), find("nobody"))
    }

    @Test
    fun channelTitleHasExactlyOneHash() {
        assertEquals("# general", GroupDetailLogic.channelTitle("general"))
        assertEquals("# general", GroupDetailLogic.channelTitle("  # general  "))
        assertEquals("# help-desk", GroupDetailLogic.channelTitle("help-desk"))
    }

    @Test
    fun theCountBadgeSaysWhatTheWebsiteSays() {
        assertEquals("3 posts", GroupDetailLogic.postCountLabel("3", 3, bn = false))
        assertEquals("1 post", GroupDetailLogic.postCountLabel("1", 1, bn = false))
        // Bengali counts with a classifier instead of a plural, so one and many read the same way.
        assertEquals("৩টি পোস্ট", GroupDetailLogic.postCountLabel("৩", 3, bn = true))
        assertEquals("১টি পোস্ট", GroupDetailLogic.postCountLabel("১", 1, bn = true))
    }

    @Test
    fun theCountSentenceIsTheWebsitesOwnTemplate() {
        // The badge is not this screen's phrasing: it is `channels.posts` / `channels.postsOne` from
        // the website's catalogue, rendered. A marker stands in for the number on both sides, so the
        // test compares sentences rather than digits, and still fails the moment either side reword it
        // — including the Bengali classifier `টি`, which is what a hand-written label usually drops.
        for (bn in listOf(true, false)) {
            val file = localeFile(if (bn) "bn" else "en")
            val channels = sectionOf(file, "channels", "privatePost:")
            for (count in listOf(1, 3)) {
                val key = if (count == 1) "postsOne" else "posts"
                val rendered = valueOf(channels, key).replace("{{count, number}}", COUNT_MARK)
                assertEquals(rendered, GroupDetailLogic.postCountLabel(COUNT_MARK, count, bn))
            }
        }
    }

    private fun localeFile(lang: String): String = readRepoFile("main-site", "src", "i18n", "locales", "$lang.ts")

    private fun sectionOf(text: String, parent: String, mustContain: String): String {
        // The indent is captured so the section can end at _its own_ `},`. This helper is copied into
        // three modules' test sources, and a missing bracket here is what `68ed300` found in one of
        // them: `groupValues[1]` on a regex with no group throws before a string is compared, so the
        // test fails with IndexOutOfBoundsException rather than with a parity finding.
        val header = Regex("""(?m)^([ \t]*)""" + Regex.escape(parent) + """:[ \t]*\{[ \t]*""")
        for (match in header.findAll(text)) {
            val indent = match.groupValues[1]
            val rest = text.substring(match.range.last + 1)
            val close = Regex("""(?m)^""" + Regex.escape(indent) + """\},[ \t]*""").find(rest)
            val body = rest.substring(0, close?.range?.first ?: rest.length)
            if (mustContain in body) return body
        }
        error("no `" + parent + "` section in the locale file")
    }

    private fun valueOf(section: String, name: String): String {
        val entry = Regex(
            """(?m)^[ \t]*""" + Regex.escape(name) + """[ \t]*:[ \t]*(?:\r?\n[ \t]*)?'((?:[^'\\]|\\.)*)',""",
        ).find(section) ?: error("`" + name + "` not found in the locale section")
        return entry.groupValues[1].replace("\\'", "'").replace("\\\"", "\"")
    }

    private fun readRepoFile(vararg parts: String): String {
        var dir: java.io.File? = java.io.File(System.getProperty("user.dir")).absoluteFile
        repeat(6) {
            val candidate = dir?.let { root -> parts.fold(root) { acc, part -> acc.resolve(part) } }
            if (candidate != null && candidate.isFile) return candidate.readText()
            dir = dir?.parentFile
        }
        error("could not find ${parts.joinToString("/")} above ${System.getProperty("user.dir")}")
    }
}
