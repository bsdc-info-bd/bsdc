package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.model.BsdcHosts
import java.net.URLEncoder
import java.time.DateTimeException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Pure rules for the event page. They mirror the website's isEventFull, isEventLive and calendar window. */
object EventDetailLogic {
    /** Used when an event has no zone, or a zone this device does not know. */
    const val DEFAULT_ZONE = "Asia/Dhaka"

    private const val ONE_HOUR_MILLIS = 60L * 60L * 1000L

    fun webUrl(slug: String): String {
        val encoded = URLEncoder.encode(slug.trim(), Charsets.UTF_8.name()).replace("+", "%20")
        return "${BsdcHosts.SITE_ORIGIN}/events/$encoded"
    }

    fun shareText(title: String, url: String): String {
        val name = title.trim().ifBlank { "BSDC event" }
        return "$name\n$url"
    }

    /** The event's own zone, so a time reads the same to everyone looking at that event. */
    fun zoneFor(timezone: String?): ZoneId {
        val name = timezone?.trim().orEmpty().ifEmpty { DEFAULT_ZONE }
        return try {
            ZoneId.of(name)
        } catch (failure: DateTimeException) {
            ZoneId.of(DEFAULT_ZONE)
        }
    }

    /** Full when there is a capacity, it is reached, and this reader is not already going. */
    fun isFull(capacity: Int?, goingCount: Int, myStatus: String?): Boolean =
        capacity != null && goingCount >= capacity && myStatus != "going"

    fun hasEnded(endsAt: String?, nowMillis: Long): Boolean {
        val end = JobDetailLogic.parseTimestampMillis(endsAt) ?: return false
        return end <= nowMillis
    }

    fun isHappeningNow(startsAt: String?, endsAt: String?, nowMillis: Long): Boolean {
        val start = JobDetailLogic.parseTimestampMillis(startsAt) ?: return false
        val end = JobDetailLogic.parseTimestampMillis(endsAt) ?: return false
        return start <= nowMillis && end > nowMillis
    }

    /** RSVP needs a signed-in reader, and an event that is still on and not cancelled. */
    fun canRsvp(signedIn: Boolean, isCancelled: Boolean, ended: Boolean): Boolean =
        signedIn && !isCancelled && !ended

    /**
     * The calendar entry's start and end in epoch millis. A missing or backwards end becomes
     * one hour after the start. Null when there is no start.
     */
    fun calendarWindow(startsAt: String?, endsAt: String?): Pair<Long, Long>? {
        val start = JobDetailLogic.parseTimestampMillis(startsAt) ?: return null
        val end = JobDetailLogic.parseTimestampMillis(endsAt)
        return if (end == null || end <= start) {
            Pair(start, start + ONE_HOUR_MILLIS)
        } else {
            Pair(start, end)
        }
    }

    /**
     * One readable line such as "Sat 14 Nov 2026, 7:00 PM – 9:00 PM", in the event's zone.
     * The end shows its date only when it falls on another day. Empty when there is no start.
     */
    fun formatWhen(startsAt: String?, endsAt: String?, timezone: String?, bn: Boolean): String {
        val startMillis = JobDetailLogic.parseTimestampMillis(startsAt) ?: return ""
        val zone = zoneFor(timezone)
        val locale = if (bn) Locale.forLanguageTag("bn-BD") else Locale.ENGLISH
        val day = DateTimeFormatter.ofPattern("EEE d MMM yyyy", locale)
        val time = DateTimeFormatter.ofPattern("h:mm a", locale)
        val start = Instant.ofEpochMilli(startMillis).atZone(zone)
        val startLabel = "${start.format(day)}, ${start.format(time)}"
        val endMillis = JobDetailLogic.parseTimestampMillis(endsAt) ?: return startLabel
        val end = Instant.ofEpochMilli(endMillis).atZone(zone)
        val endLabel = if (end.toLocalDate() == start.toLocalDate()) {
            end.format(time)
        } else {
            "${end.format(day)}, ${end.format(time)}"
        }
        return "$startLabel – $endLabel"
    }
}
