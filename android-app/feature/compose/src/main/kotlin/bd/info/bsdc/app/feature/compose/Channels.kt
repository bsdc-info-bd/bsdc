package bd.info.bsdc.app.feature.compose

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Posting into a group channel, and who is allowed to.
 *
 * Groups have had channels for a long time and the database has long known who may post in one;
 * what was missing was a door. Migration `0129_a_post_finds_its_channel` added one — `save_post`
 * learned `channel_id`, and `bsdc.channel_post_block_many` answers, per channel, *why* a channel
 * would refuse a post. The web composer grew a selector; this is the Android half of the same door,
 * so a member can start a thread in a room from either place and get identical wording.
 *
 * Everything that decides *anything* lives in [ChannelRules] below, as pure functions on plain
 * values. The picker is a rendering of those decisions, never a second opinion: the reason the web
 * and the app must not disagree is that the database refuses with one specific string, and a client
 * that invents its own phrasing turns a clear "this room is read-only" into a mysterious failure.
 */

/** Why a channel would refuse a post. These four strings are the database's vocabulary. */
enum class ChannelBlockReason(val wire: String) {
    READ_ONLY("channel/read-only"),
    NOT_MEMBER("channel/not-member"),
    ARCHIVED("channel/archived"),
    NOT_FOUND("channel/not-found"),
    ;

    companion object {
        /**
         * An unrecognised reason is no reason at all.
         *
         * The web normalises it the same way (`isChannelBlockReason` in
         * `main-site/src/lib/channels/channel-repository.ts`): the labels are written against these
         * four, so a fifth string from a future migration must not be printed raw in a picker — nor,
         * worse, used to disable a channel nobody has decided to close.
         */
        fun fromWire(value: String?): ChannelBlockReason? = values().firstOrNull { it.wire == value }
    }
}

/** A channel the member may see, with the verdict on whether they may write in it. */
@Serializable
data class PostableChannel(
    val id: String,
    @SerialName("group_id") val groupId: String = "",
    val slug: String = "",
    val name: String = "",
    val topic: String = "",
    @SerialName("is_read_only") val isReadOnly: Boolean = false,
    /** The group this channel belongs to; PostgREST embeds it under the relation name, `groups`. */
    @SerialName("groups") val group: GroupRef? = null,
    /** Null means *writable* — never "unknown". A missing verdict must not look like a refusal. */
    val blockReason: ChannelBlockReason? = null,
) {
    @Serializable
    data class GroupRef(val slug: String = "", val name: String = "")

    val groupLabel: String get() = group?.name?.takeIf { it.isNotBlank() } ?: ""
    val isWritable: Boolean get() = blockReason == null
}

/** The rows `channel_post_block_many` returns: a channel id and its refusal, if any. */
@Serializable
internal data class ChannelBlockRow(
    @SerialName("channel_id") val channelId: String = "",
    val block: String? = null,
)

/** One option in the picker: a place a post can go. */
sealed interface ChannelOption {
    /** The feed — a post with no channel. */
    data object Feed : ChannelOption
    data class Channel(val channel: PostableChannel) : ChannelOption
}

/** A picker section: one group's channels, under the group's name. */
data class ChannelOptionSection(val label: String, val options: List<ChannelOption>)

/**
 * Picker copy, in the language the member is reading.
 *
 * Every string here is the website's own, from `main-site/src/i18n/locales/{en,bn}.ts`:
 * `compose.channelFeed`, the four `channels.reasons.*`, `compose.visibilityInChannelHint` and
 * `channels.errors.privatePost`. That is not politeness. A member who is refused in a room reads the
 * database's sentence in one client and the app's paraphrase in the other, and then has to work out
 * whether they are two different rules or one rule in two voices — which is exactly the question
 * parity should settle before the member has to ask it.
 */
