package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.BsdcHosts
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import java.net.URI
import java.net.URLEncoder
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/** Pure rules for the job screen. They mirror the website's jobIsLive and apply checks. */
object JobDetailLogic {
    /** What the reader can do about this job right now. */
    enum class ApplyState { CLOSED, OWN_POST, SIGN_IN, APPLIED, EXTERNAL, IN_APP }

    /** A cover letter must be at least this many characters, as on the website. */
    const val MIN_COVER_LETTER = 20

    data class ApplicationDraft(
        val applicantName: String = "",
        val phone: String = "",
        val email: String = "",
        val location: String = "",
        val yearsExperience: String = "",
        val education: String = "",
        val expectedSalaryTaka: String = "",
        val portfolioUrl: String = "",
        val linkedinUrl: String = "",
        val noticePeriod: String = "",
        val skillsInput: String = "",
        val certificationImageUrls: List<String> = emptyList(),
        val coverLetter: String = "",
        val resumeUrl: String = "",
    )

    data class ApplicationSubmission(
        val applicantName: String,
        val phone: String,
        val email: String,
        val location: String,
        val yearsExperience: Int?,
        val education: String,
        val expectedSalaryPoisha: Long?,
        val portfolioUrl: String,
        val linkedinUrl: String,
        val noticePeriod: String,
        val skills: List<String>,
        val certificationImageUrls: List<String>,
        val coverLetter: String,
        val resumeUrl: String,
    )

    private const val MAX_SAFE_POISHA = 9_007_199_254_740_991L

    /** Prefill from the member's public profile, never an unshared account email. */
    fun prefillApplicationDraft(
        displayName: String,
        accountEmail: String,
        showEmail: Boolean,
        location: String,
        skills: List<String>,
    ): ApplicationDraft = ApplicationDraft(
        applicantName = displayName.trim(),
        email = if (showEmail) accountEmail.trim() else "",
        location = location.trim(),
        skillsInput = applicationSkills(skills.joinToString(", ")).joinToString(", "),
    )

    private val emailPattern = Regex("""^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$""", RegexOption.IGNORE_CASE)
    private val phonePattern = Regex("^[0-9+ -]+$")
    private val yearsPattern = Regex("""^\d{1,2}$""")
    private val salaryPattern = Regex("""^\d{1,15}(?:\.\d{1,2})?$""")

    fun isValidApplicationPhone(raw: String): Boolean {
        val value = raw.trim()
        return value.isEmpty() || (value.length <= 20 && phonePattern.matches(value) && value.any { it.isDigit() })
    }

    fun isValidApplicationEmail(raw: String): Boolean {
        val value = raw.trim()
        return value.isEmpty() || (value.length <= 320 && emailPattern.matches(value))
    }

    /** Absolute HTTPS only; no credentials, whitespace or control characters. */
    fun isValidApplicationHttpsUrl(raw: String): Boolean {
        val value = raw.trim()
        if (value.isEmpty()) return true
        if (value.any { it.isWhitespace() || it == '<' || it == '>' }) return false
        return runCatching {
            val uri = URI(value)
            uri.scheme.equals("https", ignoreCase = true) &&
                !uri.host.isNullOrBlank() &&
                uri.rawUserInfo == null &&
                (uri.port == -1 || uri.port in 1..65535)
        }.getOrDefault(false)
    }

    /** Require HTTPS and the platform's repairable, ImgBB-only image hosts. */
    fun isValidApplicationImageUrl(raw: String): Boolean {
        val value = raw.trim()
        if (value.isEmpty() || !isValidApplicationHttpsUrl(value)) return false
        // The Java image allowlist intentionally accepts canonical lower-case https URLs only;
        // normalize the scheme here so valid user input remains case-insensitive like URL rules.
        val canonical = if (value.startsWith("https://", ignoreCase = true)) {
            "https://${value.substringAfter("://")}"
        } else {
            value
        }
        return ImgbbUrlAllowlist.isAllowedImageUrl(canonical) &&
            ImgbbUrlAllowlist.isRepairableImageUrl(canonical)
    }

    /** Exact taka-to-poisha conversion; malformed fractions are never rounded. */
    fun takaToPoisha(raw: String): Long? {
        val value = raw.trim()
        if (value.isEmpty() || !salaryPattern.matches(value)) return null
        return runCatching {
            BigDecimal(value)
                .movePointRight(2)
                .setScale(0, RoundingMode.UNNECESSARY)
                .longValueExact()
                .takeIf { it <= MAX_SAFE_POISHA }
        }.getOrNull()
    }

    fun formatApplicationSalary(poisha: Long, bn: Boolean): String {
        val formatter = DecimalFormat("#,##,##0.##", DecimalFormatSymbols.getInstance(Locale.US)).apply {
            maximumFractionDigits = 2
            minimumFractionDigits = 0
            isGroupingUsed = true
            roundingMode = RoundingMode.UNNECESSARY
        }
        val amount = formatter.format(BigDecimal.valueOf(poisha, 2))
        return "৳${if (bn) BanglaDigitFormatter.toBanglaDigits(amount) else amount}"
    }

