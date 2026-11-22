package bd.info.bsdc.app.feature.feed

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Reading one room's timeline.
 *
 * The website has had a channel page since migration 0129 gave a post a home: `channel_feed(channel,
 * limit, before)` answers with that room's posts in the reader's order, and `/g/{group}/c/{channel}`
 * renders them. Android could write into a room before it could read one, which is the wrong way round:
 * a member who posts into `#ship-it` and then cannot see what anyone else said there has been given a
 * megaphone and no ears.
 *
 * So this is the read side, and everything in it that a member can read is the website's own copy.
 * What lives here is the part that does not need a screen — the RPC's argument names, the paging rule,
 * the four answers a page can have — because those are the parts that break silently when the other
 * side moves. `ChannelFeedTest` pins the argument names against
 * `supabase/migrations/0129_a_post_finds_its_channel.sql` and the sentences against the web's locale
 * files: the two ways this feature could stop matching the site it mirrors without any Kotlin changing.
 */
object ChannelFeed {
    /** The RPC migration 0129 introduced. It is the *reader's* view: RLS decides, the client obeys. */
    const val RPC_NAME = "channel_feed"
    const val PARAM_CHANNEL_ID = "p_channel_id"
    const val PARAM_LIMIT = "p_limit"
    const val PARAM_BEFORE = "p_before"

    /** The web's page size for a room. 30 keeps the first paint small and the cursor honest. */
    const val PAGE_SIZE = 30

    /**
     * The columns the header needs, and no more.
     *
     * `groups(slug,name)` is the embed that lets the page say "Back to BSDCLand" without a second
     * request. Nothing sensitive is in here: for a room the member may not read, PostgREST returns no
     * row at all, which is why [ChannelFeedPage.Unreachable] and a typo are the same answer on screen.
     */
    const val CHANNEL_SELECT = "id,slug,name,topic,is_read_only,groups(slug,name)"

    /** Another page is offered only when the last one was full — a short page is the end of the room. */
    fun canLoadMore(fetched: Int, pageSize: Int = PAGE_SIZE): Boolean = fetched >= pageSize

    /** The cursor for the next page: the oldest row this page returned, as the RPC wants it. */
    fun cursorFor(rows: List<ChannelFeedRow>): String? = rows.lastOrNull()?.publishedAt?.takeIf { it.isNotBlank() }

    /**
     * The room, flattened for the header.
     *
     * The group's name is what the page prints and its slug is what the page links with, so the row's
     * embed is preferred and the address the member arrived at is the fallback — a room whose group row
     * is hidden still has to render, because hiding the header would hide the posts under it too.
     */
    fun roomOf(row: ChannelRow, askedGroupSlug: String): ChannelRoom {
        val group = row.groups
        val slug = group?.slug?.trim().orEmpty().ifEmpty { askedGroupSlug }
        val name = group?.name?.trim().orEmpty().ifEmpty { slug }
        return ChannelRoom(
            id = row.id,
            slug = row.slug,
            name = row.name,
            topic = row.topic?.trim()?.takeIf { it.isNotEmpty() },
            isReadOnly = row.isReadOnly,
            groupSlug = slug,
            groupName = name,
        )
    }

    /** A channel row's title, in the app's one spelling: one hash, no double hash. */
    fun titleOf(name: String): String = "# ${name.trim().removePrefix("#").trim()}"
}

/** One row of `channel_feed`'s answer: which post, and when — the latter is the cursor. */
@Serializable
data class ChannelFeedRow(
    @SerialName("post_id") val postId: String = "",
    @SerialName("published_at") val publishedAt: String = "",
)

/** The `channels` row the header needs, with the owning group embedded. */
@Serializable
data class ChannelRow(
    val id: String = "",
    val slug: String = "",
    val name: String = "",
    val topic: String? = null,
    @SerialName("is_read_only") val isReadOnly: Boolean = false,
    val groups: RoomGroupRow? = null,
)

/** The group behind a room. `channels.group_id` is a real foreign key, so the embed is one hop. */
@Serializable
data class RoomGroupRow(
    val slug: String = "",
    val name: String = "",
)

