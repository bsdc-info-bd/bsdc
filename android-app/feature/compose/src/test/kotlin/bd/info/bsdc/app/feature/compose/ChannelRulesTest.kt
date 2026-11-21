package bd.info.bsdc.app.feature.compose

import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import kotlinx.serialization.json.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The rules behind group posting, checked without a device.
 *
 * Two kinds of test live here. The first pins behaviour that the database already decides and that
 * the composer must not contradict. The second reads the web's own source and the migration that
 * introduced the vocabulary, because the whole value of this parity is that Android, the web and
 * Postgres use the *same words* — and "same words" is exactly the kind of promise a test can hold.
 */
class ChannelRulesTest {

    private fun channel(
        id: String = "c1",
        slug: String = "release-notes",
        name: String = "Release notes",
        group: String = "BSDC",
        readOnly: Boolean = false,
        reason: ChannelBlockReason? = null,
    ) = PostableChannel(
        id = id,
        groupId = "g1",
        slug = slug,
        name = name,
        isReadOnly = readOnly,
        group = PostableChannel.GroupRef(slug = "bsdc", name = group),
        blockReason = reason,
    )

    @Test
    fun theFeedIsASentinelAndNotAnEmptyString() {
        // An empty string is what the web sends for "no channel" and a uuid for "this channel"; the
        // picker's value must survive that round trip exactly, or selecting the feed would look like
        // a channel whose id is "".
        assertNull(ChannelRules.channelIdFromValue(ChannelRules.FEED_OPTION_VALUE))
        assertEquals("7c3e", ChannelRules.channelIdFromValue("7c3e"))
        assertNull(ChannelRules.channelIdFromValue(""))
        assertEquals(ChannelRules.FEED_OPTION_VALUE, ChannelRules.valueForChannel(null))
        assertEquals("7c3e", ChannelRules.valueForChannel("7c3e"))
    }

    @Test
    fun aChannelRefusesPrivateAndNothingElse() {
        ComposerVisibility.entries.forEach { visibility ->
            val allowedInFeed = ChannelRules.visibilityAllowedInChannel(visibility, null)
            assertTrue("$visibility is always fine in the feed", allowedInFeed)
            assertEquals(
                "only private is refused in a channel",
                visibility != ComposerVisibility.PRIVATE,
                ChannelRules.visibilityAllowedInChannel(visibility, "c1"),
            )
        }
    }

    @Test
    fun choosingAChannelMovesTheAudienceRatherThanRefusingThePost() {
        // Mirrors `reconcileVisibility` in main-site/src/lib/channels/channel-options.ts. The channel
        // keeps its place and `private` becomes `followers`; the opposite (keeping private and dropping
        // the channel) would delete where the member said the post belongs.
        assertEquals(
            ComposerVisibility.FOLLOWERS,
            ChannelRules.reconcileVisibility(ComposerVisibility.PRIVATE, "c1"),
        )
        assertEquals(
            ComposerVisibility.PRIVATE,
            ChannelRules.reconcileVisibility(ComposerVisibility.PRIVATE, null),
        )
        assertEquals(
            ComposerVisibility.PUBLIC,
            ChannelRules.reconcileVisibility(ComposerVisibility.PUBLIC, "c1"),
        )
        // Reconciling an already-legal pair is the identity, so repeated selection cannot drift.
        val twice = ChannelRules.reconcileVisibility(ComposerVisibility.FOLLOWERS, "c1")
        assertEquals(twice, ChannelRules.reconcileVisibility(twice, "c1"))
    }

    @Test
    fun theChannelKeyIsOnlySentWhenTheMemberSaidSomething() {
        // save_post reads three states out of this: absent means leave alone, null means move to the
        // feed, a uuid means place it. A composer that always wrote the key would yank an edited post
        // out of its room on an unrelated save.
        assertFalse(ChannelRules.shouldSendChannelKey(channelTouched = false))
        assertTrue(ChannelRules.shouldSendChannelKey(channelTouched = true))
    }

