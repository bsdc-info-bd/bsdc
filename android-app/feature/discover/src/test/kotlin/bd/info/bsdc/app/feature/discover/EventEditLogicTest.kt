package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.ZoneId

/**
 * What the event editor may write, and what an event's own rules make different from a gig's.
 *
 * The three that matter, in order of how much damage they do if they drift:
 *
 *  - `capacity` is written whatever the form sends, so an empty box removes the ceiling. The web's box
 *    does the same, and an editor that "helpfully" kept the old number would leave a full event open to
 *    new RSVPs.
 *  - Both instants are mandatory, in the event's own zone, and the end has to be after the start — the
 *    rule is `update_event`'s and the notification to every attendee rides on it.
 *  - A description of one character is legal here and illegal on the create screen, because the routine
 *    only caps the length, and a host fixing a typo in a title must not be told to write ten characters
 *    about an event that never had a description.
 */
class EventEditLogicTest {
    private val zone: ZoneId = ZoneId.of(EventDetailLogic.DEFAULT_ZONE)

    private val event = EventDetailDto(
        id = "e1",
        slug = "kotlin-meetup",
        title = "Kotlin meetup",
        description = "A night of Compose talk",
        mode = "online",
        city = "Dhaka",
        joinUrl = "https://meet.example/room",
        startsAt = "2026-12-06T12:00:00Z",
        endsAt = "2026-12-06T14:00:00Z",
        timezone = "Asia/Dhaka",
        capacity = 40,
        goingCount = 12,
    )

    private fun form(
        title: String = "Kotlin meetup",
        description: String = "A night of Compose talk",
        starts: String = "2026-12-06 18:00",
        ends: String = "2026-12-06 20:00",
        mode: String = "online",
        venue: String = "",
        city: String = "Dhaka",
        join: String = "https://meet.example/room",
        capacity: String = "40",
        cover: String = "",
        timezone: String? = "Asia/Dhaka",
    ) = EventEditForm(
        title = title,
        description = description,
        startsText = starts,
        endsText = ends,
        mode = mode,
        venue = venue,
        city = city,
        joinUrl = join,
        capacityText = capacity,
        coverUrl = cover,
        timezone = timezone,
    )

    @Test
    fun thePublishedRowSeedsEveryBoxIncludingTheTwoDates() {
        val seeded = EventEditLogic.formFrom(event)
        assertEquals("2026-12-06 18:00", seeded.startsText)
        assertEquals("2026-12-06 20:00", seeded.endsText)
        assertEquals("40", seeded.capacityText)
        assertEquals("https://meet.example/room", seeded.joinUrl)
        assertEquals("Asia/Dhaka", seeded.timezone)
        assertFalse(EventEditLogic.isDirty(seeded, seeded, zone))
    }

    @Test
    fun anUntouchedFormRoundTripsToTheSamePayload() {
        // The instants came out of the row as UTC and go back as UTC: if the box had shown local text
        // and the payload re-read it in the phone's zone, an open-and-save would move every event by
        // hours and notify everybody who had said they were coming.
        val payload = EventEditLogic.toPayload(EventEditLogic.formFrom(event), zone)
        assertEquals("2026-12-06T12:00:00Z", payload.startsAt)
        assertEquals("2026-12-06T14:00:00Z", payload.endsAt)
    }

    @Test
    fun capacityIsWrittenWhateverTheBoxSays() {
        assertEquals(40, EventEditLogic.toPayload(form(), zone).capacity)
        assertNull(EventEditLogic.toPayload(form(capacity = "   "), zone).capacity)
        assertEquals(
            listOf("Capacity has to be at least one seat."),
            EventEditLogic.validate(form(capacity = "0"), event, zone),
        )
        assertEquals(
            listOf(EventEditLogic.capacityBelowGoing(event.goingCount)),
            EventEditLogic.validate(form(capacity = "11"), event, zone),
        )
    }

