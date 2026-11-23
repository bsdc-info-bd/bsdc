package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.designsystem.BsdcChecklistItem
import bd.info.bsdc.app.core.designsystem.BsdcFormChoice
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The rules behind the event editor.
 *
 * An event is the one listing whose edit can reach people who are not the author: `update_job` and
 * `update_gig` change a page, while `update_event` compares `p_starts_at` with the stored one and, if
 * it moved, notifies every attendee who had not declined. So the date fields are the heart of this file
 * rather than an afterthought, and the sheet says so in its own subtitle, in both languages, the way the
 * website's `events.manage.editLead` does.
 *
 * The numbers are the create form's and the routine's, not this screen's: the title is
 * [ComposerValidationEngine]'s 3–140, the description cap is `CREATE_LIMITS.eventDescriptionMax`, the
 * venue and city are its 200 and 80. `EventEditLogicTest` pins them to both files.
 *
 * Two asymmetries are worth naming, because both are places where a helpful editor would have quietly
 * damaged a row:
 *
 *  - `capacity` is written whatever it is sent, so an empty box removes the ceiling and lets anybody in.
 *    That is what the web's box does, so this one does it too — but it says so beside the field.
 *  - Every other text field except the title and the two dates is optional to this form, because the
 *    routine's own checks are shorter than the create form's: a saved event may legitimately have no
 *    description at all, so demanding ten characters here would lock a member out of fixing a typo in
 *    the title.
 */

/** What the sheet holds while the member types. Dates stay text: a half-typed date is not midnight. */
data class EventEditForm(
    val title: String = "",
    val description: String = "",
    val startsText: String = "",
    val endsText: String = "",
    val mode: String = EventEditLogic.MODE_DEFAULT,
    val venue: String = "",
    val city: String = "",
    val joinUrl: String = "",
    val capacityText: String = "",
    val coverUrl: String = "",
    /** Carried through from the row, never edited: a time zone is a property of the event, not of the phone. */
    val timezone: String? = null,
)

/** What `update_event` is sent, in the order the routine declares its arguments. */
data class EventEditPayload(
    val title: String,
    val description: String,
    val startsAt: String,
    val endsAt: String,
    val mode: String,
    val venue: String,
    val city: String,
    val joinUrl: String,
    val capacity: Int?,
    val coverUrl: String,
    val timezone: String?,
)

object EventEditLogic {
    const val TITLE_MIN = 3
    const val TITLE_MAX = 140
    const val DESCRIPTION_MAX = 8_000
    const val VENUE_MAX = 200
    const val CITY_MAX = 80

    /** `update_event` takes `bsdc_event_mode`; these three are the whole domain. */
    const val MODE_DEFAULT = "online"
    const val ONLINE = "online"
    const val IN_PERSON = "in_person"

    data class EventOption(val value: String, val labelBn: String, val labelEn: String)

    /** The same `create.options.mode` labels the create screen uses, in the web's order. */
    val MODES: List<EventOption> = listOf(
        EventOption(IN_PERSON, "সরাসরি", "In person"),
        EventOption(ONLINE, "অনলাইন", "Online"),
        EventOption("hybrid", "দুটোই", "Both"),
    )

    private val DISPLAY: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    fun choices(bn: Boolean): List<BsdcFormChoice> =
        MODES.map { option -> BsdcFormChoice(value = option.value, label = label(option, bn)) }

    fun label(option: EventOption, bn: Boolean): String = if (bn) option.labelBn else option.labelEn

    fun formFrom(event: EventDetailDto): EventEditForm {
        val zone = EventDetailLogic.zoneFor(event.timezone)
        return EventEditForm(
            title = event.title,
            description = event.description.orEmpty(),
            startsText = displayText(event.startsAt, zone),
            endsText = displayText(event.endsAt, zone),
            mode = event.mode.ifBlank { MODE_DEFAULT },
            venue = event.venue.orEmpty(),
            city = event.city.orEmpty(),
            joinUrl = event.joinUrl.orEmpty(),
            capacityText = event.capacity?.toString() ?: "",
            coverUrl = event.coverUrl.orEmpty(),
            timezone = event.timezone,
        )
    }

