package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.common.ListingTags
import bd.info.bsdc.app.core.designsystem.BsdcChecklistItem
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist

/**
 * The rules behind the gig editor.
 *
 * A gig is a small contract, so its editor is not a text box with a save button: the budget band, the
 * duration and the skills all have to stay legal, and `update_gig` (migration 0128) refuses the whole
 * write the moment one of them is not. The numbers below are the create form's numbers, held in
 * [ComposerValidationEngine] on this side of the app and in `CREATE_LIMITS` on the website, and
 * `GigEditLogicTest` reads both files and fails if any of the three drifts. That is deliberate: a gig
 * that could be published under one set of rules and then corrected under another is how a saved value
 * ends up outside what either client would accept.
 *
 * The field set is the web's `GigEditDialog`'s — title, scope, the two budget bounds, hourly, days,
 * skills, cover — and nothing else, because `update_gig` takes nothing else. The address is not
 * editable from either client, which is why the sheet shows it instead of offering to change it.
 */

/** What the sheet holds while the member types. Text stays text: a half-typed number is not zero. */
data class GigEditForm(
    val title: String = "",
    val description: String = "",
    val budgetMinText: String = "",
    val budgetMaxText: String = "",
    val isHourly: Boolean = false,
    val durationDaysText: String = "",
    val skills: List<String> = emptyList(),
    val coverUrl: String = "",
)

/** What `update_gig` is sent, in the order the routine declares its arguments. */
data class GigEditPayload(
    val title: String,
    val description: String,
    val budgetMin: Int?,
    val budgetMax: Int?,
    val isHourly: Boolean,
    val durationDays: Int?,
    val skills: List<String>,
    val coverUrl: String,
)

object GigEditLogic {
    const val TITLE_MIN = 3
    const val TITLE_MAX = 140
    const val DESCRIPTION_MIN = 20
    const val DESCRIPTION_MAX = 20_000
    const val DURATION_DAYS_MIN = 1
    const val DURATION_DAYS_MAX = 3_650
    // Not `const`: this is the website's number as much as ours, and it is one definition in
    // core/common rather than a copy that can agree with nothing.
    val SKILLS_MAX: Int = ListingTags.MAX_TAGS

    /** The same four ideas the create screen offers, in the same order. */
    val SCOPE_IDEAS: List<Pair<String, String>> = listOf(
        "Landing page" to "One responsive page, mobile-first, with the copy you supply.",
        "Logo and identity" to "A wordmark, a mark and the two files a print shop asks for.",
        "API integration" to "Connect one REST API to one screen, with error states handled.",
        "Bug fix sprint" to "A time-boxed pass over a list of reproducible defects.",
    )

    val SKILL_SUGGESTIONS: List<String> =
        listOf("Kotlin", "Compose", "Android", "React", "Node", "Postgres", "Figma", "SEO")

    /** Seeding the form from the published row, which is what makes this an editor and not a form. */
    fun formFrom(gig: GigDto): GigEditForm = GigEditForm(
        title = gig.title,
        description = gig.description,
        budgetMinText = gig.budgetMin?.toString() ?: "",
        budgetMaxText = gig.budgetMax?.toString() ?: "",
        isHourly = gig.isHourly,
        durationDaysText = gig.durationDays?.toString() ?: "",
        skills = gig.skills.map { it.trim() }.filter { it.isNotEmpty() },
        coverUrl = gig.coverUrl,
    )

    /** A bound is optional; a box that is empty means "not stated", never zero. */
    fun amount(text: String): Int? = text.trim().toIntOrNull()

