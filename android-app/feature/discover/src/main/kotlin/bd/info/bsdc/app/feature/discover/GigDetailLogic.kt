package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.model.BsdcHosts
import java.net.URLEncoder
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * Pure rules for the gig screen: the public address, the share text, the action the reader
 * sees, and the relative age of a posting. They mirror `GigPage.tsx` on the website so a gig
 * reads the same in both places.
 */
object GigDetailLogic {
    /** What the reader can do about this gig right now. */
    enum class GigAction { CLOSED, OWN_GIG, SIGN_IN, PROPOSED, WITHDRAWN, PROPOSE }

    private val shortOffset = Regex("([+-]\\d{2})$")

    /** The same address the website uses for a gig, so a shared link opens the same page. */
    fun webUrl(slug: String): String {
        val encoded = URLEncoder.encode(slug.trim(), Charsets.UTF_8.name()).replace("+", "%20")
        return "${BsdcHosts.SITE_ORIGIN}/freelance/$encoded"
    }

    /** Share text: the title, the budget when there is one, then the link. Never blank. */
    fun shareText(title: String, budgetLabel: String, url: String): String {
        val heading = title.trim().ifBlank { "BSDC" }
        val pay = budgetLabel.trim()
        return if (pay.isEmpty()) "$heading\n$url" else "$heading — $pay\n$url"
    }

    /** Postgres can return "+00" rather than "+00:00", and java.time needs the full form. */
    fun parseTimestampMillis(raw: String?): Long? {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) return null
        val normalised = if (value.endsWith("Z")) value else shortOffset.replace(value) { "${it.groupValues[1]}:00" }
        return try {
            OffsetDateTime.parse(normalised).toInstant().toEpochMilli()
        } catch (failure: DateTimeParseException) {
            null
        }
    }

    /** Only a gig with status `open` accepts proposals, as the database enforces. */
    fun isAcceptingProposals(status: String): Boolean = status.trim().lowercase() == "open"

    /**
     * The one action the reader sees. [myProposalStatus] is the reader's own proposal on this
     * gig, or null when they have never bid.
     */
    fun action(
        status: String,
        isOwner: Boolean,
        signedIn: Boolean,
        myProposalStatus: String?,
    ): GigAction {
        if (isOwner) return GigAction.OWN_GIG
        if (!signedIn) return GigAction.SIGN_IN
        val mine = myProposalStatus?.trim()?.lowercase().orEmpty()
        if (mine == "withdrawn") return GigAction.WITHDRAWN
        if (mine.isNotEmpty() && mine != "deleted") return GigAction.PROPOSED
        return if (isAcceptingProposals(status)) GigAction.PROPOSE else GigAction.CLOSED
    }

    /** The status pill a proposal shows, as words rather than a database enum. */
    fun proposalStatusLabel(status: String, bn: Boolean): String = when (status.trim().lowercase()) {
        "submitted" -> if (bn) "জমা দেওয়া হয়েছে" else "Submitted"
        "reviewing" -> if (bn) "পর্যালোচনায়" else "Under review"
        "shortlisted" -> if (bn) "শর্টলিস্টে" else "Shortlisted"
        "hired" -> if (bn) "নিয়োগ হয়েছে" else "Hired"
        "rejected" -> if (bn) "গ্রহণ হয়নি" else "Not selected"
        "withdrawn" -> if (bn) "প্রত্যাহৃত" else "Withdrawn"
        else -> status.trim().ifBlank { if (bn) "অজানা" else "Unknown" }
    }

    /** The status pill a gig shows. */
    fun gigStatusLabel(status: String, bn: Boolean): String = when (status.trim().lowercase()) {
        "open" -> if (bn) "খোলা" else "Open"
        "paused" -> if (bn) "বিরতিতে" else "Paused"
        "closed" -> if (bn) "বন্ধ" else "Closed"
        "draft" -> if (bn) "খসড়া" else "Draft"
        else -> status.trim().ifBlank { if (bn) "অজানা" else "Unknown" }
    }

    /** "3 days ago" in the reader's language, or "" when the timestamp cannot be read. */
    fun postedAgo(raw: String?, nowMillis: Long, bn: Boolean): String {
        val then = parseTimestampMillis(raw) ?: return ""
        val minutes = ((nowMillis - then) / 60_000L).coerceAtLeast(0L)
        return when {
            minutes < 1L -> if (bn) "এইমাত্র" else "Just now"
            minutes < 60L -> if (bn) "${minutes} মিনিট আগে" else "$minutes min ago"
            minutes < 1_440L -> {
                val hours = minutes / 60L
                if (bn) "$hours ঘণ্টা আগে" else "$hours hour${if (hours == 1L) "" else "s"} ago"
            }
            minutes < 43_200L -> {
                val days = minutes / 1_440L
                if (bn) "$days দিন আগে" else "$days day${if (days == 1L) "" else "s"} ago"
            }
            else -> {
                val months = minutes / 43_200L
                if (bn) "$months মাস আগে" else "$months month${if (months == 1L) "" else "s"} ago"
            }
        }
    }

    /**
     * The platform fee a freelancer should expect, in whole currency units, plus what they
     * actually receive. BSDC takes no commission on a gig today, so the fee is zero and the
     * payout equals the bid — the function exists so the estimator on the screen is explicit
     * and testable rather than hard-coded arithmetic in a composable.
     */
    data class PayoutBreakdown(val gross: Int, val fee: Int, val net: Int, val feePercent: Int)

    const val PLATFORM_FEE_PERCENT = 0

    fun payout(bidAmount: Int): PayoutBreakdown {
        val gross = bidAmount.coerceAtLeast(0)
        val fee = Math.round(gross * (PLATFORM_FEE_PERCENT / 100.0)).toInt()
        return PayoutBreakdown(gross = gross, fee = fee, net = (gross - fee).coerceAtLeast(0), feePercent = PLATFORM_FEE_PERCENT)
    }

    /** A 0–100 progress figure for a proposal's journey, used by the tracker. */
    fun proposalProgress(status: String): Int = when (status.trim().lowercase()) {
        "submitted" -> 25
        "reviewing" -> 50
        "shortlisted" -> 75
        "hired" -> 100
        "rejected" -> 100
        "withdrawn" -> 100
        else -> 0
    }

    /** Only the statuses that still belong in the client's working queue. */
    fun isOpenProposal(status: String): Boolean =
        status.trim().lowercase() in setOf("submitted", "reviewing", "shortlisted")

    /** Sorts the client's proposal manager: still-open bids first, then newest. */
    fun sortProposalsForClient(proposals: List<GigProposalDto>): List<GigProposalDto> =
        proposals.sortedWith(
            compareByDescending<GigProposalDto> { isOpenProposal(it.status) }
                .thenByDescending { parseTimestampMillis(it.createdAt) ?: 0L }
                .thenByDescending { it.bidAmount },
        )
}