    @Test
    fun theEndHasToBeAfterTheStartAndBothHaveToBeReadable() {
        assertEquals(
            listOf(EventEditLogic.orderRefusal),
            EventEditLogic.validate(form(ends = "2026-12-06 18:00"), event, zone),
        )
        assertEquals(
            listOf(EventEditLogic.startFormat),
            EventEditLogic.validate(form(starts = "next Saturday"), event, zone),
        )
        assertTrue(EventEditLogic.isValid(form(), event, zone))
        // A bare date is refused here although a job's deadline accepts one: an event's start is
        // announced to other people, so an invented midnight is not a kindness.
        assertFalse(EventEditLogic.parses("2026-12-06"))
    }

    @Test
    fun theModeDecidesWhichOtherFieldIsMandatory() {
        assertEquals(
            listOf(EventEditLogic.joinRequired),
            EventEditLogic.validate(form(mode = "online", join = ""), event, zone),
        )
        assertEquals(
            listOf(EventEditLogic.venueRequired),
            EventEditLogic.validate(form(mode = "in_person", venue = ""), event, zone),
        )
        assertTrue(EventEditLogic.isValid(form(mode = "hybrid", venue = "", join = ""), event, zone))
        assertEquals(
            listOf(EventEditLogic.joinRefusal),
            EventEditLogic.validate(form(join = "http://meet.example/room"), event, zone),
        )
    }

    @Test
    fun aShortOrAbsentDescriptionIsAnEditLikeAnyOther() {
        assertTrue(EventEditLogic.isValid(form(description = ""), event, zone))
        assertTrue(EventEditLogic.isValid(form(description = "Doors at six."), event, zone))
        assertEquals(
            listOf("Event description cannot be longer than 8000 characters."),
            EventEditLogic.validate(form(description = "x".repeat(8001)), event, zone),
        )
    }

    @Test
    fun aCoverIsEitherOurHostOrNothingAtAll() {
        assertTrue(EventEditLogic.coverAllowed(""))
        assertTrue(EventEditLogic.coverAllowed("https://i.ibb.co/e/cover.png"))
        assertEquals(
            listOf(EventEditLogic.coverRefusal),
            EventEditLogic.validate(form(cover = "https://elsewhere.example/x.png"), event, zone),
        )
        // And unlike a gig's, clearing it is a real write: `update_event` maps an empty string through
        // `assert_listing_cover`, which answers with '' — so the box has to be sent as typed.
        assertEquals("", EventEditLogic.toPayload(form(cover = "   "), zone).coverUrl)
    }

    @Test
    fun theChecklistOpensOnTheTwoFieldsNobodyElseCanFixAfterwards() {
        val items = EventEditLogic.checklist(
            form(ends = "2026-12-06 17:00", capacity = "5"),
            event,
            zone,
            bn = false,
        )
        assertEquals(2, items.count { !it.done })
        assertEquals(1, items.count { !it.done && it.blocking })
        assertTrue(EventEditLogic.checklist(form(), event, zone, bn = true).all { it.done })
    }

    @Test
    fun everyRefusalTheRoutineCanAnswerWithIsSaidInBothLanguages() {
        val cases = listOf(
            "authentication required" to "Sign in again to save the event.",
            "event not found" to "That event no longer exists.",
            "only the host of this event may change it" to
                "Only the host or a moderator of the organising group can edit this event.",
            "an event needs a title of at least 3 characters" to "The title needs at least 3 characters.",
            "an event description cannot be longer than 8000 characters" to
                "The description is longer than 8,000 characters.",
            "an event must end after it starts" to EventEditLogic.orderRefusal,
            "an event venue or city is too long" to EventEditLogic.tooLongVenueCity,
            "an in-person event needs a venue" to EventEditLogic.venueRequired,
            "an online event needs a join link" to EventEditLogic.joinRequired,
            "a join link must be a valid https address" to EventEditLogic.joinRefusal,
            "capacity must be a positive number" to EventEditLogic.capacityPositive,
            "capacity cannot be below the 12 already going" to
                "The capacity cannot be below the number of people already going.",
            "an event needs a time zone" to "The event needs a time zone.",
            "cover images must be hosted on the BSDC image host" to EventEditLogic.coverRefusal,
            "policy denied" to "Could not save the event.",
        )
        cases.forEach { (wire, english) ->
            val failure = IllegalStateException(wire)
            assertEquals(english, EventEditLogic.editFailureMessage(failure, bn = false))
            val bangla = EventEditLogic.editFailureMessage(failure, bn = true)
            assertTrue("no Bangla for: $wire", bangla.isNotEmpty() && bangla != english)
        }
    }

