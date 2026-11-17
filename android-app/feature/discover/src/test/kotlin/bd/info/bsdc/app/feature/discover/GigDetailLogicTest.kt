package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GigDetailLogicTest {
    private val now = GigDetailLogic.parseTimestampMillis("2026-11-16T10:00:00Z")!!

    @Test
    fun webUrlMatchesTheWebsiteAddress() {
        assertEquals("https://www.bsdc.info.bd/freelance/logo-redesign", GigDetailLogic.webUrl("logo-redesign"))
        assertEquals("https://www.bsdc.info.bd/freelance/logo%20redesign", GigDetailLogic.webUrl(" logo redesign "))
    }

    @Test
    fun shareTextIncludesBudgetWhenKnown() {
        assertEquals(
            "Logo redesign — BDT 12,000–18,000\nhttps://www.bsdc.info.bd/freelance/logo",
            GigDetailLogic.shareText("Logo redesign", "BDT 12,000–18,000", "https://www.bsdc.info.bd/freelance/logo"),
        )
        assertEquals(
            "Logo redesign\nhttps://www.bsdc.info.bd/freelance/logo",
            GigDetailLogic.shareText("Logo redesign", "   ", "https://www.bsdc.info.bd/freelance/logo"),
        )
        assertEquals(
            "BSDC\nhttps://www.bsdc.info.bd/freelance/x",
            GigDetailLogic.shareText("   ", "", "https://www.bsdc.info.bd/freelance/x"),
        )
    }

    @Test
    fun parseTimestampMillisAcceptsShortOffsetsAndZulu() {
        val expected = GigDetailLogic.parseTimestampMillis("2026-11-10T06:00:00+06:00")
        assertEquals(expected, GigDetailLogic.parseTimestampMillis("2026-11-10T00:00:00Z"))
        assertEquals(expected, GigDetailLogic.parseTimestampMillis("2026-11-10T00:00:00+00"))
        assertNull(GigDetailLogic.parseTimestampMillis("not a timestamp"))
        assertNull(GigDetailLogic.parseTimestampMillis(null))
    }

    @Test
    fun actionCoversEveryReaderState() {
        assertEquals(GigDetailLogic.GigAction.OWN_GIG, GigDetailLogic.action("open", true, true, null))
        assertEquals(GigDetailLogic.GigAction.SIGN_IN, GigDetailLogic.action("open", false, false, null))
        assertEquals(GigDetailLogic.GigAction.PROPOSE, GigDetailLogic.action("open", false, true, null))
        assertEquals(GigDetailLogic.GigAction.PROPOSED, GigDetailLogic.action("open", false, true, "submitted"))
        assertEquals(GigDetailLogic.GigAction.WITHDRAWN, GigDetailLogic.action("open", false, true, "withdrawn"))
        assertEquals(GigDetailLogic.GigAction.CLOSED, GigDetailLogic.action("closed", false, true, null))
        assertEquals(GigDetailLogic.GigAction.CLOSED, GigDetailLogic.action("paused", false, true, null))
    }

    @Test
    fun isAcceptingProposalsOnlyForOpenGigs() {
        assertTrue(GigDetailLogic.isAcceptingProposals(" OPEN "))
        assertFalse(GigDetailLogic.isAcceptingProposals("paused"))
        assertFalse(GigDetailLogic.isAcceptingProposals("closed"))
    }

    @Test
    fun proposalStatusLabelIsBilingual() {
        assertEquals("Submitted", GigDetailLogic.proposalStatusLabel("submitted", false))
        assertEquals("জমা দেওয়া হয়েছে", GigDetailLogic.proposalStatusLabel("submitted", true))
        assertEquals("Shortlisted", GigDetailLogic.proposalStatusLabel("shortlisted", false))
        assertEquals("Hired", GigDetailLogic.proposalStatusLabel("hired", false))
        assertEquals("Withdrawn", GigDetailLogic.proposalStatusLabel("withdrawn", false))
        assertEquals("Unknown", GigDetailLogic.proposalStatusLabel("", false))
    }

    @Test
    fun gigStatusLabelIsBilingual() {
        assertEquals("Open", GigDetailLogic.gigStatusLabel("open", false))
        assertEquals("খোলা", GigDetailLogic.gigStatusLabel("Open", true))
        assertEquals("Paused", GigDetailLogic.gigStatusLabel("paused", false))
        assertEquals("Closed", GigDetailLogic.gigStatusLabel("closed", false))
    }

    @Test
    fun postedAgoReadsNaturallyAndStaysQuietOnBadInput() {
        assertEquals("Just now", GigDetailLogic.postedAgo("2026-11-16T09:59:40Z", now, false))
        assertEquals("5 min ago", GigDetailLogic.postedAgo("2026-11-16T09:55:00Z", now, false))
        assertEquals("1 hour ago", GigDetailLogic.postedAgo("2026-11-16T09:00:00Z", now, false))
        assertEquals("3 hours ago", GigDetailLogic.postedAgo("2026-11-16T07:00:00Z", now, false))
        assertEquals("2 days ago", GigDetailLogic.postedAgo("2026-11-14T10:00:00Z", now, false))
        assertEquals("3 months ago", GigDetailLogic.postedAgo("2026-08-16T10:00:00Z", now, false))
        assertEquals("", GigDetailLogic.postedAgo("garbage", now, false))
        assertEquals("", GigDetailLogic.postedAgo(null, now, false))
    }

    @Test
    fun postedAgoNeverReadsAsNegativeForAFutureTimestamp() {
        assertEquals("Just now", GigDetailLogic.postedAgo("2026-11-16T10:30:00Z", now, false))
    }

    @Test
    fun payoutTakesNoCommissionTodayButReportsTheFacts() {
        val payout = GigDetailLogic.payout(20000)
        assertEquals(20000, payout.gross)
        assertEquals(0, payout.fee)
        assertEquals(20000, payout.net)
        assertEquals(0, payout.feePercent)
    }

    @Test
    fun payoutNeverGoesNegative() {
        val payout = GigDetailLogic.payout(-500)
        assertEquals(0, payout.gross)
        assertEquals(0, payout.net)
    }

    @Test
    fun proposalProgressWalksTheJourney() {
        assertEquals(25, GigDetailLogic.proposalProgress("submitted"))
        assertEquals(50, GigDetailLogic.proposalProgress("reviewing"))
        assertEquals(75, GigDetailLogic.proposalProgress("shortlisted"))
        assertEquals(100, GigDetailLogic.proposalProgress("hired"))
        assertEquals(0, GigDetailLogic.proposalProgress("mystery"))
    }

    @Test
    fun isOpenProposalOnlyCountsLiveBids() {
        assertTrue(GigDetailLogic.isOpenProposal("submitted"))
        assertTrue(GigDetailLogic.isOpenProposal("Shortlisted"))
        assertFalse(GigDetailLogic.isOpenProposal("hired"))
        assertFalse(GigDetailLogic.isOpenProposal("rejected"))
        assertFalse(GigDetailLogic.isOpenProposal("withdrawn"))
    }

    @Test
    fun sortProposalsForClientPutsLiveBidsFirstThenNewest() {
        val live = GigProposalDto("a", "g", "u1", "pitch", 5000, 5, "submitted", "2026-11-01T00:00:00Z")
        val hired = GigProposalDto("b", "g", "u2", "pitch", 9000, 5, "hired", "2026-11-15T00:00:00Z")
        val newer = GigProposalDto("c", "g", "u3", "pitch", 4000, 5, "shortlisted", "2026-11-10T00:00:00Z")
        val sorted = GigDetailLogic.sortProposalsForClient(listOf(hired, live, newer))
        assertEquals(listOf("c", "a", "b"), sorted.map { it.id })
    }
}
