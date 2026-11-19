package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.model.BsdcHosts
import java.net.URLEncoder
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/** Pure rules for the job screen. They mirror the website's jobIsLive and apply checks. */
object JobDetailLogic {
    /** What the reader can do about this job right now. */
    enum class ApplyState { CLOSED, OWN_POST, SIGN_IN, APPLIED, EXTERNAL, IN_APP }

    /** A cover letter must be at least this many characters, as on the website. */
    const val MIN_COVER_LETTER = 20

    private val shortOffset = Regex("([+-]\\d{2})$")

    /** The public address of a job, the same one the website uses. */
    fun webUrl(slug: String): String {
        val encoded = URLEncoder.encode(slug.trim(), Charsets.UTF_8.name()).replace("+", "%20")
        return "${BsdcHosts.SITE_ORIGIN}/jobs/$encoded"
    }

    fun shareText(title: String, company: String, url: String): String {
        val role = title.trim().ifBlank { "BSDC" }
        val employer = company.trim()
        return if (employer.isEmpty()) "$role\n$url" else "$role — $employer\n$url"
    }

    /**
     * Postgres can return "+00" rather than "+00:00", and java.time needs the full form.
     * Returns epoch milliseconds, or null when the text is not a timestamp.
     */
    fun parseTimestampMillis(raw: String?): Long? {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) return null
        val normalised = if (value.endsWith("Z")) {
            value
        } else {
            shortOffset.replace(value) { "${it.groupValues[1]}:00" }
        }
        return try {
            OffsetDateTime.parse(normalised).toInstant().toEpochMilli()
        } catch (failure: DateTimeParseException) {
            null
        }
    }

    /** Open and not yet expired. An expiry that cannot be read counts as expired, as on the website. */
    fun isLive(status: String, expiresAt: String?, nowMillis: Long): Boolean {
        if (status != "open") return false
        if (expiresAt.isNullOrBlank()) return true
        val expiry = parseTimestampMillis(expiresAt) ?: return false
        return expiry > nowMillis
    }

    /**
     * The one action the reader sees. [externalUrl] must already be a safe http(s) address,
     * or empty.
     */
    fun applyState(
        live: Boolean,
        isOwner: Boolean,
        signedIn: Boolean,
        myStatus: String?,
        externalUrl: String,
    ): ApplyState = when {
        !live -> ApplyState.CLOSED
        isOwner -> ApplyState.OWN_POST
        !signedIn -> ApplyState.SIGN_IN
        !myStatus.isNullOrBlank() -> ApplyState.APPLIED
        externalUrl.isNotBlank() -> ApplyState.EXTERNAL
        else -> ApplyState.IN_APP
    }

    fun coverLetterValid(text: String): Boolean = text.trim().length >= MIN_COVER_LETTER

    /** Skill chips: trimmed, blanks dropped, case-insensitive duplicates removed, order kept. */
    fun skillChips(skills: List<String>): List<String> =
        skills.map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }

    /**
     * Matching the website's `canWithdraw` / `isApplied` / `isDecided`: an applicant may still
     * retract a bid while it is submitted, reviewing or shortlisted — not once it is decided.
     */
    fun canWithdraw(status: String?): Boolean =
        status?.trim()?.lowercase() in setOf("submitted", "reviewing", "shortlisted")

    fun isApplied(status: String?): Boolean {
        val clean = status?.trim()?.lowercase().orEmpty()
        return clean.isNotEmpty() && clean != "withdrawn"
    }

    /** Terminal states no longer belong in an employer's working queue. */
    fun isDecided(status: String?): Boolean =
        status?.trim()?.lowercase() in setOf("rejected", "hired", "withdrawn")

    /** The status pill an application shows, in the reader's language. */
    fun applicationStatusLabel(status: String, bn: Boolean): String = when (status.trim().lowercase()) {
        "submitted" -> if (bn) "জমা দেওয়া হয়েছে" else "Submitted"
        "reviewing" -> if (bn) "পর্যালোচনায়" else "Under review"
        "shortlisted" -> if (bn) "শর্টলিস্টে" else "Shortlisted"
        "hired" -> if (bn) "নিয়োগ হয়েছে" else "Hired"
        "rejected" -> if (bn) "গ্রহণ হয়নি" else "Not selected"
        "withdrawn" -> if (bn) "প্রত্যাহৃত" else "Withdrawn"
        else -> status.trim().ifBlank { if (bn) "অজানা" else "Unknown" }
    }

    /** A 0–100 progress figure for the applicant's own tracker. */
    fun applicationProgress(status: String): Int = when (status.trim().lowercase()) {
        "submitted" -> 25
        "reviewing" -> 50
        "shortlisted" -> 75
        "hired" -> 100
        "rejected" -> 100
        "withdrawn" -> 100
        else -> 0
    }

    /** The decisions an employer may still make on one application, given its current status. */
    fun employerActionsFor(status: String): List<String> = when (status.trim().lowercase()) {
        "submitted" -> listOf("reviewing", "shortlisted", "hired", "rejected")
        "reviewing" -> listOf("shortlisted", "hired", "rejected")
        "shortlisted" -> listOf("hired", "rejected")
        else -> emptyList()
    }

    /** Queues an employer's review by what still needs a decision, then newest first. */
    fun sortApplicationsForEmployer(applications: List<JobApplicationDto>): List<JobApplicationDto> =
        applications.sortedWith(
            compareBy<JobApplicationDto> { if (isDecided(it.status)) 1 else 0 }
                .thenByDescending { parseTimestampMillis(it.createdAt) ?: 0L },
        )

    /**
     * The same monthly figure shown over a year, so a reader weighing two offers does not have
     * to convert it themselves. Empty when the salary or period cannot be read.
     */
    fun yearlyEquivalent(
        minAmount: Int?,
        maxAmount: Int?,
        currency: String,
        period: String,
    ): String {
        val basis = maxAmount ?: minAmount ?: return ""
        val yearly = DiscoverSearchEngine.convertCompensation(basis.toLong(), period, "year", currency)
        if (yearly.isBlank()) return ""
        val prefix = if (maxAmount != null && minAmount != null && maxAmount != minAmount) "~" else ""
        return prefix + yearly
    }
}