    /**
     * Sentences, in the create validator's own words, because the member already met them once.
     *
     * The routine would refuse the same write with slightly different phrasing; the client is allowed
     * to be the one that speaks first, and it must speak first in the words the app already taught.
     */
    fun validate(form: GigEditForm): List<String> {
        val issues = mutableListOf<String>()
        val title = form.title.trim()
        if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
            issues += "Gig title must be between $TITLE_MIN and $TITLE_MAX characters."
        }
        val description = form.description.trim()
        if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
            issues += "Gig scope must be at least $DESCRIPTION_MIN characters."
        }
        val min = amount(form.budgetMinText)
        val max = amount(form.budgetMaxText)
        if ((min != null && min < 0) || (max != null && max < 0)) {
            issues += "Budget values cannot be negative."
        }
        if (min != null && max != null && max < min) {
            issues += "Maximum budget cannot be lower than minimum budget."
        }
        val days = amount(form.durationDaysText)
        if (days != null && (days < DURATION_DAYS_MIN || days > DURATION_DAYS_MAX)) {
            issues += "Duration must be between $DURATION_DAYS_MIN and $DURATION_DAYS_MAX days."
        }
        if (form.skills.size > SKILLS_MAX) {
            issues += "Select at most $SKILLS_MAX skills."
        }
        if (!coverAllowed(form.coverUrl)) {
            issues += coverRefusal
        }
        return issues
    }

    fun isValid(form: GigEditForm): Boolean = validate(form).isEmpty()

    /** A blank cover is legal — it is how a cover is removed. Anything else must be our own host. */
    fun coverAllowed(url: String): Boolean {
        val trimmed = url.trim()
        return trimmed.isEmpty() || ImgbbUrlAllowlist.isAllowedImageUrl(trimmed)
    }

    const val coverRefusal: String = "A cover has to be a BSDC image-host link. Upload it, then paste the address."

    /** The payload, with the create form's trims and the routine's null-for-absent rule. */
    fun toPayload(form: GigEditForm): GigEditPayload = GigEditPayload(
        title = form.title.trim(),
        description = form.description.trim(),
        budgetMin = amount(form.budgetMinText),
        budgetMax = amount(form.budgetMaxText),
        isHourly = form.isHourly,
        // Canonical, deduplicated and sorted — the form `normaliseSkills` puts on the wire in
        // `main-site/src/lib/opportunities/opportunity-repository.ts`, and the form migration 0103 put
        // in the column that the skill filters read. Chips keep the member's own case on screen.
        skills = ListingTags.normalise(form.skills),
        // Unlike a group's cover, `update_gig` takes the cover as plain text and treats an empty
        // string as "remove it" — so the sheet sends what the box says, blank included.
        coverUrl = form.coverUrl.trim(),
    )

    /**
     * Whether the Save button has anything to do.
     *
     * Compared on the payload rather than the form, so re-ordering the same skills or typing a
     * trailing space does not light the button up: the question is whether the row would change.
     */
    fun isDirty(initial: GigEditForm, form: GigEditForm): Boolean = toPayload(initial) != toPayload(form)

    /**
     * What is still open, in the order the fields appear.
     *
     * The meter is not decoration: a save that will be refused should look refused while the member
     * is still in the field that causes it, which is the one thing the create form got right and every
     * editor in this app lacked.
     */
    fun checklist(form: GigEditForm, bn: Boolean): List<BsdcChecklistItem> {
        val title = form.title.trim()
        val description = form.description.trim()
        val min = amount(form.budgetMinText)
        val max = amount(form.budgetMaxText)
        val days = amount(form.durationDaysText)
        return listOf(
            BsdcChecklistItem(
                label = if (title.length in TITLE_MIN..TITLE_MAX) {
                    say(bn, "শিরোনাম লেখা হয়েছে", "Title is written")
                } else {
                    say(bn, "শিরোনাম $TITLE_MIN–$TITLE_MAX অক্ষরের দরকার", "Title needs $TITLE_MIN–$TITLE_MAX characters")
                },
                done = title.length in TITLE_MIN..TITLE_MAX,
            ),
            BsdcChecklistItem(
                label = if (description.length in DESCRIPTION_MIN..DESCRIPTION_MAX) {
                    say(bn, "বিবরণ লেখা হয়েছে", "Scope is written")
                } else {
                    say(
                        bn,
                        "বিবরণ কমপক্ষে $DESCRIPTION_MIN অক্ষরের দরকার",
                        "Scope needs at least $DESCRIPTION_MIN characters",
                    )
                },
                done = description.length in DESCRIPTION_MIN..DESCRIPTION_MAX,
            ),
            BsdcChecklistItem(
                label = say(bn, "বাজেটের ক্রম ঠিক আছে", "Budget bounds are in order"),
                done = max == null || min == null || max >= min,
                blocking = false,
            ),
            BsdcChecklistItem(
                label = say(
                    bn,
                    "সময়কাল $DURATION_DAYS_MIN–$DURATION_DAYS_MAX দিনের মধ্যে",
                    "Duration is between $DURATION_DAYS_MIN and $DURATION_DAYS_MAX days",
                ),
                done = days == null || days in DURATION_DAYS_MIN..DURATION_DAYS_MAX,
                blocking = false,
            ),
            BsdcChecklistItem(
                label = say(bn, "কমপক্ষে একটি দক্ষতা", "At least one skill"),
                done = form.skills.isNotEmpty(),
                blocking = false,
            ),
            BsdcChecklistItem(
                label = say(bn, "কভারের ঠিকানা BSDC ইমেজ হোস্টের", "Cover link is a BSDC image address"),
                done = coverAllowed(form.coverUrl),
                blocking = false,
            ),
        )
    }

    /** The one place this file picks a language, so a line above cannot pick the wrong one. */
    private fun say(bn: Boolean, bangla: String, english: String): String = if (bn) bangla else english

    /** The band as the member will read it in the preview, mirroring `formatBudgetShort`'s cases. */
    fun budgetLine(form: GigEditForm, currency: String): String {
        val min = amount(form.budgetMinText)
        val max = amount(form.budgetMaxText)
        val body = when {
            min == null && max == null -> "Negotiable"
            min != null && max != null && min == max -> "$currency $min"
            min != null && max != null -> "$currency $min – $max"
            min != null -> "from $currency $min"
            else -> "up to $currency $max"
        }
        return if (form.isHourly) "$body /hr" else body
    }

    /**
     * One sentence for a refused save.
     *
     * The routine answers in English sentences and SQLSTATEs; a member should read neither. Every
     * branch below is a message `update_gig` actually raises (migration 0128), and the last one is
     * the honest "we do not know" that the app already uses for owner writes elsewhere.
     */
    fun editFailureMessage(error: Throwable, bn: Boolean): String {
        val text = error.message.orEmpty()
        return when {
            text.contains("authentication required") ->
                if (bn) "সংরক্ষণ করতে আবার সাইন ইন করুন।" else "Sign in again to save the gig."
            text.contains("gig not found") ->
                if (bn) "গিগটি আর নেই।" else "That gig no longer exists."
            text.contains("only the client") || text.contains("42501") ->
                if (bn) "গিগটি সম্পাদনা করার অনুমতি আপনার নেই।" else "You cannot edit this gig."
            text.contains("at least 3 characters") ->
                if (bn) "শিরোনাম কমপক্ষে ৩ অক্ষরের দরকার।" else "The title needs at least 3 characters."
            text.contains("between 20 and 20000") ->
                if (bn) "বিবরণ ২০ থেকে ২০,০০০ অক্ষরের মধ্যে হতে হবে।" else "The scope must be between 20 and 20,000 characters."
            text.contains("budget cannot be negative") ->
                if (bn) "বাজেট ঋণাত্মক হতে পারে না।" else "A budget cannot be negative."
            text.contains("maximum budget cannot be below") ->
                if (bn) "সর্বোচ্চ বাজেট সর্বনিম্নের চেয়ে কম।" else "The maximum budget is below the minimum."
            text.contains("duration must be between") ->
                if (bn) {
                    "সময়কাল ১ থেকে ৩৬৫০ দিনের মধ্যে হতে হবে।"
                } else {
                    "The duration must be between 1 and 3,650 days."
                }
            text.contains("at most 20 skills") ->
                if (bn) "সর্বোচ্চ ২০টি দক্ষতা।" else "A gig can carry at most 20 skills."
            text.contains("image host") ->
                if (bn) "কভার অবশ্যই BSDC ইমেজ হোস্টের লিংক হতে হবে।" else coverRefusal
            else -> if (bn) "গিগ সংরক্ষণ করা যায়নি।" else "Could not save the gig."
        }
    }
}