data class ChannelPickerCopy(
    val feed: String,
    val readOnly: String,
    val notMember: String,
    val archived: String,
    val missing: String,
    val inChannelHint: String,
    /** Why `private` is unavailable while a channel is chosen — one sentence, both languages. */
    val privateNeedsFeed: String,
    /** Where a feed post goes, shown while no channel is picked. */
    val feedHint: String,
    /** Where a channel post goes, shown once one is picked. */
    val groupHint: String,
) {
    fun reason(reason: ChannelBlockReason?): String = when (reason) {
        ChannelBlockReason.READ_ONLY -> readOnly
        ChannelBlockReason.NOT_MEMBER -> notMember
        ChannelBlockReason.ARCHIVED -> archived
        ChannelBlockReason.NOT_FOUND -> missing
        null -> ""
    }

    companion object {
        /**
         * The web's own translations, copied out of `main-site/src/i18n/locales/{en,bn}.ts`: the
         * `compose.channel*` keys, `compose.visibilityInChannelHint`, `channels.errors.privatePost`,
         * `channels.reasons.*`. Bengali first, because BN is the app's default language.
         *
         * `ChannelRulesTest.thePickersWordsAreTheWebsWords` re-reads both catalogues on every build,
         * so a translator editing a sentence on either side breaks a test rather than diverging the
         * two clients in silence.
         */
        fun forLanguage(bn: Boolean): ChannelPickerCopy = if (bn) {
            ChannelPickerCopy(
                feed = "মূল ফিड",
                readOnly = "পড়া-র জন্য",
                notMember = "সদস্য নন",
                archived = "আর্কাইভ করা",
                missing = "নেই",
                inChannelHint = "একটি চ্যানেল পোস্ট ঘরটি দেখতে পারা প্রত্যেকের কাছে দেখা যায়; এখানে \"শুধু আমি\" ব্যবহার করা যাবে না।",
                privateNeedsFeed = "চ্যানেলের ভিতরে \"শুধু আমি\" ব্যবহার করা যাবে না; অন্য দেখার সেটিং বেছে নিন।",
                feedHint = "এই পোস্টটি এটি দেখতে পারা প্রত্যেকের মূল ফিडে দেখা যাবে।",
                groupHint = "এই পোস্টটি শুধু এই চ্যানেলে দেখা যাবে, গ্রুপ দেখতে পারা লোকদের কাছে।",
            )
        } else {
            ChannelPickerCopy(
                feed = "The main feed",
                readOnly = "read-only",
                notMember = "not a member",
                archived = "archived",
                missing = "missing",
                inChannelHint = "A channel post is read by everyone who can read the room; \"Only me\" is not available here.",
                privateNeedsFeed = "\"Only me\" cannot be used inside a channel; choose another visibility.",
                feedHint = "This post appears in the main feed of everyone who can read it.",
                groupHint = "This post appears only in this channel, for the people who can read the group.",
            )
        }
    }
}

/** A post's audience, exactly as `bsdc_visibility` spells it. */
enum class ComposerVisibility(val wire: String) {
    PUBLIC("public"),
    FOLLOWERS("followers"),
    PRIVATE("private"),
    ;

    companion object {
        /** Unknown or blank falls back to `public`, the enum's own default in the database. */
        fun fromWire(value: String?): ComposerVisibility = values().firstOrNull { it.wire == value } ?: PUBLIC
    }
}

/**
 * The rules. Pure, total, and unit-tested — see `ChannelRulesTest`.
 */
object ChannelRules {

    /** The value the selector sends for "the feed". A uuid-shaped id can never collide with it. */
    const val FEED_OPTION_VALUE: String = "__feed__"

    /**
     * What a picker's selection means on the wire: a channel id, or null for the feed.
     *
     * A blank is the feed as well, and that is not padding around the sentinel rule: a draft restored
     * from Room carries `channelId` as a plain string column, so "no channel" can arrive as `""` rather
     * than `null`, and `""::uuid` is an error at the database rather than an absence. Deciding it here
     * is what lets [bd.info.bsdc.app.feature.compose.ComposeRepository] write the key from one rule.
     */
    fun channelIdFromValue(value: String?): String? = value?.takeIf { it.isNotBlank() && it != FEED_OPTION_VALUE }

    /** The inverse: what a stored post's channel id means for the picker's selection. */
    fun valueForChannel(channelId: String?): String = channelId ?: FEED_OPTION_VALUE

    /**
     * Whether an audience can live in a channel at all.
     *
     * `private` is the one audience a channel cannot carry. The database refuses it
     * (`channel/private-post`) because a post placed in a room is read by the room; a client that
     * let a member ask for "only me" and then quietly widened it would be overruling the one field
     * that decides who reads their words. So the option is disabled here, and [reconcileVisibility]
     * moves the audience instead of dropping the channel.
     */
    fun visibilityAllowedInChannel(visibility: ComposerVisibility, channelId: String?): Boolean =
        !(visibility == ComposerVisibility.PRIVATE && channelId != null)