    /** The stored instant as the box wants it, in the event's own zone. Unreadable text is shown as-is. */
    fun displayText(raw: String?, zone: ZoneId): String {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) return ""
        val millis = JobDetailLogic.parseTimestampMillis(value) ?: return value
        return DISPLAY.format(Instant.ofEpochMilli(millis).atZone(zone))
    }

    /** An instant the member can actually read back: the sheet's shape, or a real ISO timestamp. */
    fun parses(text: String): Boolean {
        val value = text.trim()
        if (value.isEmpty()) return false
        if (JobDetailLogic.parseTimestampMillis(value) != null) return true
        return runCatching { LocalDateTime.parse(value.replace(' ', 'T')) }.isSuccess
    }

    /**
     * The instant `update_event` wants, in the event's zone — or null when the box cannot be read.
     *
     * Unlike a job's closing date, a bare date is not accepted here. A deadline can sensibly mean
     * "throughout that day"; the start of an event cannot, because the notification the routine sends
     * announces a time, and an invented 00:00 would tell every attendee the wrong hour.
     */
    fun instant(text: String, zone: ZoneId): String? {
        val value = text.trim()
        if (value.isEmpty()) return null
        JobDetailLogic.parseTimestampMillis(value)?.let { return Instant.ofEpochMilli(it).toString() }
        val local = runCatching { LocalDateTime.parse(value.replace(' ', 'T')) }.getOrNull() ?: return null
        return local.atZone(zone).toInstant().toString()
    }

    /** Both instants, ordered. `update_event` refuses an event that ends at or before it starts. */
    fun window(form: EventEditForm, zone: ZoneId): Pair<String?, String?> =
        instant(form.startsText, zone) to instant(form.endsText, zone)

    fun capacity(form: EventEditForm): Int? = form.capacityText.trim().toIntOrNull()

    fun validate(form: EventEditForm, event: EventDetailDto, zone: ZoneId): List<String> {
        val issues = mutableListOf<String>()
        val title = form.title.trim()
        if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
            issues += "Event title must be between $TITLE_MIN and $TITLE_MAX characters."
        }
        if (form.description.trim().length > DESCRIPTION_MAX) {
            issues += "Event description cannot be longer than $DESCRIPTION_MAX characters."
        }
        val (start, end) = window(form, zone)
        val startMillis = start?.let(JobDetailLogic::parseTimestampMillis)
        val endMillis = end?.let(JobDetailLogic::parseTimestampMillis)
        when {
            !parses(form.startsText) -> issues += startFormat
            !parses(form.endsText) -> issues += endFormat
            startMillis == null || endMillis == null -> issues += startFormat
            // Compared as instants rather than as the two strings, because the strings the routine is
            // sent can differ in precision — and a wrong "ends before it starts" accusation on an event
            // that notifies everyone is the worst possible false alarm.
            endMillis <= startMillis -> issues += orderRefusal
        }
        if (form.venue.trim().length > VENUE_MAX) issues += tooLongVenueCity
        if (form.city.trim().length > CITY_MAX) issues += tooLongVenueCity
        if (form.mode == IN_PERSON && form.venue.trim().isEmpty()) issues += venueRequired
        if (form.mode == ONLINE && form.joinUrl.trim().isEmpty()) issues += joinRequired
        if (form.joinUrl.trim().isNotEmpty() && !JobDetailLogic.isValidApplicationHttpsUrl(form.joinUrl)) {
            issues += joinRefusal
        }
        val seats = capacity(form)
        if (seats != null && seats <= 0) {
            issues += capacityPositive
        } else if (seats != null && seats < event.goingCount) {
            // Only asked when the number is otherwise sane, so a member who types 0 reads one sentence
            // about it and not two about a seat count that was never going to be accepted anyway.
            issues += capacityBelowGoing(event.goingCount)
        }
        if (!coverAllowed(form.coverUrl)) issues += coverRefusal
        return issues
    }

    fun isValid(form: EventEditForm, event: EventDetailDto, zone: ZoneId): Boolean =
        validate(form, event, zone).isEmpty()

    const val startFormat: String = "Starts reads like 2026-12-06 18:00, in the event's own time zone."
    const val endFormat: String = "Ends reads like 2026-12-06 20:30, and has to be after the start."
    const val orderRefusal: String = "An event has to end after it starts."
    const val tooLongVenueCity: String = "The venue is 200 characters at most, the city 80."
    const val venueRequired: String = "An in-person event has to name a venue."
    const val joinRequired: String = "An online event needs a link people can join by."
    const val joinRefusal: String = "A join link must be a full https address."
    const val capacityPositive: String = "Capacity has to be at least one seat."
    const val coverRefusal: String =
        "A cover has to be a BSDC image-host link. Upload it, then paste the address."

    fun capacityBelowGoing(going: Int): String =
        "Capacity cannot go below the $going people already going."

    fun coverAllowed(url: String): Boolean {
        val trimmed = url.trim()
        return trimmed.isEmpty() || ImgbbUrlAllowlist.isAllowedImageUrl(trimmed)
    }

    fun toPayload(form: EventEditForm, zone: ZoneId): EventEditPayload {
        val (start, end) = window(form, zone)
        return EventEditPayload(
            title = form.title.trim(),
            // Sent as plain text: `update_event` writes `coalesce(p_description, description)`, and the
            // routine accepts an empty string, which is how a host removes a description that has become
            // wrong. The sheet only refuses a description that is too long, never one that is short.
            description = form.description.trim(),
            // The routine takes both instants as non-null, so an unreadable box cannot be sent at all —
            // `validate` refuses it first, and the empty fallback is what keeps this function total
            // rather than pretending a blank date is legal.
            startsAt = start.orEmpty(),
            endsAt = end.orEmpty(),
            mode = form.mode,
            venue = form.venue.trim(),
            city = form.city.trim(),
            joinUrl = form.joinUrl.trim(),
            // Null here really does remove the ceiling: the update writes `capacity = p_capacity`
            // without a coalesce, exactly as the web's empty box does.
            capacity = capacity(form),
            coverUrl = form.coverUrl.trim(),
            timezone = form.timezone,
        )
    }

    /** Compared on the payload, so a reformatted date is not an edit. See [GigEditLogic.isDirty]. */
    fun isDirty(initial: EventEditForm, form: EventEditForm, zone: ZoneId): Boolean =
        toPayload(initial, zone) != toPayload(form, zone)

    fun checklist(form: EventEditForm, event: EventDetailDto, zone: ZoneId, bn: Boolean): List<BsdcChecklistItem> {
        val title = form.title.trim()
        val (start, end) = window(form, zone)
        val seats = capacity(form)
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
                label = say(bn, "শুরু ও শেষের সময় লেখা আছে", "A start and an end are given"),
                done = parses(form.startsText) && parses(form.endsText),
            ),
            BsdcChecklistItem(
                label = say(bn, "শেষ, শুরুর পরে", "The end is after the start"),
                done = start != null && end != null &&
                    (JobDetailLogic.parseTimestampMillis(end) ?: 0L) >
                    (JobDetailLogic.parseTimestampMillis(start) ?: 0L),
            ),
            BsdcChecklistItem(
                label = when (form.mode) {
                    ONLINE -> say(bn, "যোগ দেওয়ার লিংক আছে", "The join link is there")
                    IN_PERSON -> say(bn, "স্থান লেখা আছে", "A venue is named")
                    else -> say(bn, "লিংক ও স্থান — যেকোনো একটি", "A link or a venue, either way")
                },
                done = when (form.mode) {
                    ONLINE -> form.joinUrl.trim().isNotEmpty()
                    IN_PERSON -> form.venue.trim().isNotEmpty()
                    else -> true
                },
            ),
            BsdcChecklistItem(
                label = if (seedsHintWorthy(seats, event)) {
                    say(bn, "আসন সংখ্যা কমপক্ষে ${event.goingCount}", "At least ${event.goingCount} seats")
                } else {
                    say(bn, "যেকোনো সংখ্যক মানুষ আসতে পারবে", "Any number of people can join")
                },
                done = seats == null || seats >= event.goingCount,
                blocking = false,
            ),
            BsdcChecklistItem(
                label = say(bn, "কভারের ঠিকানা BSDC ইমেজ হোস্টের", "Cover link is a BSDC image address"),
                done = coverAllowed(form.coverUrl),
                blocking = false,
            ),
        )
    }

    /** A seat count only deserves a line of its own once people have already taken seats. */
    fun seedsHintWorthy(seats: Int?, event: EventDetailDto): Boolean = seats != null && event.goingCount > 0

    private fun say(bn: Boolean, bangla: String, english: String): String = if (bn) bangla else english

    /**
     * One sentence for a refused save, mapped from what `update_event` raises.
     *
     * The permission branch covers a moderator of the organising group as well as the host, so the copy
     * says "you are not the host or a moderator of the group" rather than the routine's shorter
     * "only the host", which would be untrue for the moderator who is looking at the button.
     */
    fun editFailureMessage(error: Throwable, bn: Boolean): String {
        val text = error.message.orEmpty()
        return when {
            text.contains("authentication required") ->
                if (bn) "সংরক্ষণ করতে আবার সাইন ইন করুন।" else "Sign in again to save the event."
            text.contains("event not found") ->
                if (bn) "ইভেন্টটি আর নেই।" else "That event no longer exists."
            text.contains("only the host") || text.contains("42501") ->
                if (bn) {
                    "ইভেন্টটি সম্পাদনা করতে হবে আয়োজক বা গ্রুপের মডারেটরকে।"
                } else {
                    "Only the host or a moderator of the organising group can edit this event."
                }
            text.contains("title of at least 3") ->
                if (bn) "শিরোনাম কমপক্ষে ৩ অক্ষরের দরকার।" else "The title needs at least 3 characters."
            text.contains("longer than 8000") ->
                if (bn) {
                    "বিবরণ ৮,০০০ অক্ষরের বেশি লম্বা।"
                } else {
                    "The description is longer than 8,000 characters."
                }
            text.contains("end after it starts") ->
                if (bn) "ইভেন্ট শেষ হওয়ার সময় শুরুর পরে হতে হবে।" else orderRefusal
            text.contains("venue or city is too long") ->
                if (bn) "স্থান ২০০ ও শহর ৮০ অক্ষরের মধ্যে রাখুন।" else tooLongVenueCity
            text.contains("needs a venue") ->
                if (bn) "অনলাইনের বাইরে হলে স্থান লিখতে হবে।" else venueRequired
            text.contains("needs a join link") ->
                if (bn) "অনলাইন হলে যোগ দেওয়ার লিংক লাগবে।" else joinRequired
            text.contains("join link must be") ->
                if (bn) "যোগ দেওয়ার লিংক বৈধ https হতে হবে।" else joinRefusal
            text.contains("capacity must be a positive") ->
                if (bn) "আসন সংখ্যা ধনাত্মক হতে হবে।" else capacityPositive
            text.contains("capacity cannot be below") ->
                if (bn) {
                    "যারা আগেই এসে গেছে তাদের চেয়ে কম আসন রাখা যাবে না।"
                } else {
                    "The capacity cannot be below the number of people already going."
                }
            text.contains("needs a time zone") ->
                if (bn) "ইভেন্টের একটি টাইম জোন দরকার।" else "The event needs a time zone."
            text.contains("image host") ->
                if (bn) "কভার অবশ্যই BSDC ইমেজ হোস্টের লিংক হতে হবে।" else coverRefusal
            else -> if (bn) "ইভেন্টটি সংরক্ষণ করা যায়নি।" else "Could not save the event."
        }
    }
}
