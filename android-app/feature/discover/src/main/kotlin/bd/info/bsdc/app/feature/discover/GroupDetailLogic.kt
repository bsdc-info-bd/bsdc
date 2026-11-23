package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.model.BsdcHosts
import java.net.URLEncoder

/** What the join control offers. Mirrors the website's joinAction, so the two never disagree. */
enum class GroupJoinAction { JOIN, REQUEST, PENDING, OPEN, CLOSED }

/** Pure rules for the group page. */
object GroupDetailLogic {
    private val roleRank = mapOf("owner" to 3, "admin" to 2, "moderator" to 1, "member" to 0)

    fun webUrl(slug: String): String {
        val encoded = URLEncoder.encode(slug.trim(), Charsets.UTF_8.name()).replace("+", "%20")
        return "${BsdcHosts.SITE_ORIGIN}/g/$encoded"
    }

    fun shareText(name: String, url: String): String = "$name on BSDC\n$url"

    /** Higher is more senior. Unknown roles rank below members. */
    fun rank(role: String?): Int = roleRank[role] ?: -1

    fun canModerate(role: String?): Boolean = rank(role) >= roleRank.getValue("moderator")

    fun canAdminister(role: String?): Boolean = rank(role) >= roleRank.getValue("admin")

    /**
     * Public groups can be joined directly, private groups take a request, and secret groups are invite-only.
     * A pending request keeps its state even if the privacy later changes.
     */
    fun joinAction(privacy: String, myRole: String?, requestStatus: String?, signedIn: Boolean): GroupJoinAction {
        if (!myRole.isNullOrBlank()) return GroupJoinAction.OPEN
        if (!signedIn) return GroupJoinAction.CLOSED
        if (requestStatus == "pending") return GroupJoinAction.PENDING
        return when (privacy) {
            "public" -> GroupJoinAction.JOIN
            "private" -> GroupJoinAction.REQUEST
            else -> GroupJoinAction.CLOSED
        }
    }

    /**
     * Members whose name or @handle contains [query]. An empty query keeps everyone, so the
     * search field starts showing the whole roster instead of an empty list.
     */
    fun <T> searchMembers(
        members: List<T>,
        query: String,
        nameOf: (T) -> String,
        handleOf: (T) -> String,
    ): List<T> {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return members
        return members.filter { member ->
            nameOf(member).lowercase().contains(needle) || handleOf(member).lowercase().contains(needle)
        }
    }

    /** A channel row's title, e.g. "# general", so the hash and the name never drift apart. */
    fun channelTitle(name: String): String = "# ${name.trim().removePrefix("#").trim()}"

    /**
     * The count badge on a channel card, in the website's words.
     *
     * `channels.posts` / `channels.postsOne` say "3 posts" and "1 post"; Bengali does not inflect the
     * noun, so `টি` carries the count and both spellings collapse into one string. The number arrives
     * already formatted, because rendering digits for the reader's locale is a shared rule rather than
     * this screen's business — and because a badge that counts in Bengali digits while the rest of the
     * page does not looks like two apps.
     */
    fun postCountLabel(formattedCount: String, count: Int, bn: Boolean): String =
        if (bn) {
            "${formattedCount}টি পোস্ট"
        } else {
            "$formattedCount ${if (count == 1) "post" else "posts"}"
        }

    /** Owners and admins first, then by how long each member has been there. */
    fun <T> sortMembers(
        members: List<T>,
        roleOf: (T) -> String?,
        joinedAtOf: (T) -> String?,
    ): List<T> = members.sortedWith(
        compareByDescending<T> { rank(roleOf(it)) }
            .thenBy { JobDetailLogic.parseTimestampMillis(joinedAtOf(it)) ?: Long.MAX_VALUE },
    )
}