    @Test
    fun anUnrecognisedReasonIsNoReason() {
        // Migration 0129 can grow a fifth reason; the labels only know four. Until the app learns the
        // new one, it must read as "writable" — the database will still refuse it on save with its own
        // sentence, which is better than the app inventing a door that was never closed.
        assertEquals(ChannelBlockReason.READ_ONLY, ChannelBlockReason.fromWire("channel/read-only"))
        assertEquals(ChannelBlockReason.NOT_MEMBER, ChannelBlockReason.fromWire("channel/not-member"))
        assertEquals(ChannelBlockReason.ARCHIVED, ChannelBlockReason.fromWire("channel/archived"))
        assertEquals(ChannelBlockReason.NOT_FOUND, ChannelBlockReason.fromWire("channel/not-found"))
        assertNull(ChannelBlockReason.fromWire("channel/something-new"))
        assertNull(ChannelBlockReason.fromWire(null))
        assertNull(ChannelBlockReason.fromWire(""))
    }

    @Test
    fun theRefusalVocabularyIsTheDatabases() {
        // Not a style choice. `save_post` raises these exact strings; a composer that paraphrased them
        // could not be matched against the error it produced.
        assertEquals("channel/read-only", ChannelBlockReason.READ_ONLY.wire)
        assertEquals("channel/not-member", ChannelBlockReason.NOT_MEMBER.wire)
        assertEquals("channel/archived", ChannelBlockReason.ARCHIVED.wire)
        assertEquals("channel/not-found", ChannelBlockReason.NOT_FOUND.wire)
        assertEquals(
            "channel/read-only",
            ChannelRules.refusalFor(channel(reason = ChannelBlockReason.READ_ONLY), ComposerVisibility.PUBLIC),
        )
        assertEquals(
            "channel/private-post",
            ChannelRules.refusalFor(channel(), ComposerVisibility.PRIVATE),
        )
        assertNull(ChannelRules.refusalFor(channel(), ComposerVisibility.PUBLIC))
    }

    @Test
    fun theFeedComesFirstAndGroupsKeepTheirOrder() {
        val copy = ChannelPickerCopy.forLanguage(bn = false)
        val channels = listOf(
            channel(id = "a", slug = "intro", group = "BSDC"),
            channel(id = "b", slug = "help", group = "Dhaka JS"),
            channel(id = "c", slug = "jobs", group = "BSDC"),
        )
        val sections = ChannelRules.sections(channels, copy)
        assertEquals(3, sections.size)
        assertEquals(listOf<ChannelOption>(ChannelOption.Feed), sections[0].options)
        assertEquals("BSDC", sections[1].label)
        assertEquals(listOf("a", "c"), sections[1].options.map { (it as ChannelOption.Channel).channel.id })
        assertEquals("Dhaka JS", sections[2].label)
        assertEquals(listOf("b"), sections[2].options.map { (it as ChannelOption.Channel).channel.id })
    }

    @Test
    fun aChannelWhoseGroupIsHiddenStillGetsItsOwnSection() {
        // The web labels such a section with the empty group name it was given; the app uses the group
        // id instead, because a section header that is blank looks like a rendering bug and a member
        // cannot tell which room they are about to post into.
        val copy = ChannelPickerCopy.forLanguage(bn = false)
        val orphan = PostableChannel(id = "x", groupId = "g-ghost", slug = "loose", name = "Loose")
        val sections = ChannelRules.sections(listOf(orphan), copy)
        assertEquals(2, sections.size)
        assertEquals("g-ghost", sections[1].label)
        assertTrue(sections[1].options.single() is ChannelOption.Channel)
    }

    @Test
    fun theLabelCarriesTheReasonAndTheName() {
        val copy = ChannelPickerCopy.forLanguage(bn = false)
        assertEquals(
            "#release-notes · Release notes (read-only)",
            ChannelRules.optionLabel(
                ChannelOption.Channel(channel(reason = ChannelBlockReason.READ_ONLY)),
                copy,
            ),
        )
        assertEquals(
            "#release-notes · Release notes",
            ChannelRules.optionLabel(ChannelOption.Channel(channel()), copy),
        )
        // A channel with no name of its own must not render as "#slug · ".
        assertEquals(
            "#slug-only",
            ChannelRules.optionLabel(
                ChannelOption.Channel(PostableChannel(id = "n", slug = "slug-only")),
                copy,
            ),
        )
        assertEquals(copy.feed, ChannelRules.optionLabel(ChannelOption.Feed, copy))
    }

