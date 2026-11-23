package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.common.ListingTags
import bd.info.bsdc.app.core.designsystem.BsdcChecklistItem
import bd.info.bsdc.app.core.designsystem.BsdcFormChoice
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The rules behind the job editor.
 *
 * A job posting is the listing with the most fields and the most readers: every applicant sees the
 * title, the band, the city and the deadline, and the routine that writes them (`update_job`,
 * migration 0128) refuses the whole save when one of them is out of range. So the numbers here are
 * not this screen's invention — they are [ComposerValidationEngine]'s, which is the app's copy of the
 * website's `CREATE_LIMITS`, and `JobEditLogicTest` reads both sources and fails if the three drift.
 *
 * Three decisions are worth naming, because each one is a place where a clever editor would have
 * silently damaged a posting:
 *
 *  - An empty salary box means *not stated*, never zero.
 *  - Skills are stored in the canonical form the website stores them in — lower-cased, deduplicated,
 *    sorted — because migration 0103 put the column in that form and the skill filters match it.
 *  - The deadline is the one field the routine overwrites unconditionally, so clearing the box really
 *    does re-open a role that had a closing date, and leaving a date that has already passed is
 *    refused here rather than at the database, where it would read as a mystery.
 */

/** What the sheet holds while the member types. */
data class JobEditForm(
    val title: String = "",
    val company: String = "",
    val description: String = "",
    val jobType: String = JobEditLogic.JOB_TYPE_DEFAULT,
    val workMode: String = JobEditLogic.WORK_MODE_DEFAULT,
    val level: String = JobEditLogic.LEVEL_DEFAULT,
    val city: String = "",
    val salaryMinText: String = "",
    val salaryMaxText: String = "",
    val salaryPeriod: String = JobEditLogic.PERIOD_DEFAULT,
    val expiresAtText: String = "",
    val applyUrl: String = "",
    val skills: List<String> = emptyList(),
    val coverUrl: String = "",
)

/** What `update_job` is sent, in the order the routine declares its arguments. */
data class JobEditPayload(
    val title: String,
    val company: String,
    val description: String,
    val jobType: String,
    val workMode: String,
    val level: String,
    val city: String,
    val salaryMin: Int?,
    val salaryMax: Int?,
    val salaryPeriod: String,
    /** null clears the column, which is how a closed deadline is re-opened. */
    val expiresAt: String?,
    val applyUrl: String,
    val skills: List<String>,
    val coverUrl: String,
)

object JobEditLogic {
    const val TITLE_MIN = 3
    const val TITLE_MAX = 140
    const val COMPANY_MIN = 2
    const val COMPANY_MAX = 100
    const val DESCRIPTION_MIN = 20
    const val DESCRIPTION_MAX = 20_000
    const val CITY_MAX = 80
    val SKILLS_MAX: Int = ListingTags.MAX_TAGS

    const val JOB_TYPE_DEFAULT = "full_time"
    const val WORK_MODE_DEFAULT = "hybrid"
    const val LEVEL_DEFAULT = "mid"
    const val PERIOD_DEFAULT = "month"

    /**
     * The words the website's own create form uses, in both languages, so the same option is not
     * called "Full time" on one client and "Permanent" on the other. `JobEditLogicTest` compares these
     * against `create.options.*` in `main-site/src/i18n/locales`.
     */
    data class JobOption(val value: String, val labelBn: String, val labelEn: String)

    val JOB_TYPES: List<JobOption> = listOf(
        JobOption("full_time", "ফুল টাইম", "Full time"),
        JobOption("part_time", "পার্ট টাইম", "Part time"),
        JobOption("contract", "চুক্তি", "Contract"),
        JobOption("internship", "ইন্টার্নশিপ", "Internship"),
    )

    val WORK_MODES: List<JobOption> = listOf(
        JobOption("onsite", "অফিসে", "On site"),
        JobOption("remote", "রিমোট", "Remote"),
        JobOption("hybrid", "হাইব্রিড", "Hybrid"),
    )

