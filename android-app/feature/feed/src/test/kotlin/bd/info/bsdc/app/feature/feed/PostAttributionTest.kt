package bd.info.bsdc.app.feature.feed

import bd.info.bsdc.app.core.model.FeedPost
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The card's "where was this written" line.
 *
 * Small rule, worth its test: the line is the only thing telling a reader that a post in their feed
 * came from a room they are not in, and the condition for showing it has to be the website's, or the
 * same post is annotated in a browser and anonymous on the phone.
 */
class PostAttributionTest {
    private fun post(
        channelName: String? = "Release notes",
        groupSlug: String? = "bsdcland",
        groupName: String? = "BSDCLand",
    ) = FeedPost(id = "p1", channelName = channelName, channelGroupSlug = groupSlug, channelGroupName = groupName)

    @Test
    fun aFeedPostSaysNothing() {
        assertNull(post(channelName = null).attribution())
        assertNull(post(channelName = "   ").attribution())
        assertNull(FeedPost(id = "p1").attribution())
    }

    @Test
    fun aChannelWithNoReachableGroupSaysNothingEither() {
        // The web's guard is `channelName !== null && groupSlug !== null`; without the group slug there
        // is no room to link to, so an app-side label would be a dead end wearing a hash sign.
        assertNull(post(groupSlug = null).attribution())
        assertNull(post(groupSlug = "").attribution())
    }

    @Test
    fun theLabelIsHashThenNameThenGroup() {
        assertEquals(
            PostAttribution("#Release notes", "BSDCLand"),
            post().attribution(),
        )
        assertEquals("#Release notes · BSDCLand", post().attribution()?.format())
    }

    @Test
    fun theGroupNameFallsBackToTheAddress() {
        // `groupName ?? groupSlug`, as `PostCard.tsx` writes it.
        assertEquals("bsdcland", post(groupName = null)?.attribution()?.groupLabel)
        assertEquals("bsdcland", post(groupName = "   ")?.attribution()?.groupLabel)
    }

    @Test
    fun aPrependedHashIsNotDoubled() {
        assertEquals("#ship-it", post(channelName = "#ship-it")?.attribution()?.channelLabel)
    }

    @Test
    fun surroundingSpacesAreNotPartOfTheName() {
        assertEquals("#Release notes · BSDCLand", post(channelName = "  Release notes  ")?.attribution()?.format())
        assertEquals("BSDCLand", post(groupName = " BSDCLand ")?.attribution()?.groupLabel)
    }
}