    @Test
    fun aBlockedChannelIsListedButNotSelectable() {
        assertTrue(ChannelRules.isEnabled(ChannelOption.Feed))
        assertFalse(ChannelRules.isEnabled(ChannelOption.Channel(channel(reason = ChannelBlockReason.ARCHIVED))))
        assertTrue(ChannelRules.isEnabled(ChannelOption.Channel(channel())))
    }

    @Test
    fun aMissingVerdictLooksLikeAFreeRoomNeverLikeAnError() {
        // channel_post_block_many answers for fewer channels than it was asked about when a row is
        // hidden by RLS; the mapper must not turn "no verdict" into "refused".
        val rows = listOf(channel(id = "a"), channel(id = "b"), channel(id = "c"))
        val blocks = listOf(
            ChannelBlockRow(channelId = "b", block = "channel/not-member"),
            ChannelBlockRow(channelId = "a", block = "channel/whatever-the-future-invented"),
        )
        val combined = combineChannelRows(rows, blocks)
        assertEquals(listOf(null, ChannelBlockReason.NOT_MEMBER, null), combined.map { it.blockReason })
    }

    @Test
    fun aChannelRowDecodesWithTheEmbeddedGroupAndWithOutIt() {
        // PostgREST renders the embed as the relation name, `groups`, and it is null when the group row
        // is not visible to the reader — both shapes have to decode.
        val withGroup = """
            [{"id":"a","group_id":"g","slug":"s","name":"N","topic":"","is_read_only":true,
              "groups":{"slug":"bsdc","name":"BSDC"}}]
        """.trimIndent()
        val decoded = BsdcHttpClientFactory.sharedJson.decodeFromString<List<PostableChannel>>(withGroup)
        assertEquals(1, decoded.size)
        assertTrue(decoded.single().isReadOnly)
        assertEquals("BSDC", decoded.single().groupLabel)

        val withoutGroup = """[{"id":"a","slug":"s","name":"N","groups":null,"extra":42}]"""
        val bare = BsdcHttpClientFactory.sharedJson.decodeFromString<List<PostableChannel>>(withoutGroup)
        assertEquals("", bare.single().groupLabel)
        assertTrue("a channel with no verdict is writable", bare.single().isWritable)
    }

    // --------------------------------------------------------------------------------------------
    // Cross-platform parity gates. These read source files rather than a fixture, so a rename on one
    // side breaks the other side's test instead of silently producing two different apps.
    // --------------------------------------------------------------------------------------------

    @Test
    fun theWebKnowsTheSameFourReasons() {
        val source = readRepoFile("main-site", "src", "lib", "channels", "channel-repository.ts")
        val block = Regex("""CHANNEL_BLOCK_REASONS\s*=\s*\[(.*?)]""", RegexOption.DOT_MATCHES_ALL)
            .find(source)
            ?.groupValues
            ?.get(1)
            ?: error("CHANNEL_BLOCK_REASONS not found in the web's channel repository")
        val reasons = Regex("""'([^']+)'""").findAll(block).map { it.groupValues[1] }.toList()
        assertEquals(
            "the app and the web must refuse with the same vocabulary",
            ChannelBlockReason.entries.map { it.wire },
            reasons,
        )
    }

    @Test
    fun theMigrationStillSpeaksTheseStrings() {
        val sql = readRepoFile("supabase", "migrations", "0129_a_post_finds_its_channel.sql")
        ChannelBlockReason.entries.forEach { reason ->
            assertTrue("${reason.wire} must exist in the migration", sql.contains("'${reason.wire}'"))
        }
        assertTrue(sql.contains("channel/private-post"))
        // The three-state contract `shouldSendChannelKey` exists to honour.
        // `p_post ? 'channel_id'` is the key-presence test that makes the three states real; if the
        // migration ever stops distinguishing it, the composer's `channelTouched` guard is meaningless.
        assertTrue(
            "save_post must test for the key's presence, not just its value",
            sql.contains("p_post ? 'channel_id'"),
        )
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