    val LEVELS: List<JobOption> = listOf(
        JobOption("entry", "এন্ট্রি", "Entry"),
        JobOption("junior", "জুনিয়র", "Junior"),
        JobOption("mid", "মিড", "Mid"),
        JobOption("senior", "সিনিয়র", "Senior"),
        JobOption("lead", "লিড", "Lead"),
    )

    val PERIODS: List<JobOption> = listOf(
        JobOption("month", "মাস", "Month"),
        JobOption("hour", "ঘণ্টা", "Hour"),
        JobOption("year", "বছর", "Year"),
    )

    val SKILL_SUGGESTIONS: List<String> =
        listOf("Kotlin", "Compose", "Android", "React", "TypeScript", "Node", "Postgres", "Figma")

    /**
     * The zone a typed deadline is read in: [EventDetailLogic.DEFAULT_ZONE], the same one the event
     * forms use. The website reads the deadline in the browser's own zone; a phone has the same
     * information and none of the ambiguity, and a member who types "6 December, 18:00" means six in
     * the evening where the event is.
     */
    val ZONE: ZoneId = ZoneId.of(EventDetailLogic.DEFAULT_ZONE)

    private val DISPLAY: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    /** The options as the kit wants them. */
    fun choices(options: List<JobOption>, bn: Boolean): List<BsdcFormChoice> =
        options.map { option -> BsdcFormChoice(value = option.value, label = label(option, bn)) }

    fun label(option: JobOption, bn: Boolean): String = if (bn) option.labelBn else option.labelEn

    /** A value the row carries that the pickers have no option for still shows, unlabelled, not lost. */
    fun labelFor(options: List<JobOption>, value: String, bn: Boolean): String =
        options.firstOrNull { it.value == value }?.let { label(it, bn) } ?: value

    fun formFrom(job: JobDetailDto): JobEditForm = JobEditForm(
        title = job.title,
        company = job.company,
        description = job.description,
        jobType = job.jobType.ifBlank { JOB_TYPE_DEFAULT },
        workMode = job.workMode.ifBlank { WORK_MODE_DEFAULT },
        level = job.level.ifBlank { LEVEL_DEFAULT },
        city = job.city,
        salaryMinText = job.salaryMin?.toString() ?: "",
        salaryMaxText = job.salaryMax?.toString() ?: "",
        salaryPeriod = job.salaryPeriod.ifBlank { PERIOD_DEFAULT },
        expiresAtText = expiresField(job.expiresAt),
        applyUrl = job.applyUrl,
        skills = job.skills.map { it.trim() }.filter { it.isNotEmpty() },
        coverUrl = job.coverUrl,
    )

    fun amount(text: String): Int? = text.trim().toIntOrNull()