/** The room header, flattened out of the `channels` row and its `groups` embed. */
data class ChannelRoom(
    val id: String,
    val slug: String,
    val name: String,
    val topic: String?,
    val isReadOnly: Boolean,
    val groupSlug: String,
    val groupName: String,
) {
    val title: String get() = ChannelFeed.titleOf(name)
}

/** What asking for a room's timeline produced. Kept apart so a screen never shows a spinner forever. */
sealed interface ChannelFeedPage {
    data class Ready(
        val room: ChannelRoom,
        val posts: List<FeedPost>,
        val nextCursor: String?,
    ) : ChannelFeedPage

    /**
     * No room answers at this address, for one of two reasons the client cannot and should not
     * distinguish: it is not there, or the member may not read it. The website says the same thing in
     * both cases, and so does this — a private room that announced itself would be a leak.
     */
    data object Unreachable : ChannelFeedPage

    /** The request itself failed. Worth its own state: a network is not a locked door. */
    data class Failed(val message: String) : ChannelFeedPage
}

/**
 * The room page's sentences, in the reader's language.
 *
 * Every string is the website's `channels.*` translation, copied out of
 * `main-site/src/i18n/locales/{en,bn}.ts` rather than retyped, with `{{group}}` left in place for the
 * two that interpolate a name. `ChannelFeedTest` reads both catalogues and fails if either side is
 * edited, which is what keeps "the app says the same thing" a fact rather than an intention.
 */
data class ChannelFeedCopy(
    val emptyTitle: String,
    val emptyBody: String,
    val failed: String,
    val notFoundTitle: String,
    val notFoundBody: String,
    val backToGroup: String,
    val postHere: String,
    /**
     * The web's shared list label (`profile.social.loadMore`), which is also what the rest of the app
     * says, because a "load more" that reads differently on two screens of one app is a detail a
     * member does notice.
     */
    val loadMore: String,
    val readOnlyNote: String,
    val memberNote: String,
    val missingNote: String,
) {
    /** `channels.emptyBody`, with the group's name where the web puts `{{group}}`. */
    fun emptyBodyFor(groupName: String): String = emptyBody.replace("{{group}}", groupName)

    /** `channels.backToGroup`, the label on the affordance that returns to the group page. */
    fun backToGroupFor(groupName: String): String = backToGroup.replace("{{group}}", groupName)

    companion object {
        fun forLanguage(language: AppLanguage): ChannelFeedCopy = if (language == AppLanguage.BN) {
            ChannelFeedCopy(
                emptyTitle = "এখনো কোনো পোস্ট নেই",
                emptyBody = "এই চ্যানেলে লেখা পোস্টগুলো এখানে দেখা যাবে। {{group}} থেকে জানান।",
                failed = "এই চ্যানেলটি টেনে আনা সম্ভব হয়নি",
                notFoundTitle = "এই চ্যানেলটি নেই",
                notFoundBody = "এই ঠিকানায় কোনো চ্যানেল খোলা যায় না।",
                backToGroup = "{{group}} এ ফিরে যান",
                postHere = "এই চ্যানেলে পোস্ট করুন",
                readOnlyNote = "এই চ্যানেলটি পড়া-র জন্য নয়; মডারেটররা এখানে পোস্ট করে।",
                memberNote = "আপনি এই চ্যানেলের মালিক গ্রুপের সদস্য নন।",
                missingNote = "সেই চ্যানেলটি আছে না।",
                loadMore = "আরও দেখুন",
            )
        } else {
            ChannelFeedCopy(
                emptyTitle = "No posts yet",
                emptyBody = "Posts written into this channel appear here. Ask in {{group}}.",
                failed = "This channel could not be loaded",
                notFoundTitle = "This channel is not here",
                notFoundBody = "No channel opens at this address.",
                backToGroup = "Back to {{group}}",
                postHere = "Post in this channel",
                readOnlyNote = "This channel is read-only; a moderator posts here.",
                memberNote = "You are not a member of the group that owns this channel.",
                missingNote = "That channel does not exist.",
                loadMore = "Load more",
            )
        }
    }
}