    @Test
    fun theLimitsAreTheWebsitesOwnInBothPlaces() {
        val engine = readRepoFile(
            "android-app", "feature", "compose", "src", "main", "java",
            "bd", "info", "bsdc", "app", "feature", "compose", "ComposerValidationEngine.java",
        )
        val web = readRepoFile("main-site", "src", "lib", "create", "create-types.ts")
        fun engineConst(name: String): Int {
            val matcher = Regex("int $name = ([0-9_]+);").find(engine)
            assertTrue("$name is not in the create validator any more", matcher != null)
            return matcher!!.groupValues[1].replace("_", "").toInt()
        }

        fun webLimit(name: String): Int {
            val matcher = Regex("\n *$name: ([0-9_]+),").find(web)
            assertTrue("CREATE_LIMITS.$name is gone", matcher != null)
            return matcher!!.groupValues[1].replace("_", "").toInt()
        }

        assertEquals(engineConst("TITLE_MIN"), EventEditLogic.TITLE_MIN)
        assertEquals(engineConst("TITLE_MAX"), EventEditLogic.TITLE_MAX)
        assertEquals(engineConst("EVENT_DESCRIPTION_MAX"), EventEditLogic.DESCRIPTION_MAX)
        assertEquals(webLimit("titleMin"), EventEditLogic.TITLE_MIN)
        assertEquals(webLimit("titleMax"), EventEditLogic.TITLE_MAX)
        assertEquals(webLimit("eventDescriptionMax"), EventEditLogic.DESCRIPTION_MAX)
        assertEquals(webLimit("venueMax"), EventEditLogic.VENUE_MAX)
        assertEquals(webLimit("cityMax"), EventEditLogic.CITY_MAX)
    }

    @Test
    fun theModeLabelsAreTheWebsitesOwnInBothLanguages() {
        val en = createSection(readRepoFile("main-site", "src", "i18n", "locales", "en.ts"))
        val bn = createSection(readRepoFile("main-site", "src", "i18n", "locales", "bn.ts"))
        val block = { source: String ->
            val opener = "\n      mode: {\n"
            val start = source.indexOf(opener)
            assertTrue("create.options.mode is gone from the website", start >= 0)
            val rest = source.substring(start + opener.length)
            val end = rest.indexOf("\n      },")
            assertTrue("create.options.mode never closes", end > 0)
            rest.substring(0, end)
        }
        val webEn = block(en)
        val webBn = block(bn)
        val values = Regex("^ +([a-z_]+): ", RegexOption.MULTILINE)
            .findAll(webEn)
            .map { it.value.trim().removeSuffix(":") }
            .toList()
        assertEquals(values, EventEditLogic.MODES.map { it.value })
        EventEditLogic.MODES.forEach { option ->
            assertTrue(
                "mode ${option.value} is labelled differently on the website",
                webEn.contains("${option.value}: '${option.labelEn}',"),
            )
            assertTrue(
                "mode ${option.value} has no Bangla label on the website",
                webBn.contains("${option.value}: '${option.labelBn}',"),
            )
        }
    }

    /** The `create:` block of a locale file, so a `mode:` from another screen cannot answer for ours. */
    private fun createSection(source: String): String {
        val start = source.indexOf("\n  create: {")
        assertTrue("the locale file has no create section", start >= 0)
        val rest = source.substring(start)
        val end = rest.indexOf("\n  },\n")
        assertTrue("the create section never closes", end > 0)
        return rest.substring(0, end)
    }

    /** Gradle runs a module's tests with that module as the working directory, so walk up to the root. */
    private fun readRepoFile(vararg parts: String): String {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        repeat(6) {
            val candidate = dir?.let { base -> parts.fold(base) { acc, part -> File(acc, part) } }
            if (candidate != null && candidate.isFile) {
                return candidate.readText()
            }
            dir = dir?.parentFile
        }
        error("could not find ${parts.joinToString("/")} from ${System.getProperty("user.dir")}")
    }
}