    /**
     * Every refusal the routine would answer with, said here first, in the create form's words.
     *
     * [nowMillis] is a parameter rather than `System.currentTimeMillis()` so the deadline rule — the
     * one case where a job page can already be holding an illegal value, a closing date that has since
     * passed — can be tested at a fixed instant instead of at a date that moves.
     */
    fun validate(form: JobEditForm, nowMillis: Long): List<String> {
        val issues = mutableListOf<String>()
        val title = form.title.trim()
        if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
            issues += "Job title must be between $TITLE_MIN and $TITLE_MAX characters."
        }
        val company = form.company.trim()
        if (company.length < COMPANY_MIN || company.length > COMPANY_MAX) {
            issues += "Company name must be between $COMPANY_MIN and $COMPANY_MAX characters."
        }
        val description = form.description.trim()
        if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
            issues += "Job description must be at least $DESCRIPTION_MIN characters."
        }
        val city = form.city.trim()
        if (form.workMode != "remote" && city.isEmpty()) {
            issues += "Non-remote roles require a city."
        }
        if (city.length > CITY_MAX) {
            issues += "A city cannot be longer than $CITY_MAX characters."
        }
        val min = amount(form.salaryMinText)
        val max = amount(form.salaryMaxText)
        if ((min != null && min < 0) || (max != null && max < 0)) {
            issues += "Salary figures cannot be negative."
        }
        if (min != null && max != null && max < min) {
            issues += "Maximum salary cannot be below minimum salary."
        }
        if (form.skills.size > SKILLS_MAX) {
            issues += "Select at most $SKILLS_MAX skills."
        }
        if (!JobDetailLogic.isValidApplicationHttpsUrl(form.applyUrl)) {
            issues += applyUrlRefusal
        }
        when {
            form.expiresAtText.isBlank() -> Unit
            !parsesExpiry(form.expiresAtText) -> issues += expiryFormat
            else -> {
                val instant = expiresIso(form.expiresAtText)
                if (instant == null || !isFuture(instant, nowMillis)) issues += expiryPast
            }
        }
        if (!coverAllowed(form.coverUrl)) {
            issues += GigEditLogic.coverRefusal
        }
        return issues
    }

    fun isValid(form: JobEditForm, nowMillis: Long): Boolean = validate(form, nowMillis).isEmpty()

    const val applyUrlRefusal: String =
        "An apply link must be a full https address. Leave it empty to take applications here."
    const val expiryFormat: String = "Reads like 2026-12-06 18:00, or a date such as 2026-12-06."
    const val expiryPast: String = "A closing date has to be in the future, or empty to stay open."

    fun coverAllowed(url: String): Boolean {
        val trimmed = url.trim()
        return trimmed.isEmpty() || ImgbbUrlAllowlist.isAllowedImageUrl(trimmed)
    }

    /** The stored instant, in the box's own shape. An instant that cannot be read is shown as typed. */
    fun expiresField(expiresAt: String?): String {
        val raw = expiresAt?.trim().orEmpty()
        if (raw.isEmpty()) return ""
        val millis = JobDetailLogic.parseTimestampMillis(raw) ?: return raw
        return DISPLAY.format(Instant.ofEpochMilli(millis).atZone(ZONE))
    }

    /** Whether the box can be read at all: the sheet's form, a bare date, or a real ISO instant. */
    fun parsesExpiry(text: String): Boolean {
        val value = text.trim()
        if (value.isEmpty()) return true
        if (JobDetailLogic.parseTimestampMillis(value) != null) return true
        return runCatching { parseLocal(value) }.isSuccess
    }

    /**
     * The instant `update_job` wants, or null when the box is empty — which clears the deadline.
     *
     * No clock is consulted: the payload is a function of the form alone, which is what lets
     * `isDirty` compare two payloads and let the tests assert one at a fixed instant.
     */
    fun expiresIso(text: String): String? {
        val value = text.trim()
        if (value.isEmpty()) return null
        JobDetailLogic.parseTimestampMillis(value)?.let { return Instant.ofEpochMilli(it).toString() }
        val local = runCatching { parseLocal(value) }.getOrNull() ?: return null
        return local.atZone(ZONE).toInstant().toString()
    }

    private fun parseLocal(value: String): LocalDateTime {
        // A bare date means "open until the end of that day", which is what a member means when they
        // type only a date. Midnight would close the role before its last day had finished.
        if (value.length == 10) return LocalDateTime.of(LocalDate.parse(value), LocalTime.of(23, 59))
        return LocalDateTime.parse(value.replace(' ', 'T'))
    }

    fun isFuture(iso: String?, nowMillis: Long): Boolean {
        val millis = iso?.let { JobDetailLogic.parseTimestampMillis(it) } ?: return false
        return millis > nowMillis
    }

    /**
     * The one-tap deadlines under the box.
     *
     * A closing date is the field members most often want to push forward, and on a phone it is also
     * the field most annoying to type. [nowMillis] is passed in so the suggestions are testable and so
     * the sheet cannot offer a date that the routine would refuse.
     */
    fun expirySuggestions(nowMillis: Long, bn: Boolean): List<Pair<String, String>> {
        val base = Instant.ofEpochMilli(nowMillis).atZone(ZONE)
        return listOf(
            (if (bn) "১ সপ্তাহ" else "1 week") to DISPLAY.format(base.plusDays(7)),
            (if (bn) "২ সপ্তাহ" else "2 weeks") to DISPLAY.format(base.plusDays(14)),
            (if (bn) "১ মাস" else "1 month") to DISPLAY.format(base.plusMonths(1)),
            (if (bn) "৩ মাস" else "3 months") to DISPLAY.format(base.plusMonths(3)),
        )
    }

    fun toPayload(form: JobEditForm): JobEditPayload = JobEditPayload(
        title = form.title.trim(),
        company = form.company.trim(),
        description = form.description.trim(),
        jobType = form.jobType,
        workMode = form.workMode,
        level = form.level,
        city = form.city.trim(),
        salaryMin = amount(form.salaryMinText),
        salaryMax = amount(form.salaryMaxText),
        salaryPeriod = form.salaryPeriod,
        expiresAt = expiresIso(form.expiresAtText),
        applyUrl = form.applyUrl.trim(),
        skills = ListingTags.normalise(form.skills),
        coverUrl = form.coverUrl.trim(),
    )

    fun isDirty(initial: JobEditForm, form: JobEditForm): Boolean = toPayload(initial) != toPayload(form)

    /** The band as a reader will see it, mirroring `formatSalaryRange`: never an invented number. */
    fun salaryLine(form: JobEditForm, currency: String, bn: Boolean): String {
        val min = amount(form.salaryMinText)
        val max = amount(form.salaryMaxText)
        val per = labelFor(PERIODS, form.salaryPeriod, bn)
        return when {
            min == null && max == null -> if (bn) "আলোচনা সাপেক্ষ" else "Negotiable"
            min != null && max != null && min == max -> "$currency $min / $per"
            min != null && max != null -> "$currency $min – $max / $per"
            min != null -> if (bn) "$currency $min থেকে / $per" else "from $currency $min / $per"
            else -> if (bn) "$currency $max পর্যন্ত / $per" else "up to $currency $max / $per"
        }
    }

    fun checklist(form: JobEditForm, bn: Boolean, nowMillis: Long): List<BsdcChecklistItem> {
        val title = form.title.trim()
        val company = form.company.trim()
        val description = form.description.trim()
        val city = form.city.trim()
        val min = amount(form.salaryMinText)
        val max = amount(form.salaryMaxText)
        return listOf(
            BsdcChecklistItem(
                label = say(
                    bn,
                    "শিরোনাম $TITLE_MIN–$TITLE_MAX অক্ষরের মধ্যে",
                    "Title is $TITLE_MIN–$TITLE_MAX characters",
                ),
                done = title.length in TITLE_MIN..TITLE_MAX,
            ),
            BsdcChecklistItem(
                label = say(bn, "প্রতিষ্ঠানের নাম লেখা হয়েছে", "Company is named"),
                done = company.length in COMPANY_MIN..COMPANY_MAX,
            ),
            BsdcChecklistItem(
                label = say(bn, "বিবরণ কমপক্ষে $DESCRIPTION_MIN অক্ষর", "Description is at least $DESCRIPTION_MIN characters"),
                done = description.length in DESCRIPTION_MIN..DESCRIPTION_MAX,
            ),
            BsdcChecklistItem(
                label = say(bn, "শহর লেখা আছে (রিমোট হলে লাগে না)", "City is stated, unless remote"),
                done = form.workMode == "remote" || (city.isNotEmpty() && city.length <= CITY_MAX),
            ),
            BsdcChecklistItem(
                label = say(bn, "বেতনের ক্রম ঠিক আছে", "Salary bounds are in order"),
                done = min == null || max == null || max >= min,
                blocking = false,
            ),
            BsdcChecklistItem(
                label = say(bn, "বন্ধ হওয়ার তারিখ ভবিষ্যতে বা খালি", "Closing date is ahead, or empty"),
                done = form.expiresAtText.isBlank() ||
                    (parsesExpiry(form.expiresAtText) && isFuture(expiresIso(form.expiresAtText), nowMillis)),
                blocking = false,
            ),
            BsdcChecklistItem(
                label = say(bn, "কমপক্ষে একটি দক্ষতা", "At least one skill"),
                done = form.skills.isNotEmpty(),
                blocking = false,
            ),
        )
    }

    private fun say(bn: Boolean, bangla: String, english: String): String = if (bn) bangla else english

    /**
     * One sentence for a refused save, mapped from what `update_job` actually raises.
     *
     * The routine speaks English sentences and SQLSTATEs; the member reads one of these instead. The
     * closing-date branch is the one worth having, because it is the failure a member cannot infer:
     * "a closing date must be in the future" is a strange answer to pressing Save on a posting whose
     * deadline passed last week, until it is said in their own language.
     */
    fun editFailureMessage(error: Throwable, bn: Boolean): String {
        val text = error.message.orEmpty()
        return when {
            text.contains("authentication required") ->
                if (bn) "সংরক্ষণ করতে আবার সাইন ইন করুন।" else "Sign in again to save the role."
            text.contains("job not found") ->
                if (bn) "পদটি আর নেই।" else "That role no longer exists."
            text.contains("only the poster") || text.contains("42501") ->
                if (bn) "এই পদটি সম্পাদনা করার অনুমতি আপনার নেই।" else "You cannot edit this role."
            text.contains("title of at least 3") ->
                if (bn) "শিরোনাম কমপক্ষে ৩ অক্ষরের দরকার।" else "The title needs at least 3 characters."
            text.contains("company of at least 2") ->
                if (bn) "প্রতিষ্ঠানের নাম কমপক্ষে ২ অক্ষরের দরকার।" else "The company name needs at least 2 characters."
            text.contains("between 20 and 20000") ->
                if (bn) {
                    "বিবরণ ২০ থেকে ২০,০০০ অক্ষরের মধ্যে হতে হবে।"
                } else {
                    "The description must be between 20 and 20,000 characters."
                }
            text.contains("city cannot be longer") ->
                if (bn) "শহরের নাম ৮০ অক্ষরের বেশি লম্বা।" else "The city is longer than 80 characters."
            text.contains("needs a city") ->
                if (bn) "অফিসে বা হাইব্রিড কাজে শহর লিখতে হবে।" else "An on-site or hybrid role needs a city."
            text.contains("salary cannot be negative") ->
                if (bn) "বেতন ঋণাত্মক হতে পারে না।" else "A salary cannot be negative."
            text.contains("maximum salary cannot be below") ->
                if (bn) "সর্বোচ্চ বেতন সর্বনিম্নের চেয়ে কম।" else "The maximum salary is below the minimum."
            text.contains("at most 20 skills") ->
                if (bn) "সর্বোচ্চ ২০টি দক্ষতা।" else "A role can carry at most 20 skills."
            text.contains("apply link must be") ->
                if (bn) {
                    "আবেদনের লিংক একটি বৈধ https ঠিকানা হতে হবে।"
                } else {
                    applyUrlRefusal
                }
            text.contains("closing date must be in the future") ->
                if (bn) "বন্ধ হওয়ার তারিখ আগামী দিনের হতে হবে।" else expiryPast
            text.contains("image host") ->
                if (bn) "কভার অবশ্যই BSDC ইমেজ হোস্টের লিংক হতে হবে।" else GigEditLogic.coverRefusal
            else -> if (bn) "পদটি সংরক্ষণ করা যায়নি।" else "Could not save the role."
        }
    }
}
