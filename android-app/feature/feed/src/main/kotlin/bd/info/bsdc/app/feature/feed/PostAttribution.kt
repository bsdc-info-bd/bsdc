package bd.info.bsdc.app.feature.feed

import bd.info.bsdc.app.core.model.FeedPost

/**
 * Where a post was written, for the line a card shows under the author.
 *
 * The website has said this for a while — `PostCard.tsx` prints the channel and the group under the
 * author when a post belongs to a room. The app dropped the information before it reached the screen:
 * the PostgREST embed could supply it, the DTO never asked, so a channel post and a feed post looked
 * identical in the one list where the difference matters.
 *
 * The rule is the web's, condition included: the line appears only when *both* a channel name and a
 * group are known, because a room nobody can reach is not attribution — it is a dead end with a `#`
 * in front of it.
 */
data class PostAttribution(val channelLabel: String, val groupLabel: String) {
    /** One line of type, ready to print. The middle dot is the web's separator. */
    fun format(): String = "$channelLabel · $groupLabel"
}

fun FeedPost.attribution(): PostAttribution? {
    val channel = channelName?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val slug = channelGroupSlug?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    // `groupName ?? groupSlug`, exactly as `PostCard.tsx` writes it: the human name when the row
    // carried one, the address when it did not.
    val groupLabel = channelGroupName?.trim()?.takeIf { it.isNotEmpty() } ?: slug
    return PostAttribution(
        channelLabel = "#${channel.removePrefix("#")}",
        groupLabel = groupLabel,
    )
}
