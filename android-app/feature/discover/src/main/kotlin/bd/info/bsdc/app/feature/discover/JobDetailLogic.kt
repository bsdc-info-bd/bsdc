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
}