    /**
     * Settles an impossible pair before the member presses publish.
     *
     * The channel keeps its place and the audience moves to `followers` — the nearest honourable
     * answer a channel can carry. Doing this on selection rather than on submit is what keeps the
     * screen honest: the control shows the state the post will actually have.
     */
    fun reconcileVisibility(visibility: ComposerVisibility, channelId: String?): ComposerVisibility =
        if (visibilityAllowedInChannel(visibility, channelId)) visibility else ComposerVisibility.FOLLOWERS

    /**
     * Whether `save_post` should be told anything about a channel at all.
     *
     * Three states, and the middle one is the trap: the RPC treats an **absent** `channel_id` key as
     * "leave this post's channel alone", and an **explicit null** as "move it out to the feed". So a
     * client that always sends the key can silently yank a post out of a room it never looked at —
     * which is why this only sends the key once the member has actually used the selector
     * (`channelTouched`). A brand-new post has no channel anyway, so absent is the same answer there.
     */
    fun shouldSendChannelKey(channelTouched: Boolean): Boolean = channelTouched

    /** The refusal the member would get if they published to this channel right now. */
    fun refusalFor(channel: PostableChannel, visibility: ComposerVisibility): String? {
        channel.blockReason?.let { return it.wire }
        if (!visibilityAllowedInChannel(visibility, channel.id)) return "channel/private-post"
        return null
    }

    /**
     * Picker sections: the feed first, then one section per group, each channel labelled with its
     * refusal reason.
     *
     * A blocked channel stays visible and disabled rather than vanishing — the group page shows the
     * room either way, and an option that simply isn't there is a worse mystery than an option that
     * says why. Order is preserved from the query (`order=name`), because the member's mental model
     * of a group's channel list is alphabetical, and re-sorting it here would make the picker and the
     * group page disagree.
     */
    fun sections(channels: List<PostableChannel>, copy: ChannelPickerCopy): List<ChannelOptionSection> {
        val feed = ChannelOptionSection(
            label = copy.feed,
            options = listOf(ChannelOption.Feed),
        )
        // Keyed by id *and* name, exactly as the web's `channelSelectGroups` does: two groups that
        // happen to share a display name must not be merged into one section by an accident of naming.
        val grouped = channels
            .groupBy({ it.groupId to it.groupLabel }, { ChannelOption.Channel(it) })
            .map { (key, options) ->
                ChannelOptionSection(label = key.second.ifBlank { key.first }, options = options)
            }
        return listOf(feed) + grouped
    }

    /** `#slug · name (reason)` — the reason only when there is one. */
    fun optionLabel(option: ChannelOption, copy: ChannelPickerCopy): String = when (option) {
        ChannelOption.Feed -> copy.feed
        is ChannelOption.Channel -> {
            val channel = option.channel
            val reason = copy.reason(channel.blockReason)
            buildString {
                append('#')
                append(channel.slug.ifBlank { channel.name })
                if (channel.name.isNotBlank() && channel.slug.isNotBlank()) {
                    append(" · ")
                    append(channel.name)
                }
                if (reason.isNotEmpty()) {
                    append(" (")
                    append(reason)
                    append(')')
                }
            }
        }
    }

    fun isEnabled(option: ChannelOption): Boolean = when (option) {
        ChannelOption.Feed -> true
        is ChannelOption.Channel -> option.channel.isWritable
    }
}

/**
 * Turns the two round trips into `PostableChannel`s.
 *
 * Extracted from the repository so the mapping is testable: an embedded `groups` object can come
 * back null (a channel whose group row is hidden from the reader), and `channel_post_block_many` can
 * answer for fewer channels than it was asked about. Both must produce a visible, writable-looking
 * row rather than a crash — the same way the web's mapper degrades.
 */
internal fun combineChannelRows(
    rows: List<PostableChannel>,
    blocks: List<ChannelBlockRow>,
): List<PostableChannel> {
    val reasons = blocks.associate { it.channelId to ChannelBlockReason.fromWire(it.block) }
    return rows.map { row -> row.copy(blockReason = reasons[row.id]) }
}
