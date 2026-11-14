package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdsBuilderLogicTest {

    private val today = AdsBuilderLogic.dayNumber("2026-11-11")!!

    private val valid = AdsDraft(
        name = "Eid sale",
        headline = "Eid sale is live",
        targetUrl = "https://example.com/eid",
    )

    @Test
    fun aCompleteCampaignHasNoErrors() {
        assertTrue(AdsBuilderLogic.validate(valid, today).isEmpty())
    }

    @Test
    fun theBudgetBandIsOneHundredToOneLakhTaka() {
        assertTrue("budget" in AdsBuilderLogic.validate(valid.copy(budgetTaka = "99.99"), today))
        assertFalse("budget" in AdsBuilderLogic.validate(valid.copy(budgetTaka = "100"), today))
        assertTrue("budget" in AdsBuilderLogic.validate(valid.copy(budgetTaka = "100001"), today))
    }

    @Test
    fun theDailyCapIsEmptyOrBetweenTenTakaAndTheBudget() {
        assertTrue("dailyCap" in AdsBuilderLogic.validate(valid.copy(dailyCapTaka = "9"), today))
        assertTrue("dailyCap" in AdsBuilderLogic.validate(valid.copy(dailyCapTaka = "600"), today))
        assertFalse("dailyCap" in AdsBuilderLogic.validate(valid.copy(dailyCapTaka = ""), today))
    }

    @Test
    fun aScheduleEndingBeforeItStartsIsRefused() {
        val draft = valid.copy(startsOn = "2026-12-01", endsOn = "2026-11-30")
        assertTrue("schedule" in AdsBuilderLogic.validate(draft, today))
    }

    @Test
    fun aScheduleOfAYearOrMoreIsRefused() {
        val draft = valid.copy(startsOn = "2026-12-01", endsOn = "2027-12-01")
        assertTrue("schedule" in AdsBuilderLogic.validate(draft, today))
        val fine = valid.copy(startsOn = "2026-12-01", endsOn = "2027-11-30")
        assertFalse("schedule" in AdsBuilderLogic.validate(fine, today))
    }

    @Test
    fun aNonDateIsRefusedNotIgnored() {
        assertTrue("schedule" in AdsBuilderLogic.validate(valid.copy(startsOn = "11/12/2026"), today))
    }

    @Test
    fun destinationsMustBeHttpsAndImagesMustBeImgBb() {
        assertTrue("targetUrl" in AdsBuilderLogic.validate(valid.copy(targetUrl = "http://example.com/x"), today))
        assertTrue("imageUrl" in AdsBuilderLogic.validate(valid.copy(imageUrl = "https://evil.test/a.png"), today))
        assertFalse("imageUrl" in AdsBuilderLogic.validate(valid.copy(imageUrl = "https://i.ibb.co/abc/a.png"), today))
    }

    @Test
    fun aCampaignNeedsAPlatformAndAHeadline() {
        assertTrue("platforms" in AdsBuilderLogic.validate(valid.copy(platforms = emptySet()), today))
        assertTrue("headline" in AdsBuilderLogic.validate(valid.copy(headline = "ab"), today))
    }

    @Test
    fun thePayloadCarriesPoishaAndTheDhakaDays() {
        val payload = AdsBuilderLogic.toPayload(
            valid.copy(
                budgetTaka = "500",
                bidTaka = "2",
                dailyCapTaka = "50",
                startsOn = "2026-12-01",
                endsOn = "2026-12-02",
                platforms = setOf("android"),
            ),
            nowIso = "2026-11-11T06:00:00Z",
        )
        assertEquals("50000", payload["total_budget"].toString())
        assertEquals("200", payload["bid"].toString())
        assertEquals("5000", payload["daily_budget"].toString())
        assertEquals("\"2026-12-01T00:00:00+06:00\"", payload["starts_at"].toString())
        assertEquals("\"2026-12-02T23:59:59+06:00\"", payload["ends_at"].toString())
        assertEquals("[\"android\"]", payload["platforms"].toString())
    }

    @Test
    fun withoutAStartDateTheCampaignStartsNow() {
        val payload = AdsBuilderLogic.toPayload(valid, nowIso = "2026-11-11T06:00:00Z")
        assertEquals("\"2026-11-11T06:00:00Z\"", payload["starts_at"].toString())
        assertEquals("null", payload["ends_at"].toString())
    }

    @Test
    fun dayNumbersCountCalendarDaysIncludingLeapDays() {
        assertEquals(0L, AdsBuilderLogic.dayNumber("1970-01-01"))
        assertEquals(1L, AdsBuilderLogic.dayNumber("2026-11-11")!! - AdsBuilderLogic.dayNumber("2026-11-10")!!)
        assertEquals(2L, AdsBuilderLogic.dayNumber("2000-03-01")!! - AdsBuilderLogic.dayNumber("2000-02-28")!!)
        assertNull(AdsBuilderLogic.dayNumber("2026-13-01"))
    }
}
