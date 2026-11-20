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
            listOf("Kotlin", "sql", "Compose"),
            JobDetailLogic.skillChips(listOf(" Kotlin", "", "sql", "KOTLIN ", "Compose")),
        )
    }

    @Test
    fun canWithdrawOnlyWhileTheApplicationIsStillLive() {
        assertTrue(JobDetailLogic.canWithdraw("submitted"))
        assertTrue(JobDetailLogic.canWithdraw(" Reviewing "))
        assertTrue(JobDetailLogic.canWithdraw("shortlisted"))
        assertFalse(JobDetailLogic.canWithdraw("hired"))
        assertFalse(JobDetailLogic.canWithdraw("rejected"))
        assertFalse(JobDetailLogic.canWithdraw("withdrawn"))
        assertFalse(JobDetailLogic.canWithdraw(null))
    }

    @Test
    fun isAppliedIgnoresAWithdrawnStatus() {
        assertTrue(JobDetailLogic.isApplied("submitted"))
        assertTrue(JobDetailLogic.isApplied("hired"))
        assertFalse(JobDetailLogic.isApplied("withdrawn"))
        assertFalse(JobDetailLogic.isApplied(null))
        assertFalse(JobDetailLogic.isApplied("  "))
    }

    @Test
    fun isDecidedCoversEveryTerminalState() {
        assertTrue(JobDetailLogic.isDecided("rejected"))
        assertTrue(JobDetailLogic.isDecided("hired"))
        assertTrue(JobDetailLogic.isDecided("withdrawn"))
        assertFalse(JobDetailLogic.isDecided("submitted"))
        assertFalse(JobDetailLogic.isDecided("shortlisted"))
    }

    @Test
    fun applicationStatusLabelIsBilingual() {
        assertEquals("Submitted", JobDetailLogic.applicationStatusLabel("submitted", false))
        assertEquals("জমা দেওয়া হয়েছে", JobDetailLogic.applicationStatusLabel("SUBMITTED", true))
        assertEquals("Not selected", JobDetailLogic.applicationStatusLabel("rejected", false))
        assertEquals("Unknown", JobDetailLogic.applicationStatusLabel("", false))
    }

    @Test
    fun applicationProgressWalksTheJourney() {
        assertEquals(25, JobDetailLogic.applicationProgress("submitted"))
        assertEquals(50, JobDetailLogic.applicationProgress("reviewing"))
        assertEquals(75, JobDetailLogic.applicationProgress("shortlisted"))
        assertEquals(100, JobDetailLogic.applicationProgress("hired"))
        assertEquals(0, JobDetailLogic.applicationProgress("mystery"))
    }

    @Test
    fun employerActionsShrinkAsTheDecisionNarrows() {
        assertEquals(listOf("reviewing", "shortlisted", "hired", "rejected"), JobDetailLogic.employerActionsFor("submitted"))
        assertEquals(listOf("shortlisted", "hired", "rejected"), JobDetailLogic.employerActionsFor("reviewing"))
        assertEquals(listOf("hired", "rejected"), JobDetailLogic.employerActionsFor(" Shortlisted "))
        assertTrue(JobDetailLogic.employerActionsFor("hired").isEmpty())
        assertTrue(JobDetailLogic.employerActionsFor("withdrawn").isEmpty())
    }

    private fun application(
        id: String,
        applicantUid: String,
        status: String,
        createdAt: String,
    ) = JobApplicationDto(
        id = id,
        jobId = "j",
        applicantUid = applicantUid,
        coverLetter = "",
        resumeUrl = "",
        status = status,
        decidedAt = null,
        createdAt = createdAt,
        applicant = null,
    )

    @Test
    fun sortApplicationsForEmployerPutsUndecidedFirstThenNewest() {
        // Named arguments: the flat applicant fields were inserted into this DTO, so a
        // positional call shifted every later argument and stopped compiling.
        val decided = application("a", "u1", "hired", "2026-11-15T00:00:00Z")
        val older = application("b", "u2", "submitted", "2026-11-01T00:00:00Z")
        val newer = application("c", "u3", "reviewing", "2026-11-10T00:00:00Z")
        val out = JobDetailLogic.sortApplicationsForEmployer(listOf(decided, older, newer))
        assertEquals(listOf("c", "b", "a"), out.map { it.id })
    }

    @Test
    fun yearlyEquivalentConvertsTheShownFigure() {
        assertEquals("BDT 600,000/year", JobDetailLogic.yearlyEquivalent(50000, 50000, "BDT", "month"))
        assertEquals("~BDT 1,080,000/year", JobDetailLogic.yearlyEquivalent(80000, 90000, "BDT", "month"))
        assertEquals("", JobDetailLogic.yearlyEquivalent(null, null, "BDT", "month"))
        assertEquals("", JobDetailLogic.yearlyEquivalent(50000, 50000, "BDT", "fortnight"))
    }

    @Test
    fun coverLetterNeedsTwentyCharactersAfterTrimming() {
        assertFalse(JobDetailLogic.coverLetterValid("   short letter   "))
        assertTrue(JobDetailLogic.coverLetterValid("  I have shipped Android apps.  "))
    }

    @Test
    fun richApplicationDraftAcceptsTheSharedContractAndNormalisesSubmission() {
        val draft = JobDetailLogic.ApplicationDraft(
            applicantName = "  Nusrat Jahan  ",
            phone = "+880 1712-345678",
            email = "NUSRAT@EXAMPLE.COM",
            location = " Sylhet ",
            yearsExperience = "5",
            education = "BSc in Computer Science",
            expectedSalaryTaka = "125000.50",
            portfolioUrl = "https://portfolio.example.com",
            linkedinUrl = "https://www.linkedin.com/in/nusrat",
            noticePeriod = "30 days",
            skillsInput = " Firebase, kotlin, FIREBASE ",
            certificationImageUrls = listOf("https://i.ibb.co/abcd1234/certificate.png"),
            coverLetter = "  I have shipped reliable Android and Firebase products.  ",
            resumeUrl = "https://resume.example.com/nusrat.pdf",
        )

        assertTrue(JobDetailLogic.validateApplicationDraft(draft).isEmpty())
        val submission = JobDetailLogic.toApplicationSubmission(draft)
        assertEquals("Nusrat Jahan", submission.applicantName)
        assertEquals("nusrat@example.com", submission.email)
        assertEquals(12_500_050L, submission.expectedSalaryPoisha)
        assertEquals(listOf("firebase", "kotlin"), submission.skills)
    }

    @Test
    fun richApplicationValidationRejectsUnsafeAndIncompleteValues() {
        val invalid = JobDetailLogic.ApplicationDraft(
            applicantName = "",
            phone = "01712abc",
            email = "not-an-email",
            expectedSalaryTaka = "1.999",
            portfolioUrl = "http://portfolio.example.com",
            certificationImageUrls = listOf("https://example.com/certificate.png"),
            coverLetter = "too short",
            resumeUrl = "javascript:alert(1)",
        )
        val errors = JobDetailLogic.validateApplicationDraft(invalid)

        assertTrue("name" in errors)
        assertTrue("phone" in errors)
        assertTrue("email" in errors)
        assertTrue("salary" in errors)
        assertTrue("portfolio" in errors)
        assertTrue("certifications" in errors)
        assertTrue("coverLetter" in errors)
        assertTrue("resume" in errors)
    }

    @Test
    fun profilePrefillOnlyUsesAccountEmailWhenTheMemberOptedIn() {
        val hidden = JobDetailLogic.prefillApplicationDraft(" Nusrat ", "nusrat@example.com", false, " Sylhet ", listOf("Kotlin"))
        val shared = JobDetailLogic.prefillApplicationDraft(" Nusrat ", "nusrat@example.com", true, " Sylhet ", listOf("Kotlin"))

        assertEquals("Nusrat", hidden.applicantName)
        assertEquals("", hidden.email)
        assertEquals("nusrat@example.com", shared.email)
        assertEquals("kotlin", shared.skillsInput)
    }
}
