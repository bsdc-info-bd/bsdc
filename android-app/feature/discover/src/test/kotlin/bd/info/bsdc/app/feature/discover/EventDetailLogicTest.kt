package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EventDetailLogicTest {
    private val start = "2026-11-14T13:00:00+00:00" // 19:00 in Dhaka
    private val end = "2026-11-14T15:00:00+00:00" // 21:00 in Dhaka
    private val now = JobDetailLogic.parseTimestampMillis("2026-11-14T14:00:00Z")!!

    @Test
    fun webUrlUsesTheEventsRouteAndEncodesTheSlug() {
        assertEquals("https://www.bsdc.info.bd/events/rust-meetup", EventDetailLogic.webUrl(" rust-meetup "))
        assertEquals("https://www.bsdc.info.bd/events/a%20b%2Fc", EventDetailLogic.webUrl("a b/c"))
    }

    @Test
    fun shareTextIsNameThenLink() {
        assertEquals("Rust meetup\nhttps://x.test", EventDetailLogic.shareText(" Rust meetup ", "https://x.test"))
        assertEquals("BSDC event\nhttps://x.test", EventDetailLogic.shareText("  ", "https://x.test"))
    }

    @Test
    fun zoneFallsBackToDhakaWhenMissingOrUnknown() {
        assertEquals("Asia/Dhaka", EventDetailLogic.zoneFor(null).id)
        assertEquals("Asia/Dhaka", EventDetailLogic.zoneFor("  ").id)
        assertEquals("Asia/Dhaka", EventDetailLogic.zoneFor("Not/AZone").id)
        assertEquals("Europe/London", EventDetailLogic.zoneFor("Europe/London").id)
    }

    @Test
    fun fullOnlyWhenCapacityIsReachedAndReaderIsNotGoing() {
        assertFalse(EventDetailLogic.isFull(null, 500, null))
        assertFalse(EventDetailLogic.isFull(10, 9, null))
        assertTrue(EventDetailLogic.isFull(10, 10, null))
        assertTrue(EventDetailLogic.isFull(10, 12, "interested"))
        assertFalse(EventDetailLogic.isFull(10, 10, "going"))
    }

    @Test
    fun liveAndEndedFollowTheStartAndEndTimes() {
        assertTrue(EventDetailLogic.isHappeningNow(start, end, now))
        assertFalse(EventDetailLogic.isHappeningNow(start, end, now + 3 * 60 * 60 * 1000L))
        assertFalse(EventDetailLogic.hasEnded(end, now))
        assertTrue(EventDetailLogic.hasEnded(end, now + 2 * 60 * 60 * 1000L))
        assertFalse(EventDetailLogic.hasEnded(null, now))
    }

    @Test
    fun rsvpNeedsSignInAndAnEventThatIsOnAndNotCancelled() {
        assertTrue(EventDetailLogic.canRsvp(signedIn = true, isCancelled = false, ended = false))
        assertFalse(EventDetailLogic.canRsvp(signedIn = false, isCancelled = false, ended = false))
        assertFalse(EventDetailLogic.canRsvp(signedIn = true, isCancelled = true, ended = false))
        assertFalse(EventDetailLogic.canRsvp(signedIn = true, isCancelled = false, ended = true))
    }

    @Test
    fun calendarWindowDefaultsToOneHourWhenEndIsMissingOrBackwards() {
        val startMillis = JobDetailLogic.parseTimestampMillis(start)!!
        assertEquals(Pair(startMillis, startMillis + 3600_000L), EventDetailLogic.calendarWindow(start, null))
        assertEquals(Pair(startMillis, startMillis + 3600_000L), EventDetailLogic.calendarWindow(start, "2026-11-14T12:00:00+00:00"))
        assertNull(EventDetailLogic.calendarWindow(null, end))
    }

    @Test
    fun whenLineIsInTheEventZoneAndShowsTheEndDateOnlyAcrossDays() {
        val sameDay = EventDetailLogic.formatWhen(start, end, "Asia/Dhaka", bn = false)
        assertTrue(sameDay, sameDay.contains("14 Nov 2026"))
        assertTrue(sameDay, sameDay.contains("7:00 PM"))
        assertTrue(sameDay, sameDay.contains("9:00 PM"))

        val nextDay = EventDetailLogic.formatWhen(start, "2026-11-15T01:00:00+00:00", "Asia/Dhaka", bn = false)
        assertTrue(nextDay, nextDay.contains("15 Nov 2026"))

        assertEquals("", EventDetailLogic.formatWhen(null, end, "Asia/Dhaka", bn = false))
    }

    @Test
    fun countdownRoundsUpSoItNeverSaysZeroMinutes() {
        assertEquals(
            "Starts in 1 min",
            EventDetailLogic.startCountdown("2026-11-14T14:00:20Z", end, now, bn = false),
        )
        assertEquals(
            "Starts in 2 min",
            EventDetailLogic.startCountdown("2026-11-14T14:01:01Z", end, now, bn = false),
        )
    }

    @Test
    fun countdownSwitchesToHoursAndDays() {
        assertEquals(
            "Starts in 5 h",
            EventDetailLogic.startCountdown("2026-11-14T19:00:00Z", end, now, bn = false),
        )
        assertEquals(
            "Starts in 3 days",
            EventDetailLogic.startCountdown("2026-11-17T14:00:00Z", end, now, bn = false),
        )
    }

    @Test
    fun countdownIsBlankOnceStartedOrWithoutAStart() {
        // Already over: no countdown to give.
        assertEquals(
            "",
            EventDetailLogic.startCountdown("2026-11-14T10:00:00Z", "2026-11-14T11:00:00Z", now, bn = false),
        )
        assertEquals("", EventDetailLogic.startCountdown(null, end, now, bn = false))
        // The live window wins over any countdown text.
        assertEquals(
            "Happening now",
            EventDetailLogic.startCountdown("2026-11-14T13:00:00Z", end, now, bn = false),
        )
    }

    @Test
    fun countdownUsesBanglaDigitsAndWords() {
        assertEquals(
            "২ মিনিট বাকি",
            EventDetailLogic.startCountdown("2026-11-14T14:01:01Z", end, now, bn = true),
        )
        assertEquals(
            "৩ দিন বাকি",
            EventDetailLogic.startCountdown("2026-11-17T14:00:00Z", end, now, bn = true),
        )
        assertEquals(
            "এখন চলছে",
            EventDetailLogic.startCountdown("2026-11-14T13:00:00Z", end, now, bn = true),
        )
    }

    @Test
    fun seatsLeftIsNullWithoutCapacityAndNeverNegative() {
        assertNull(EventDetailLogic.seatsLeft(null, 10))
        assertNull(EventDetailLogic.seatsLeft(0, 10))
        assertEquals(15, EventDetailLogic.seatsLeft(50, 35))
        assertEquals(0, EventDetailLogic.seatsLeft(50, 80))
        assertEquals(0, EventDetailLogic.seatsLeft(50, 50))
    }
}