    private fun applicationSkills(raw: String): List<String> = raw
        .split(',')
        .map { it.trim().replace(Regex("\\s+"), " ").lowercase() }
        .filter { it.isNotEmpty() }
        .distinct()
        .sorted()

    /** Field names are stable identifiers for bilingual inline validation copy. */
    fun validateApplicationDraft(draft: ApplicationDraft): Set<String> {
        val errors = linkedSetOf<String>()
        val name = draft.applicantName.trim()
        val phone = draft.phone.trim()
        val email = draft.email.trim()
        if (name.isEmpty() || name.length > 60) errors += "name"
        if (!isValidApplicationPhone(phone)) errors += "phone"
        if (!isValidApplicationEmail(email)) errors += "email"
        if (phone.isEmpty() && email.isEmpty()) errors += "contact"
        if (draft.location.trim().length > 80) errors += "location"
        if (draft.yearsExperience.isNotBlank()) {
            val experience = draft.yearsExperience.trim().toIntOrNull()
            if (!yearsPattern.matches(draft.yearsExperience.trim()) || experience == null || experience !in 0..60) {
                errors += "experience"
            }
        }
        if (draft.education.trim().length > 200) errors += "education"
        if (draft.expectedSalaryTaka.isNotBlank() && takaToPoisha(draft.expectedSalaryTaka) == null) errors += "salary"
        if (!isValidApplicationHttpsUrl(draft.resumeUrl)) errors += "resume"
        if (!isValidApplicationHttpsUrl(draft.portfolioUrl)) errors += "portfolio"
        if (!isValidApplicationHttpsUrl(draft.linkedinUrl)) errors += "linkedin"
        if (draft.noticePeriod.trim().length > 60) errors += "notice"
        val skills = applicationSkills(draft.skillsInput)
        if (skills.size > 30 || skills.any { it.length > 64 }) errors += "skills"
        val images = draft.certificationImageUrls.map { it.trim() }.filter { it.isNotEmpty() }
        if (images.size > 3 || images.any { !isValidApplicationImageUrl(it) }) errors += "certifications"
        val coverLength = draft.coverLetter.trim().length
        if (coverLength !in MIN_COVER_LETTER..6000) errors += "coverLetter"
        return errors
    }

    /** Call only after [validateApplicationDraft] returns no errors. */
    fun toApplicationSubmission(draft: ApplicationDraft): ApplicationSubmission = ApplicationSubmission(
        applicantName = draft.applicantName.trim(),
        phone = draft.phone.trim(),
        email = draft.email.trim().lowercase(),
        location = draft.location.trim(),
        yearsExperience = draft.yearsExperience.trim().takeIf { it.isNotEmpty() }?.toInt(),
        education = draft.education.trim(),
        expectedSalaryPoisha = draft.expectedSalaryTaka.trim().takeIf { it.isNotEmpty() }?.let(::takaToPoisha),
        portfolioUrl = draft.portfolioUrl.trim(),
        linkedinUrl = draft.linkedinUrl.trim(),
        noticePeriod = draft.noticePeriod.trim(),
        skills = applicationSkills(draft.skillsInput),
        certificationImageUrls = draft.certificationImageUrls.map { it.trim() }.filter { it.isNotEmpty() },
        coverLetter = draft.coverLetter.trim(),
        resumeUrl = draft.resumeUrl.trim(),
    )

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

    /** Pure search, status filter and stable sort used by the employer queue. */
    fun filterAndSortApplicationsForEmployer(
        applications: List<JobApplicationDto>,
        statusFilter: String = "all",
        query: String = "",
        sortMode: String = "priority",
    ): List<JobApplicationDto> {
        val needle = query.trim().lowercase()
        val filtered = applications.filter { application ->
            val matchesStatus = statusFilter == "all" || application.status.equals(statusFilter, ignoreCase = true)
            val haystack = listOf(
                application.applicantName,
                application.applicantCard.displayName.orEmpty(),
                application.applicantCard.username.orEmpty(),
                application.phone,
                application.email,
                application.location,
                application.yearsExperience?.toString().orEmpty(),
                application.education,
                application.expectedSalaryPoisha?.toString().orEmpty(),
                application.portfolioUrl,
                application.linkedinUrl,
                application.noticePeriod,
                application.skills.joinToString(" "),
                application.coverLetter,
                application.resumeUrl,
            ).joinToString(" ").lowercase()
            matchesStatus && (needle.isEmpty() || haystack.contains(needle))
        }
        val date = { application: JobApplicationDto -> parseTimestampMillis(application.createdAt) ?: 0L }
        return when (sortMode) {
            "oldest" -> filtered.sortedBy(date)
            "newest" -> filtered.sortedByDescending(date)
            else -> filtered.sortedWith(
                compareBy<JobApplicationDto> { when (it.status.trim().lowercase()) {
                    "submitted" -> 0
                    "reviewing" -> 1
                    "shortlisted" -> 2
                    else -> 3
                } }.thenByDescending(date),
            )
        }
    }

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
