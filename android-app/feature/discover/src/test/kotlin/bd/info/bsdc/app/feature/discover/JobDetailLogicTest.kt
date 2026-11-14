package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.feature.discover.JobDetailLogic.ApplyState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JobDetailLogicTest {
    private val nov19 = JobDetailLogic.parseTimestampMillis("2026-11-19T00:00:00Z")!!
    private val nov21 = JobDetailLogic.parseTimestampMillis("2026-11-21T00:00:00Z")!!

    @Test
    fun webUrlUsesTheJobsRouteAndEncodesTheSlug() {
        assertEquals("https://www.bsdc.info.bd/jobs/backend-dev", JobDetailLogic.webUrl(" backend-dev "))
        assertEquals("https://www.bsdc.info.bd/jobs/a%20b%2Fc", JobDetailLogic.webUrl("a b/c"))
    }

    @Test
    fun shareTextNamesTheRoleAndEmployer() {
        val url = "https://www.bsdc.info.bd/jobs/x"
        assertEquals("Backend dev — Acme\n$url", JobDetailLogic.shareText("Backend dev", " Acme ", url))
        assertEquals("Backend dev\n$url", JobDetailLogic.shareText("Backend dev", "", url))
    }

    @Test
    fun parsesPostgresShortOffsetAndFractionalSeconds() {
        val full = JobDetailLogic.parseTimestampMillis("2026-11-20T10:00:00+00:00")
        val short = JobDetailLogic.parseTimestampMillis("2026-11-20T10:00:00+00")
        val fraction = JobDetailLogic.parseTimestampMillis("2026-11-20T10:00:00.123456+00")
        assertEquals(full, short)
        assertNotNull(fraction)
        assertNull(JobDetailLogic.parseTimestampMillis("not a date"))
        assertNull(JobDetailLogic.parseTimestampMillis("  "))
    }

    @Test
    fun openJobWithoutExpiryIsLive() {
        assertTrue(JobDetailLogic.isLive("open", null, nov21))
        assertTrue(JobDetailLogic.isLive("open", "  ", nov21))
    }

    @Test
    fun openJobIsLiveOnlyBeforeItsExpiry() {
        assertTrue(JobDetailLogic.isLive("open", "2026-11-20T10:00:00+00", nov19))
        assertFalse(JobDetailLogic.isLive("open", "2026-11-20T10:00:00+00", nov21))
    }

    @Test
    fun closedJobIsNeverLiveAndUnreadableExpiryIsNotLive() {
        assertFalse(JobDetailLogic.isLive("closed", null, nov19))
        assertFalse(JobDetailLogic.isLive("open", "garbage", nov19))
    }

    @Test
    fun applyStateFollowsTheWebsitePriority() {
        assertEquals(ApplyState.CLOSED, JobDetailLogic.applyState(false, true, true, null, "https://x.test"))
        assertEquals(ApplyState.OWN_POST, JobDetailLogic.applyState(true, true, true, null, ""))
        assertEquals(ApplyState.SIGN_IN, JobDetailLogic.applyState(true, false, false, null, ""))
        assertEquals(ApplyState.APPLIED, JobDetailLogic.applyState(true, false, true, "pending", "https://x.test"))
        assertEquals(ApplyState.EXTERNAL, JobDetailLogic.applyState(true, false, true, null, "https://x.test"))
        assertEquals(ApplyState.IN_APP, JobDetailLogic.applyState(true, false, true, null, ""))
    }

    @Test
    fun skillChipsAreCleanedAndDeduplicatedKeepingOrder() {
        assertEquals(
            listOf("Kotlin", "SQL", "Compose"),
            JobDetailLogic.skillChips(listOf(" Kotlin", "", "sql", "KOTLIN ", "Compose")),
        )
    }

    @Test
    fun coverLetterNeedsTwentyCharactersAfterTrimming() {
        assertFalse(JobDetailLogic.coverLetterValid("   short letter   "))
        assertTrue(JobDetailLogic.coverLetterValid("  I have shipped Android apps.  "))
    }
}
